import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import TagInput from '../components/TagInput.jsx'
import { btn, inp, lbl } from '../styles.js'
import { createSeason, getSeasons, updateSeason, getSeasonRooms, createPendingAward, getAwardsForScope, createAutoAwards } from '../supabase.js'
import { uid, computeSeriesStandings, groupRoomsForHistory, getSeasonCombatantNominees, getSeasonEvolutionNominees, computeSeasonAutoAwards, computeSeasonToneDisplay, AWARD_TYPE_LABELS } from '../gameLogic.js'
import VotingPanel from '../components/VotingPanel.jsx'

function ToggleRow({ label, description, value, onToggle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{description}</div>}
      </div>
      <button
        onClick={onToggle}
        style={{ flexShrink: 0, marginLeft: 16, width: 40, height: 22, borderRadius: 99, border: 'none', outline: value ? 'none' : '0.5px solid var(--color-border-secondary)', padding: 0, background: value ? 'var(--color-text-info)' : 'var(--color-background-tertiary)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
      >
        <span style={{ position: 'absolute', top: 3, left: value ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
      </button>
    </div>
  )
}

function StatusBadge({ status }) {
  const style = {
    fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
    ...(status === 'active'
      ? { background: 'var(--color-background-success)', color: 'var(--color-text-success)', border: '0.5px solid var(--color-border-success)' }
      : status === 'ended'
        ? { background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border-tertiary)' }
        : { background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)' })
  }
  return <span style={style}>{status}</span>
}

function StandingsTable({ rooms }) {
  const rows = computeSeriesStandings(rooms)
  if (rows.length === 0) return null
  return (
    <div style={{ padding: '12px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Standings</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>Player</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>W</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>D</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4, paddingRight: 8 }}>L</th>
            <th style={{ textAlign: 'right', fontWeight: 400, color: 'var(--color-text-tertiary)', paddingBottom: 4 }}>G</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId} style={{ borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
              <td style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 8, color: 'var(--color-text-primary)' }}>{r.playerName}</td>
              <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--color-text-success)', fontWeight: 500 }}>{r.wins}</td>
              <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--color-text-secondary)' }}>{r.draws}</td>
              <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--color-text-tertiary)' }}>{r.losses}</td>
              <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{r.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SeasonDetail({ season: initialSeason, playerId, onBack, onStartSeries }) {
  const [season, setSeason] = useState(initialSeason)
  const [seasonRooms, setSeasonRooms] = useState(null)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [seasonAwards, setSeasonAwards] = useState(null)
  const awardCreationRef = useRef(false)
  const autoAwardRef    = useRef(false)

  // Tone edit state (season creator only, between games)
  const [toneEnabled,  setToneEnabled]  = useState(() => !!initialSeason.tone)
  const [toneTags,     setToneTags]     = useState(() => initialSeason.tone?.tags || [])
  const [tonePremise,  setTonePremise]  = useState(() => initialSeason.tone?.premise || '')
  const [savingTone,   setSavingTone]   = useState(false)

  useEffect(() => {
    getSeasonRooms(season.id).then(rooms => {
      setSeasonRooms(rooms)
      // Auto-close when last series has ended
      if (
        season.status === 'active' &&
        season.series_played >= season.series_count &&
        rooms.length > 0 &&
        rooms.every(r => r.phase === 'ended')
      ) {
        updateSeason(season.id, { status: 'ended' }).then(updated => setSeason(updated))
      }
    })
  }, [season.id, season.status, season.series_played, season.series_count])

  // Auto-create the three season award rows the moment the season closes.
  useEffect(() => {
    if (season.status !== 'ended') return
    if (season.votes) return
    if (!seasonRooms) return
    if (awardCreationRef.current) return
    awardCreationRef.current = true

    const now = new Date().toISOString()
    const favId  = uid()
    const mccId  = uid()
    const bestId = uid()
    const pending = { ballot_state: { phase: 'nomination', lockedVoterIds: [], runoffPool: null }, created_at: now, updated_at: now }

    Promise.all([
      createPendingAward({ id: favId,  type: 'favorite_combatant',     layer: 'season', scope_id: season.id, scope_type: 'season', recipient_type: 'combatant', ...pending }),
      createPendingAward({ id: mccId,  type: 'most_creative_combatant', layer: 'season', scope_id: season.id, scope_type: 'season', recipient_type: 'combatant', ...pending }),
      createPendingAward({ id: bestId, type: 'best_evolution',          layer: 'season', scope_id: season.id, scope_type: 'season', recipient_type: 'combatant', ...pending }),
    ])
      .then(() => updateSeason(season.id, { votes: { favoriteCombatantAwardId: favId, mostCreativeAwardId: mccId, bestEvolutionAwardId: bestId } }))
      .then(updated => setSeason(updated))
      .catch(e => console.error('createSeasonAwards', e))
  }, [season.status, season.votes, seasonRooms])

  // Compute and store automatic season awards once (idempotent guard via autoAwardRef).
  useEffect(() => {
    if (season.status !== 'ended') return
    if (!seasonRooms || seasonRooms.length === 0) return
    if (autoAwardRef.current) return
    autoAwardRef.current = true

    getAwardsForScope(season.id).then(existing => {
      const hasAuto = existing.some(a => a.type === 'most_wins' || a.type === 'most_evolutions')
      if (hasAuto) {
        setSeasonAwards(existing)
        return
      }
      const autoAwards = computeSeasonAutoAwards(seasonRooms, season.id)
      if (autoAwards.length === 0) {
        setSeasonAwards(existing)
        return
      }
      createAutoAwards(autoAwards)
        .then(() => getAwardsForScope(season.id).then(setSeasonAwards))
        .catch(e => { console.error('createAutoAwards season', e); setSeasonAwards(existing) })
    })
  }, [season.status, season.id, seasonRooms])

  // Refresh resolved awards list when ballot votes are cast (season.votes changes).
  useEffect(() => {
    if (season.status !== 'ended') return
    getAwardsForScope(season.id).then(setSeasonAwards)
  }, [season.votes, season.id, season.status])

  async function handleSaveTone() {
    setSavingTone(true)
    const tone = toneEnabled && toneTags.length > 0
      ? { tags: toneTags, premise: tonePremise.trim() }
      : null
    try {
      const updated = await updateSeason(season.id, { tone })
      setSeason(updated)
    } finally {
      setSavingTone(false)
    }
  }

  async function handleCloseEarly() {
    setClosing(true)
    try {
      const updated = await updateSeason(season.id, { status: 'ended' })
      setSeason(updated)
    } finally {
      setClosing(false)
      setConfirmClose(false)
    }
  }

  const hasRooms    = seasonRooms !== null && seasonRooms.length > 0
  const allEnded    = hasRooms && seasonRooms.every(r => r.phase === 'ended')
  const anyActive   = hasRooms && seasonRooms.some(r => r.phase !== 'ended')
  const seriesItems = seasonRooms ? groupRoomsForHistory(seasonRooms).filter(i => i.type === 'series') : []
  const standaloneItems = seasonRooms ? groupRoomsForHistory(seasonRooms).filter(i => i.type === 'standalone') : []

  const canStartFirst = season.status === 'active' && !hasRooms
  const canStartNext  = season.status === 'active' && allEnded && season.series_played < season.series_count
  const canCloseEarly = season.status === 'active' && (allEnded || !hasRooms)

  const firstDate = seasonRooms && hasRooms
    ? new Date(Math.min(...seasonRooms.map(r => r.createdAt))).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const lastDate = seasonRooms && hasRooms
    ? new Date(Math.max(...seasonRooms.map(r => r.createdAt))).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <Screen title={season.name} onBack={onBack}>
      {/* Header meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <StatusBadge status={season.status} />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {season.series_played} / {season.series_count} series played
        </span>
        {firstDate && (
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {firstDate}{lastDate && lastDate !== firstDate ? ` – ${lastDate}` : ''}
          </span>
        )}
      </div>

      {/* Players roster */}
      {(season.players || []).length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {season.players.map((p, i) => (
            <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', color: 'var(--color-text-secondary)' }}>
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Standings */}
      {seasonRooms === null && (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: '1rem' }}>Loading…</p>
      )}
      {seasonRooms !== null && seasonRooms.length > 0 && (
        <StandingsTable rooms={seasonRooms} />
      )}

      {/* Derived tone display */}
      {seasonRooms !== null && (() => {
        const display = computeSeasonToneDisplay(seasonRooms)
        if (!display) return null
        return (
          <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 7 }}>Tone</div>
            {display.type === 'varied'
              ? <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>So Many Tones</span>
              : <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: display.premise ? 6 : 0 }}>
                    {display.tags.map(t => (
                      <span key={t} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-secondary)' }}>{t}</span>
                    ))}
                  </div>
                  {display.premise && (
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{display.premise}</p>
                  )}
                </>
            }
          </div>
        )
      })()}

      {/* Series history */}
      {[...seriesItems, ...standaloneItems].length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Series history</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seriesItems.map((item, idx) => {
              const firstGame = item.rooms[0]
              const allDone   = item.rooms.every(r => r.phase === 'ended')
              const dateStr   = new Date(firstGame.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              const totalRounds = item.rooms.reduce((n, r) => n + (r.rounds || []).filter(rd => rd.winner || rd.draw).length, 0)
              return (
                <div key={item.seriesId} style={{ padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-info)', borderRadius: 'var(--border-radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, padding: '1px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)', fontWeight: 500 }}>Series {idx + 1}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{item.rooms.length} game{item.rooms.length !== 1 ? 's' : ''} · {totalRounds} rounds</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!allDone && <span style={{ fontSize: 11, padding: '1px 6px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>active</span>}
                      {dateStr}
                    </span>
                  </div>
                </div>
              )
            })}
            {standaloneItems.map((item, _idx) => {
              const r = item.room
              const dateStr = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              const rounds = (r.rounds || []).filter(rd => rd.winner || rd.draw).length
              return (
                <div key={r.id} style={{ padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{r.code} · {rounds} round{rounds !== 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{dateStr}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active series notice */}
      {anyActive && season.status === 'active' && (
        <div style={{ padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
            A series is currently in progress. Close it between series to continue the season or close early.
          </p>
        </div>
      )}

      {/* Tone settings (season creator, between games) */}
      {season.status === 'active' && playerId === season.owner_id && !anyActive && (
        <div style={{ marginBottom: '1.5rem', padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: toneEnabled ? 12 : 0 }}>
            <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Season tone</div>
            <button
              onClick={() => setToneEnabled(v => !v)}
              style={{ flexShrink: 0, marginLeft: 16, width: 40, height: 22, borderRadius: 99, border: 'none', outline: toneEnabled ? 'none' : '0.5px solid var(--color-border-secondary)', padding: 0, background: toneEnabled ? 'var(--color-text-info)' : 'var(--color-background-tertiary)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
            >
              <span style={{ position: 'absolute', top: 3, left: toneEnabled ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
            </button>
          </div>
          {toneEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>Tags (2–3)</div>
                <TagInput value={toneTags} onChange={setToneTags} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>Premise <span style={{ opacity: 0.6 }}>(optional)</span></div>
                <textarea
                  value={tonePremise}
                  onChange={e => setTonePremise(e.target.value)}
                  placeholder="Set the scene in a sentence or two…"
                  maxLength={280}
                  rows={2}
                  style={{ ...inp(), resize: 'vertical', margin: 0 }}
                />
              </div>
            </div>
          )}
          <button
            onClick={handleSaveTone}
            disabled={savingTone || (toneEnabled && toneTags.length < 2)}
            style={{ ...btn('primary'), marginTop: toneEnabled ? 12 : 10, fontSize: 13, padding: '7px 14px' }}
          >
            {savingTone ? 'Saving…' : 'Save tone'}
          </button>
          {toneEnabled && toneTags.length < 2 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>Add at least 2 tags to save.</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {canStartFirst && (
        <div style={{ marginBottom: '1rem' }}>
          <button style={btn('primary')} onClick={() => onStartSeries(season)}>
            Start first series
          </button>
        </div>
      )}

      {canStartNext && (
        <div style={{ marginBottom: '1rem' }}>
          <button style={btn('primary')} onClick={() => onStartSeries(season)}>
            Start next series ({season.series_played + 1} of {season.series_count})
          </button>
        </div>
      )}

      {canCloseEarly && !confirmClose && (
        <button style={{ ...btn('ghost'), color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }} onClick={() => setConfirmClose(true)}>
          Close season early
        </button>
      )}

      {confirmClose && (
        <div style={{ padding: '14px 16px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 12px' }}>
            Close this season early? Standings and history are preserved. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn('ghost'), flex: 1, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }} onClick={handleCloseEarly} disabled={closing}>
              {closing ? 'Closing…' : 'Yes, close season'}
            </button>
            <button style={{ ...btn('ghost'), flex: 1 }} onClick={() => setConfirmClose(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {season.status === 'ended' && (() => {
        const isCreator = playerId === season.owner_id

        const seasonVoters = (() => {
          if (!seasonRooms) return []
          const seen = new Set()
          const result = []
          for (const r of seasonRooms) {
            for (const p of (r.players || [])) {
              if (!p.isBot && p.id && !seen.has(p.id)) {
                seen.add(p.id)
                result.push({ id: p.id, name: p.name })
              }
            }
          }
          return result
        })()

        const seasonCombatantNominees = seasonRooms ? getSeasonCombatantNominees(seasonRooms) : []
        const seasonEvolutionNominees = seasonRooms ? getSeasonEvolutionNominees(seasonRooms)  : []

        const AUTO_AWARD_TYPES = ['most_wins', 'most_evolutions']
        const resolvedAutoAwards = (seasonAwards || []).filter(a => a.awarded_at && AUTO_AWARD_TYPES.includes(a.type))

        return (
          <div>
            {/* Automatic awards */}
            {resolvedAutoAwards.length > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Season awards</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {resolvedAutoAwards.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {AWARD_TYPE_LABELS[a.type] || a.type}
                        {a.co_award && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>(shared)</span>}
                      </span>
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, marginLeft: 12 }}>
                        {a.recipient_name}
                        {a.value != null && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{a.value}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voted awards */}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 12 }}>Season votes</div>

            {!season.votes && (
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Opening ballots…</p>
            )}

            {season.votes && (
              <>
                <VotingPanel
                  key={season.votes.favoriteCombatantAwardId}
                  awardId={season.votes.favoriteCombatantAwardId}
                  label="Favorite combatant of the season"
                  nominees={seasonCombatantNominees}
                  voters={seasonVoters}
                  playerId={playerId}
                  isHost={isCreator}
                  onResolved={() => getAwardsForScope(season.id).then(setSeasonAwards)}
                />
                <VotingPanel
                  key={season.votes.mostCreativeAwardId}
                  awardId={season.votes.mostCreativeAwardId}
                  label="Most creative combatant"
                  nominees={seasonCombatantNominees}
                  voters={seasonVoters}
                  playerId={playerId}
                  isHost={isCreator}
                  onResolved={() => getAwardsForScope(season.id).then(setSeasonAwards)}
                />
                {seasonEvolutionNominees.length > 0 && (
                  <VotingPanel
                    key={season.votes.bestEvolutionAwardId}
                    awardId={season.votes.bestEvolutionAwardId}
                    label="Best evolution of the season"
                    nominees={seasonEvolutionNominees}
                    voters={seasonVoters}
                    playerId={playerId}
                    isHost={isCreator}
                    onResolved={() => getAwardsForScope(season.id).then(setSeasonAwards)}
                  />
                )}
              </>
            )}
          </div>
        )
      })()}
    </Screen>
  )
}

function CreateSeasonForm({ playerId, playerName, onBack, onCreate }) {
  const [name, setName]                       = useState('')
  const [players, setPlayers]                 = useState(playerName ? [{ name: playerName }] : [])
  const [playerInput, setPlayerInput]         = useState('')
  const [seriesCount, setSeriesCount]         = useState(3)
  const [latestEvosOnly, setLatestEvosOnly]   = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState(null)

  function addPlayer() {
    const trimmed = playerInput.trim()
    if (!trimmed) return
    if (players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setPlayerInput('')
      return
    }
    setPlayers(prev => [...prev, { name: trimmed }])
    setPlayerInput('')
  }

  function removePlayer(idx) {
    setPlayers(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const season = {
        id:                     uid(),
        name:                   name.trim(),
        league_id:              null,
        owner_id:               playerId,
        owner_name:             playerName,
        status:                 'active',
        series_count:           seriesCount,
        series_played:          0,
        latest_evolutions_only: latestEvosOnly,
        players,
      }
      const saved = await createSeason(season)
      onCreate(saved)
    } catch (e) {
      console.error('createSeason failed', e)
      setError('Failed to create season. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen title="New season" onBack={onBack}>
      <label style={lbl}>Season name</label>
      <input
        style={inp()}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Spring 2026"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
      />

      <label style={{ ...lbl, marginBottom: 6 }}>Players</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          style={{ ...inp(), margin: 0, flex: 1 }}
          value={playerInput}
          onChange={e => setPlayerInput(e.target.value)}
          placeholder="Add a player name"
          onKeyDown={e => e.key === 'Enter' && addPlayer()}
        />
        <button style={{ ...btn('ghost'), flexShrink: 0 }} onClick={addPlayer} disabled={!playerInput.trim()}>
          Add
        </button>
      </div>
      {players.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {players.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '3px 8px 3px 10px', borderRadius: 99, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-primary)' }}>
              {p.name}
              <button onClick={() => removePlayer(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Series count</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>How many series make up this season</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 16 }}>
            <button onClick={() => setSeriesCount(n => Math.max(1, n - 1))} disabled={seriesCount <= 1}
              style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 16, cursor: seriesCount <= 1 ? 'default' : 'pointer', opacity: seriesCount <= 1 ? 0.35 : 1, lineHeight: 1 }}>−</button>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 18, textAlign: 'center' }}>{seriesCount}</span>
            <button onClick={() => setSeriesCount(n => Math.min(12, n + 1))} disabled={seriesCount >= 12}
              style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 16, cursor: seriesCount >= 12 ? 'default' : 'pointer', opacity: seriesCount >= 12 ? 0.35 : 1, lineHeight: 1 }}>+</button>
          </div>
        </div>
        <ToggleRow
          label="Latest evolutions only"
          description="Stored now — draft-time enforcement coming in a follow-up."
          value={latestEvosOnly}
          onToggle={() => setLatestEvosOnly(v => !v)}
        />
      </div>

      {error && <p style={{ fontSize: 13, color: 'var(--color-text-danger)', marginBottom: 12 }}>{error}</p>}
      <button style={btn('primary')} onClick={handleCreate} disabled={!name.trim() || saving}>
        {saving ? 'Creating…' : 'Create season'}
      </button>
    </Screen>
  )
}

function SeasonRow({ season, onSelect }) {
  const dateStr = new Date(season.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <button
      onClick={() => onSelect(season)}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', marginBottom: 10, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>{season.name}</span>
          <StatusBadge status={season.status} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 8 }}>{dateStr}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {season.series_played} / {season.series_count} series
        {(season.players || []).length > 0 && ` · ${season.players.map(p => p.name).join(', ')}`}
      </div>
    </button>
  )
}

export default function SeasonScreen({ playerId, playerName, onBack, onStartSeries }) {
  const [view, setView]           = useState('list')
  const [seasons, setSeasons]     = useState(null)
  const [selected, setSelected]   = useState(null)

  useEffect(() => {
    if (!playerId) return
    getSeasons(playerId).then(setSeasons)
  }, [playerId])

  function handleCreated(season) {
    setSeasons(prev => [season, ...(prev || [])])
    setSelected(season)
    setView('detail')
  }

  function handleSelectSeason(season) {
    setSelected(season)
    setView('detail')
  }

  if (view === 'create') {
    return (
      <CreateSeasonForm
        playerId={playerId}
        playerName={playerName}
        onBack={() => setView('list')}
        onCreate={handleCreated}
      />
    )
  }

  if (view === 'detail' && selected) {
    return (
      <SeasonDetail
        season={selected}
        playerId={playerId}
        onBack={() => { setSelected(null); setView('list') }}
        onStartSeries={onStartSeries}
      />
    )
  }

  // List view
  return (
    <Screen
      title="Seasons"
      onBack={onBack}
      right={
        <button style={{ ...btn('ghost'), padding: '5px 12px', fontSize: 13 }} onClick={() => setView('create')}>
          + New season
        </button>
      }
    >
      {seasons === null && <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Loading…</p>}
      {seasons !== null && seasons.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16 }}>No seasons yet.</p>
          <button style={{ ...btn(), display: 'inline-block', width: 'auto', padding: '10px 20px' }} onClick={() => setView('create')}>
            Create your first season
          </button>
        </div>
      )}
      {(seasons || []).map(s => (
        <SeasonRow key={s.id} season={s} onSelect={handleSelectSeason} />
      ))}
    </Screen>
  )
}
