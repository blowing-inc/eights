import { useState, useEffect } from 'react'
import { getRoomsByIds, getActiveRoomsForPlayer, sset } from './supabase.js'
import { uid, makeBots, makeBotCombatants, playerColor, prepareNextBattle } from './gameLogic.js'

// Screens
import HomeScreen from './screens/HomeScreen.jsx'
import MyLobbiesScreen from './screens/MyLobbiesScreen.jsx'
import CreateRoom from './screens/CreateRoom.jsx'
import JoinRoom from './screens/JoinRoom.jsx'
import LobbyScreen from './screens/LobbyScreen.jsx'
import DraftScreen from './screens/DraftScreen.jsx'
import BattleScreen from './screens/BattleScreen.jsx'
import VoteScreen from './screens/VoteScreen.jsx'
import HistoryScreen from './screens/HistoryScreen.jsx'
import CombatantScreen from './screens/CombatantScreen.jsx'
import AuthScreen from './screens/AuthScreen.jsx'
import AdminScreen from './screens/AdminScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import PlayerProfile from './screens/PlayerProfile.jsx'
import BestiaryScreen from './screens/BestiaryScreen.jsx'
import GlobalCombatantDetail from './screens/GlobalCombatantDetail.jsx'
import SpectateScreen from './screens/SpectateScreen.jsx'

// Read ?join= / ?spectate= from the URL once at module load (before any React rendering)
const _params        = new URLSearchParams(window.location.search)
const _urlJoinCode   = _params.get('join')?.toUpperCase()     || ''
const _urlSpectateCode = _params.get('spectate')?.toUpperCase() || ''
if (_urlJoinCode || _urlSpectateCode) window.history.replaceState(null, '', window.location.pathname)

export default function App() {
  const [screen, setScreen] = useState(_urlJoinCode || _urlSpectateCode ? 'join' : 'home')

  // Guest ID — stable for the browser session
  const [guestId] = useState(() => {
    const s = sessionStorage.getItem('eights_pid') || uid()
    sessionStorage.setItem('eights_pid', s)
    return s
  })

  // Logged-in user persists via localStorage until explicit logout
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eights_user') || 'null') } catch { return null }
  })
  const playerId    = currentUser?.id   || guestId
  const isGuest     = !currentUser
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('eights_pname') || '')
  const effectiveName = currentUser?.username || playerName

  // ── Persistent lobby tracking ──────────────────────────────────────────────
  function loadLobbyCodes() {
    try { return JSON.parse(localStorage.getItem('eights_lobbies') || '[]') } catch { return [] }
  }
  function saveLobbyCodes(codes) {
    localStorage.setItem('eights_lobbies', JSON.stringify([...new Set(codes)]))
  }
  function addLobbyCode(code) { saveLobbyCodes([...loadLobbyCodes(), code]) }
  function removeLobbyCode(code) { saveLobbyCodes(loadLobbyCodes().filter(c => c !== code)) }

  const [openLobbies, setOpenLobbies] = useState([])
  const [viewLobbies, setViewLobbies] = useState(false)

  async function refreshLobbies() {
    if (currentUser) {
      const rooms = await getActiveRoomsForPlayer(playerId)
      setOpenLobbies(rooms)
      saveLobbyCodes(rooms.map(r => r.id))
    } else {
      const codes = loadLobbyCodes()
      if (!codes.length) { setOpenLobbies([]); return }
      const rooms = await getRoomsByIds(codes)
      const ACTIVE_PHASES = ['lobby', 'draft', 'battle', 'vote']
      const active = rooms.filter(r =>
        r && !r.nextRoomId && ACTIVE_PHASES.includes(r.phase) && (r.players || []).some(p => p.id === playerId)
      )
      saveLobbyCodes(active.map(r => r.id))
      setOpenLobbies(active)
    }
  }

  useEffect(() => { refreshLobbies() }, [currentUser?.id])

  const [afterAuth, setAfterAuth] = useState(null)
  const [room, setRoom] = useState(null)
  const [viewCombatant, setViewCombatant] = useState(null)
  const [viewHistory, setViewHistory] = useState(false)
  const [viewBestiary, setViewBestiary] = useState(false)
  const [viewGlobalCombatant, setViewGlobalCombatant] = useState(null)
  const [viewPlayers, setViewPlayers] = useState(false)
  const [viewPlayerProfile, setViewPlayerProfile] = useState(null)

  function login(user) {
    localStorage.setItem('eights_user', JSON.stringify(user))
    setCurrentUser(user)
  }
  function logout() {
    localStorage.removeItem('eights_user')
    setCurrentUser(null)
  }

  const nav = s => setScreen(s)

  async function startDevMode() {
    const roomCode = 'DEV' + Math.random().toString(36).slice(2, 5).toUpperCase()
    const myName = effectiveName || 'You'
    const bots = makeBots(2)
    const me = { id: playerId, name: myName, color: playerColor(0), ready: false }
    const allPlayers = [me, ...bots]
    const combatants = {}
    bots.forEach((b, i) => { combatants[b.id] = makeBotCombatants(i, b.id, b.name, { rosterSize: 8 }) })
    const newRoom = {
      id: roomCode, code: roomCode, host: playerId,
      phase: 'draft', devMode: true,
      players: allPlayers, combatants,
      rounds: [], currentRound: 0, createdAt: Date.now(),
      settings: { rosterSize: 8 },
    }
    await sset('room:' + roomCode, newRoom)
    sessionStorage.setItem('eights_pname', myName)
    setPlayerName(myName)
    setRoom(newRoom)
    nav('draft')
  }

  const userPill = (
    <div style={{ position: 'fixed', top: 12, right: 14, zIndex: 999, fontSize: 12, padding: '4px 10px', borderRadius: 99, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', color: isGuest ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', pointerEvents: 'none', userSelect: 'none' }}>
      {isGuest ? `${effectiveName || 'guest'} (guest)` : `⚔ ${currentUser.username}`}
    </div>
  )

  async function handleHostNextBattle(completedRoom) {
    const roomCode = Math.random().toString(36).slice(2, 6).toUpperCase()
    const { newRoom, updatedCompletedRoom } = prepareNextBattle(completedRoom, { newRoomCode: roomCode, hostId: playerId })
    await sset('room:' + roomCode, newRoom)
    await sset('room:' + completedRoom.id, updatedCompletedRoom)
    removeLobbyCode(completedRoom.id)
    addLobbyCode(roomCode)
    setRoom(newRoom)
    nav('draft')
  }

  function goHome() { setRoom(null); refreshLobbies(); nav('home') }

  let content = null
  if (viewLobbies)
    content = <MyLobbiesScreen lobbies={openLobbies} playerId={playerId} onBack={() => { setViewLobbies(false); refreshLobbies() }} onEnter={r => { setRoom(r); setViewLobbies(false); nav(r.phase === 'lobby' ? 'lobby' : r.phase === 'draft' ? 'draft' : r.phase === 'vote' ? 'vote' : 'battle') }} />
  else if (viewPlayers && viewPlayerProfile)
    content = <PlayerProfile profileId={viewPlayerProfile} playerId={playerId} onBack={() => setViewPlayerProfile(null)} onViewCombatant={c => setViewGlobalCombatant(c)} />
  else if (viewPlayers)
    content = <PlayersScreen playerId={playerId} onBack={() => setViewPlayers(false)} onViewPlayer={id => setViewPlayerProfile(id)} />
  else if (viewGlobalCombatant)
    content = <GlobalCombatantDetail combatant={viewGlobalCombatant} playerId={playerId} playerName={effectiveName} onBack={() => setViewGlobalCombatant(null)} />
  else if (viewBestiary)
    content = <BestiaryScreen playerId={playerId} onBack={() => setViewBestiary(false)} onViewCombatant={c => { setViewGlobalCombatant(c); setViewBestiary(false) }} />
  else if (viewHistory)
    content = <HistoryScreen onBack={() => setViewHistory(false)} setViewCombatant={c => { setViewCombatant(c); setViewHistory(false) }} />
  else if (viewCombatant)
    content = <CombatantScreen room={room} combatant={viewCombatant} playerId={playerId} onBack={() => setViewCombatant(null)} onViewCombatant={setViewCombatant} />
  else if (screen === 'auth')
    content = <AuthScreen onLogin={u => { login(u); nav(afterAuth || 'home'); setAfterAuth(null) }} onBack={() => { nav(afterAuth || 'home'); setAfterAuth(null) }} />
  else if (screen === 'admin')
    content = <AdminScreen onBack={() => nav('home')} />
  else if (screen === 'home')
    content = <HomeScreen onCreate={() => nav('create')} onJoin={() => nav('join')} onHistory={() => setViewHistory(true)} onBestiary={() => setViewBestiary(true)} onPlayers={() => setViewPlayers(true)} onDev={startDevMode} currentUser={currentUser} onLogin={() => nav('auth')} onLogout={logout} onAdmin={() => nav('admin')} openLobbies={openLobbies} onLobbies={() => setViewLobbies(true)} />
  else if (screen === 'create')
    content = <CreateRoom playerId={playerId} playerName={effectiveName} setPlayerName={setPlayerName} lockedName={!isGuest} onCreated={r => { addLobbyCode(r.id); setRoom(r); nav('lobby') }} onBack={() => nav('home')} />
  else if (screen === 'join')
    content = <JoinRoom playerId={playerId} playerName={effectiveName} setPlayerName={setPlayerName} lockedName={!isGuest} initialCode={_urlJoinCode || _urlSpectateCode} spectateMode={!!_urlSpectateCode} onJoined={r => { addLobbyCode(r.id); setRoom(r); nav(r.phase === 'draft' ? 'draft' : r.phase === 'battle' ? 'battle' : r.phase === 'vote' ? 'vote' : 'lobby') }} onSpectated={r => { setRoom(r); nav('spectate') }} onBack={() => nav('home')} onLogin={() => { setAfterAuth('join'); nav('auth') }} />
  else if (screen === 'spectate')
    content = <SpectateScreen room={room} playerId={playerId} setRoom={setRoom} onHome={goHome} />
  else if (screen === 'lobby')
    content = <LobbyScreen room={room} playerId={playerId} setRoom={setRoom} onStart={() => nav('draft')} onBack={() => { removeLobbyCode(room?.id); goHome() }} onViewPlayer={setViewPlayerProfile} />
  else if (screen === 'draft')
    content = <DraftScreen room={room} playerId={playerId} setRoom={setRoom} onDone={() => { removeLobbyCode(room?.id); nav('battle') }} isGuest={isGuest} onBack={goHome} />
  else if (screen === 'battle')
    content = <BattleScreen room={room} playerId={playerId} setRoom={setRoom} onVote={() => nav('vote')} onHistory={() => setViewHistory(true)} onHome={goHome} onNextBattle={handleHostNextBattle} onRejoinNextBattle={r => { addLobbyCode(r.id); setRoom(r); nav('draft') }} />
  else if (screen === 'vote')
    content = <VoteScreen room={room} playerId={playerId} setRoom={setRoom} onResult={() => nav('battle')} onViewPlayer={setViewPlayerProfile} />

  return <>{userPill}{content}</>
}
