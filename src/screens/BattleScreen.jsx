import { useState, useEffect, useRef } from 'react'
import DevBanner from '../components/DevBanner.jsx'
import CombatantSheet from '../components/CombatantSheet.jsx'
import { btn } from '../styles.js'
import { sget, sset, incrementCombatantStats, subscribeToRoom, trackRoomPresence } from '../supabase.js'
import { uid, canUndoLastRound, undoRound, tallyReactions } from '../gameLogic.js'

export default function BattleScreen({ room: init, playerId, setRoom, onVote, onHistory, onHome, onNextBattle, onRejoinNextBattle }) {
  const [room, setLocal] = useState(init)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [sheetCombatant, setSheetCombatant] = useState(null) // { id, inRoom }
  const [undoNotice, setUndoNotice] = useState(null) // "Host undid Round X"
  const [hostOnline, setHostOnline] = useState(null) // null = not yet synced; false = host absent
  const prevRoundRef = useRef(init.currentRound)
  const undoTimerRef = useRef(null)

  useEffect(() => {
    return subscribeToRoom(room.id, async r => {
      if (r.nextRoomId) {
        const nextRoom = await sget('room:' + r.nextRoomId)
        if (nextRoom) { setRoom(nextRoom); onRejoinNextBattle(nextRoom); return }
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
  }, [room.id])

  useEffect(() => {
    return trackRoomPresence(room.id, playerId, isHost ? 'host' : 'player', setHostOnline)
  }, [room.id])

  const isHost = room.host === playerId
  const round = room.rounds[room.currentRound - 1]
  const totalRounds = Math.min(...room.players.map(p => (room.combatants[p.id] || []).length))
  const canUndo = canUndoLastRound(isHost, room.currentRound, round)

  async function startRound() {
    const roundNum = room.currentRound + 1
    const matchup = room.players.map(p => (room.combatants[p.id] || [])[roundNum - 1]).filter(Boolean)
    const newRound = { id: uid(), number: roundNum, combatants: matchup, picks: {}, winner: null, createdAt: Date.now() }
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

  async function completeTournament() {
    const r = await sget('room:' + room.id)
    if (!r) return
    const updated = { ...r, phase: 'ended' }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
    onHome()
  }

  async function undoLastRound() {
    const r = await sget('room:' + room.id)
    if (!r || r.currentRound === 0) return
    const last = r.rounds[r.currentRound - 1]
    if (!last?.winner && !last?.draw) return

    // Reverse in-room stats using pure function
    const combatants = undoRound(r, last)
    const updated = { ...r, rounds: r.rounds.slice(0, r.currentRound - 1), combatants, currentRound: r.currentRound - 1, phase: 'battle' }
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

  return (<>
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Battle arena</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onHistory} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>History</button>
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
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>{r.combatants.map(c => c.name).join(' vs ')}</span>
              {r.winner
                ? <>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-success)', flexShrink: 0 }}>🏆 {r.winner.name}</span>
                    {r.evolution && <span style={{ fontSize: 11, color: 'var(--color-text-info)', flexShrink: 0 }}>⚡ → {r.evolution.toName}</span>}
                  </>
                : r.draw
                  ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', flexShrink: 0 }}>🤝 Draw</span>
                  : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>deliberating…</span>}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {r.combatants.map(c => (
                  <button key={c.id} onClick={() => setSheetCombatant({ id: c.id, inRoom: c })}
                    title={c.name}
                    style={{ background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer', padding: '2px 4px', color: 'var(--color-text-tertiary)', lineHeight: 1 }}>📊</button>
                ))}
              </div>
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

        {isHost && room.currentRound < totalRounds && (round?.winner || round?.draw) && (
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
            <h3 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>Tournament complete!</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: 0 }}>All {totalRounds} rounds fought.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {isHost && (
                <>
                  <button style={btn('primary')} onClick={completeTournament}>Complete tournament ✓</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn()} onClick={onHistory}>View history</button>
                    <button style={btn()} onClick={() => onNextBattle(room)}>Next Battle ⚔️</button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                    This room stays open until you complete or start the next battle.
                  </p>
                </>
              )}
              {!isHost && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Waiting for host to start next battle…</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn()} onClick={onHistory}>View history</button>
                    <button style={btn()} onClick={onHome}>Back to home</button>
                  </div>
                </>
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
