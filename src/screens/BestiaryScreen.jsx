import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, tab } from '../styles.js'
import { listCombatants } from '../supabase.js'

const BESTIARY_SORTS = [
  { key: 'wins',            label: 'Wins',   asc: false },
  { key: 'losses',          label: 'Losses', asc: false },
  { key: 'reactions_heart', label: '❤️',     asc: false },
  { key: 'reactions_angry', label: '😡',     asc: false },
  { key: 'reactions_cry',   label: '😂',     asc: false },
  { key: 'name',            label: 'A–Z',    asc: true  },
]
const PAGE_SIZE = 20

export default function BestiaryScreen({ onBack, onViewCombatant }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('wins')
  const [loading, setLoading] = useState(true)
  // "characters" hides variants (combatants with lineage set) so each character
  // appears once — story-first, not form-first. "all" shows every published form.
  const [view, setView] = useState('characters')

  useEffect(() => {
    setLoading(true)
    const sortDef = BESTIARY_SORTS.find(s => s.key === sort)
    listCombatants({ sort, ascending: sortDef?.asc ?? false, page, pageSize: PAGE_SIZE }).then(({ items, total }) => {
      setItems(items); setTotal(total); setLoading(false)
    })
  }, [sort, page])

  function changeSort(key) {
    if (sort === key) return
    setSort(key); setPage(0)
  }

  // In "characters" mode, hide variants — they're surfaced inside GlobalCombatantDetail.
  const displayItems = view === 'characters'
    ? items.filter(c => !c.lineage)
    : items

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Screen title="Bestiary" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.75rem 0 1rem' }}>Every fighter ever entered, across all games.</p>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {[['characters', 'Characters'], ['all', 'All forms']].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={tab(view === key)}>{label}</button>
        ))}
      </div>

      {/* Sort bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.25rem' }}>
        {BESTIARY_SORTS.map(s => (
          <button key={s.key} onClick={() => changeSort(s.key)} style={tab(sort === s.key)}>{s.label}</button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {!loading && displayItems.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {view === 'characters' && items.length > 0
            ? 'No base characters on this page — switch to "All forms" to see evolved variants.'
            : 'No combatants yet — play some games first!'}
        </p>
      )}

      {!loading && displayItems.map((c, idx) => {
        const isVariant = !!c.lineage
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
                {isVariant && c.lineage?.bornFrom?.opponentName && (
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
