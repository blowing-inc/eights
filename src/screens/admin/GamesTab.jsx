import { useState, useEffect } from 'react'
import { btn } from '../../styles.js'
import { slist, sset, adminDeleteGame } from '../../supabase.js'

const ACTIVE_PHASES = ['lobby', 'draft', 'battle', 'vote', 'voting']
const PHASE_LABEL = { lobby: 'Lobby', draft: 'Drafting', battle: 'Rounds', vote: 'Vote', voting: 'Vote', ended: 'Ended' }

export default function GamesTab() {
  const [rooms,     setRooms]     = useState(null)
  const [filter,    setFilter]    = useState('active') // active | all
  const [confirmId, setConfirmId] = useState(null)     // roomId | 'delete-'+roomId
  const [working,   setWorking]   = useState(null)
  const [msg,       setMsg]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setRooms(null)
    setRooms(await slist())
  }

  async function endGame(room) {
    setWorking(room.id)
    await sset('room:' + room.id, { ...room, phase: 'ended', endedEarly: true, endedByAdmin: true })
    setMsg(`Room ${room.code} ended as no-contest.`)
    setConfirmId(null); setWorking(null); load()
  }

  async function deleteGame(room) {
    setWorking(room.id)
    await adminDeleteGame(room.id)
    setMsg(`Room ${room.code} deleted.`)
    setConfirmId(null); setWorking(null); load()
  }

  const displayed = (rooms || [])
    .filter(r => !r.devMode && (filter === 'all' || ACTIVE_PHASES.includes(r.phase)))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return (
    <>
      {msg && <Notice msg={msg} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
        <FilterBtn label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterBtn label="All"    active={filter === 'all'}    onClick={() => setFilter('all')} />
        <button onClick={load} style={{ ...btn('ghost'), padding: '5px 12px', fontSize: 12, width: 'auto', marginLeft: 'auto' }}>↻ Refresh</button>
      </div>

      {rooms === null && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {rooms !== null && displayed.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No {filter === 'active' ? 'active' : ''} games found.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayed.map(r => {
          const isActive  = ACTIVE_PHASES.includes(r.phase)
          const isWorking = working === r.id
          const players   = (r.players || []).filter(p => !p.isBot).map(p => p.name).join(', ') || '—'
          const date      = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''

          return (
            <div key={r.id} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: 2 }}>{r.code}</span>
                  <PhasePill phase={r.phase} />
                  {r.endedByAdmin && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>by admin</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{players}{date ? ` · ${date}` : ''}</div>
              </div>

              {confirmId !== r.id && confirmId !== 'delete-' + r.id && (
                <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8 }}>
                  {isActive && (
                    <button onClick={() => { setConfirmId(r.id); setMsg('') }} disabled={isWorking}
                      style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', width: 'auto' }}>
                      End game
                    </button>
                  )}
                  <button onClick={() => { setConfirmId('delete-' + r.id); setMsg('') }} disabled={isWorking}
                    style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, width: 'auto' }}>
                    Delete
                  </button>
                </div>
              )}

              {confirmId === r.id && (
                <ConfirmPanel
                  message="End as no-contest? Unpublished combatants stay unpublished."
                  confirmLabel={isWorking ? '…' : 'Yes, end it'}
                  onConfirm={() => endGame(r)}
                  onCancel={() => setConfirmId(null)}
                  disabled={isWorking}
                />
              )}
              {confirmId === 'delete-' + r.id && (
                <ConfirmPanel
                  message={`Permanently delete room ${r.code}? All data will be removed.`}
                  confirmLabel={isWorking ? '…' : 'Yes, delete'}
                  onConfirm={() => deleteGame(r)}
                  onCancel={() => setConfirmId(null)}
                  disabled={isWorking}
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function PhasePill({ phase }) {
  const active = ACTIVE_PHASES.includes(phase)
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, border: '0.5px solid',
      ...(active
        ? { background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderColor: 'var(--color-border-info)' }
        : { background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-tertiary)' }) }}>
      {PHASE_LABEL[phase] || phase}
    </span>
  )
}

function FilterBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ ...btn(active ? 'primary' : 'ghost'), padding: '5px 14px', fontSize: 13, width: 'auto', flex: 'none' }}>
      {label}
    </button>
  )
}

function ConfirmPanel({ message, confirmLabel, onConfirm, onCancel, disabled }) {
  return (
    <div style={{ padding: '8px 14px 12px', borderTop: '0.5px solid var(--color-border-danger)', background: 'var(--color-background-danger)' }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 8px' }}>{message}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} disabled={disabled}
          style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 12, padding: '6px' }}>
          {confirmLabel}
        </button>
        <button onClick={onCancel} style={{ ...btn(), flex: 1, fontSize: 12, padding: '6px' }}>Cancel</button>
      </div>
    </div>
  )
}

function Notice({ msg }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>
      {msg}
    </div>
  )
}
