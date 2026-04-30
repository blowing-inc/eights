import { useState } from 'react'
import { btn } from '../styles.js'

// Full-screen overlay showing a read-only summary of a completed or in-progress game.
// Props:
//   room         — full room data object (from sget)
//   initialRound — 1-based round number to open to (e.g. the round where an evolution happened)
//   onClose      — called when the user dismisses the screen
//
// NOTE: The round display logic here (RoundCard) is partially duplicated with ChroniclesRoomDetail
// in ChroniclesScreen.jsx. If you're updating either, consider extracting a shared component.
export default function GameSummaryScreen({ room, initialRound = 1, onClose }) {
  const rounds     = room.rounds || []
  const players    = (room.players || []).filter(p => !p.isBot)
  const playerById = Object.fromEntries((room.players || []).map(p => [p.id, p]))

  // Clamp initialRound to available rounds (may open before all rounds are recorded)
  const startIdx   = Math.max(0, Math.min(initialRound - 1, rounds.length - 1))
  const [idx, setIdx] = useState(startIdx < 0 ? 0 : startIdx)

  const round      = rounds[idx]
  const totalRounds = rounds.length

  const date = room.createdAt
    ? new Date(room.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-background-primary)', zIndex: 100, overflowY: 'auto' }}>
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onClose} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Back</button>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>{room.code}</h2>
              {date && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{date}</div>}
            </div>
          </div>
          <div style={{ fontSize: 12, padding: '3px 8px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99, color: room.phase === 'ended' ? 'var(--color-text-tertiary)' : 'var(--color-text-success)' }}>
            {room.phase === 'ended' ? 'Ended' : 'In progress'}
          </div>
        </div>

        {/* ── Players ────────────────────────────────────────────────────── */}
        {players.length > 0 && (
          <div style={{ marginBottom: '1.25rem', padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Players</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {players.map(p => (
                <span key={p.id} style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{p.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Round navigator ────────────────────────────────────────────── */}
        {totalRounds === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: '3rem' }}>No rounds recorded yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <button
                onClick={() => setIdx(i => i - 1)}
                disabled={idx === 0}
                style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 14, opacity: idx === 0 ? 0.35 : 1 }}
              >← Prev</button>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                Round {round?.number ?? idx + 1} of {totalRounds}
              </span>
              <button
                onClick={() => setIdx(i => i + 1)}
                disabled={idx === totalRounds - 1}
                style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 14, opacity: idx === totalRounds - 1 ? 0.35 : 1 }}
              >Next →</button>
            </div>

            {round && <RoundCard round={round} playerById={playerById} />}
          </>
        )}
      </div>
    </div>
  )
}

// Renders a single round: matchup, result, vote breakdown, evolution note.
function RoundCard({ round, playerById }) {
  const combatants  = round.combatants || []
  const winner      = round.winner     || null   // combatant object
  const isDraw      = !!round.draw
  const drawIds     = round.draw === true ? null : round.draw?.combatantIds ?? null
  const picks       = round.picks      || {}     // { [playerId]: combatantId }
  const evolution   = round.evolution  || null
  const merge       = round.merge      || null

  // Group votes by combatant voted for
  const votesByCombatant = {}
  combatants.forEach(c => { votesByCombatant[c.id] = [] })
  Object.entries(picks).forEach(([playerId, combatantId]) => {
    const player = playerById[playerId]
    if (!player || player.isBot) return
    if (!votesByCombatant[combatantId]) votesByCombatant[combatantId] = []
    votesByCombatant[combatantId].push(player.name)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Matchup */}
      <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Matchup</div>
        {combatants.map((c, i) => {
          const isWinner        = winner && winner.id === c.id
          const isCombatantDraw = isDraw && (drawIds === null || drawIds.includes(c.id))
          const isLoser         = !isWinner && !isCombatantDraw && (!!winner || isDraw)
          return (
            <div key={c.id}>
              {i > 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '4px 0' }}>vs</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: isWinner ? 500 : 400, color: isLoser ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
                    {c.name}
                  </div>
                  {c.ownerName && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{c.ownerName}</div>
                  )}
                </div>
                {isWinner && (
                  <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--color-background-success)', color: 'var(--color-text-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 99 }}>
                    Winner
                  </span>
                )}
                {isCombatantDraw && (
                  <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99 }}>
                    Draw
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Arena context */}
      {round.arena && (
        <div style={{ padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Arena</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{round.arena.name}</div>
          {round.arena.description && (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', lineHeight: 1.5 }}>{round.arena.description}</p>
          )}
          {round.arena.houseRules && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0', fontStyle: 'italic' }}>Rules: {round.arena.houseRules}</p>
          )}
        </div>
      )}

      {/* Vote breakdown — only show if there are any picks */}
      {Object.values(picks).length > 0 && (
        <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Votes</div>
          {combatants.map(c => {
            const voters = votesByCombatant[c.id] || []
            if (voters.length === 0) return null
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 0, flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>←</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{voters.join(', ')}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Evolution note */}
      {evolution && (
        <div style={{ padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
              {evolution.fromName} → {evolution.toName}
            </div>
            {evolution.ownerName && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>by {evolution.ownerName}</div>
            )}
          </div>
        </div>
      )}

      {/* Merge note */}
      {merge && (
        <div style={{ padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-info)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
              {(merge.fromNames || []).join(' + ')} → {merge.toName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
              {(merge.fromNames || []).join(' + ')} merged into {merge.toName} after drawing with each other.
            </div>
            {merge.mergeNote && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                "{merge.mergeNote}"
              </div>
            )}
            {merge.primaryOwnerName && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                by {[merge.primaryOwnerName, ...(merge.coOwnerNames || [])].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
