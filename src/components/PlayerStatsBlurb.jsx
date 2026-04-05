export default function PlayerStatsBlurb({ stats, favoriteName }) {
  if (!stats) return <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</span>
  const { games, wins, losses } = stats
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{games} game{games !== 1 ? 's' : ''}</span>
        <span style={{ color: 'var(--color-text-success)' }}>{wins}W</span>
        <span style={{ color: 'var(--color-text-danger)' }}>{losses}L</span>
      </div>
      {favoriteName && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>⭐ {favoriteName}</div>}
    </div>
  )
}
