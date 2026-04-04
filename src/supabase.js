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

// Fetch all rooms ordered by most recently updated
export async function slist() {
  try {
    const { data, error } = await supabase.from('rooms').select('data, updated_at').order('updated_at', { ascending: false })
    if (error) { console.error('slist error', error); return [] }
    return (data || []).map(row => row.data).filter(Boolean)
  } catch (e) { console.error('slist exception', e); return [] }
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

// Name search for DraftScreen autocomplete
export async function searchCombatants(query, limit = 8) {
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, bio, wins, losses, owner_name')
      .ilike('name', `%${query}%`)
      .order('wins', { ascending: false })
      .limit(limit)
    if (error) { console.error('searchCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('searchCombatants exception', e); return [] }
}

// Player's recent fighters — shown on autocomplete focus
export async function getPlayerRecentCombatants(ownerId, limit = 8) {
  try {
    const { data, error } = await supabase
      .from('combatants').select('id, name, bio, wins, losses, owner_name')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) { console.error('getPlayerRecentCombatants error', error); return [] }
    return data || []
  } catch (e) { console.error('getPlayerRecentCombatants exception', e); return [] }
}

// Paginated bestiary list
export async function listCombatants({ sort = 'wins', ascending = false, page = 0, pageSize = 20 } = {}) {
  try {
    const from = page * pageSize
    const to   = from + pageSize - 1
    const { data, error, count } = await supabase
      .from('combatants').select('*', { count: 'exact' })
      .order(sort, { ascending })
      .range(from, to)
    if (error) { console.error('listCombatants error', error); return { items: [], total: 0 } }
    return { items: data || [], total: count || 0 }
  } catch (e) { console.error('listCombatants exception', e); return { items: [], total: 0 } }
}
