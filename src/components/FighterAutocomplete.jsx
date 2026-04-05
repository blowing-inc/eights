import { useState, useEffect } from 'react'
import { inp } from '../styles.js'
import { searchCombatants, getPlayerRecentCombatants } from '../supabase.js'

export default function FighterAutocomplete({ value, onChange, onSelect, placeholder, playerId }) {
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

  const items = value.trim() ? results : recent
  const showHeader = !value.trim() && items.length > 0

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
          {showHeader && <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your recent fighters</div>}
          {items.map(f => (
            <button key={f.id} onMouseDown={() => { onSelect(f); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                {f.wins}W – {f.losses}L · {f.owner_name}{f.bio ? ` · ${f.bio.slice(0, 40)}${f.bio.length > 40 ? '…' : ''}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
