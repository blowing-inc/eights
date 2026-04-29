import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import TagChips from '../components/TagChips.jsx'
import { btn, tab, inp } from '../styles.js'
import { listCombatants, searchCast, listPublishedGroups, listPublishedArenas, listAllDistinctTags } from '../supabase.js'

const PAGE_SIZE = 20

const CAST_SORTS = [
  { key: 'wins',            label: 'Wins',   asc: false },
  { key: 'losses',          label: 'Losses', asc: false },
  { key: 'reactions_heart', label: '❤️',     asc: false },
  { key: 'reactions_angry', label: '😡',     asc: false },
  { key: 'reactions_cry',   label: '😂',     asc: false },
  { key: 'name',            label: 'A–Z',    asc: true  },
]

// ─── The Cast tab ─────────────────────────────────────────────────────────────

function CastTab({ query, activeTag, onFilterTag, onViewCombatant }) {
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [sort, setSort]       = useState('wins')
  const [loading, setLoading] = useState(true)
  // "characters" hides variants so each character appears once — story-first.
  const [view, setView]       = useState('characters')

  useEffect(() => { setPage(0) }, [query, activeTag])

  useEffect(() => {
    setLoading(true)
    const sortDef = CAST_SORTS.find(s => s.key === sort)
    const opts = { sort, ascending: sortDef?.asc ?? false, page, pageSize: PAGE_SIZE, baseOnly: view === 'characters', tag: activeTag }
    const fn = query.trim() ? searchCast(query.trim(), opts) : listCombatants(opts)
    fn.then(({ items, total }) => { setItems(items); setTotal(total); setLoading(false) })
  }, [sort, page, query, view, activeTag])

  function changeSort(key) { if (sort !== key) { setSort(key); setPage(0) } }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 1rem' }}>Every fighter ever entered, across all games.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {[['characters', 'Characters'], ['all', 'All forms']].map(([key, label]) => (
          <button key={key} onClick={() => { setView(key); setPage(0) }} style={tab(view === key)}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.25rem' }}>
        {CAST_SORTS.map(s => (
          <button key={s.key} onClick={() => changeSort(s.key)} style={tab(sort === s.key)}>{s.label}</button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {activeTag
            ? `No combatants tagged "${activeTag}".`
            : query.trim()
              ? `No results for "${query.trim()}".`
              : 'No combatants yet — play some games first!'}
        </p>
      )}

      {!loading && items.map((c, idx) => {
        const isVariant = !!c.lineage
        const tags = c.tags || []
        return (
          <button key={c.id} onClick={() => onViewCombatant(c)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', background: 'var(--color-background-secondary)', border: `0.5px solid ${isVariant ? 'var(--color-border-info)' : 'var(--color-border-tertiary)'}`, borderRadius: 'var(--border-radius-md)', marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 24 }}>#{page * PAGE_SIZE + idx + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</span>
                {isVariant && (
                  <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99, whiteSpace: 'nowrap' }}>
                    ⚡ gen {c.lineage.generation}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>{c.wins}W – {c.losses}L{c.draws > 0 ? ` – ${c.draws}D` : ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 32 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                by {c.owner_name || 'unknown'}
                {isVariant && c.lineage?.bornFrom?.type === 'merge' && (
                  <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                    · merged from {(c.lineage.bornFrom.parentNames || []).join(' + ')}
                    {c.lineage.bornFrom.gameCode && <> in {c.lineage.bornFrom.gameCode}</>}
                  </span>
                )}
                {isVariant && !c.lineage?.bornFrom?.type && c.lineage?.bornFrom?.opponentName && (
                  <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                    · beat <em>{c.lineage.bornFrom.opponentName}</em>
                    {c.lineage.bornFrom.gameCode && <> in {c.lineage.bornFrom.gameCode}</>}
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {c.reactions_heart > 0 && <span>❤️ {c.reactions_heart}</span>}
                {c.reactions_angry > 0 && <span>😡 {c.reactions_angry}</span>}
                {c.reactions_cry   > 0 && <span>😂 {c.reactions_cry}</span>}
              </div>
            </div>
            {c.bio && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0 32px', lineHeight: 1.4 }}>{c.bio.length > 90 ? c.bio.slice(0, 90) + '…' : c.bio}</p>}
            {tags.length > 0 && (
              <div style={{ marginTop: 6, paddingLeft: 32 }} onClick={e => e.stopPropagation()}>
                <TagChips tags={tags} onFilter={onFilterTag} />
              </div>
            )}
          </button>
        )
      })}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: '1.25rem' }}>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13 }}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13 }}>Next →</button>
        </div>
      )}
    </>
  )
}

// ─── Groups tab ───────────────────────────────────────────────────────────────

function GroupsTab({ query, activeTag, onFilterTag }) {
  const [groups, setGroups]   = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    setLoading(true)
    listPublishedGroups({ query, tag: activeTag }).then(data => { setGroups(data); setLoading(false) })
  }, [query, activeTag])

  if (loading) return <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>

  if (!groups.length) return (
    <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
      {activeTag
        ? `No groups tagged "${activeTag}".`
        : query.trim()
          ? `No groups matching "${query.trim()}".`
          : 'No groups yet.'}
    </p>
  )

  return (
    <>
      {groups.map(g => {
        const isExpanded = expanded === g.id
        const tags = g.tags || []
        return (
          <div key={g.id} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setExpanded(isExpanded ? null : g.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{g.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>{g.wins}W – {g.losses}L</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', gap: 12 }}>
                <span>{g.member_count} {g.member_count === 1 ? 'member' : 'members'}</span>
                {g.most_decorated && <span>Top: {g.most_decorated}</span>}
              </div>
              {tags.length > 0 && (
                <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                  <TagChips tags={tags} onFilter={onFilterTag} />
                </div>
              )}
            </button>
            {isExpanded && (
              <div style={{ padding: '0 14px 12px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                {g.description
                  ? <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '8px 0 4px', lineHeight: 1.5 }}>{g.description}</p>
                  : <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '8px 0 4px', fontStyle: 'italic' }}>No description.</p>}
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>by {g.owner_name}</p>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ─── Arenas tab ─────────────────────────────────────────────────────────��─────

const POOL_LABEL = { standard: 'Standard', wacky: 'Wacky', league: 'League', 'weighted-liked': 'Popular' }
const ARENA_POOLS = ['standard', 'wacky', 'league', 'weighted-liked']

function ArenasTab({ query, activeTag, activePool, onFilterTag, onFilterPool, onViewArena }) {
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(0) }, [query, activeTag, activePool])

  useEffect(() => {
    setLoading(true)
    listPublishedArenas({ query, tag: activeTag, pool: activePool, page, pageSize: PAGE_SIZE }).then(({ items, total }) => {
      setItems(items); setTotal(total); setLoading(false)
    })
  }, [query, activeTag, activePool, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      {/* Pool filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {ARENA_POOLS.map(p => (
          <button key={p} onClick={() => onFilterPool(activePool === p ? null : p)} style={tab(activePool === p)}>
            {POOL_LABEL[p]}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}

      {!loading && items.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {activePool
            ? `No arenas in the ${POOL_LABEL[activePool]} pool yet.`
            : activeTag
              ? `No arenas tagged "${activeTag}".`
              : query.trim()
                ? `No arenas matching "${query.trim()}".`
                : 'No arenas yet — create some in The Workshop.'}
        </p>
      )}

      {!loading && items.map(a => {
        const tags   = a.tags || []
        const pools  = (a.pools || []).filter(p => POOL_LABEL[p])
        const hasRules = !!a.rules?.trim()
        return (
          <button key={a.id} onClick={() => onViewArena(a)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
              background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-md)', marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{a.name}</span>
              <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 8, alignItems: 'center' }}>
                {a.likes    > 0 && <span>👍 {a.likes}</span>}
                {a.dislikes > 0 && <span>👎 {a.dislikes}</span>}
                {hasRules              && <span style={{ fontSize: 11 }}>+ rules</span>}
              </div>
            </div>
            {pools.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {pools.map(p => (
                  <span key={p} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--color-background-success)',
                    color: 'var(--color-text-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 99 }}>
                    {POOL_LABEL[p]}
                  </span>
                ))}
              </div>
            )}
            {a.bio && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>
                {a.bio.length > 100 ? a.bio.slice(0, 100) + '…' : a.bio}
              </p>
            )}
            {tags.length > 0 && (
              <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                <TagChips tags={tags} onFilter={onFilterTag} />
              </div>
            )}
          </button>
        )
      })}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: '1.25rem' }}>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13 }}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} style={{ ...btn('ghost'), padding: '6px 14px', fontSize: 13 }}>Next →</button>
        </div>
      )}
    </>
  )
}

// ─── Tags tab ─────────────────────────────────────────────────────────────────

function TagsTab({ activeTag, onFilterTag }) {
  const [tags, setTags]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listAllDistinctTags().then(data => { setTags(data); setLoading(false) })
  }, [])

  if (loading) return <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>
  if (!tags.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No tags yet.</p>

  return (
    <>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 1rem' }}>Tap a tag to filter across all tabs.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(({ tag, count }) => (
          <button
            key={tag}
            onClick={() => onFilterTag(tag === activeTag ? null : tag)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px',
              background:   activeTag === tag ? 'var(--color-background-info)' : 'var(--color-background-secondary)',
              border:       `0.5px solid ${activeTag === tag ? 'var(--color-border-info)' : 'var(--color-border-tertiary)'}`,
              borderRadius: 99, fontSize: 13,
              color:        activeTag === tag ? 'var(--color-text-info)' : 'var(--color-text-primary)',
              cursor: 'pointer',
            }}>
            {tag}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{count}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ─── Archive screen ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'cast',   label: 'The Cast' },
  { key: 'groups', label: 'Groups'   },
  { key: 'arenas', label: 'Arenas'   },
  { key: 'tags',   label: 'Tags'     },
]

export default function ArchiveScreen({ onBack, onViewCombatant, onViewArena }) {
  const [activeTab,  setActiveTab]  = useState('cast')
  const [query,      setQuery]      = useState('')
  const [activeTag,  setActiveTag]  = useState(null)
  const [activePool, setActivePool] = useState(null)
  const debounceRef = useRef(null)

  function handleSearch(val) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(val), 280)
  }

  function handleFilterTag(tag)   { setActiveTag(tag) }
  function handleFilterPool(pool) { setActivePool(pool) }
  function clearTag()             { setActiveTag(null) }

  return (
    <Screen title="The Archive" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.75rem 0 1rem' }}>The world the games have built.</p>

      <input
        style={{ ...inp(), margin: '0 0 0.75rem' }}
        placeholder="Search by name…"
        onChange={e => handleSearch(e.target.value)}
      />

      {activeTag && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Tag:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'var(--color-background-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99, fontSize: 12, color: 'var(--color-text-info)' }}>
            {activeTag}
            <button onClick={clearTag} style={{ background: 'none', border: 'none', padding: '0 0 0 2px', cursor: 'pointer', color: 'var(--color-text-info)', fontSize: 13, lineHeight: 1 }}>×</button>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={tab(activeTab === t.key)}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'cast'   && <CastTab   query={query} activeTag={activeTag} onFilterTag={handleFilterTag} onViewCombatant={onViewCombatant} />}
      {activeTab === 'groups' && <GroupsTab query={query} activeTag={activeTag} onFilterTag={handleFilterTag} />}
      {activeTab === 'arenas' && <ArenasTab query={query} activeTag={activeTag} activePool={activePool} onFilterTag={handleFilterTag} onFilterPool={handleFilterPool} onViewArena={onViewArena} />}
      {activeTab === 'tags'   && <TagsTab   activeTag={activeTag} onFilterTag={handleFilterTag} />}
    </Screen>
  )
}
