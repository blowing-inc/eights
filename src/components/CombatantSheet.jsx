import { useState, useEffect } from 'react'
import { btn, inp, lbl } from '../styles.js'
import { getCombatant, updateGlobalCombatant, getLineageTree, getCombatantRoundHistory, getGroupsForCombatants } from '../supabase.js'
import { buildStoryFromLineageTree } from '../gameLogic.js'

/**
 * Slide-up sheet showing a combatant's global Cast record.
 *
 * Props:
 *   combatantId  — global combatant id to load (preferred)
 *   combatant    — in-room combatant object (fallback when no global record yet)
 *   playerId     — current player id (for edit permissions)
 *   playerName   — current player name (for bio history attribution)
 *   onClose      — () => void
 *
 * If combatantId resolves to null (unpublished / not yet in DB), renders a
 * lightweight in-room view using the combatant prop instead.
 */
export default function CombatantSheet({ combatantId, combatant: inRoom, playerId, playerName, onClose }) {
  // Back-stack: array of combatant records so heritage links can navigate in-sheet
  const [stack, setStack] = useState(null)  // null = loading
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!combatantId) {
      setStack(inRoom ? [{ type: 'inroom', data: inRoom }] : [])
      setLoading(false)
      return
    }
    getCombatant(combatantId).then(record => {
      if (record) {
        setStack([{ type: 'global', data: record }])
      } else {
        // No global record yet — fall back to in-room object
        setStack(inRoom ? [{ type: 'inroom', data: inRoom }] : [])
      }
      setLoading(false)
    })
  }, [combatantId])

  function pushCombatant(record) {
    setStack(s => [...s, { type: 'global', data: record }])
  }

  function popCombatant() {
    setStack(s => s.slice(0, -1))
  }

  const current = stack && stack.length > 0 ? stack[stack.length - 1] : null
  const canGoBack = stack && stack.length > 1

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg) var(--border-radius-lg) 0 0', width: '100%', maxWidth: 500, maxHeight: '88dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Sheet header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0, gap: 8 }}>
          {canGoBack && (
            <button onClick={popCombatant} style={{ background: 'transparent', border: 'none', fontSize: 18, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '0 6px 0 0', lineHeight: 1 }}>←</button>
          )}
          <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loading ? 'Loading…' : current?.data?.name || current?.data?.name || '—'}
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1 }}>×</button>
        </div>

        {/* Sheet body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ padding: '2rem', color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
          {!loading && !current && <p style={{ padding: '2rem', color: 'var(--color-text-secondary)', fontSize: 14 }}>No record found.</p>}
          {!loading && current?.type === 'inroom' && <InRoomView combatant={current.data} />}
          {!loading && current?.type === 'global' && (
            <GlobalView
              combatant={current.data}
              playerId={playerId}
              playerName={playerName}
              onViewCombatant={pushCombatant}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── In-room fallback view (unpublished combatant) ─────────────────────────────

function InRoomView({ combatant: c }) {
  const totalRounds = (c.wins || 0) + (c.losses || 0) + (c.draws || 0)
  return (
    <div style={{ padding: '16px' }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px', fontStyle: 'italic' }}>
        This combatant hasn't been published yet — full Cast stats are available after the game ends.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: '1rem' }}>
        {[['Wins', c.wins || 0, 'var(--color-text-success)'], ['Losses', c.losses || 0, 'var(--color-text-danger)'], ['Draws', c.draws || 0, 'var(--color-text-secondary)'], ['Rounds', totalRounds, 'var(--color-text-tertiary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>
      {c.bio && <p style={{ fontSize: 14, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.5 }}>{c.bio}</p>}
      {c.ownerName && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>by {c.ownerName}</p>}
    </div>
  )
}

function joinNames(names) {
  if (!names || names.length === 0) return 'unknown'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

// ── Full global view (mirrors GlobalCombatantDetail content, sans Screen wrapper) ──

function LineageSection({ title, story, rawTree, currentId, onViewCombatant }) {
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
  if (!rawTree || rawTree.length === 0) {
    story.forEach((node, i) => {
      if (i === 0) return
      const parent = story[i - 1]
      if (!childMap[parent.combatantId]) childMap[parent.combatantId] = []
      childMap[parent.combatantId].push(node)
    })
  }

  function renderNode(node, depth) {
    const isCurrent = node.combatantId === currentId
    const children  = childMap[node.combatantId] || []
    const indent    = depth * 16
    const rawRecord = (rawTree || []).find(r => r.id === node.combatantId)
    const canTap    = !isCurrent && onViewCombatant && rawRecord

    return (
      <div key={node.combatantId}>
        {node.bornFrom && (
          <div style={{ paddingLeft: indent + 8, padding: '3px 0 3px ' + (indent + 8) + 'px', fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            {node.bornFrom.type === 'merge' ? (
              <>
                ⚡ <strong style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{joinNames(node.bornFrom.parentNames)}</strong> merged
                {node.bornFrom.gameCode && <> in {node.bornFrom.gameCode} R{node.bornFrom.roundNumber}</>} →
              </>
            ) : (
              <>
                ⚡ beat <strong style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{node.bornFrom.opponentName || 'an opponent'}</strong>
                {node.bornFrom.gameCode && <> in {node.bornFrom.gameCode} R{node.bornFrom.roundNumber}</>} →
              </>
            )}
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
          {isCurrent && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99 }}>this form</span>}
          {!isCurrent && children.length === 0 && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99 }}>latest</span>}
        </div>
        {children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  const root = story.find(n => n.generation === 0)
  if (!root) return null
  return (
    <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
      <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
      {renderNode(root, 0)}
    </div>
  )
}

function GlobalView({ combatant: init, playerId, playerName, onViewCombatant }) {
  const [c, setC] = useState(init)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(init.name)
  const [editBio,  setEditBio]  = useState(init.bio || '')
  const [saving, setSaving] = useState(false)
  const [historyOpen,   setHistoryOpen]   = useState(false)
  const [lineageStory,  setLineageStory]  = useState([])
  const [lineageTree,   setLineageTree]   = useState([])
  const [ownChainStory, setOwnChainStory] = useState([])
  const [ownChainTree,  setOwnChainTree]  = useState([])
  const [h2hOpen,  setH2hOpen]  = useState(false)
  const [h2hRows,  setH2hRows]  = useState(null)
  const [groups,   setGroups]   = useState([])

  // Reset all state when combatant changes (sheet back-stack navigation)
  useEffect(() => {
    setC(init); setEditMode(false); setEditName(init.name); setEditBio(init.bio || '')
    setLineageStory([]); setLineageTree([]); setOwnChainStory([]); setOwnChainTree([])
    setH2hOpen(false); setH2hRows(null); setGroups([])
  }, [init.id])

  useEffect(() => {
    getGroupsForCombatants([init.id]).then(map => setGroups(map[init.id] || []))
  }, [init.id])

  const canEdit    = c.owner_id === playerId
  const totalRounds = (c.wins || 0) + (c.losses || 0) + (c.draws || 0)
  const history    = c.bio_history || []
  const isVariant  = !!c.lineage
  const rootId     = c.lineage?.rootId || c.id

  useEffect(() => {
    getLineageTree(rootId).then(tree => {
      setLineageTree(tree)
      const story = buildStoryFromLineageTree(tree)
      if (story.length > 1) setLineageStory(story)
    })
    if (c.lineage) {
      getLineageTree(c.id).then(tree => {
        setOwnChainTree(tree)
        const story = buildStoryFromLineageTree(tree)
        if (story.length > 1) setOwnChainStory(story)
      })
    }
  }, [rootId, c.id])

  function toggleH2h() {
    if (!h2hOpen && h2hRows === null) getCombatantRoundHistory(c.id).then(setH2hRows)
    setH2hOpen(o => !o)
  }

  async function saveEdit() {
    if (!editName.trim()) return
    setSaving(true)
    const newName = editName.trim(); const newBio = editBio.trim()
    const entry = { name: c.name, bio: c.bio || '', updatedAt: new Date().toISOString(), updatedBy: playerName || 'unknown' }
    const newHistory = [...history, entry].slice(-20)
    await updateGlobalCombatant(c.id, { name: newName, bio: newBio, bio_history: newHistory })
    setC({ ...c, name: newName, bio: newBio, bio_history: newHistory })
    setSaving(false); setEditMode(false)
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {isVariant ? '⚡' : '⚔️'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            by {c.owner_name || 'unknown'}
            {isVariant && <span style={{ color: 'var(--color-text-info)', marginLeft: 6 }}>· gen {c.lineage.generation}</span>}
          </div>
        </div>
      </div>

      {/* Lineage */}
      {lineageStory.length > 1 && <LineageSection title="Heritage" story={lineageStory} rawTree={lineageTree} currentId={c.id} onViewCombatant={onViewCombatant} />}
      {ownChainStory.length > 1 && <LineageSection title="Standalone evolution" story={ownChainStory} rawTree={ownChainTree} currentId={c.id} onViewCombatant={onViewCombatant} />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: '1rem' }}>
        {[['Wins', c.wins || 0, 'var(--color-text-success)'], ['Losses', c.losses || 0, 'var(--color-text-danger)'], ['Draws', c.draws || 0, 'var(--color-text-secondary)'], ['Rounds', totalRounds, 'var(--color-text-tertiary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: 10, background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Reactions */}
      {(c.reactions_heart > 0 || c.reactions_angry > 0 || c.reactions_cry > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          {[['❤️', c.reactions_heart], ['😡', c.reactions_angry], ['😂', c.reactions_cry]].filter(([, n]) => n > 0).map(([icon, count]) => (
            <div key={icon} style={{ padding: '4px 10px', background: 'var(--color-background-secondary)', borderRadius: 99, border: '0.5px solid var(--color-border-tertiary)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {icon} {count}
            </div>
          ))}
        </div>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
          {groups.map(g => (
            <span key={g.id} style={{ fontSize: 12, padding: '3px 9px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99 }}>
              {g.name}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bio</span>
          {canEdit && !editMode && <button onClick={() => setEditMode(true)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
        </div>
        {editMode ? (
          <>
            <label style={lbl}>Name</label>
            <input style={inp()} value={editName} onChange={e => setEditName(e.target.value)} />
            <label style={lbl}>Bio</label>
            <textarea style={{ ...inp(), width: '100%', resize: 'none', height: 72 }} value={editBio} onChange={e => setEditBio(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={{ ...btn('primary'), flex: 2 }} onClick={saveEdit} disabled={saving || !editName.trim()}>{saving ? 'Saving…' : 'Save'}</button>
              <button style={{ ...btn('ghost'), flex: 1 }} onClick={() => { setEditName(c.name); setEditBio(c.bio || ''); setEditMode(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <p style={{ color: c.bio ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 14, margin: 0 }}>{c.bio || 'No bio yet.'}</p>
        )}
      </div>

      {/* Head-to-head */}
      {totalRounds > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <button onClick={toggleH2h} style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: h2hOpen ? 8 : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Head-to-head</span><span>{h2hOpen ? '↑' : '↓'}</span>
          </button>
          {h2hOpen && (
            h2hRows === null ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
            : h2hRows.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>No recorded matchups.</p>
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

      {/* Bio history */}
      {history.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setHistoryOpen(o => !o)} style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Bio history ({history.length})</span><span>{historyOpen ? '↑' : '↓'}</span>
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
    </div>
  )
}
