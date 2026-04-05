import { useState, useEffect, useRef } from 'react'
import { getCombatant } from '../supabase.js'

// Tap/click the 📊 button to open a stats card. Works on desktop and mobile.
export default function CombatantStatsPill({ globalId, label, pillStyle }) {
  const [open, setOpen]   = useState(false)
  const [stats, setStats] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function outside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('touchstart', outside) }
  }, [open])

  function toggle() {
    if (!open && !stats && globalId) getCombatant(globalId).then(setStats)
    setOpen(o => !o)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 99, whiteSpace: 'nowrap', ...pillStyle }}>{label}</span>
      <button onClick={toggle} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, padding: '4px', color: 'var(--color-text-secondary)', lineHeight: 1, flexShrink: 0 }} title="View stats">📊</button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 400, minWidth: 180, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', boxShadow: '0 6px 24px rgba(0,0,0,0.22)' }}>
          {!stats && <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</span>}
          {stats && <>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6 }}>{stats.name}</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 5 }}>
              <span style={{ color: 'var(--color-text-success)' }}>{stats.wins || 0}W</span>
              <span style={{ color: 'var(--color-text-danger)' }}>{stats.losses || 0}L</span>
            </div>
            {(stats.reactions_heart > 0 || stats.reactions_angry > 0 || stats.reactions_cry > 0) && (
              <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                {stats.reactions_heart > 0 && <span>❤️ {stats.reactions_heart}</span>}
                {stats.reactions_angry > 0 && <span>😡 {stats.reactions_angry}</span>}
                {stats.reactions_cry   > 0 && <span>😂 {stats.reactions_cry}</span>}
              </div>
            )}
            {stats.bio && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.4 }}>{stats.bio.length > 60 ? stats.bio.slice(0, 60) + '…' : stats.bio}</p>}
          </>}
        </div>
      )}
    </div>
  )
}
