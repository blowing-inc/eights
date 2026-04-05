export default function DevBanner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-warning)' }}>
      🧪 Dev mode — bot votes don't count toward results
    </div>
  )
}
