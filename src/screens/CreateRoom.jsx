import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { sset } from '../supabase.js'
import { playerColor } from '../gameLogic.js'

function SettingRow({ label, description, value, onToggle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{description}</div>
      </div>
      <button
        onClick={onToggle}
        style={{ flexShrink: 0, marginLeft: 16, width: 40, height: 22, borderRadius: 99, border: 'none', padding: 0, background: value ? 'var(--color-text-info)' : 'var(--color-background-tertiary)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
      >
        <span style={{ position: 'absolute', top: 3, left: value ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
      </button>
    </div>
  )
}

function RosterSizeRow({ value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Roster size</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>Combatants each player drafts</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 16 }}>
        <button onClick={() => onChange(Math.max(3, value - 1))} disabled={value <= 3}
          style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 16, cursor: value <= 3 ? 'default' : 'pointer', opacity: value <= 3 ? 0.35 : 1, lineHeight: 1 }}>−</button>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 18, textAlign: 'center' }}>{value}</span>
        <button onClick={() => onChange(Math.min(12, value + 1))} disabled={value >= 12}
          style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 16, cursor: value >= 12 ? 'default' : 'pointer', opacity: value >= 12 ? 0.35 : 1, lineHeight: 1 }}>+</button>
      </div>
    </div>
  )
}

const SETTINGS = [
  ['spectatorsAllowed',      'Allow spectators',        'Let others watch without playing'],
  ['anonymousCombatants',    'Anonymous combatants',    'Hide owner names during voting'],
  ['blindVoting',            'Blind voting',            'Hide votes until everyone has picked'],
  ['biosRequired',           'Bios required',           'Players must write a bio for each combatant'],
]

export default function CreateRoom({ playerId, playerName, setPlayerName, lockedName, isGuest, onLogin, onCreated, onBack }) {
  const [name, setName] = useState(playerName)
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({ rosterSize: 8, spectatorsAllowed: true, anonymousCombatants: false, blindVoting: false, biosRequired: false })

  function toggle(key) { setSettings(s => ({ ...s, [key]: !s[key] })) }

  async function create() {
    if (!name.trim()) return
    setLoading(true)
    const roomCode = Math.random().toString(36).slice(2, 6).toUpperCase()
    const room = {
      id: roomCode, code: roomCode, host: playerId, phase: 'lobby',
      players: [{ id: playerId, name: name.trim(), color: playerColor(0), ready: false }],
      combatants: {}, rounds: [], currentRound: 0, createdAt: Date.now(),
      settings,
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

      {isGuest && (
        <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '-8px 0 8px' }}>
          You're creating as a guest. If you disappear, the game has no host — nobody moves forward.{' '}
          <button onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-warning)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in first →</button>
        </p>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1.5rem 0 0' }}>Settings</h3>
      <div style={{ marginBottom: '1.5rem' }}>
        <RosterSizeRow value={settings.rosterSize} onChange={v => setSettings(s => ({ ...s, rosterSize: v }))} />
        {SETTINGS.map(([key, label, desc]) => (
          <SettingRow key={key} label={label} description={desc} value={settings[key]} onToggle={() => toggle(key)} />
        ))}
      </div>

      <button style={btn('primary')} onClick={create} disabled={!name.trim() || loading}>{loading ? 'Creating…' : 'Create room'}</button>
    </Screen>
  )
}
