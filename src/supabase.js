import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️  Missing Supabase env vars. Copy .env.example to .env and fill in your project credentials.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function sget(key) {
  try {
    const id = key.replace(/^room:/, '')
    const { data, error } = await supabase.from('rooms').select('data').eq('id', id).maybeSingle()
    if (error) { console.error('sget error', error); return null }
    return data?.data ?? null
  } catch (e) { console.error('sget exception', e); return null }
}

export async function sset(key, val) {
  try {
    const id = key.replace(/^room:/, '')
    const { error } = await supabase.from('rooms').upsert({ id, data: val, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) console.error('sset error', error)
  } catch (e) { console.error('sset exception', e) }
}

export async function sdelete(roomId) {
  try {
    const id = roomId.replace(/^room:/, '')
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (error) console.error('sdelete error', error)
  } catch (e) { console.error('sdelete exception', e) }
}

// Admin room delete — routes through admin-action Edge Function (service role key,
// bypasses RLS). Use this from admin UI instead of sdelete, which is anon-keyed
// and blocked by RLS.
export async function adminDeleteGame(roomId) {
  await callAdminAction('delete-game', { roomId: roomId.replace(/^room:/, '') })
}

// Fetch specific rooms by id array (for lobby tracking)
export async function getRoomsByIds(ids) {
  if (!ids.length) return []
  try {
    const { data, error } = await supabase.from('rooms').select('data').in('id', ids)
    if (error) { console.error('getRoomsByIds error', error); return [] }
    return (data || []).map(row => row.data).filter(Boolean)
  } catch (e) { console.error('getRoomsByIds exception', e); return [] }
}

// Fetch all rooms ordered by most recently updated
export async function slist() {
  try {
    const { data, error } = await supabase.from('rooms').select('data, updated_at').order('updated_at', { ascending: false })
    if (error) { console.error('slist error', error); return [] }
    return (data || []).map(row => row.data).filter(Boolean)
  } catch (e) { console.error('slist exception', e); return [] }
}

// Active rooms for a logged-in player — queries DB directly so it works across devices
// Fetches all rooms and filters client-side (acceptable at small scale)
export async function getActiveRoomsForPlayer(playerId) {
  if (!playerId) return []
  const ACTIVE_PHASES = ['lobby', 'draft', 'battle', 'vote']
  try {
    const { data, error } = await supabase.from('rooms').select('data').order('updated_at', { ascending: false })
    if (error) { console.error('getActiveRoomsForPlayer error', error); return [] }
    return (data || [])
      .map(row => row.data)
      .filter(r => r && !r.devMode && !r.nextRoomId && ACTIVE_PHASES.includes(r.phase) && (r.players || []).some(p => p.id === playerId && !p.isBot))
  } catch (e) { console.error('getActiveRoomsForPlayer exception', e); return [] }
}

// ─── Realtime ────────────────────────────────────────────────────────────────

// Subscribe to live updates for a single room row.
// onUpdate receives the full room data object whenever it changes.
// Returns an unsubscribe function — call it in your useEffect cleanup.
//
// Prerequisites: enable Realtime for the `rooms` table in the Supabase
// dashboard (Table Editor → rooms → Realtime toggle), and ensure row-level
// security allows SELECT for anon/authenticated as appropriate.
export function subscribeToRoom(roomId, onUpdate) {
  const channel = supabase
    .channel('room-' + roomId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      payload => { if (payload.new?.data) onUpdate(payload.new.data) }
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Track a user's presence in a room. Every participant calls this — the host
// with role:'host', others with role:'player'.
//
// callbacks can be a plain function (legacy: onHostStatusChange) or an object:
//   { onHostStatusChange, onPresenceChange }
//   onHostStatusChange(bool)     — fires when host online/offline status changes
//   onPresenceChange(string[])   — fires on every sync with all present userIds
//
// Returns an unsubscribe function for useEffect cleanup.
//
// Prerequisite: Realtime must be enabled on the Supabase project. Presence
// channels are ephemeral WebSocket state — they do not touch the DB.
export function trackRoomPresence(roomId, userId, role, callbacks) {
  const { onHostStatusChange, onPresenceChange } =
    typeof callbacks === 'function'
      ? { onHostStatusChange: callbacks, onPresenceChange: null }
      : (callbacks || {})

  let lastKnownHost = null
  const channel = supabase
    .channel('presence-' + roomId, { config: { presence: { key: userId } } })
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const flat  = Object.values(state).flat()
      const hostOnline = flat.some(p => p.role === 'host')
      if (hostOnline !== lastKnownHost) {
        lastKnownHost = hostOnline
        onHostStatusChange?.(hostOnline)
      }
      // Report all currently-present userIds so callers can show connection dots
      onPresenceChange?.(flat.map(p => p.userId).filter(Boolean))
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ role, userId })
      }
    })
  return () => supabase.removeChannel(channel)
}

// ─── User accounts ───────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 9) }

// Returns { id, username, needs_reset } or null — does NOT return pin
export async function lookupUser(username) {
  try {
    const { data, error } = await supabase
      .from('users').select('id, username, needs_reset')
      .ilike('username', username).maybeSingle()
    if (error) { console.error('lookupUser error', error); return null }
    return data ?? null
  } catch (e) { console.error('lookupUser exception', e); return null }
}

// Verifies pin; returns user record on match, null on mismatch
export async function verifyUser(username, pin) {
  try {
    const { data, error } = await supabase
      .from('users').select('id, username, needs_reset, is_super_host')
      .ilike('username', username).eq('pin', pin).maybeSingle()
    if (error) { console.error('verifyUser error', error); return null }
    return data ?? null
  } catch (e) { console.error('verifyUser exception', e); return null }
}

// Creates a new account; returns user record or { error }
export async function registerUser(username, pin) {
  try {
    const id = genId()
    const { error } = await supabase.from('users').insert({ id, username, pin })
    if (error) return { error: error.code === '23505' ? 'Username already taken.' : error.message }
    return { id, username, needs_reset: false }
  } catch (e) { console.error('registerUser exception', e); return { error: 'Registration failed.' } }
}

// Updates pin and clears needs_reset — used after admin reset
export async function setUserPin(username, pin) {
  try {
    const { error } = await supabase
      .from('users').update({ pin, needs_reset: false, updated_at: new Date().toISOString() })
      .ilike('username', username)
    if (error) console.error('setUserPin error', error)
  } catch (e) { console.error('setUserPin exception', e) }
}

// Admin: flag a user's PIN for reset
export async function adminResetUser(username) {
  try {
    await callAdminAction('reset-user-pin', { username })
  } catch (e) { console.error('adminResetUser error', e) }
}

// Admin: list all users (no pins)
export async function listUsers() {
  try {
    const { data, error } = await supabase
      .from('users').select('id, username, needs_reset, is_super_host, created_at')
      .order('username', { ascending: true })
    if (error) { console.error('listUsers error', error); return [] }
    return data || []
  } catch (e) { console.error('listUsers exception', e); return [] }
}

// Paginated/searchable players directory (no pins)
export async function searchUsers({ query = '', sort = 'username', ascending = true, page = 0, pageSize = 20 } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    let q = supabase.from('users')
      .select('id, username, favorite_combatant_name, created_at', { count: 'exact' })
    if (query.trim()) q = q.ilike('username', `%${query.trim()}%`)
    const { data, error, count } = await q.order(sort, { ascending }).range(from, to)
    if (error) { console.error('searchUsers error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('searchUsers exception', e); return { items: [], total: 0 } }
}

// Full user profile row (no pin)
export async function getUserProfile(id) {
  try {
    const { data, error } = await supabase
      .from('users').select('id, username, favorite_combatant_id, favorite_combatant_name, created_at')
      .eq('id', id).maybeSingle()
    if (error) { console.error('getUserProfile error', error); return null }
    return data ?? null
  } catch (e) { console.error('getUserProfile exception', e); return null }
}

// Save favorite combatant on user profile
export async function setFavoriteCombatant(userId, combatantId, combatantName) {
  try {
    const { error } = await supabase.from('users')
      .update({ favorite_combatant_id: combatantId, favorite_combatant_name: combatantName, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) console.error('setFavoriteCombatant error', error)
  } catch (e) { console.error('setFavoriteCombatant exception', e) }
}

// Admin: grant or revoke Super Host role. Direct update — same pattern as setUserPin.
export async function adminSetSuperHost(userId, isSuperHost) {
  try {
    const { error } = await supabase.from('users')
      .update({ is_super_host: isSuperHost, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) throw new Error(error.message)
  } catch (e) { console.error('adminSetSuperHost error', e); throw e }
}

// ─── Super Host ───────────────────────────────────────────────────────────────
// All functions below require the caller to be a Super Host (enforced at call
// sites by checking currentUser.is_super_host — no DB enforcement).

// Update tags on any published combatant, arena, or group.
// type: 'combatants' | 'arenas' | 'groups'
export async function superHostSetEntityTags(type, id, tags) {
  try {
    const { error } = await supabase.from(type)
      .update({ tags, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) console.error('superHostSetEntityTags error', error)
  } catch (e) { console.error('superHostSetEntityTags exception', e) }
}

// Update arena pool membership. pools: string[] of 'standard' | 'wacky' | 'league'
export async function superHostSetArenaPools(arenaId, pools) {
  try {
    const { error } = await supabase.from('arenas')
      .update({ pools, updated_at: new Date().toISOString() })
      .eq('id', arenaId)
    if (error) console.error('superHostSetArenaPools error', error)
  } catch (e) { console.error('superHostSetArenaPools exception', e) }
}

// Induct a combatant into the Hall of Fame.
export async function superHostInductHoF(combatantId, inductedBy, note = '') {
  try {
    const { error } = await supabase.from('combatants')
      .update({ hall_of_fame: true, inducted_at: new Date().toISOString(), inducted_by: inductedBy, induction_note: note, removed_at: null, removed_by: null, updated_at: new Date().toISOString() })
      .eq('id', combatantId)
    if (error) console.error('superHostInductHoF error', error)
    return !error
  } catch (e) { console.error('superHostInductHoF exception', e); return false }
}

// Remove a combatant from the Hall of Fame. Preserves induction record.
export async function superHostRemoveHoF(combatantId, removedBy) {
  try {
    const { error } = await supabase.from('combatants')
      .update({ hall_of_fame: false, removed_at: new Date().toISOString(), removed_by: removedBy, updated_at: new Date().toISOString() })
      .eq('id', combatantId)
    if (error) console.error('superHostRemoveHoF error', error)
    return !error
  } catch (e) { console.error('superHostRemoveHoF exception', e); return false }
}

// Paginated combatants by owner, published only
export async function getPlayerCombatants({ ownerId, query = '', sort = 'wins', ascending = false, page = 0, pageSize = 20 } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    let q = supabase.from('combatants')
      .select('id, name, bio, wins, losses, reactions_heart, reactions_angry, reactions_cry', { count: 'exact' })
      .eq('owner_id', ownerId).eq('status', 'published')
    if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
    const { data, error, count } = await q.order(sort, { ascending }).range(from, to)
    if (error) { console.error('getPlayerCombatants error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('getPlayerCombatants exception', e); return { items: [], total: 0 } }
}

// Aggregate head-to-head records for a global combatant across all rooms.
// Full table scan — acceptable for current scale (see getPlayerRoomStats note below).
// Returns rows sorted by total matchups descending.
export async function getCombatantRoundHistory(combatantId) {
  try {
    const { data, error } = await supabase.from('rooms').select('data')
    if (error) { console.error('getCombatantRoundHistory error', error); return [] }
    const record = {}  // { [opponentId]: { opponentName, wins, losses, draws } }
    ;(data || []).forEach(row => {
      const r = row.data
      if (!r || r.devMode) return
      ;(r.rounds || []).forEach(round => {
        const mine = (round.combatants || []).find(c => c.id === combatantId)
        if (!mine) return
        const opponents = (round.combatants || []).filter(c => c.id !== combatantId)
        opponents.forEach(opp => {
          if (!record[opp.id]) record[opp.id] = { opponentName: opp.name, wins: 0, losses: 0, draws: 0 }
          if (round.draw) {
            record[opp.id].draws++
          } else if (round.winner) {
            if (round.winner.id === combatantId) record[opp.id].wins++
            else record[opp.id].losses++
          }
        })
      })
    })
    return Object.values(record)
      .sort((a, b) => (b.wins + b.losses + b.draws) - (a.wins + a.losses + a.draws))
  } catch (e) { console.error('getCombatantRoundHistory exception', e); return [] }
}

// Aggregate stats for a player from all rooms they participated in.
// NOTE: Full table scan — fine for hundreds of rooms, revisit if rooms table exceeds ~10k rows.
export async function getPlayerRoomStats(playerId) {
  try {
    const { data, error } = await supabase.from('rooms').select('data')
    if (error) { console.error('getPlayerRoomStats error', error); return null }
    let games = 0, wins = 0, losses = 0, trapsSet = 0, trapsTriggered = 0
    ;(data || []).forEach(row => {
      const r = row.data
      if (!r || r.devMode) return
      const participated = (r.players || []).some(p => p.id === playerId && !p.isBot)
      if (!participated) return
      games++
      const myCombatants = (r.combatants?.[playerId] || [])
      myCombatants.forEach(c => {
        wins   += c.wins   || 0
        losses += c.losses || 0
        if (c.trapTarget) {
          trapsSet++
          if (c.trapTriggered) trapsTriggered++
        }
      })
    })
    return { games, wins, losses, trapsSet, trapsTriggered }
  } catch (e) { console.error('getPlayerRoomStats exception', e); return null }
}

// ─── Global combatants (bestiary) ────────────────────────────────────────────

// Create or update name/bio only — never clobbers stats
export async function upsertGlobalCombatant({ id, name, bio, ownerId, ownerName }) {
  try {
    const { error } = await supabase.from('combatants').upsert(
      { id, name, bio: bio || '', owner_id: ownerId || '', owner_name: ownerName || '', updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: false }
    )
    if (error) console.error('upsertGlobalCombatant error', error)
  } catch (e) { console.error('upsertGlobalCombatant exception', e) }
}

// Atomic increment (pass negative values to undo)
export async function incrementCombatantStats(id, { wins = 0, losses = 0, draws = 0, heart = 0, angry = 0, cry = 0 } = {}) {
  try {
    const { error } = await supabase.rpc('increment_combatant_stats', {
      p_id: id, p_wins: wins, p_losses: losses, p_draws: draws, p_heart: heart, p_angry: angry, p_cry: cry,
    })
    if (error) console.error('incrementCombatantStats error', error)
  } catch (e) { console.error('incrementCombatantStats exception', e) }
}

// Full update (for bio edits + bio_history from GlobalCombatantDetail)
export async function updateGlobalCombatant(id, updates) {
  try {
    const { error } = await supabase.from('combatants').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('updateGlobalCombatant error', error)
  } catch (e) { console.error('updateGlobalCombatant exception', e) }
}

export async function getCombatant(id) {
  try {
    const { data, error } = await supabase.from('combatants').select('*').eq('id', id).maybeSingle()
    if (error) { console.error('getCombatant error', error); return null }
    return data ?? null
  } catch (e) { console.error('getCombatant exception', e); return null }
}

// Name search for DraftScreen autocomplete — only published (game-complete) fighters
export async function searchCombatants(query, limit = 8) {
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, bio, wins, losses, owner_name')
      .ilike('name', `%${query}%`)
      .eq('status', 'published')
      .order('wins', { ascending: false })
      .limit(limit)
    if (error) { console.error('searchCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('searchCombatants exception', e); return [] }
}

// Player's recent fighters — shown on autocomplete focus, published only
export async function getPlayerRecentCombatants(ownerId, limit = 8) {
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, bio, wins, losses, owner_name')
      .eq('owner_id', ownerId)
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) { console.error('getPlayerRecentCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('getPlayerRecentCombatants exception', e); return [] }
}

// Player's stashed Workshop combatants — shown only to the owner in their own draft autocomplete.
// Scoped to source='created' so game-played combatants (which default to 'stashed' until
// publish-on-game-completion runs) are not included.
export async function getPlayerStashedCombatants(ownerId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, bio, wins, losses, owner_name')
      .eq('owner_id', ownerId)
      .eq('status', 'stashed')
      .eq('source', 'created')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) { console.error('getPlayerStashedCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('getPlayerStashedCombatants exception', e); return [] }
}

// ─── Lineage / variant combatants ────────────────────────────────────────────

// Insert a new variant combatant. lineage = { rootId, parentId, generation, bornFrom }.
// bornFrom is required — it's the lineage link that powers buildChainEvolutionStory.
// Status starts 'stashed' — same lifecycle as any new combatant.
export async function createVariantCombatant({ id, name, bio, ownerId, ownerName, lineage }) {
  try {
    const { error } = await supabase.from('combatants').insert({
      id, name, bio: bio || '', owner_id: ownerId, owner_name: ownerName,
      lineage, status: 'stashed', updated_at: new Date().toISOString(),
    })
    if (error) console.error('createVariantCombatant error', error)
  } catch (e) { console.error('createVariantCombatant exception', e) }
}

// Returns the full lineage tree for a character: root + all variants, oldest first.
// Includes stashed — lineage display shouldn't hide in-progress forms.
export async function getLineageTree(rootId) {
  try {
    const { data, error } = await supabase
      .from('combatants')
      .select('id, name, bio, wins, losses, reactions_heart, reactions_angry, reactions_cry, lineage, owner_id, owner_name, status')
      .or(`id.eq.${rootId},lineage->>rootId.eq.${rootId}`)
      .order('created_at', { ascending: true })
    if (error) { console.error('getLineageTree error', error); return [] }
    return data || []
  } catch (e) { console.error('getLineageTree exception', e); return [] }
}

// All published combatants owned by a player — base version for autocomplete.
// Heritage-chain filtering (buildActiveFormMap) is applied in DraftScreen (Tier 3).
export async function getEligibleCombatants(ownerId) {
  try {
    const { data, error } = await supabase
      .from('combatants')
      .select('id, name, bio, wins, losses, lineage, owner_name')
      .eq('owner_id', ownerId)
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
    if (error) { console.error('getEligibleCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('getEligibleCombatants exception', e); return [] }
}

// Returns true if a published combatant with this name already exists.
// Case-insensitive. Used to enforce the novel-entry constraint on evolution.
export async function checkCombatantNameExists(name) {
  // Check all combatants, not just published — an unpublished name in a running game
  // must not be reused as an evolution target (both would publish with the same name).
  try {
    const { data, error } = await supabase
      .from('combatants')
      .select('id')
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle()
    if (error) { console.error('checkCombatantNameExists error', error); return false }
    return !!data
  } catch (e) { console.error('checkCombatantNameExists exception', e); return false }
}

// Fetch a specific set of combatants by id — used to resolve variant data for
// heritage-game substitutions without relying on room.combatants snapshots.
export async function getCombatantsByIds(ids) {
  if (!ids.length) return []
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, bio, wins, losses, owner_name')
      .in('id', ids)
    if (error) { console.error('getCombatantsByIds error', error); return [] }
    return data || []
  } catch (e) { console.error('getCombatantsByIds exception', e); return [] }
}

// Walks the heritage chain from startRoomId, returning all rooms oldest-first.
// Used in DraftScreen to build the active-form substitution map for heritage games.
//
// Fast path: if the start room has a seriesId, fetches all series rooms in one
// query and sorts by seriesIndex. Falls back to sequential prevRoomId walking
// for legacy rooms created before seriesId was introduced.
export async function getHeritageChain(startRoomId) {
  const startRoom = await sget('room:' + startRoomId)
  if (!startRoom) return []

  if (startRoom.seriesId) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('data')
        .filter('data->>seriesId', 'eq', startRoom.seriesId)
      if (!error && data?.length) {
        return data
          .map(r => r.data)
          .filter(Boolean)
          .sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0))
      }
    } catch { /* fall through to sequential walk */ }
  }

  // Legacy fallback: walk prevRoomId chain sequentially.
  const rooms = [startRoom]
  let currentId = startRoom.prevRoomId
  while (currentId) {
    const room = await sget('room:' + currentId)
    if (!room) break
    rooms.unshift(room)
    currentId = room.prevRoomId || null
  }
  return rooms
}

// ─── Admin action dispatcher ─────────────────────────────────────────────────
//
// Routes admin write operations through the admin-action Edge Function, which
// verifies the session token and executes with the service role key (bypasses
// RLS, enabling deletes that the anon key cannot perform).
//
// The session token is read from sessionStorage on every call so it's always
// current without needing an explicit setter.

async function callAdminAction(action, params) {
  const token = sessionStorage.getItem('adminSession')
  if (!token) throw new Error('No admin session.')
  const { data, error } = await supabase.functions.invoke('admin-action', {
    body: { action, token, params },
  })
  if (error) throw new Error(error.message)
  return data
}

// ─── Admin combatant operations ──────────────────────────────────────────────

// Search all combatants including stashed — admin only
export async function adminSearchAllCombatants(query = '') {
  try {
    let q = supabase.from('combatants')
      .select('id, name, bio, wins, losses, reactions_heart, reactions_angry, reactions_cry, owner_id, owner_name, status')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
    const { data, error } = await q
    if (error) { console.error('adminSearchAllCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('adminSearchAllCombatants exception', e); return [] }
}

export async function adminDeleteCombatant(id) {
  try {
    await callAdminAction('delete-combatant', { id })
  } catch (e) { console.error('adminDeleteCombatant error', e) }
}

// Set exact stat values (used after recalculation)
export async function adminSetCombatantStats(id, { wins, losses, heart, angry, cry }) {
  try {
    await callAdminAction('set-combatant-stats', { id, wins, losses, heart, angry, cry })
  } catch (e) { console.error('adminSetCombatantStats error', e) }
}

// ─── Admin user operations ────────────────────────────────────────────────────

// Transfer all room references from dropId → keepId, then delete the drop user.
// Relies on applyMergeToRoom (pure) from adminLogic.js for the room transforms.
// Client computes the room transforms; Edge Function applies all writes via service role.
export async function adminMergeUsers(keepId, dropId, rooms, applyMergeToRoomFn) {
  const affected = rooms.filter(r => (r.players || []).some(p => p.id === dropId))
  const roomUpdates = affected.map(room => ({
    id: room.id,
    data: applyMergeToRoomFn(room, dropId, keepId),
  }))
  await callAdminAction('merge-users', { roomUpdates, dropUserId: dropId, keepId })
}

// Fetch all combatants (stashed or published) belonging to a specific owner_id.
// Used by the admin guest re-attribution tool to preview what will be moved.
export async function getCombatantsByOwnerId(ownerId) {
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, status').eq('owner_id', ownerId)
    if (error) { console.error('getCombatantsByOwnerId error', error); return [] }
    return data || []
  } catch (e) { console.error('getCombatantsByOwnerId exception', e); return [] }
}

// Re-attribute all history from a guest ID to a registered user account.
// Parallel to adminMergeUsers but the source is a raw guest ID (no user row to delete).
// replacePlayerIdInRoomFn must be replacePlayerIdInRoom from gameLogic.js.
// Client computes the room transforms; Edge Function applies all writes via service role.
export async function adminLinkGuestToUser(guestId, userId, ownerName, rooms, replacePlayerIdInRoomFn) {
  const affected = rooms.filter(r => (r.players || []).some(p => p.id === guestId))
  const roomUpdates = affected.map(room => ({
    id: room.id,
    data: replacePlayerIdInRoomFn(room, guestId, userId),
  }))
  await callAdminAction('link-guest', { roomUpdates, guestId, userId, ownerName })
}

// Full combatant table dump for admin export (includes unpublished)
export async function getAllCombatantsForExport() {
  try {
    const { data, error } = await supabase
      .from('combatants').select('*').order('updated_at', { ascending: false })
    if (error) { console.error('getAllCombatantsForExport error', error); return [] }
    return data || []
  } catch (e) { console.error('getAllCombatantsForExport exception', e); return [] }
}

// Paginated Cast list — published only.
// baseOnly: when true, excludes variants (lineage IS NULL) so pagination is accurate
// for the "characters" view in ArchiveScreen.
// tag: when set, filters to combatants whose tags array contains this exact tag.
export async function listCombatants({ sort = 'wins', ascending = false, page = 0, pageSize = 20, baseOnly = false, tag = null } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    let q = supabase.from('combatants').select('*', { count: 'exact' }).eq('status', 'published')
    if (baseOnly) q = q.is('lineage', null)
    if (tag)      q = q.contains('tags', [tag])
    const { data, error, count } = await q.order(sort, { ascending }).range(from, to)
    if (error) { console.error('listCombatants error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('listCombatants exception', e); return { items: [], total: 0 } }
}

// Full-field name/bio search across published combatants — used by ArchiveScreen.
// baseOnly: same as listCombatants — filters variants server-side for accurate pagination.
// tag: when set, additionally filters to combatants carrying this tag.
export async function searchCast(query, { sort = 'wins', ascending = false, page = 0, pageSize = 20, baseOnly = false, tag = null } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    let q = supabase.from('combatants').select('*', { count: 'exact' })
      .eq('status', 'published')
      .or(`name.ilike.%${query}%,bio.ilike.%${query}%,owner_name.ilike.%${query}%`)
    if (baseOnly) q = q.is('lineage', null)
    if (tag)      q = q.contains('tags', [tag])
    const { data, error, count } = await q.order(sort, { ascending }).range(from, to)
    if (error) { console.error('searchCast error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('searchCast exception', e); return { items: [], total: 0 } }
}

// Tag autocomplete — returns distinct tags from published combatants matching the prefix.
// Backed by the get_tag_suggestions SQL function (migration 20260416).
export async function getTagSuggestions(prefix = '') {
  try {
    const { data, error } = await supabase.rpc('get_tag_suggestions', { prefix, limit_n: 10 })
    if (error) { console.error('getTagSuggestions error', error); return [] }
    return data || []
  } catch (e) { console.error('getTagSuggestions exception', e); return [] }
}

// Merge one tag into another across all combatants.
// Replaces old_tag with new_tag on every row that carries it.
// If a row already has new_tag, old_tag is simply removed to avoid duplicates.
// Returns the count of affected rows (0 on error).
// Backed by the merge_tags SQL function (migration 20260416).
export async function mergeTagsGlobal(oldTag, newTag) {
  try {
    const { data, error } = await supabase.rpc('merge_tags', { old_tag: oldTag, new_tag: newTag })
    if (error) { console.error('mergeTagsGlobal error', error); return 0 }
    return data || 0
  } catch (e) { console.error('mergeTagsGlobal exception', e); return 0 }
}

// Past games for a player — used on the profile screen to show game history.
// Returns a summarized record per room rather than the full blob.
// NOTE: Full table scan — see getPlayerRoomStats note for scale caveat.
export async function getPlayerRooms(playerId) {
  try {
    const { data, error } = await supabase.from('rooms').select('data')
    if (error) { console.error('getPlayerRooms error', error); return [] }
    return (data || [])
      .map(row => row.data)
      .filter(r =>
        r && !r.devMode &&
        (r.rounds || []).some(rd => rd.winner || rd.draw) &&
        (r.players || []).some(p => p.id === playerId && !p.isBot)
      )
      .map(r => {
        const myCombatants  = r.combatants?.[playerId] || []
        const roundWins     = myCombatants.reduce((n, c) => n + (c.wins   || 0), 0)
        const roundLosses   = myCombatants.reduce((n, c) => n + (c.losses || 0), 0)
        const otherPlayers  = (r.players || []).filter(p => p.id !== playerId && !p.isBot).map(p => p.name)
        return {
          id: r.id, code: r.code, createdAt: r.createdAt,
          seriesId: r.seriesId || null, seriesIndex: r.seriesIndex || null,
          otherPlayers, roundWins, roundLosses,
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch (e) { console.error('getPlayerRooms exception', e); return [] }
}

// ─── Workshop operations ──────────────────────────────────────────────────────
// All Workshop combatants have source='created'. Visibility is enforced at the
// query layer: stashed rows are only fetched when querying with the owner's userId.
// (See auth note in backlog.md — RLS policies can't use auth.uid() with PIN auth.)

// ─── Group helpers (used by Create-a-Combatant group picker) ─────────────────

// Fetch all groups available to a user for the group picker:
// their own groups (any status) plus any published groups not already included.
// Returns array of { id, name, owner_id }.
export async function getGroupsForPicker(ownerId) {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, owner_id, status')
      .or(`owner_id.eq.${ownerId},status.eq.published`)
      .order('name', { ascending: true })
    if (error) { console.error('getGroupsForPicker error', error); return [] }
    // Dedupe by id (owner's stashed groups may also be published)
    const seen = new Set()
    return (data || []).filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true })
  } catch (e) { console.error('getGroupsForPicker exception', e); return [] }
}

// Fetch group_ids for a combatant — used when opening the edit form.
export async function getCombatantGroupIds(combatantId) {
  try {
    const { data, error } = await supabase
      .from('combatant_groups')
      .select('group_id')
      .eq('combatant_id', combatantId)
    if (error) { console.error('getCombatantGroupIds error', error); return [] }
    return (data || []).map(r => r.group_id)
  } catch (e) { console.error('getCombatantGroupIds exception', e); return [] }
}

// Replace all group memberships for a combatant.
// Deletes existing rows, then inserts the new set. addedBy is the userId.
export async function setCombatantGroups(combatantId, groupIds, addedBy) {
  try {
    const { error: delErr } = await supabase
      .from('combatant_groups')
      .delete()
      .eq('combatant_id', combatantId)
    if (delErr) { console.error('setCombatantGroups delete error', delErr); return false }
    if (!groupIds.length) return true
    const rows = groupIds.map(group_id => ({ combatant_id: combatantId, group_id, added_by: addedBy }))
    const { error: insErr } = await supabase.from('combatant_groups').insert(rows)
    if (insErr) console.error('setCombatantGroups insert error', insErr)
    return !insErr
  } catch (e) { console.error('setCombatantGroups exception', e); return false }
}

// Create a new combatant from The Workshop.
// Status defaults to 'stashed' unless the caller explicitly passes 'published'.
export async function createWorkshopCombatant({ id, name, bio, tags = [], ownerId, ownerName, status = 'stashed' }) {
  try {
    const { error } = await supabase.from('combatants').insert({
      id, name, bio: bio || '', tags, owner_id: ownerId, owner_name: ownerName,
      source: 'created', status, updated_at: new Date().toISOString(),
    })
    if (error) console.error('createWorkshopCombatant error', error)
    return !error
  } catch (e) { console.error('createWorkshopCombatant exception', e); return false }
}

// Fetch all combatants for a Workshop owner — stashed and published.
// Stashed rows are private to the owner so we scope by owner_id; no status filter.
export async function getWorkshopCombatants(ownerId) {
  try {
    const { data, error } = await supabase
      .from('combatants')
      .select('id, name, bio, bio_history, tags, wins, losses, draws, status, source, lineage, created_at, updated_at')
      .eq('owner_id', ownerId)
      .eq('source', 'created')
      .order('updated_at', { ascending: false })
    if (error) { console.error('getWorkshopCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('getWorkshopCombatants exception', e); return [] }
}

// Update a Workshop combatant's name, bio, and tags.
// Appends the previous bio to bio_history before saving the new one.
// bioHistoryEntry: { name, bio, updatedAt, updatedBy } — the snapshot before this edit.
export async function updateWorkshopCombatant(id, { name, bio, tags }, bioHistoryEntry, prevBioHistory = []) {
  try {
    const newHistory = [...prevBioHistory, bioHistoryEntry].slice(-20)
    const { error } = await supabase.from('combatants').update({
      name, bio: bio || '', tags, bio_history: newHistory,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) console.error('updateWorkshopCombatant error', error)
    return !error
  } catch (e) { console.error('updateWorkshopCombatant exception', e); return false }
}

// Flip a Workshop combatant between 'stashed' and 'published'.
// Un-publishing does not erase history.
export async function setWorkshopCombatantStatus(id, status) {
  try {
    const { error } = await supabase.from('combatants')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('setWorkshopCombatantStatus error', error)
    return !error
  } catch (e) { console.error('setWorkshopCombatantStatus exception', e); return false }
}

// Delete a Workshop combatant. Only valid for stashed items — callers must
// verify status === 'stashed' before calling. Published combatants are permanent.
// Removes combatant_groups rows first (no cascade FK, so done at app level).
export async function deleteWorkshopCombatant(id) {
  try {
    // Clean up group memberships before deleting the combatant
    const { error: grpErr } = await supabase.from('combatant_groups').delete().eq('combatant_id', id)
    if (grpErr) console.error('deleteWorkshopCombatant group cleanup error', grpErr)
    const { error } = await supabase.from('combatants').delete().eq('id', id)
    if (error) console.error('deleteWorkshopCombatant error', error)
    return !error
  } catch (e) { console.error('deleteWorkshopCombatant exception', e); return false }
}

// Called once when the last round of a game is confirmed
export async function publishCombatants(ids) {
  if (!ids.length) return
  try {
    const { error } = await supabase
      .from('combatants').update({ status: 'published', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) console.error('publishCombatants error', error)
  } catch (e) { console.error('publishCombatants exception', e) }
}

// ─── Arena config ─────────────────────────────────────────────────────────────

// Arena suppression threshold: an arena is excluded from the weighted-liked pool
// when its dislike count exceeds its like count by this ratio.
// Applies in: listPublishedArenas (pool filter), getRandomArenaFromPool,
// and the computed pool badge in ArenaDetailScreen.
export const ARENA_DISLIKE_RATIO = 3

// ─── Arena Workshop operations ────────────────────────────────────────────────

export async function createWorkshopArena({ id, name, bio, rules, tags = [], ownerId, ownerName, status = 'stashed' }) {
  try {
    const { error } = await supabase.from('arenas').insert({
      id, name, bio: bio || '', rules: rules || '', tags,
      owner_id: ownerId, owner_name: ownerName,
      status, updated_at: new Date().toISOString(),
    })
    if (error) console.error('createWorkshopArena error', error)
    return !error
  } catch (e) { console.error('createWorkshopArena exception', e); return false }
}

export async function getWorkshopArenas(ownerId) {
  try {
    const { data, error } = await supabase
      .from('arenas')
      .select('id, name, bio, bio_history, rules, tags, status, owner_id, owner_name, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
    if (error) { console.error('getWorkshopArenas error', error); return [] }
    return data || []
  } catch (e) { console.error('getWorkshopArenas exception', e); return [] }
}

// Update an arena's name, bio, rules, and tags.
// Appends the previous bio snapshot to bio_history before saving.
// bioHistoryEntry: { name, bio, updatedAt, updatedBy }
export async function updateWorkshopArena(id, { name, bio, rules, tags }, bioHistoryEntry, prevBioHistory = []) {
  try {
    const newHistory = [...prevBioHistory, bioHistoryEntry].slice(-20)
    const { error } = await supabase.from('arenas').update({
      name, bio: bio || '', rules: rules || '', tags,
      bio_history: newHistory,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) console.error('updateWorkshopArena error', error)
    return !error
  } catch (e) { console.error('updateWorkshopArena exception', e); return false }
}

export async function setWorkshopArenaStatus(id, status) {
  try {
    const { error } = await supabase.from('arenas')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('setWorkshopArenaStatus error', error)
    return !error
  } catch (e) { console.error('setWorkshopArenaStatus exception', e); return false }
}

// Only valid for stashed arenas — callers must verify status === 'stashed'.
export async function deleteWorkshopArena(id) {
  try {
    const { error } = await supabase.from('arenas').delete().eq('id', id)
    if (error) console.error('deleteWorkshopArena error', error)
    return !error
  } catch (e) { console.error('deleteWorkshopArena exception', e); return false }
}

// Called on game completion for any arena used in the finished game.
// Safe to call with already-published arenas — the update is idempotent.
export async function publishArenas(ids) {
  if (!ids.length) return
  try {
    const { error } = await supabase
      .from('arenas').update({ status: 'published', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) console.error('publishArenas error', error)
  } catch (e) { console.error('publishArenas exception', e) }
}

// Returns a random arena snapshot for random-pool delivery mode.
// pool: 'standard' | 'wacky' | 'league' | 'weighted-liked'
// excludeArenaIds: arena IDs to exclude (e.g. already played in the series)
export async function getRandomArenaFromPool(pool, excludeArenaIds = []) {
  try {
    let q = supabase
      .from('arenas')
      .select('id, name, bio, rules, tags, likes, dislikes')
      .eq('status', 'published')
    if (pool !== 'weighted-liked') q = q.contains('pools', [pool])
    const { data, error } = await q
    if (error || !data?.length) return null

    let eligible = data
    if (pool === 'weighted-liked') {
      eligible = eligible.filter(a => (a.dislikes || 0) <= (a.likes || 0) * ARENA_DISLIKE_RATIO)
    }
    if (excludeArenaIds.length) {
      const filtered = eligible.filter(a => !excludeArenaIds.includes(a.id))
      // fall back to full eligible set if all are excluded
      if (filtered.length) eligible = filtered
    }
    if (!eligible.length) return null

    const arena = eligible[Math.floor(Math.random() * eligible.length)]
    return {
      id:          arena.id,
      name:        arena.name,
      description: arena.bio   || '',
      houseRules:  arena.rules || null,
      tags:        arena.tags  || [],
    }
  } catch (e) { console.error('getRandomArenaFromPool exception', e); return null }
}

// Returns arenas visible to a host in the lobby arena picker:
// all published arenas + the host's own stashed arenas.
export async function getArenaPickerOptions(ownerId) {
  try {
    const { data, error } = await supabase
      .from('arenas')
      .select('id, name, bio, rules, tags, status, owner_id')
      .or(`status.eq.published,owner_id.eq.${ownerId}`)
      .order('name', { ascending: true })
    if (error) { console.error('getArenaPickerOptions error', error); return [] }
    // Dedupe (owner's arenas appear in both halves of the OR when published)
    const seen = new Set()
    return (data || []).filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
  } catch (e) { console.error('getArenaPickerOptions exception', e); return [] }
}

// ─── Archive listing functions ────────────────────────────────────────────────

// Published groups with aggregated member count, combined W/L, and most-decorated
// member name. Three queries aggregated client-side (acceptable at expected scale).
export async function listPublishedGroups({ query = '', tag = null } = {}) {
  try {
    const [groupsRes, membershipsRes, combatantsRes] = await Promise.all([
      supabase.from('groups').select('id, name, description, owner_name, tags').eq('status', 'published'),
      supabase.from('combatant_groups').select('combatant_id, group_id'),
      supabase.from('combatants').select('id, name, wins, losses, reactions_heart, reactions_angry, reactions_cry').eq('status', 'published'),
    ])
    if (groupsRes.error || membershipsRes.error || combatantsRes.error) return []

    const combatantMap = Object.fromEntries((combatantsRes.data || []).map(c => [c.id, c]))
    const membersByGroup = {}
    for (const row of (membershipsRes.data || [])) {
      if (!membersByGroup[row.group_id]) membersByGroup[row.group_id] = []
      if (combatantMap[row.combatant_id]) membersByGroup[row.group_id].push(combatantMap[row.combatant_id])
    }

    let groups = (groupsRes.data || []).map(g => {
      const members = membersByGroup[g.id] || []
      const wins   = members.reduce((s, c) => s + (c.wins   || 0), 0)
      const losses = members.reduce((s, c) => s + (c.losses || 0), 0)
      const mostDecorated = members.reduce((best, c) => {
        const score     = (c.wins || 0) * 3 + (c.reactions_heart || 0) + (c.reactions_angry || 0) + (c.reactions_cry || 0)
        const bestScore = best ? (best.wins || 0) * 3 + (best.reactions_heart || 0) + (best.reactions_angry || 0) + (best.reactions_cry || 0) : -1
        return score > bestScore ? c : best
      }, null)
      return { ...g, member_count: members.length, wins, losses, most_decorated: mostDecorated?.name ?? null }
    })

    if (tag)         groups = groups.filter(g => (g.tags || []).includes(tag))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      groups = groups.filter(g => g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
    }

    return groups.sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
  } catch (e) { console.error('listPublishedGroups exception', e); return [] }
}

// Published arenas with pagination and optional name/bio search + tag/pool filter.
// Default sort: most recently played first (last_played_at desc nulls last), then newest created.
// pool: 'standard' | 'wacky' | 'league' | 'weighted-liked' | null
export async function listPublishedArenas({ query = '', tag = null, pool = null, page = 0, pageSize = 20 } = {}) {
  try {
    let q = supabase
      .from('arenas')
      .select('id, name, bio, rules, tags, pools, likes, dislikes, owner_name, last_played_at', { count: 'exact' })
      .eq('status', 'published')
    if (tag)          q = q.contains('tags', [tag])
    if (pool && pool !== 'weighted-liked') q = q.contains('pools', [pool])
    if (query.trim()) q = q.or(`name.ilike.%${query.trim()}%,bio.ilike.%${query.trim()}%`)
    q = q
      .order('last_played_at', { ascending: false, nullsFirst: false })
      .order('created_at',     { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    const { data, count, error } = await q
    if (error) { console.error('listPublishedArenas error', error); return { items: [], total: 0 } }
    let items = data || []
    // weighted-liked is computed: filter out arenas with dislikes > likes × ARENA_DISLIKE_RATIO
    if (pool === 'weighted-liked') items = items.filter(a => (a.dislikes || 0) <= (a.likes || 0) * ARENA_DISLIKE_RATIO)
    return { items, total: count || 0 }
  } catch (e) { console.error('listPublishedArenas exception', e); return { items: [], total: 0 } }
}

// Fetch a single published arena by id (full row for detail page).
export async function getArena(id) {
  try {
    const { data, error } = await supabase
      .from('arenas')
      .select('id, name, bio, bio_history, rules, tags, pools, likes, dislikes, owner_id, owner_name, status, root_id, parent_id, generation, born_from, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()
    if (error) { console.error('getArena error', error); return null }
    return data ?? null
  } catch (e) { console.error('getArena exception', e); return null }
}

// Returns the full lineage tree for an arena: root + all variants, oldest first.
// rootId: the root_id of the family (the original arena's id).
export async function getArenaLineageTree(rootId) {
  try {
    const { data, error } = await supabase
      .from('arenas')
      .select('id, name, bio, rules, tags, pools, likes, dislikes, root_id, parent_id, generation, born_from, owner_id, owner_name, status, created_at')
      .or(`id.eq.${rootId},root_id.eq.${rootId}`)
      .order('created_at', { ascending: true })
    if (error) { console.error('getArenaLineageTree error', error); return [] }
    return data || []
  } catch (e) { console.error('getArenaLineageTree exception', e); return [] }
}

// Get the current user's reaction ('like' | 'dislike') for an arena, or null if none.
export async function getArenaReaction(arenaId, userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase
      .from('arena_reactions')
      .select('reaction')
      .eq('arena_id', arenaId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) { console.error('getArenaReaction error', error); return null }
    return data?.reaction ?? null
  } catch (e) { console.error('getArenaReaction exception', e); return null }
}

// Set or change a reaction. Upserts on (arena_id, user_id).
// Returns the updated {likes, dislikes} counts after the trigger fires.
export async function upsertArenaReaction(arenaId, userId, reaction) {
  try {
    const { error } = await supabase
      .from('arena_reactions')
      .upsert({ arena_id: arenaId, user_id: userId, reaction }, { onConflict: 'arena_id,user_id' })
    if (error) { console.error('upsertArenaReaction error', error); return null }
    const { data } = await supabase.from('arenas').select('likes, dislikes').eq('id', arenaId).maybeSingle()
    return data ? { likes: data.likes, dislikes: data.dislikes } : null
  } catch (e) { console.error('upsertArenaReaction exception', e); return null }
}

// Clear a player's reaction for an arena.
export async function deleteArenaReaction(arenaId, userId) {
  try {
    const { error } = await supabase
      .from('arena_reactions')
      .delete()
      .eq('arena_id', arenaId)
      .eq('user_id', userId)
    if (error) { console.error('deleteArenaReaction error', error); return null }
    const { data } = await supabase.from('arenas').select('likes, dislikes').eq('id', arenaId).maybeSingle()
    return data ? { likes: data.likes, dislikes: data.dislikes } : null
  } catch (e) { console.error('deleteArenaReaction exception', e); return null }
}

// Scan all rooms for rounds where the arena (or any of its variants) appeared.
// arenaIds: array of arena IDs to search (include variants for full coverage).
// Returns [{gameCode, roundNumber, roomData}] most-recent-room first.
export async function getArenaAppearances(arenaIds) {
  if (!arenaIds.length) return []
  try {
    const idSet = new Set(arenaIds)
    const { data, error } = await supabase.from('rooms').select('data').order('updated_at', { ascending: false })
    if (error) { console.error('getArenaAppearances error', error); return [] }
    const appearances = []
    for (const row of (data || [])) {
      const r = row.data
      if (!r || r.devMode) continue
      for (const round of (r.rounds || [])) {
        if (round.arena?.id && idSet.has(round.arena.id)) {
          appearances.push({ gameCode: r.id, roundNumber: round.number, roomData: r })
        }
      }
    }
    return appearances
  } catch (e) { console.error('getArenaAppearances exception', e); return [] }
}

// Returns true if the given player participated in any game that used this arena.
// Used to gate the like/dislike action on the arena detail page in The Archive.
export async function hasPlayerEncounteredArena(arenaId, playerId) {
  if (!arenaId || !playerId) return false
  try {
    const { data, error } = await supabase.from('rooms').select('data').order('updated_at', { ascending: false })
    if (error || !data?.length) return false
    return data.some(row => {
      const r = row.data
      if (!r || r.devMode) return false
      if (!(r.players || []).some(p => p.id === playerId)) return false
      return (r.rounds || []).some(rd => rd.arena?.id === arenaId)
    })
  } catch (e) { console.error('hasPlayerEncounteredArena exception', e); return false }
}

// All distinct tags across published combatants, groups, and arenas.
// Returns [{tag, count}] sorted by frequency desc then alphabetical.
export async function listAllDistinctTags() {
  try {
    const [combRes, grpRes, arenaRes] = await Promise.all([
      supabase.from('combatants').select('tags').eq('status', 'published'),
      supabase.from('groups').select('tags').eq('status', 'published'),
      supabase.from('arenas').select('tags').eq('status', 'published'),
    ])
    const counts = {}
    for (const row of [...(combRes.data || []), ...(grpRes.data || []), ...(arenaRes.data || [])]) {
      for (const t of (row.tags || [])) counts[t] = (counts[t] || 0) + 1
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  } catch (e) { console.error('listAllDistinctTags exception', e); return [] }
}
