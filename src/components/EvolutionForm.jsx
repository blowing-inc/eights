import { useState } from 'react'
import { btn, inp } from '../styles.js'

/**
 * A focused writing surface for naming and describing an evolved combatant.
 * Holds no routing or async logic — all decisions live in the parent.
 *
 * Props:
 *   winner     — the combatant being evolved (id, name, bio)
 *   onSubmit   — (name: string, bio: string) => void
 *   onCancel   — () => void
 */
export default function EvolutionForm({ winner, onSubmit, onCancel }) {
  const [name, setName] = useState(winner.name)
  const [bio,  setBio]  = useState(winner.bio || '')

  return (
    <div style={{ padding: '12px 16px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
        How did <em>{winner.name}</em> change?
      </p>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>New name</div>
      <input
        style={{ ...inp(), margin: '0 0 8px', fontSize: 14 }}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={winner.name}
        autoFocus
      />

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Bio</div>
      <textarea
        style={{ ...inp(), margin: 0, resize: 'none', height: 68, fontSize: 13, width: '100%' }}
        value={bio}
        onChange={e => setBio(e.target.value)}
        placeholder="What happened to them?"
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={() => onSubmit(name.trim() || winner.name, bio.trim())}
          disabled={!name.trim()}
          style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '9px' }}
        >
          Confirm evolution ⚡
        </button>
        <button onClick={onCancel} style={{ ...btn(), fontSize: 13, padding: '9px' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
