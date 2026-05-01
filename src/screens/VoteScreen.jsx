import { useState, useEffect } from 'react'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import Pill from '../components/Pill.jsx'
import DevBanner from '../components/DevBanner.jsx'
import RoundChat from '../components/RoundChat.jsx'
import EvolutionForm from '../components/EvolutionForm.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import { btn, inp } from '../styles.js'
import { sget, sset, incrementCombatantStats, publishCombatants, publishArenas, publishPlaylist, subscribeToRoom, createVariantCombatant, checkCombatantNameExists, getCombatant, trackRoomPresence, getArenaReaction, upsertArenaReaction, deleteArenaReaction, getGroupsForCombatants, getCombatantGroupIds, setCombatantGroups } from '../supabase.js'
import SpectatorList from '../components/SpectatorList.jsx'
import ContextStrip from '../components/ContextStrip.jsx'
import CombatantSheet from '../components/CombatantSheet.jsx'
import { uid, canEditCombatant, simulateGameToEnd, applyWinner, applyDraw, applyMerge, toggleReaction, tallyReactions, isFinalRound, normalizeRoomSettings, buildEvolutionRound, getEphemeralBadges, getCombatantsToPublish, resolveAllAdvanceSelection } from '../gameLogic.js'

// Form for naming a merged combatant. Used both by the host (inline) and
// by the primary owner when the host delegates. Parent bios are shown as
// collapsible reference cards, collapsed by default.
function MergeForm({ parents, primaryOwnerName, hostIsOwner, error, submitting, onSubmit, onDelegate, onBack, onCancel, cancelLabel = 'Cancel' }) {
  const [name,      setName]      = useState('')
  const [bio,       setBio]       = useState('')
  const [mergeNote, setMergeNote] = useState('')
  const [expanded,  setExpanded]  = useState({})

  return (
    <div style={{ padding: '12px 16px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
        Name the merged combatant
      </p>

      {/* Parent bio reference cards — collapsed by default */}
      {parents.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {parents.map(c => (
            <div key={c.id} style={{ marginBottom: 6, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                style={{ width: '100%', background: 'var(--color-background-tertiary)', border: 'none', padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}
              >
                <span>{c.name}</span>
                <span>{expanded[c.id] ? '▲' : '▼'}</span>
              </button>
              {expanded[c.id] && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)' }}>
                  {c.bio || <em style={{ color: 'var(--color-text-tertiary)' }}>No bio</em>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Name (required)</div>
      <input
        style={{ ...inp(), margin: '0 0 4px', fontSize: 14, borderColor: error ? 'var(--color-border-danger)' : undefined }}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="What are they called now?"
        autoFocus
      />
      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 8px', lineHeight: 1.4 }}>{error}</p>
      )}

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Bio</div>
      <textarea
        style={{ ...inp(), margin: '0 0 8px', resize: 'none', height: 64, fontSize: 13, width: '100%' }}
        value={bio}
        onChange={e => setBio(e.target.value)}
        placeholder="What did the combination produce?"
      />

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Table note <span style={{ fontStyle: 'italic' }}>(optional)</span></div>
      <textarea
        style={{ ...inp(), margin: '0 0 10px', resize: 'none', height: 48, fontSize: 13, width: '100%' }}
        value={mergeNote}
        onChange={e => setMergeNote(e.target.value)}
        placeholder="What was the table's reaction?"
      />

      {!hostIsOwner && onDelegate && (
        <button
          onClick={onDelegate}
          style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginBottom: 8 }}
        >
          Let {primaryOwnerName || 'the owner'} write it
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: onBack ? 6 : 0 }}>
        <button
          onClick={() => onSubmit(name.trim(), bio.trim(), mergeNote.trim() || null)}
          disabled={!name.trim() || submitting}
          style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '9px' }}
        >
          {submitting ? 'Checking…' : 'Confirm merge ⚡'}
        </button>
        <button onClick={onCancel} style={{ ...btn('ghost'), fontSize: 13, padding: '9px 14px' }}>
          {cancelLabel}
        </button>
      </div>
      {onBack && (
        <button
          onClick={onBack}
          style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}
        >
          ← Back
        </button>
      )}
    </div>
  )
}

export default function VoteScreen({ room: init, playerId, setRoom, onResult, onViewPlayer, onHome, isGuest, onLogin }) {
  const [room, setLocal] = useState(init)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editBio,  setEditBio]  = useState('')
  const [saving, setSaving] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [sheetCombatant, setSheetCombatant] = useState(null)

  // Evolution flow state machine.
  // null                              — no evolution in progress
  // { stage: 'pending', combatantId } — host clicked Evolve, choosing who writes
  // { stage: 'writing', combatantId } — host is filling the form themselves
  const [evolveFlow,       setEvolveFlow]       = useState(null)
  const [evolveError,      setEvolveError]      = useState(null)   // novel-name validation message
  const [evolveSubmitting, setEvolveSubmitting] = useState(false)  // true while name-check is in flight
  const [confirmLeave,     setConfirmLeave]     = useState(false)  // host leaving mid-round
  const [hostOnline,       setHostOnline]       = useState(null)   // null = not yet synced; false = host absent
  const [presentIds,       setPresentIds]       = useState([])
  const [voteNudgeDone,    setVoteNudgeDone]    = useState(false)  // one-time guest nudge after first pick
  const [arenaReaction,    setArenaReaction]    = useState(null)   // 'like' | 'dislike' | null
  const [arenaReacting,    setArenaReacting]    = useState(false)
  const [combatantGroups,  setCombatantGroupsState] = useState({})  // { [combatantId]: [{ id, name }] }

  // Draw / merge flow state machine.
  // null                                                           — no flow in progress
  // { step: 1, selectedIds }                                       — who is drawing?
  // { step: 2, selectedIds }                                       — what happens?
  // { step: 3, selectedIds }                                       — merge or not? (all_advance only)
  // { step: 4, selectedIds, primaryOwnerId }                       — who controls the merge?
  // { step: 5, selectedIds, primaryOwnerId }                       — merge form (host writing)
  const [drawFlow,       setDrawFlow]       = useState(null)
  const [mergeError,     setMergeError]     = useState(null)
  const [mergeSubmitting, setMergeSubmitting] = useState(false)

  const round   = room.rounds[room.currentRound - 1]
  const isHost  = room.host === playerId
  const { allowEvolutions, allowDraws, allowMerges } = normalizeRoomSettings(room.settings)

  useEffect(() => {
    return subscribeToRoom(room.id, async r => {
      const rd = r.rounds[r.currentRound - 1]
      if (rd?.winner || rd?.draw) {
        const updated = { ...r, phase: 'battle' }
        await sset('room:' + r.id, updated)
        setRoom(updated); onResult(); return
      }
      setLocal(r); setRoom(r)
    })
  }, [room.id, room.currentRound]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return trackRoomPresence(room.id, playerId, isHost ? 'host' : 'player', {
      onHostStatusChange: setHostOnline,
      onPresenceChange:   setPresentIds,
    })
  }, [room.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const arenaId = round?.arena?.id

  useEffect(() => {
    if (!arenaId || !playerId) { setArenaReaction(null); return }
    getArenaReaction(arenaId, playerId).then(setArenaReaction)
  }, [arenaId, playerId])

  useEffect(() => {
    if (!round?.combatants?.length) return
    const ids = round.combatants.map(c => c.id)
    getGroupsForCombatants(ids).then(setCombatantGroupsState)
  }, [round?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleArenaReaction(value) {
    if (!arenaId || !playerId || arenaReacting) return
    setArenaReacting(true)
    if (arenaReaction === value) {
      await deleteArenaReaction(arenaId, playerId)
      setArenaReaction(null)
    } else {
      await upsertArenaReaction(arenaId, playerId, value)
      setArenaReaction(value)
    }
    setArenaReacting(false)
  }

  // ── Voting ────────────────────────────────────────────────────────────────

  async function castReaction(combatantId, emoji) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    rd.playerReactions = toggleReaction(rd.playerReactions, playerId, combatantId, emoji)
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  async function castPick(combatantId) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    rd.picks = { ...(rd.picks || {}), [playerId]: combatantId }
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  // ── Win confirmation (no evolution) ──────────────────────────────────────

  async function confirmWinner(combatantId) {
    const r = await sget('room:' + room.id)
    if (!r) return

    const rdIdx  = r.currentRound - 1
    const rd     = r.rounds[rdIdx]
    const winner = rd.combatants.find(c => c.id === combatantId)
    if (!winner) return

    const updatedRound = { ...rd, winner, resolvedAt: Date.now(), picks: { ...(rd.picks || {}), [playerId]: combatantId } }
    // Clear any pending evolution state that may have been set
    delete updatedRound.evolutionPending
    const rounds = [...r.rounds]; rounds[rdIdx] = updatedRound

    const combatants = applyWinner(r, updatedRound, combatantId)
    const updated = { ...r, rounds, combatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setRoom(updated); onResult()

    ;(async () => {
      for (const c of updatedRound.combatants) {
        const isWin = winner.id === c.id
        const { heart, angry, cry } = tallyReactions(updatedRound.playerReactions, c.id)
        await incrementCombatantStats(c.id, { wins: isWin ? 1 : 0, losses: isWin ? 0 : 1, heart, angry, cry })
      }
      if (isFinalRound(r)) {
        const { rosterSize, arenaMode, arenaConfig } = normalizeRoomSettings(r.settings)
        await publishCombatants(getCombatantsToPublish(combatants, rounds, rosterSize))
        // Publish every arena snapshotted into a round (handles single, random-pool, playlist modes)
        const arenaIds = [...new Set(rounds.filter(rd => rd.arena?.id).map(rd => rd.arena.id))]
        if (arenaIds.length) await publishArenas(arenaIds)
        if (arenaMode === 'playlist' && arenaConfig?.playlistId) await publishPlaylist(arenaConfig.playlistId)
      }
    })()
  }

  // ── Evolution flow ────────────────────────────────────────────────────────

  // Push evolution authorship to the combatant's owner.
  // Writes evolutionPending to the round so the owner's subscription fires.
  async function pushEvolutionToOwner(winnerId, ownerId) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rdIdx = r.currentRound - 1
    const rounds = [...r.rounds]
    rounds[rdIdx] = { ...r.rounds[rdIdx], evolutionPending: { winnerId, requestedFrom: ownerId } }
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
    setEvolveFlow(null)
  }

  // Resolves the round as a draw with the given combatant subset and outcome.
  // combatantIds — which combatants drew (all combatant ids for a full draw).
  // drawOutcome  — 'no_advance' (draws stat) or 'all_advance' (wins stat).
  async function confirmDraw(combatantIds, drawOutcome) {
    setDrawFlow(null)
    const r = await sget('room:' + room.id)
    if (!r) return
    const rdIdx = r.currentRound - 1
    const rd = r.rounds[rdIdx]
    const updatedRound = { ...rd, draw: { combatantIds }, winner: null, resolvedAt: Date.now() }
    if (drawOutcome === 'all_advance') updatedRound.drawOutcome = drawOutcome
    delete updatedRound.evolutionPending
    const rounds = [...r.rounds]; rounds[rdIdx] = updatedRound
    const combatants = applyDraw(r, updatedRound)
    const updated = { ...r, rounds, combatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setRoom(updated); onResult()

    ;(async () => {
      for (const c of rd.combatants) {
        const { heart, angry, cry } = tallyReactions(updatedRound.playerReactions, c.id)
        const drew = combatantIds.includes(c.id)
        const stat = drew
          ? (drawOutcome === 'all_advance' ? { wins: 1 } : { draws: 1 })
          : { losses: 1 }
        await incrementCombatantStats(c.id, { ...stat, heart, angry, cry })
      }
      if (isFinalRound(r)) {
        const { rosterSize, arenaMode, arenaConfig } = normalizeRoomSettings(r.settings)
        await publishCombatants(getCombatantsToPublish(combatants, rounds, rosterSize))
        // Publish every arena snapshotted into a round (handles single, random-pool, playlist modes)
        const arenaIds = [...new Set(rounds.filter(rd => rd.arena?.id).map(rd => rd.arena.id))]
        if (arenaIds.length) await publishArenas(arenaIds)
        if (arenaMode === 'playlist' && arenaConfig?.playlistId) await publishPlaylist(arenaConfig.playlistId)
      }
    })()
  }

  // Opens the draw flow for 3+ combatant rounds, or resolves immediately for 2.
  function startDrawFlow() {
    if (round.combatants.length < 3) {
      confirmDraw(round.combatants.map(c => c.id), 'no_advance')
    } else {
      setDrawFlow({ step: 1, selectedIds: round.combatants.map(c => c.id) })
    }
  }

  // ── Merge flow ────────────────────────────────────────────────────────────

  // Returns the primaryOwnerId default for a given set of drawing combatant ids:
  // owner of the combatant with the most wins, first in draw order if tied.
  function defaultPrimaryOwner(selectedIds) {
    const drawers = round.combatants.filter(c => selectedIds.includes(c.id))
    const inRoom  = (ownerId) => {
      const list = room.combatants[ownerId] || []
      return list.find(c => selectedIds.includes(c.id))
    }
    const sorted = [...drawers].sort((a, b) => {
      const wA = (inRoom(a.ownerId)?.wins || 0)
      const wB = (inRoom(b.ownerId)?.wins || 0)
      return wB - wA
    })
    return sorted[0]?.ownerId || drawers[0]?.ownerId
  }

  // Pushes merge naming to the primary owner by writing mergePending to the round.
  async function pushMergeToOwner(fromIds, primaryOwnerId) {
    setDrawFlow(null)
    const r = await sget('room:' + room.id)
    if (!r) return
    const rdIdx = r.currentRound - 1
    const rounds = [...r.rounds]
    rounds[rdIdx] = { ...r.rounds[rdIdx], mergePending: { fromIds, primaryOwnerId, requestedFrom: primaryOwnerId } }
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  // Clears mergePending and falls back to a plain all_advance draw (no merged combatant).
  async function skipMerge(fromIds) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rdIdx = r.currentRound - 1
    const rd = { ...r.rounds[rdIdx] }
    delete rd.mergePending
    const rounds = [...r.rounds]; rounds[rdIdx] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
    await confirmDraw(fromIds, 'all_advance')
  }

  // Creates the global merged combatant and resolves the round with round.merge.
  async function handleMerge(fromIds, primaryOwnerId, newName, newBio, mergeNote, authorId) {
    setMergeSubmitting(true)
    setMergeError(null)
    const nameTaken = await checkCombatantNameExists(newName)
    if (nameTaken) {
      setMergeError(`"${newName}" already exists — the merged combatant must have a new name.`)
      setMergeSubmitting(false)
      return
    }
    setMergeSubmitting(false)

    const r = await sget('room:' + room.id)
    if (!r) return
    const rdIdx = r.currentRound - 1
    const rd    = r.rounds[rdIdx]

    const parents = fromIds.map(id => rd.combatants.find(c => c.id === id)).filter(Boolean)
    const primaryParent = parents.find(c => c.ownerId === primaryOwnerId) || parents[0]
    const coParents     = parents.filter(c => c.id !== primaryParent.id)

    // Fetch all parent global records to compute accurate lineage (generation, rootId).
    const globalParents = await Promise.all(parents.map(c => getCombatant(c.id)))
    const globalPrimary = globalParents.find(g => g?.id === primaryParent.id)
    const maxGen        = Math.max(...globalParents.map(g => g?.lineage?.generation || 0))
    const lineage = {
      rootId:      globalPrimary?.lineage?.rootId || primaryParent.id,
      parentId:    primaryParent.id,
      coParentIds: coParents.map(c => c.id),
      generation:  maxGen + 1,
      bornFrom: {
        type:         'merge',
        parentNames:  parents.map(c => c.name),
        parentIds:    fromIds,
        roundNumber:  rd.number,
        gameCode:     r.code,
        parentName:   primaryParent.name,
        opponentName: null,
      },
    }

    const newId = uid()
    await createVariantCombatant({
      id: newId, name: newName, bio: newBio || '',
      ownerId: primaryParent.ownerId, ownerName: primaryParent.ownerName, lineage,
    })

    // Inherit the union of all parents' group memberships.
    const allGroupIds = (await Promise.all(parents.map(c => getCombatantGroupIds(c.id)))).flat()
    const uniqueGroupIds = [...new Set(allGroupIds)]
    if (uniqueGroupIds.length) await setCombatantGroups(newId, uniqueGroupIds, primaryParent.ownerId)

    const merge = {
      fromIds,
      fromNames:        parents.map(c => c.name),
      toId:             newId,
      toName:           newName,
      toBio:            newBio || '',
      primaryOwnerId:   primaryParent.ownerId,
      primaryOwnerName: primaryParent.ownerName,
      coOwnerIds:       coParents.map(c => c.ownerId),
      coOwnerNames:     coParents.map(c => c.ownerName),
      authorId,
      mergeNote:        mergeNote || null,
    }

    const updatedRound = {
      ...rd,
      draw:        { combatantIds: fromIds },
      drawOutcome: 'all_advance',
      merge,
      winner:      null,
      resolvedAt:  Date.now(),
    }
    delete updatedRound.evolutionPending
    delete updatedRound.mergePending

    const rounds     = [...r.rounds]; rounds[rdIdx] = updatedRound
    const combatants = applyMerge(r, updatedRound)
    const updated    = { ...r, rounds, combatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setDrawFlow(null)
    setRoom(updated); onResult()

    ;(async () => {
      for (const c of parents) {
        const { heart, angry, cry } = tallyReactions(updatedRound.playerReactions, c.id)
        await incrementCombatantStats(c.id, { wins: 1, heart, angry, cry })
      }
      if (isFinalRound(r)) {
        const { rosterSize, arenaMode, arenaConfig } = normalizeRoomSettings(r.settings)
        await publishCombatants(getCombatantsToPublish(combatants, rounds, rosterSize))
        // Publish every arena snapshotted into a round (handles single, random-pool, playlist modes)
        const arenaIds = [...new Set(rounds.filter(rd => rd.arena?.id).map(rd => rd.arena.id))]
        if (arenaIds.length) await publishArenas(arenaIds)
        if (arenaMode === 'playlist' && arenaConfig?.playlistId) await publishPlaylist(arenaConfig.playlistId)
      }
    })()
  }

  // Host skips evolution — clears pending state and confirms win normally.
  async function skipEvolution(winnerId) {
    setEvolveFlow(null)
    // confirmWinner re-fetches and clears evolutionPending via delete in updatedRound
    await confirmWinner(winnerId)
  }

  // Core evolution handler — called when either host or owner submits the form.
  // Validates that the proposed name is novel (not an existing published combatant),
  // then creates the global variant and wires the round record.
  async function handleEvolution(winnerId, newName, newBio, authorId) {
    setEvolveSubmitting(true)
    setEvolveError(null)
    const nameTaken = await checkCombatantNameExists(newName)
    if (nameTaken) {
      setEvolveError(`"${newName}" already exists — evolution must be a new entry.`)
      setEvolveSubmitting(false)
      return
    }
    setEvolveSubmitting(false)
    const r = await sget('room:' + room.id)
    if (!r) return

    const rdIdx  = r.currentRound - 1
    const rd     = r.rounds[rdIdx]
    const winner = rd.combatants.find(c => c.id === winnerId)
    if (!winner) return

    const newId   = uid()
    const ownerId = winner.ownerId
    const opponent = rd.combatants.find(c => c.id !== winnerId)

    // Fetch the global record to get accurate lineage — the in-room combatant
    // is built from the draft and does not carry lineage data. Without this,
    // a gen1 combatant would produce a gen1 variant instead of gen2, and the
    // rootId would point to the wrong ancestor.
    const globalWinner = await getCombatant(winner.id)
    const lineage = {
      rootId:     globalWinner?.lineage?.rootId || winner.id,
      parentId:   winner.id,
      generation: (globalWinner?.lineage?.generation || 0) + 1,
      // bornFrom is the permanent record of what caused this evolution.
      // Stored on the combatant so the story is self-contained in the DB.
      bornFrom: {
        opponentName: opponent?.name  || null,
        opponentId:   opponent?.id    || null,
        roundNumber:  rd.number,
        gameCode:     r.code,
        parentName:   winner.name,
      },
    }

    // bornFrom is required — it's the lineage link that powers buildChainEvolutionStory.
    // Never omit it. Without opponentName the evolution narrative is half a story;
    // without roundNumber / gameCode / parentName the record can't be reconstructed.
    const bf = lineage.bornFrom
    if (!bf || !bf.opponentName || !bf.roundNumber || !bf.gameCode || !bf.parentName) {
      throw new Error(
        `createVariantCombatant: lineage.bornFrom is incomplete — ` +
        `opponentName=${bf?.opponentName}, roundNumber=${bf?.roundNumber}, ` +
        `gameCode=${bf?.gameCode}, parentName=${bf?.parentName}`
      )
    }

    // Create the global combatant record for the variant.
    // If no new bio was written, fall back to the original's bio so the variant
    // isn't blank — the original's bio is preserved separately on room.combatants.
    const variantBio = newBio || winner.bio || ''
    await createVariantCombatant({
      id: newId, name: newName, bio: variantBio,
      ownerId, ownerName: winner.ownerName, lineage,
    })

    // Inherit parent's group memberships — variant continues the same group affiliations.
    const parentGroupIds = await getCombatantGroupIds(winner.id)
    if (parentGroupIds.length) await setCombatantGroups(newId, parentGroupIds, ownerId)

    // Apply win/loss to the original. The draft roster is immutable — the variant
    // does not replace the original in any future round of this game. It enters
    // play only in a heritage "next game" draft as a prevWinner prerequisite.
    const finalCombatants = applyWinner(r, { ...rd, winner }, winnerId)

    // Evolution record is fully self-contained so downstream consumers (App.jsx
    // handleHostNextGame, DraftScreen substitutions) don't need to dig into
    // room.combatants to find variant data.
    const finalRound = buildEvolutionRound(rd, winnerId, newId, newName, variantBio, authorId, playerId)

    const rounds = [...r.rounds]; rounds[rdIdx] = finalRound

    const updated = { ...r, rounds, combatants: finalCombatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setEvolveFlow(null)
    setRoom(updated); onResult()

    // Fire-and-forget: global stats for the original combatants in this round
    // (variant is brand new — it doesn't get stats for the round that birthed it)
    ;(async () => {
      for (const c of finalRound.combatants) {
        const isWin = c.id === winnerId
        const { heart, angry, cry } = tallyReactions(finalRound.playerReactions, c.id)
        await incrementCombatantStats(c.id, { wins: isWin ? 1 : 0, losses: isWin ? 0 : 1, heart, angry, cry })
      }
      if (isFinalRound(r)) {
        const { rosterSize, arenaMode, arenaConfig } = normalizeRoomSettings(r.settings)
        await publishCombatants(getCombatantsToPublish(finalCombatants, rounds, rosterSize))
        // Publish every arena snapshotted into a round (handles single, random-pool, playlist modes)
        const arenaIds = [...new Set(rounds.filter(rd => rd.arena?.id).map(rd => rd.arena.id))]
        if (arenaIds.length) await publishArenas(arenaIds)
        if (arenaMode === 'playlist' && arenaConfig?.playlistId) await publishPlaylist(arenaConfig.playlistId)
      }
    })()
  }

  // ── Inline combatant editing ──────────────────────────────────────────────

  function startEdit(c) { setEditingId(c.id); setEditName(c.name); setEditBio(c.bio || '') }

  async function saveEdit(c) {
    setSaving(true)
    const r = await sget('room:' + room.id)
    if (!r) { setSaving(false); return }
    const combatants = JSON.parse(JSON.stringify(r.combatants))
    const newName = editName.trim() || c.name
    const newBio  = editBio.trim()
    Object.keys(combatants).forEach(pid => {
      combatants[pid] = combatants[pid].map(x => x.id === c.id ? { ...x, name: newName, bio: newBio } : x)
    })
    const rounds = r.rounds.map(rd => ({
      ...rd,
      combatants: rd.combatants.map(x => x.id === c.id ? { ...x, name: newName, bio: newBio } : x),
      winner: rd.winner?.id === c.id ? { ...rd.winner, name: newName } : rd.winner,
    }))
    const updated = { ...r, combatants, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setEditingId(null); setSaving(false)
  }

  // ── Dev helper ────────────────────────────────────────────────────────────

  async function simulateToEnd() {
    setSimulating(true)
    const r = await sget('room:' + room.id)
    if (!r) { setSimulating(false); return }
    const updated = simulateGameToEnd(r)
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setSimulating(false); onResult()
  }

  async function sendChat(text) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    const sender = r.players.find(p => p.id === playerId)
    rd.chat = [...(rd.chat || []), { playerId, playerName: sender?.name || '?', text, ts: Date.now() }]
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  // ── Derived values ────────────────────────────────────────────────────────

  if (!round) return null
  const myPick         = round.picks?.[playerId]
  const picks          = round.picks || {}
  const realPlayers    = room.players.filter(p => !p.isBot)
  const pickerNames    = cid => realPlayers.filter(p => picks[p.id] === cid).map(p => p.name)
  const anonymous      = room.settings?.anonymousCombatants || false
  const blindVoting    = room.settings?.blindVoting || false
  const allVoted       = realPlayers.every(p => picks[p.id])
  const showPickers    = !blindVoting || allVoted
  const evolutionPending = round.evolutionPending || null
  const mergePending     = round.mergePending     || null

  // The combatant whose evolution the current player has been asked to write
  const ownerPromptWinner = evolutionPending?.requestedFrom === playerId
    ? round.combatants.find(c => c.id === evolutionPending.winnerId)
    : null

  // Name of the owner the host is waiting on (for the host waiting state)
  const waitingOwnerName = isHost && evolutionPending && evolutionPending.requestedFrom !== playerId
    ? room.players.find(p => p.id === evolutionPending.requestedFrom)?.name || 'the owner'
    : null

  // Merge delegation: owner prompted to name the merged combatant
  const mergeOwnerPrompt = mergePending?.requestedFrom === playerId ? mergePending : null
  // Host waiting state for merge delegation
  const waitingMergeOwnerName = isHost && mergePending && mergePending.requestedFrom !== playerId
    ? room.players.find(p => p.id === mergePending.requestedFrom)?.name || 'the owner'
    : null

  const trapAnnouncement = (() => {
    for (const c of round.combatants) {
      if (!c.trapTarget) continue
      const target = round.combatants.find(other => other.id === c.trapTarget.targetId)
      if (!target) continue
      const trapperOwner = room.players.find(p => p.id === c.ownerId)
      const targetOwner  = room.players.find(p => p.id === target.ownerId)
      return {
        trapperPlayer:    trapperOwner?.name || c.ownerName || '?',
        trapperCombatant: c.name,
        targetPlayer:     targetOwner?.name  || c.trapTarget.targetOwnerName || '?',
        targetCombatant:  target.name,
      }
    }
    return null
  })()

  // Groups shared by two or more combatants in this round — signals a civil war.
  const civilWarGroups = (() => {
    const tally = {}
    for (const c of round.combatants) {
      for (const g of combatantGroups[c.id] || []) {
        if (!tally[g.id]) tally[g.id] = { name: g.name, combatantNames: [] }
        tally[g.id].combatantNames.push(c.name)
      }
    }
    return Object.values(tally).filter(x => x.combatantNames.length >= 2)
  })()

  // ── Render ────────────────────────────────────────────────────────────────

  return (<>
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <ConnectionStatus players={room.players} presentIds={presentIds} isHost={isHost} roomCode={room.code} />
      {room.devMode && (
        <button onClick={simulateToEnd} disabled={simulating} style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginBottom: '1rem', color: 'var(--color-text-warning)' }}>
          {simulating ? 'Simulating…' : '🧪 Simulate to end of game'}
        </button>
      )}
      <ContextStrip room={room} currentArena={round.arena} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Round {round.number}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SpectatorList spectators={room.spectators} />
          <button onClick={isHost ? () => setConfirmLeave(true) : onHome} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Home</button>
        </div>
      </div>
      {confirmLeave && (
        <div style={{ marginBottom: '1rem', padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 10px', fontWeight: 500 }}>Players are waiting — leave anyway?</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>The round will stay open. Players won't be able to advance until you return and confirm a result.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onHome} style={{ ...btn('ghost'), flex: 2, fontSize: 13, padding: '8px', color: 'var(--color-text-warning)', borderColor: 'var(--color-border-warning)' }}>Leave anyway</button>
            <button onClick={() => setConfirmLeave(false)} style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '8px' }}>Stay</button>
          </div>
        </div>
      )}
      {!isHost && hostOnline === false && (
        <div style={{ marginBottom: '1rem', padding: '8px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          Host is out of the room
        </div>
      )}
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1rem' }}>
        {isHost ? 'Pick the winner, then confirm to lock it in.' : 'Tap your pick — the host will confirm the final call.'}
      </p>

      {/* ── Arena context ────────────────────────────────────────────── */}
      {round.arena && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '8px 14px', marginBottom: '1rem' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{round.arena.name}</div>
          {round.arena.description && (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>{round.arena.description}</p>
          )}
          {round.arena.houseRules && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0', fontStyle: 'italic' }}>Rules: {round.arena.houseRules}</p>
          )}
          {playerId && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => handleArenaReaction('like')}
                disabled={arenaReacting}
                style={{ background: arenaReaction === 'like' ? 'var(--color-background-info)' : 'var(--color-background-tertiary)', border: arenaReaction === 'like' ? '1px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 99, padding: '5px 10px', fontSize: 13, cursor: 'pointer' }}>
                👍
              </button>
              <button
                onClick={() => handleArenaReaction('dislike')}
                disabled={arenaReacting}
                style={{ background: arenaReaction === 'dislike' ? 'var(--color-background-danger)' : 'var(--color-background-tertiary)', border: arenaReaction === 'dislike' ? '1px solid var(--color-border-danger)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 99, padding: '5px 10px', fontSize: 13, cursor: 'pointer' }}>
                👎
              </button>
            </div>
          )}
        </div>
      )}

      {trapAnnouncement && (
        <div style={{ marginBottom: '1.5rem', padding: '16px 18px', background: 'var(--color-background-danger)', border: '1.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🪤</div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-danger)', marginBottom: 8 }}>Trap sprung</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>
            {anonymous ? (
              <><span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.trapperCombatant}</span>{' '}has set a trap for{' '}<span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.targetCombatant}</span></>
            ) : (
              <>{trapAnnouncement.trapperPlayer}'s <span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.trapperCombatant}</span>{' '}has trapped{' '}{trapAnnouncement.targetPlayer}'s <span style={{ color: 'var(--color-text-danger)' }}>{trapAnnouncement.targetCombatant}</span></>
            )}
          </div>
        </div>
      )}

      {civilWarGroups.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚔️</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-warning)', fontWeight: 500 }}>
            Civil war — {civilWarGroups.map(g => g.name).join(', ')}
          </span>
        </div>
      )}

      {/* ── Combatant cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
        {round.combatants.map(c => {
          const owner      = room.players.find(p => p.id === c.ownerId)
          const isPicked   = myPick === c.id
          const pickers    = pickerNames(c.id)
          const canEdit    = canEditCombatant(c.ownerId, playerId, room.host)
          const isEditing  = editingId === c.id
          const isEvolving = evolveFlow?.combatantId === c.id

          const ephemeralBadges = getEphemeralBadges(c)

          return (
            <div key={c.id} style={{ background: isPicked ? 'var(--color-background-info)' : 'var(--color-background-secondary)', border: isPicked ? '2px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', transition: 'border 0.15s' }}>

              {/* Card body */}
              <div onClick={() => !isEditing && !isEvolving && castPick(c.id)} style={{ padding: '14px 16px', cursor: isEditing || isEvolving ? 'default' : 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                    {owner?.isBot && <Pill>bot</Pill>}
                    <button onClick={e => { e.stopPropagation(); setSheetCombatant({ id: c.id, inRoom: c }) }} style={{ background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer', padding: '2px 4px', color: 'var(--color-text-tertiary)', lineHeight: 1 }}>📊</button>
                    {canEdit && !isEvolving && <button onClick={e => { e.stopPropagation(); isEditing ? setEditingId(null) : startEdit(c) }} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 99, cursor: 'pointer' }}>{isEditing ? 'cancel' : 'edit'}</button>}
                  </div>
                </div>
                {!isEditing && c.bio && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{c.bio}</div>}
                {!anonymous && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    by {owner && !owner.isBot ? <AvatarWithHover player={owner} onViewProfile={onViewPlayer} /> : null}
                    {owner?.name}
                  </div>
                )}
                {ephemeralBadges.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {ephemeralBadges.map(badge => {
                      if (badge.type === 'on_fire') return (
                        <span key="on_fire" style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 99 }}>
                          🔥 on fire{badge.count > 3 ? ` ×${badge.count}` : ''}
                        </span>
                      )
                      if (badge.type === 'cold_streak') return (
                        <span key="cold_streak" style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 99 }}>
                          🧊 cold streak{badge.count > 3 ? ` ×${badge.count}` : ''}
                        </span>
                      )
                      if (badge.type === 'trapper') return (
                        <span key="trapper" style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 99 }}>
                          🪤 trapper
                        </span>
                      )
                      return null
                    })}
                  </div>
                )}
                {(combatantGroups[c.id] || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {(combatantGroups[c.id] || []).map(g => (
                      <span key={g.id} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 99 }}>
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <div style={{ padding: '0 16px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <input style={{ ...inp(), margin: '10px 0 8px', fontSize: 14 }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                  <textarea style={{ ...inp(), margin: 0, resize: 'none', height: 64, fontSize: 13, width: '100%' }} value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio (optional)" />
                  <button onClick={() => saveEdit(c)} disabled={saving} style={{ ...btn('primary'), marginTop: 8, padding: '8px', fontSize: 13 }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              )}

              {/* Vote pickers */}
              {showPickers && pickers.length > 0 && (
                <div style={{ padding: '6px 16px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {pickers.map(name => (
                    <span key={name} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)' }}>{name}</span>
                  ))}
                </div>
              )}
              {blindVoting && !allVoted && (
                <div style={{ padding: '6px 16px 8px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Votes hidden until everyone picks</span>
                </div>
              )}

              {/* Reactions */}
              {(() => {
                const pr = round.playerReactions || {}
                const myReaction = (pr[playerId] || {})[c.id]
                const { heart, angry, cry } = tallyReactions(pr, c.id)
                return (
                  <div onClick={e => e.stopPropagation()} style={{ padding: '6px 12px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 6 }}>
                    {[['heart','❤️',heart],['angry','😡',angry],['cry','😂',cry]].map(([key,icon,count]) => (
                      <button key={key} onClick={() => castReaction(c.id, key)} style={{ background: myReaction === key ? 'var(--color-background-info)' : 'var(--color-background-tertiary)', border: myReaction === key ? '1px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 99, padding: '7px 12px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {icon}{count > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{count}</span>}
                      </button>
                    ))}
                  </div>
                )
              })()}

              {/* ── Host confirm/evolve buttons ──────────────────────────────── */}

              {/* Normal: two-button decision */}
              {isHost && isPicked && !evolutionPending && !isEvolving && (
                <div style={{ padding: '0 16px 14px', display: 'flex', gap: 8 }}>
                  <button onClick={() => confirmWinner(c.id)} style={{ ...btn('primary'), flex: 2, padding: '10px', fontSize: 14 }}>
                    Confirm win ✓
                  </button>
                  {allowEvolutions && (
                    <button
                      onClick={() => setEvolveFlow({
                        stage:       c.ownerId === playerId ? 'writing' : 'pending',
                        combatantId: c.id,
                      })}
                      style={{ ...btn(), flex: 1, padding: '8px 10px', fontSize: 13 }}
                    >
                      Evolve ⚡
                    </button>
                  )}
                </div>
              )}

              {/* Evolve: choice step (host ≠ owner) */}
              {isHost && isEvolving && evolveFlow.stage === 'pending' && (
                <div style={{ padding: '12px 16px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
                    This win changed <strong>{c.name}</strong>. Who writes what they became?
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={() => setEvolveFlow({ stage: 'writing', combatantId: c.id })}
                      style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '8px' }}
                    >
                      I'll write it
                    </button>
                    <button
                      onClick={() => pushEvolutionToOwner(c.id, c.ownerId)}
                      style={{ ...btn(), flex: 1, fontSize: 13, padding: '8px' }}
                    >
                      Let {owner?.name || 'them'} write it
                    </button>
                  </div>
                  <button onClick={() => setEvolveFlow(null)} style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Evolve: writing form (host writes) */}
              {isHost && isEvolving && evolveFlow.stage === 'writing' && (
                <EvolutionForm
                  winner={c}
                  onSubmit={(name, bio) => handleEvolution(c.id, name, bio, playerId)}
                  onCancel={() => { setEvolveFlow(null); setEvolveError(null) }}
                  error={evolveError}
                  submitting={evolveSubmitting}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Host: waiting for owner to write ──────────────────────────────── */}
      {waitingOwnerName && (
        <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
            ⚡ Waiting for <strong>{waitingOwnerName}</strong> to write the evolution…
          </p>
          <button
            onClick={() => skipEvolution(evolutionPending.winnerId)}
            style={{ ...btn('ghost'), width: '100%', fontSize: 13, color: 'var(--color-text-tertiary)' }}
          >
            Skip — just confirm the win
          </button>
        </div>
      )}

      {/* ── Owner: prompted to write their combatant's evolution ──────────── */}
      {ownerPromptWinner && (
        <div style={{ marginBottom: '1.5rem', border: '1.5px solid var(--color-border-info)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--color-background-info)' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-info)' }}>⚡ Your combatant just won</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>The host wants to know — how did this change <strong>{ownerPromptWinner.name}</strong>?</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>You can skip this — the round result is already recorded.</div>
          </div>
          <EvolutionForm
            winner={ownerPromptWinner}
            onSubmit={(name, bio) => handleEvolution(evolutionPending.winnerId, name, bio, playerId)}
            onCancel={() => { skipEvolution(evolutionPending.winnerId); setEvolveError(null) }}
            cancelLabel="Decline evolution"
            error={evolveError}
            submitting={evolveSubmitting}
          />
        </div>
      )}

      {/* ── Status lines ─────────────────────────────────────────────────── */}
      {!isHost && myPick && !ownerPromptWinner && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>Pick registered — waiting for host to confirm.</p>
      )}
      {!isHost && myPick && isGuest && !voteNudgeDone && (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', margin: '6px 0 0' }}>
          Playing as guest — your vote might not follow you if you switch devices.{' '}
          <button onClick={() => { setVoteNudgeDone(true); onLogin?.() }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-info)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in →</button>
          {' '}<button onClick={() => setVoteNudgeDone(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-tertiary)', fontSize: 12, cursor: 'pointer' }}>✕</button>
        </p>
      )}
      {isHost && !myPick && !evolveFlow && !evolutionPending && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Tap a combatant to select, then confirm to finalise.</p>
      )}

      {/* ── Declare draw (host only, no evolution in progress) ───────────── */}
      {isHost && allowDraws && !evolveFlow && !evolutionPending && !drawFlow && (
        <button onClick={startDrawFlow} style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginTop: 8, color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-tertiary)' }}>
          🤝 Declare draw
        </button>
      )}

      {/* ── Draw flow: step 1 — who is drawing? (3+ combatants only) ─────── */}
      {isHost && !evolveFlow && !evolutionPending && drawFlow?.step === 1 && (
        <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>Who is drawing?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {round.combatants.map(c => {
              const selected = drawFlow.selectedIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    const next = selected
                      ? drawFlow.selectedIds.filter(id => id !== c.id)
                      : [...drawFlow.selectedIds, c.id]
                    setDrawFlow({ ...drawFlow, selectedIds: next })
                  }}
                  style={{ ...btn(selected ? 'primary' : 'ghost'), textAlign: 'left', fontSize: 14, padding: '10px 14px' }}
                >
                  {selected ? '✓ ' : ''}{c.name}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setDrawFlow({ step: 2, selectedIds: drawFlow.selectedIds })}
              disabled={drawFlow.selectedIds.length < 2}
              style={{ ...btn('primary'), flex: 2, fontSize: 13, padding: '8px' }}
            >
              Next →
            </button>
            <button onClick={() => setDrawFlow(null)} style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '8px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Draw flow: step 2 — what happens? ────────────────────────────── */}
      {isHost && !evolveFlow && !evolutionPending && drawFlow?.step === 2 && (
        <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>What happens?</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
            {drawFlow.selectedIds.map(id => round.combatants.find(c => c.id === id)?.name).filter(Boolean).join(' & ')} drew.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => confirmDraw(drawFlow.selectedIds, 'no_advance')}
              style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '10px 8px' }}
            >
              Neither advances
            </button>
            <button
              onClick={() => {
                const resolution = resolveAllAdvanceSelection(drawFlow.selectedIds, allowMerges)
                if (resolution.type === 'prompt_merge') {
                  setDrawFlow(resolution.drawFlow)
                } else {
                  confirmDraw(resolution.combatantIds, resolution.drawOutcome)
                }
              }}
              style={{ ...btn(), flex: 1, fontSize: 13, padding: '10px 8px' }}
            >
              All advance
            </button>
          </div>
          <button
            onClick={() => setDrawFlow({ step: 1, selectedIds: drawFlow.selectedIds })}
            style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}
          >
            ← Back
          </button>
          <button onClick={() => setDrawFlow(null)} style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Draw flow: step 3 — merge or not? (all_advance) ──────────────── */}
      {isHost && !evolveFlow && !evolutionPending && drawFlow?.step === 3 && (
        <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>Merge into a new combatant?</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
            {drawFlow.selectedIds.map(id => round.combatants.find(c => c.id === id)?.name).filter(Boolean).join(' & ')} all advance.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => setDrawFlow({ step: 4, selectedIds: drawFlow.selectedIds, primaryOwnerId: defaultPrimaryOwner(drawFlow.selectedIds) })}
              style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '10px 8px' }}
            >
              Merge ⚡
            </button>
            <button
              onClick={() => confirmDraw(drawFlow.selectedIds, 'all_advance')}
              style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '10px 8px' }}
            >
              No merge, all just win
            </button>
          </div>
          <button
            onClick={() => setDrawFlow({ step: 2, selectedIds: drawFlow.selectedIds })}
            style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}
          >
            ← Back
          </button>
          <button onClick={() => setDrawFlow(null)} style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Draw flow: step 4 — who controls the merged combatant? ───────── */}
      {isHost && !evolveFlow && !evolutionPending && drawFlow?.step === 4 && (() => {
        const drawers = round.combatants.filter(c => drawFlow.selectedIds.includes(c.id))
        return (
          <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>Who controls the merged combatant?</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>Co-owners are credited but don't get a draft slot from this merge.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {drawers.map(c => {
                const owner    = room.players.find(p => p.id === c.ownerId)
                const selected = drawFlow.primaryOwnerId === c.ownerId
                return (
                  <button
                    key={c.ownerId}
                    onClick={() => setDrawFlow({ ...drawFlow, primaryOwnerId: c.ownerId })}
                    style={{ ...btn(selected ? 'primary' : 'ghost'), textAlign: 'left', fontSize: 14, padding: '10px 14px' }}
                  >
                    {selected ? '✓ ' : ''}{owner?.name || c.ownerName} <span style={{ fontSize: 12, color: selected ? undefined : 'var(--color-text-tertiary)' }}>({c.name})</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setDrawFlow({ step: 5, selectedIds: drawFlow.selectedIds, primaryOwnerId: drawFlow.primaryOwnerId })}
              style={{ ...btn('primary'), width: '100%', fontSize: 13, padding: '8px', marginBottom: 8 }}
            >
              Next →
            </button>
            <button
              onClick={() => setDrawFlow({ step: 3, selectedIds: drawFlow.selectedIds })}
              style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}
            >
              ← Back
            </button>
            <button onClick={() => setDrawFlow(null)} style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Cancel
            </button>
          </div>
        )
      })()}

      {/* ── Draw flow: step 5 — merge form (host writes) ─────────────────── */}
      {isHost && !evolveFlow && !evolutionPending && drawFlow?.step === 5 && (() => {
        const parents         = round.combatants.filter(c => drawFlow.selectedIds.includes(c.id))
        const primaryOwner    = room.players.find(p => p.id === drawFlow.primaryOwnerId)
        const hostIsOwner     = drawFlow.primaryOwnerId === playerId
        return (
          <MergeForm
            parents={parents}
            primaryOwnerName={primaryOwner?.name || ''}
            hostIsOwner={hostIsOwner}
            error={mergeError}
            submitting={mergeSubmitting}
            onSubmit={(name, bio, note) => handleMerge(drawFlow.selectedIds, drawFlow.primaryOwnerId, name, bio, note, playerId)}
            onDelegate={() => pushMergeToOwner(drawFlow.selectedIds, drawFlow.primaryOwnerId)}
            onBack={() => setDrawFlow({ step: 4, selectedIds: drawFlow.selectedIds, primaryOwnerId: drawFlow.primaryOwnerId })}
            onCancel={() => { setDrawFlow(null); setMergeError(null) }}
          />
        )
      })()}

      {/* ── Merge delegation: host waiting for owner ──────────────────────── */}
      {isHost && mergePending && waitingMergeOwnerName && (
        <div style={{ marginBottom: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
            ⚡ Waiting for <strong>{waitingMergeOwnerName}</strong> to name the merged combatant…
          </p>
          <button
            onClick={() => skipMerge(mergePending.fromIds)}
            style={{ ...btn('ghost'), width: '100%', fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 6 }}
          >
            Skip merge — all just win
          </button>
        </div>
      )}

      {/* ── Merge delegation: owner prompted to name the merge ────────────── */}
      {mergeOwnerPrompt && !isHost && (() => {
        const parents = round.combatants.filter(c => mergeOwnerPrompt.fromIds.includes(c.id))
        return (
          <div style={{ marginBottom: '1.5rem', border: '1.5px solid var(--color-border-info)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--color-background-info)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-info)' }}>⚡ Your combatants are merging</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>The host wants you to name the merged combatant.</div>
            </div>
            <MergeForm
              parents={parents}
              primaryOwnerName={room.players.find(p => p.id === playerId)?.name || ''}
              hostIsOwner={true}
              error={mergeError}
              submitting={mergeSubmitting}
              onSubmit={(name, bio, note) => handleMerge(mergeOwnerPrompt.fromIds, mergeOwnerPrompt.primaryOwnerId, name, bio, note, playerId)}
              onDelegate={null}
              onBack={null}
              onCancel={() => skipMerge(mergeOwnerPrompt.fromIds)}
              cancelLabel="Decline — all just win"
            />
          </div>
        )
      })()}

      {/* ── Round chat ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Round chat</h3>
        <RoundChat messages={round.chat} onSend={sendChat} />
      </div>
    </div>
    {sheetCombatant && (
      <CombatantSheet
        combatantId={sheetCombatant.id}
        combatant={sheetCombatant.inRoom}
        playerId={playerId}
        onClose={() => setSheetCombatant(null)}
      />
    )}
  </>)
}
