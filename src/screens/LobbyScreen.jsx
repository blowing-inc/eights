import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import ShareLinkButton from '../components/ShareLinkButton.jsx'
import { btn } from '../styles.js'
import { sget, sset } from '../supabase.js'
import { POLL_INTERVAL } from '../gameLogic.js'

export default function LobbyScreen({ room: init, playerId, setRoom, onStart, onBack, onViewPlayer }) {
  const [room, setLocal] = useState(init)
  const isHost = room.host === playerId

  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await sget('room:' + room.id)
      if (r) { setLocal(r); setRoom(r); if (r.phase === 'draft') onStart() }
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [room.id])

  async function startGame() {
    const updated = { ...room, phase: 'draft' }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onStart()
  }

  return (
    <Screen title={`Room ${room.code}`} onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1rem' }}>Share this code with your friends</p>
      <div style={{ textAlign: 'center', fontSize: 52, fontWeight: 500, letterSpacing: 8, color: 'var(--color-text-primary)', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '1.5rem', marginBottom: '0.75rem' }}>{room.code}</div>
      <ShareLinkButton code={room.code} />
      <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 12px' }}>Players ({room.players.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '2rem' }}>
        {room.players.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
            <AvatarWithHover player={p} onViewProfile={!p.isBot ? onViewPlayer : null} />
            <span style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>{p.name}</span>
            {p.id === room.host && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-background-tertiary)', padding: '2px 8px', borderRadius: 99 }}>host</span>}
          </div>
        ))}
      </div>
      {isHost
        ? <button style={btn('primary')} onClick={startGame} disabled={room.players.length < 2}>Start game →</button>
        : <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>Waiting for host to start…</p>}
    </Screen>
  )
}
