import { useState, useEffect, useRef } from 'react'
import { initials } from '../gameLogic.js'
import { getPlayerRoomStats, getUserProfile } from '../supabase.js'
import PlayerStatsBlurb from './PlayerStatsBlurb.jsx'

// Tapping/clicking toggles the stats card — works on desktop and mobile.
// Outside click/tap dismisses it.
export default function AvatarWithHover({ player, onViewProfile }) {
  const [open, setOpen]       = useState(false)
  const [stats, setStats]     = useState(null)
  const [profile, setProfile] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function outside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('touchstart', outside) }
  }, [open])

  function toggle(e) {
    e.stopPropagation()
    if (player.isBot) return
    if (!open) {
      if (!stats) getPlayerRoomStats(player.id).then(setStats)
      if (!profile) getUserProfile(player.id).then(setProfile)
    }
    setOpen(o => !o)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        style={{ width: 36, height: 36, borderRadius: '50%', background: player.color + '33', border: '0.5px solid ' + player.color + '66', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: player.color, cursor: player.isBot ? 'default' : 'pointer', userSelect: 'none' }}
        onClick={toggle}
      >
        {initials(player.name)}
      </div>
      {open && !player.isBot && (
        <div style={{ position: 'absolute', top: 42, left: 0, zIndex: 500, minWidth: 190, maxWidth: 'min(260px, calc(100vw - 32px))', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', boxShadow: '0 6px 24px rgba(0,0,0,0.22)' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6 }}>{player.name}</div>
          <PlayerStatsBlurb stats={stats} favoriteName={profile?.favorite_combatant_name} />
          {onViewProfile && (
            <button onClick={() => { onViewProfile(player.id); setOpen(false) }} style={{ marginTop: 10, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--color-text-info)', cursor: 'pointer', padding: 0 }}>View profile →</button>
          )}
        </div>
      )}
    </div>
  )
}
