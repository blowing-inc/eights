import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl } from '../styles.js'
import { updateGlobalCombatant, getLineageTree, getCombatantBattleHistory } from '../supabase.js'
import { buildStoryFromLineageTree } from '../gameLogic.js'
import { downloadFile, formatCombatantHistory } from '../export.js'

// Renders a lineage tree (handles both linear chains and branching).
// rawTree: raw combatant rows from getLineageTree — used for the parent→children map
//          (branching support) and for navigation data when a node is tapped.
// onViewCombatant: optional — if provided, non-current nodes become tappable links.
function LineageSection({ title, story, rawTree, currentId, onViewCombatant }) {
  // Build parent→children map using lineage.parentId from raw tree data.
  const childMap = {}
  ;(rawTree || []).forEach(raw => {
    const pid = raw.lineage?.parentId
    if (!pid) return
    const node = story.find(n => n.combatantId === raw.id)
    if (node) {
      if (!childMap[pid]) childMap[pid] = []
      childMap[pid].push(node)
    }
  })
  // Fallback for trees without rawTree (shouldn't happen, but keeps rendering safe)
  if (!rawTree || rawTree.length === 0) {
    story.forEach((node, i) => {
      if (i === 0) return
      const parent = story[i - 1]
      if (!childMap[parent.combatantId]) childMap[parent.combatantId] = []
      childMap[parent.combatantId].push(node)
    })
  }

  function renderNode(node, depth) {
    const isCurrent  = node.combatantId === currentId
    const children   = childMap[node.combatantId] || []
    const indent     = depth * 16
    const rawRecord  = (rawTree || []).find(r => r.id === node.combatantId)
    const canTap     = !isCurrent && onViewCombatant && rawRecord

    return (
      <div key={node.combatantId}>
        {node.bornFrom && (
          <div style={{ paddingLeft: indent + 8, padding: '3px 0 3px ' + (indent + 8) + 'px', fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            ⚡ beat <strong style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{node.bornFrom.opponentName || 'an opponent'}</strong>
            {node.bornFrom.gameCode && <> in {node.bornFrom.gameCode} R{node.bornFrom.roundNumber}</>} →
          </div>
        )}
        <div
          onClick={canTap ? () => onViewCombatant(rawRecord) : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', paddingLeft: indent, cursor: canTap ? 'pointer' : 'default' }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isCurrent ? 'var(--color-text-info)' : canTap ? 'var(--color-text-secondary)' : 'var(--color-border-secondary)' }} />
          <span style={{ fontSize: 14, fontWeight: isCurrent ? 500 : 400, color: isCurrent ? 'var(--color-text-primary)' : canTap ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', textDecoration: canTap ? 'underline' : 'none', textDecorationColor: 'var(--color-border-tertiary)' }}>
            {node.name}
          </span>
          {isCurrent && (
            <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99 }}>
              this form
            </span>
          )}
          {!isCurrent && children.length === 0 && (
            <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99 }}>
              latest
            </span>
          )}
        </div>
        {children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  const root = story.find(n => n.generation === 0)
  if (!root) return null

  return (
    <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
      <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </h3>
      {renderNode(root, 0)}
    </div>
  )
}

export default function GlobalCombatantDetail({ combatant: init, playerId, playerName, onBack, onViewCombatant }) {
  const [c, setC] = useState(init)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(init.name)
  const [editBio,  setEditBio]  = useState(init.bio || '')
  const [saving, setSaving] = useState(false)
  const [historyOpen,   setHistoryOpen]   = useState(false)
  const [lineageStory,  setLineageStory]  = useState([])  // heritage chain (where this combatant sits)
  const [lineageTree,   setLineageTree]   = useState([])  // raw tree data for heritage — needed for branching child map + navigation
  const [ownChainStory, setOwnChainStory] = useState([])  // standalone tree (variants produced from this combatant as root)
  const [ownChainTree,  setOwnChainTree]  = useState([])  // raw tree data for own chain — needed for navigation
  const [h2hOpen,  setH2hOpen]  = useState(false)
  const [h2hRows,  setH2hRows]  = useState(null)  // null = not yet loaded

  const canEdit    = c.owner_id === playerId
  const totalBattles = (c.wins || 0) + (c.losses || 0)
  const history    = c.bio_history || []
  const isVariant  = !!c.lineage
  const rootId     = c.lineage?.rootId || c.id

  useEffect(() => {
    // Heritage chain — where this combatant sits within its ancestral tree
    getLineageTree(rootId).then(tree => {
      setLineageTree(tree)
      const story = buildStoryFromLineageTree(tree)
      if (story.length > 1) setLineageStory(story)
    })
    // Own chain — did this combatant start a separate standalone tree?
    // Only possible if it's a variant (rootId ≠ c.id), otherwise the call above already covers it.
    if (c.lineage) {
      getLineageTree(c.id).then(tree => {
        setOwnChainTree(tree)
        const story = buildStoryFromLineageTree(tree)
        if (story.length > 1) setOwnChainStory(story)
      })
    }
  }, [rootId, c.id])

  function nameSlug() {
    return c.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
  }
  function exportText() {
    const heritage = lineageTree.length > 0 ? lineageTree : [c]
    const own      = ownChainTree.length > 1 ? ownChainTree : []
    downloadFile(`eights-combatant-${nameSlug()}.txt`, formatCombatantHistory(c, heritage, own))
  }
  function exportJson() {
    const heritage = lineageTree.length > 0 ? lineageTree : [c]
    const own      = ownChainTree.length > 1 ? ownChainTree : []
    const payload  = own.length
      ? { heritage, ownChain: own }
      : heritage
    downloadFile(`eights-combatant-${nameSlug()}.json`, JSON.stringify(payload, null, 2), 'application/json')
  }

  function toggleH2h() {
    if (!h2hOpen && h2hRows === null) {
      getCombatantBattleHistory(c.id).then(setH2hRows)
    }
    setH2hOpen(o => !o)
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {isVariant ? '⚡' : '⚔️'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>{c.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
            Created by {c.owner_name || 'unknown'}
            {isVariant && <span style={{ color: 'var(--color-text-info)', marginLeft: 6 }}>· gen {c.lineage.generation}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={exportText} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}>⬇ Text</button>
          <button onClick={exportJson} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}>⬇ JSON</button>
        </div>
      </div>

      {/* ── Lineage — story first ────────────────────────────────────────── */}
      {lineageStory.length > 1 && (
        <LineageSection
          title="Heritage"
          story={lineageStory}
          rawTree={lineageTree}
          currentId={c.id}
          onViewCombatant={onViewCombatant}
        />
      )}
      {ownChainStory.length > 1 && (
        <LineageSection
          title="Standalone evolution"
          story={ownChainStory}
          rawTree={ownChainTree}
          currentId={c.id}
          onViewCombatant={onViewCombatant}
        />
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

      {/* ── Head-to-head ─────────────────────────────────────────────────── */}
      {totalBattles > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button onClick={toggleH2h}
            style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: h2hOpen ? 8 : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Head-to-head</span>
            <span>{h2hOpen ? '↑' : '↓'}</span>
          </button>
          {h2hOpen && (
            h2hRows === null
              ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
              : h2hRows.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>No recorded matchups.</p>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>Opponent</th>
                        <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>W</th>
                        <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4 }}>L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h2hRows.map((row, i) => (
                        <tr key={row.opponentName + i} style={{ borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                          <td style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 8, color: 'var(--color-text-primary)' }}>{row.opponentName}</td>
                          <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--color-text-success)', fontWeight: 500 }}>{row.wins}</td>
                          <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{row.losses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
          )}
        </div>
      )}

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
