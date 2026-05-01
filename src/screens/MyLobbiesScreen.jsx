import Screen from '../components/Screen.jsx'
import { btn } from '../styles.js'
import { normalizeRoomSettings } from '../gameLogic.js'

export default function MyLobbiesScreen({ lobbies, playerId, onBack, onEnter, onAcceptInvitation, onDeclineInvitation }) {
  return (
    <Screen title="My open lobbies" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.5rem 0 1.25rem' }}>
        These games are still in progress. Rejoin anytime.
      </p>
      {lobbies.map(r => {
        const isInvite  = !!r.isInvitation
        const host      = r.players.find(p => p.id === r.host)
        const realPlayers = r.players.filter(p => !p.isBot)
        const { rosterSize } = normalizeRoomSettings(r.settings)
        const submitted = realPlayers.filter(p => (r.combatants[p.id] || []).length === rosterSize)
        const isMyTurn  = !isInvite && r.phase === 'draft' && (r.combatants[playerId] || []).length < rosterSize
        const phaseLabel = r.phase === 'lobby' ? 'Waiting to start' : r.phase === 'draft' ? 'Drafting combatants' : r.phase === 'vote' ? 'Voting in progress' : 'Rounds in progress'

        const borderStyle = isInvite
          ? '1.5px solid var(--color-border-warning)'
          : isMyTurn
            ? '1.5px solid var(--color-border-info)'
            : '0.5px solid var(--color-border-tertiary)'

        return (
          <div key={isInvite ? `inv-${r.invitation.id}` : r.id} style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', border: borderStyle, borderRadius: 'var(--border-radius-lg)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: 2, color: 'var(--color-text-primary)' }}>{r.code}</span>
                {isInvite && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-warning)', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', padding: '2px 7px', borderRadius: 99 }}>Invited</span>
                )}
                {!isInvite && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{phaseLabel}</span>}
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Host: {host?.name || '?'}</span>
            </div>

            {isInvite ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
                You've been invited to join this lobby. Accept to enter.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                {realPlayers.map(p => {
                  const ready = (r.combatants[p.id] || []).length === rosterSize
                  const isMe  = p.id === playerId
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ready ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ color: isMe ? 'var(--color-text-info)' : 'var(--color-text-primary)' }}>
                        {p.name}{isMe ? ' (you)' : ''}{p.id === r.host ? ' · host' : ''}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: ready ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
                        {r.phase === 'lobby' ? 'waiting' : r.phase === 'battle' || r.phase === 'vote' ? 'in game' : ready ? 'ready ✓' : 'working…'}
                      </span>
                    </div>
                  )
                })}
                {r.phase === 'draft' && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{submitted.length} / {realPlayers.length} ready</div>}
              </div>
            )}

            {isInvite ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onAcceptInvitation(r, r.invitation)} style={{ ...btn('primary'), flex: 1, padding: '8px 14px', fontSize: 13 }}>
                  Accept →
                </button>
                <button onClick={() => onDeclineInvitation(r.invitation)} style={{ ...btn('ghost'), padding: '8px 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Decline
                </button>
              </div>
            ) : (
              <button onClick={() => onEnter(r)} style={{ ...btn(isMyTurn || r.phase === 'battle' || r.phase === 'vote' ? 'primary' : 'ghost'), padding: '8px 14px', fontSize: 13 }}>
                {isMyTurn ? 'Rejoin — your turn ⚔️' : r.phase === 'battle' || r.phase === 'vote' ? 'Rejoin battle ⚔️' : 'Rejoin'}
              </button>
            )}
          </div>
        )
      })}
    </Screen>
  )
}
