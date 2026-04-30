import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { sget, sset, getPublicLobbies } from '../supabase.js'
import { playerColor } from '../gameLogic.js'

const SORTS = [
  { key: 'familiar', label: 'Familiar' },
  { key: 'players',  label: 'Players'  },
  { key: 'newest',   label: 'Newest'   },
]

function sortLobbies(lobbies, sort) {
  const copy = [...lobbies]
  if (sort === 'players') return copy.sort((a, b) => b.playerCount - a.playerCount || b.createdAt - a.createdAt)
  if (sort === 'newest')  return copy.sort((a, b) => b.createdAt - a.createdAt)
  // 'familiar': already pre-sorted by getPublicLobbies (timesPlayedWithHost desc, players desc, newest)
  return copy
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function JoinRoom({ playerId, playerName, setPlayerName, lockedName, isGuest, initialCode = '', spectateMode = false, onJoined, onSpectated, onBack, onLogin, openLobbies = [], onLobbies }) {
  const [name, setName] = useState(playerName)
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // 'idle' | 'can_spectate' — shown when game is in progress and player isn't in it
  const [spectateRoom, setSpectateRoom] = useState(null)

  const [publicLobbies, setPublicLobbies] = useState([])
  const [lobbiesLoading, setLobbiesLoading] = useState(true)
  const [sort, setSort] = useState('familiar')

  useEffect(() => {
    getPublicLobbies(playerId).then(data => {
      setPublicLobbies(data)
      setLobbiesLoading(false)
    })
  }, [playerId])

  const sortedLobbies = sortLobbies(publicLobbies, sort)

  async function join() {
    if (!name.trim() || !code.trim()) return
    setLoading(true); setError(''); setSpectateRoom(null)
    const room = await sget('room:' + code.toUpperCase())
    if (!room) { setError('Room not found. Check the code and try again.'); setLoading(false); return }

    const alreadyPlayer    = room.players.find(p => p.id === playerId)
    const alreadySpectator = (room.spectators || []).find(s => s.id === playerId)

    // Already in as spectator — just route them in
    if (alreadySpectator) {
      sessionStorage.setItem('eights_pname', name.trim()); setPlayerName(name.trim())
      setLoading(false); onSpectated(room); return
    }

    // Already a player — rejoin as player (even on spectate links)
    if (alreadyPlayer) {
      sessionStorage.setItem('eights_pname', name.trim()); setPlayerName(name.trim())
      setLoading(false); onJoined(room); return
    }

    // Spectate link — skip player join, go straight to spectate
    if (spectateMode) {
      if (room.settings?.spectatorsAllowed === false) {
        setError('This room doesn\'t allow spectators.'); setLoading(false); return
      }
      setSpectateRoom(room); setLoading(false); return
    }

    // Game in progress — offer spectate (if allowed)
    if (room.phase !== 'lobby') {
      if (room.settings?.spectatorsAllowed === false) {
        setError('This room doesn\'t allow spectators.'); setLoading(false); return
      }
      setSpectateRoom(room); setLoading(false); return
    }

    // Join as player
    room.players.push({ id: playerId, name: name.trim(), color: playerColor(room.players.length), ready: false })
    await sset('room:' + room.id, room)
    sessionStorage.setItem('eights_pname', name.trim()); setPlayerName(name.trim())
    setLoading(false); onJoined(room)
  }

  async function spectate() {
    if (!spectateRoom) return
    setLoading(true)
    // Re-fetch in case room changed, then add spectator
    const room = await sget('room:' + spectateRoom.id)
    if (!room) { setError('Room no longer available.'); setLoading(false); setSpectateRoom(null); return }
    const alreadySpectator = (room.spectators || []).find(s => s.id === playerId)
    if (!alreadySpectator) {
      const updated = { ...room, spectators: [...(room.spectators || []), { id: playerId, name: name.trim() }] }
      await sset('room:' + room.id, updated)
      sessionStorage.setItem('eights_pname', name.trim()); setPlayerName(name.trim())
      setLoading(false); onSpectated(updated); return
    }
    sessionStorage.setItem('eights_pname', name.trim()); setPlayerName(name.trim())
    setLoading(false); onSpectated(room)
  }

  function pickLobby(lobbyCode) {
    setCode(lobbyCode)
    setError('')
    setSpectateRoom(null)
  }

  return (
    <Screen title="Join room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={{ ...inp(), opacity: lockedName ? 0.65 : 1 }} value={name} onChange={e => { if (!lockedName) setName(e.target.value) }} placeholder="Enter your name" autoFocus={!lockedName} readOnly={lockedName} />
      {lockedName
        ? <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Logged in — name set by account.</p>
        : onLogin && (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>
            Playing as guest. <button onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-info)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in or create account</button>
            {isGuest && openLobbies.length > 0 && (
              <> · <button onClick={onLobbies} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-info)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>{openLobbies.length} open game{openLobbies.length !== 1 ? 's' : ''} →</button></>
            )}
          </p>
        )}
      <label style={{ ...lbl, marginTop: 16 }}>Room code</label>
      <input style={{ ...inp(), textTransform: 'uppercase', letterSpacing: 4, fontSize: 22 }} value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setSpectateRoom(null); setError('') }} placeholder="XXXX" maxLength={4} onKeyDown={e => e.key === 'Enter' && join()} autoFocus={lockedName} />

      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}

      {/* Game in progress — offer spectate instead */}
      {spectateRoom ? (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            {spectateMode ? 'You\'ve been invited to watch this game as a spectator.' : 'That game has already started. You can watch as a spectator.'}
          </p>
          <button style={{ ...btn('primary'), marginBottom: 8 }} onClick={spectate} disabled={!name.trim() || loading}>
            {loading ? 'Joining…' : '👁 Watch as spectator'}
          </button>
          <button style={btn()} onClick={() => setSpectateRoom(null)} disabled={loading}>Back</button>
        </div>
      ) : (
        <button style={{ ...btn('primary'), marginTop: 8 }} onClick={join} disabled={!name.trim() || !code.trim() || loading}>
          {loading ? 'Joining…' : 'Join room'}
        </button>
      )}

      {/* ── Open lobbies ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Open lobbies</h3>
          {sortedLobbies.length > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {SORTS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: sort === key ? 'none' : '0.5px solid var(--color-border-secondary)', background: sort === key ? 'var(--color-text-info)' : 'var(--color-background-tertiary)', color: sort === key ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {lobbiesLoading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
        ) : sortedLobbies.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>No open lobbies right now.</p>
        ) : (
          <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
            {sortedLobbies.map((lobby, i) => (
              <button
                key={lobby.code}
                onClick={() => pickLobby(lobby.code)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: code === lobby.code ? 'var(--color-background-selected, var(--color-background-secondary))' : i % 2 === 0 ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {lobby.hostName}
                      {lobby.timesPlayedWithHost > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                          played together {lobby.timesPlayedWithHost}×
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                      {lobby.playerCount} {lobby.playerCount === 1 ? 'player' : 'players'} waiting · {timeAgo(lobby.createdAt)}
                      {lobby.arenaMode !== 'none' && ` · ${lobby.arenaMode}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{lobby.code}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}
