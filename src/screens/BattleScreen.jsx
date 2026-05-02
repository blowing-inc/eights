import { useState, useEffect, useRef } from 'react'
import DevBanner from '../components/DevBanner.jsx'
import CombatantSheet from '../components/CombatantSheet.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import { btn, inp } from '../styles.js'
import { sget, sset, incrementCombatantStats, subscribeToRoom, trackRoomPresence, getRandomArenaFromPool, getHeritageChain, getArena, createArenaVariant, getPlaylistForDelivery, createPendingAward, appendMvpRecord, createAutoAwards } from '../supabase.js'
import VotingPanel from '../components/VotingPanel.jsx'
import ContextStrip from '../components/ContextStrip.jsx'
import { uid, canUndoLastRound, undoRound, tallyReactions, normalizeRoomSettings } from '../gameLogic.js'
import { computeGameAutoAwards } from '../awards.js'

// Inline form for evolving the current arena after a round resolves.
// Pre-fills house rules from the parent arena; name and description start blank.
function ArenaEvolveForm({ currentArena, onSubmit, onCancel, error, submitting }) {
  const [name,       setName]       = useState('')
  const [description, setDescription] = useState('')
  const [houseRules,  setHouseRules]  = useState(currentArena.houseRules || '')

  return (
    <div style={{ padding: '12px 16px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', marginBottom: 8 }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
        How did <strong>{currentArena.name}</strong> change?
      </p>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>New name (required)</div>
      <input
        style={{ ...inp(), margin: '0 0 4px', fontSize: 14, borderColor: error ? 'var(--color-border-danger)' : undefined }}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="What is this arena called now?"
        autoFocus
      />
      {error && <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 8px', lineHeight: 1.4 }}>{error}</p>}

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Description (required)</div>
      <textarea
        style={{ ...inp(), margin: '0 0 8px', resize: 'none', height: 72, fontSize: 13, width: '100%' }}
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="What's different about this version?"
      />

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>House rules <span style={{ fontStyle: 'italic' }}>(optional)</span></div>
      <textarea
        style={{ ...inp(), margin: '0 0 10px', resize: 'none', height: 48, fontSize: 13, width: '100%' }}
        value={houseRules}
        onChange={e => setHouseRules(e.target.value)}
        placeholder="Any rule changes for this form?"
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSubmit(name.trim(), description.trim(), houseRules.trim() || null)}
          disabled={!name.trim() || !description.trim() || submitting}
          style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '9px' }}
        >
          {submitting ? 'Saving…' : 'Save evolution 🏟️'}
        </button>
        <button onClick={onCancel} style={{ ...btn('ghost'), fontSize: 13, padding: '9px 14px' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function getMvpNominees(room, pool) {
  if (pool === 'full') {
    const seen = new Set()
    return Object.values(room.combatants).flat()
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
      .map(c => ({ id: c.id, name: c.name, type: 'combatant' }))
  }
  const seen = new Set()
  const winners = []
  for (const rd of room.rounds) {
    if (rd.winner && !seen.has(rd.winner.id)) {
      seen.add(rd.winner.id)
      winners.push({ id: rd.winner.id, name: rd.winner.name, type: 'combatant' })
    }
  }
  return winners
}

export default function BattleScreen({ room: init, playerId, setRoom, onVote, onChronicles, onHome, onNextGame, onRejoinNextGame }) {
  const [room, setLocal] = useState(init)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [sheetCombatant, setSheetCombatant] = useState(null) // { id, inRoom }
  const [undoNotice, setUndoNotice] = useState(null) // "Host undid Round X"
  const [hostOnline, setHostOnline] = useState(null) // null = not yet synced; false = host absent
  const [presentIds, setPresentIds] = useState([])
  // Arena evolution flow: null | { stage: 'form' }
  const [arenaEvolveFlow, setArenaEvolveFlow] = useState(null)
  const [arenaEvolveError, setArenaEvolveError] = useState(null)
  const [arenaEvolving, setArenaEvolving] = useState(false)
  // MVP vote: 'winners' | 'full' — pool selection before vote starts
  const [mvpPoolMode, setMvpPoolMode] = useState('winners')
  const [mvpStarting, setMvpStarting] = useState(false)
  const prevRoundRef = useRef(init.currentRound)
  const undoTimerRef = useRef(null)

  useEffect(() => {
    return subscribeToRoom(room.id, async r => {
      if (r.nextRoomId) {
        const nextRoom = await sget('room:' + r.nextRoomId)
        if (nextRoom) { setRoom(nextRoom); onRejoinNextGame(nextRoom); return }
      }
      // Detect undo for non-hosts: currentRound decreased
      if (r.host !== playerId && r.currentRound < prevRoundRef.current) {
        const undoneRound = prevRoundRef.current
        setUndoNotice(`Host undid Round ${undoneRound}`)
        clearTimeout(undoTimerRef.current)
        undoTimerRef.current = setTimeout(() => setUndoNotice(null), 4000)
      }
      prevRoundRef.current = r.currentRound
      setLocal(r); setRoom(r)
      if (r.phase === 'voting') onVote()
    })
  }, [room.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return trackRoomPresence(room.id, playerId, isHost ? 'host' : 'player', {
      onHostStatusChange: setHostOnline,
      onPresenceChange:   setPresentIds,
    })
  }, [room.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isHost = room.host === playerId
  const round = room.rounds[room.currentRound - 1]
  const totalRounds = Math.min(...room.players.map(p => (room.combatants[p.id] || []).length))
  const canUndo = canUndoLastRound(isHost, room.currentRound, round)

  async function startRound() {
    const roundNum = room.currentRound + 1
    const matchup = room.players.map(p => (room.combatants[p.id] || [])[roundNum - 1]).filter(Boolean)

    // Attach arena snapshot: evolved override takes precedence over delivery mode config
    const { arenaMode, arenaConfig } = normalizeRoomSettings(room.settings)
    let arena = null
    if (room.arenaEvolutionOverride) {
      arena = room.arenaEvolutionOverride.snapshot
    } else if (arenaMode === 'single') {
      arena = arenaConfig?.arenaSnapshot || null
    } else if (arenaMode === 'random-pool') {
      // Collect arena IDs already used in this game
      let excludeIds = (room.rounds || []).map(r => r.arena?.id).filter(Boolean)
      // If series exclusion is on, also collect from prior games in the series
      if (arenaConfig?.excludeSeries && room.seriesId && room.prevRoomId) {
        const chain = await getHeritageChain(room.prevRoomId)
        const seriesIds = chain.flatMap(r => (r.rounds || []).map(rd => rd.arena?.id)).filter(Boolean)
        excludeIds = [...new Set([...excludeIds, ...seriesIds])]
      }
      arena = await getRandomArenaFromPool(arenaConfig?.pool || 'standard', excludeIds)
    } else if (arenaMode === 'playlist' && arenaConfig?.playlistId) {
      const playlistArenas = await getPlaylistForDelivery(arenaConfig.playlistId)
      if (playlistArenas.length) {
        arena = playlistArenas[(roundNum - 1) % playlistArenas.length]
      }
    }

    const newRound = { id: uid(), number: roundNum, combatants: matchup, picks: {}, winner: null, createdAt: Date.now(), arena }
    const updated = { ...room, phase: 'voting', currentRound: roundNum, rounds: [...room.rounds, newRound] }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onVote()
  }

  async function endGameEarly() {
    const r = await sget('room:' + room.id)
    if (!r) return
    const updated = { ...r, phase: 'ended', endedEarly: true }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setConfirmEnd(false)
    onHome()
  }

  async function completeGame() {
    const r = await sget('room:' + room.id)
    if (!r) return
    const updated = { ...r, phase: 'ended' }
    await sset('room:' + r.id, updated)
    const autoAwards = computeGameAutoAwards(updated)
    if (autoAwards.length > 0) createAutoAwards(autoAwards).catch(e => console.error('createAutoAwards game', e))
    setLocal(updated); setRoom(updated)
    onHome()
  }

  async function startMvpVote() {
    setMvpStarting(true)
    const r = await sget('room:' + room.id)
    if (!r || r.mvpVote) { setMvpStarting(false); return }
    const awardId = uid()
    const now = new Date().toISOString()
    await createPendingAward({
      id:             awardId,
      type:           'mvp',
      layer:          'game',
      scope_id:       r.id,
      scope_type:     'game',
      recipient_type: 'combatant',
      ballot_state:   { phase: 'nomination', lockedVoterIds: [], runoffPool: null },
      created_at:     now,
      updated_at:     now,
    })
    const updated = { ...r, mvpVote: { awardId, pool: mvpPoolMode } }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
    setMvpStarting(false)
  }

  async function handleMvpResolved({ outcome, winners, votesByNomineeId }) {
    if (outcome === 'no_votes' || !winners.length) return
    const totalVotes = Object.values(votesByNomineeId || {}).reduce((s, n) => s + n, 0)
    const coMvp = outcome === 'co_award'
    for (const winner of winners) {
      const winnerVotes = votesByNomineeId?.[winner.id] || 0
      const voteShare = totalVotes > 0 ? Math.round(winnerVotes / totalVotes * 100) : 0
      await appendMvpRecord(winner.id, { gameCode: room.code, voteShare, coMvp })
    }
  }

  async function undoLastRound() {
    const r = await sget('room:' + room.id)
    if (!r || r.currentRound === 0) return
    const last = r.rounds[r.currentRound - 1]
    if (!last?.winner && !last?.draw) return

    // Reverse in-room stats using pure function
    const combatants = undoRound(r, last)
    const remainingRounds = r.rounds.slice(0, r.currentRound - 1)
    const updated = { ...r, rounds: remainingRounds, combatants, currentRound: r.currentRound - 1, phase: 'battle' }

    // Restore arena evolution override: if the undone round carried an evolution,
    // scan remaining rounds for the most recent prior evolution and restore that,
    // or clear the override entirely if none exists.
    if (last.arenaEvolution) {
      const prevEvolved = [...remainingRounds].reverse().find(rd => rd.arenaEvolution)
      if (prevEvolved) {
        updated.arenaEvolutionOverride = { id: prevEvolved.arenaEvolution.variantId, snapshot: prevEvolved.arenaEvolution.snapshot }
      } else {
        delete updated.arenaEvolutionOverride
      }
    }

    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setConfirmUndo(false)

    // Fire-and-forget: reverse global combatant stats including reactions
    ;(async () => {
      for (const c of last.combatants) {
        const { heart, angry, cry } = tallyReactions(last.playerReactions, c.id)
        if (last.draw) {
          await incrementCombatantStats(c.id, { draws: -1, heart: -heart, angry: -angry, cry: -cry })
        } else {
          const wasWin = last.winner?.id === c.id
          await incrementCombatantStats(c.id, { wins: wasWin ? -1 : 0, losses: wasWin ? 0 : -1, heart: -heart, angry: -angry, cry: -cry })
        }
      }
    })()
  }

  const { arenaEvolutionEnabled } = normalizeRoomSettings(room.settings)

  async function handleArenaEvolution(newName, newDescription, newHouseRules) {
    setArenaEvolving(true)
    setArenaEvolveError(null)
    const r = await sget('room:' + room.id)
    if (!r) { setArenaEvolving(false); return }

    const rdIdx = r.currentRound - 1
    const rd = r.rounds[rdIdx]
    if (!rd?.arena) { setArenaEvolving(false); return }

    // Fetch parent from DB for accurate lineage (snapshot doesn't carry root_id/generation)
    const parentRow = await getArena(rd.arena.id)

    const newId = uid()
    const hostPlayer = r.players.find(p => p.id === r.host)
    const rootId     = parentRow?.root_id || rd.arena.id
    const generation = (parentRow?.generation || 0) + 1
    const bornFrom   = { gameCode: r.code, roundNumber: rd.number, seriesId: r.seriesId || null }

    await createArenaVariant({
      id: newId,
      name: newName,
      bio: newDescription,
      rules: newHouseRules || '',
      tags: parentRow?.tags || rd.arena.tags || [],
      ownerId: r.host,
      ownerName: hostPlayer?.name || '',
      rootId, parentId: rd.arena.id, generation, bornFrom,
    })

    const evolvedSnapshot = {
      id:          newId,
      name:        newName,
      description: newDescription,
      houseRules:  newHouseRules || null,
      tags:        parentRow?.tags || rd.arena.tags || [],
    }

    // Record evolution on the round (includes snapshot so undo can restore it)
    const updatedRound = {
      ...rd,
      arenaEvolution: { variantId: newId, variantName: newName, snapshot: evolvedSnapshot },
    }
    const rounds = [...r.rounds]; rounds[rdIdx] = updatedRound

    // Override applies to all subsequent rounds regardless of delivery mode
    const updated = { ...r, rounds, arenaEvolutionOverride: { id: newId, snapshot: evolvedSnapshot } }

    // If game is ending and variants need publishing, mark for publish-on-complete.
    // Arena publish-on-game-completion handles stashed arenas used in the final round
    // via publishArenas() in VoteScreen — the variant will be picked up there since
    // it's now a DB record with an id.

    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
    setArenaEvolveFlow(null)
    setArenaEvolving(false)
  }

  return (<>
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <ConnectionStatus players={room.players} presentIds={presentIds} isHost={isHost} roomCode={room.code} />
      <ContextStrip room={room} currentArena={null} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Battle arena</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onChronicles} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>The Chronicles</button>
          <button onClick={onHome} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Home</button>
        </div>
      </div>

      {room.currentRound === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>All combatants are ready. Let the battles begin!</p>
          {isHost ? <button style={btn('primary')} onClick={startRound}>Begin Round 1 ⚔️</button>
                  : <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Waiting for host to begin…</p>}
        </div>
      )}

      {room.currentRound > 0 && <>
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>Rounds</h3>
          {room.rounds.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8, border: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 52 }}>Round {r.number}</span>
              {r.draw ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', flex: 1, alignItems: 'center' }}>
                  {r.combatants.map((c, i) => (
                    <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      {i > 0 && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 4px' }}>vs</span>}
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{c.name}</span>
                      <button onClick={() => setSheetCombatant({ id: c.id, inRoom: c })}
                        title={c.name}
                        style={{ background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer', padding: '2px 4px', color: 'var(--color-text-tertiary)', lineHeight: 1 }}>📊</button>
                    </span>
                  ))}
                  {r.arena && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>@ {r.arena.name}</span>}
                </div>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>
                  {r.combatants.map(c => c.name).join(' vs ')}
                  {r.arena && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>@ {r.arena.name}</span>}
                </span>
              )}
              {r.winner
                ? <>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-success)', flexShrink: 0 }}>🏆 {r.winner.name}</span>
                    {r.evolution && <span style={{ fontSize: 11, color: 'var(--color-text-info)', flexShrink: 0 }}>⚡ → {r.evolution.toName}</span>}
                  </>
                : r.draw
                  ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', flexShrink: 0 }}>🤝 Draw</span>
                  : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>deliberating…</span>}
              {r.arenaEvolution && <span style={{ fontSize: 11, color: 'var(--color-text-info)', flexShrink: 0 }}>🏟️ → {r.arenaEvolution.variantName}</span>}
              {!r.draw && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {r.combatants.map(c => (
                    <button key={c.id} onClick={() => setSheetCombatant({ id: c.id, inRoom: c })}
                      title={c.name}
                      style={{ background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer', padding: '2px 4px', color: 'var(--color-text-tertiary)', lineHeight: 1 }}>📊</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {canUndo && !confirmUndo && (
          <button onClick={() => setConfirmUndo(true)} style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginBottom: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
            ↩ Undo last round
          </button>
        )}
        {confirmUndo && (
          <div style={{ padding: '12px 14px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 10px' }}>
              Undo Round {room.currentRound}? This will reverse {round?.draw ? 'the draw' : `${round?.winner?.name}'s win`} and remove that round from the record.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={undoLastRound} style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 13, padding: '8px' }}>Yes, undo it</button>
              <button onClick={() => setConfirmUndo(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '8px' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Arena evolution affordance (non-final rounds) ─────────────────── */}
        {isHost && arenaEvolutionEnabled && round?.arena && (round?.winner || round?.draw) &&
          !round.arenaEvolution && room.currentRound < totalRounds && (
          <>
            {!arenaEvolveFlow && (
              <button
                onClick={() => { setArenaEvolveFlow({ stage: 'form' }); setArenaEvolveError(null) }}
                style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginBottom: 8, color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-tertiary)' }}
              >
                🏟️ Evolve arena
              </button>
            )}
            {arenaEvolveFlow?.stage === 'form' && (
              <ArenaEvolveForm
                currentArena={round.arena}
                onSubmit={handleArenaEvolution}
                onCancel={() => { setArenaEvolveFlow(null); setArenaEvolveError(null) }}
                error={arenaEvolveError}
                submitting={arenaEvolving}
              />
            )}
          </>
        )}

        {isHost && room.currentRound < totalRounds && (round?.winner || round?.draw) && !arenaEvolveFlow && (
          <button style={btn('primary')} onClick={startRound}>Round {room.currentRound + 1} ⚔️</button>
        )}

        {isHost && !confirmEnd && room.currentRound < totalRounds && (
          <button onClick={() => setConfirmEnd(true)} style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginTop: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
            End game early
          </button>
        )}
        {confirmEnd && (
          <div style={{ padding: '12px 14px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)', marginTop: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 4px', fontWeight: 500 }}>End the game early?</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 10px' }}>
              The game will end as no-contest. Unpublished combatants stay unpublished. This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={endGameEarly} style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 13, padding: '8px' }}>Yes, end it</button>
              <button onClick={() => setConfirmEnd(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '8px' }}>Cancel</button>
            </div>
          </div>
        )}
        {!isHost && room.phase === 'voting' && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>Deliberating — waiting for host to confirm…</p>
        )}
        {undoNotice && (
          <div style={{ marginTop: 8, padding: '8px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', fontSize: 13, color: 'var(--color-text-warning)' }}>
            ↩ {undoNotice}
          </div>
        )}
        {!isHost && hostOnline === false && (
          <div style={{ marginTop: 8, padding: '8px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            Host is out of the room
          </div>
        )}
        {!isHost && room.phase === 'battle' && room.currentRound < totalRounds && (round?.winner || round?.draw) && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13, margin: 0 }}>Waiting for host to start Round {room.currentRound + 1}…</p>
            <button onClick={onHome} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13, flexShrink: 0 }}>← Home</button>
          </div>
        )}
        {room.currentRound >= totalRounds && (round?.winner || round?.draw) && (
          <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <h3 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>Game complete!</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: 0 }}>All {totalRounds} rounds fought.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>

              {/* ── MVP voting panel (all players once vote is open) ─────── */}
              {room.mvpVote && (() => {
                const { awardId, pool } = room.mvpVote
                const nominees = getMvpNominees(room, pool)
                const voters   = room.players.filter(p => !p.isBot).map(p => ({ id: p.id, name: p.name }))
                return (
                  <VotingPanel
                    key={awardId}
                    awardId={awardId}
                    label="MVP"
                    nominees={nominees}
                    voters={voters}
                    playerId={playerId}
                    isHost={isHost}
                    onResolved={handleMvpResolved}
                  />
                )
              })()}

              {isHost && (
                <>
                  {/* Arena evolution on the final round — records the variant but no future rounds benefit */}
                  {arenaEvolutionEnabled && round?.arena && !round.arenaEvolution && (
                    <>
                      {!arenaEvolveFlow && (
                        <button
                          onClick={() => { setArenaEvolveFlow({ stage: 'form' }); setArenaEvolveError(null) }}
                          style={{ ...btn('ghost'), width: '100%', fontSize: 13, color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-tertiary)' }}
                        >
                          🏟️ Evolve arena
                        </button>
                      )}
                      {arenaEvolveFlow?.stage === 'form' && (
                        <ArenaEvolveForm
                          currentArena={round.arena}
                          onSubmit={handleArenaEvolution}
                          onCancel={() => { setArenaEvolveFlow(null); setArenaEvolveError(null) }}
                          error={arenaEvolveError}
                          submitting={arenaEvolving}
                        />
                      )}
                    </>
                  )}
                  {!arenaEvolveFlow && !room.mvpVote && (
                    /* MVP vote setup — optional; host picks pool then starts */
                    <div style={{ textAlign: 'left', padding: '12px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>MVP vote (optional)</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {[['winners', 'Round winners'], ['full', 'Full roster']].map(([val, lbl]) => (
                          <button
                            key={val}
                            onClick={() => setMvpPoolMode(val)}
                            style={{ ...btn(mvpPoolMode === val ? 'primary' : 'ghost'), flex: 1, fontSize: 12, padding: '6px' }}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={startMvpVote}
                        disabled={mvpStarting}
                        style={{ ...btn('ghost'), width: '100%', fontSize: 13 }}
                      >
                        {mvpStarting ? 'Opening vote…' : 'Start MVP vote'}
                      </button>
                    </div>
                  )}
                  {!arenaEvolveFlow && (
                    <>
                      <button style={btn('primary')} onClick={completeGame}>Complete game ✓</button>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={btn()} onClick={onChronicles}>The Chronicles</button>
                        <button style={btn()} onClick={() => onNextGame(room)}>Next Game ⚔️</button>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                        This room stays open until you complete or start the next game.
                      </p>
                    </>
                  )}
                </>
              )}
              {!isHost && !room.mvpVote && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Waiting for host to start next game…</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn()} onClick={onChronicles}>The Chronicles</button>
                    <button style={btn()} onClick={onHome}>Back to home</button>
                  </div>
                </>
              )}
              {!isHost && room.mvpVote && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button style={{ ...btn('ghost'), flex: 1 }} onClick={onChronicles}>The Chronicles</button>
                  <button style={{ ...btn('ghost'), flex: 1 }} onClick={onHome}>Back to home</button>
                </div>
              )}
            </div>
          </div>
        )}
      </>}
    </div>
    {sheetCombatant && (
      <CombatantSheet
        combatantId={sheetCombatant.id}
        combatant={sheetCombatant.inRoom}
        playerId={playerId}
        onClose={() => setSheetCombatant(null)}
      />
    )}
    </>
  )
}
