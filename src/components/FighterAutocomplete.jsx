import { useState, useEffect } from 'react'
import { inp } from '../styles.js'
import { searchCombatants, getPlayerRecentCombatants } from '../supabase.js'

export default function FighterAutocomplete({ value, onChange, onSelect, placeholder, playerId, substitutions = {}, pinnedItems = [], stashedItems = [] }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [recent, setRecent] = useState([])

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
      const resolved = sub ? { ...sub, _evolvedFrom: f.name, _isStashed: f._isStashed } : f
      if (!seen.has(resolved.id)) { seen.add(resolved.id); out.push(resolved) }
    }
    return out
  }

  // Mark stashed items so they survive resolveItems and can be styled distinctly
  const markedStashed = stashedItems.map(s => ({ ...s, _isStashed: true }))

  const filteredPinned = value.trim()
    ? pinnedItems.filter(p => p.name.toLowerCase().includes(value.trim().toLowerCase()))
    : pinnedItems

  const filteredStashed = value.trim()
    ? markedStashed.filter(s => s.name.toLowerCase().includes(value.trim().toLowerCase()))
    : markedStashed

  const dbItems = value.trim() ? results : recent

  // Build the item list in section order: champions → stash → recent/search
  // Each later section deduplicates against all earlier ones.
  const stashedDeduped = filteredStashed.filter(s => !filteredPinned.some(p => p.id === s.id))
  const rawItems = [
    ...filteredPinned,
    ...stashedDeduped,
    ...dbItems.filter(d => !filteredPinned.some(p => p.id === d.id) && !stashedDeduped.some(s => s.id === d.id)),
  ]
  const items = resolveItems(rawItems)

  const showPinnedHeader  = !value.trim() && filteredPinned.length > 0
  const showStashedHeader = !value.trim() && stashedDeduped.length > 0
  const showRecentHeader  = !value.trim() && dbItems.length > 0

  // Section boundary indices (used to place section headers)
  const stashedStart = filteredPinned.length
  const recentStart  = stashedStart + stashedDeduped.length

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
      {open && items.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', zIndex: 200, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          {showPinnedHeader && <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--color-text-success)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🏆 Champions from last game</div>}
          {items.map((f, idx) => {
            const isPinned  = filteredPinned.some(p => p.id === f.id)
            const isStashed = !!f._isStashed
            const isFirstStashed = showStashedHeader && idx === stashedStart
            const isFirstRecent  = showRecentHeader  && idx === recentStart
            return (
              <div key={f.id}>
                {isFirstStashed && (
                  <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', borderTop: filteredPinned.length > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                    🔒 Your stash
                  </div>
                )}
                {isFirstRecent && (
                  <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', borderTop: (filteredPinned.length > 0 || stashedDeduped.length > 0) ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                    Your recent fighters
                  </div>
                )}
                <button onMouseDown={() => { onSelect(f); setOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: isPinned ? 'var(--color-background-success)' : isStashed ? 'var(--color-background-tertiary)' : 'transparent', border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: isPinned ? 'var(--color-text-success)' : 'var(--color-text-primary)' }}>{f.name}</span>
                    {isStashed && !isPinned && (
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
