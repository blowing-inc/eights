import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import TagChips from '../components/TagChips.jsx'
import { btn, tab, inp } from '../styles.js'
import { listCombatants, searchCast } from '../supabase.js'

const CAST_SORTS = [
  { key: 'wins',            label: 'Wins',   asc: false },
  { key: 'losses',          label: 'Losses', asc: false },
  { key: 'reactions_heart', label: '❤️',     asc: false },
  { key: 'reactions_angry', label: '😡',     asc: false },
  { key: 'reactions_cry',   label: '😂',     asc: false },
  { key: 'name',            label: 'A–Z',    asc: true  },
]
const PAGE_SIZE = 20

export default function ArchiveScreen({ onBack, onViewCombatant }) {
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [sort, setSort]         = useState('wins')
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const debounceRef = useRef(null)
  // "characters" hides variants (combatants with lineage set) so each character
  // appears once — story-first, not form-first. "all" shows every published form.
  const [view, setView] = useState('characters')

  useEffect(() => {
    setLoading(true)
    const sortDef = CAST_SORTS.find(s => s.key === sort)
    // baseOnly filters variants server-side so pagination counts are accurate
    const opts = { sort, ascending: sortDef?.asc ?? false, page, pageSize: PAGE_SIZE, baseOnly: view === 'characters', tag: activeTag }
    const fn = query.trim()
      ? searchCast(query.trim(), opts)
      : listCombatants(opts)
    fn.then(({ items, total }) => { setItems(items); setTotal(total); setLoading(false) })
  }, [sort, page, query, view, activeTag])

  function changeSort(key) {
    if (sort === key) return
    setSort(key); setPage(0)
  }

  function handleSearch(val) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setQuery(val); setPage(0) }, 280)
  }

  function filterByTag(tag) {
    setActiveTag(tag); setPage(0)
  }

  function clearTagFilter() {
    setActiveTag(null); setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Screen title="The Cast" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.75rem 0 1rem' }}>Every fighter ever entered, across all games.</p>

      <input
        style={{ ...inp(), margin: '0 0 1rem' }}
        placeholder="Search by name, bio, or player…"
        onChange={e => handleSearch(e.target.value)}
      />

      {/* Active tag filter pill */}
      {activeTag && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Tag:</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px',
            background: 'var(--color-background-info)',
            border: '0.5px solid var(--color-border-info)',
            borderRadius: 99, fontSize: 12, color: 'var(--color-text-info)',
          }}>
            {activeTag}
            <button
              onClick={clearTagFilter}
              style={{ background: 'none', border: 'none', padding: '0 0 0 2px', cursor: 'pointer', color: 'var(--color-text-info)', fontSize: 13, lineHeight: 1 }}
            >×</button>
          </span>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {[['characters', 'Characters'], ['all', 'All forms']].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={tab(view === key)}>{label}</button>
        ))}
      </div>

      {/* Sort bar */}
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
                <TagChips tags={tags} onFilter={filterByTag} />
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
    </Screen>
  )
}
