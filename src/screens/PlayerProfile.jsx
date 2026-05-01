import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import PlayerStatsBlurb from '../components/PlayerStatsBlurb.jsx'
import { btn, inp, tab } from '../styles.js'
import { getUserProfile, getPlayerRoomStats, getPlayerCombatants, getPlayerRooms, setFavoriteCombatant, getAwardsForPlayer } from '../supabase.js'
import { AWARD_TYPE_LABELS } from '../gameLogic.js'

const PROFILE_SORTS = [
  { key: 'wins',   label: 'Wins',   asc: false },
  { key: 'losses', label: 'Losses', asc: false },
  { key: 'name',   label: 'A–Z',    asc: true  },
]

export default function PlayerProfile({ profileId, playerId, onBack, onViewCombatant, onViewRoom }) {
  const isOwnProfile = profileId === playerId

  const [profile,   setProfile]   = useState(null)
  const [stats,     setStats]     = useState(null)
  const [combatants, setCombatants] = useState([])
  const [combTotal, setCombTotal] = useState(0)
  const [query,     setQuery]     = useState('')
  const [sort,      setSort]      = useState('wins')
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [combLoading, setCombLoading] = useState(true)
  const [savingFav, setSavingFav] = useState(null)
  const [games,     setGames]     = useState([])
  const [awards,    setAwards]    = useState([])
  const searchTimer = useRef(null)

  useEffect(() => {
    getUserProfile(profileId).then(setProfile)
    getPlayerRoomStats(profileId).then(setStats)
    getPlayerRooms(profileId).then(setGames)
    getAwardsForPlayer(profileId).then(setAwards)
  }, [profileId])

  function loadCombatants(q, s, p) {
    setCombLoading(true)
    const def = PROFILE_SORTS.find(x => x.key === s)
    getPlayerCombatants({ ownerId: profileId, query: q, sort: s, ascending: def?.asc ?? false, page: p, pageSize: 20 })
      .then(({ items, total }) => { setCombatants(items); setCombTotal(total); setCombLoading(false); setLoading(false) })
  }

  useEffect(() => { loadCombatants(query, sort, page) }, [profileId, sort, page]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQuery(v) {
    setQuery(v); setPage(0)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadCombatants(v, sort, 0), 320)
  }

  async function pickFavorite(c) {
    setSavingFav(c.id)
    await setFavoriteCombatant(playerId, c.id, c.name)
    setProfile(p => ({ ...p, favorite_combatant_id: c.id, favorite_combatant_name: c.name }))
    setSavingFav(null)
  }

  const totalPages = Math.ceil(combTotal / 20)
  const username = profile?.username || '…'

  return (
    <Screen title={isOwnProfile ? 'Your profile' : username} onBack={onBack}>
      <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>{username}</div>
        <PlayerStatsBlurb stats={stats} favoriteName={profile?.favorite_combatant_name} />
      </div>

      {awards.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
            Awards
          </h3>
          <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {awards.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
                  <div>
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {AWARD_TYPE_LABELS[a.type] || a.type}
                    </span>
                    {a.co_award && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>(shared)</span>}
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6, textTransform: 'capitalize' }}>{a.layer}</span>
                  </div>
                  {a.value != null && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}>{a.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {games.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
            Games ({games.length})
          </h3>
          <div style={{ marginBottom: '1.5rem' }}>
            {games.map(g => {
              const dateStr = new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              const opponents = g.otherPlayers.length > 0 ? `vs ${g.otherPlayers.join(', ')}` : 'solo'
              const clickable = !!onViewRoom
              return (
                <div key={g.id}
                  onClick={clickable ? () => onViewRoom(g.id) : undefined}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8, cursor: clickable ? 'pointer' : 'default' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '0.04em' }}>{g.code}</span>
                      {g.seriesId && <span style={{ fontSize: 11, padding: '1px 5px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 99 }}>Series</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{dateStr} · {opponents}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                    {g.roundWins}W – {g.roundLosses}L
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
        Combatants {combTotal > 0 ? `(${combTotal})` : ''}
      </h3>
      <input style={{ ...inp(), marginBottom: 10 }} value={query} onChange={e => handleQuery(e.target.value)} placeholder="Search combatants…" />
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {PROFILE_SORTS.map(s => (
          <button key={s.key} onClick={() => { setSort(s.key); setPage(0) }} style={tab(sort === s.key)}>{s.label}</button>
        ))}
      </div>

      {(loading || combLoading) && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {!combLoading && combatants.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No published combatants yet.</p>}
      {!combLoading && combatants.map(c => {
        const isFav = profile?.favorite_combatant_id === c.id
        return (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: isFav ? 'var(--color-background-info)' : 'var(--color-background-secondary)', border: isFav ? '0.5px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
            <button onClick={() => onViewCombatant(c)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{isFav ? '⭐ ' : ''}{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.wins}W – {c.losses}L{c.draws > 0 ? ` – ${c.draws}D` : ''}</span>
              </div>
              {c.bio && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{c.bio.length > 70 ? c.bio.slice(0, 70) + '…' : c.bio}</div>}
            </button>
            {isOwnProfile && (
              <button onClick={() => pickFavorite(c)} disabled={!!savingFav || isFav}
                style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: isFav ? 'default' : 'pointer', opacity: savingFav === c.id ? 0.4 : 1, flexShrink: 0 }}
                title={isFav ? 'Current favorite' : 'Set as favorite'}>
                {isFav ? '⭐' : '☆'}
              </button>
            )}
          </div>
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
