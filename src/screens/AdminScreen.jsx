import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import PinKeypad from '../components/PinKeypad.jsx'
import { btn, inp } from '../styles.js'
import { slist, sset, sdelete, getAllCombatantsForExport, listUsers, adminResetUser } from '../supabase.js'
import { downloadFile } from '../export.js'

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '00000'
const TABS = ['Games', 'Users', 'Data']

// ─── Games tab ────────────────────────────────────────────────────────────────

const ACTIVE_PHASES  = ['lobby', 'draft', 'battle', 'vote', 'voting']
const phaseLabel = p => ({ lobby: 'Lobby', draft: 'Drafting', battle: 'Battle', vote: 'Vote', voting: 'Vote', ended: 'Ended (early)' }[p] || p)

function GamesTab() {
  const [rooms,      setRooms]      = useState(null)  // null = loading
  const [filter,     setFilter]     = useState('active') // active | all
  const [confirmId,  setConfirmId]  = useState(null)
  const [working,    setWorking]    = useState(null)
  const [msg,        setMsg]        = useState('')

  useEffect(() => { loadRooms() }, [])

  async function loadRooms() {
    setRooms(null)
    const all = await slist()
    setRooms(all)
  }

  async function endGame(room) {
    setWorking(room.id)
    const updated = { ...room, phase: 'ended', endedEarly: true, endedByAdmin: true }
    await sset('room:' + room.id, updated)
    setMsg(`Room ${room.code} ended.`)
    setConfirmId(null); setWorking(null); loadRooms()
  }

  async function deleteGame(room) {
    setWorking(room.id)
    await sdelete(room.id)
    setMsg(`Room ${room.code} deleted.`)
    setConfirmId(null); setWorking(null); loadRooms()
  }

  const displayed = rooms === null ? [] : rooms.filter(r =>
    !r.devMode && (filter === 'all' || ACTIVE_PHASES.includes(r.phase))
  ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return (
    <>
      {msg && <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        {['active', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...btn(filter === f ? 'primary' : 'ghost'), padding: '5px 14px', fontSize: 13, width: 'auto', flex: 'none' }}>
            {f === 'active' ? 'Active' : 'All'}
          </button>
        ))}
        <button onClick={loadRooms} style={{ ...btn('ghost'), padding: '5px 14px', fontSize: 13, width: 'auto', marginLeft: 'auto', flex: 'none' }}>
          ↻ Refresh
        </button>
      </div>

      {rooms === null && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {rooms !== null && displayed.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No {filter === 'active' ? 'active' : ''} games found.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayed.map(r => {
          const realPlayers = (r.players || []).filter(p => !p.isBot)
          const isConfirm = confirmId === r.id
          const isWorking = working === r.id
          const isActive = ACTIVE_PHASES.includes(r.phase)

          return (
            <div key={r.id} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: 2 }}>{r.code}</span>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, border: '0.5px solid', ...(isActive ? { background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderColor: 'var(--color-border-info)' } : { background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-tertiary)' }) }}>
                    {phaseLabel(r.phase)}
                  </span>
                  {r.endedByAdmin && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>by admin</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {realPlayers.map(p => p.name).join(', ') || '—'}
                  {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString()}` : ''}
                </div>
              </div>

              {!isConfirm && isActive && (
                <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8 }}>
                  <button onClick={() => { setConfirmId(r.id); setMsg('') }} disabled={isWorking}
                    style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', width: 'auto' }}>
                    End game
                  </button>
                  <button onClick={() => { setConfirmId('delete-' + r.id); setMsg('') }} disabled={isWorking}
                    style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, width: 'auto' }}>
                    Delete
                  </button>
                </div>
              )}
              {!isConfirm && !isActive && (
                <div style={{ padding: '0 14px 10px' }}>
                  <button onClick={() => { setConfirmId('delete-' + r.id); setMsg('') }} disabled={isWorking}
                    style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, width: 'auto' }}>
                    Delete
                  </button>
                </div>
              )}

              {confirmId === r.id && (
                <div style={{ padding: '8px 14px 12px', borderTop: '0.5px solid var(--color-border-danger)', background: 'var(--color-background-danger)' }}>
                  <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 8px' }}>
                    End as no-contest? Combatants won't be published. This can't be undone.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => endGame(r)} disabled={isWorking}
                      style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 12, padding: '6px' }}>
                      {isWorking ? '…' : 'Yes, end it'}
                    </button>
                    <button onClick={() => setConfirmId(null)}
                      style={{ ...btn(), flex: 1, fontSize: 12, padding: '6px' }}>Cancel</button>
                  </div>
                </div>
              )}
              {confirmId === 'delete-' + r.id && (
                <div style={{ padding: '8px 14px 12px', borderTop: '0.5px solid var(--color-border-danger)', background: 'var(--color-background-danger)' }}>
                  <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 8px' }}>
                    Permanently delete room {r.code}? All data will be removed.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => deleteGame(r)} disabled={isWorking}
                      style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 12, padding: '6px' }}>
                      {isWorking ? '…' : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmId(null)}
                      style={{ ...btn(), flex: 1, fontSize: 12, padding: '6px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users,     setUsers]     = useState([])
  const [search,    setSearch]    = useState('')
  const [resetting, setResetting] = useState(null)
  const [msg,       setMsg]       = useState('')

  useEffect(() => { listUsers().then(setUsers) }, [])

  async function doReset(username) {
    setResetting(username); setMsg('')
    await adminResetUser(username)
    setMsg(`PIN reset for ${username} — they'll be prompted to set a new one on next login.`)
    setResetting(null)
    listUsers().then(setUsers)
  }

  const filtered = users.filter(u => !search.trim() || u.username.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <>
      {msg && <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>{msg}</div>}
      <input
        style={{ ...inp(), marginBottom: '1rem', fontSize: 14 }}
        placeholder="Search by username…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filtered.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{users.length === 0 ? 'No registered users yet.' : 'No users match that search.'}</p>}
      {filtered.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 15, color: 'var(--color-text-primary)' }}>{u.username}</span>
          {u.needs_reset && <span style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>pending reset</span>}
          <button onClick={() => doReset(u.username)} disabled={!!resetting || u.needs_reset}
            style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}>
            {resetting === u.username ? '…' : 'Reset PIN'}
          </button>
        </div>
      ))}
    </>
  )
}

// ─── Data tab ─────────────────────────────────────────────────────────────────

function DataTab() {
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState('')

  async function exportAllData() {
    setExporting(true); setMsg('')
    const [rooms, combatants, users] = await Promise.all([slist(), getAllCombatantsForExport(), listUsers()])
    downloadFile(
      `eights-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), rooms, combatants, users }, null, 2),
      'application/json'
    )
    setExporting(false); setMsg('Export downloaded.')
  }

  return (
    <>
      {msg && <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>{msg}</div>}
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>Full JSON export</p>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        Downloads all rooms, combatants, and users. PINs are not included.
      </p>
      <button onClick={exportAllData} disabled={exporting}
        style={{ ...btn('ghost'), padding: '8px 16px', fontSize: 13, width: 'auto' }}>
        {exporting ? 'Exporting…' : '⬇ Export all data (JSON)'}
      </button>
    </>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AdminScreen({ onBack }) {
  const [phase,    setPhase]    = useState('pin')
  const [pin,      setPin]      = useState('')
  const [pinError, setPinError] = useState('')
  const [tab,      setTab]      = useState('Games')

  useEffect(() => {
    if (pin.length < 5) return
    if (pin === ADMIN_PIN) { setPhase('admin') }
    else { setPinError('Wrong admin PIN.'); setPin('') }
  }, [pin])

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
    <Screen title="Admin" onBack={onBack}>
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--color-text-primary)' : '2px solid transparent', padding: '6px 16px', fontSize: 14, color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', cursor: 'pointer', marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Games' && <GamesTab />}
      {tab === 'Users' && <UsersTab />}
      {tab === 'Data'  && <DataTab />}
    </Screen>
  )
}
