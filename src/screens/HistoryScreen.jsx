import { useState, useEffect } from 'react'
import RoundChat from '../components/RoundChat.jsx'
import { btn } from '../styles.js'
import { slist } from '../supabase.js'
import { downloadFile, formatRoomAsText } from '../export.js'

function HistoryRoomDetail({ room, onBack, setViewCombatant }) {
  const completedRounds = (room.rounds || []).filter(r => r.winner)
  const allRounds = room.rounds || []
  const players = (room.players || []).filter(p => !p.isBot)
  const allCombatants = Object.values(room.combatants || {}).flat().filter(c => !c.isBot)
  const dateStr = new Date(room.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const [roundIdx, setRoundIdx] = useState(0)
  const [rosterPlayer, setRosterPlayer] = useState(null)

  const rd = allRounds[roundIdx]
  const rosterPlayers = (room.players || []).filter(p => !p.isBot && (room.combatants?.[p.id] || []).length > 0)

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem' }}>
        <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>Room {room.code}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>{dateStr} · {players.map(p => p.name).join(', ')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <button onClick={() => downloadFile(`eights-${room.code}-${new Date(room.createdAt).toISOString().slice(0,10)}.json`, JSON.stringify(room, null, 2), 'application/json')}
          style={{ ...btn('ghost'), padding: '5px 12px', fontSize: 12 }}>⬇ JSON</button>
        <button onClick={() => downloadFile(`eights-${room.code}-${new Date(room.createdAt).toISOString().slice(0,10)}.txt`, formatRoomAsText(room))}
          style={{ ...btn('ghost'), padding: '5px 12px', fontSize: 12 }}>⬇ Plain text</button>
      </div>

      {completedRounds.length > 0 && (
        <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {completedRounds.map(r => (
              <button key={r.id} onClick={() => setRoundIdx(allRounds.indexOf(r))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 56 }}>Round {r.number}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: 'var(--color-text-success)', fontWeight: 500 }}>🏆 {r.winner.name}</span>
                  {r.evolution && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-info)', whiteSpace: 'nowrap' }}>
                      → {r.evolution.toName}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                  by {(room.players || []).find(p => p.id === r.winner.ownerId)?.name || r.winner.ownerName || '?'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {allRounds.length === 0
        ? <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: '1.5rem' }}>No rounds were played.</p>
        : (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button onClick={() => setRoundIdx(i => i - 1)} disabled={roundIdx === 0}
                style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 16, width: 'auto' }}>←</button>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Round {rd.number} <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>/ {allRounds.length}</span>
              </span>
              <button onClick={() => setRoundIdx(i => i + 1)} disabled={roundIdx === allRounds.length - 1}
                style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 16, width: 'auto' }}>→</button>
            </div>

            <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  {new Date(rd.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                {rd.winner ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-success)' }}>🏆 {rd.winner.name}</span>
                    {rd.evolution && (
                      <span style={{ fontSize: 11, padding: '1px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99 }}>
                        ⚡ → {rd.evolution.toName}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No result recorded</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(rd.combatants || []).map(c => {
                  const isWinner = rd.winner?.id === c.id
                  const owner = (room.players || []).find(p => p.id === c.ownerId)
                  const voters = Object.entries(rd.picks || {})
                    .filter(([, cid]) => cid === c.id)
                    .map(([pid]) => (room.players || []).find(p => p.id === pid)?.name || '?')
                  const pr = rd.playerReactions || {}
                  const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
                  const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
                  const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length

                  return (
                    <div key={c.id} style={{ padding: '10px 12px', background: isWinner ? 'var(--color-background-success)' : 'var(--color-background-tertiary)', borderRadius: 'var(--border-radius-md)', border: isWinner ? '0.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-tertiary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: c.bio ? 3 : 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: isWinner ? 'var(--color-text-success)' : 'var(--color-text-primary)' }}>
                          {isWinner ? '🏆 ' : ''}{c.name}
                        </span>
                        <span style={{ fontSize: 11, color: isWinner ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 8 }}>
                          {owner?.name || c.ownerName || '?'}
                        </span>
                      </div>
                      {c.bio && <div style={{ fontSize: 12, color: isWinner ? 'var(--color-text-success)' : 'var(--color-text-secondary)', lineHeight: 1.4, marginBottom: 4 }}>{c.bio}</div>}
                      {voters.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                          {voters.map(name => (
                            <span key={name} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)' }}>{name}</span>
                          ))}
                        </div>
                      )}
                      {(heart > 0 || angry > 0 || cry > 0) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                          {heart > 0 && <span>❤️ {heart}</span>}
                          {angry > 0 && <span>😡 {angry}</span>}
                          {cry   > 0 && <span>😂 {cry}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {(rd.chat || []).length > 0 && (
                <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Chat</div>
                  <RoundChat messages={rd.chat} />
                </div>
              )}
            </div>
          </div>
        )}

      {allCombatants.length > 0 && <>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Combatant roster</h3>

        {rosterPlayers.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setRosterPlayer(null)}
              style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, background: rosterPlayer === null ? 'var(--color-background-info)' : 'transparent', color: rosterPlayer === null ? 'var(--color-text-info)' : 'var(--color-text-secondary)', borderColor: rosterPlayer === null ? 'var(--color-border-info)' : 'var(--color-border-tertiary)' }}>
              All
            </button>
            {rosterPlayers.map(p => (
              <button key={p.id} onClick={() => setRosterPlayer(p.id)}
                style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, background: rosterPlayer === p.id ? 'var(--color-background-info)' : 'transparent', color: rosterPlayer === p.id ? 'var(--color-text-info)' : 'var(--color-text-secondary)', borderColor: rosterPlayer === p.id ? 'var(--color-border-info)' : 'var(--color-border-tertiary)' }}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rosterPlayer === null
            ? allCombatants.sort((a, b) => b.wins - a.wins).map(c => {
                const owner = (room.players || []).find(p => p.id === c.ownerId)
                return (
                  <button key={c.id} onClick={() => setViewCombatant(c)} style={{ textAlign: 'left', padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.wins}W – {c.losses}L</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>by {owner?.name || c.ownerName}</div>
                  </button>
                )
              })
            : (room.combatants?.[rosterPlayer] || []).map((c, i) => {
                const roundNum = i + 1
                const battle   = (c.battles || [])[0]
                const isWin    = c.wins > 0
                const isLoss   = c.losses > 0
                const played   = isWin || isLoss
                return (
                  <button key={c.id} onClick={() => setViewCombatant(c)} style={{ textAlign: 'left', padding: '12px 14px', background: played ? (isWin ? 'var(--color-background-success)' : 'var(--color-background-danger)') : 'var(--color-background-secondary)', border: `0.5px solid ${played ? (isWin ? 'var(--color-border-success)' : 'var(--color-border-danger)') : 'var(--color-border-tertiary)'}`, borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 52 }}>Round {roundNum}</span>
                        <span style={{ fontSize: 15, fontWeight: 500, color: isWin ? 'var(--color-text-success)' : isLoss ? 'var(--color-text-danger)' : 'var(--color-text-primary)' }}>
                          {isWin ? '🏆 ' : ''}{c.name}
                        </span>
                      </div>
                      {played && <span style={{ fontSize: 12, fontWeight: 500, color: isWin ? 'var(--color-text-success)' : 'var(--color-text-danger)', flexShrink: 0, marginLeft: 8 }}>{isWin ? 'W' : 'L'}</span>}
                    </div>
                    {battle?.opponent && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 3, paddingLeft: 60 }}>vs {battle.opponent}</div>}
                    {c.bio && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, paddingLeft: 60 }}>{c.bio}</div>}
                  </button>
                )
              })
          }
        </div>
      </>}
    </div>
  )
}

export default function HistoryScreen({ onBack, setViewCombatant }) {
  const [rooms, setRooms] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    slist().then(all => {
      const valid = all.filter(r => r && r.id && r.createdAt).sort((a, b) => b.createdAt - a.createdAt)
      setRooms(valid)
    })
  }, [])

  if (selected) {
    return <HistoryRoomDetail room={selected} onBack={() => setSelected(null)} setViewCombatant={setViewCombatant} />
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Back</button>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Battle history</h2>
      </div>

      {rooms === null && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {rooms !== null && rooms.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No games found. Play a session first!</p>
      )}
      {rooms !== null && rooms.map(r => {
        const completedRounds = (r.rounds || []).filter(rd => rd.winner)
        const players = (r.players || []).filter(p => !p.isBot).map(p => p.name)
        const dateStr = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        return (
          <button key={r.id} onClick={() => setSelected(r)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: 1 }}>{r.code}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{dateStr}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {players.join(', ') || 'Unknown players'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{completedRounds.length} round{completedRounds.length !== 1 ? 's' : ''} played</span>
              {r.devMode && <span style={{ fontSize: 11, padding: '1px 6px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>dev</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
