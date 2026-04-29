import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp } from '../styles.js'
import { mergeTagsGlobal } from '../supabase.js'

// ─── Tag Merge ────────────────────────────────────────────────────────────────

function TagMergeSection() {
  const [oldTag,  setOldTag]  = useState('')
  const [newTag,  setNewTag]  = useState('')
  const [merging, setMerging] = useState(false)
  const [result,  setResult]  = useState(null) // { count } | null

  async function doMerge() {
    const from = oldTag.trim().toLowerCase()
    const into = newTag.trim().toLowerCase()
    if (!from || !into || from === into) return
    setMerging(true); setResult(null)
    const count = await mergeTagsGlobal(from, into)
    setResult({ count, from, into })
    setMerging(false)
    if (count > 0) { setOldTag(''); setNewTag('') }
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Merge Tags
      </h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Replaces a tag with another across all combatants, arenas, and groups.
        Use this to consolidate typos or duplicates (e.g. "spoooky" → "spooky").
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          style={{ ...inp(), margin: 0, flex: 1, minWidth: 120, fontSize: 14 }}
          placeholder="Old tag (e.g. spoooky)"
          value={oldTag}
          onChange={e => setOldTag(e.target.value)}
        />
        <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)', paddingTop: 10 }}>→</span>
        <input
          style={{ ...inp(), margin: 0, flex: 1, minWidth: 120, fontSize: 14 }}
          placeholder="New tag (e.g. spooky)"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
        />
      </div>
      <button
        onClick={doMerge}
        disabled={merging || !oldTag.trim() || !newTag.trim() || oldTag.trim() === newTag.trim()}
        style={{ ...btn('primary'), width: 'auto', padding: '7px 18px', fontSize: 13 }}
      >
        {merging ? 'Merging…' : 'Merge'}
      </button>
      {result && (
        <p style={{ fontSize: 13, marginTop: 10, color: result.count > 0 ? 'var(--color-text-success)' : 'var(--color-text-secondary)' }}>
          {result.count > 0
            ? `Merged "${result.from}" → "${result.into}" across ${result.count} record${result.count === 1 ? '' : 's'}.`
            : `No records found with tag "${result.from}".`}
        </p>
      )}
    </div>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SuperHostScreen({ currentUser, onBack }) {
  return (
    <Screen title="Super Host Tools" onBack={onBack}>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '-0.5rem 0 1.5rem' }}>
        Logged in as {currentUser?.username}. These tools apply globally across all published records.
      </p>
      <TagMergeSection />
    </Screen>
  )
}
