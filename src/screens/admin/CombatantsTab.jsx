import { useState } from 'react'
import { btn, inp } from '../../styles.js'
import { adminSearchAllCombatants, adminDeleteCombatant, updateGlobalCombatant, mergeTagsGlobal } from '../../supabase.js'

export default function CombatantsTab() {
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState(null) // null = not yet searched
  const [loading,    setLoading]    = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [editName,   setEditName]   = useState('')
  const [editBio,    setEditBio]    = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')

  async function search() {
    setLoading(true); setMsg(''); setResults(null)
    setResults(await adminSearchAllCombatants(query))
    setLoading(false)
  }

  function startEdit(c) {
    setEditingId(c.id); setEditName(c.name); setEditBio(c.bio || ''); setMsg('')
  }

  async function saveEdit(c) {
    setSaving(true)
    const name = editName.trim() || c.name
    const bio  = editBio.trim()
    await updateGlobalCombatant(c.id, { name, bio })
    setResults(r => r.map(x => x.id === c.id ? { ...x, name, bio } : x))
    setEditingId(null); setSaving(false)
    setMsg(`Saved "${name}".`)
  }

  async function doDelete(c) {
    setSaving(true)
    await adminDeleteCombatant(c.id)
    setResults(r => r.filter(x => x.id !== c.id))
    setConfirmDel(null); setSaving(false)
    setMsg(`Deleted "${c.name}".`)
  }

  return (
    <>
      {msg && <Notice msg={msg} />}
      <TagMerge />
      <hr style={{ border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', margin: '1.5rem 0' }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <input
          style={{ ...inp(), margin: 0, flex: 1, fontSize: 14 }}
          placeholder="Search combatants (name)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button onClick={search} disabled={loading}
          style={{ ...btn('primary'), width: 'auto', padding: '0 16px', fontSize: 13, flex: 'none' }}>
          {loading ? '…' : 'Search'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-4px 0 12px' }}>
        Includes unpublished combatants. Leave blank to see the 50 most recently updated.
      </p>

      {results === null && !loading && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Run a search to see results.</p>}
      {results !== null && results.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No combatants found.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(results || []).map(c => {
          const isEditing = editingId === c.id
          const isConfirm = confirmDel === c.id

          return (
            <div key={c.id} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
                    {c.bio && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{c.bio}</div>}
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3, display: 'flex', gap: 10 }}>
                      <span>by {c.owner_name || '—'}</span>
                      <span>{c.wins}W / {c.losses}L</span>
                      {c.status !== 'published' && <span style={{ color: 'var(--color-text-warning)' }}>stashed</span>}
                    </div>
                  </div>
                  {!isEditing && !isConfirm && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { startEdit(c); setConfirmDel(null) }}
                        style={{ ...btn('ghost'), padding: '3px 9px', fontSize: 12, width: 'auto' }}>Edit</button>
                      <button onClick={() => { setConfirmDel(c.id); setEditingId(null); setMsg('') }}
                        style={{ ...btn('ghost'), padding: '3px 9px', fontSize: 12, width: 'auto', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>

              {isEditing && (
                <div style={{ padding: '0 14px 12px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <input style={{ ...inp(), margin: '10px 0 8px', fontSize: 14 }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                  <textarea style={{ ...inp(), margin: 0, resize: 'none', height: 60, fontSize: 13, width: '100%' }} value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio (optional)" />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => saveEdit(c)} disabled={saving}
                      style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px' }}>{saving ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => setEditingId(null)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '7px' }}>Cancel</button>
                  </div>
                </div>
              )}

              {isConfirm && (
                <div style={{ padding: '8px 14px 12px', borderTop: '0.5px solid var(--color-border-danger)', background: 'var(--color-background-danger)' }}>
                  <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 8px' }}>
                    Delete "{c.name}" permanently? This removes it from the bestiary and all stats.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => doDelete(c)} disabled={saving}
                      style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 12, padding: '6px' }}>
                      {saving ? '…' : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmDel(null)} style={{ ...btn(), flex: 1, fontSize: 12, padding: '6px' }}>Cancel</button>
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

function Notice({ msg }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>
      {msg}
    </div>
  )
}

// Tag merge — Super Host capability, temporarily admin-only until 1.2.x Super Host role ships.
// Replaces old_tag with new_tag on every combatant that carries it.
function TagMerge() {
  const [oldTag,  setOldTag]  = useState('')
  const [newTag,  setNewTag]  = useState('')
  const [merging, setMerging] = useState(false)
  const [result,  setResult]  = useState(null) // { count } | { error }

  async function doMerge() {
    const from = oldTag.trim().toLowerCase()
    const into = newTag.trim().toLowerCase()
    if (!from || !into || from === into) return
    setMerging(true); setResult(null)
    const count = await mergeTagsGlobal(from, into)
    setResult({ count })
    setMerging(false)
    if (count > 0) { setOldTag(''); setNewTag('') }
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Merge Tags
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 10px' }}>
        Replaces a tag with another across all combatants — use this to consolidate typos or duplicates.
        Will become a Super Host power in 1.2.x.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          style={{ ...inp(), margin: 0, flex: 1, minWidth: 120, fontSize: 14 }}
          placeholder="Old tag (e.g. spoooky)"
          value={oldTag}
          onChange={e => setOldTag(e.target.value)}
        />
        <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)', paddingTop: 10 }}>→</span>
        <input
          style={{ ...inp(), margin: 0, flex: 1, minWidth: 120, fontSize: 14 }}
          placeholder="New tag (e.g. spooky)"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
        />
        <button
          onClick={doMerge}
          disabled={merging || !oldTag.trim() || !newTag.trim() || oldTag.trim() === newTag.trim()}
          style={{ ...btn('primary'), width: 'auto', padding: '0 16px', fontSize: 13, flex: 'none' }}
        >
          {merging ? '…' : 'Merge'}
        </button>
      </div>
      {result && (
        <p style={{ fontSize: 12, margin: '6px 0 0', color: result.count > 0 ? 'var(--color-text-success)' : 'var(--color-text-tertiary)' }}>
          {result.count > 0
            ? `Done — updated ${result.count} combatant${result.count === 1 ? '' : 's'}.`
            : 'No combatants found with that tag.'}
        </p>
      )}
    </div>
  )
}
