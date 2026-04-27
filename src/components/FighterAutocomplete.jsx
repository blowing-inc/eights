import { useState, useEffect } from 'react'
import { inp } from '../styles.js'
import { searchCombatants, getPlayerRecentCombatants } from '../supabase.js'

const sectionHeader = (extra = {}) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', padding: '5px 12px 4px', fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '0.07em',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  ...extra,
})

export default function FighterAutocomplete({ value, onChange, onSelect, placeholder, playerId, substitutions = {}, pinnedItems = [], stashedItems = [] }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [recent, setRecent] = useState([])
  const [championsOpen, setChampionsOpen] = useState(true)
  const [stashOpen, setStashOpen] = useState(true)

  useEffect(() => {
    if (playerId) getPlayerRecentCombatants(playerId).then(setRecent)
  }, [playerId])

  useEffect(() => {
    if (!value.trim()) { setResults([]); return }
    const t = setTimeout(() => searchCombatants(value).then(setResults), 280)
    return () => clearTimeout(t)
  }, [value])

  // In heritage games, replace superseded originals with their active variant.
  // Deduplicate by id so the variant doesn't appear twice if already in results.
  function resolveItems(list) {
    const seen = new Set()
    const out = []
    for (const f of list) {
      const sub = substitutions[f.id]
      const resolved = sub ? { ...sub, _evolvedFrom: f.name } : f
      if (!seen.has(resolved.id)) { seen.add(resolved.id); out.push(resolved) }
    }
    return out
  }

  const q = value.trim().toLowerCase()

  const filteredPinned = q
    ? pinnedItems.filter(p => p.name.toLowerCase().includes(q))
    : pinnedItems

  const filteredStashed = q
    ? stashedItems.filter(s => s.name.toLowerCase().includes(q))
    : stashedItems

  const dbItems = value.trim() ? results : recent

  // Cross-section deduplication: later sections exclude IDs already shown earlier
  const stashedDeduped = filteredStashed.filter(s => !filteredPinned.some(p => p.id === s.id))
  const dbDeduped = dbItems.filter(d =>
    !filteredPinned.some(p => p.id === d.id) &&
    !filteredStashed.some(s => s.id === d.id)
  )

  const resolvedPinned  = resolveItems(filteredPinned)
  const resolvedStashed = resolveItems(stashedDeduped)
  const resolvedDb      = resolveItems(dbDeduped)

  const hasAny = resolvedPinned.length > 0 || resolvedStashed.length > 0 || resolvedDb.length > 0

  function renderItem(f, { isPinned = false, isStashed = false } = {}) {
    return (
      <button key={f.id} onMouseDown={() => { onSelect(f); setOpen(false) }}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
          background: isPinned ? 'var(--color-background-success)' : isStashed ? 'var(--color-background-tertiary)' : 'transparent',
          border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: isPinned ? 'var(--color-text-success)' : 'var(--color-text-primary)' }}>
            {f.name}
          </span>
          {isStashed && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
              🔒 stashed
            </span>
          )}
        </div>
        {f._evolvedFrom && (
          <div style={{ fontSize: 10, color: 'var(--color-text-info)', marginTop: 1 }}>↗ evolved from {f._evolvedFrom}</div>
        )}
        <div style={{ fontSize: 11, color: isPinned ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', marginTop: 1 }}>
          {f.wins}W – {f.losses}L · {f.owner_name || ''}{f.bio ? ` · ${f.bio.slice(0, 40)}${f.bio.length > 40 ? '…' : ''}` : ''}
        </div>
      </button>
    )
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        style={{ ...inp(), margin: 0, width: '100%' }}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
      />
      {open && hasAny && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 'var(--border-radius-md)', zIndex: 200, overflow: 'hidden',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>

          {/* Champions section — collapsible */}
          {resolvedPinned.length > 0 && (
            <>
              <button
                onMouseDown={e => { e.preventDefault(); setChampionsOpen(v => !v) }}
                style={sectionHeader({ color: 'var(--color-text-success)' })}
              >
                <span>🏆 Champions from last game</span>
                <span>{championsOpen ? '▾' : '▸'}</span>
              </button>
              {championsOpen && resolvedPinned.map(f => renderItem(f, { isPinned: true }))}
            </>
          )}

          {/* Stash section — collapsible with count */}
          {resolvedStashed.length > 0 && (
            <>
              <button
                onMouseDown={e => { e.preventDefault(); setStashOpen(v => !v) }}
                style={sectionHeader({
                  color: 'var(--color-text-tertiary)',
                  borderTop: resolvedPinned.length > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                })}
              >
                <span>🔒 Your stash ({resolvedStashed.length})</span>
                <span>{stashOpen ? '▾' : '▸'}</span>
              </button>
              {stashOpen && resolvedStashed.map(f => renderItem(f, { isStashed: true }))}
            </>
          )}

          {/* Recent fighters / search results — not collapsible */}
          {resolvedDb.length > 0 && (
            <>
              {!value.trim() && (
                <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderTop: (resolvedPinned.length > 0 || resolvedStashed.length > 0) ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                  Your recent fighters
                </div>
              )}
              {resolvedDb.map(f => renderItem(f))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
