import { useState, useEffect } from 'react'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import Pill from '../components/Pill.jsx'
import DevBanner from '../components/DevBanner.jsx'
import RoundChat from '../components/RoundChat.jsx'
import EvolutionForm from '../components/EvolutionForm.jsx'
import { btn, inp } from '../styles.js'
import { sget, sset, incrementCombatantStats, publishCombatants, subscribeToRoom, createVariantCombatant, checkCombatantNameExists, getCombatant } from '../supabase.js'
import SpectatorList from '../components/SpectatorList.jsx'
import CombatantSheet from '../components/CombatantSheet.jsx'
import { uid, canEditCombatant, simulateBattleToEnd, applyWinner, applyDraw, toggleReaction, tallyReactions, isFinalRound, normalizeRoomSettings } from '../gameLogic.js'

export default function VoteScreen({ room: init, playerId, setRoom, onResult, onViewPlayer, onHome }) {
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

  const round   = room.rounds[room.currentRound - 1]
  const isHost  = room.host === playerId

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
  }, [room.id, room.currentRound])

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
        const { rosterSize } = normalizeRoomSettings(r.settings)
        const rosterIds  = Object.values(r.combatants)
          .filter(list => list.length === rosterSize)
          .flat().map(c => c.id)
        const variantIds = (r.rounds || []).filter(rd => rd.evolution).map(rd => rd.evolution.toId)
        await publishCombatants([...new Set([...rosterIds, ...variantIds])])
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

  async function declareDraw() {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rdIdx = r.currentRound - 1
    const rd = r.rounds[rdIdx]
    const updatedRound = { ...rd, draw: true, winner: null, resolvedAt: Date.now() }
    delete updatedRound.evolutionPending
    const rounds = [...r.rounds]; rounds[rdIdx] = updatedRound
    const combatants = applyDraw(r, updatedRound)
    const updated = { ...r, rounds, combatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setRoom(updated); onResult()

    ;(async () => {
      for (const c of updatedRound.combatants) {
        const { heart, angry, cry } = tallyReactions(updatedRound.playerReactions, c.id)
        await incrementCombatantStats(c.id, { draws: 1, heart, angry, cry })
      }
      if (isFinalRound(r)) {
        const { rosterSize } = normalizeRoomSettings(r.settings)
        const rosterIds  = Object.values(combatants)
          .filter(list => list.length === rosterSize)
          .flat().map(c => c.id)
        const variantIds = rounds.filter(rd => rd.evolution).map(rd => rd.evolution.toId)
        await publishCombatants([...new Set([...rosterIds, ...variantIds])])
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

    // Create the global combatant record for the variant.
    // If no new bio was written, fall back to the original's bio so the variant
    // isn't blank — the original's bio is preserved separately on room.combatants.
    const variantBio = newBio || winner.bio || ''
    await createVariantCombatant({
      id: newId, name: newName, bio: variantBio,
      ownerId, ownerName: winner.ownerName, lineage,
    })

    // Apply win/loss to the original. The draft roster is immutable — the variant
    // does not replace the original in any future round of this game. It enters
    // play only in a heritage "next battle" draft as a prevWinner prerequisite.
    const finalCombatants = applyWinner(r, { ...rd, winner }, winnerId)

    // Evolution record is fully self-contained so downstream consumers (App.jsx
    // handleHostNextBattle, DraftScreen substitutions) don't need to dig into
    // room.combatants to find variant data.
    const evolution = {
      fromId:    winnerId,
      fromName:  winner.name,
      toId:      newId,
      toName:    newName,
      toBio:     variantBio,
      ownerId,
      ownerName: winner.ownerName,
      authorId,
    }
    const finalRound = {
      ...rd,
      winner,
      evolution,
      resolvedAt: Date.now(),
      picks: { ...(rd.picks || {}), [playerId]: winnerId },
    }
    delete finalRound.evolutionPending

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
        const { rosterSize } = normalizeRoomSettings(r.settings)
        const rosterIds  = Object.values(finalCombatants)
          .filter(list => list.length === rosterSize)
          .flat().map(c => c.id)
        // Also publish any variants created during this game — they were never
        // in the roster so they won't appear in rosterIds
        const variantIds = rounds.filter(rd => rd.evolution).map(rd => rd.evolution.toId)
        await publishCombatants([...new Set([...rosterIds, ...variantIds])])
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
    const updated = simulateBattleToEnd(r)
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

  // The combatant whose evolution the current player has been asked to write
  const ownerPromptWinner = evolutionPending?.requestedFrom === playerId
    ? round.combatants.find(c => c.id === evolutionPending.winnerId)
    : null

  // Name of the owner the host is waiting on (for the host waiting state)
  const waitingOwnerName = isHost && evolutionPending && evolutionPending.requestedFrom !== playerId
    ? room.players.find(p => p.id === evolutionPending.requestedFrom)?.name || 'the owner'
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (<>
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      {room.devMode && (
        <button onClick={simulateToEnd} disabled={simulating} style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginBottom: '1rem', color: 'var(--color-text-warning)' }}>
          {simulating ? 'Simulating…' : '🧪 Simulate to end of battle'}
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Round {round.number}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SpectatorList spectators={room.spectators} />
          <button onClick={onHome} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Home</button>
        </div>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.5rem' }}>
        {isHost ? 'Pick the winner, then confirm to lock it in.' : 'Tap your pick — the host will confirm the final call.'}
      </p>

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

      {/* ── Combatant cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
        {round.combatants.map(c => {
          const owner      = room.players.find(p => p.id === c.ownerId)
          const isPicked   = myPick === c.id
          const pickers    = pickerNames(c.id)
          const canEdit    = canEditCombatant(c.ownerId, playerId, room.host)
          const isEditing  = editingId === c.id
          const isEvolving = evolveFlow?.combatantId === c.id

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
                  <button
                    onClick={() => setEvolveFlow({
                      stage:       c.ownerId === playerId ? 'writing' : 'pending',
                      combatantId: c.id,
                    })}
                    style={{ ...btn(), flex: 1, padding: '8px 10px', fontSize: 13 }}
                  >
                    Evolve ⚡
                  </button>
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
          </div>
          <EvolutionForm
            winner={ownerPromptWinner}
            onSubmit={(name, bio) => handleEvolution(evolutionPending.winnerId, name, bio, playerId)}
            onCancel={() => { skipEvolution(evolutionPending.winnerId); setEvolveError(null) }}
            error={evolveError}
            submitting={evolveSubmitting}
          />
        </div>
      )}

      {/* ── Status lines ─────────────────────────────────────────────────── */}
      {!isHost && myPick && !ownerPromptWinner && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>Pick registered — waiting for host to confirm.</p>
      )}
      {isHost && !myPick && !evolveFlow && !evolutionPending && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Tap a combatant to select, then confirm to finalise.</p>
      )}

      {/* ── Declare draw (host only, no evolution in progress) ───────────── */}
      {isHost && !evolveFlow && !evolutionPending && (
        <button onClick={declareDraw} style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginTop: 8, color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-tertiary)' }}>
          🤝 Declare draw
        </button>
      )}

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
