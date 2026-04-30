import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import TagChips from '../components/TagChips.jsx'
import TagInput from '../components/TagInput.jsx'
import { btn, inp, lbl } from '../styles.js'
import { updateGlobalCombatant, getLineageTree, getCombatantRoundHistory, sget, superHostSetEntityTags, superHostInductHoF, superHostRemoveHoF, superHostEditHofNote, setCombatantGroups, getCombatantGroupIds, listPublishedGroups } from '../supabase.js'
import { buildStoryFromLineageTree, computeSuperlatives } from '../gameLogic.js'
import { downloadFile, formatCombatantHistory } from '../export.js'
import GameSummaryScreen from './GameSummaryScreen.jsx'

function joinNames(names) {
  if (!names || names.length === 0) return 'unknown'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

// Renders a lineage tree (handles both linear chains and branching).
// rawTree: raw combatant rows from getLineageTree — used for the parent→children map
//          (branching support) and for navigation data when a node is tapped.
// onViewCombatant: optional — if provided, non-current nodes become tappable links.
function LineageSection({ title, story, rawTree, currentId, onViewCombatant, onViewRoom }) {
  // selectedId drives the ancestry highlight — defaults to the current combatant.
  const [selectedId, setSelectedId] = useState(currentId)

  // validRooms: null = still loading, otherwise { [gameCode]: roomData | null }
  // null value means the room was not found in the DB (old/deleted game).
  const [validRooms, setValidRooms] = useState(null)

  useEffect(() => {
    const codes = [...new Set(story.flatMap(n => n.bornFrom?.gameCode ? [n.bornFrom.gameCode] : []))]
    if (codes.length === 0) { setValidRooms({}); return }
    Promise.all(codes.map(code => sget(code).then(data => [code, data])))
      .then(pairs => setValidRooms(Object.fromEntries(pairs)))
  }, [story])

  // Build parent→children map and child→parent map from raw tree data.
  const childMap  = {}
  const parentMap = {}  // combatantId → parentCombatantId
  ;(rawTree || []).forEach(raw => {
    const pid = raw.lineage?.parentId
    if (!pid) return
    const node = story.find(n => n.combatantId === raw.id)
    if (node) {
      if (!childMap[pid]) childMap[pid] = []
      childMap[pid].push(node)
      parentMap[raw.id] = pid
    }
  })
  // Fallback for trees without rawTree (shouldn't happen, but keeps rendering safe)
  if (!rawTree || rawTree.length === 0) {
    story.forEach((node, i) => {
      if (i === 0) return
      const parent = story[i - 1]
      if (!childMap[parent.combatantId]) childMap[parent.combatantId] = []
      childMap[parent.combatantId].push(node)
      parentMap[node.combatantId] = parent.combatantId
    })
  }

  // Collect all ancestors of selectedId so they can be muted-highlighted.
  const ancestorIds = new Set()
  let walk = parentMap[selectedId]
  while (walk) { ancestorIds.add(walk); walk = parentMap[walk] }

  function renderNode(node) {
    const isCurrent   = node.combatantId === currentId
    const isSelected  = node.combatantId === selectedId
    const isAncestor  = ancestorIds.has(node.combatantId)
    const children    = childMap[node.combatantId] || []
    const rawRecord   = (rawTree || []).find(r => r.id === node.combatantId)
    const canTap      = !isCurrent && onViewCombatant && rawRecord

    // Dot color: bright blue when selected, muted blue when ancestor, dim otherwise.
    // Using border-info (not text-info) for ancestors keeps them clearly below selected.
    const dotColor = isSelected
      ? 'var(--color-text-info)'
      : isAncestor
        ? 'var(--color-border-info)'
        : 'var(--color-border-secondary)'

    // Row background: info tint only for selected. Ancestors use text color instead
    // of background — background-tertiary is nearly invisible in dark mode.
    const rowBg = isSelected ? 'var(--color-background-info)' : 'transparent'

    // Text color: bold primary for selected, info-blue for ancestors (readable in
    // both modes and clearly "medium" between selected and unrelated nodes).
    const textColor = isSelected
      ? 'var(--color-text-primary)'
      : isAncestor
        ? 'var(--color-text-info)'
        : 'var(--color-text-secondary)'

    function handleClick() {
      setSelectedId(node.combatantId)
      if (canTap) onViewCombatant(rawRecord)
    }

    return (
      <div key={node.combatantId}>
        {/* Node row */}
        <div
          onClick={handleClick}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px', margin: '1px -6px', borderRadius: 6, background: rowBg, cursor: 'pointer', transition: 'background 0.15s' }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotColor, transition: 'background 0.15s' }} />
          <span style={{ fontSize: 14, fontWeight: isSelected ? 500 : 400, color: textColor, textDecoration: canTap ? 'underline' : 'none', textDecorationColor: 'var(--color-border-tertiary)', transition: 'color 0.15s' }}>
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

        {/* Children — tree line connects parent dot to all siblings */}
        {children.length > 0 && (
          <div style={{ marginLeft: 3, paddingLeft: 13, borderLeft: '1.5px solid var(--color-border-tertiary)' }}>
            {children.map((child, i) => (
              <div key={child.combatantId}>
                {/* Sibling separator — borderTop is cross-browser reliable; sub-pixel heights are not */}
                {i > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-border-tertiary)', margin: '6px 0' }} />
                )}
                {/* Evolution / merge event */}
                {child.bornFrom && (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '4px 0', fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                    {child.bornFrom.type === 'merge' ? (
                      <>
                        <span>⚡</span>
                        <strong style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{joinNames(child.bornFrom.parentNames)}</strong>
                        <span>merged</span>
                        {child.bornFrom.gameCode && (() => {
                          const code      = child.bornFrom.gameCode
                          const roomData  = validRooms?.[code]
                          const exists    = roomData != null
                          const gone      = validRooms !== null && roomData === null
                          const mergeRound = exists ? (roomData.rounds || []).find(r => r.number === child.bornFrom.roundNumber) : null
                          const mergeNote  = mergeRound?.merge?.mergeNote || null
                          const allOwners  = [
                            mergeRound?.merge?.primaryOwnerName,
                            ...(mergeRound?.merge?.coOwnerNames || []),
                          ].filter(Boolean)
                          const uniqueOwners = [...new Set(allOwners)]
                          return (
                            <>
                              <span
                                onClick={exists ? e => { e.stopPropagation(); onViewRoom(roomData, child.bornFrom.roundNumber) } : undefined}
                                title={gone ? 'Game no longer in database' : exists ? 'View game summary' : undefined}
                                style={{ fontStyle: 'normal', padding: '1px 5px', background: gone ? 'transparent' : 'var(--color-background-tertiary)', border: `0.5px solid ${gone ? 'var(--color-border-tertiary)' : 'var(--color-border-secondary)'}`, borderRadius: 4, fontSize: 10, color: gone ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', letterSpacing: '0.03em', cursor: exists ? 'pointer' : 'default', textDecoration: exists ? 'underline dotted' : 'none' }}
                              >
                                {code} R{child.bornFrom.roundNumber}{exists ? ' ↗' : gone ? ' –' : ''}
                              </span>
                              {uniqueOwners.length > 0 && (
                                <span style={{ fontStyle: 'normal', color: 'var(--color-text-tertiary)' }}>
                                  · by {uniqueOwners.join(', ')}
                                </span>
                              )}
                              {mergeNote && (
                                <span style={{ display: 'block', width: '100%', marginTop: 2, fontStyle: 'italic', color: 'var(--color-text-tertiary)' }}>
                                  "{mergeNote}"
                                </span>
                              )}
                            </>
                          )
                        })()}
                        <span>→</span>
                      </>
                    ) : (
                      <>
                        <span>⚡ beat</span>
                        <strong style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{child.bornFrom.opponentName || 'an opponent'}</strong>
                        {child.bornFrom.gameCode && (() => {
                          const code     = child.bornFrom.gameCode
                          const roomData = validRooms?.[code]
                          const exists   = roomData != null
                          const gone     = validRooms !== null && roomData === null
                          return (
                            <span
                              onClick={exists ? e => { e.stopPropagation(); onViewRoom(roomData, child.bornFrom.roundNumber) } : undefined}
                              title={gone ? 'Game no longer in database' : exists ? 'View game summary' : undefined}
                              style={{ fontStyle: 'normal', padding: '1px 5px', background: gone ? 'transparent' : 'var(--color-background-tertiary)', border: `0.5px solid ${gone ? 'var(--color-border-tertiary)' : 'var(--color-border-secondary)'}`, borderRadius: 4, fontSize: 10, color: gone ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', letterSpacing: '0.03em', cursor: exists ? 'pointer' : 'default', textDecoration: exists ? 'underline dotted' : 'none' }}
                            >
                              {code} R{child.bornFrom.roundNumber}{exists ? ' ↗' : gone ? ' –' : ''}
                            </span>
                          )
                        })()}
                        <span>→</span>
                      </>
                    )}
                  </div>
                )}
                {renderNode(child)}
              </div>
            ))}
          </div>
        )}
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
      {renderNode(root)}
    </div>
  )
}

export default function GlobalCombatantDetail({ combatant: init, playerId, playerName, isSuperHost, onBack, onViewCombatant }) {
  const [c, setC] = useState(init)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(init.name)
  const [editBio,  setEditBio]  = useState(init.bio || '')
  const [editTags, setEditTags] = useState(init.tags || [])
  const [saving, setSaving] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const [historyOpen,   setHistoryOpen]   = useState(false)
  const [lineageStory,  setLineageStory]  = useState([])  // heritage chain (where this combatant sits)
  const [lineageTree,   setLineageTree]   = useState([])  // raw tree data for heritage — needed for branching child map + navigation
  const [ownChainStory, setOwnChainStory] = useState([])  // standalone tree (variants produced from this combatant as root)
  const [ownChainTree,  setOwnChainTree]  = useState([])  // raw tree data for own chain — needed for navigation
  const [h2hOpen,  setH2hOpen]  = useState(false)
  const [h2hRows,  setH2hRows]  = useState(null)   // null = not yet loaded
  const [roomOverlay, setRoomOverlay] = useState(null) // { room, initialRound }

  // Super Host state
  const [shTagEdit,     setShTagEdit]     = useState(false)
  const [shEditTags,    setShEditTags]    = useState(init.tags || [])
  const [shTagSaving,   setShTagSaving]   = useState(false)
  const [shHofOpen,     setShHofOpen]     = useState(false)
  const [shHofNote,     setShHofNote]     = useState('')
  const [shHofSaving,   setShHofSaving]   = useState(false)
  const [shNoteEdit,    setShNoteEdit]    = useState(false)
  const [shNoteVal,     setShNoteVal]     = useState('')
  const [shGroupOpen,   setShGroupOpen]   = useState(false)
  const [shGroupIds,    setShGroupIds]    = useState(null)  // null = not loaded
  const [shAllGroups,   setShAllGroups]   = useState(null)
  const [shGroupSaving, setShGroupSaving] = useState(false)

  const canEdit = c.owner_id === playerId
  const totalRounds = (c.wins || 0) + (c.losses || 0) + (c.draws || 0)
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
    // Load h2h eagerly so superlatives can show on first render.
    getCombatantRoundHistory(c.id).then(setH2hRows)
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
    setH2hOpen(o => !o)
  }

  async function saveEdit() {
    if (!editName.trim()) return
    // Published combatants require a one-step confirm before writing.
    if (c.status === 'published' && !confirmPending) {
      setConfirmPending(true)
      return
    }
    setSaving(true)
    const newName = editName.trim()
    const newBio  = editBio.trim()
    const entry = { name: c.name, bio: c.bio || '', updatedAt: new Date().toISOString(), updatedBy: playerName || 'unknown' }
    const newHistory = [...history, entry].slice(-20)
    await updateGlobalCombatant(c.id, { name: newName, bio: newBio, bio_history: newHistory, tags: editTags })
    setC({ ...c, name: newName, bio: newBio, bio_history: newHistory, tags: editTags })
    setSaving(false); setConfirmPending(false); setEditMode(false)
  }

  function cancelEdit() {
    setEditName(c.name); setEditBio(c.bio || ''); setEditTags(c.tags || [])
    setConfirmPending(false); setEditMode(false)
  }

  async function shSaveTags() {
    setShTagSaving(true)
    await superHostSetEntityTags('combatants', c.id, shEditTags)
    setC(prev => ({ ...prev, tags: shEditTags }))
    setShTagSaving(false); setShTagEdit(false)
  }

  async function shInduct() {
    setShHofSaving(true)
    const ok = await superHostInductHoF(c.id, playerName, shHofNote)
    if (ok) {
      setC(prev => ({ ...prev, hall_of_fame: true, inducted_at: new Date().toISOString(), inducted_by: playerName, induction_note: shHofNote }))
      setShHofOpen(false); setShHofNote('')
    }
    setShHofSaving(false)
  }

  async function shRemoveHof() {
    setShHofSaving(true)
    const ok = await superHostRemoveHoF(c.id, playerName)
    if (ok) setC(prev => ({ ...prev, hall_of_fame: false, removed_at: new Date().toISOString(), removed_by: playerName }))
    setShHofSaving(false)
  }

  async function shSaveNote() {
    setShHofSaving(true)
    const ok = await superHostEditHofNote(c.id, shNoteVal)
    if (ok) setC(prev => ({ ...prev, induction_note: shNoteVal }))
    setShHofSaving(false); setShNoteEdit(false)
  }

  async function shOpenGroups() {
    setShGroupOpen(true)
    if (shGroupIds === null) {
      const [ids, groups] = await Promise.all([
        getCombatantGroupIds(c.id),
        listPublishedGroups(),
      ])
      setShGroupIds(ids)
      setShAllGroups(groups)
    }
  }

  async function shSaveGroups() {
    setShGroupSaving(true)
    await setCombatantGroups(c.id, shGroupIds, playerId)
    setShGroupSaving(false); setShGroupOpen(false)
  }

  return (
    <Screen title={c.name} onBack={onBack}>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {isVariant ? '⚡' : '⚔️'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>{c.name}</h2>
            {c.hall_of_fame && (
              <span title={c.inducted_by ? `Inducted by ${c.inducted_by}` : undefined} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 99, flexShrink: 0 }}>Hall of Fame</span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
            Created by {c.owner_name || 'unknown'}
            {c.source === 'created' && <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6 }}>· Made in The Workshop</span>}
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
          onViewRoom={(room, initialRound) => setRoomOverlay({ room, initialRound })}
        />
      )}
      {ownChainStory.length > 1 && (
        <LineageSection
          title="Standalone evolution"
          story={ownChainStory}
          rawTree={ownChainTree}
          currentId={c.id}
          onViewCombatant={onViewCombatant}
          onViewRoom={(room, initialRound) => setRoomOverlay({ room, initialRound })}
        />
      )}
      {roomOverlay && (
        <GameSummaryScreen
          room={roomOverlay.room}
          initialRound={roomOverlay.initialRound}
          onClose={() => setRoomOverlay(null)}
        />
      )}

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
        {[['Wins', c.wins || 0, 'var(--color-text-success)'], ['Losses', c.losses || 0, 'var(--color-text-danger)'], ['Draws', c.draws || 0, 'var(--color-text-secondary)'], ['Rounds', totalRounds, 'var(--color-text-tertiary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Superlatives ─────────────────────────────────────────────────── */}
      {(() => {
        const sup = computeSuperlatives(c, h2hRows)
        return sup.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.5rem' }}>
            {sup.map(({ label, tooltip }) => (
              <span key={label} title={tooltip} style={{ fontSize: 12, padding: '3px 10px', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 99, cursor: 'help' }}>
                {label}
              </span>
            ))}
          </div>
        ) : null
      })()}

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
            <label style={{ ...lbl, marginTop: 4 }}>Tags</label>
            <TagInput value={editTags} onChange={setEditTags} />
            {confirmPending && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '8px 0 0', padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-secondary)' }}>
                This combatant is published — edits become part of the permanent record.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btn('primary')} onClick={saveEdit} disabled={saving || !editName.trim()}>
                {saving ? 'Saving…' : confirmPending ? 'Confirm save' : 'Save'}
              </button>
              <button style={btn()} onClick={confirmPending ? () => setConfirmPending(false) : cancelEdit}>
                {confirmPending ? 'Go back' : 'Cancel'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: c.bio ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 14, margin: 0 }}>{c.bio || 'No bio yet.'}</p>
            {(c.tags || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <TagChips tags={c.tags} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Head-to-head ─────────────────────────────────────────────────── */}
      {totalRounds > 0 && (
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

      {/* ── Super Host panel ─────────────────────────────────────────────── */}
      {isSuperHost && c.status === 'published' && (
        <div style={{ marginTop: '1.5rem', borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Super Host</h3>

          {/* Tags */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Tags</span>
              {!shTagEdit && <button onClick={() => { setShTagEdit(true); setShEditTags(c.tags || []) }} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
            </div>
            {shTagEdit ? (
              <>
                <TagInput value={shEditTags} onChange={setShEditTags} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={shSaveTags} disabled={shTagSaving} style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px' }}>{shTagSaving ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setShTagEdit(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '7px' }}>Cancel</button>
                </div>
              </>
            ) : (
              <TagChips tags={c.tags || []} />
            )}
          </div>

          {/* Group membership */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Groups</span>
              {!shGroupOpen && <button onClick={shOpenGroups} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Manage</button>}
            </div>
            {shGroupOpen && (
              shAllGroups === null
                ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
                : shAllGroups.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>No published groups yet.</p>
                  : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        {shAllGroups.map(g => (
                          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 0' }}>
                            <input type="checkbox" checked={(shGroupIds || []).includes(g.id)}
                              onChange={e => setShGroupIds(ids => e.target.checked ? [...(ids || []), g.id] : (ids || []).filter(id => id !== g.id))}
                            />
                            {g.name}
                          </label>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={shSaveGroups} disabled={shGroupSaving} style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px' }}>{shGroupSaving ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => setShGroupOpen(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '7px' }}>Cancel</button>
                      </div>
                    </>
                  )
            )}
          </div>

          {/* Hall of Fame */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Hall of Fame</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {c.hall_of_fame && !shNoteEdit && (
                  <button onClick={() => { setShNoteEdit(true); setShNoteVal(c.induction_note || '') }} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit note</button>
                )}
                {c.hall_of_fame
                  ? <button onClick={shRemoveHof} disabled={shHofSaving} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>{shHofSaving ? '…' : 'Remove'}</button>
                  : !shHofOpen && <button onClick={() => setShHofOpen(true)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Induct</button>
                }
              </div>
            </div>
            {/* Induction record — visible whether currently inducted or previously removed */}
            {c.inducted_at && !shNoteEdit && (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 4px' }}>
                {c.hall_of_fame ? 'Inducted' : 'Previously inducted'}{' '}
                {new Date(c.inducted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                {c.inducted_by && ` by ${c.inducted_by}`}
                {c.induction_note && ` — "${c.induction_note}"`}
                {!c.hall_of_fame && c.removed_at && (
                  <span>
                    {' · Removed '}
                    {new Date(c.removed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {c.removed_by && ` by ${c.removed_by}`}
                  </span>
                )}
              </p>
            )}
            {shNoteEdit && (
              <>
                <input
                  style={{ ...inp(), fontSize: 13, marginBottom: 6 }}
                  placeholder="Induction note (optional)"
                  value={shNoteVal}
                  onChange={e => setShNoteVal(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={shSaveNote} disabled={shHofSaving} style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px' }}>{shHofSaving ? 'Saving…' : 'Save note'}</button>
                  <button onClick={() => setShNoteEdit(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '7px' }}>Cancel</button>
                </div>
              </>
            )}
            {!c.hall_of_fame && shHofOpen && (
              <>
                <input
                  style={{ ...inp(), fontSize: 13, marginBottom: 6 }}
                  placeholder="Induction note (optional)"
                  value={shHofNote}
                  onChange={e => setShHofNote(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={shInduct} disabled={shHofSaving} style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px' }}>{shHofSaving ? 'Inducting…' : 'Confirm induction'}</button>
                  <button onClick={() => { setShHofOpen(false); setShHofNote('') }} style={{ ...btn(), flex: 1, fontSize: 13, padding: '7px' }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Screen>
  )
}
