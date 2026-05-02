import { useState, useEffect, useCallback } from 'react'
import { btn } from '../styles.js'
import { slist } from '../supabase.js'
import { buildTickerMessages } from '../narrative.js'

const TICKER_SPEED = 40  // px/s — raise to go faster
const TICKER_CHAR_PX = 6.5 // estimated px per char at 11px font
const TICKER_SEP = '     ·     '

function HomeTicker() {
  const [text, setText] = useState(null)

  useEffect(() => {
    slist().then(r => {
      const msgs = buildTickerMessages(r).sort(() => Math.random() - 0.5)
      setText(msgs.join(TICKER_SEP))
    })
  }, [])

  if (!text) return null

  const textPx = text.length * TICKER_CHAR_PX
  const duration = (textPx / TICKER_SPEED).toFixed(2)

  return (
    <div style={{ width: '100%', maxWidth: 280, overflow: 'hidden', marginBottom: '1.75rem', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', padding: '7px 0' }}>
      <style>{`@keyframes eights-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', willChange: 'transform', animation: `eights-ticker ${duration}s linear infinite` }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', letterSpacing: '0.01em' }}>{text}{TICKER_SEP}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', letterSpacing: '0.01em' }}>{text}{TICKER_SEP}</span>
      </div>
    </div>
  )
}

export default function HomeScreen({ onCreate, onJoin, onChronicles, onArchive, onPlayers, onWorkshop, onSuperHost, onDev, currentUser, onLogin, onLogout, onAdmin, openLobbies, onLobbies, onHelp }) {
  const [kickedNotice, setKickedNotice] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eights_kicked') || 'null') } catch { return null }
  })

  const dismissKick = useCallback(() => {
    localStorage.removeItem('eights_kicked')
    setKickedNotice(null)
  }, [])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
      <button onClick={onHelp} title="How to play" style={{ position: 'absolute', top: '1rem', left: '1rem', background: 'transparent', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '50%', width: 28, height: 28, fontSize: 13, color: 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>?</button>
      {kickedNotice && (
        <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 2rem)', maxWidth: 320, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', zIndex: 10 }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text-warning)' }}>
            You were removed from game {kickedNotice.code} by the host.
          </span>
          <button onClick={dismissKick} style={{ background: 'transparent', border: 'none', fontSize: 16, color: 'var(--color-text-warning)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
      )}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <HomeTicker />
        <div style={{ fontSize: 56, marginBottom: '0.5rem' }}>⚔️</div>
        <h1 style={{ fontSize: 40, fontWeight: 500, margin: '0 0 0.5rem', color: 'var(--color-text-primary)', letterSpacing: '-1px' }}>Eights</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 16 }}>The game of improbable battles</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
        {openLobbies.length > 0 && (
          <button onClick={onLobbies} style={{ ...btn('primary'), background: 'var(--color-text-success)', position: 'relative' }}>
            My open lobbies
            <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 99, background: 'var(--color-text-danger)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{openLobbies.length}</span>
          </button>
        )}
        <button onClick={onCreate} style={btn('primary')}>Create a room</button>
        <button onClick={onJoin}   style={btn()}>Join a room</button>
        <button onClick={onChronicles} style={btn('ghost')}>The Chronicles ↗</button>
        <button onClick={onArchive} style={btn('ghost')}>The Archive ↗</button>
        <button onClick={onPlayers} style={btn('ghost')}>Players ↗</button>
        <button onClick={onWorkshop} style={btn('ghost')}>My Workshop ↗</button>
        {currentUser?.is_super_host && (
          <button onClick={onSuperHost} style={btn('ghost')}>Super Host Tools ↗</button>
        )}
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
              <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>⚔ {currentUser.username}</span>
              <button onClick={onLogout} style={{ background: 'transparent', border: 'none', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '8px 10px' }}>Log out</button>
            </div>
          ) : (
            <button onClick={onLogin} style={{ ...btn('ghost'), width: '100%', fontSize: 13 }}>Log in / Register</button>
          )}
          <button onClick={onDev} style={{ ...btn('ghost'), width: '100%', fontSize: 13 }}>🧪 Dev mode — solo test</button>
          <button onClick={onAdmin} style={{ background: 'transparent', border: 'none', fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px', alignSelf: 'center' }}>⚙ Admin</button>
        </div>
      </div>
    </div>
  )
}
