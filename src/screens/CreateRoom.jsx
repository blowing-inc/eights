import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { sset } from '../supabase.js'
import { playerColor } from '../gameLogic.js'

export default function CreateRoom({ playerId, playerName, setPlayerName, lockedName, onCreated, onBack }) {
  const [name, setName] = useState(playerName)
  const [loading, setLoading] = useState(false)

  async function create() {
    if (!name.trim()) return
    setLoading(true)
    const roomCode = Math.random().toString(36).slice(2, 6).toUpperCase()
    const room = {
      id: roomCode, code: roomCode, host: playerId, phase: 'lobby',
      players: [{ id: playerId, name: name.trim(), color: playerColor(0), ready: false }],
      combatants: {}, rounds: [], currentRound: 0, createdAt: Date.now()
    }
    await sset('room:' + roomCode, room)
    sessionStorage.setItem('eights_pname', name.trim())
    setPlayerName(name.trim())
    setLoading(false)
    onCreated(room)
  }

  return (
    <Screen title="New room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={{ ...inp(), opacity: lockedName ? 0.65 : 1 }} value={name} onChange={e => { if (!lockedName) setName(e.target.value) }} placeholder="Enter your name" onKeyDown={e => e.key === 'Enter' && create()} autoFocus={!lockedName} readOnly={lockedName} />
      {lockedName && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Logged in — name set by account.</p>}
      <button style={{ ...btn('primary'), marginTop: 8 }} onClick={create} disabled={!name.trim() || loading}>{loading ? 'Creating…' : 'Create room'}</button>
    </Screen>
  )
}
