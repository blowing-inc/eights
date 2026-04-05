import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { sget, sset } from '../supabase.js'
import { playerColor } from '../gameLogic.js'

export default function JoinRoom({ playerId, playerName, setPlayerName, lockedName, initialCode = '', onJoined, onSpectated, onBack, onLogin }) {
  const [name, setName] = useState(playerName)
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // 'idle' | 'can_spectate' — shown when game is in progress and player isn't in it
  const [spectateRoom, setSpectateRoom] = useState(null)

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

    // Already a player — rejoin
    if (alreadyPlayer) {
      sessionStorage.setItem('eights_pname', name.trim()); setPlayerName(name.trim())
      setLoading(false); onJoined(room); return
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

  return (
    <Screen title="Join room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={{ ...inp(), opacity: lockedName ? 0.65 : 1 }} value={name} onChange={e => { if (!lockedName) setName(e.target.value) }} placeholder="Enter your name" autoFocus={!lockedName} readOnly={lockedName} />
      {lockedName
        ? <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Logged in — name set by account.</p>
        : onLogin && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Playing as guest. <button onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-info)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in or create account</button></p>}
      <label style={{ ...lbl, marginTop: 16 }}>Room code</label>
      <input style={{ ...inp(), textTransform: 'uppercase', letterSpacing: 4, fontSize: 22 }} value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setSpectateRoom(null); setError('') }} placeholder="XXXX" maxLength={4} onKeyDown={e => e.key === 'Enter' && join()} autoFocus={lockedName} />

      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}

      {/* Game in progress — offer spectate instead */}
      {spectateRoom ? (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            That game has already started. You can watch as a spectator.
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
    </Screen>
  )
}
