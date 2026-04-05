export default function PinKeypad({ pin, onChange }) {
  const rows = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]
  function press(key) {
    if (key === '⌫') { onChange(pin.slice(0, -1)); return }
    if (key === '' || pin.length >= 5) return
    onChange(pin + key)
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28 }}>
        {Array(5).fill(0).map((_, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? 'var(--color-text-primary)' : 'transparent', border: '2px solid var(--color-border-secondary)', transition: 'background 0.1s' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 240, margin: '0 auto' }}>
        {rows.flat().map((key, i) => (
          <button key={i} onClick={() => press(key)} disabled={key === ''}
            style={{ padding: '18px 0', fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-sans)', background: key === '' ? 'transparent' : 'var(--color-background-secondary)', border: key === '' ? 'none' : '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', cursor: key === '' ? 'default' : 'pointer', color: 'var(--color-text-primary)' }}>
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}
