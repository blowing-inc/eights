import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { sget, sset } from '../supabase.js'
import { playerColor } from '../gameLogic.js'

export default function JoinRoom({ playerId, playerName, setPlayerName, lockedName, initialCode = '', onJoined, onBack, onLogin }) {
  const [name, setName] = useState(playerName)
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function join() {
    if (!name.trim() || !code.trim()) return
    setLoading(true); setError('')
    const room = await sget('room:' + code.toUpperCase())
    if (!room) { setError('Room not found. Check the code and try again.'); setLoading(false); return }
    const alreadyIn = room.players.find(p => p.id === playerId)
    if (room.phase !== 'lobby' && !alreadyIn) { setError('That game has already started.'); setLoading(false); return }
    if (!alreadyIn) {
      room.players.push({ id: playerId, name: name.trim(), color: playerColor(room.players.length), ready: false })
      await sset('room:' + room.id, room)
    }
    sessionStorage.setItem('eights_pname', name.trim())
    setPlayerName(name.trim())
    setLoading(false)
    onJoined(room)
  }

  return (
    <Screen title="Join room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={{ ...inp(), opacity: lockedName ? 0.65 : 1 }} value={name} onChange={e => { if (!lockedName) setName(e.target.value) }} placeholder="Enter your name" autoFocus={!lockedName} readOnly={lockedName} />
      {lockedName
        ? <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Logged in — name set by account.</p>
        : onLogin && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Playing as guest. <button onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-info)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in or create account</button></p>}
      <label style={{ ...lbl, marginTop: 16 }}>Room code</label>
      <input style={{ ...inp(), textTransform: 'uppercase', letterSpacing: 4, fontSize: 22 }} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXX" maxLength={4} onKeyDown={e => e.key === 'Enter' && join()} autoFocus={lockedName} />
      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
      <button style={{ ...btn('primary'), marginTop: 8 }} onClick={join} disabled={!name.trim() || !code.trim() || loading}>{loading ? 'Joining…' : 'Join room'}</button>
    </Screen>
  )
}
