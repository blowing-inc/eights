import { useState, useEffect } from 'react'
import DevBanner from '../components/DevBanner.jsx'
import SpectatorList from '../components/SpectatorList.jsx'
import { btn } from '../styles.js'
import { sget, sset, subscribeToRoom } from '../supabase.js'
import { normalizeRoomSettings, toggleReaction, tallyReactions } from '../gameLogic.js'

export default function SpectateScreen({ room: init, playerId, setRoom, onHome }) {
  const [room, setLocal] = useState(init)

  useEffect(() => {
    return subscribeToRoom(room.id, r => { setLocal(r); setRoom(r) })
  }, [room.id])

  const spectators   = room.spectators || []
  const round        = room.currentRound > 0 ? room.rounds[room.currentRound - 1] : null
  const inVote       = room.phase === 'voting' || room.phase === 'vote'
  const realPlayers  = room.players.filter(p => !p.isBot)

  // ── Reactions (spectators can react the same way players do) ─────────────────
  async function castReaction(combatantId, emoji) {
    if (!inVote || !round) return
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    rd.playerReactions = toggleReaction(rd.playerReactions, playerId, combatantId, emoji)
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  // ── Phase views ───────────────────────────────────────────────────────────────

  function Header({ title, right }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {right}
          <SpectatorList spectators={spectators} />
          <button onClick={onHome} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Home</button>
        </div>
      </div>
    )
  }

  // Lobby / waiting
  if (room.phase === 'lobby') {
    return (
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
        <Header title={`Room ${room.code}`} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.25rem' }}>Waiting for the host to start the game.</p>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Players</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {realPlayers.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
              <span style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{p.name}</span>
              {p.id === room.host && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-tertiary)', padding: '2px 6px', borderRadius: 99 }}>host</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Draft
  if (room.phase === 'draft') {
    const { rosterSize } = normalizeRoomSettings(room.settings)
    const readyCount = realPlayers.filter(p => (room.combatants[p.id] || []).length === rosterSize).length
    return (
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
        <Header title="Drafting" />
        {room.devMode && <DevBanner />}
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.25rem' }}>Players are selecting their combatants. Sit tight.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {realPlayers.map(p => {
            const ready = (room.combatants[p.id] || []).length === rosterSize
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ready ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{p.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: ready ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
                  {ready ? 'ready ✓' : 'drafting…'}
                </span>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 12 }}>{readyCount} / {realPlayers.length} ready</p>
      </div>
    )
  }

  // Battle (between rounds)
  if (room.phase === 'battle') {
    const completedRounds = room.rounds.filter(r => r.winner)
    const totalRounds = Math.min(...room.players.map(p => (room.combatants[p.id] || []).length))
    const isComplete = completedRounds.length >= totalRounds && totalRounds > 0

    return (
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
        {room.devMode && <DevBanner />}
        <Header title="Battle arena" />
        {completedRounds.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Waiting for the first round to begin…</p>
        )}
        {completedRounds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.5rem' }}>
            {room.rounds.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 52 }}>Round {r.number}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>{r.combatants.map(c => c.name).join(' vs ')}</span>
                {r.winner
                  ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-success)', flexShrink: 0 }}>🏆 {r.winner.name}</span>
                  : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>deliberating…</span>}
              </div>
            ))}
          </div>
        )}
        {isComplete && (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>Tournament complete!</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>Waiting to see if the host starts another battle…</p>
          </div>
        )}
      </div>
    )
  }

  // Vote / deliberation — full reaction UI
  if (inVote && round) {
    const anonymous   = room.settings?.anonymousCombatants || false
    const blindVoting = room.settings?.blindVoting || false
    const picks       = round.picks || {}
    const allVoted    = realPlayers.every(p => picks[p.id])
    const showPickers = !blindVoting || allVoted

    // Detect trap
    const trapAnnouncement = (() => {
      for (const c of round.combatants) {
        if (!c.trapTarget) continue
        const target = round.combatants.find(other => other.id === c.trapTarget.targetId)
        if (!target) continue
        const trapperOwner = room.players.find(p => p.id === c.ownerId)
        const targetOwner  = room.players.find(p => p.id === target.ownerId)
        return {
          trapperPlayer: trapperOwner?.name || c.ownerName || '?',
          trapperCombatant: c.name,
          targetPlayer: targetOwner?.name || c.trapTarget.targetOwnerName || '?',
          targetCombatant: target.name,
        }
      }
      return null
    })()

    return (
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
        {room.devMode && <DevBanner />}
        <Header title={`Round ${round.number}`} />

        {trapAnnouncement && (
          <div style={{ marginBottom: '1.5rem', padding: '16px 18px', background: 'var(--color-background-danger)', border: '1.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-lg)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🪤</div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-danger)', marginBottom: 8 }}>Trap sprung</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>
              {anonymous ? (
                <><span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.trapperCombatant}</span>{' '}has set a trap for{' '}<span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.targetCombatant}</span></>
              ) : (
                <>{trapAnnouncement.trapperPlayer}'s <span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.trapperCombatant}</span>{' '}has trapped{' '}{trapAnnouncement.targetPlayer}'s <span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.targetCombatant}</span></>
              )}
            </div>
          </div>
        )}

        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.5rem' }}>Deliberation in progress. React while you wait.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {round.combatants.map(c => {
            const owner = room.players.find(p => p.id === c.ownerId)
            const pr = round.playerReactions || {}
            const myReaction = (pr[playerId] || {})[c.id]
            const { heart, angry, cry } = tallyReactions(pr, c.id)

            const voters = realPlayers.filter(p => picks[p.id] === c.id).map(p => p.name)

            return (
              <div key={c.id} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 3 }}>{c.name}</div>
                  {c.bio && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 5 }}>{c.bio}</div>}
                  {!anonymous && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>by {owner?.name || c.ownerName}</div>}
                </div>

                {showPickers && voters.length > 0 && (
                  <div style={{ padding: '4px 16px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {voters.map(name => (
                      <span key={name} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)' }}>{name}</span>
                    ))}
                  </div>
                )}
                {blindVoting && !allVoted && (
                  <div style={{ padding: '4px 16px 8px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Votes hidden until everyone picks</span>
                  </div>
                )}

                <div style={{ padding: '6px 12px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 6 }}>
                  {[['heart','❤️',heart],['angry','😡',angry],['cry','😂',cry]].map(([key,icon,count]) => (
                    <button key={key} onClick={() => castReaction(c.id, key)}
                      style={{ background: myReaction === key ? 'var(--color-background-info)' : 'var(--color-background-tertiary)', border: myReaction === key ? '1px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 99, padding: '7px 12px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {icon}{count > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{count}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {round.winner && (
          <div style={{ marginTop: '1.5rem', padding: '14px 16px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-lg)', textAlign: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-success)' }}>🏆 {round.winner.name} wins Round {round.number}</span>
          </div>
        )}
      </div>
    )
  }

  return null
}
