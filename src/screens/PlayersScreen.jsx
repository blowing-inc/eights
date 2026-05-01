import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, tab } from '../styles.js'
import { searchUsers } from '../supabase.js'

const PLAYERS_PAGE_SIZE = 20
const PLAYERS_SORTS = [
  { key: 'username', label: 'A–Z',  asc: true  },
  { key: 'created_at', label: 'Newest', asc: false },
]

export default function PlayersScreen({ playerId, onBack, onViewPlayer }) {
  const [query,   setQuery]   = useState('')
  const [sort,    setSort]    = useState('username')
  const [page,    setPage]    = useState(0)
  const [items,   setItems]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const searchTimer = useRef(null)

  function load(q, s, p) {
    setLoading(true)
    const def = PLAYERS_SORTS.find(x => x.key === s)
    searchUsers({ query: q, sort: s, ascending: def?.asc ?? true, page: p, pageSize: PLAYERS_PAGE_SIZE })
      .then(({ items, total }) => { setItems(items); setTotal(total); setLoading(false) })
  }

  useEffect(() => { load(query, sort, page) }, [sort, page]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQuery(v) {
    setQuery(v); setPage(0)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(v, sort, 0), 320)
  }

  const totalPages = Math.ceil(total / PLAYERS_PAGE_SIZE)

  return (
    <Screen title="Players" onBack={onBack}>
      <input style={{ ...inp(), marginBottom: 12 }} value={query} onChange={e => handleQuery(e.target.value)} placeholder="Search by username…" />
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {PLAYERS_SORTS.map(s => (
          <button key={s.key} onClick={() => { setSort(s.key); setPage(0) }} style={tab(sort === s.key)}>{s.label}</button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {!loading && items.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No players found.</p>}
      {!loading && items.map(u => (
        <button key={u.id} onClick={() => onViewPlayer(u.id)}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', background: u.id === playerId ? 'var(--color-background-info)' : 'var(--color-background-secondary)', border: u.id === playerId ? '0.5px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {u.username}{u.id === playerId ? ' (you)' : ''}
            </span>
          </div>
          {u.favorite_combatant_name && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>⭐ {u.favorite_combatant_name}</div>}
        </button>
      ))}

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
