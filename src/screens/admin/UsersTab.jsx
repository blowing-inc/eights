import { useState, useEffect } from 'react'
import { btn, inp } from '../../styles.js'
import { listUsers, adminResetUser, adminSetSuperHost, slist, adminMergeUsers, getCombatantsByOwnerId, adminLinkGuestToUser } from '../../supabase.js'
import { planMerge, applyMergeToRoom } from '../../adminLogic.js'
import { replacePlayerIdInRoom } from '../../gameLogic.js'

// ─── Pin Reset section ────────────────────────────────────────────────────────

function PinResetSection() {
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

  const filtered = users.filter(u =>
    !search.trim() || u.username.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Reset PIN</h3>
      {msg && <Notice msg={msg} />}
      <input
        style={{ ...inp(), marginBottom: '1rem', fontSize: 14 }}
        placeholder="Search by username…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filtered.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {users.length === 0 ? 'No registered users yet.' : 'No users match that search.'}
        </p>
      )}
      {filtered.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 15, color: 'var(--color-text-primary)' }}>{u.username}</span>
          {u.needs_reset && (
            <span style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>pending reset</span>
          )}
          <button onClick={() => doReset(u.username)} disabled={!!resetting || u.needs_reset}
            style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}>
            {resetting === u.username ? '…' : 'Reset PIN'}
          </button>
        </div>
      ))}
    </>
  )
}

// ─── Merge Accounts section ───────────────────────────────────────────────────

function MergeSection() {
  const [users,    setUsers]    = useState([])
  const [keepId,   setKeepId]   = useState('')
  const [dropId,   setDropId]   = useState('')
  const [preview,  setPreview]  = useState(null)  // null | { affectedRooms, affectedCombatants }
  const [loading,  setLoading]  = useState(false)
  const [merging,  setMerging]  = useState(false)
  const [msg,      setMsg]      = useState('')
  const [error,    setError]    = useState('')

  useEffect(() => { listUsers().then(setUsers) }, [])

  const keepUser = users.find(u => u.id === keepId)
  const dropUser = users.find(u => u.id === dropId)

  async function buildPreview() {
    if (!keepId || !dropId || keepId === dropId) { setError('Select two different accounts.'); return }
    setLoading(true); setError(''); setPreview(null); setMsg('')
    const rooms = await slist()
    const plan = planMerge(keepId, dropId, rooms, []) // combatants count from rooms only
    setPreview(plan)
    setLoading(false)
  }

  async function doMerge() {
    setMerging(true); setError(''); setMsg('')
    try {
      const rooms = await slist()
      await adminMergeUsers(keepId, dropId, rooms, applyMergeToRoom)
      setMsg(`Merged "${dropUser?.username}" into "${keepUser?.username}". The dropped account has been deleted.`)
      setPreview(null); setKeepId(''); setDropId('')
      listUsers().then(setUsers)
    } catch {
      setError('Merge failed. Check the console for details.')
    }
    setMerging(false)
  }

  return (
    <>
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Merge accounts</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
          Transfers all room history and combatants from one account to another, then deletes the source account. Irreversible.
        </p>

        {msg && <Notice msg={msg} />}
        {error && <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 10px' }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Keep (destination)</label>
            <select
              value={keepId}
              onChange={e => { setKeepId(e.target.value); setPreview(null) }}
              style={{ ...inp(), margin: 0, fontSize: 14 }}
            >
              <option value="">— select account to keep —</option>
              {users.filter(u => u.id !== dropId).map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Drop (source, will be deleted)</label>
            <select
              value={dropId}
              onChange={e => { setDropId(e.target.value); setPreview(null) }}
              style={{ ...inp(), margin: 0, fontSize: 14 }}
            >
              <option value="">— select account to remove —</option>
              {users.filter(u => u.id !== keepId).map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
        </div>

        {!preview && (
          <button onClick={buildPreview} disabled={!keepId || !dropId || loading}
            style={{ ...btn('ghost'), padding: '7px 16px', fontSize: 13, width: 'auto' }}>
            {loading ? 'Checking…' : 'Preview merge'}
          </button>
        )}

        {preview && (
          <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginTop: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 4px', fontWeight: 500 }}>
              Merge preview
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>
              "{dropUser?.username}" → "{keepUser?.username}": {preview.affectedRooms} room{preview.affectedRooms !== 1 ? 's' : ''} affected.
              The account "{dropUser?.username}" will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doMerge} disabled={merging}
                style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-warning)', fontSize: 13, padding: '8px' }}>
                {merging ? 'Merging…' : 'Confirm merge'}
              </button>
              <button onClick={() => setPreview(null)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '8px' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Re-attribute guest history ───────────────────────────────────────────────
//
// Admin workflow:
//   1. Use Inspector tab to look up the room → find the guest's player id in JSON
//   2. Paste that id here, preview what will move, pick a destination account, confirm

function GuestSection() {
  const [users,      setUsers]      = useState([])
  const [guestId,    setGuestId]    = useState('')
  const [destId,     setDestId]     = useState('')
  const [preview,    setPreview]    = useState(null)  // { combatants, affectedRooms }
  const [loading,    setLoading]    = useState(false)
  const [linking,    setLinking]    = useState(false)
  const [msg,        setMsg]        = useState('')
  const [error,      setError]      = useState('')

  useEffect(() => { listUsers().then(setUsers) }, [])

  const destUser = users.find(u => u.id === destId)

  async function buildPreview() {
    const id = guestId.trim()
    if (!id) { setError('Enter a guest ID.'); return }
    if (!destId) { setError('Select a destination account.'); return }
    setLoading(true); setError(''); setPreview(null); setMsg('')
    const [combatants, rooms] = await Promise.all([
      getCombatantsByOwnerId(id),
      slist(),
    ])
    const affectedRooms = rooms.filter(r => (r.players || []).some(p => p.id === id))
    setPreview({ combatants, affectedRooms, rooms })
    setLoading(false)
  }

  async function doLink() {
    if (!preview || !destUser) return
    setLinking(true); setError(''); setMsg('')
    try {
      await adminLinkGuestToUser(guestId.trim(), destUser.id, destUser.username, preview.rooms, replacePlayerIdInRoom)
      setMsg(`Done. ${preview.combatants.length} combatant${preview.combatants.length !== 1 ? 's' : ''} and ${preview.affectedRooms.length} room${preview.affectedRooms.length !== 1 ? 's' : ''} moved to "${destUser.username}".`)
      setPreview(null); setGuestId(''); setDestId('')
    } catch {
      setError('Link failed. Check the console for details.')
    }
    setLinking(false)
  }

  return (
    <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Re-attribute guest history</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        Find the guest's player ID in the Inspector tab, then assign their combatants and room history to a registered account.
      </p>

      {msg   && <Notice msg={msg} />}
      {error && <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 10px' }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Guest ID (from Inspector)</label>
          <input
            style={{ ...inp(), margin: 0, fontSize: 13, fontFamily: 'monospace' }}
            placeholder="e.g. abc1234"
            value={guestId}
            onChange={e => { setGuestId(e.target.value); setPreview(null) }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Destination account</label>
          <select
            value={destId}
            onChange={e => { setDestId(e.target.value); setPreview(null) }}
            style={{ ...inp(), margin: 0, fontSize: 14 }}
          >
            <option value="">— select account —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </div>
      </div>

      {!preview && (
        <button onClick={buildPreview} disabled={!guestId.trim() || !destId || loading}
          style={{ ...btn('ghost'), padding: '7px 16px', fontSize: 13, width: 'auto' }}>
          {loading ? 'Looking up…' : 'Preview'}
        </button>
      )}

      {preview && (
        <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginTop: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 4px', fontWeight: 500 }}>Preview</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>
            Guest ID <code style={{ fontFamily: 'monospace' }}>{guestId.trim()}</code>:{' '}
            {preview.combatants.length} combatant{preview.combatants.length !== 1 ? 's' : ''},{' '}
            {preview.affectedRooms.length} room{preview.affectedRooms.length !== 1 ? 's' : ''} →{' '}
            "{destUser?.username}"
            {preview.combatants.length === 0 && preview.affectedRooms.length === 0 && (
              <span> — nothing found for this ID. Double-check it in the Inspector.</span>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doLink} disabled={linking || (preview.combatants.length === 0 && preview.affectedRooms.length === 0)}
              style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-warning)', fontSize: 13, padding: '8px' }}>
              {linking ? 'Linking…' : 'Confirm'}
            </button>
            <button onClick={() => setPreview(null)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '8px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Super Hosts section ──────────────────────────────────────────────────────

function SuperHostSection() {
  const [users,    setUsers]    = useState([])
  const [search,   setSearch]   = useState('')
  const [saving,   setSaving]   = useState(null)
  const [msg,      setMsg]      = useState('')

  useEffect(() => { listUsers().then(setUsers) }, [])

  async function toggle(user) {
    setSaving(user.id); setMsg('')
    await adminSetSuperHost(user.id, !user.is_super_host)
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_super_host: !u.is_super_host } : u))
    setMsg(!user.is_super_host
      ? `${user.username} is now a Super Host.`
      : `${user.username} is no longer a Super Host.`)
    setSaving(null)
  }

  const filtered = users.filter(u =>
    !search.trim() || u.username.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Super Hosts</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        Trusted users who can edit tags on any entity, manage group memberships, curate arena pools, merge tags globally, and induct combatants into the Hall of Fame.
      </p>
      {msg && <Notice msg={msg} />}
      <input
        style={{ ...inp(), marginBottom: '1rem', fontSize: 14 }}
        placeholder="Search by username…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filtered.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {users.length === 0 ? 'No registered users yet.' : 'No users match that search.'}
        </p>
      )}
      {filtered.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 15, color: 'var(--color-text-primary)' }}>{u.username}</span>
          {u.is_super_host && (
            <span style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)' }}>Super Host</span>
          )}
          <button onClick={() => toggle(u)} disabled={saving === u.id}
            style={{ ...btn(u.is_super_host ? 'ghost' : 'primary'), padding: '4px 10px', fontSize: 12 }}>
            {saving === u.id ? '…' : u.is_super_host ? 'Revoke' : 'Grant'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function UsersTab() {
  return (
    <>
      <PinResetSection />
      <SuperHostSection />
      <MergeSection />
      <GuestSection />
    </>
  )
}

function Notice({ msg }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>
      {msg}
    </div>
  )
}
