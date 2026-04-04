import { useState, useEffect } from 'react'
import { sget, sset, slist, upsertGlobalCombatant, incrementCombatantStats, updateGlobalCombatant, searchCombatants, getPlayerRecentCombatants, listCombatants } from './supabase.js'

const POLL_INTERVAL = 2500

// ─── Utilities ────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9) }
function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }

const COLORS = ['#7F77DD','#1D9E75','#D85A30','#378ADD','#D4537E','#639922','#BA7517','#E24B4A']
function playerColor(idx) { return COLORS[idx % COLORS.length] }

// ─── Dev / bot data ───────────────────────────────────────────────────────────
const BOT_COMBATANTS = [
  ['Lorem Ipsum','Dolor Sit','Amet Consectetur','Adipiscing Elit','Sed Do Eiusmod','Tempor Incididunt','Ut Labore','Et Dolore'],
  ['Magna Aliqua','Enim Minim','Veniam Quis','Nostrud Exercit','Ullamco Laboris','Nisi Aliquip','Ex Ea Commodo','Consequat Duis'],
]
const BOT_BIOS = [
  'Forged in the fires of placeholder text, their power is unknowable.',
  'Ancient beyond reckoning. Meaning: disputed.',
  'Transcends the concept of biography.',
  'Once defeated a semicolon in single combat.',
  'No bio. Only vibes.',
  'Their origin story is redacted for legal reasons.',
  'Exists primarily as a rhetorical device.',
  'Lorem ipsum dolor sit amet — this IS their bio.',
]
function makeBotCombatants(botIdx, botId, botName) {
  return BOT_COMBATANTS[botIdx % 2].map((name, i) => ({
    id: uid(), name, bio: BOT_BIOS[i],
    ownerId: botId, ownerName: botName,
    isBot: true, wins: 0, losses: 0, draws: 0, battles: []
  }))
}
function makeBots(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'bot_' + i,
    name: ['Bot Alpha', 'Bot Beta'][i] || 'Bot ' + i,
    color: playerColor(i + 1),
    ready: true,
    isBot: true,
  }))
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('home')
  const [playerId] = useState(() => {
    const s = sessionStorage.getItem('eights_pid') || uid()
    sessionStorage.setItem('eights_pid', s)
    return s
  })
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('eights_pname') || '')
  const [room, setRoom] = useState(null)
  const [viewCombatant, setViewCombatant] = useState(null)
  const [viewHistory, setViewHistory] = useState(false)
  const [viewBestiary, setViewBestiary] = useState(false)
  const [viewGlobalCombatant, setViewGlobalCombatant] = useState(null)

  const nav = s => setScreen(s)

  async function startDevMode() {
    const roomCode = 'DEV' + Math.random().toString(36).slice(2, 5).toUpperCase()
    const myName = playerName || 'You'
    const bots = makeBots(2)
    const me = { id: playerId, name: myName, color: playerColor(0), ready: false }
    const allPlayers = [me, ...bots]
    const combatants = {}
    bots.forEach((b, i) => { combatants[b.id] = makeBotCombatants(i, b.id, b.name) })
    const newRoom = {
      id: roomCode, code: roomCode, host: playerId,
      phase: 'draft', devMode: true,
      players: allPlayers, combatants,
      rounds: [], currentRound: 0, createdAt: Date.now()
    }
    await sset('room:' + roomCode, newRoom)
    sessionStorage.setItem('eights_pname', myName)
    setPlayerName(myName)
    setRoom(newRoom)
    nav('draft')
  }

  if (viewBestiary) return <BestiaryScreen playerId={playerId} onBack={() => setViewBestiary(false)} onViewCombatant={c => { setViewGlobalCombatant(c); setViewBestiary(false) }} />
  if (viewGlobalCombatant) return <GlobalCombatantDetail combatant={viewGlobalCombatant} playerId={playerId} playerName={playerName} onBack={() => setViewGlobalCombatant(null)} />
  if (viewHistory) return <HistoryScreen activeRoom={room} onBack={() => setViewHistory(false)} setViewCombatant={c => { setViewCombatant(c); setViewHistory(false) }} />
  if (viewCombatant) return <CombatantScreen room={room} combatant={viewCombatant} playerId={playerId} onBack={() => setViewCombatant(null)} />

  if (screen === 'home')   return <HomeScreen onCreate={() => nav('create')} onJoin={() => nav('join')} onHistory={() => setViewHistory(true)} onBestiary={() => setViewBestiary(true)} onDev={startDevMode} />
  if (screen === 'create') return <CreateRoom playerId={playerId} playerName={playerName} setPlayerName={setPlayerName} onCreated={r => { setRoom(r); nav('lobby') }} onBack={() => nav('home')} />
  if (screen === 'join')   return <JoinRoom playerId={playerId} playerName={playerName} setPlayerName={setPlayerName} onJoined={r => { setRoom(r); nav('lobby') }} onBack={() => nav('home')} />
  if (screen === 'lobby')  return <LobbyScreen room={room} playerId={playerId} setRoom={setRoom} onStart={() => nav('draft')} onBack={() => { setRoom(null); nav('home') }} />
  if (screen === 'draft')  return <DraftScreen room={room} playerId={playerId} setRoom={setRoom} onDone={() => nav('battle')} />
  if (screen === 'battle') return <BattleScreen room={room} playerId={playerId} setRoom={setRoom} onVote={() => nav('vote')} onHistory={() => setViewHistory(true)} />
  if (screen === 'vote')   return <VoteScreen room={room} playerId={playerId} setRoom={setRoom} onResult={() => nav('battle')} />
  return null
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function HomeScreen({ onCreate, onJoin, onHistory, onBestiary, onDev }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: 56, marginBottom: '0.5rem' }}>⚔️</div>
        <h1 style={{ fontSize: 40, fontWeight: 500, margin: '0 0 0.5rem', color: 'var(--color-text-primary)', letterSpacing: '-1px' }}>Eights</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 16 }}>The game of improbable battles</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
        <button onClick={onCreate} style={btn('primary')}>Create a room</button>
        <button onClick={onJoin}   style={btn()}>Join a room</button>
        <button onClick={onHistory} style={btn('ghost')}>Battle history ↗</button>
        <button onClick={onBestiary} style={btn('ghost')}>Bestiary ↗</button>
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 12, marginTop: 4 }}>
          <button onClick={onDev} style={{ ...btn('ghost'), width: '100%', fontSize: 13 }}>🧪 Dev mode — solo test</button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Room ──────────────────────────────────────────────────────────────
function CreateRoom({ playerId, playerName, setPlayerName, onCreated, onBack }) {
  const [name, setName] = useState(playerName)
  const [loading, setLoading] = useState(false)

  async function create() {
    if (!name.trim()) return
    setLoading(true)
    const roomCode = Math.random().toString(36).slice(2, 6).toUpperCase()
    const room = {
      id: roomCode, code: roomCode, host: playerId, phase: 'lobby',
      players: [{ id: playerId, name: name.trim(), color: playerColor(0), ready: false }],
      combatants: {}, rounds: [], currentRound: 0, createdAt: Date.now()
    }
    await sset('room:' + roomCode, room)
    sessionStorage.setItem('eights_pname', name.trim())
    setPlayerName(name.trim())
    setLoading(false)
    onCreated(room)
  }

  return (
    <Screen title="New room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={inp()} value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" onKeyDown={e => e.key === 'Enter' && create()} autoFocus />
      <button style={{ ...btn('primary'), marginTop: 8 }} onClick={create} disabled={!name.trim() || loading}>{loading ? 'Creating…' : 'Create room'}</button>
    </Screen>
  )
}

// ─── Join Room ────────────────────────────────────────────────────────────────
function JoinRoom({ playerId, playerName, setPlayerName, onJoined, onBack }) {
  const [name, setName] = useState(playerName)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function join() {
    if (!name.trim() || !code.trim()) return
    setLoading(true); setError('')
    const room = await sget('room:' + code.toUpperCase())
    if (!room) { setError('Room not found. Check the code and try again.'); setLoading(false); return }
    if (room.phase !== 'lobby') { setError('That game has already started.'); setLoading(false); return }
    if (!room.players.find(p => p.id === playerId)) {
      room.players.push({ id: playerId, name: name.trim(), color: playerColor(room.players.length), ready: false })
      await sset('room:' + room.id, room)
    }
    sessionStorage.setItem('eights_pname', name.trim())
    setPlayerName(name.trim())
    setLoading(false)
    onJoined(room)
  }

  return (
    <Screen title="Join room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={inp()} value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" autoFocus />
      <label style={{ ...lbl, marginTop: 16 }}>Room code</label>
      <input style={{ ...inp(), textTransform: 'uppercase', letterSpacing: 4, fontSize: 22 }} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXX" maxLength={4} onKeyDown={e => e.key === 'Enter' && join()} />
      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
      <button style={{ ...btn('primary'), marginTop: 8 }} onClick={join} disabled={!name.trim() || !code.trim() || loading}>{loading ? 'Joining…' : 'Join room'}</button>
    </Screen>
  )
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function LobbyScreen({ room: init, playerId, setRoom, onStart, onBack }) {
  const [room, setLocal] = useState(init)
  const isHost = room.host === playerId

  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await sget('room:' + room.id)
      if (r) { setLocal(r); setRoom(r); if (r.phase === 'draft') onStart() }
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [room.id])

  async function startGame() {
    const updated = { ...room, phase: 'draft' }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onStart()
  }

  return (
    <Screen title={`Room ${room.code}`} onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.5rem' }}>Share this code with your friends</p>
      <div style={{ textAlign: 'center', fontSize: 52, fontWeight: 500, letterSpacing: 8, color: 'var(--color-text-primary)', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '1.5rem', marginBottom: '2rem' }}>{room.code}</div>
      <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 12px' }}>Players ({room.players.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '2rem' }}>
        {room.players.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
            <Avatar name={p.name} color={p.color} />
            <span style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>{p.name}</span>
            {p.id === room.host && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-background-tertiary)', padding: '2px 8px', borderRadius: 99 }}>host</span>}
          </div>
        ))}
      </div>
      {isHost
        ? <button style={btn('primary')} onClick={startGame} disabled={room.players.length < 2}>Start game →</button>
        : <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>Waiting for host to start…</p>}
    </Screen>
  )
}

// ─── Draft ────────────────────────────────────────────────────────────────────
function DraftScreen({ room: init, playerId, setRoom, onDone }) {
  const [room, setLocal] = useState(init)
  const myPlayer = room.players.find(p => p.id === playerId)
  const existing = room.combatants[playerId] || []
  const [names, setNames] = useState(() => Array(8).fill('').map((_, i) => existing[i]?.name || ''))
  const [bios,  setBios]  = useState(() => Array(8).fill('').map((_, i) => existing[i]?.bio  || ''))
  // globalIds[i]: existing global combatant id if loaded from bestiary, null if new
  const [globalIds, setGlobalIds] = useState(() => Array(8).fill(null).map((_, i) => existing[i]?.id || null))
  const [submitted, setSubmitted] = useState(existing.length === 8)

  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await sget('room:' + room.id)
      if (!r) return
      setLocal(r); setRoom(r)
      if (r.phase === 'battle') onDone()
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [room.id])

  async function submit() {
    if (names.some(n => !n.trim())) return
    const myList = names.map((name, i) => {
      // Reuse the global id when loading an existing fighter so stats accumulate
      const id = globalIds[i] || uid()
      return { id, name: name.trim(), bio: bios[i].trim(), ownerId: playerId, ownerName: myPlayer.name, wins: 0, losses: 0, draws: 0, battles: [] }
    })
    // Register / touch each combatant in the global table (non-blocking)
    myList.forEach(c => upsertGlobalCombatant({ id: c.id, name: c.name, bio: c.bio, ownerId: playerId, ownerName: myPlayer.name }))
    const updated = { ...room, combatants: { ...room.combatants, [playerId]: myList } }
    const realPlayers = room.players.filter(p => !p.isBot)
    const draftDone = realPlayers.every(p => p.id === playerId || (updated.combatants[p.id] || []).length === 8)
    if (draftDone) updated.phase = 'battle'
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); setSubmitted(true)
    if (draftDone) onDone()
  }

  if (submitted) return (
    <Screen title="Draft submitted!">
      {room.devMode && <DevBanner />}
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 15, margin: '0 0 2rem' }}>Your combatants are locked in. Waiting for others…</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {room.players.map(p => {
          const done = p.isBot || (room.combatants[p.id] || []).length === 8
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
              <Avatar name={p.name} color={p.color} />
              <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>{p.name}</span>
              {p.isBot && <Pill>bot</Pill>}
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>{done ? '✓' : '…'}</span>
            </div>
          )
        })}
      </div>
    </Screen>
  )

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 0.25rem', color: 'var(--color-text-primary)' }}>Your 8 combatants</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 1.5rem' }}>Keep them secret — anything goes. Add an optional bio for each.</p>
      {Array(8).fill(0).map((_, i) => (
        <div key={i} style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 20 }}>#{i + 1}</span>
            <FighterAutocomplete
              value={names[i]}
              onChange={v => { const n = [...names]; n[i] = v; setNames(n); const g = [...globalIds]; g[i] = null; setGlobalIds(g) }}
              onSelect={f => { const n = [...names]; n[i] = f.name; setNames(n); const b = [...bios]; b[i] = f.bio || ''; setBios(b); const g = [...globalIds]; g[i] = f.id; setGlobalIds(g) }}
              placeholder={`Combatant ${i + 1}`}
              playerId={playerId}
            />
            {globalIds[i] && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)', whiteSpace: 'nowrap', flexShrink: 0 }}>↩ loaded</span>}
          </div>
          <textarea style={{ ...inp(), margin: 0, width: '100%', resize: 'none', height: 52, fontSize: 13 }} placeholder="Bio (optional)" value={bios[i]} onChange={e => { const b = [...bios]; b[i] = e.target.value; setBios(b) }} />
        </div>
      ))}
      <button style={btn('primary')} onClick={submit} disabled={names.some(n => !n.trim())}>Lock in my 8 →</button>
    </div>
  )
}

// ─── Battle arena ─────────────────────────────────────────────────────────────
function BattleScreen({ room: init, playerId, setRoom, onVote, onHistory }) {
  const [room, setLocal] = useState(init)
  const [confirmUndo, setConfirmUndo] = useState(false)

  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await sget('room:' + room.id)
      if (!r) return
      setLocal(r); setRoom(r)
      if (r.phase === 'voting') onVote()
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [room.id])

  const isHost = room.host === playerId
  const round = room.rounds[room.currentRound - 1]
  const totalRounds = Math.min(...room.players.map(p => (room.combatants[p.id] || []).length))
  const canUndo = isHost && room.currentRound > 0 && round?.winner

  async function startRound() {
    const roundNum = room.currentRound + 1
    const matchup = room.players.map(p => (room.combatants[p.id] || [])[roundNum - 1]).filter(Boolean)
    const newRound = { id: uid(), number: roundNum, combatants: matchup, picks: {}, winner: null, createdAt: Date.now() }
    const updated = { ...room, phase: 'voting', currentRound: roundNum, rounds: [...room.rounds, newRound] }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onVote()
  }

  async function undoLastRound() {
    const r = await sget('room:' + room.id)
    if (!r || r.currentRound === 0) return
    const last = r.rounds[r.currentRound - 1]
    if (!last?.winner) return
    const combatants = JSON.parse(JSON.stringify(r.combatants))
    Object.keys(combatants).forEach(pid => {
      combatants[pid] = combatants[pid].map(c => {
        if (!last.combatants.find(rc => rc.id === c.id)) return c
        const wasWin = last.winner?.id === c.id
        return { ...c, wins: Math.max(0, c.wins - (wasWin ? 1 : 0)), losses: Math.max(0, c.losses - (wasWin ? 0 : 1)), battles: (c.battles || []).filter(b => b.roundId !== last.id) }
      })
    })
    const updated = { ...r, rounds: r.rounds.slice(0, r.currentRound - 1), combatants, currentRound: r.currentRound - 1, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setConfirmUndo(false)
    // Reverse global stats (non-blocking); reactions are NOT reversed — they're permanent sentiment
    ;(async () => {
      for (const c of last.combatants) {
        const wasWin = last.winner?.id === c.id
        await incrementCombatantStats(c.id, { wins: wasWin ? -1 : 0, losses: wasWin ? 0 : -1 })
      }
    })()
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Battle arena</h2>
        <button onClick={onHistory} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>History</button>
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
                ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-success)', flexShrink: 0 }}>🏆 {r.winner.name}</span>
                : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>deliberating…</span>}
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
              Undo Round {room.currentRound}? This will reverse {round.winner?.name}'s win and remove that round from the record.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={undoLastRound} style={{ ...btn('primary'), flex: 1, background: 'var(--color-text-danger)', fontSize: 13, padding: '8px' }}>Yes, undo it</button>
              <button onClick={() => setConfirmUndo(false)} style={{ ...btn(), flex: 1, fontSize: 13, padding: '8px' }}>Cancel</button>
            </div>
          </div>
        )}

        {isHost && room.currentRound < totalRounds && round?.winner && (
          <button style={btn('primary')} onClick={startRound}>Round {room.currentRound + 1} ⚔️</button>
        )}
        {!isHost && room.phase === 'voting' && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>Deliberating — waiting for host to confirm…</p>
        )}
        {room.currentRound >= totalRounds && round?.winner && (
          <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <h3 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>Tournament complete!</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: 0 }}>All 8 rounds fought. Check the history for full results.</p>
            <button style={{ ...btn(), marginTop: 16 }} onClick={onHistory}>View full history</button>
          </div>
        )}
      </>}
    </div>
  )
}

// ─── Deliberation / vote screen ───────────────────────────────────────────────
function VoteScreen({ room: init, playerId, setRoom, onResult }) {
  const [room, setLocal] = useState(init)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editBio,  setEditBio]  = useState('')
  const [saving, setSaving] = useState(false)

  const round = room.rounds[room.currentRound - 1]
  const isHost = room.host === playerId

  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await sget('room:' + room.id)
      if (!r) return
      const rd = r.rounds[r.currentRound - 1]
      if (rd?.winner) {
        const updated = { ...r, phase: 'battle' }
        await sset('room:' + r.id, updated)
        setRoom(updated); onResult(); return
      }
      setLocal(r); setRoom(r)
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [room.id, room.currentRound])

  async function castReaction(combatantId, emoji) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    const playerReactions = { ...(rd.playerReactions || {}) }
    const mine = { ...(playerReactions[playerId] || {}) }
    // toggle: same emoji removes it
    if (mine[combatantId] === emoji) delete mine[combatantId]
    else mine[combatantId] = emoji
    playerReactions[playerId] = mine
    rd.playerReactions = playerReactions
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

  async function confirmWinner(combatantId) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    const winner = rd.combatants.find(c => c.id === combatantId)
    if (!winner) return
    rd.winner = winner
    rd.picks = { ...(rd.picks || {}), [playerId]: combatantId }
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const combatants = JSON.parse(JSON.stringify(r.combatants))
    Object.keys(combatants).forEach(pid => {
      combatants[pid] = combatants[pid].map(c => {
        if (!rd.combatants.find(rc => rc.id === c.id)) return c
        const isWin = winner.id === c.id
        return { ...c, wins: c.wins + (isWin ? 1 : 0), losses: c.losses + (isWin ? 0 : 1), battles: [...(c.battles || []), { roundId: rd.id, opponent: rd.combatants.filter(rc => rc.id !== c.id).map(rc => rc.name).join(', '), result: isWin ? 'win' : 'loss' }] }
      })
    })
    const updated = { ...r, rounds, combatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setRoom(updated); onResult()
    // Sync stats to global combatants table (non-blocking)
    ;(async () => {
      for (const c of rd.combatants) {
        const isWin = winner.id === c.id
        const pr = rd.playerReactions || {}
        const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
        const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
        const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length
        await incrementCombatantStats(c.id, { wins: isWin ? 1 : 0, losses: isWin ? 0 : 1, heart, angry, cry })
      }
    })()
  }

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
      winner: rd.winner?.id === c.id ? { ...rd.winner, name: newName } : rd.winner
    }))
    const updated = { ...r, combatants, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setEditingId(null); setSaving(false)
  }

  if (!round) return null
  const myPick = round.picks?.[playerId]
  const picks = round.picks || {}
  const realPlayers = room.players.filter(p => !p.isBot)
  const pickerNames = cid => realPlayers.filter(p => picks[p.id] === cid).map(p => p.name)

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 0.25rem', color: 'var(--color-text-primary)' }}>Round {round.number}</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.5rem' }}>
        {isHost ? 'Pick the winner, then confirm to lock it in.' : 'Tap your pick — the host will confirm the final call.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
        {round.combatants.map(c => {
          const owner = room.players.find(p => p.id === c.ownerId)
          const isPicked = myPick === c.id
          const pickers = pickerNames(c.id)
          const canEdit = playerId === c.ownerId || playerId === room.host
          const isEditing = editingId === c.id

          return (
            <div key={c.id} style={{ background: isPicked ? 'var(--color-background-info)' : 'var(--color-background-secondary)', border: isPicked ? '2px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', transition: 'border 0.15s' }}>
              <div onClick={() => !isEditing && castPick(c.id)} style={{ padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                    {owner?.isBot && <Pill>bot</Pill>}
                    {canEdit && <button onClick={e => { e.stopPropagation(); isEditing ? setEditingId(null) : startEdit(c) }} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 99, cursor: 'pointer' }}>{isEditing ? 'cancel' : 'edit'}</button>}
                  </div>
                </div>
                {!isEditing && c.bio && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{c.bio}</div>}
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>by {owner?.name}</div>
              </div>

              {isEditing && (
                <div style={{ padding: '0 16px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <input style={{ ...inp(), margin: '10px 0 8px', fontSize: 14 }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                  <textarea style={{ ...inp(), margin: 0, resize: 'none', height: 64, fontSize: 13, width: '100%' }} value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio (optional)" />
                  <button onClick={() => saveEdit(c)} disabled={saving} style={{ ...btn('primary'), marginTop: 8, padding: '8px', fontSize: 13 }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              )}

              {pickers.length > 0 && (
                <div style={{ padding: '6px 16px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {pickers.map(name => (
                    <span key={name} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)' }}>{name}</span>
                  ))}
                </div>
              )}

              {/* Reactions */}
              {(() => {
                const pr = round.playerReactions || {}
                const myReaction = (pr[playerId] || {})[c.id]
                const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
                const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
                const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length
                return (
                  <div onClick={e => e.stopPropagation()} style={{ padding: '6px 12px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 6 }}>
                    {[['heart','❤️',heart],['angry','😡',angry],['cry','😂',cry]].map(([key,icon,count]) => (
                      <button key={key} onClick={() => castReaction(c.id, key)} style={{ background: myReaction === key ? 'var(--color-background-info)' : 'var(--color-background-tertiary)', border: myReaction === key ? '1px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 99, padding: '3px 9px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {icon}{count > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{count}</span>}
                      </button>
                    ))}
                  </div>
                )
              })()}

              {isHost && isPicked && (
                <div style={{ padding: '0 16px 14px' }}>
                  <button onClick={() => confirmWinner(c.id)} style={{ ...btn('primary'), padding: '10px', fontSize: 14 }}>
                    Confirm {c.name} wins ✓
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isHost && myPick && <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>Pick registered — waiting for host to confirm.</p>}
      {isHost && !myPick && <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Tap a combatant to select, then confirm to finalise.</p>}
    </div>
  )
}

// ─── History ──────────────────────────────────────────────────────────────────
// ─── History: room list ───────────────────────────────────────────────────────
function HistoryScreen({ activeRoom, onBack, setViewCombatant }) {
  const [rooms, setRooms] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    slist().then(all => {
      const valid = all.filter(r => r && r.id && r.createdAt).sort((a, b) => b.createdAt - a.createdAt)
      setRooms(valid)
    })
  }, [])

  if (selected) {
    return <HistoryRoomDetail room={selected} onBack={() => setSelected(null)} setViewCombatant={setViewCombatant} />
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Back</button>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--color-text-primary)' }}>Battle history</h2>
      </div>

      {rooms === null && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {rooms !== null && rooms.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No games found. Play a session first!</p>
      )}
      {rooms !== null && rooms.map(r => {
        const completedRounds = (r.rounds || []).filter(rd => rd.winner)
        const players = (r.players || []).filter(p => !p.isBot).map(p => p.name)
        const dateStr = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        return (
          <button key={r.id} onClick={() => setSelected(r)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: 1 }}>{r.code}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{dateStr}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {players.join(', ') || 'Unknown players'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{completedRounds.length} round{completedRounds.length !== 1 ? 's' : ''} played</span>
              {r.devMode && <span style={{ fontSize: 11, padding: '1px 6px', background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', borderRadius: 99, border: '0.5px solid var(--color-border-warning)' }}>dev</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── History: room detail ─────────────────────────────────────────────────────
function HistoryRoomDetail({ room, onBack, setViewCombatant }) {
  const completedRounds = (room.rounds || []).filter(r => r.winner)
  const allRounds = room.rounds || []
  const players = (room.players || []).filter(p => !p.isBot)
  const allCombatants = Object.values(room.combatants || {}).flat().filter(c => !c.isBot)
  const dateStr = new Date(room.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13 }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>Room {room.code}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>{dateStr} · {players.map(p => p.name).join(', ')}</p>
        </div>
      </div>

      {/* Winners summary */}
      {completedRounds.length > 0 && (
        <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {completedRounds.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 56 }}>Round {r.number}</span>
                <span style={{ fontSize: 14, color: 'var(--color-text-success)', fontWeight: 500 }}>🏆 {r.winner.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                  by {(room.players || []).find(p => p.id === r.winner.ownerId)?.name || r.winner.ownerName || '?'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Round breakdown */}
      <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>All rounds</h3>
      {allRounds.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: '1.5rem' }}>No rounds were played.</p>}
      {allRounds.map(r => (
        <div key={r.id} style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', marginBottom: 10, border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>Round {r.number}</span>
            {r.winner
              ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-success)' }}>🏆 {r.winner.name}</span>
              : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>no result</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(r.combatants || []).map(c => {
              const owner = (room.players || []).find(p => p.id === c.ownerId)
              const isWinner = r.winner?.id === c.id
              return (
                <div key={c.id} style={{ padding: '10px 12px', background: isWinner ? 'var(--color-background-success)' : 'var(--color-background-tertiary)', borderRadius: 'var(--border-radius-md)', border: isWinner ? '0.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: isWinner ? 'var(--color-text-success)' : 'var(--color-text-primary)', marginBottom: c.bio ? 3 : 0 }}>
                      {isWinner && '🏆 '}{c.name}
                    </div>
                    <span style={{ fontSize: 11, color: isWinner ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 8 }}>
                      {owner?.name || c.ownerName || '?'}
                    </span>
                  </div>
                  {c.bio && <div style={{ fontSize: 12, color: isWinner ? 'var(--color-text-success)' : 'var(--color-text-secondary)', lineHeight: 1.4 }}>{c.bio}</div>}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Roster */}
      {allCombatants.length > 0 && <>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '1rem 0 12px' }}>Combatant roster</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allCombatants.sort((a, b) => b.wins - a.wins).map(c => {
            const owner = (room.players || []).find(p => p.id === c.ownerId)
            return (
              <button key={c.id} onClick={() => setViewCombatant(c)} style={{ textAlign: 'left', padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.wins}W – {c.losses}L</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>by {owner?.name || c.ownerName}</div>
              </button>
            )
          })}
        </div>
      </>}
    </div>
  )
}

// ─── Combatant detail ─────────────────────────────────────────────────────────
function CombatantScreen({ room, combatant, playerId, onBack }) {
  const [c, setC] = useState(combatant)
  const [editBio, setEditBio] = useState(false)
  const [bio, setBio] = useState(combatant.bio || '')
  const owner = room?.players.find(p => p.id === c.ownerId)
  const canEdit = c.ownerId === playerId || playerId === room?.host

  async function saveBio() {
    if (!room) return
    const updated = { ...room }
    updated.combatants[c.ownerId] = updated.combatants[c.ownerId].map(x => x.id === c.id ? { ...x, bio } : x)
    await sset('room:' + room.id, updated)
    setC({ ...c, bio }); setEditBio(false)
  }

  return (
    <Screen title={c.name} onBack={onBack}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--border-radius-md)', background: owner ? owner.color + '22' : 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚔️</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>{c.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>Created by {owner?.name || 'unknown'}</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
        {[['Wins', c.wins, 'var(--color-text-success)'], ['Losses', c.losses, 'var(--color-text-danger)'], ['Battles', (c.wins || 0) + (c.losses || 0), 'var(--color-text-secondary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: '12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: 0 }}>Bio</h3>
          {canEdit && !editBio && <button onClick={() => setEditBio(true)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
        </div>
        {editBio ? (
          <>
            <textarea style={{ ...inp(), width: '100%', resize: 'none', height: 80 }} value={bio} onChange={e => setBio(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={btn('primary')} onClick={saveBio}>Save</button>
              <button style={btn()} onClick={() => { setBio(c.bio || ''); setEditBio(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <p style={{ color: c.bio ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 14, margin: 0 }}>{c.bio || 'No bio yet.'}</p>
        )}
      </div>
      {(c.battles || []).length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Battle record</h3>
          {c.battles.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', marginBottom: 6, border: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>vs {b.opponent}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: b.result === 'win' ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>{b.result}</span>
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}

// ─── Fighter autocomplete ─────────────────────────────────────────────────────
function FighterAutocomplete({ value, onChange, onSelect, placeholder, playerId }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [recent, setRecent] = useState([])

  useEffect(() => {
    if (playerId) getPlayerRecentCombatants(playerId).then(setRecent)
  }, [playerId])

  useEffect(() => {
    if (!value.trim()) { setResults([]); return }
    const t = setTimeout(() => searchCombatants(value).then(setResults), 280)
    return () => clearTimeout(t)
  }, [value])

  const items = value.trim() ? results : recent
  const showHeader = !value.trim() && items.length > 0

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        style={{ ...inp(), margin: 0, width: '100%' }}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
      />
      {open && items.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', zIndex: 200, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          {showHeader && <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your recent fighters</div>}
          {items.map(f => (
            <button key={f.id} onMouseDown={() => { onSelect(f); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                {f.wins}W – {f.losses}L · {f.owner_name}{f.bio ? ` · ${f.bio.slice(0, 40)}${f.bio.length > 40 ? '…' : ''}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bestiary ─────────────────────────────────────────────────────────────────
const BESTIARY_SORTS = [
  { key: 'wins',            label: 'Wins',   asc: false },
  { key: 'losses',          label: 'Losses', asc: false },
  { key: 'reactions_heart', label: '❤️',     asc: false },
  { key: 'reactions_angry', label: '😡',     asc: false },
  { key: 'reactions_cry',   label: '😂',     asc: false },
  { key: 'name',            label: 'A–Z',    asc: true  },
]
const PAGE_SIZE = 20

function BestiaryScreen({ onBack, onViewCombatant }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('wins')
  const [loading, setLoading] = useState(true)

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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Screen title="Bestiary" onBack={onBack}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '-0.75rem 0 1rem' }}>Every fighter ever entered, across all games.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.25rem' }}>
        {BESTIARY_SORTS.map(s => (
          <button key={s.key} onClick={() => changeSort(s.key)} style={{ ...btn('ghost'), padding: '4px 12px', fontSize: 12, background: sort === s.key ? 'var(--color-background-info)' : 'transparent', color: sort === s.key ? 'var(--color-text-info)' : 'var(--color-text-secondary)', borderColor: sort === s.key ? 'var(--color-border-info)' : 'var(--color-border-tertiary)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>}
      {!loading && items.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No combatants yet — play some games first!</p>}

      {!loading && items.map((c, idx) => (
        <button key={c.id} onClick={() => onViewCombatant(c)}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 8, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 24 }}>#{page * PAGE_SIZE + idx + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>{c.wins}W – {c.losses}L</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 32 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>by {c.owner_name || 'unknown'}</span>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {c.reactions_heart > 0 && <span>❤️ {c.reactions_heart}</span>}
              {c.reactions_angry > 0 && <span>😡 {c.reactions_angry}</span>}
              {c.reactions_cry   > 0 && <span>😂 {c.reactions_cry}</span>}
            </div>
          </div>
          {c.bio && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0 32px', lineHeight: 1.4 }}>{c.bio.length > 90 ? c.bio.slice(0, 90) + '…' : c.bio}</p>}
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

// ─── Global combatant detail ──────────────────────────────────────────────────
function GlobalCombatantDetail({ combatant: init, playerId, playerName, onBack }) {
  const [c, setC] = useState(init)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(init.name)
  const [editBio,  setEditBio]  = useState(init.bio || '')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const canEdit = c.owner_id === playerId
  const totalBattles = (c.wins || 0) + (c.losses || 0)
  const history = c.bio_history || []

  async function saveEdit() {
    if (!editName.trim()) return
    setSaving(true)
    const newName = editName.trim()
    const newBio  = editBio.trim()
    // Append current state to history before overwriting
    const entry = { name: c.name, bio: c.bio || '', updatedAt: new Date().toISOString(), updatedBy: playerName || 'unknown' }
    const newHistory = [...history, entry].slice(-20)
    await updateGlobalCombatant(c.id, { name: newName, bio: newBio, bio_history: newHistory })
    setC({ ...c, name: newName, bio: newBio, bio_history: newHistory })
    setSaving(false); setEditMode(false)
  }

  return (
    <Screen title={c.name} onBack={onBack}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚔️</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>{c.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>Created by {c.owner_name || 'unknown'}</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
        {[['Wins', c.wins || 0, 'var(--color-text-success)'], ['Losses', c.losses || 0, 'var(--color-text-danger)'], ['Battles', totalBattles, 'var(--color-text-secondary)']].map(([label, val, color]) => (
          <div key={label} style={{ padding: 12, background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Reactions */}
      {(c.reactions_heart > 0 || c.reactions_angry > 0 || c.reactions_cry > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
          {[['❤️', c.reactions_heart], ['😡', c.reactions_angry], ['😂', c.reactions_cry]].filter(([, n]) => n > 0).map(([icon, count]) => (
            <div key={icon} style={{ padding: '5px 12px', background: 'var(--color-background-secondary)', borderRadius: 99, border: '0.5px solid var(--color-border-tertiary)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {icon} {count}
            </div>
          ))}
        </div>
      )}

      {/* Bio */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)', margin: 0 }}>Bio</h3>
          {canEdit && !editMode && <button onClick={() => setEditMode(true)} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>Edit</button>}
        </div>
        {editMode ? (
          <>
            <label style={lbl}>Name</label>
            <input style={inp()} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
            <label style={lbl}>Bio</label>
            <textarea style={{ ...inp(), width: '100%', resize: 'none', height: 80 }} value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio (optional)" />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={btn('primary')} onClick={saveEdit} disabled={saving || !editName.trim()}>{saving ? 'Saving…' : 'Save'}</button>
              <button style={btn()} onClick={() => { setEditName(c.name); setEditBio(c.bio || ''); setEditMode(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <p style={{ color: c.bio ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 14, margin: 0 }}>{c.bio || 'No bio yet.'}</p>
        )}
      </div>

      {/* Bio history — collapsible */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setHistoryOpen(o => !o)}
            style={{ ...btn('ghost'), width: '100%', textAlign: 'left', fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Bio history ({history.length})</span>
            <span>{historyOpen ? '↑' : '↓'}</span>
          </button>
          {historyOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...history].reverse().map((h, i) => (
                <div key={i} style={{ padding: '10px 12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{h.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{new Date(h.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  {h.bio && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>{h.bio}</p>}
                  <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>by {h.updatedBy}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────
function Screen({ title, onBack, children }) {
  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {onBack && <button onClick={onBack} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 13, marginBottom: '1rem' }}>← Back</button>}
      <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 1.5rem', color: 'var(--color-text-primary)' }}>{title}</h2>
      {children}
    </div>
  )
}

function Avatar({ name, color }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: color + '33', border: '0.5px solid ' + color + '66', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color, flexShrink: 0 }}>
      {initials(name)}
    </div>
  )
}

function Pill({ children }) {
  return <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', borderRadius: 99, border: '0.5px solid var(--color-border-tertiary)' }}>{children}</span>
}

function DevBanner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-warning)' }}>
      🧪 Dev mode — bot votes don't count toward results
    </div>
  )
}

// ─── Style helpers ────────────────────────────────────────────────────────────
function inp(extra) {
  return {
    display: 'block', width: '100%', padding: '10px 12px', fontSize: 15,
    background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)',
    border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)',
    outline: 'none', boxSizing: 'border-box', margin: '4px 0 12px',
    ...extra
  }
}

const lbl = { fontSize: 13, color: 'var(--color-text-secondary)', display: 'block' }

function btn(variant) {
  const base = { display: 'block', width: '100%', padding: '11px 16px', fontSize: 15, fontFamily: 'var(--font-sans)', borderRadius: 'var(--border-radius-md)', cursor: 'pointer', textAlign: 'center', fontWeight: 400, transition: 'opacity 0.15s' }
  if (variant === 'primary') return { ...base, background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', border: 'none' }
  if (variant === 'ghost')   return { ...base, background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-tertiary)', width: 'auto' }
  return { ...base, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-tertiary)' }
}
