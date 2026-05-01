import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import TagChips from '../components/TagChips.jsx'
import TagInput from '../components/TagInput.jsx'
import { btn } from '../styles.js'
import { getArena, getArenaLineageTree, getArenaReaction, upsertArenaReaction, deleteArenaReaction, getArenaAppearances, hasPlayerEncounteredArena, ARENA_DISLIKE_RATIO, superHostSetEntityTags, superHostSetArenaPools } from '../supabase.js'
import GameSummaryScreen from './GameSummaryScreen.jsx'

const POOL_LABELS = { standard: 'Standard', wacky: 'Wacky', league: 'League', 'weighted-liked': 'Popular' }

// ─── Lineage tree ─────────────────────────────────────────────────────────────

function ArenaLineageTree({ tree, currentId, onViewArena }) {
  // Build parent→children map
  const childMap = {}
  tree.forEach(a => {
    const pid = a.parent_id
    if (!pid) return
    if (!childMap[pid]) childMap[pid] = []
    childMap[pid].push(a)
  })

  const root = tree.find(a => !a.parent_id)
  if (!root) return null

  function renderNode(a) {
    const isCurrent  = a.id === currentId
    const children   = childMap[a.id] || []
    const canTap     = !isCurrent && onViewArena

    return (
      <div key={a.id}>
        <div
          onClick={canTap ? () => onViewArena(a) : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px', margin: '1px -6px', borderRadius: 6,
            background: isCurrent ? 'var(--color-background-info)' : 'transparent', cursor: canTap ? 'pointer' : 'default' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: isCurrent ? 'var(--color-text-info)' : 'var(--color-border-secondary)' }} />
          <span style={{ fontSize: 14, fontWeight: isCurrent ? 500 : 400,
            color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            textDecoration: canTap ? 'underline' : 'none', textDecorationColor: 'var(--color-border-tertiary)' }}>
            {a.name}
          </span>
          {isCurrent && (
            <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-info)',
              color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99 }}>
              this arena
            </span>
          )}
        </div>
        {children.length > 0 && (
          <div style={{ marginLeft: 3, paddingLeft: 13, borderLeft: '1.5px solid var(--color-border-tertiary)' }}>
            {children.map((child, i) => (
              <div key={child.id}>
                {i > 0 && <div style={{ borderTop: '1px solid var(--color-border-tertiary)', margin: '6px 0' }} />}
                {child.born_from && (
                  <div style={{ padding: '4px 0', fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                    ⚡ variant
                    {child.born_from.gameCode && (
                      <span style={{ fontStyle: 'normal', marginLeft: 4, padding: '1px 5px',
                        background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)',
                        borderRadius: 4, fontSize: 10, color: 'var(--color-text-secondary)', letterSpacing: '0.03em' }}>
                        {child.born_from.gameCode} R{child.born_from.roundNumber}
                      </span>
                    )}
                    <span style={{ marginLeft: 4 }}>→</span>
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

  return (
    <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)',
      borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
      <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 12px',
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>Variants</h3>
      {renderNode(root)}
    </div>
  )
}

// ─── Arena detail ─────────────────────────────────────────────────────────────

const CURATED_POOLS = ['standard', 'wacky', 'league']

export default function ArenaDetailScreen({ arena: init, playerId, isSuperHost, onBack, onViewArena }) {
  // init is the card-level row (id, name, bio, rules, tags, pools, likes, dislikes, owner_name).
  // full is the complete DB row; loaded in background for bio_history + lineage columns.
  const [full, setFull]               = useState(null)
  const [lineageTree, setLineageTree] = useState([])
  const [reaction, setReaction]       = useState(null)   // 'like' | 'dislike' | null
  const [encountered, setEncountered] = useState(null)   // null = loading, true/false = resolved
  const [reacting, setReacting]       = useState(false)
  const [counts, setCounts]           = useState({ likes: init.likes || 0, dislikes: init.dislikes || 0 })
  const [appearances, setAppearances] = useState(null)   // null = not yet loaded
  const [appearancesOpen, setAppearancesOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [roomOverlay, setRoomOverlay] = useState(null)   // { room, initialRound }
  const [expandedVariantIdx, setExpandedVariantIdx] = useState(null) // timeline index of expanded variant

  // Super Host state
  const [shTagEdit,   setShTagEdit]   = useState(false)
  const [shEditTags,  setShEditTags]  = useState(init.tags || [])
  const [shTagSaving, setShTagSaving] = useState(false)
  const [shPoolEdit,  setShPoolEdit]  = useState(false)
  const [shEditPools, setShEditPools] = useState(init.pools || [])
  const [shPoolSaving,setShPoolSaving]= useState(false)

  const arena = full || init

  useEffect(() => {
    getArena(init.id).then(row => {
      if (!row) return
      setFull(row)
      setCounts({ likes: row.likes || 0, dislikes: row.dislikes || 0 })
      const rootId = row.root_id || row.id
      getArenaLineageTree(rootId).then(setLineageTree)
    })
    if (playerId) {
      getArenaReaction(init.id, playerId).then(setReaction)
      hasPlayerEncounteredArena(init.id, playerId).then(setEncountered)
    } else {
      setEncountered(false)
    }
  }, [init.id, playerId])

  // Lazy-load appearances when section is opened
  useEffect(() => {
    if (!appearancesOpen || appearances !== null) return
    const allIds = lineageTree.length > 0 ? lineageTree.map(a => a.id) : [init.id]
    getArenaAppearances(allIds).then(setAppearances)
  }, [appearancesOpen, lineageTree, init.id, appearances])

  async function handleReaction(value) {
    if (!playerId || reacting) return
    setReacting(true)
    let updated
    if (reaction === value) {
      // Toggle off
      updated = await deleteArenaReaction(init.id, playerId)
      setReaction(null)
    } else {
      updated = await upsertArenaReaction(init.id, playerId, value)
      setReaction(value)
    }
    if (updated) setCounts({ likes: updated.likes, dislikes: updated.dislikes })
    setReacting(false)
  }

  async function shSaveTags() {
    setShTagSaving(true)
    await superHostSetEntityTags('arenas', arena.id, shEditTags)
    setFull(prev => prev ? { ...prev, tags: shEditTags } : prev)
    setShTagSaving(false); setShTagEdit(false)
  }

  async function shSavePools() {
    setShPoolSaving(true)
    await superHostSetArenaPools(arena.id, shEditPools)
    setFull(prev => prev ? { ...prev, pools: shEditPools } : prev)
    setShPoolSaving(false); setShPoolEdit(false)
  }

  // Build timeline: creation + edits from bio_history + variant births from lineage
  const bioHistory = full?.bio_history || []
  const children   = lineageTree.filter(a => a.parent_id === init.id)

  const timeline = []
  if (full?.created_at) {
    timeline.push({ type: 'created', at: full.created_at, by: arena.owner_name })
  }
  for (const h of bioHistory) {
    timeline.push({ type: 'edit', at: h.updatedAt, by: h.updatedBy })
  }
  for (const child of children) {
    timeline.push({ type: 'variant', at: child.created_at, childName: child.name, born_from: child.born_from, childArena: child })
  }
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at))

  const showLineage = lineageTree.length > 1

  const curated = (arena.pools || []).filter(p => p !== 'weighted-liked')
  const isPopular = (counts.dislikes || 0) <= (counts.likes || 0) * ARENA_DISLIKE_RATIO && counts.likes > 0
  const allPools = isPopular ? [...curated, 'weighted-liked'] : curated

  const hasRules = !!arena.rules?.trim()

  return (
    <Screen title={arena.name} onBack={onBack}>

      {/* ── Pool badges ──────────────────────────────────────────────────── */}
      {allPools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1rem' }}>
          {allPools.map(p => (
            <span key={p} style={{ fontSize: 11, padding: '3px 9px',
              background: 'var(--color-background-success)', color: 'var(--color-text-success)',
              border: '0.5px solid var(--color-border-success)', borderRadius: 99 }}>
              {POOL_LABELS[p] || p}
            </span>
          ))}
        </div>
      )}

      {/* ── Description ──────────────────────────────────────────────────── */}
      {arena.bio ? (
        <p style={{ fontSize: 14, color: 'var(--color-text-primary)', margin: '0 0 1rem', lineHeight: 1.55 }}>{arena.bio}</p>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', margin: '0 0 1rem', fontStyle: 'italic' }}>No description.</p>
      )}

      {/* ── House rules ──────────────────────────────────────────────────── */}
      {hasRules && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'var(--color-background-secondary)',
          borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', margin: '0 0 4px',
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>House rules</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>{arena.rules}</p>
        </div>
      )}

      {/* ── Tags ─────────────────────────────────────────────────────────── */}
      {(arena.tags || []).length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <TagChips tags={arena.tags} />
        </div>
      )}

      {/* ��─ Likes / dislikes + reaction ──────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {encountered === true ? (
            <>
              <button
                onClick={() => handleReaction('like')}
                disabled={reacting}
                style={{ ...btn(reaction === 'like' ? 'primary' : 'ghost'), padding: '6px 14px', fontSize: 13 }}>
                👍 {counts.likes > 0 ? counts.likes : ''}
              </button>
              <button
                onClick={() => handleReaction('dislike')}
                disabled={reacting}
                style={{ ...btn(reaction === 'dislike' ? 'danger' : 'ghost'), padding: '6px 14px', fontSize: 13 }}>
                👎 {counts.dislikes > 0 ? counts.dislikes : ''}
              </button>
            </>
          ) : (
            <>
              {counts.likes    > 0 && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>👍 {counts.likes}</span>}
              {counts.dislikes > 0 && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>👎 {counts.dislikes}</span>}
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>by {arena.owner_name}</span>
        </div>
        {playerId && encountered === false && (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '6px 0 0', fontStyle: 'italic' }}>
            Play in a game with this arena to rate it.
          </p>
        )}
      </div>

      {/* ── Lineage / variant tree ───────────────────────────────────────── */}
      {showLineage && (
        <ArenaLineageTree tree={lineageTree} currentId={init.id} onViewArena={onViewArena} />
      )}

      {/* ── Room overlay ─────────────────────────────────────────────────── */}
      {roomOverlay && (
        <GameSummaryScreen room={roomOverlay.room} initialRound={roomOverlay.initialRound} onClose={() => setRoomOverlay(null)} />
      )}

      {/* ── Update history timeline ──────────────────────────────────────── */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button onClick={() => setHistoryOpen(o => !o)}
            style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: historyOpen ? 8 : 0,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Update history ({timeline.length})</span>
            <span>{historyOpen ? '↑' : '↓'}</span>
          </button>
          {historyOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {timeline.map((entry, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--color-background-secondary)',
                  borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)', fontSize: 13,
                  cursor: entry.type === 'variant' ? 'pointer' : 'default' }}
                  onClick={entry.type === 'variant' ? () => setExpandedVariantIdx(expandedVariantIdx === i ? null : i) : undefined}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {entry.type === 'created' && 'Created'}
                      {entry.type === 'edit'    && 'Description edited'}
                      {entry.type === 'variant' && (
                        <>
                          Variant born: <strong style={{ color: 'var(--color-text-primary)' }}>{entry.childName}</strong>
                          {entry.born_from?.gameCode && (
                            <span style={{ marginLeft: 6, padding: '1px 5px', background: 'var(--color-background-tertiary)',
                              border: '0.5px solid var(--color-border-secondary)', borderRadius: 4, fontSize: 11,
                              color: 'var(--color-text-secondary)', letterSpacing: '0.03em' }}>
                              {entry.born_from.gameCode} R{entry.born_from.roundNumber}
                            </span>
                          )}
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                            {expandedVariantIdx === i ? '↑' : '↓'}
                          </span>
                        </>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 8 }}>
                      {new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>by {entry.by}</p>
                  {entry.type === 'variant' && expandedVariantIdx === i && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
                      {entry.childArena?.bio || <em style={{ color: 'var(--color-text-tertiary)' }}>No description.</em>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Appearances ──────────────────────────────────────────────────── */}
      <div>
        <button onClick={() => setAppearancesOpen(o => !o)}
          style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: appearancesOpen ? 8 : 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Appearances{appearances !== null ? ` (${appearances.length})` : ''}</span>
          <span>{appearancesOpen ? '↑' : '↓'}</span>
        </button>
        {appearancesOpen && (
          appearances === null
            ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
            : appearances.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>No recorded appearances yet.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {appearances.map((ap, i) => (
                    <button key={i} onClick={() => setRoomOverlay({ room: ap.roomData, initialRound: ap.roundNumber })}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', background: 'var(--color-background-secondary)',
                        border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)',
                        cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                        {ap.gameCode}
                        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                          Round {ap.roundNumber}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>↗</span>
                    </button>
                  ))}
                </div>
              )
        )}
      </div>

      {/* ── Super Host panel ─────────────────────────────────────────────── */}
      {isSuperHost && arena.status === 'published' && (
        <div style={{ marginTop: '1.5rem', borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Super Host</h3>

          {/* Tags */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Tags</span>
              {!shTagEdit && <button onClick={() => { setShTagEdit(true); setShEditTags(arena.tags || []) }} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
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
              <TagChips tags={arena.tags || []} />
            )}
          </div>

          {/* Pool membership */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Preset pools</span>
              {!shPoolEdit && <button onClick={() => { setShPoolEdit(true); setShEditPools(arena.pools || []) }} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
            </div>
            {shPoolEdit ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {CURATED_POOLS.map(pool => (
                    <label key={pool} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 0' }}>
                      <input type="checkbox" checked={shEditPools.includes(pool)}
                        onChange={e => setShEditPools(prev => e.target.checked ? [...prev, pool] : prev.filter(p => p !== pool))}
                      />
                      {POOL_LABELS[pool]}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={shSavePools} disabled={shPoolSaving} style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px' }}>{shPoolSaving ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setShPoolEdit(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '7px' }}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CURATED_POOLS.map(pool => (
                  <span key={pool} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, border: '0.5px solid var(--color-border-secondary)', color: (arena.pools || []).includes(pool) ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', background: (arena.pools || []).includes(pool) ? 'var(--color-background-secondary)' : 'transparent' }}>
                    {POOL_LABELS[pool]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </Screen>
  )
}
