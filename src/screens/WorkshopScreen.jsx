import { useState, useEffect } from 'react'
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

// ─── Create / Edit form ───────────────────────────────────────────────────────

function CombatantForm({ existing, onSave, onCancel, currentUser }) {
  const isEdit     = !!existing
  const isPublished = existing?.status === 'published'

  const [name,    setName]    = useState(existing?.name    || '')
  const [bio,     setBio]     = useState(existing?.bio     || '')
  const [tags,    setTags]    = useState(existing?.tags    || [])
  const [status,  setStatus]  = useState(existing?.status  || 'stashed')
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState(false)  // bio-edit confirm for published
  const [error,   setError]   = useState('')

  const bioChanged  = isEdit && bio.trim() !== (existing.bio || '').trim()
  const nameChanged = isEdit && name.trim() !== existing.name.trim()
  const tagsChanged = isEdit && JSON.stringify(tags) !== JSON.stringify(existing.tags || [])
  const hasChanges  = !isEdit || nameChanged || bioChanged || tagsChanged

  function validate() {
    if (!name.trim())       { setError('Name is required.'); return false }
    if (!bio.trim())        { setError('Bio is required — even a single line.'); return false }
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
      const ok = await updateWorkshopCombatant(
        existing.id,
        { name: name.trim(), bio: bio.trim(), tags },
        bioHistoryEntry,
        existing.bio_history || [],
      )
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({ ...existing, name: name.trim(), bio: bio.trim(), tags, bio_history: [...(existing.bio_history || []), bioHistoryEntry].slice(-20) })
    } else {
      const id = uid()
      const ok = await createWorkshopCombatant({
        id, name: name.trim(), bio: bio.trim(), tags,
        ownerId: currentUser.id, ownerName: currentUser.username,
        status,
      })
      if (!ok) { setError('Save failed. Try again.'); setSaving(false); return }
      onSave({ id, name: name.trim(), bio: bio.trim(), tags, status, source: 'created', wins: 0, losses: 0, draws: 0, bio_history: [], owner_id: currentUser.id, owner_name: currentUser.username, lineage: null })
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

      <label style={lbl}>Bio *</label>
      <textarea
        style={{ ...inp(), minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
        placeholder="Give them a line. Even one sentence."
        value={bio}
        onChange={e => { setBio(e.target.value); setError(''); setConfirm(false) }}
        maxLength={500}
      />

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
              🔒 Stash (private)
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

// ─── Workshop card ────────────────────────────────────────────────────────────

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WorkshopScreen({ currentUser, onBack, onLogin }) {
  if (!currentUser) return <GuestGate onLogin={onLogin} />

  const [view,      setView]      = useState('library')  // 'library' | 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null)
  const [items,     setItems]     = useState([])
  const [filter,    setFilter]    = useState('all')      // 'all' | 'stashed' | 'published'
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    getWorkshopCombatants(currentUser.id).then(data => {
      setItems(data); setLoading(false)
    })
  }, [currentUser.id])

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
    if (combatant.status !== 'stashed') return  // published items cannot be deleted
    const ok = await deleteWorkshopCombatant(combatant.id)
    if (ok) setItems(prev => prev.filter(c => c.id !== combatant.id))
  }

  const visible = filter === 'all'
    ? items
    : items.filter(c => c.status === filter)

  const stashedCount   = items.filter(c => c.status === 'stashed').length
  const publishedCount = items.filter(c => c.status === 'published').length

  if (view === 'create' || view === 'edit') {
    return (
      <Screen title="My Workshop" onBack={() => { setView('library'); setEditTarget(null) }}>
        <CombatantForm
          existing={view === 'edit' ? editTarget : null}
          onSave={handleSaved}
          onCancel={() => { setView('library'); setEditTarget(null) }}
          currentUser={currentUser}
        />
      </Screen>
    )
  }

  return (
    <Screen title="My Workshop" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.75rem 0 1rem' }}>
        Your bench. Stashed combatants are private until you publish them.
      </p>

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
          Nothing in the workshop yet. Create your first combatant above.
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
    </Screen>
  )
}
