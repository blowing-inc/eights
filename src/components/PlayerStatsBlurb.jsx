export default function PlayerStatsBlurb({ stats, favoriteName }) {
  if (!stats) return <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</span>
  const { games, wins, losses, trapsSet = 0, trapsTriggered = 0 } = stats
  const trapRate = trapsSet > 0 ? Math.round((trapsTriggered / trapsSet) * 100) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{games} game{games !== 1 ? 's' : ''}</span>
        <span style={{ color: 'var(--color-text-success)' }}>{wins}W</span>
        <span style={{ color: 'var(--color-text-danger)' }}>{losses}L</span>
      </div>
      {trapsSet > 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          🪤 {trapsTriggered}/{trapsSet} trap{trapsSet !== 1 ? 's' : ''} sprung ({trapRate}%)
        </div>
      )}
      {favoriteName && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>⭐ {favoriteName}</div>}
    </div>
  )
}
