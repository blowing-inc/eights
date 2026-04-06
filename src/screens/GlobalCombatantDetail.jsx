import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { updateGlobalCombatant, getLineageTree } from '../supabase.js'
import { buildStoryFromLineageTree } from '../gameLogic.js'

export default function GlobalCombatantDetail({ combatant: init, playerId, playerName, onBack }) {
  const [c, setC] = useState(init)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(init.name)
  const [editBio,  setEditBio]  = useState(init.bio || '')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [lineageStory, setLineageStory] = useState([])

  const canEdit    = c.owner_id === playerId
  const totalBattles = (c.wins || 0) + (c.losses || 0)
  const history    = c.bio_history || []
  const isVariant  = !!c.lineage
  const rootId     = c.lineage?.rootId || c.id

  // Load the full lineage tree and build the story
  useEffect(() => {
    getLineageTree(rootId).then(tree => {
      const story = buildStoryFromLineageTree(tree)
      if (story.length > 1) setLineageStory(story)
    })
  }, [rootId])

  async function saveEdit() {
    if (!editName.trim()) return
    setSaving(true)
    const newName = editName.trim()
    const newBio  = editBio.trim()
    const entry = { name: c.name, bio: c.bio || '', updatedAt: new Date().toISOString(), updatedBy: playerName || 'unknown' }
    const newHistory = [...history, entry].slice(-20)
    await updateGlobalCombatant(c.id, { name: newName, bio: newBio, bio_history: newHistory })
    setC({ ...c, name: newName, bio: newBio, bio_history: newHistory })
    setSaving(false); setEditMode(false)
  }

  return (
    <Screen title={c.name} onBack={onBack}>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {isVariant ? '⚡' : '⚔️'}
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>{c.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
            Created by {c.owner_name || 'unknown'}
            {isVariant && <span style={{ color: 'var(--color-text-info)', marginLeft: 6 }}>· gen {c.lineage.generation}</span>}
          </p>
        </div>
      </div>

      {/* ── Lineage story — story first ───────────────────────────────────── */}
      {lineageStory.length > 1 && (
        <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Evolution
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {lineageStory.map((node, i) => {
              const isCurrent = node.combatantId === c.id
              const isLast    = i === lineageStory.length - 1
              return (
                <div key={node.combatantId}>
                  {/* Birth event line — shown above the variant it produced */}
                  {node.bornFrom && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 20px' }}>
                      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border-tertiary)', marginRight: 7, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                        beat <strong style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{node.bornFrom.opponentName || 'an opponent'}</strong>
                        {node.bornFrom.gameCode && <> in {node.bornFrom.gameCode} R{node.bornFrom.roundNumber}</>}
                      </span>
                    </div>
                  )}
                  {/* Combatant node */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isCurrent ? 'var(--color-text-info)' : 'var(--color-border-secondary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: isCurrent ? 500 : 400, color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {node.name}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99 }}>
                        this form
                      </span>
                    )}
                    {isLast && !isCurrent && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99 }}>
                        latest
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
        {[['Wins', c.wins || 0, 'var(--color-text-success)'], ['Losses', c.losses || 0, 'var(--color-text-danger)'], ['Battles', totalBattles, 'var(--color-text-secondary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {(c.reactions_heart > 0 || c.reactions_angry > 0 || c.reactions_cry > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
          {[['❤️', c.reactions_heart], ['😡', c.reactions_angry], ['😂', c.reactions_cry]].filter(([, n]) => n > 0).map(([icon, count]) => (
            <div key={icon} style={{ padding: '5px 12px', background: 'var(--color-background-secondary)', borderRadius: 99, border: '0.5px solid var(--color-border-tertiary)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {icon} {count}
            </div>
          ))}
        </div>
      )}

      {/* ── Bio ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: 0 }}>Bio</h3>
          {canEdit && !editMode && <button onClick={() => setEditMode(true)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
        </div>
        {editMode ? (
          <>
            <label style={lbl}>Name</label>
            <input style={inp()} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
            <label style={lbl}>Bio</label>
            <textarea style={{ ...inp(), width: '100%', resize: 'none', height: 80 }} value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio (optional)" />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={btn('primary')} onClick={saveEdit} disabled={saving || !editName.trim()}>{saving ? 'Saving…' : 'Save'}</button>
              <button style={btn()} onClick={() => { setEditName(c.name); setEditBio(c.bio || ''); setEditMode(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <p style={{ color: c.bio ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 14, margin: 0 }}>{c.bio || 'No bio yet.'}</p>
        )}
      </div>

      {/* ── Bio history ──────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setHistoryOpen(o => !o)}
            style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Bio history ({history.length})</span>
            <span>{historyOpen ? '↑' : '↓'}</span>
          </button>
          {historyOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...history].reverse().map((h, i) => (
                <div key={i} style={{ padding: '10px 12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{h.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{new Date(h.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  {h.bio && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>{h.bio}</p>}
                  <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>by {h.updatedBy}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}
