import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '⚠️  Missing Supabase env vars. Copy .env.example to .env and fill in your project credentials.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Storage adapter ──────────────────────────────────────────────────────────
// Mirrors the window.storage API used in the original artifact so the rest of
// the app doesn't need to change. Rooms are stored as a single JSON blob in the
// `rooms` table: { id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ }

export async function sget(key) {
  try {
    // key format is "room:XXXX" — strip the prefix for the table id
    const id = key.replace(/^room:/, '')
    const { data, error } = await supabase
      .from('rooms')
      .select('data')
      .eq('id', id)
      .maybeSingle()
    if (error) { console.error('sget error', error); return null }
    return data?.data ?? null
  } catch (e) {
    console.error('sget exception', e)
    return null
  }
}

export async function sset(key, val) {
  try {
    const id = key.replace(/^room:/, '')
    const { error } = await supabase
      .from('rooms')
      .upsert({ id, data: val, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) console.error('sset error', error)
  } catch (e) {
    console.error('sset exception', e)
  }
}
