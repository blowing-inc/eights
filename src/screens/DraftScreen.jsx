import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import Pill from '../components/Pill.jsx'
import DevBanner from '../components/DevBanner.jsx'
import FighterAutocomplete from '../components/FighterAutocomplete.jsx'
import CombatantStatsPill from '../components/CombatantStatsPill.jsx'
import { btn, inp } from '../styles.js'
import { sget, sset, upsertGlobalCombatant, subscribeToRoom, getHeritageChain, getCombatantsByIds, getPlayerStashedCombatants, createWorkshopCombatant, stashKickedCombatants } from '../supabase.js'
import {
  uid, ownerLabel, slotMatchesPrevWinner, areAllPrevWinnersPlaced,
  getUnplacedWinners, buildCombatantFromDraft, isDraftComplete,
  getReadyPlayerCount, canForceStart, DEV_ROSTER_NAMES, DEV_ROSTER_BIOS,
  normalizeRoomSettings, buildActiveFormMap, kickPlayerFromRoom,
} from '../gameLogic.js'

export default function DraftScreen({ room: init, playerId, setRoom, onDone, isGuest, onLogin, onBack, onEndSeries }) {
  const [room, setLocal] = useState(init)
  const { rosterSize } = normalizeRoomSettings(init.settings)
  // substitutions: { [originalId]: combatant } — active-form overrides for heritage games
  const [substitutions, setSubstitutions] = useState({})
  // stashedCombatants: logged-in player's private stash — shown only in their own autocomplete
  const [stashedCombatants, setStashedCombatants] = useState([])
  const myPlayer = room.players.find(p => p.id === playerId)
  const existing = room.combatants[playerId] || []
  const savedDraft = existing.length === 0 ? (room.drafts?.[playerId] ?? null) : null
  const [names, setNames] = useState(() => Array(rosterSize).fill('').map((_, i) => existing[i]?.name || savedDraft?.names?.[i] || ''))
  const [bios,  setBios]  = useState(() => Array(rosterSize).fill('').map((_, i) => existing[i]?.bio  || savedDraft?.bios?.[i]  || ''))
  const [globalIds, setGlobalIds] = useState(() => Array(rosterSize).fill(null).map((_, i) => existing[i]?.id || savedDraft?.globalIds?.[i] || null))
  const [traps, setTraps] = useState(() => Array(rosterSize).fill(null).map((_, i) => existing[i]?.trapTarget || savedDraft?.traps?.[i] || null))
  const [trapPickerFor, setTrapPickerFor] = useState(null) // slot index with picker open, or null
  // stashSourceIds[i]: the global id of the stash item that was loaded into slot i.
  // Persists even if the user edits the name (which clears globalIds[i]), so "Stash"
  // can update the original record rather than create a duplicate.
  const [stashSourceIds, setStashSourceIds] = useState(() => Array(rosterSize).fill(null).map((_, i) => savedDraft?.stashSourceIds?.[i] || null))
  const [confirmClearFor, setConfirmClearFor] = useState(null) // slot index showing clear confirm, or null
  const [stashing, setStashing] = useState(false)
  const [submitted, setSubmitted] = useState(existing.length === rosterSize)
  const [forceStarting, setForceStarting] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  // playerId being confirmed for kick, or null
  const [confirmKick, setConfirmKick] = useState(null)
  const isHost = room.host === playerId
  const isSeries = !!room.prevRoomId
  const cancelLabel = isSeries ? 'End series' : 'Cancel game'
  const cancelBody  = isSeries
    ? 'This draft will be discarded. The completed games will remain in history and can be continued later.'
    : 'This draft will be discarded. Any combatants already submitted won\'t be published.'

  const saveTimer = useRef(null)
  const [saveStatus, setSaveStatus] = useState(savedDraft ? 'restored' : null)

  // Other players' prev winners — the pool of valid trap targets
  const otherPrevWinners = Object.entries(room.prevWinners || {})
    .filter(([ownerId]) => ownerId !== playerId)
    .flatMap(([ownerId, winners]) => {
      const ownerName = room.players.find(p => p.id === ownerId)?.name || '?'
      return winners.map(w => ({ ...w, ownerName }))
    })

  useEffect(() => {
    if (submitted) return
    if (names.every(n => !n.trim())) return
    clearTimeout(saveTimer.current)
    setSaveStatus(null)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      const r = await sget('room:' + room.id)
      if (!r) { setSaveStatus(null); return }
      const updated = { ...r, drafts: { ...(r.drafts || {}), [playerId]: { names, bios, globalIds, traps, stashSourceIds } } }
      await sset('room:' + r.id, updated)
      setLocal(updated); setRoom(updated)
      setSaveStatus('saved')
    }, 2000)
    return () => clearTimeout(saveTimer.current)
  }, [names, bios, globalIds, traps, stashSourceIds, submitted])

  useEffect(() => {
    return subscribeToRoom(room.id, r => {
      if (!(r.players || []).some(p => p.id === playerId)) {
        localStorage.setItem('eights_kicked', JSON.stringify({ code: r.code, at: Date.now() }))
        onBack(); return
      }
      setLocal(r); setRoom(r)
      if (r.phase === 'battle') onDone()
    })
  }, [room.id])

  // Heritage game: load the ancestry chain and build active-form substitutions
  // so the autocomplete shows evolved forms instead of their superseded originals.
  // Variant data is fetched from the DB — variants are not in room.combatants
  // (draft is immutable; variant only enters play in the next game).
  useEffect(() => {
    if (!init.prevRoomId) return
    getHeritageChain(init.prevRoomId).then(async chain => {
      const activeFormMap = buildActiveFormMap(chain)
      if (!Object.keys(activeFormMap).length) return
      const variantIds = Object.values(activeFormMap)
      const variants   = await getCombatantsByIds(variantIds)
      const subs = {}
      for (const v of variants) {
        const origId = Object.keys(activeFormMap).find(k => activeFormMap[k] === v.id)
        if (origId) subs[origId] = {
          id: v.id, name: v.name, bio: v.bio || '',
          wins: v.wins || 0, losses: v.losses || 0, draws: v.draws || 0,
          owner_name: v.owner_name || '',
        }
      }
      setSubstitutions(subs)
    })
  }, [init.prevRoomId])

  // Fetch the player's stashed combatants so they appear in their own autocomplete.
  // Guests have no stash, so skip if isGuest.
  useEffect(() => {
    if (!isGuest && playerId) getPlayerStashedCombatants(playerId).then(setStashedCombatants)
  }, [playerId, isGuest])

  const biosRequired = normalizeRoomSettings(room.settings).biosRequired
  const myPrevWinners = room.prevWinners?.[playerId] || []
  const allPrevWinnersPlaced = areAllPrevWinnersPlaced(myPrevWinners, names, globalIds)
  const unplacedWinners      = getUnplacedWinners(myPrevWinners, names, globalIds)

  // Detect duplicate combatant names or globalIds across slots.
  // A champion placed twice still counts — the prev-winner requirement only needs it placed once.
  const filledNames = names.map(n => n.trim().toLowerCase()).filter(Boolean)
  const duplicateNames = new Set(filledNames.filter((n, i) => filledNames.indexOf(n) !== i))
  const filledIds = globalIds.filter(Boolean)
  const duplicateIds = new Set(filledIds.filter((id, i) => filledIds.indexOf(id) !== i))
  const hasDuplicates = duplicateNames.size > 0 || duplicateIds.size > 0

  function clearSlotData(i) {
    const n = [...names]; n[i] = ''; setNames(n)
    const b = [...bios]; b[i] = ''; setBios(b)
    const g = [...globalIds]; g[i] = null; setGlobalIds(g)
    const t = [...traps]; t[i] = null; setTraps(t)
    const s = [...stashSourceIds]; s[i] = null; setStashSourceIds(s)
    if (trapPickerFor === i) setTrapPickerFor(null)
  }

  async function stashSlot(i) {
    if (!names[i].trim() || !playerId || isGuest) return
    setStashing(true)
    const ownerName = ownerLabel(myPlayer?.name, isGuest)
    // If a stash item was loaded (possibly with a renamed name), update it; otherwise create new.
    const stashTargetId = stashSourceIds[i] || (stashedCombatants.some(s => s.id === globalIds[i]) ? globalIds[i] : null)
    if (stashTargetId) {
      await upsertGlobalCombatant({ id: stashTargetId, name: names[i], bio: bios[i] || '', ownerId: playerId, ownerName })
    } else {
      await createWorkshopCombatant({ id: uid(), name: names[i], bio: bios[i] || '', ownerId: playerId, ownerName })
    }
    getPlayerStashedCombatants(playerId).then(setStashedCombatants)
    clearSlotData(i)
    setConfirmClearFor(null)
    setStashing(false)
  }

  async function submit() {
    if (names.some(n => !n.trim())) return
    if (biosRequired && bios.some(b => !b.trim())) return
    if (myPrevWinners.length > 0 && !allPrevWinnersPlaced) return
    const ownerName = ownerLabel(myPlayer.name, isGuest)
    const myList = names.map((name, i) => {
      const c = buildCombatantFromDraft(name, bios[i], globalIds[i], playerId, ownerName)
      if (traps[i]) c.trapTarget = traps[i]
      return c
    })
    myList.forEach(c => upsertGlobalCombatant({ id: c.id, name: c.name, bio: c.bio, ownerId: playerId, ownerName }))
    const { [playerId]: _removed, ...remainingDrafts } = (room.drafts || {})
    const updated = { ...room, combatants: { ...room.combatants, [playerId]: myList }, drafts: remainingDrafts }
    if (isDraftComplete(room.players, updated.combatants, rosterSize)) updated.phase = 'battle'
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); setSubmitted(true)
    if (updated.phase === 'battle') onDone()
  }

  async function forceStart() {
    setForceStarting(true)
    const r = await sget('room:' + room.id)
    if (!r) { setForceStarting(false); return }
    const updated = { ...r, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setForceStarting(false); onDone()
  }

  async function kickPlayer(kickedId) {
    const kickedPlayer = room.players.find(p => p.id === kickedId)
    const { room: updated, submittedCombatants } = kickPlayerFromRoom(room, kickedId)
    if (submittedCombatants.length > 0 && kickedPlayer && !kickedPlayer.isGuest) {
      await stashKickedCombatants(submittedCombatants)
    }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); setConfirmKick(null)
  }

  if (submitted) {
    const realPlayers = room.players.filter(p => !p.isBot)
    const readyCount  = getReadyPlayerCount(room.players, room.combatants, rosterSize)
    const canForce    = canForceStart(isHost, readyCount, realPlayers.length)

    return (
      <Screen title="Draft submitted!" onBack={onBack}>
        {room.devMode && <DevBanner />}
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 15, margin: '0 0 1rem' }}>Your combatants are locked in. Waiting for others…</p>
        {isGuest && (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 1.5rem' }}>
            Playing as guest — your picks might not follow you if you switch devices.{' '}
            <button onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-info)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in to stay in it →</button>
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: canForce ? '1.5rem' : 0 }}>
          {room.players.map(p => {
            const done = p.isBot || (room.combatants[p.id] || []).length === rosterSize
            return (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: confirmKick === p.id ? 'var(--border-radius-md) var(--border-radius-md) 0 0' : 'var(--border-radius-md)' }}>
                  <AvatarWithHover player={p} onViewProfile={null} />
                  <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>{p.name}</span>
                  {p.isBot && <Pill>bot</Pill>}
                  {confirmKick !== p.id && <span style={{ marginLeft: 'auto', fontSize: 13 }}>{done ? '✓' : '…'}</span>}
                  {isHost && !p.isBot && p.id !== playerId && confirmKick !== p.id && (
                    <button
                      onClick={() => setConfirmKick(p.id)}
                      style={{ background: 'transparent', border: 'none', fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px 6px' }}
                      title="Remove player"
                    >✕</button>
                  )}
                  {isHost && confirmKick === p.id && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-danger)' }}>Remove?</span>
                  )}
                </div>
                {isHost && confirmKick === p.id && (
                  <div style={{ display: 'flex', gap: 0, background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderTop: 'none', borderRadius: '0 0 var(--border-radius-md) var(--border-radius-md)', overflow: 'hidden' }}>
                    <button onClick={() => kickPlayer(p.id)} style={{ flex: 1, padding: '8px', background: 'transparent', border: 'none', borderRight: '0.5px solid var(--color-border-danger)', fontSize: 13, color: 'var(--color-text-danger)', cursor: 'pointer' }}>Yes, remove</button>
                    <button onClick={() => setConfirmKick(null)} style={{ flex: 1, padding: '8px', background: 'transparent', border: 'none', fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>Never mind</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {canForce && (
          <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 4px' }}>
              {readyCount} of {realPlayers.length} players are ready. Players who haven't submitted will sit out — their slots won't appear in any round.
            </p>
            {biosRequired && (
              <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '0 0 10px', opacity: 0.85 }}>
                Bios are required in this game. Unsubmitted players are excluded entirely — their combatants won't enter The Cast from this game.
              </p>
            )}
            {!biosRequired && <div style={{ marginBottom: 10 }} />}
            <button onClick={forceStart} disabled={forceStarting} style={{ ...btn('primary'), background: 'var(--color-text-warning)', padding: '8px', fontSize: 13 }}>
              {forceStarting ? 'Starting…' : `Start with ${readyCount} players →`}
            </button>
          </div>
        )}
        {isHost && (
          <div style={{ marginTop: 16 }}>
            {!confirmCancel
              ? <button onClick={() => setConfirmCancel(true)} style={{ ...btn('ghost'), width: '100%', fontSize: 13, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>{cancelLabel}</button>
              : <div style={{ padding: '12px 14px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)' }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 4px', fontWeight: 500 }}>{cancelLabel}?</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 10px' }}>{cancelBody}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onEndSeries} style={{ ...btn('ghost'), flex: 2, fontSize: 13, padding: '8px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Yes, {isSeries ? 'end it' : 'cancel'}</button>
                    <button onClick={() => setConfirmCancel(false)} style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '8px' }}>Never mind</button>
                  </div>
                </div>
            }
          </div>
        )}
      </Screen>
    )
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13, marginBottom: '1rem' }}>← Back</button>
      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>The Fight Card</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: '0.25rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Your {rosterSize} combatants</h2>
        {saveStatus === 'saving'   && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Saving…</span>}
        {saveStatus === 'saved'    && <span style={{ fontSize: 11, color: 'var(--color-text-success)' }}>Draft saved ✓</span>}
        {saveStatus === 'restored' && <span style={{ fontSize: 11, color: 'var(--color-text-info)' }}>Draft restored ↩</span>}
      </div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 1.5rem' }}>
        Keep them secret — anything goes.{' '}
        {biosRequired ? <span style={{ color: 'var(--color-text-warning)' }}>A bio is required for each combatant.</span> : 'Add an optional bio for each.'}
      </p>

      {room.devMode && (
        <button
          onClick={() => { setNames(DEV_ROSTER_NAMES.slice(0, rosterSize)); setBios(DEV_ROSTER_BIOS.slice(0, rosterSize)); setGlobalIds(Array(rosterSize).fill(null)) }}
          style={{ ...btn('ghost'), width: '100%', fontSize: 13, marginBottom: '1.25rem', color: 'var(--color-text-warning)' }}
        >
          🧪 Fill dummy roster
        </button>
      )}

      {myPrevWinners.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '12px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Champions from last game</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myPrevWinners.map(w => {
              const placed = !unplacedWinners.find(u => u.id === w.id)
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: placed ? 'var(--color-text-success)' : 'var(--color-text-primary)', fontWeight: placed ? 500 : 400 }}>
                    {placed ? '✓ ' : ''}{w.name}
                  </span>
                  {!placed && <span style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>— must be placed in a slot</span>}
                </div>
              )
            })}
          </div>
          {unplacedWinners.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '8px 0 0' }}>
              Place all champions before locking in.
            </p>
          )}
        </div>
      )}

      {Array(rosterSize).fill(0).map((_, i) => {
        const isPrevWinnerSlot    = myPrevWinners.some(w => slotMatchesPrevWinner(names, globalIds, i, w))
        const isNewCombatant      = names[i].trim() && !isPrevWinnerSlot && !globalIds[i]
        const trap                = traps[i]
        const trapPickerOpen      = trapPickerFor === i
        const isDuplicate         = (names[i].trim() && duplicateNames.has(names[i].trim().toLowerCase())) ||
                                    (globalIds[i] && duplicateIds.has(globalIds[i]))
        // Stash is offered when the slot isn't linked to a published global record.
        // Covers: brand-new entries, stash-loaded items (with or without name edits).
        const isLinkedToPublished = !!globalIds[i] && !stashedCombatants.some(s => s.id === globalIds[i])
        const canStashSlot        = !isGuest && !!names[i].trim() && !isLinkedToPublished && !isPrevWinnerSlot

        return (
          <div key={i} style={{ marginBottom: 16, padding: '12px 14px', background: isPrevWinnerSlot ? 'var(--color-background-success)' : 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: isDuplicate ? '1.5px solid var(--color-border-danger)' : isPrevWinnerSlot ? '1.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 20 }}>#{i + 1}</span>
              <FighterAutocomplete
                value={names[i]}
                onChange={v => { const n = [...names]; n[i] = v; setNames(n); const g = [...globalIds]; g[i] = null; setGlobalIds(g) }}
                onSelect={f => {
                  const n = [...names]; n[i] = f.name; setNames(n)
                  const b = [...bios]; b[i] = f.bio || ''; setBios(b)
                  const g = [...globalIds]; g[i] = f.id; setGlobalIds(g)
                  const s = [...stashSourceIds]; s[i] = stashedCombatants.some(sc => sc.id === f.id) ? f.id : null; setStashSourceIds(s)
                  setConfirmClearFor(null)
                }}
                placeholder={`Combatant ${i + 1}`}
                playerId={playerId}
                substitutions={substitutions}
                pinnedItems={myPrevWinners.map(w => ({ ...w, wins: w.wins || 0, losses: w.losses || 0, owner_name: myPlayer?.name || '' }))}
                stashedItems={stashedCombatants}
              />
              {isPrevWinnerSlot && globalIds[i] && (
                <CombatantStatsPill globalId={globalIds[i]} label="🏆 champion" pillStyle={{ background: 'var(--color-background-success)', color: 'var(--color-text-success)', border: '0.5px solid var(--color-border-success)' }} />
              )}
              {isPrevWinnerSlot && !globalIds[i] && (
                <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-success)', color: 'var(--color-text-success)', borderRadius: 99, border: '0.5px solid var(--color-border-success)', whiteSpace: 'nowrap', flexShrink: 0 }}>🏆 champion</span>
              )}
              {!isPrevWinnerSlot && globalIds[i] && (
                <CombatantStatsPill globalId={globalIds[i]} label="↩ loaded" pillStyle={{ background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)' }} tooltip="Pulled from an existing record — name and bio are pre-filled from their history." />
              )}
              {names[i].trim() && (
                <button
                  onClick={() => setConfirmClearFor(confirmClearFor === i ? null : i)}
                  style={{ background: 'transparent', border: 'none', fontSize: 16, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}
                  title="Clear this entry"
                >×</button>
              )}
            </div>

            <textarea
              style={{ ...inp(), margin: 0, width: '100%', resize: 'none', height: 52, fontSize: 13, ...(biosRequired && !bios[i].trim() ? { borderColor: 'var(--color-border-warning)' } : {}) }}
              placeholder={biosRequired ? 'Bio (required)' : 'Bio (optional)'}
              value={bios[i]}
              onChange={e => { const b = [...bios]; b[i] = e.target.value; setBios(b) }}
            />

            {confirmClearFor === i && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Clear this slot?</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canStashSlot && (
                    <button
                      onClick={() => stashSlot(i)}
                      disabled={stashing}
                      style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, color: 'var(--color-text-info)', borderColor: 'var(--color-border-info)' }}
                    >{stashing ? 'Stashing…' : '🔒 Stash it'}</button>
                  )}
                  <button
                    onClick={() => { clearSlotData(i); setConfirmClearFor(null) }}
                    style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}
                  >Clear</button>
                  <button
                    onClick={() => setConfirmClearFor(null)}
                    style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12 }}
                  >Never mind</button>
                </div>
              </div>
            )}

            {/* Trap controls — only for brand-new combatants in a Next Game */}
            {isNewCombatant && otherPrevWinners.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {trap ? (
                  // Trap is set — show label + clear button
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, padding: '3px 8px', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 99 }}>
                      🪤 trapping {trap.targetName} ({trap.targetOwnerName})
                    </span>
                    <button
                      onClick={() => { const t = [...traps]; t[i] = null; setTraps(t) }}
                      style={{ background: 'transparent', border: 'none', fontSize: 13, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
                      title="Remove trap"
                    >×</button>
                  </div>
                ) : (
                  // No trap set yet — show toggle button
                  <button
                    onClick={() => setTrapPickerFor(trapPickerOpen ? null : i)}
                    style={{ ...btn('ghost'), width: 'auto', padding: '4px 10px', fontSize: 12, color: trapPickerOpen ? 'var(--color-text-danger)' : 'var(--color-text-secondary)' }}
                  >
                    {trapPickerOpen ? 'Cancel' : '🪤 Set trap'}
                  </button>
                )}

                {/* Trap target picker */}
                {trapPickerOpen && !trap && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-danger)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Choose your target
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {otherPrevWinners.map(w => (
                        <button
                          key={w.id}
                          onClick={() => {
                            const t = [...traps]
                            t[i] = { targetId: w.id, targetName: w.name, targetOwnerName: w.ownerName }
                            setTraps(t)
                            setTrapPickerFor(null)
                          }}
                          style={{ textAlign: 'left', padding: '8px 10px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{w.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>by {w.ownerName}</span>
                          {w.bio && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{w.bio}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {hasDuplicates && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: 0 }}>
            Each combatant must be unique. Remove the duplicate{duplicateNames.size + duplicateIds.size > 1 ? 's' : ''} before locking in.
          </p>
        </div>
      )}
      <button style={btn('primary')} onClick={submit} disabled={names.some(n => !n.trim()) || (biosRequired && bios.some(b => !b.trim())) || (myPrevWinners.length > 0 && !allPrevWinnersPlaced) || hasDuplicates}>Lock in my {rosterSize} →</button>
      {isHost && (
        <div style={{ marginTop: 12 }}>
          {!confirmCancel
            ? <button onClick={() => setConfirmCancel(true)} style={{ ...btn('ghost'), width: '100%', fontSize: 13, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>{cancelLabel}</button>
            : <div style={{ padding: '12px 14px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)' }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-danger)', margin: '0 0 4px', fontWeight: 500 }}>{cancelLabel}?</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-danger)', margin: '0 0 10px' }}>{cancelBody}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onEndSeries} style={{ ...btn('ghost'), flex: 2, fontSize: 13, padding: '8px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>Yes, {isSeries ? 'end it' : 'cancel'}</button>
                  <button onClick={() => setConfirmCancel(false)} style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '8px' }}>Never mind</button>
                </div>
              </div>
          }
        </div>
      )}
    </div>
  )
}
