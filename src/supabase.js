import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️  Missing Supabase env vars. Copy .env.example to .env and fill in your project credentials.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── In-memory cache ──────────────────────────────────────────────────────────
const _cache = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached(key) {
  const entry = _cache[key]
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { delete _cache[key]; return null }
  return entry.data
}
function setCached(key, data) { _cache[key] = { data, ts: Date.now() } }
function bustCache(key) { delete _cache[key] }

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

// Public lobbies for the join screen browser.
// One table scan: collects open public rooms and (if playerId given) computes
// how many completed games the current player has had with each host, used for
// the default "familiar" sort order.
export async function getPublicLobbies(playerId = null) {
  try {
    const { data, error } = await supabase.from('rooms').select('data').order('updated_at', { ascending: false })
    if (error) { console.error('getPublicLobbies error', error); return [] }
    const hostFrequency = {}
    const publicLobbies = []
    for (const row of (data || [])) {
      const r = row.data
      if (!r || r.devMode) continue
      if (playerId && r.phase === 'ended' && (r.players || []).some(p => p.id === playerId && !p.isBot)) {
        hostFrequency[r.host] = (hostFrequency[r.host] || 0) + 1
      }
      if (r.phase === 'lobby' && r.settings?.isPublic && !r.nextRoomId) {
        publicLobbies.push({
          code:        r.id,
          hostId:      r.host,
          hostName:    (r.players || []).find(p => p.id === r.host)?.name || 'Unknown',
          playerCount: (r.players || []).filter(p => !p.isBot).length,
          createdAt:   r.createdAt,
          arenaMode:   r.settings?.arenaMode || 'none',
        })
      }
    }
    return publicLobbies
      .map(lobby => ({ ...lobby, timesPlayedWithHost: hostFrequency[lobby.hostId] || 0 }))
      .sort((a, b) =>
        b.timesPlayedWithHost - a.timesPlayedWithHost ||
        b.playerCount - a.playerCount ||
        b.createdAt - a.createdAt
      )
  } catch (e) { console.error('getPublicLobbies exception', e); return [] }
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
    bustCache('all_distinct_tags'); bustCache('published_groups')
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

// Update the induction note only — does not alter inducted_at, inducted_by, or hall_of_fame status.
export async function superHostEditHofNote(combatantId, note) {
  try {
    const { error } = await supabase.from('combatants')
      .update({ induction_note: note, updated_at: new Date().toISOString() })
      .eq('id', combatantId)
    if (error) console.error('superHostEditHofNote error', error)
    return !error
  } catch (e) { console.error('superHostEditHofNote exception', e); return false }
}

// All currently inducted Hall of Fame combatants, sorted by inducted_at desc.
export async function listHofCombatants() {
  try {
    const { data, error } = await supabase.from('combatants')
      .select('id, name, bio, owner_name, wins, losses, draws, reactions_heart, reactions_angry, reactions_cry, lineage, tags, inducted_at, inducted_by, induction_note')
      .eq('status', 'published')
      .eq('hall_of_fame', true)
      .order('inducted_at', { ascending: false })
    if (error) { console.error('listHofCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('listHofCombatants exception', e); return [] }
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

// ─── Room invitations ─────────────────────────────────────────────────────────

// Send an invitation from host to a registered user. Returns the new invitation id or null.
export async function createRoomInvitation(roomId, inviteeId, inviteeName, invitedBy) {
  try {
    const { data, error } = await supabase
      .from('room_invitations')
      .insert({ room_id: roomId, invitee_id: inviteeId, invitee_name: inviteeName, invited_by: invitedBy })
      .select('id')
      .single()
    if (error) { console.error('createRoomInvitation error', error); return null }
    return data?.id ?? null
  } catch (e) { console.error('createRoomInvitation exception', e); return null }
}

// Cancel a pending invitation (host action). Hard delete — no record needed.
export async function deleteRoomInvitation(invitationId) {
  try {
    const { error } = await supabase.from('room_invitations').delete().eq('id', invitationId)
    if (error) console.error('deleteRoomInvitation error', error)
    return !error
  } catch (e) { console.error('deleteRoomInvitation exception', e); return false }
}

// Update invitation status — 'accepted' or 'declined'.
export async function updateRoomInvitationStatus(invitationId, status) {
  try {
    const { error } = await supabase.from('room_invitations').update({ status }).eq('id', invitationId)
    if (error) console.error('updateRoomInvitationStatus error', error)
    return !error
  } catch (e) { console.error('updateRoomInvitationStatus exception', e); return false }
}

// Pending invitations for a room — for the host's lobby view.
export async function getRoomInvitations(roomId) {
  try {
    const { data, error } = await supabase
      .from('room_invitations')
      .select('id, invitee_id, invitee_name, invited_at')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: true })
    if (error) { console.error('getRoomInvitations error', error); return [] }
    return data || []
  } catch (e) { console.error('getRoomInvitations exception', e); return [] }
}

// Pending invitations for a player — drives the "Invited" entries in My Open Lobbies.
export async function getPendingInvitationsForPlayer(playerId) {
  try {
    const { data, error } = await supabase
      .from('room_invitations')
      .select('id, room_id, invitee_name, invited_by, invited_at')
      .eq('invitee_id', playerId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false })
    if (error) { console.error('getPendingInvitationsForPlayer error', error); return [] }
    return data || []
  } catch (e) { console.error('getPendingInvitationsForPlayer exception', e); return [] }
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
    bustCache('all_distinct_tags')
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
    if (!groupIds.length) { bustCache('published_groups'); return true }
    const rows = groupIds.map(group_id => ({ combatant_id: combatantId, group_id, added_by: addedBy }))
    const { error: insErr } = await supabase.from('combatant_groups').insert(rows)
    if (insErr) console.error('setCombatantGroups insert error', insErr)
    bustCache('published_groups')
    return !insErr
  } catch (e) { console.error('setCombatantGroups exception', e); return false }
}

// Fetch published group memberships for multiple combatants at once.
// Returns { [combatantId]: [{ id, name }] } — only published groups are included.
// Stashed groups owned by others are invisible; only published groups appear here.
export async function getGroupsForCombatants(combatantIds) {
  if (!combatantIds?.length) return {}
  try {
    const { data: memberships, error: mErr } = await supabase
      .from('combatant_groups')
      .select('combatant_id, group_id')
      .in('combatant_id', combatantIds)
    if (mErr) { console.error('getGroupsForCombatants memberships error', mErr); return {} }
    const groupIds = [...new Set((memberships || []).map(m => m.group_id))]
    if (!groupIds.length) return {}
    const { data: groups, error: gErr } = await supabase
      .from('groups')
      .select('id, name')
      .in('id', groupIds)
      .eq('status', 'published')
    if (gErr) { console.error('getGroupsForCombatants groups error', gErr); return {} }
    const groupMap = Object.fromEntries((groups || []).map(g => [g.id, g]))
    const result = {}
    for (const m of memberships || []) {
      if (!groupMap[m.group_id]) continue
      if (!result[m.combatant_id]) result[m.combatant_id] = []
      result[m.combatant_id].push(groupMap[m.group_id])
    }
    return result
  } catch (e) { console.error('getGroupsForCombatants exception', e); return {} }
}

// ─── Group Workshop operations ────────────────────────────────────────────────

export async function createWorkshopGroup({ id, name, description, tags = [], ownerId, ownerName, status = 'stashed' }) {
  try {
    const { error } = await supabase.from('groups').insert({
      id, name, description: description || '', tags,
      owner_id: ownerId, owner_name: ownerName,
      status, updated_at: new Date().toISOString(),
    })
    if (error) console.error('createWorkshopGroup error', error)
    return !error
  } catch (e) { console.error('createWorkshopGroup exception', e); return false }
}

// Fetch all groups for a Workshop owner — stashed and published — with member_count.
export async function getWorkshopGroups(ownerId) {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, description, tags, status, owner_id, owner_name, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
    if (error) { console.error('getWorkshopGroups error', error); return [] }
    const rows = data || []
    if (!rows.length) return rows
    const ids = rows.map(g => g.id)
    const { data: memberships } = await supabase.from('combatant_groups').select('group_id').in('group_id', ids)
    const countMap = {}
    for (const m of (memberships || [])) countMap[m.group_id] = (countMap[m.group_id] || 0) + 1
    return rows.map(g => ({ ...g, member_count: countMap[g.id] || 0 }))
  } catch (e) { console.error('getWorkshopGroups exception', e); return [] }
}

export async function updateWorkshopGroup(id, { name, description, tags }) {
  try {
    const { error } = await supabase.from('groups').update({
      name, description: description || '', tags,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) console.error('updateWorkshopGroup error', error)
    bustCache('published_groups')
    return !error
  } catch (e) { console.error('updateWorkshopGroup exception', e); return false }
}

export async function setWorkshopGroupStatus(id, status) {
  try {
    const { error } = await supabase.from('groups')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('setWorkshopGroupStatus error', error)
    bustCache('published_groups')
    return !error
  } catch (e) { console.error('setWorkshopGroupStatus exception', e); return false }
}

// Only valid for stashed groups. Removes combatant_groups rows for this group first.
export async function deleteWorkshopGroup(id) {
  try {
    await supabase.from('combatant_groups').delete().eq('group_id', id)
    const { error } = await supabase.from('groups').delete().eq('id', id)
    if (error) console.error('deleteWorkshopGroup error', error)
    bustCache('published_groups')
    return !error
  } catch (e) { console.error('deleteWorkshopGroup exception', e); return false }
}

// Replace all combatant memberships for a group (from the group side).
// Mirrors setCombatantGroups but keyed on group_id instead of combatant_id.
export async function setGroupCombatants(groupId, combatantIds, addedBy) {
  try {
    const { error: delErr } = await supabase.from('combatant_groups').delete().eq('group_id', groupId)
    if (delErr) { console.error('setGroupCombatants delete error', delErr); return false }
    if (!combatantIds.length) { bustCache('published_groups'); return true }
    const rows = combatantIds.map(combatant_id => ({ combatant_id, group_id: groupId, added_by: addedBy }))
    const { error: insErr } = await supabase.from('combatant_groups').insert(rows)
    if (insErr) console.error('setGroupCombatants insert error', insErr)
    bustCache('published_groups')
    return !insErr
  } catch (e) { console.error('setGroupCombatants exception', e); return false }
}

// Fetch combatant IDs belonging to a group — used when opening the group edit form.
export async function getGroupCombatantIds(groupId) {
  try {
    const { data, error } = await supabase
      .from('combatant_groups')
      .select('combatant_id')
      .eq('group_id', groupId)
    if (error) { console.error('getGroupCombatantIds error', error); return [] }
    return (data || []).map(r => r.combatant_id)
  } catch (e) { console.error('getGroupCombatantIds exception', e); return [] }
}

// Returns combatants available to add to a group: the owner's own combatants (any status)
// plus all published combatants from any owner. Deduped and sorted by name.
export async function getCombatantPickerOptions(ownerId) {
  try {
    const { data, error } = await supabase
      .from('combatants')
      .select('id, name, bio, status, owner_id')
      .or(`owner_id.eq.${ownerId},status.eq.published`)
      .order('name', { ascending: true })
    if (error) { console.error('getCombatantPickerOptions error', error); return [] }
    const seen = new Set()
    return (data || []).filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
  } catch (e) { console.error('getCombatantPickerOptions exception', e); return [] }
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

// Stash a set of combatants into a player's Workshop after a kick.
// The combatants already exist in global_combatants (upserted on draft submit);
// we flip source to 'created' and status to 'stashed' so they appear in the Workshop.
export async function stashKickedCombatants(combatants) {
  if (!combatants?.length) return
  try {
    const rows = combatants.map(c => ({
      id: c.id,
      name: c.name,
      bio: c.bio || '',
      owner_id: c.ownerId || '',
      owner_name: c.ownerName || '',
      source: 'created',
      status: 'stashed',
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('combatants').upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
    if (error) console.error('stashKickedCombatants error', error)
  } catch (e) { console.error('stashKickedCombatants exception', e) }
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

// Insert a new variant arena. Lineage fields (rootId, parentId, generation, bornFrom) are required.
// bornFrom shape: { gameCode, roundNumber, seriesId } — seriesId is nullable.
// Status starts 'stashed' — publish-on-game-completion applies at room close.
export async function createArenaVariant({ id, name, bio, rules, tags = [], ownerId, ownerName, rootId, parentId, generation, bornFrom }) {
  try {
    const { error } = await supabase.from('arenas').insert({
      id, name, bio: bio || '', rules: rules || '', tags,
      owner_id: ownerId, owner_name: ownerName,
      root_id: rootId, parent_id: parentId, generation, born_from: bornFrom,
      status: 'stashed', updated_at: new Date().toISOString(),
    })
    if (error) console.error('createArenaVariant error', error)
  } catch (e) { console.error('createArenaVariant exception', e) }
}

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

// ─── Playlist Workshop operations ─────────────────────────────────────────────

// Returns the new playlist id, or null on failure.
export async function createWorkshopPlaylist({ name, tags = [], ownerId, ownerName, status = 'stashed' }) {
  try {
    const { data, error } = await supabase.from('arena_playlists').insert({
      name, tags, owner_id: ownerId, owner_name: ownerName,
      status, updated_at: new Date().toISOString(),
    }).select('id').single()
    if (error) console.error('createWorkshopPlaylist error', error)
    return data?.id || null
  } catch (e) { console.error('createWorkshopPlaylist exception', e); return null }
}

// Returns playlists owned by ownerId, each with a slot_count field.
export async function getWorkshopPlaylists(ownerId) {
  try {
    const { data, error } = await supabase
      .from('arena_playlists')
      .select('id, name, tags, status, owner_id, owner_name, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
    if (error) { console.error('getWorkshopPlaylists error', error); return [] }
    const rows = data || []
    if (!rows.length) return rows
    const ids = rows.map(p => p.id)
    const { data: slots } = await supabase.from('arena_playlist_slots').select('playlist_id').in('playlist_id', ids)
    const countMap = {}
    for (const s of (slots || [])) countMap[s.playlist_id] = (countMap[s.playlist_id] || 0) + 1
    return rows.map(p => ({ ...p, slot_count: countMap[p.id] || 0 }))
  } catch (e) { console.error('getWorkshopPlaylists exception', e); return [] }
}

export async function updateWorkshopPlaylist(id, { name, tags }) {
  try {
    const { error } = await supabase.from('arena_playlists')
      .update({ name, tags, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('updateWorkshopPlaylist error', error)
    return !error
  } catch (e) { console.error('updateWorkshopPlaylist exception', e); return false }
}

export async function setWorkshopPlaylistStatus(id, status) {
  try {
    const { error } = await supabase.from('arena_playlists')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('setWorkshopPlaylistStatus error', error)
    return !error
  } catch (e) { console.error('setWorkshopPlaylistStatus exception', e); return false }
}

// Only valid for stashed playlists — callers must verify status === 'stashed'.
// Deletes slots first (no cascade in schema).
export async function deleteWorkshopPlaylist(id) {
  try {
    await supabase.from('arena_playlist_slots').delete().eq('playlist_id', id)
    const { error } = await supabase.from('arena_playlists').delete().eq('id', id)
    if (error) console.error('deleteWorkshopPlaylist error', error)
    return !error
  } catch (e) { console.error('deleteWorkshopPlaylist exception', e); return false }
}

// Returns a playlist row with its slots joined to arena metadata for the edit form.
// slots: [{ id, position, arena_id, arenaName, arenaBio, arenaStatus }] ordered by position.
export async function getPlaylistWithSlots(playlistId) {
  try {
    const [playlistRes, slotsRes] = await Promise.all([
      supabase.from('arena_playlists').select('*').eq('id', playlistId).single(),
      supabase.from('arena_playlist_slots').select('id, position, arena_id').eq('playlist_id', playlistId).order('position'),
    ])
    if (playlistRes.error) { console.error('getPlaylistWithSlots error', playlistRes.error); return null }
    const slots = slotsRes.data || []
    if (!slots.length) return { ...playlistRes.data, slots: [] }
    const { data: arenas } = await supabase.from('arenas').select('id, name, bio, status').in('id', slots.map(s => s.arena_id))
    const arenaMap = Object.fromEntries((arenas || []).map(a => [a.id, a]))
    return {
      ...playlistRes.data,
      slots: slots.map(s => ({
        id:          s.id,
        position:    s.position,
        arena_id:    s.arena_id,
        arenaName:   arenaMap[s.arena_id]?.name   || 'Unknown arena',
        arenaBio:    arenaMap[s.arena_id]?.bio     || '',
        arenaStatus: arenaMap[s.arena_id]?.status  || 'published',
      })),
    }
  } catch (e) { console.error('getPlaylistWithSlots exception', e); return null }
}

// Replaces all slots for a playlist with the given ordered arenaIds (1-based positions).
export async function setPlaylistSlots(playlistId, arenaIds) {
  try {
    await supabase.from('arena_playlist_slots').delete().eq('playlist_id', playlistId)
    if (!arenaIds.length) return true
    const rows = arenaIds.map((arenaId, i) => ({ playlist_id: playlistId, arena_id: arenaId, position: i + 1 }))
    const { error } = await supabase.from('arena_playlist_slots').insert(rows)
    if (error) console.error('setPlaylistSlots error', error)
    return !error
  } catch (e) { console.error('setPlaylistSlots exception', e); return false }
}

// Returns published + owner's stashed playlists for the lobby picker.
export async function getPlaylistPickerOptions(ownerId) {
  try {
    const { data, error } = await supabase
      .from('arena_playlists')
      .select('id, name, tags, status, owner_id')
      .or(`status.eq.published,owner_id.eq.${ownerId}`)
      .order('name', { ascending: true })
    if (error) { console.error('getPlaylistPickerOptions error', error); return [] }
    const seen = new Set()
    return (data || []).filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
  } catch (e) { console.error('getPlaylistPickerOptions exception', e); return [] }
}

// Returns ordered arena snapshots for playlist delivery at round-open time.
// Shape matches round.arena: { id, name, description, houseRules, tags }.
export async function getPlaylistForDelivery(playlistId) {
  try {
    const { data: slots, error } = await supabase
      .from('arena_playlist_slots')
      .select('position, arena_id')
      .eq('playlist_id', playlistId)
      .order('position')
    if (error || !slots?.length) return []
    const { data: arenas } = await supabase
      .from('arenas')
      .select('id, name, bio, rules, tags')
      .in('id', slots.map(s => s.arena_id))
    const arenaMap = Object.fromEntries((arenas || []).map(a => [a.id, a]))
    return slots.map(s => {
      const a = arenaMap[s.arena_id]
      if (!a) return null
      return { id: a.id, name: a.name, description: a.bio || '', houseRules: a.rules || null, tags: a.tags || [] }
    }).filter(Boolean)
  } catch (e) { console.error('getPlaylistForDelivery exception', e); return [] }
}

// Called on game completion for the playlist used in the finished game.
// Idempotent — safe to call on an already-published playlist.
export async function publishPlaylist(id) {
  if (!id) return
  try {
    const { error } = await supabase.from('arena_playlists')
      .update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('publishPlaylist error', error)
  } catch (e) { console.error('publishPlaylist exception', e) }
}

// ─── Archive listing functions ────────────────────────────────────────────────

// Published groups with aggregated member count, combined W/L, and most-decorated
// member name. Three queries aggregated client-side (acceptable at expected scale).
export async function listPublishedGroups({ query = '', tag = null } = {}) {
  try {
    let groups = getCached('published_groups')
    if (!groups) {
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

      groups = (groupsRes.data || []).map(g => {
        const members = membersByGroup[g.id] || []
        const wins   = members.reduce((s, c) => s + (c.wins   || 0), 0)
        const losses = members.reduce((s, c) => s + (c.losses || 0), 0)
        const mostDecorated = members.reduce((best, c) => {
          const score     = (c.wins || 0) * 3 + (c.reactions_heart || 0) + (c.reactions_angry || 0) + (c.reactions_cry || 0)
          const bestScore = best ? (best.wins || 0) * 3 + (best.reactions_heart || 0) + (best.reactions_angry || 0) + (best.reactions_cry || 0) : -1
          return score > bestScore ? c : best
        }, null)
        return { ...g, member_count: members.length, wins, losses, most_decorated: mostDecorated?.name ?? null }
      }).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
      setCached('published_groups', groups)
    }

    let filtered = groups
    if (tag)         filtered = filtered.filter(g => (g.tags || []).includes(tag))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      filtered = filtered.filter(g => g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
    }

    return filtered
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

// ─── Seasons ──────────────────────────────────────────────────────────────────

export async function createSeason(season) {
  const { data, error } = await supabase.from('seasons').insert(season).select().single()
  if (error) throw error
  return data
}

export async function getSeasons(ownerId) {
  const { data, error } = await supabase.from('seasons').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false })
  if (error) { console.error('getSeasons error', error); return [] }
  return data || []
}

export async function getSeason(id) {
  const { data, error } = await supabase.from('seasons').select('*').eq('id', id).single()
  if (error) { console.error('getSeason error', error); return null }
  return data
}

export async function updateSeason(id, changes) {
  const { data, error } = await supabase.from('seasons').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Filter all rooms by seasonId — used to build season standings and series list.
export async function getSeasonRooms(seasonId) {
  const all = await slist()
  return all.filter(r => r.seasonId === seasonId)
}

// ─── Awards & votes ───────────────────────────────────────────────────────────

// Insert a pending award row. ballot_state should be initialized by the caller:
//   { phase: 'nomination', lockedVoterIds: [], runoffPool: null }
export async function createPendingAward(award) {
  const { data, error } = await supabase.from('awards').insert(award).select().single()
  if (error) throw error
  return data
}

export async function getAwardWithBallot(awardId) {
  const { data, error } = await supabase.from('awards').select('*').eq('id', awardId).single()
  if (error) { console.error('getAwardWithBallot error', error); return null }
  return data
}

export async function getVotesForAward(awardId) {
  const { data, error } = await supabase.from('votes').select('*').eq('award_id', awardId)
  if (error) { console.error('getVotesForAward error', error); return [] }
  return data || []
}

// Subscribe to updates on an award row (ballot_state changes, resolution).
// Returns an unsubscribe function for useEffect cleanup.
export function subscribeToAward(awardId, onUpdate) {
  const channel = supabase
    .channel('award-' + awardId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'awards', filter: `id=eq.${awardId}` },
      payload => { if (payload.new) onUpdate(payload.new) }
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Lock in a nomination. Inserts a vote record and appends voterId to ballot_state.lockedVoterIds.
export async function lockInVote({ awardId, voterId, voterName, nomineeId, nomineeType, nomineeName, phase }) {
  await supabase.from('votes').insert({
    id: genId(), award_id: awardId, voter_id: voterId, voter_name: voterName,
    nominee_id: nomineeId, nominee_type: nomineeType, nominee_name: nomineeName,
    phase, cast_at: new Date().toISOString(),
  })
  const award = await getAwardWithBallot(awardId)
  if (!award) return
  const bs = award.ballot_state || { phase, lockedVoterIds: [], runoffPool: null }
  const lockedVoterIds = [...new Set([...(bs.lockedVoterIds || []), voterId])]
  await supabase.from('awards').update({
    ballot_state: { ...bs, lockedVoterIds },
    updated_at: new Date().toISOString(),
  }).eq('id', awardId)
}

// Record an abstain — adds voterId to lockedVoterIds without inserting a vote record.
export async function lockInAbstain(awardId, voterId) {
  const award = await getAwardWithBallot(awardId)
  if (!award) return
  const bs = award.ballot_state || { phase: 'nomination', lockedVoterIds: [], runoffPool: null }
  const lockedVoterIds = [...new Set([...(bs.lockedVoterIds || []), voterId])]
  await supabase.from('awards').update({
    ballot_state: { ...bs, lockedVoterIds },
    updated_at: new Date().toISOString(),
  }).eq('id', awardId)
}

// Transition a ballot from nomination to runoff.
// runoffPool is [{ id, name, type }] — the tied nominees who advance to runoff.
export async function advanceToRunoff(awardId, runoffPool) {
  await supabase.from('awards').update({
    ballot_state: { phase: 'runoff', lockedVoterIds: [], runoffPool },
    updated_at: new Date().toISOString(),
  }).eq('id', awardId)
}

// Resolve an award. Updates the pending row with the first winner and inserts
// additional rows for co-winners. Clears ballot_state on all rows.
//
// winners is [{ id, name, type }] — the resolved recipients.
// coAward is true when more than one recipient shares the award.
export async function resolveAward({ awardId, winners, coAward }) {
  const award = await getAwardWithBallot(awardId)
  if (!award) return
  const now = new Date().toISOString()
  const isCoAward = coAward || winners.length > 1

  await supabase.from('awards').update({
    recipient_id:   winners[0].id,
    recipient_name: winners[0].name,
    co_award:       isCoAward,
    awarded_at:     now,
    ballot_state:   null,
    updated_at:     now,
  }).eq('id', awardId)

  for (let i = 1; i < winners.length; i++) {
    await supabase.from('awards').insert({
      id:             genId(),
      type:           award.type,
      layer:          award.layer,
      scope_id:       award.scope_id,
      scope_type:     award.scope_type,
      recipient_type: award.recipient_type,
      recipient_id:   winners[i].id,
      recipient_name: winners[i].name,
      co_award:       true,
      awarded_at:     now,
      ballot_state:   null,
      created_at:     now,
      updated_at:     now,
    })
  }
}

// Append a single entry to a combatant's mvp_record.
// entry: { gameCode, voteShare, coMvp }
export async function appendMvpRecord(combatantId, entry) {
  const { data, error: fetchError } = await supabase
    .from('combatants').select('mvp_record').eq('id', combatantId).single()
  if (fetchError) { console.error('appendMvpRecord fetch', fetchError); return }
  const current = data?.mvp_record || []
  const { error } = await supabase.from('combatants')
    .update({ mvp_record: [...current, entry] }).eq('id', combatantId)
  if (error) console.error('appendMvpRecord update', error)
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

// All distinct tags across published combatants, groups, and arenas.
// Returns [{tag, count}] sorted by frequency desc then alphabetical.
export async function listAllDistinctTags() {
  const cached = getCached('all_distinct_tags')
  if (cached) return cached
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
    const result = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    setCached('all_distinct_tags', result)
    return result
  } catch (e) { console.error('listAllDistinctTags exception', e); return [] }
}
