import { btn } from '../styles.js'

export default function Screen({ title, onBack, children }) {
  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {onBack && <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13, marginBottom: '1rem' }}>← Back</button>}
      <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 1.5rem', color: 'var(--color-text-primary)' }}>{title}</h2>
      {children}
    </div>
  )
}
