import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import ShareLinkButton from '../components/ShareLinkButton.jsx'
import SpectatorList from '../components/SpectatorList.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import { btn } from '../styles.js'
import { sset, subscribeToRoom, trackRoomPresence, getArenaPickerOptions } from '../supabase.js'

export default function LobbyScreen({ room: init, playerId, setRoom, isGuest, onLogin, onStart, onBack, onViewPlayer }) {
  const [room, setLocal]           = useState(init)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [presentIds, setPresentIds] = useState([])
  // 'idle' | 'confirming' — guest-host gate before starting the game
  const [guestStartPrompt, setGuestStartPrompt] = useState('idle')

  // Arena picker state (host only)
  const [arenas,           setArenas]           = useState([])
  const [arenaPickerOpen,  setArenaPickerOpen]  = useState(false)
  // Track the currently selected arena object separately for badge display
  const [selectedArena,    setSelectedArena]    = useState(init.settings?.arena ?? null)

  const isHost = room.host === playerId

  useEffect(() => {
    return subscribeToRoom(room.id, r => {
      setLocal(r); setRoom(r)
      // Sync selected arena if another host session updated it
      setSelectedArena(r.settings?.arena ?? null)
      if (r.phase === 'draft') onStart()
      if (r.phase === 'ended') onBack()
    })
  }, [room.id])

  useEffect(() => {
    return trackRoomPresence(room.id, playerId, isHost ? 'host' : 'player', {
      onPresenceChange: setPresentIds,
    })
  }, [room.id])

  // Load arena options for the host picker
  useEffect(() => {
    if (!isHost) return
    getArenaPickerOptions(playerId).then(setArenas)
  }, [isHost, playerId])

  async function startGame() {
    const updated = { ...room, phase: 'draft' }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onStart()
  }

  function handleStartClick() {
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

  async function pickArena(arena) {
    const snapshot = { id: arena.id, name: arena.name, bio: arena.bio, rules: arena.rules || null, tags: arena.tags }
    const updated  = { ...room, settings: { ...(room.settings || {}), arena: snapshot } }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated)
    setSelectedArena(arena)
    setArenaPickerOpen(false)
  }

  async function clearArena() {
    const { arena: _removed, ...restSettings } = room.settings || {}
    const updated = { ...room, settings: restSettings }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated)
    setSelectedArena(null)
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

      {/* ── Arena picker (host only) ── */}
      {isHost && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 8px' }}>Arena (optional)</h3>

          {selectedArena ? (
            <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedArena.name}</span>
                    {selectedArena.status === 'stashed' && (
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>
                        🔒 stashed
                      </span>
                    )}
                  </div>
                  {selectedArena.bio && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {selectedArena.bio}
                    </p>
                  )}
                  {selectedArena.rules && (
                    <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0', fontStyle: 'italic' }}>
                      Rules: {selectedArena.rules.length > 60 ? selectedArena.rules.slice(0, 60) + '…' : selectedArena.rules}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => setArenaPickerOpen(true)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Change</button>
                <button onClick={clearArena} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>Remove</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setArenaPickerOpen(o => !o)}
              style={{ ...btn('ghost'), width: '100%', fontSize: 13, color: 'var(--color-text-secondary)' }}
            >
              {arenaPickerOpen ? 'Close picker ↑' : '+ Choose an arena'}
            </button>
          )}

          {arenaPickerOpen && !selectedArena && (
            <div style={{ marginTop: 8, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
              {arenas.length === 0 && (
                <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
                  No arenas available. Create one in My Workshop or wait for published arenas to appear.
                </p>
              )}
              {arenas.map((arena, i) => (
                <button
                  key={arena.id}
                  onClick={() => pickArena(arena)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    background: i % 2 === 0 ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                    border: 'none',
                    borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{arena.name}</span>
                    {arena.status === 'stashed' && (
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>
                        🔒 stashed
                      </span>
                    )}
                  </div>
                  {arena.bio && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                      {arena.bio}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Show selected arena to non-host players ── */}
      {!isHost && selectedArena && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 8px' }}>Arena</h3>
          <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedArena.name}</span>
            {selectedArena.bio && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0' }}>{selectedArena.bio}</p>
            )}
          </div>
        </div>
      )}

      {isHost ? (
        <>
          {/* Guest-host confirmation gate */}
          {guestStartPrompt === 'confirming' ? (
            <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>
                You're the host but not logged in. If you disappear, your players will be stuck — the arena waits for its host.
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
