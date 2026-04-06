import { useState, useEffect } from 'react'
import RoundChat from '../components/RoundChat.jsx'
import { btn, tab } from '../styles.js'
import { tallyReactions, groupRoomsForHistory, computeSeriesStandings } from '../gameLogic.js'
import { slist } from '../supabase.js'
import { downloadFile, formatRoomAsText, formatSeriesAsText } from '../export.js'

function HistoryRoomDetail({ room, onBack, setViewCombatant, playerId, onNextBattle }) {
  const completedRounds = (room.rounds || []).filter(r => r.winner)
  const allRounds = room.rounds || []
  const players = (room.players || []).filter(p => !p.isBot)
  const allCombatants = Object.values(room.combatants || {}).flat().filter(c => !c.isBot)
  const dateStr = new Date(room.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const [roundIdx, setRoundIdx] = useState(0)
  const [rosterPlayer, setRosterPlayer] = useState(null)

  const totalRounds = room.players?.length > 0
    ? Math.min(...room.players.map(p => (room.combatants?.[p.id] || []).length))
    : 0
  const resolvedRounds = allRounds.filter(rd => rd.winner || rd.draw).length
  const isNaturallyComplete = (room.phase === 'ended' && !room.endedEarly) ||
    (room.phase === 'battle' && totalRounds > 0 && resolvedRounds >= totalRounds)
  const canReopen = playerId && room.host === playerId && isNaturallyComplete && !room.nextRoomId

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

      <div style={{ display: 'flex', gap: 8, marginBottom: canReopen ? '1rem' : '1.5rem' }}>
        <button onClick={() => downloadFile(`eights-${room.code}-${new Date(room.createdAt).toISOString().slice(0,10)}.json`, JSON.stringify(room, null, 2), 'application/json')}
          style={{ ...btn('ghost'), padding: '5px 12px', fontSize: 12 }}>⬇ JSON</button>
        <button onClick={() => downloadFile(`eights-${room.code}-${new Date(room.createdAt).toISOString().slice(0,10)}.txt`, formatRoomAsText(room))}
          style={{ ...btn('ghost'), padding: '5px 12px', fontSize: 12 }}>⬇ Plain text</button>
      </div>

      {canReopen && (
        <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 'var(--border-radius-lg)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-info)', margin: '0 0 10px' }}>You hosted this tournament. Continue the series with the same players.</p>
          <button onClick={() => onNextBattle(room)} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13, color: 'var(--color-text-info)', borderColor: 'var(--color-border-info)' }}>Continue series ⚔️</button>
        </div>
      )}

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
                  {rd.resolvedAt && (() => {
                    const mins = Math.round((rd.resolvedAt - rd.createdAt) / 60000)
                    return mins > 0 ? ` · ${mins}m` : null
                  })()}
                </span>
                {rd.winner
                  ? <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-success)' }}>🏆 {rd.winner.name}</span>
                  : rd.draw
                    ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>🤝 Draw</span>
                    : <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No result recorded</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(rd.combatants || []).map(c => {
                  const isWinner = rd.winner?.id === c.id
                  const isDraw   = !rd.winner && rd.draw
                  const owner = (room.players || []).find(p => p.id === c.ownerId)
                  const voters = Object.entries(rd.picks || {})
                    .filter(([, cid]) => cid === c.id)
                    .map(([pid]) => (room.players || []).find(p => p.id === pid)?.name || '?')
                  const { heart, angry, cry } = tallyReactions(rd.playerReactions, c.id)

                  const cardBg     = isWinner ? 'var(--color-background-success)' : 'var(--color-background-tertiary)'
                  const cardBorder = isWinner ? '0.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-tertiary)'
                  const nameColor  = isWinner ? 'var(--color-text-success)' : 'var(--color-text-primary)'
                  const metaColor  = isWinner ? 'var(--color-text-success)' : 'var(--color-text-tertiary)'
                  const bioColor   = isWinner ? 'var(--color-text-success)' : 'var(--color-text-secondary)'

                  return (
                    <div key={c.id} style={{ padding: '10px 12px', background: cardBg, borderRadius: 'var(--border-radius-md)', border: cardBorder }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: c.bio ? 3 : 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: nameColor }}>
                          {isWinner ? '🏆 ' : isDraw ? '🤝 ' : ''}{c.name}
                        </span>
                        <span style={{ fontSize: 11, color: metaColor, flexShrink: 0, marginLeft: 8 }}>
                          {owner?.name || c.ownerName || '?'}
                        </span>
                      </div>
                      {c.bio && <div style={{ fontSize: 12, color: bioColor, lineHeight: 1.4, marginBottom: 4 }}>{c.bio}</div>}
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

              {rd.evolution && (
                <div style={{ borderTop: '0.5px solid var(--color-border-info)', paddingTop: 12, marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-info)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>⚡ Evolution</div>
                  {(() => {
                    const ev  = rd.evolution
                    const opponents = (rd.combatants || []).filter(c => c.id !== ev.fromId).map(c => c.name)
                    const fightDesc = opponents.length
                      ? `after the fight with ${opponents.join(' and ')}`
                      : 'after this fight'
                    return (
                      <>
                        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '0 0 6px', lineHeight: 1.5 }}>
                          <strong>{ev.fromName}</strong> evolved to <strong>{ev.toName}</strong> {fightDesc}.
                        </p>
                        {ev.toBio && (
                          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4, fontStyle: 'italic' }}>
                            "{ev.toBio}"
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

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
            <button onClick={() => setRosterPlayer(null)} style={tab(rosterPlayer === null)}>All</button>
            {rosterPlayers.map(p => (
              <button key={p.id} onClick={() => setRosterPlayer(p.id)} style={tab(rosterPlayer === p.id)}>{p.name}</button>
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
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.wins}W – {c.losses}L{c.draws > 0 ? ` – ${c.draws}D` : ''}</span>
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
                const isDraw   = !isWin && !isLoss && (c.draws || 0) > 0
                const played   = isWin || isLoss || isDraw
                const bg       = played ? (isWin ? 'var(--color-background-success)' : isLoss ? 'var(--color-background-danger)' : 'var(--color-background-secondary)') : 'var(--color-background-secondary)'
                const border   = `0.5px solid ${played ? (isWin ? 'var(--color-border-success)' : isLoss ? 'var(--color-border-danger)' : 'var(--color-border-tertiary)') : 'var(--color-border-tertiary)'}`
                return (
                  <button key={c.id} onClick={() => setViewCombatant(c)} style={{ textAlign: 'left', padding: '12px 14px', background: bg, border, borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 52 }}>Round {roundNum}</span>
                        <span style={{ fontSize: 15, fontWeight: 500, color: isWin ? 'var(--color-text-success)' : isLoss ? 'var(--color-text-danger)' : 'var(--color-text-primary)' }}>
                          {isWin ? '🏆 ' : isDraw ? '🤝 ' : ''}{c.name}
                        </span>
                      </div>
                      {played && <span style={{ fontSize: 12, fontWeight: 500, color: isWin ? 'var(--color-text-success)' : isLoss ? 'var(--color-text-danger)' : 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>{isWin ? 'W' : isLoss ? 'L' : 'D'}</span>}
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

function RoomRow({ room, onSelect, playerId }) {
  const completedRounds = (room.rounds || []).filter(rd => rd.winner || rd.draw)
  const players = (room.players || []).filter(p => !p.isBot).map(p => p.name)
  const dateStr = new Date(room.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const isHost = playerId && room.host === playerId
  return (
    <button onClick={() => onSelect(room)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', marginBottom: 10, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: 1 }}>{room.code}</span>
          {isHost && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', borderRadius: 99, border: '0.5px solid var(--color-border-tertiary)' }}>host</span>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{dateStr}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        {players.join(', ') || 'Unknown players'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{completedRounds.length} round{completedRounds.length !== 1 ? 's' : ''} played</span>
        {room.seriesIndex && <span style={{ fontSize: 12, color: 'var(--color-text-info)' }}>Game {room.seriesIndex}</span>}
        {room.devMode && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>dev</span>}
      </div>
    </button>
  )
}

function StandingsTable({ rooms }) {
  const rows = computeSeriesStandings(rooms)
  if (rows.length === 0) return null
  return (
    <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Series standings</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>Player</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>W</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>L</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4 }}>G</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId} style={{ borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
              <td style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 8, color: 'var(--color-text-primary)' }}>{r.playerName}</td>
              <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--color-text-success)', fontWeight: 500 }}>{r.wins}</td>
              <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--color-text-tertiary)' }}>{r.losses}</td>
              <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{r.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SeriesRow({ item, onSelect, playerId }) {
  const [expanded, setExpanded] = useState(false)
  const { rooms, seriesId } = item

  const allPlayers = [...new Map(
    rooms.flatMap(r => (r.players || []).filter(p => !p.isBot).map(p => [p.id, p]))
  ).values()]

  const firstDate = new Date(rooms[0].createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const lastDate  = rooms.length > 1
    ? new Date(rooms[rooms.length - 1].createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const totalRounds = rooms.reduce((n, r) => n + (r.rounds || []).filter(rd => rd.winner || rd.draw).length, 0)

  function exportSeries() {
    const sorted = [...rooms].sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0))
    const slug   = seriesId.slice(0, 6).toUpperCase()
    downloadFile(`eights-series-${slug}.txt`, formatSeriesAsText(sorted))
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-info)', borderRadius: expanded ? 'var(--border-radius-lg) var(--border-radius-lg) 0 0' : 'var(--border-radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)', fontWeight: 500 }}>Series</span>
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>{rooms.length} games</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {lastDate ? `${firstDate} – ${lastDate}` : firstDate}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          {allPlayers.map(p => p.name).join(', ') || 'Unknown players'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{totalRounds} rounds total</span>
          <div style={{ flex: 1 }} />
          <button onClick={exportSeries} style={{ ...btn('ghost'), padding: '3px 10px', fontSize: 11 }}>⬇ Export series</button>
          <button onClick={() => setExpanded(e => !e)} style={{ ...btn('ghost'), padding: '3px 10px', fontSize: 11 }}>
            {expanded ? 'Collapse ▲' : 'Expand ▼'}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-info)', borderTop: 'none', borderRadius: '0 0 var(--border-radius-lg) var(--border-radius-lg)', overflow: 'hidden' }}>
          <StandingsTable rooms={rooms} />
          <div style={{ padding: '0 12px 4px' }}>
            {rooms.map(r => <RoomRow key={r.id} room={r} onSelect={onSelect} playerId={playerId} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function HistoryScreen({ onBack, setViewCombatant, playerId, onNextBattle }) {
  const [rooms, setRooms] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    slist().then(all => {
      const valid = all
        .filter(r => {
          if (!r || !r.id || !r.createdAt) return false
          const hasRounds = (r.rounds || []).some(rd => rd.winner || rd.draw)
          const hasCombatants = Object.values(r.combatants || {}).flat().length > 0
          return hasRounds || hasCombatants
        })
        .sort((a, b) => b.createdAt - a.createdAt)
      setRooms(valid)
    })
  }, [])

  if (selected) {
    return <HistoryRoomDetail room={selected} onBack={() => setSelected(null)} setViewCombatant={setViewCombatant} playerId={playerId} onNextBattle={onNextBattle} />
  }

  const items = rooms ? groupRoomsForHistory(rooms) : []

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
      {items.map(item =>
        item.type === 'series'
          ? <SeriesRow key={item.seriesId} item={item} onSelect={setSelected} playerId={playerId} />
          : <RoomRow   key={item.room.id}  room={item.room} onSelect={setSelected} playerId={playerId} />
      )}
    </div>
  )
}
