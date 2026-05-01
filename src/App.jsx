import { useState, useEffect } from 'react'
import { getRoomsByIds, getActiveRoomsForPlayer, sget, sset, getPendingInvitationsForPlayer, updateRoomInvitationStatus, updateSeason } from './supabase.js'
import { uid, makeBots, makeBotCombatants, playerColor, prepareNextGame, replacePlayerIdInRoom } from './gameLogic.js'

// Screens
import HomeScreen from './screens/HomeScreen.jsx'
import MyLobbiesScreen from './screens/MyLobbiesScreen.jsx'
import CreateRoom from './screens/CreateRoom.jsx'
import JoinRoom from './screens/JoinRoom.jsx'
import LobbyScreen from './screens/LobbyScreen.jsx'
import DraftScreen from './screens/DraftScreen.jsx'
import BattleScreen from './screens/BattleScreen.jsx'
import VoteScreen from './screens/VoteScreen.jsx'
import ChroniclesScreen from './screens/ChroniclesScreen.jsx'
import CombatantScreen from './screens/CombatantScreen.jsx'
import AuthScreen from './screens/AuthScreen.jsx'
import AdminScreen from './screens/AdminScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import PlayerProfile from './screens/PlayerProfile.jsx'
import ArchiveScreen from './screens/ArchiveScreen.jsx'
import GlobalCombatantDetail from './screens/GlobalCombatantDetail.jsx'
import ArenaDetailScreen from './screens/ArenaDetailScreen.jsx'
import SpectateScreen from './screens/SpectateScreen.jsx'
import GameSummaryScreen from './screens/GameSummaryScreen.jsx'
import WorkshopScreen from './screens/WorkshopScreen.jsx'
import SuperHostScreen from './screens/SuperHostScreen.jsx'
import SeasonScreen from './screens/SeasonScreen.jsx'
import HelpModal from './components/HelpModal.jsx'

function UserPill({ currentUser, isGuest, effectiveName, onLogout, onLogin }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const label = isGuest ? `${effectiveName || 'guest'} (guest)` : `⚔ ${currentUser.username}`

  return (
    <div style={{ position: 'fixed', top: 12, right: 14, zIndex: 999 }}>
      <div
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99, background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', color: isGuest ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', cursor: 'pointer', userSelect: 'none' }}
      >
        {label}
      </div>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '4px 0', minWidth: 148, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
          {isGuest ? (
            <button onClick={onLogin} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 13, background: 'transparent', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
              Log in / Register
            </button>
          ) : (
            <button onClick={onLogout} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 13, background: 'transparent', border: 'none', color: 'var(--color-text-danger)', cursor: 'pointer' }}>
              Log out
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Read URL params once at module load (before any React rendering)
const _params          = new URLSearchParams(window.location.search)
const _urlJoinCode     = _params.get('join')?.toUpperCase()     || ''
const _urlSpectateCode = _params.get('spectate')?.toUpperCase() || ''
const _urlPid          = _params.get('pid')                     || ''
const _urlCode         = _params.get('code')?.toUpperCase()     || ''
const _urlRoomCode     = _params.get('room')?.toUpperCase()     || ''
if (_urlJoinCode || _urlSpectateCode || _urlPid || _urlCode || _urlRoomCode) window.history.replaceState(null, '', window.location.pathname)

export default function App() {
  const [screen, setScreen] = useState(_urlJoinCode || _urlSpectateCode || _urlCode ? 'join' : 'home')

  // Guest ID — stable across sessions (localStorage). If a host-generated rejoin
  // link includes ?pid=, that value takes priority so the guest reclaims their identity.
  const [guestId] = useState(() => {
    if (_urlPid) {
      localStorage.setItem('eights_pid', _urlPid)
      return _urlPid
    }
    const s = localStorage.getItem('eights_pid') || uid()
    localStorage.setItem('eights_pid', s)
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
      const ACTIVE_PHASES = ['lobby', 'draft', 'battle', 'vote']
      const [rooms, invitations] = await Promise.all([
        getActiveRoomsForPlayer(playerId),
        getPendingInvitationsForPlayer(playerId),
      ])
      saveLobbyCodes(rooms.map(r => r.id))

      let inviteEntries = []
      if (invitations.length) {
        const inviteRooms = await getRoomsByIds(invitations.map(inv => inv.room_id))
        inviteEntries = invitations
          .map(inv => {
            const room = inviteRooms.find(r => r?.id === inv.room_id)
            // Skip if room is gone, ended, or the player already joined
            if (!room || !ACTIVE_PHASES.includes(room.phase)) return null
            if ((room.players || []).some(p => p.id === playerId)) return null
            return { ...room, isInvitation: true, invitation: inv }
          })
          .filter(Boolean)
      }

      setOpenLobbies([...rooms, ...inviteEntries])
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

  useEffect(() => { refreshLobbies() }, [currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [afterAuth, setAfterAuth] = useState(null)
  const [room, setRoom] = useState(null)
  const [viewCombatant, setViewCombatant] = useState(null)
  const [viewChronicles, setViewChronicles] = useState(false)
  const [viewArchive, setViewArchive] = useState(false)
  const [viewGlobalCombatant, setViewGlobalCombatant] = useState(null)
  const [viewArena, setViewArena] = useState(null)
  const [viewPlayers, setViewPlayers] = useState(false)
  const [viewPlayerProfile, setViewPlayerProfile] = useState(null)
  const [viewHelp, setViewHelp] = useState(false)
  const [viewWorkshop, setViewWorkshop] = useState(false)
  const [viewSuperHost, setViewSuperHost] = useState(false)
  const [viewRoomSummary, setViewRoomSummary] = useState(null)
  const [viewSeasons, setViewSeasons] = useState(false)
  // When a season's "Start series" is tapped, store the season here so the created room
  // can carry the seasonId and series_played can increment after the room is created.
  const [pendingSeason, setPendingSeason] = useState(null)

  async function openRoomSummary(roomId) {
    const r = await sget('room:' + roomId)
    if (r) setViewRoomSummary(r)
  }

  // Open a shareable ?room=CODE link directly to the game summary overlay
  useEffect(() => {
    if (!_urlRoomCode) return
    openRoomSummary(_urlRoomCode)
  }, [])

  function login(user) {
    localStorage.setItem('eights_user', JSON.stringify(user))
    setCurrentUser(user)
  }
  function logout() {
    localStorage.removeItem('eights_user')
    setCurrentUser(null)
    goHome()
  }

  // When a guest logs in while inside a game, migrate the room blob so the
  // new account id replaces the guest id everywhere it appears.
  useEffect(() => {
    if (!currentUser || !room) return
    const guestInRoom = (room.players || []).some(p => p.id === guestId)
    if (!guestInRoom || guestId === currentUser.id) return
    ;(async () => {
      const r = await sget('room:' + room.id)
      if (!r) return
      if (!(r.players || []).some(p => p.id === guestId)) return
      const updated = replacePlayerIdInRoom(r, guestId, currentUser.id)
      await sset('room:' + r.id, updated)
      setRoom(updated)
    })()
  }, [currentUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Single entry point for all login flows. Pass an explicit target screen to
  // return to after auth; omit to return to whatever screen is currently active.
  function goAuth(target) {
    setAfterAuth(target ?? screen)
    nav('auth')
  }

  const userPill = <UserPill
    currentUser={currentUser}
    isGuest={isGuest}
    effectiveName={effectiveName}
    onLogout={logout}
    onLogin={() => goAuth('home')}
  />

  async function handleHostNextGame(completedRoom) {
    const roomCode = Math.random().toString(36).slice(2, 6).toUpperCase()
    const { newRoom, updatedCompletedRoom } = prepareNextGame(completedRoom, { newRoomCode: roomCode, hostId: playerId })
    await sset('room:' + roomCode, newRoom)
    await sset('room:' + completedRoom.id, updatedCompletedRoom)
    removeLobbyCode(completedRoom.id)
    addLobbyCode(roomCode)
    setRoom(newRoom)
    nav('draft')
  }

  async function handleEndSeries() {
    if (!room) { goHome(); return }
    // Soft-cancel the empty draft room so it's excluded from active lobbies and history
    await sset('room:' + room.id, { ...room, phase: 'ended', cancelledAt: Date.now() })
    removeLobbyCode(room.id)
    // Clear nextRoomId on the completed room so it's re-openable from history,
    // and ensure it's marked ended so it doesn't reappear in open lobbies
    if (room.prevRoomId) {
      const prev = await sget('room:' + room.prevRoomId)
      if (prev) {
        const { nextRoomId: _removed, ...restored } = prev
        await sset('room:' + prev.id, { ...restored, phase: 'ended' })
      }
    }
    goHome()
  }

  async function handleAcceptInvitation(roomEntry, invitation) {
    const r = await sget('room:' + roomEntry.id)
    if (!r || r.phase !== 'lobby') {
      // Room ended or game already started — decline the stale invite and refresh
      await updateRoomInvitationStatus(invitation.id, 'declined')
      await refreshLobbies()
      return
    }
    const count = (r.players || []).length
    const newPlayer = { id: playerId, name: effectiveName, color: playerColor(count), ready: false, isGuest: false }
    const updated = { ...r, players: [...(r.players || []), newPlayer] }
    await sset('room:' + r.id, updated)
    await updateRoomInvitationStatus(invitation.id, 'accepted')
    addLobbyCode(r.id)
    setRoom(updated)
    setViewLobbies(false)
    nav('lobby')
  }

  async function handleDeclineInvitation(invitation) {
    await updateRoomInvitationStatus(invitation.id, 'declined')
    await refreshLobbies()
  }

  function goHome() { setRoom(null); refreshLobbies(); nav('home') }

  function handleSeasonStartSeries(season) {
    setPendingSeason(season)
    setViewSeasons(false)
    nav('create')
  }

  async function handleSeasonRoomCreated(r) {
    addLobbyCode(r.id)
    setRoom(r)
    if (pendingSeason) {
      try {
        await updateSeason(pendingSeason.id, { series_played: pendingSeason.series_played + 1 })
      } catch (e) {
        console.error('updateSeason series_played failed', e)
      }
      setPendingSeason(null)
    }
    nav('lobby')
  }

  const isSuperHost = !!currentUser?.is_super_host

  let content = null
  if (viewSuperHost)
    content = <SuperHostScreen currentUser={currentUser} onBack={() => setViewSuperHost(false)} />
  else if (viewWorkshop)
    content = <WorkshopScreen currentUser={currentUser} onBack={() => setViewWorkshop(false)} onLogin={() => goAuth('home')} />
  else if (viewLobbies)
    content = <MyLobbiesScreen lobbies={openLobbies} playerId={playerId} onBack={() => { setViewLobbies(false); refreshLobbies() }} onEnter={r => { setRoom(r); setViewLobbies(false); nav(r.phase === 'lobby' ? 'lobby' : r.phase === 'draft' ? 'draft' : r.phase === 'vote' ? 'vote' : 'round') }} onAcceptInvitation={handleAcceptInvitation} onDeclineInvitation={handleDeclineInvitation} />
  else if (viewPlayers && viewPlayerProfile)
    content = <PlayerProfile profileId={viewPlayerProfile} playerId={playerId} onBack={() => setViewPlayerProfile(null)} onViewCombatant={c => setViewGlobalCombatant(c)} onViewRoom={openRoomSummary} />
  else if (viewPlayers)
    content = <PlayersScreen playerId={playerId} onBack={() => setViewPlayers(false)} onViewPlayer={id => setViewPlayerProfile(id)} />
  else if (viewGlobalCombatant)
    content = <GlobalCombatantDetail key={viewGlobalCombatant?.id} combatant={viewGlobalCombatant} playerId={playerId} playerName={effectiveName} isSuperHost={isSuperHost} onBack={() => setViewGlobalCombatant(null)} onViewCombatant={setViewGlobalCombatant} />
  else if (viewArena)
    content = <ArenaDetailScreen key={viewArena?.id} arena={viewArena} playerId={playerId} isSuperHost={isSuperHost} onBack={() => setViewArena(null)} onViewArena={setViewArena} />
  else if (viewArchive)
    content = <ArchiveScreen playerId={playerId} isSuperHost={isSuperHost} onBack={() => setViewArchive(false)} onViewCombatant={c => setViewGlobalCombatant(c)} onViewArena={a => setViewArena(a)} />
  else if (viewSeasons)
    content = <SeasonScreen playerId={playerId} playerName={effectiveName} onBack={() => setViewSeasons(false)} onStartSeries={handleSeasonStartSeries} />
  else if (viewChronicles)
    content = <ChroniclesScreen onBack={() => setViewChronicles(false)} setViewCombatant={c => { setViewCombatant(c); setViewChronicles(false) }} playerId={playerId} onNextGame={r => { setViewChronicles(false); handleHostNextGame(r) }} onSeasons={() => { setViewChronicles(false); setViewSeasons(true) }} />
  else if (viewCombatant)
    content = <CombatantScreen room={room} combatant={viewCombatant} playerId={playerId} onBack={() => setViewCombatant(null)} onViewCombatant={setViewCombatant} />
  else if (screen === 'auth')
    content = <AuthScreen onLogin={u => { login(u); nav(afterAuth || 'home'); setAfterAuth(null) }} onBack={() => { nav(afterAuth || 'home'); setAfterAuth(null) }} />
  else if (screen === 'admin')
    content = <AdminScreen onBack={() => nav('home')} />
  else if (screen === 'home')
    content = <HomeScreen onCreate={() => nav('create')} onJoin={() => nav('join')} onChronicles={() => setViewChronicles(true)} onArchive={() => setViewArchive(true)} onPlayers={() => setViewPlayers(true)} onWorkshop={() => setViewWorkshop(true)} onSuperHost={() => setViewSuperHost(true)} onDev={startDevMode} currentUser={currentUser} onLogin={() => nav('auth')} onLogout={logout} onAdmin={() => nav('admin')} openLobbies={openLobbies} onLobbies={() => setViewLobbies(true)} onHelp={() => setViewHelp(true)} />
  else if (screen === 'create')
    content = <CreateRoom playerId={playerId} playerName={effectiveName} setPlayerName={setPlayerName} lockedName={!isGuest} isGuest={isGuest} onLogin={() => goAuth('create')} onCreated={pendingSeason ? handleSeasonRoomCreated : r => { addLobbyCode(r.id); setRoom(r); nav('lobby') }} onBack={pendingSeason ? () => { setPendingSeason(null); setViewSeasons(true) } : () => nav('home')} seasonId={pendingSeason?.id} />
  else if (screen === 'join')
    content = <JoinRoom playerId={playerId} playerName={effectiveName} setPlayerName={setPlayerName} lockedName={!isGuest} isGuest={isGuest} initialCode={_urlJoinCode || _urlSpectateCode || _urlCode} spectateMode={!!_urlSpectateCode} onJoined={r => { addLobbyCode(r.id); setRoom(r); nav(r.phase === 'draft' ? 'draft' : r.phase === 'battle' ? 'round' : r.phase === 'vote' ? 'vote' : 'lobby') }} onSpectated={r => { setRoom(r); nav('spectate') }} onBack={() => nav('home')} onLogin={() => goAuth('join')} openLobbies={openLobbies} onLobbies={() => setViewLobbies(true)} />
  else if (screen === 'spectate')
    content = <SpectateScreen room={room} playerId={playerId} setRoom={setRoom} onHome={goHome} />
  else if (screen === 'lobby')
    content = <LobbyScreen room={room} playerId={playerId} setRoom={setRoom} isGuest={isGuest} onLogin={() => goAuth('lobby')} onStart={() => nav('draft')} onBack={() => { removeLobbyCode(room?.id); goHome() }} onViewPlayer={setViewPlayerProfile} />
  else if (screen === 'draft')
    content = <DraftScreen room={room} playerId={playerId} setRoom={setRoom} onDone={() => { removeLobbyCode(room?.id); nav('round') }} isGuest={isGuest} onLogin={() => goAuth('draft')} onBack={goHome} onEndSeries={handleEndSeries} />
  else if (screen === 'round')
    content = <BattleScreen room={room} playerId={playerId} setRoom={setRoom} onVote={() => nav('vote')} onChronicles={() => setViewChronicles(true)} onHome={goHome} onNextGame={handleHostNextGame} onRejoinNextGame={r => { addLobbyCode(r.id); setRoom(r); nav('draft') }} />
  else if (screen === 'vote')
    content = <VoteScreen room={room} playerId={playerId} setRoom={setRoom} onResult={() => nav('round')} onViewPlayer={setViewPlayerProfile} onHome={goHome} isGuest={isGuest} onLogin={() => goAuth('vote')} />

  return <>{userPill}{content}{viewHelp && <HelpModal onClose={() => setViewHelp(false)} />}{viewRoomSummary && <GameSummaryScreen room={viewRoomSummary} onClose={() => setViewRoomSummary(null)} />}</>
}
