import { useState } from 'react'
import { playerColor } from '../gameLogic.js'

// Always-visible strip showing who is connected to the room.
//
// For all users: colored dot per player — solid = connected, faded = disconnected.
// For the host only: tapping a disconnected player opens an action sheet with a
// "Share rejoin link" option that copies a ?code=&pid= URL to the clipboard.
//
// Props:
//   players    — room.players array
//   presentIds — string[] from trackRoomPresence onPresenceChange callback
//   isHost     — bool
//   roomCode   — string (4-char room code, used in the rejoin URL)

export default function ConnectionStatus({ players, presentIds, isHost, roomCode }) {
  const [activePlayerId, setActivePlayerId] = useState(null)
  const [copied, setCopied]                 = useState(false)

  if (!players?.length || !presentIds) return null

  // Only show real players (no bots — bots don't have presence)
  const humans = players.filter(p => !p.isBot)
  if (!humans.length) return null

  function handleDotClick(player) {
    if (!isHost) return
    const online = presentIds.includes(player.id)
    if (online) return               // nothing to do for connected players
    setActivePlayerId(p => p === player.id ? null : player.id)
    setCopied(false)
  }

  function copyRejoínLink(player) {
    const url = window.location.origin + window.location.pathname +
      '?code=' + roomCode + '&pid=' + player.id
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false); setActivePlayerId(null) }, 2000)
    })
  }

  const activePlayer = humans.find(p => p.id === activePlayerId)

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      {/* Dot strip */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {humans.map((player, i) => {
          const online  = presentIds.includes(player.id)
          const color   = player.color || playerColor(i)
          const isActive = activePlayerId === player.id

          return (
            <div
              key={player.id}
              onClick={() => handleDotClick(player)}
              title={online ? player.name + ' — connected' : player.name + ' — disconnected'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                cursor: isHost && !online ? 'pointer' : 'default',
              }}
            >
              {/* Dot */}
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: online ? color : 'transparent',
                border: online ? 'none' : `2px solid ${color}`,
                opacity: online ? 1 : 0.45,
                flexShrink: 0,
                boxShadow: isActive ? `0 0 0 2px ${color}55` : 'none',
                transition: 'opacity 0.2s',
              }} />
              <span style={{
                fontSize: 11,
                color: online ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                opacity: online ? 1 : 0.55,
              }}>
                {player.name}
              </span>
            </div>
          )
        })}
      </div>

      {/* Host action sheet for a disconnected player */}
      {isHost && activePlayer && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--border-radius-md)',
          padding: '10px 14px',
          minWidth: 220,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>
            {activePlayer.name} is not connected
          </p>
          <button
            onClick={() => copyRejoínLink(activePlayer)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 10px', fontSize: 13,
              background: copied ? 'var(--color-background-success)' : 'var(--color-background-tertiary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-sm)',
              color: copied ? 'var(--color-text-success)' : 'var(--color-text-primary)',
              cursor: 'pointer',
              marginBottom: 6,
            }}
          >
            {copied ? 'Link copied!' : 'Copy rejoin link'}
          </button>
          <button
            onClick={() => setActivePlayerId(null)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '5px 10px', fontSize: 12,
              background: 'transparent', border: 'none',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
