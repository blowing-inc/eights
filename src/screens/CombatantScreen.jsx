import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp } from '../styles.js'
import { sset } from '../supabase.js'
import { canEditCombatant } from '../gameLogic.js'

export default function CombatantScreen({ room, combatant, playerId, onBack, onViewCombatant }) {
  const [c, setC] = useState(combatant)
  const [editBio, setEditBio] = useState(false)
  const [bio, setBio] = useState(combatant.bio || '')
  const owner = room?.players.find(p => p.id === c.ownerId)
  const canEdit = canEditCombatant(c.ownerId, playerId, room?.host)

  async function saveBio() {
    if (!room) return
    const updated = { ...room }
    updated.combatants[c.ownerId] = updated.combatants[c.ownerId].map(x => x.id === c.id ? { ...x, bio } : x)
    await sset('room:' + room.id, updated)
    setC({ ...c, bio }); setEditBio(false)
  }

  return (
    <Screen title={c.name} onBack={onBack}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--border-radius-md)', background: owner ? owner.color + '22' : 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚔️</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>{c.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>Created by {owner?.name || 'unknown'}</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
        {[['Wins', c.wins || 0, 'var(--color-text-success)'], ['Losses', c.losses || 0, 'var(--color-text-danger)'], ['Draws', c.draws || 0, 'var(--color-text-secondary)'], ['Rounds', (c.wins || 0) + (c.losses || 0) + (c.draws || 0), 'var(--color-text-tertiary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: '12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: 0 }}>Bio</h3>
          {canEdit && !editBio && <button onClick={() => setEditBio(true)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
        </div>
        {editBio ? (
          <>
            <textarea style={{ ...inp(), width: '100%', resize: 'none', height: 80 }} value={bio} onChange={e => setBio(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={btn('primary')} onClick={saveBio}>Save</button>
              <button style={btn()} onClick={() => { setBio(c.bio || ''); setEditBio(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <p style={{ color: c.bio ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 14, margin: 0 }}>{c.bio || 'No bio yet.'}</p>
        )}
      </div>
      {c.trapTarget && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>Trap</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Set as trap for</span>
            {(() => {
              // Find the target combatant in room data so we can navigate to it
              const targetCombatant = room
                ? Object.values(room.combatants || {}).flat().find(x => x.id === c.trapTarget.targetId)
                : null
              return (
                <button
                  onClick={() => targetCombatant && onViewCombatant?.(targetCombatant)}
                  disabled={!targetCombatant || !onViewCombatant}
                  style={{ fontSize: 13, padding: '3px 10px', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 99, cursor: targetCombatant && onViewCombatant ? 'pointer' : 'default' }}
                >
                  🪤 {c.trapTarget.targetName}
                </button>
              )
            })()}
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>({c.trapTarget.targetOwnerName})</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: c.trapTriggered ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
            {c.trapTriggered ? '✓ Trap sprung' : 'Trap never triggered'}
          </div>
        </div>
      )}

      {(c.battles || []).length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Round record</h3>
          {c.battles.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', marginBottom: 6, border: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>vs {b.opponent}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: b.result === 'win' ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>{b.result}</span>
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}
