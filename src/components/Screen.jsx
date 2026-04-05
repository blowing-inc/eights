import { btn } from '../styles.js'

export default function Screen({ title, onBack, right, children }) {
  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Back</button>}
          <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>{title}</h2>
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
      {children}
    </div>
  )
}
