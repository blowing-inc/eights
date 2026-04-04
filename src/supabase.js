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
      .from('users').select('id, username, needs_reset')
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
    const { error } = await supabase
      .from('users').update({ needs_reset: true, updated_at: new Date().toISOString() })
      .ilike('username', username)
    if (error) console.error('adminResetUser error', error)
  } catch (e) { console.error('adminResetUser exception', e) }
}

// Admin: list all users (no pins)
export async function listUsers() {
  try {
    const { data, error } = await supabase
      .from('users').select('id, username, needs_reset, created_at')
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

// Paginated combatants by owner, published only
export async function getPlayerCombatants({ ownerId, query = '', sort = 'wins', ascending = false, page = 0, pageSize = 20 } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    let q = supabase.from('combatants')
      .select('id, name, bio, wins, losses, reactions_heart, reactions_angry, reactions_cry', { count: 'exact' })
      .eq('owner_id', ownerId).eq('published', true)
    if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
    const { data, error, count } = await q.order(sort, { ascending }).range(from, to)
    if (error) { console.error('getPlayerCombatants error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('getPlayerCombatants exception', e); return { items: [], total: 0 } }
}

// Aggregate stats for a player from all rooms they participated in
export async function getPlayerRoomStats(playerId) {
  try {
    const { data, error } = await supabase.from('rooms').select('data')
    if (error) { console.error('getPlayerRoomStats error', error); return null }
    let games = 0, wins = 0, losses = 0
    ;(data || []).forEach(row => {
      const r = row.data
      if (!r || r.devMode) return
      const participated = (r.players || []).some(p => p.id === playerId && !p.isBot)
      if (!participated) return
      games++
      const myCombatants = (r.combatants?.[playerId] || [])
      myCombatants.forEach(c => { wins += c.wins || 0; losses += c.losses || 0 })
    })
    return { games, wins, losses }
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
export async function incrementCombatantStats(id, { wins = 0, losses = 0, heart = 0, angry = 0, cry = 0 } = {}) {
  try {
    const { error } = await supabase.rpc('increment_combatant_stats', {
      p_id: id, p_wins: wins, p_losses: losses, p_heart: heart, p_angry: angry, p_cry: cry,
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
      .eq('published', true)
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
      .eq('published', true)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) { console.error('getPlayerRecentCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('getPlayerRecentCombatants exception', e); return [] }
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

// Paginated bestiary list — published only
export async function listCombatants({ sort = 'wins', ascending = false, page = 0, pageSize = 20 } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    const { data, error, count } = await supabase
      .from('combatants').select('*', { count: 'exact' })
      .eq('published', true)
      .order(sort, { ascending })
      .range(from, to)
    if (error) { console.error('listCombatants error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('listCombatants exception', e); return { items: [], total: 0 } }
}

// Called once when the last round of a game is confirmed
export async function publishCombatants(ids) {
  if (!ids.length) return
  try {
    const { error } = await supabase
      .from('combatants').update({ published: true, updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) console.error('publishCombatants error', error)
  } catch (e) { console.error('publishCombatants exception', e) }
}
