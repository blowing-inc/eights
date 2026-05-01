import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import TagInput from '../components/TagInput.jsx'
import TagChips from '../components/TagChips.jsx'
import { btn, tab, inp, lbl } from '../styles.js'
import { uid } from '../gameLogic.js'
import {
  getWorkshopCombatants,
  createWorkshopCombatant,
  updateWorkshopCombatant,
  setWorkshopCombatantStatus,
  deleteWorkshopCombatant,
  getGroupsForPicker,
  getCombatantGroupIds,
  setCombatantGroups,
  getWorkshopArenas,
  createWorkshopArena,
  updateWorkshopArena,
  setWorkshopArenaStatus,
  deleteWorkshopArena,
  getWorkshopPlaylists,
  createWorkshopPlaylist,
  updateWorkshopPlaylist,
  setWorkshopPlaylistStatus,
  deleteWorkshopPlaylist,
  getPlaylistWithSlots,
  setPlaylistSlots,
  getArenaPickerOptions,
  createWorkshopGroup,
  getWorkshopGroups,
  updateWorkshopGroup,
  setWorkshopGroupStatus,
  deleteWorkshopGroup,
  setGroupCombatants,
  getGroupCombatantIds,
  getCombatantPickerOptions,
} from '../supabase.js'

// ─── Guest gate ───────────────────────────────────────────────────────────────

function GuestGate({ onLogin }) {
  return (
    <Screen title="My Workshop" onBack={null}>
      <div style={{ padding: '2rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 36 }}>🔧</div>
        <p style={{ color: 'var(--color-text-primary)', fontSize: 15, margin: 0, fontWeight: 500 }}>
          Build your bench before the battle.
        </p>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: 0, maxWidth: 280 }}>
          Log in to create combatants, stash them privately, and bring them out when you're ready.
        </p>
        <button onClick={onLogin} style={{ ...btn('primary'), maxWidth: 200 }}>
          Log in / Register
        </button>
      </div>
    </Screen>
  )
}

// ─── Group picker ─────────────────────────────────────────────────────────────

function GroupPicker({ selectedIds, onChange, ownerId }) {
  const [available, setAvailable] = useState(null)  // null = loading

  useEffect(() => {
    getGroupsForPicker(ownerId).then(setAvailable)
  }, [ownerId])

  if (available === null) return <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>Loading groups…</p>

  if (available.length === 0) return (
    <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
      No groups yet. Create groups in the Workshop to assign combatants to them.
    </p>
  )

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {available.map(g => {
        const active = selectedIds.includes(g.id)
        return (
          <button
            key={g.id}
            onClick={() => toggle(g.id)}
            style={{
              ...btn('ghost'),
              padding: '4px 12px',
              fontSize: 12,
              background:  active ? 'var(--color-background-info)' : 'transparent',
              color:       active ? 'var(--color-text-info)'       : 'var(--color-text-secondary)',
              borderColor: active ? 'var(--color-border-info)'     : 'var(--color-border-tertiary)',
            }}
          >
            {g.name}
          </button>
        )
      })}
    </div>
  )
}

// ─── Combatant form ───────────────────────────────────────────────────────────

function CombatantForm({ existing, onSave, onCancel, currentUser }) {
  const isEdit      = !!existing
  const isPublished = existing?.status === 'published'

  const [name,       setName]       = useState(existing?.name   || '')
  const [bio,        setBio]        = useState(existing?.bio    || '')
  const [tags,       setTags]       = useState(existing?.tags   || [])
  const [groupIds,     setGroupIds]     = useState([])
  const initialGroupIds               = useRef(null)  // set once when memberships load
  const [status,       setStatus]     = useState(existing?.status || 'stashed')
  const [saving,       setSaving]     = useState(false)
  const [confirm,      setConfirm]    = useState(false)  // bio-edit confirm for published
  const [error,        setError]      = useState('')

  // Load existing group memberships when editing
  useEffect(() => {
    if (existing?.id) {
      getCombatantGroupIds(existing.id).then(ids => {
        setGroupIds(ids)
        initialGroupIds.current = ids
      })
    }
  }, [existing?.id])

  const bioChanged    = isEdit && bio.trim() !== (existing.bio || '').trim()
  const nameChanged   = isEdit && name.trim() !== existing.name.trim()
  const tagsChanged   = isEdit && JSON.stringify(tags) !== JSON.stringify(existing.tags || [])
  const groupsChanged = isEdit && initialGroupIds.current !== null &&
    JSON.stringify([...groupIds].sort()) !== JSON.stringify([...initialGroupIds.current].sort())
  const hasChanges    = !isEdit || nameChanged || bioChanged || tagsChanged || groupsChanged

  function validate() {
    if (!name.trim()) { setError('Name is required.'); return false }
    return true
  }

  async function handleSave() {
    if (!validate()) return
    // For published combatants with a bio edit, require one-step confirm
    if (isEdit && isPublished && bioChanged && !confirm) {
      setConfirm(true); return
    }
    setSaving(true); setError('')
    if (isEdit) {
      const bioHistoryEntry = {
        name: existing.name,
        bio: existing.bio || '',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.username,
      }
      const [ok] = await Promise.all([
        updateWorkshopCombatant(
          existing.id,
          { name: name.trim(), bio: bio.trim(), tags },
          bioHistoryEntry,
          existing.bio_history || [],
        ),
        setCombatantGroups(existing.id, groupIds, currentUser.id),
      ])
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({ ...existing, name: name.trim(), bio: bio.trim(), tags, groupIds, bio_history: [...(existing.bio_history || []), bioHistoryEntry].slice(-20) })
    } else {
      const id  = uid()
      const ok  = await createWorkshopCombatant({
        id, name: name.trim(), bio: bio.trim(), tags,
        ownerId: currentUser.id, ownerName: currentUser.username,
        status,
      })
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      // Set group memberships after the combatant row exists
      if (groupIds.length) await setCombatantGroups(id, groupIds, currentUser.id)
      onSave({ id, name: name.trim(), bio: bio.trim(), tags, groupIds, status, source: 'created', wins: 0, losses: 0, draws: 0, bio_history: [], owner_id: currentUser.id, owner_name: currentUser.username, lineage: null })
    }
    setSaving(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 1.25rem', color: 'var(--color-text-primary)' }}>
        {isEdit ? 'Edit combatant' : 'New combatant'}
      </h3>

      <label style={lbl}>Name *</label>
      <input
        style={inp()}
        placeholder="What is this fighter called?"
        value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        maxLength={80}
        autoFocus={!isEdit}
      />

      <label style={lbl}>Bio</label>
      <textarea
        style={{ ...inp(), minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
        placeholder="Give them a line. Even one sentence."
        value={bio}
        onChange={e => { setBio(e.target.value); setError(''); setConfirm(false) }}
        maxLength={500}
      />
      {!bio.trim() && (
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '-8px 0 12px' }}>
          No bio yet — you can add one before they fight.
        </p>
      )}

      <label style={lbl}>Tags</label>
      <div style={{ marginBottom: 12 }}>
        <TagInput value={tags} onChange={setTags} />
      </div>

      <label style={lbl}>Groups</label>
      <GroupPicker selectedIds={groupIds} onChange={setGroupIds} ownerId={currentUser.id} />

      {!isEdit && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, marginBottom: 8 }}>Visibility</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setStatus('stashed')}
              style={{ ...tab(status === 'stashed'), fontSize: 13, padding: '6px 14px' }}
            >
              Stash (private)
            </button>
            <button
              onClick={() => setStatus('published')}
              style={{ ...tab(status === 'published'), fontSize: 13, padding: '6px 14px' }}
            >
              Publish now
            </button>
          </div>
          {status === 'stashed' && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>
              Only you can see this until you publish it.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {confirm && (
        <div style={{ background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-primary)' }}>
            This combatant is published — your bio edit will be public. Continue?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btn('primary'), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              {saving ? 'Saving…' : 'Yes, save'}
            </button>
            <button onClick={() => setConfirm(false)} style={{ ...btn(), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving || !hasChanges} style={{ ...btn('primary'), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            {saving ? 'Saving…' : isEdit ? 'Save' : status === 'published' ? 'Create & publish' : 'Add to stash'}
          </button>
          <button onClick={onCancel} style={{ ...btn(), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Arena form ───────────────────────────────────────────────────────────────

function ArenaForm({ existing, onSave, onCancel, currentUser }) {
  const isEdit      = !!existing
  const isPublished = existing?.status === 'published'

  const [name,    setName]    = useState(existing?.name    || '')
  const [bio,     setBio]     = useState(existing?.bio     || '')
  const [rules,   setRules]   = useState(existing?.rules   || '')
  const [tags,    setTags]    = useState(existing?.tags    || [])
  const [status,  setStatus]  = useState(existing?.status  || 'stashed')
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error,   setError]   = useState('')

  const bioChanged   = isEdit && bio.trim()   !== (existing.bio   || '').trim()
  const nameChanged  = isEdit && name.trim()  !== existing.name.trim()
  const rulesChanged = isEdit && rules.trim() !== (existing.rules || '').trim()
  const tagsChanged  = isEdit && JSON.stringify(tags) !== JSON.stringify(existing.tags || [])
  const hasChanges   = !isEdit || nameChanged || bioChanged || rulesChanged || tagsChanged

  function validate() {
    if (!name.trim()) { setError('Name is required.'); return false }
    if (!bio.trim())  { setError('Description is required.'); return false }
    return true
  }

  async function handleSave() {
    if (!validate()) return
    if (isEdit && isPublished && bioChanged && !confirm) {
      setConfirm(true); return
    }
    setSaving(true); setError('')
    if (isEdit) {
      const bioHistoryEntry = {
        name: existing.name,
        bio:  existing.bio || '',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.username,
      }
      const ok = await updateWorkshopArena(
        existing.id,
        { name: name.trim(), bio: bio.trim(), rules: rules.trim(), tags },
        bioHistoryEntry,
        existing.bio_history || [],
      )
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({
        ...existing,
        name:  name.trim(),
        bio:   bio.trim(),
        rules: rules.trim(),
        tags,
        bio_history: [...(existing.bio_history || []), bioHistoryEntry].slice(-20),
      })
    } else {
      const id = uid()
      const ok = await createWorkshopArena({
        id, name: name.trim(), bio: bio.trim(), rules: rules.trim(), tags,
        ownerId: currentUser.id, ownerName: currentUser.username,
        status,
      })
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({
        id, name: name.trim(), bio: bio.trim(), rules: rules.trim(), tags,
        status, bio_history: [],
        owner_id: currentUser.id, owner_name: currentUser.username,
      })
    }
    setSaving(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 1.25rem', color: 'var(--color-text-primary)' }}>
        {isEdit ? 'Edit arena' : 'New arena'}
      </h3>

      <label style={lbl}>Name *</label>
      <input
        style={inp()}
        placeholder="What is this place called?"
        value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        maxLength={80}
        autoFocus={!isEdit}
      />

      <label style={lbl}>Description *</label>
      <textarea
        style={{ ...inp(), minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
        placeholder="The setting, the vibe, what makes this place interesting."
        value={bio}
        onChange={e => { setBio(e.target.value); setError(''); setConfirm(false) }}
        maxLength={500}
      />

      <label style={lbl}>House rules</label>
      <textarea
        style={{ ...inp(), minHeight: 60, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
        placeholder="Optional rules for fights in this arena. Not enforced by the app."
        value={rules}
        onChange={e => { setRules(e.target.value); setError('') }}
        maxLength={300}
      />
      {!rules.trim() && (
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '-8px 0 12px' }}>
          Leave blank if there are no special rules.
        </p>
      )}

      <label style={lbl}>Tags</label>
      <div style={{ marginBottom: 12 }}>
        <TagInput value={tags} onChange={setTags} />
      </div>

      {!isEdit && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, marginBottom: 8 }}>Visibility</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setStatus('stashed')}
              style={{ ...tab(status === 'stashed'), fontSize: 13, padding: '6px 14px' }}
            >
              Stash (private)
            </button>
            <button
              onClick={() => setStatus('published')}
              style={{ ...tab(status === 'published'), fontSize: 13, padding: '6px 14px' }}
            >
              Publish now
            </button>
          </div>
          {status === 'stashed' && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>
              Only you can see this until you publish it.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {confirm && (
        <div style={{ background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-primary)' }}>
            This arena is published — your description edit will be public. Continue?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btn('primary'), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              {saving ? 'Saving…' : 'Yes, save'}
            </button>
            <button onClick={() => setConfirm(false)} style={{ ...btn(), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving || !hasChanges} style={{ ...btn('primary'), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            {saving ? 'Saving…' : isEdit ? 'Save' : status === 'published' ? 'Create & publish' : 'Add to stash'}
          </button>
          <button onClick={onCancel} style={{ ...btn(), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Combatant Workshop card ──────────────────────────────────────────────────

function WorkshopCard({ combatant, onEdit, onPublish, onUnpublish, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isStashed   = combatant.status === 'stashed'
  const isPublished = combatant.status === 'published'
  const hasRecord   = (combatant.wins || 0) + (combatant.losses || 0) + (combatant.draws || 0) > 0

  return (
    <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{combatant.name}</span>
            {isStashed && (
              <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>
                🔒 stashed
              </span>
            )}
            {isPublished && (
              <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', color: 'var(--color-text-success)' }}>
                published
              </span>
            )}
          </div>
          {combatant.bio && (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {combatant.bio}
            </p>
          )}
          {combatant.tags?.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <TagChips tags={combatant.tags} />
            </div>
          )}
          {hasRecord && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>
              {combatant.wins}W – {combatant.losses}L{combatant.draws > 0 ? ` – ${combatant.draws}D` : ''}
            </p>
          )}
        </div>
      </div>

      {confirmDelete ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Delete permanently?</span>
          <button onClick={() => onDelete(combatant)} style={{ ...btn(), padding: '4px 12px', fontSize: 12, width: 'auto', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Keep</button>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => onEdit(combatant)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Edit</button>
          {isStashed && (
            <button onClick={() => onPublish(combatant)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-success)', borderColor: 'var(--color-border-success)' }}>Publish</button>
          )}
          {isPublished && (
            <button onClick={() => onUnpublish(combatant)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Move to stash</button>
          )}
          {isStashed && (
            <button onClick={() => setConfirmDelete(true)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Arena Workshop card ──────────────────────────────────────────────────────

function ArenaCard({ arena, onEdit, onPublish, onUnpublish, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isStashed   = arena.status === 'stashed'
  const isPublished = arena.status === 'published'

  return (
    <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{arena.name}</span>
          {isStashed && (
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>
              🔒 stashed
            </span>
          )}
          {isPublished && (
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', color: 'var(--color-text-success)' }}>
              published
            </span>
          )}
        </div>
        {arena.bio && (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {arena.bio}
          </p>
        )}
        {arena.rules && (
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0', fontStyle: 'italic' }}>
            Rules: {arena.rules.length > 80 ? arena.rules.slice(0, 80) + '…' : arena.rules}
          </p>
        )}
        {arena.tags?.length > 0 && (
          <div style={{ marginTop: 5 }}>
            <TagChips tags={arena.tags} />
          </div>
        )}
      </div>

      {confirmDelete ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Delete permanently?</span>
          <button onClick={() => onDelete(arena)} style={{ ...btn(), padding: '4px 12px', fontSize: 12, width: 'auto', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Keep</button>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => onEdit(arena)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Edit</button>
          {isStashed && (
            <button onClick={() => onPublish(arena)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-success)', borderColor: 'var(--color-border-success)' }}>Publish</button>
          )}
          {isPublished && (
            <button onClick={() => onUnpublish(arena)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Move to stash</button>
          )}
          {isStashed && (
            <button onClick={() => setConfirmDelete(true)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Playlist slot list ───────────────────────────────────────────────────────

function SlotList({ slots, onRemove, onMoveUp, onMoveDown }) {
  if (!slots.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        No arenas added yet. Search above to add slots.
      </p>
    )
  }
  return (
    <div style={{ marginBottom: 12 }}>
      {slots.map((slot, i) => (
        <div key={`${slot.arena_id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginBottom: 4, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{slot.arenaName}</span>
            {slot.arenaStatus === 'stashed' && (
              <span style={{ fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>stashed</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={() => onMoveUp(i)} disabled={i === 0} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
            <button onClick={() => onMoveDown(i)} disabled={i === slots.length - 1} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12, opacity: i === slots.length - 1 ? 0.3 : 1 }}>↓</button>
            <button onClick={() => onRemove(i)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>×</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Playlist form ────────────────────────────────────────────────────────────

function PlaylistForm({ existing, onSave, onCancel, currentUser }) {
  const isEdit      = !!existing
  const isPublished = existing?.status === 'published'

  const [name,        setName]        = useState(existing?.name   || '')
  const [tags,        setTags]        = useState(existing?.tags   || [])
  const [slots,       setSlots]       = useState([])         // [{ arena_id, arenaName, arenaBio, arenaStatus }]
  const [slotsLoaded, setSlotsLoaded] = useState(!isEdit)    // new form has nothing to load
  const [status,      setStatus]      = useState(existing?.status || 'stashed')
  const [saving,      setSaving]      = useState(false)
  const [confirm,     setConfirm]     = useState(false)
  const [error,       setError]       = useState('')

  // Arena picker state
  const [arenaSearch,  setArenaSearch]  = useState('')
  const [arenas,       setArenas]       = useState([])
  const [arenasLoaded, setArenasLoaded] = useState(false)
  const [showPicker,   setShowPicker]   = useState(false)

  const initialSlotIdsRef = useRef(null)

  // Load arena picker options
  useEffect(() => {
    getArenaPickerOptions(currentUser.id).then(data => { setArenas(data); setArenasLoaded(true) })
  }, [currentUser.id])

  // Load existing slots when editing
  useEffect(() => {
    if (!existing?.id) return
    getPlaylistWithSlots(existing.id).then(full => {
      if (!full) return
      const loaded = full.slots || []
      setSlots(loaded)
      initialSlotIdsRef.current = loaded.map(s => s.arena_id)
      setSlotsLoaded(true)
    })
  }, [existing?.id])

  const initialSlotIds = initialSlotIdsRef.current || []
  const currentSlotIds = slots.map(s => s.arena_id)

  const hasChanges = !isEdit || (
    name.trim() !== existing.name.trim() ||
    JSON.stringify(tags) !== JSON.stringify(existing.tags || []) ||
    JSON.stringify(currentSlotIds) !== JSON.stringify(initialSlotIds)
  )

  const filteredArenas = (arenaSearch.trim()
    ? arenas.filter(a => a.name.toLowerCase().includes(arenaSearch.toLowerCase()) || (a.bio || '').toLowerCase().includes(arenaSearch.toLowerCase()))
    : arenas
  ).filter(a => !slots.find(s => s.arena_id === a.id))

  function addSlot(arena) {
    setSlots(prev => [...prev, { arena_id: arena.id, arenaName: arena.name, arenaBio: arena.bio || '', arenaStatus: arena.status }])
    setArenaSearch('')
    setShowPicker(false)
  }

  function removeSlot(idx)  { setSlots(prev => prev.filter((_, i) => i !== idx)) }

  function moveUp(idx) {
    if (idx === 0) return
    setSlots(prev => { const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next })
  }

  function moveDown(idx) {
    setSlots(prev => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next
    })
  }

  function validate() {
    if (!name.trim()) { setError('Name is required.'); return false }
    return true
  }

  async function handleSave() {
    if (!validate()) return
    if (isEdit && isPublished && !confirm) { setConfirm(true); return }
    setSaving(true); setError('')
    const arenaIds = slots.map(s => s.arena_id)
    if (isEdit) {
      const ok = await updateWorkshopPlaylist(existing.id, { name: name.trim(), tags })
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      const slotsOk = await setPlaylistSlots(existing.id, arenaIds)
      if (!slotsOk) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({ ...existing, name: name.trim(), tags, slot_count: slots.length })
    } else {
      const id = await createWorkshopPlaylist({ name: name.trim(), tags, ownerId: currentUser.id, ownerName: currentUser.username, status })
      if (!id) { setError('Save failed. Try again.'); setSaving(false); return }
      if (arenaIds.length) await setPlaylistSlots(id, arenaIds)
      onSave({ id, name: name.trim(), tags, status, slot_count: arenaIds.length, owner_id: currentUser.id, owner_name: currentUser.username })
    }
    setSaving(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 1.25rem', color: 'var(--color-text-primary)' }}>
        {isEdit ? 'Edit playlist' : 'New playlist'}
      </h3>

      <label style={lbl}>Name *</label>
      <input
        style={inp()}
        placeholder="What is this playlist called?"
        value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        maxLength={80}
        autoFocus={!isEdit}
      />

      <label style={lbl}>Arena slots</label>
      {isEdit && !slotsLoaded ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>Loading slots…</p>
      ) : (
        <SlotList slots={slots} onRemove={removeSlot} onMoveUp={moveUp} onMoveDown={moveDown} />
      )}

      {/* Arena picker */}
      {showPicker ? (
        <div style={{ marginBottom: 12 }}>
          <input
            style={{ ...inp(), margin: '0 0 6px', fontSize: 14 }}
            value={arenaSearch}
            onChange={e => setArenaSearch(e.target.value)}
            placeholder="Search arenas…"
            autoFocus
          />
          {!arenasLoaded ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
          ) : filteredArenas.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
              {arenas.length === 0 ? 'No arenas yet — create one in the Arenas tab first.' : 'No arenas match.'}
            </p>
          ) : (
            <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
              {filteredArenas.map((arena, i) => (
                <button
                  key={arena.id}
                  onClick={() => addSlot(arena)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: i % 2 === 0 ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{arena.name}</span>
                    {arena.status === 'stashed' && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>stashed</span>
                    )}
                  </div>
                  {arena.bio && (
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arena.bio}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setShowPicker(false); setArenaSearch('') }} style={{ ...btn('ghost'), marginTop: 6, padding: '4px 12px', fontSize: 12 }}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setShowPicker(true)} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13, marginBottom: 12 }}>
          + Add arena slot
        </button>
      )}

      <label style={lbl}>Tags</label>
      <div style={{ marginBottom: 12 }}>
        <TagInput value={tags} onChange={setTags} />
      </div>

      {!isEdit && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, marginBottom: 8 }}>Visibility</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStatus('stashed')} style={{ ...tab(status === 'stashed'), fontSize: 13, padding: '6px 14px' }}>
              Stash (private)
            </button>
            <button onClick={() => setStatus('published')} style={{ ...tab(status === 'published'), fontSize: 13, padding: '6px 14px' }}>
              Publish now
            </button>
          </div>
          {status === 'stashed' && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>
              Only you can see this until you publish it.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {confirm && (
        <div style={{ background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-primary)' }}>
            This playlist is published — your edits will be public. Continue?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btn('primary'), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              {saving ? 'Saving…' : 'Yes, save'}
            </button>
            <button onClick={() => setConfirm(false)} style={{ ...btn(), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving || !hasChanges || (isEdit && !slotsLoaded)} style={{ ...btn('primary'), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            {saving ? 'Saving…' : isEdit ? 'Save' : status === 'published' ? 'Create & publish' : 'Add to stash'}
          </button>
          <button onClick={onCancel} style={{ ...btn(), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Playlist Workshop card ───────────────────────────────────────────────────

function PlaylistCard({ playlist, onEdit, onPublish, onUnpublish, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isStashed   = playlist.status === 'stashed'
  const isPublished = playlist.status === 'published'

  return (
    <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{playlist.name}</span>
        {isStashed && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>
            🔒 stashed
          </span>
        )}
        {isPublished && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', color: 'var(--color-text-success)' }}>
            published
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '3px 0 0' }}>
        {playlist.slot_count} {playlist.slot_count === 1 ? 'arena' : 'arenas'}
      </p>
      {playlist.tags?.length > 0 && (
        <div style={{ marginTop: 5 }}>
          <TagChips tags={playlist.tags} />
        </div>
      )}

      {confirmDelete ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Delete permanently?</span>
          <button onClick={() => onDelete(playlist)} style={{ ...btn(), padding: '4px 12px', fontSize: 12, width: 'auto', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Keep</button>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => onEdit(playlist)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Edit</button>
          {isStashed && (
            <button onClick={() => onPublish(playlist)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-success)', borderColor: 'var(--color-border-success)' }}>Publish</button>
          )}
          {isPublished && (
            <button onClick={() => onUnpublish(playlist)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Move to stash</button>
          )}
          {isStashed && (
            <button onClick={() => setConfirmDelete(true)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group member list ────────────────────────────────────────────────────────

function MemberList({ members, onRemove }) {
  if (!members.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        No members yet. Search below to add combatants.
      </p>
    )
  }
  return (
    <div style={{ marginBottom: 8 }}>
      {members.map(m => (
        <div key={m.combatant_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', marginBottom: 4, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{m.combatantName}</span>
            {m.combatantStatus === 'stashed' && (
              <span style={{ fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>stashed</span>
            )}
          </div>
          <button onClick={() => onRemove(m.combatant_id)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>×</button>
        </div>
      ))}
    </div>
  )
}

// ─── Group form ───────────────────────────────────────────────────────────────

function GroupForm({ existing, onSave, onCancel, currentUser }) {
  const isEdit      = !!existing
  const isPublished = existing?.status === 'published'

  const [name,          setName]          = useState(existing?.name        || '')
  const [description,   setDescription]   = useState(existing?.description || '')
  const [tags,          setTags]          = useState(existing?.tags        || [])
  const [members,       setMembers]       = useState([])   // [{ combatant_id, combatantName, combatantStatus }]
  const [membersLoaded, setMembersLoaded] = useState(!isEdit)
  const [status,        setStatus]        = useState(existing?.status || 'stashed')
  const [saving,        setSaving]        = useState(false)
  const [confirm,       setConfirm]       = useState(false)
  const [error,         setError]         = useState('')

  const [combatants,       setCombatants]       = useState([])
  const [combatantsLoaded, setCombatantsLoaded] = useState(false)
  const [combatantSearch,  setCombatantSearch]  = useState('')
  const [showPicker,       setShowPicker]       = useState(false)
  const [initMemberIds,    setInitMemberIds]    = useState(null)  // null = still loading

  // Load picker options on mount
  useEffect(() => {
    getCombatantPickerOptions(currentUser.id).then(data => { setCombatants(data); setCombatantsLoaded(true) })
  }, [currentUser.id])

  // Load existing member IDs when editing
  useEffect(() => {
    if (!existing?.id) return
    getGroupCombatantIds(existing.id).then(setInitMemberIds)
  }, [existing?.id])

  // Build member display list once both data sets are ready
  useEffect(() => {
    if (!isEdit || !combatantsLoaded || initMemberIds === null || membersLoaded) return
    const combatantMap = Object.fromEntries(combatants.map(c => [c.id, c]))
    setMembers(initMemberIds.map(id => ({
      combatant_id:     id,
      combatantName:    combatantMap[id]?.name   || 'Unknown',
      combatantStatus:  combatantMap[id]?.status || 'published',
    })))
    setMembersLoaded(true)
  }, [isEdit, combatantsLoaded, initMemberIds, membersLoaded, combatants])

  const currentMemberIds = members.map(m => m.combatant_id)
  const nameChanged      = isEdit && name.trim()        !== existing.name.trim()
  const descChanged      = isEdit && description.trim() !== (existing.description || '').trim()
  const tagsChanged      = isEdit && JSON.stringify(tags) !== JSON.stringify(existing.tags || [])
  const membersChanged   = isEdit && membersLoaded && initMemberIds !== null &&
    JSON.stringify([...currentMemberIds].sort()) !== JSON.stringify([...initMemberIds].sort())
  const hasChanges       = !isEdit || nameChanged || descChanged || tagsChanged || membersChanged

  const filteredCombatants = (combatantSearch.trim()
    ? combatants.filter(c => c.name.toLowerCase().includes(combatantSearch.toLowerCase()))
    : combatants
  ).filter(c => !members.find(m => m.combatant_id === c.id))

  function addMember(combatant) {
    setMembers(prev => [...prev, { combatant_id: combatant.id, combatantName: combatant.name, combatantStatus: combatant.status }])
    setCombatantSearch('')
    setShowPicker(false)
  }

  function removeMember(combatantId) {
    setMembers(prev => prev.filter(m => m.combatant_id !== combatantId))
  }

  function validate() {
    if (!name.trim())        { setError('Name is required.');        return false }
    if (!description.trim()) { setError('Description is required.'); return false }
    return true
  }

  async function handleSave() {
    if (!validate()) return
    if (isEdit && isPublished && descChanged && !confirm) {
      setConfirm(true); return
    }
    setSaving(true); setError('')
    const memberIds = members.map(m => m.combatant_id)
    if (isEdit) {
      const [ok] = await Promise.all([
        updateWorkshopGroup(existing.id, { name: name.trim(), description: description.trim(), tags }),
        setGroupCombatants(existing.id, memberIds, currentUser.id),
      ])
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({ ...existing, name: name.trim(), description: description.trim(), tags, member_count: memberIds.length })
    } else {
      const id = uid()
      const ok = await createWorkshopGroup({
        id, name: name.trim(), description: description.trim(), tags,
        ownerId: currentUser.id, ownerName: currentUser.username,
        status,
      })
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      if (memberIds.length) await setGroupCombatants(id, memberIds, currentUser.id)
      onSave({ id, name: name.trim(), description: description.trim(), tags, status, member_count: memberIds.length, owner_id: currentUser.id, owner_name: currentUser.username })
    }
    setSaving(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 1.25rem', color: 'var(--color-text-primary)' }}>
        {isEdit ? 'Edit group' : 'New group'}
      </h3>

      <label style={lbl}>Name *</label>
      <input
        style={inp()}
        placeholder="What is this group called?"
        value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        maxLength={80}
        autoFocus={!isEdit}
      />

      <label style={lbl}>Description *</label>
      <textarea
        style={{ ...inp(), minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
        placeholder="What's the joke? What's the theme? What do these fighters have in common?"
        value={description}
        onChange={e => { setDescription(e.target.value); setError(''); setConfirm(false) }}
        maxLength={500}
      />

      <label style={lbl}>Members</label>
      {isEdit && !membersLoaded ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>Loading members…</p>
      ) : (
        <MemberList members={members} onRemove={removeMember} />
      )}

      {showPicker ? (
        <div style={{ marginBottom: 12 }}>
          <input
            style={{ ...inp(), margin: '0 0 6px', fontSize: 14 }}
            value={combatantSearch}
            onChange={e => setCombatantSearch(e.target.value)}
            placeholder="Search combatants…"
            autoFocus
          />
          {!combatantsLoaded ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
          ) : filteredCombatants.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
              {combatants.length === 0 ? 'No combatants yet.' : 'No combatants match.'}
            </p>
          ) : (
            <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
              {filteredCombatants.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => addMember(c)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: i % 2 === 0 ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</span>
                    {c.status === 'stashed' && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>stashed</span>
                    )}
                  </div>
                  {c.bio && (
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.bio}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setShowPicker(false); setCombatantSearch('') }} style={{ ...btn('ghost'), marginTop: 6, padding: '4px 12px', fontSize: 12 }}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setShowPicker(true)} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13, marginBottom: 12 }}>
          + Add member
        </button>
      )}

      <label style={lbl}>Tags</label>
      <div style={{ marginBottom: 12 }}>
        <TagInput value={tags} onChange={setTags} />
      </div>

      {!isEdit && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...lbl, marginBottom: 8 }}>Visibility</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setStatus('stashed')}
              style={{ ...tab(status === 'stashed'), fontSize: 13, padding: '6px 14px' }}
            >
              Stash (private)
            </button>
            <button
              onClick={() => setStatus('published')}
              style={{ ...tab(status === 'published'), fontSize: 13, padding: '6px 14px' }}
            >
              Publish now
            </button>
          </div>
          {status === 'stashed' && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>
              Only you can see this until you publish it.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {confirm && (
        <div style={{ background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-primary)' }}>
            This group is published — your description edit will be public. Continue?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btn('primary'), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              {saving ? 'Saving…' : 'Yes, save'}
            </button>
            <button onClick={() => setConfirm(false)} style={{ ...btn(), padding: '7px 14px', fontSize: 13, width: 'auto' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving || !hasChanges || (isEdit && !membersLoaded)} style={{ ...btn('primary'), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            {saving ? 'Saving…' : isEdit ? 'Save' : status === 'published' ? 'Create & publish' : 'Add to stash'}
          </button>
          <button onClick={onCancel} style={{ ...btn(), width: 'auto', padding: '9px 18px', fontSize: 14 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Group Workshop card ──────────────────────────────────────────────────────

function GroupCard({ group, onEdit, onPublish, onUnpublish, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isStashed   = group.status === 'stashed'
  const isPublished = group.status === 'published'

  return (
    <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{group.name}</span>
        {isStashed && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>
            🔒 stashed
          </span>
        )}
        {isPublished && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', color: 'var(--color-text-success)' }}>
            published
          </span>
        )}
      </div>
      {group.description && (
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {group.description}
        </p>
      )}
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0' }}>
        {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
      </p>
      {group.tags?.length > 0 && (
        <div style={{ marginTop: 5 }}>
          <TagChips tags={group.tags} />
        </div>
      )}

      {confirmDelete ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Delete permanently?</span>
          <button onClick={() => onDelete(group)} style={{ ...btn(), padding: '4px 12px', fontSize: 12, width: 'auto', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Keep</button>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => onEdit(group)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Edit</button>
          {isStashed && (
            <button onClick={() => onPublish(group)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-success)', borderColor: 'var(--color-border-success)' }}>Publish</button>
          )}
          {isPublished && (
            <button onClick={() => onUnpublish(group)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12 }}>Move to stash</button>
          )}
          {isStashed && (
            <button onClick={() => setConfirmDelete(true)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WorkshopScreen({ currentUser, onBack, onLogin }) {
  const [section,    setSection]    = useState('combatants')  // 'combatants' | 'arenas' | 'playlists' | 'groups'
  const [view,       setView]       = useState('library')     // 'library' | 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null)
  const [filter,     setFilter]     = useState('all')         // 'all' | 'stashed' | 'published'

  // Combatant section state
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  // Arena section state
  const [arenaItems,      setArenaItems]      = useState([])
  const [arenaFilter,     setArenaFilter]     = useState('all')
  const [arenaLoading,    setArenaLoading]    = useState(false)
  const [arenaLoaded,     setArenaLoaded]     = useState(false)
  const [arenaEditTarget, setArenaEditTarget] = useState(null)

  // Playlist section state
  const [playlistItems,      setPlaylistItems]      = useState([])
  const [playlistFilter,     setPlaylistFilter]     = useState('all')
  const [playlistLoading,    setPlaylistLoading]    = useState(false)
  const [playlistLoaded,     setPlaylistLoaded]     = useState(false)
  const [playlistEditTarget, setPlaylistEditTarget] = useState(null)

  // Group section state
  const [groupItems,      setGroupItems]      = useState([])
  const [groupFilter,     setGroupFilter]     = useState('all')
  const [groupLoading,    setGroupLoading]    = useState(false)
  const [groupLoaded,     setGroupLoaded]     = useState(false)
  const [groupEditTarget, setGroupEditTarget] = useState(null)

  useEffect(() => {
    if (!currentUser) return
    setLoading(true)
    getWorkshopCombatants(currentUser.id).then(data => {
      setItems(data); setLoading(false)
    })
  }, [currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load arenas on first visit to that section
  useEffect(() => {
    if (!currentUser) return
    if (section !== 'arenas' || arenaLoaded) return
    setArenaLoading(true)
    getWorkshopArenas(currentUser.id).then(data => {
      setArenaItems(data); setArenaLoading(false); setArenaLoaded(true)
    })
  }, [section, arenaLoaded, currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load playlists on first visit to that section
  useEffect(() => {
    if (!currentUser) return
    if (section !== 'playlists' || playlistLoaded) return
    setPlaylistLoading(true)
    getWorkshopPlaylists(currentUser.id).then(data => {
      setPlaylistItems(data); setPlaylistLoading(false); setPlaylistLoaded(true)
    })
  }, [section, playlistLoaded, currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load groups on first visit to that section
  useEffect(() => {
    if (!currentUser) return
    if (section !== 'groups' || groupLoaded) return
    setGroupLoading(true)
    getWorkshopGroups(currentUser.id).then(data => {
      setGroupItems(data); setGroupLoading(false); setGroupLoaded(true)
    })
  }, [section, groupLoaded, currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return <GuestGate onLogin={onLogin} />

  // ── Combatant handlers ──────────────────────────────────────────────────────

  function handleSaved(combatant) {
    if (view === 'create') {
      setItems(prev => [combatant, ...prev])
    } else if (view === 'edit') {
      setItems(prev => prev.map(c => c.id === combatant.id ? combatant : c))
    }
    setView('library')
    setEditTarget(null)
  }

  async function handlePublish(combatant) {
    const ok = await setWorkshopCombatantStatus(combatant.id, 'published')
    if (ok) setItems(prev => prev.map(c => c.id === combatant.id ? { ...c, status: 'published' } : c))
  }

  async function handleUnpublish(combatant) {
    const ok = await setWorkshopCombatantStatus(combatant.id, 'stashed')
    if (ok) setItems(prev => prev.map(c => c.id === combatant.id ? { ...c, status: 'stashed' } : c))
  }

  async function handleDelete(combatant) {
    if (combatant.status !== 'stashed') return
    const ok = await deleteWorkshopCombatant(combatant.id)
    if (ok) setItems(prev => prev.filter(c => c.id !== combatant.id))
  }

  // ── Arena handlers ──────────────────────────────────────────────────────────

  function handleArenaSaved(arena) {
    if (view === 'create') {
      setArenaItems(prev => [arena, ...prev])
    } else if (view === 'edit') {
      setArenaItems(prev => prev.map(a => a.id === arena.id ? arena : a))
    }
    setView('library')
    setArenaEditTarget(null)
  }

  async function handleArenaPublish(arena) {
    const ok = await setWorkshopArenaStatus(arena.id, 'published')
    if (ok) setArenaItems(prev => prev.map(a => a.id === arena.id ? { ...a, status: 'published' } : a))
  }

  async function handleArenaUnpublish(arena) {
    const ok = await setWorkshopArenaStatus(arena.id, 'stashed')
    if (ok) setArenaItems(prev => prev.map(a => a.id === arena.id ? { ...a, status: 'stashed' } : a))
  }

  async function handleArenaDelete(arena) {
    if (arena.status !== 'stashed') return
    const ok = await deleteWorkshopArena(arena.id)
    if (ok) setArenaItems(prev => prev.filter(a => a.id !== arena.id))
  }

  // ── Playlist handlers ──────────────────────────────────────────────────────

  function handlePlaylistSaved(playlist) {
    if (view === 'create') {
      setPlaylistItems(prev => [playlist, ...prev])
    } else if (view === 'edit') {
      setPlaylistItems(prev => prev.map(p => p.id === playlist.id ? playlist : p))
    }
    setView('library')
    setPlaylistEditTarget(null)
  }

  async function handlePlaylistPublish(playlist) {
    const ok = await setWorkshopPlaylistStatus(playlist.id, 'published')
    if (ok) setPlaylistItems(prev => prev.map(p => p.id === playlist.id ? { ...p, status: 'published' } : p))
  }

  async function handlePlaylistUnpublish(playlist) {
    const ok = await setWorkshopPlaylistStatus(playlist.id, 'stashed')
    if (ok) setPlaylistItems(prev => prev.map(p => p.id === playlist.id ? { ...p, status: 'stashed' } : p))
  }

  async function handlePlaylistDelete(playlist) {
    if (playlist.status !== 'stashed') return
    const ok = await deleteWorkshopPlaylist(playlist.id)
    if (ok) setPlaylistItems(prev => prev.filter(p => p.id !== playlist.id))
  }

  // ── Group handlers ──────────────────────────────────────────────────────────

  function handleGroupSaved(group) {
    if (view === 'create') {
      setGroupItems(prev => [group, ...prev])
    } else if (view === 'edit') {
      setGroupItems(prev => prev.map(g => g.id === group.id ? group : g))
    }
    setView('library')
    setGroupEditTarget(null)
  }

  async function handleGroupPublish(group) {
    const ok = await setWorkshopGroupStatus(group.id, 'published')
    if (ok) setGroupItems(prev => prev.map(g => g.id === group.id ? { ...g, status: 'published' } : g))
  }

  async function handleGroupUnpublish(group) {
    const ok = await setWorkshopGroupStatus(group.id, 'stashed')
    if (ok) setGroupItems(prev => prev.map(g => g.id === group.id ? { ...g, status: 'stashed' } : g))
  }

  async function handleGroupDelete(group) {
    if (group.status !== 'stashed') return
    const ok = await deleteWorkshopGroup(group.id)
    if (ok) setGroupItems(prev => prev.filter(g => g.id !== group.id))
  }

  function cancelForm() {
    setView('library')
    setEditTarget(null)
    setArenaEditTarget(null)
    setPlaylistEditTarget(null)
    setGroupEditTarget(null)
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const visible = filter === 'all'
    ? items
    : items.filter(c => c.status === filter)

  const stashedCount   = items.filter(c => c.status === 'stashed').length
  const publishedCount = items.filter(c => c.status === 'published').length

  const arenaVisible        = arenaFilter === 'all' ? arenaItems : arenaItems.filter(a => a.status === arenaFilter)
  const arenaStashedCount   = arenaItems.filter(a => a.status === 'stashed').length
  const arenaPublishedCount = arenaItems.filter(a => a.status === 'published').length

  const playlistVisible        = playlistFilter === 'all' ? playlistItems : playlistItems.filter(p => p.status === playlistFilter)
  const playlistStashedCount   = playlistItems.filter(p => p.status === 'stashed').length
  const playlistPublishedCount = playlistItems.filter(p => p.status === 'published').length

  const groupVisible        = groupFilter === 'all' ? groupItems : groupItems.filter(g => g.status === groupFilter)
  const groupStashedCount   = groupItems.filter(g => g.status === 'stashed').length
  const groupPublishedCount = groupItems.filter(g => g.status === 'published').length

  // ── Form view (shared across sections) ─────────────────────────────────────

  if (view === 'create' || view === 'edit') {
    return (
      <Screen title="My Workshop" onBack={cancelForm}>
        {section === 'combatants' && (
          <CombatantForm
            existing={view === 'edit' ? editTarget : null}
            onSave={handleSaved}
            onCancel={cancelForm}
            currentUser={currentUser}
          />
        )}
        {section === 'arenas' && (
          <ArenaForm
            existing={view === 'edit' ? arenaEditTarget : null}
            onSave={handleArenaSaved}
            onCancel={cancelForm}
            currentUser={currentUser}
          />
        )}
        {section === 'playlists' && (
          <PlaylistForm
            existing={view === 'edit' ? playlistEditTarget : null}
            onSave={handlePlaylistSaved}
            onCancel={cancelForm}
            currentUser={currentUser}
          />
        )}
        {section === 'groups' && (
          <GroupForm
            existing={view === 'edit' ? groupEditTarget : null}
            onSave={handleGroupSaved}
            onCancel={cancelForm}
            currentUser={currentUser}
          />
        )}
      </Screen>
    )
  }

  return (
    <Screen title="My Workshop" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.75rem 0 1rem' }}>
        Your bench. Everything stashed here is private until you publish it.
      </p>

      {/* ── Section tabs: Combatants / Arenas / Playlists / Groups ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button onClick={() => setSection('combatants')} style={tab(section === 'combatants')}>Combatants</button>
        <button onClick={() => setSection('arenas')}     style={tab(section === 'arenas')}>Arenas</button>
        <button onClick={() => setSection('playlists')}  style={tab(section === 'playlists')}>Playlists</button>
        <button onClick={() => setSection('groups')}     style={tab(section === 'groups')}>Groups</button>
      </div>

      {/* ── Groups section ── */}
      {section === 'groups' && (
        <>
          <button
            onClick={() => setView('create')}
            style={{ ...btn('primary'), marginBottom: '1.25rem' }}
          >
            + New group
          </button>

          {groupItems.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => setGroupFilter('all')}       style={tab(groupFilter === 'all')}>All ({groupItems.length})</button>
              <button onClick={() => setGroupFilter('stashed')}   style={tab(groupFilter === 'stashed')}>Stashed ({groupStashedCount})</button>
              <button onClick={() => setGroupFilter('published')} style={tab(groupFilter === 'published')}>Published ({groupPublishedCount})</button>
            </div>
          )}

          {groupLoading && <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading…</p>}

          {!groupLoading && groupItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing here yet. Create your first group above.
            </div>
          )}

          {!groupLoading && groupItems.length > 0 && groupVisible.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing in this filter yet.
            </p>
          )}

          {groupVisible.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              onEdit={g => { setGroupEditTarget(g); setView('edit') }}
              onPublish={handleGroupPublish}
              onUnpublish={handleGroupUnpublish}
              onDelete={handleGroupDelete}
            />
          ))}
        </>
      )}

      {/* ── Combatants section ── */}
      {section === 'combatants' && (
        <>
          <button
            onClick={() => setView('create')}
            style={{ ...btn('primary'), marginBottom: '1.25rem' }}
          >
            + New combatant
          </button>

          {items.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => setFilter('all')}       style={tab(filter === 'all')}>All ({items.length})</button>
              <button onClick={() => setFilter('stashed')}   style={tab(filter === 'stashed')}>Stashed ({stashedCount})</button>
              <button onClick={() => setFilter('published')} style={tab(filter === 'published')}>Published ({publishedCount})</button>
            </div>
          )}

          {loading && <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading…</p>}

          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing here yet. Create your first combatant above.
            </div>
          )}

          {!loading && items.length > 0 && visible.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing in this group yet.
            </p>
          )}

          {visible.map(combatant => (
            <WorkshopCard
              key={combatant.id}
              combatant={combatant}
              onEdit={c => { setEditTarget(c); setView('edit') }}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              onDelete={handleDelete}
            />
          ))}
        </>
      )}

      {/* ── Arenas section ── */}
      {section === 'arenas' && (
        <>
          <button
            onClick={() => setView('create')}
            style={{ ...btn('primary'), marginBottom: '1.25rem' }}
          >
            + New arena
          </button>

          {arenaItems.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => setArenaFilter('all')}       style={tab(arenaFilter === 'all')}>All ({arenaItems.length})</button>
              <button onClick={() => setArenaFilter('stashed')}   style={tab(arenaFilter === 'stashed')}>Stashed ({arenaStashedCount})</button>
              <button onClick={() => setArenaFilter('published')} style={tab(arenaFilter === 'published')}>Published ({arenaPublishedCount})</button>
            </div>
          )}

          {arenaLoading && <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading…</p>}

          {!arenaLoading && arenaItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing here yet. Create your first arena above.
            </div>
          )}

          {!arenaLoading && arenaItems.length > 0 && arenaVisible.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing in this filter yet.
            </p>
          )}

          {arenaVisible.map(arena => (
            <ArenaCard
              key={arena.id}
              arena={arena}
              onEdit={a => { setArenaEditTarget(a); setView('edit') }}
              onPublish={handleArenaPublish}
              onUnpublish={handleArenaUnpublish}
              onDelete={handleArenaDelete}
            />
          ))}
        </>
      )}

      {/* ── Playlists section ── */}
      {section === 'playlists' && (
        <>
          <button
            onClick={() => setView('create')}
            style={{ ...btn('primary'), marginBottom: '1.25rem' }}
          >
            + New playlist
          </button>

          {playlistItems.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => setPlaylistFilter('all')}       style={tab(playlistFilter === 'all')}>All ({playlistItems.length})</button>
              <button onClick={() => setPlaylistFilter('stashed')}   style={tab(playlistFilter === 'stashed')}>Stashed ({playlistStashedCount})</button>
              <button onClick={() => setPlaylistFilter('published')} style={tab(playlistFilter === 'published')}>Published ({playlistPublishedCount})</button>
            </div>
          )}

          {playlistLoading && <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading…</p>}

          {!playlistLoading && playlistItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing here yet. Create your first playlist above.
            </div>
          )}

          {!playlistLoading && playlistItems.length > 0 && playlistVisible.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              Nothing in this filter yet.
            </p>
          )}

          {playlistVisible.map(playlist => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onEdit={p => { setPlaylistEditTarget(p); setView('edit') }}
              onPublish={handlePlaylistPublish}
              onUnpublish={handlePlaylistUnpublish}
              onDelete={handlePlaylistDelete}
            />
          ))}
        </>
      )}
    </Screen>
  )
}
