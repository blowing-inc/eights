import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import PinKeypad from '../components/PinKeypad.jsx'
import { btn } from '../styles.js'
import { slist, getAllCombatantsForExport, listUsers, adminResetUser } from '../supabase.js'
import { downloadFile } from '../export.js'

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '00000'

export default function AdminScreen({ onBack }) {
  const [phase, setPhase] = useState('pin') // pin | users
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [users, setUsers] = useState([])
  const [resetting, setResetting] = useState(null)
  const [msg, setMsg] = useState('')
  const [exporting, setExporting] = useState(false)

  async function exportAllData() {
    setExporting(true)
    const [rooms, combatants, allUsers] = await Promise.all([
      slist(),
      getAllCombatantsForExport(),
      listUsers(),
    ])
    const payload = {
      exportedAt: new Date().toISOString(),
      rooms,
      combatants,
      users: allUsers,
    }
    downloadFile(
      `eights-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    )
    setExporting(false)
  }

  useEffect(() => {
    if (pin.length < 5) return
    if (pin === ADMIN_PIN) {
      setPhase('users'); listUsers().then(setUsers)
    } else {
      setPinError('Wrong admin PIN.'); setPin('')
    }
  }, [pin])

  async function doReset(username) {
    setResetting(username); setMsg('')
    await adminResetUser(username)
    setMsg(`PIN reset for ${username} — they'll be prompted to set a new one on next login.`)
    setResetting(null)
    listUsers().then(setUsers)
  }

  if (phase === 'pin') {
    return (
      <Screen title="Admin" onBack={onBack}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '-0.5rem 0 1.5rem', textAlign: 'center' }}>Enter the admin PIN to continue.</p>
        {pinError && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, textAlign: 'center', margin: '-8px 0 16px' }}>{pinError}</p>}
        <PinKeypad pin={pin} onChange={setPin} />
      </Screen>
    )
  }

  return (
    <Screen title="Admin — Users" onBack={onBack}>
      {msg && <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>{msg}</div>}
      {users.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No registered users yet.</p>}
      {users.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 15, color: 'var(--color-text-primary)' }}>{u.username}</span>
          {u.needs_reset && <span style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>pending reset</span>}
          <button onClick={() => doReset(u.username)} disabled={!!resetting || u.needs_reset}
            style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}>
            {resetting === u.username ? '…' : 'Reset PIN'}
          </button>
        </div>
      ))}

      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Data export</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
          Downloads all rooms, combatants, and users as a single JSON file. PINs are not included.
        </p>
        <button onClick={exportAllData} disabled={exporting}
          style={{ ...btn('ghost'), padding: '8px 16px', fontSize: 13, width: 'auto' }}>
          {exporting ? 'Exporting…' : '⬇ Export all data (JSON)'}
        </button>
      </div>
    </Screen>
  )
}
