import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import ShareLinkButton from '../components/ShareLinkButton.jsx'
import SpectatorList from '../components/SpectatorList.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import { btn } from '../styles.js'
import { sset, subscribeToRoom, trackRoomPresence } from '../supabase.js'

export default function LobbyScreen({ room: init, playerId, setRoom, isGuest, onLogin, onStart, onBack, onViewPlayer }) {
  const [room, setLocal]           = useState(init)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [presentIds, setPresentIds] = useState([])
  // 'idle' | 'confirming' — guest-host gate before starting the game
  const [guestStartPrompt, setGuestStartPrompt] = useState('idle')

  const isHost = room.host === playerId

  useEffect(() => {
    return subscribeToRoom(room.id, r => {
      setLocal(r); setRoom(r)
      if (r.phase === 'draft') onStart()
      if (r.phase === 'ended') onBack()
    })
  }, [room.id])

  useEffect(() => {
    return trackRoomPresence(room.id, playerId, isHost ? 'host' : 'player', {
      onPresenceChange: setPresentIds,
    })
  }, [room.id])

  async function startGame() {
    const updated = { ...room, phase: 'draft' }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onStart()
  }

  function handleStartClick() {
    // If the host is a guest, show a one-tap confirmation before proceeding.
    // Losing the session as host means no one can advance the game.
    if (isGuest) {
      setGuestStartPrompt('confirming')
    } else {
      startGame()
    }
  }

  async function cancelRoom() {
    const updated = { ...room, phase: 'ended', cancelledAt: Date.now() }
    await sset('room:' + room.id, updated)
    onBack()
  }

  return (
    <Screen title={`Room ${room.code}`} onBack={onBack} right={<SpectatorList spectators={room.spectators} />}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1rem' }}>Share this code with your friends</p>
      <div style={{ textAlign: 'center', fontSize: 52, fontWeight: 500, letterSpacing: 8, color: 'var(--color-text-primary)', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '1.5rem', marginBottom: '0.75rem' }}>{room.code}</div>
      <ShareLinkButton code={room.code} />
      {room.settings?.spectatorsAllowed !== false && <ShareLinkButton code={room.code} spectate style={{ marginTop: -8 }} />}

      <ConnectionStatus players={room.players} presentIds={presentIds} isHost={isHost} roomCode={room.code} />

      <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 12px' }}>Players ({room.players.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '2rem' }}>
        {room.players.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
            <AvatarWithHover player={p} onViewProfile={!p.isBot ? onViewPlayer : null} />
            <span style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>{p.name}</span>
            {p.id === room.host && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-tertiary)', padding: '2px 6px', borderRadius: 99 }}>host</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <>
          {/* Guest-host confirmation gate */}
          {guestStartPrompt === 'confirming' ? (
            <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>
                You're the host but not logged in. If you close this tab or switch devices, no one will be able to advance the game.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '7px 10px', color: 'var(--color-text-warning)', borderColor: 'var(--color-border-warning)' }}
                  onClick={() => { setGuestStartPrompt('idle'); onLogin?.() }}>
                  Log in first
                </button>
                <button style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px 10px' }}
                  onClick={startGame}>
                  Start anyway →
                </button>
              </div>
            </div>
          ) : (
            <button style={btn('primary')} onClick={handleStartClick} disabled={room.players.length < 2}>Start game →</button>
          )}

          {!confirmCancel
            ? <button style={{ ...btn('ghost'), marginTop: 10, width: '100%', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', fontSize: 13 }} onClick={() => setConfirmCancel(true)}>Cancel room</button>
            : <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-danger)' }}>Remove this room?</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btn('ghost'), fontSize: 13, padding: '4px 12px' }} onClick={() => setConfirmCancel(false)}>Never mind</button>
                  <button style={{ ...btn('ghost'), fontSize: 13, padding: '4px 12px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }} onClick={cancelRoom}>Yes, cancel</button>
                </div>
              </div>
          }
        </>
      ) : <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>Waiting for host to start…</p>}
    </Screen>
  )
}
