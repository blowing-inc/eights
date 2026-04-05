import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import Pill from '../components/Pill.jsx'
import DevBanner from '../components/DevBanner.jsx'
import FighterAutocomplete from '../components/FighterAutocomplete.jsx'
import CombatantStatsPill from '../components/CombatantStatsPill.jsx'
import { btn, inp } from '../styles.js'
import { sget, sset, upsertGlobalCombatant, subscribeToRoom } from '../supabase.js'
import {
  ownerLabel, slotMatchesPrevWinner, areAllPrevWinnersPlaced,
  getUnplacedWinners, buildCombatantFromDraft, isDraftComplete,
  getReadyPlayerCount, canForceStart
} from '../gameLogic.js'

export default function DraftScreen({ room: init, playerId, setRoom, onDone, isGuest, onBack }) {
  const [room, setLocal] = useState(init)
  const myPlayer = room.players.find(p => p.id === playerId)
  const existing = room.combatants[playerId] || []
  const savedDraft = existing.length === 0 ? (room.drafts?.[playerId] ?? null) : null
  const [names, setNames] = useState(() => Array(8).fill('').map((_, i) => existing[i]?.name || savedDraft?.names?.[i] || ''))
  const [bios,  setBios]  = useState(() => Array(8).fill('').map((_, i) => existing[i]?.bio  || savedDraft?.bios?.[i]  || ''))
  const [globalIds, setGlobalIds] = useState(() => Array(8).fill(null).map((_, i) => existing[i]?.id || savedDraft?.globalIds?.[i] || null))
  const [submitted, setSubmitted] = useState(existing.length === 8)
  const [forceStarting, setForceStarting] = useState(false)
  const isHost = room.host === playerId

  const saveTimer = useRef(null)
  const [saveStatus, setSaveStatus] = useState(savedDraft ? 'restored' : null)

  useEffect(() => {
    if (submitted) return
    if (names.every(n => !n.trim())) return
    clearTimeout(saveTimer.current)
    setSaveStatus(null)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      const r = await sget('room:' + room.id)
      if (!r) { setSaveStatus(null); return }
      const updated = { ...r, drafts: { ...(r.drafts || {}), [playerId]: { names, bios, globalIds } } }
      await sset('room:' + r.id, updated)
      setLocal(updated); setRoom(updated)
      setSaveStatus('saved')
    }, 2000)
    return () => clearTimeout(saveTimer.current)
  }, [names, bios, globalIds, submitted])

  useEffect(() => {
    return subscribeToRoom(room.id, r => {
      setLocal(r); setRoom(r)
      if (r.phase === 'battle') onDone()
    })
  }, [room.id])

  const myPrevWinners = room.prevWinners?.[playerId] || []
  const allPrevWinnersPlaced = areAllPrevWinnersPlaced(myPrevWinners, names, globalIds)
  const unplacedWinners      = getUnplacedWinners(myPrevWinners, names, globalIds)

  async function submit() {
    if (names.some(n => !n.trim())) return
    if (myPrevWinners.length > 0 && !allPrevWinnersPlaced) return
    const ownerName = ownerLabel(myPlayer.name, isGuest)
    const myList = names.map((name, i) => buildCombatantFromDraft(name, bios[i], globalIds[i], playerId, ownerName))
    myList.forEach(c => upsertGlobalCombatant({ id: c.id, name: c.name, bio: c.bio, ownerId: playerId, ownerName }))
    const { [playerId]: _removed, ...remainingDrafts } = (room.drafts || {})
    const updated = { ...room, combatants: { ...room.combatants, [playerId]: myList }, drafts: remainingDrafts }
    if (isDraftComplete(room.players, updated.combatants)) updated.phase = 'battle'
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

  if (submitted) {
    const realPlayers = room.players.filter(p => !p.isBot)
    const readyCount  = getReadyPlayerCount(room.players, room.combatants)
    const canForce    = canForceStart(isHost, readyCount, realPlayers.length)

    return (
      <Screen title="Draft submitted!" onBack={onBack}>
        {room.devMode && <DevBanner />}
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 15, margin: '0 0 2rem' }}>Your combatants are locked in. Waiting for others…</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: canForce ? '1.5rem' : 0 }}>
          {room.players.map(p => {
            const done = p.isBot || (room.combatants[p.id] || []).length === 8
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
                <AvatarWithHover player={p} onViewProfile={null} />
                <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>{p.name}</span>
                {p.isBot && <Pill>bot</Pill>}
                <span style={{ marginLeft: 'auto', fontSize: 13 }}>{done ? '✓' : '…'}</span>
              </div>
            )
          })}
        </div>
        {canForce && (
          <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>
              {readyCount} of {realPlayers.length} players are ready. You can start now — players who haven't finished won't have their combatants published.
            </p>
            <button onClick={forceStart} disabled={forceStarting} style={{ ...btn('primary'), background: 'var(--color-text-warning)', padding: '8px', fontSize: 13 }}>
              {forceStarting ? 'Starting…' : `Start with ${readyCount} players →`}
            </button>
          </div>
        )}
      </Screen>
    )
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13, marginBottom: '1rem' }}>← Back</button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: '0.25rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Your 8 combatants</h2>
        {saveStatus === 'saving'   && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Saving…</span>}
        {saveStatus === 'saved'    && <span style={{ fontSize: 11, color: 'var(--color-text-success)' }}>Draft saved ✓</span>}
        {saveStatus === 'restored' && <span style={{ fontSize: 11, color: 'var(--color-text-info)' }}>Draft restored ↩</span>}
      </div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 1.5rem' }}>Keep them secret — anything goes. Add an optional bio for each.</p>

      {myPrevWinners.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '12px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Champions from last battle</div>
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

      {Array(8).fill(0).map((_, i) => {
        const isPrevWinnerSlot = myPrevWinners.some(w => slotMatchesPrevWinner(names, globalIds, i, w))
        return (
          <div key={i} style={{ marginBottom: 16, padding: '12px 14px', background: isPrevWinnerSlot ? 'var(--color-background-success)' : 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: isPrevWinnerSlot ? '1.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 20 }}>#{i + 1}</span>
              <FighterAutocomplete
                value={names[i]}
                onChange={v => { const n = [...names]; n[i] = v; setNames(n); const g = [...globalIds]; g[i] = null; setGlobalIds(g) }}
                onSelect={f => { const n = [...names]; n[i] = f.name; setNames(n); const b = [...bios]; b[i] = f.bio || ''; setBios(b); const g = [...globalIds]; g[i] = f.id; setGlobalIds(g) }}
                placeholder={`Combatant ${i + 1}`}
                playerId={playerId}
              />
              {isPrevWinnerSlot && globalIds[i] && (
                <CombatantStatsPill globalId={globalIds[i]} label="🏆 champion" pillStyle={{ background: 'var(--color-background-success)', color: 'var(--color-text-success)', border: '0.5px solid var(--color-border-success)' }} />
              )}
              {isPrevWinnerSlot && !globalIds[i] && (
                <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-success)', color: 'var(--color-text-success)', borderRadius: 99, border: '0.5px solid var(--color-border-success)', whiteSpace: 'nowrap', flexShrink: 0 }}>🏆 champion</span>
              )}
              {!isPrevWinnerSlot && globalIds[i] && (
                <CombatantStatsPill globalId={globalIds[i]} label="↩ loaded" pillStyle={{ background: 'var(--color-background-info)', color: 'var(--color-text-info)', border: '0.5px solid var(--color-border-info)' }} />
              )}
            </div>
            <textarea style={{ ...inp(), margin: 0, width: '100%', resize: 'none', height: 52, fontSize: 13 }} placeholder="Bio (optional)" value={bios[i]} onChange={e => { const b = [...bios]; b[i] = e.target.value; setBios(b) }} />
          </div>
        )
      })}
      <button style={btn('primary')} onClick={submit} disabled={names.some(n => !n.trim()) || (myPrevWinners.length > 0 && !allPrevWinnersPlaced)}>Lock in my 8 →</button>
    </div>
  )
}
