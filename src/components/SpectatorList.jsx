import { useState, useEffect, useRef } from 'react'

export default function SpectatorList({ spectators = [] }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function outside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('touchstart', outside) }
  }, [open])

  if (!spectators.length) return null

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99, cursor: 'pointer', fontSize: 12, color: 'var(--color-text-tertiary)' }}
      >
        <span>👁</span>
        <span>{spectators.length}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500, minWidth: 160, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.18)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>Watching</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {spectators.map(s => (
              <div key={s.id} style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>👁 {s.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
