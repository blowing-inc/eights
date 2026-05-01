import { useState, useEffect, useRef } from 'react'
import Screen from '../components/Screen.jsx'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import ShareLinkButton from '../components/ShareLinkButton.jsx'
import SpectatorList from '../components/SpectatorList.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import TagInput from '../components/TagInput.jsx'
import { btn, inp } from '../styles.js'
import { sset, subscribeToRoom, trackRoomPresence, searchUsers, createRoomInvitation, deleteRoomInvitation, getRoomInvitations, getSeason } from '../supabase.js'
import { normalizeRoomSettings, resolveTone, kickPlayerFromRoom } from '../gameLogic.js'

function ToneSection({ isHost, toneEnabled, toneTags, tonePremise, seasonTone, onToggle, onTagsChange, onPremiseChange }) {
  const inheritedLabel = seasonTone && !toneEnabled
    ? <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>inherited from season</span>
    : null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: toneEnabled ? 10 : 0 }}>
        <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: 0 }}>
          Tone {inheritedLabel}
        </h3>
        {isHost && (
          <button
            onClick={onToggle}
            style={{ flexShrink: 0, marginLeft: 16, width: 40, height: 22, borderRadius: 99, border: 'none', outline: toneEnabled ? 'none' : '0.5px solid var(--color-border-secondary)', padding: 0, background: toneEnabled ? 'var(--color-text-info)' : 'var(--color-background-tertiary)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
          >
            <span style={{ position: 'absolute', top: 3, left: toneEnabled ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
          </button>
        )}
      </div>
      {toneEnabled && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isHost ? (
            <>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>Tags (2–3)</div>
                <TagInput value={toneTags} onChange={onTagsChange} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>Premise <span style={{ opacity: 0.6 }}>(optional)</span></div>
                <textarea
                  value={tonePremise}
                  onChange={e => onPremiseChange(e.target.value)}
                  placeholder="Set the scene in a sentence or two…"
                  maxLength={280}
                  rows={2}
                  style={{ ...inp(), resize: 'vertical', margin: 0 }}
                />
              </div>
            </>
          ) : (
            <>
              {toneTags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {toneTags.map(t => (
                    <span key={t} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-secondary)' }}>{t}</span>
                  ))}
                </div>
              )}
              {tonePremise && (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{tonePremise}</p>
              )}
            </>
          )}
        </div>
      )}
      {!toneEnabled && seasonTone && !isHost && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: seasonTone.premise ? 6 : 0 }}>
            {(seasonTone.tags || []).map(t => (
              <span key={t} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-secondary)' }}>{t}</span>
            ))}
          </div>
          {seasonTone.premise && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{seasonTone.premise}</p>
          )}
        </div>
      )}
    </div>
  )
}

const POOL_LABELS = {
  'standard':       'Standard',
  'wacky':          'Wacky',
  'league':         'League',
  'weighted-liked': 'Fan favourites',
}

function ArenaModeDisplay({ settings }) {
  const { arenaMode, arenaConfig } = normalizeRoomSettings(settings)

  if (arenaMode === 'none') return null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 8px' }}>Arena</h3>
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
        {arenaMode === 'single' && arenaConfig?.arenaSnapshot && (
          <>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {arenaConfig.arenaSnapshot.name}
            </div>
            {arenaConfig.arenaSnapshot.description && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0' }}>
                {arenaConfig.arenaSnapshot.description}
              </p>
            )}
            {arenaConfig.arenaSnapshot.houseRules && (
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0', fontStyle: 'italic' }}>
                Rules: {arenaConfig.arenaSnapshot.houseRules}
              </p>
            )}
          </>
        )}
        {arenaMode === 'single' && !arenaConfig?.arenaSnapshot && (
          <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Single arena — not yet selected</span>
        )}
        {arenaMode === 'random-pool' && (
          <div>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
              Random · {POOL_LABELS[arenaConfig?.pool] || arenaConfig?.pool || 'Standard'} pool
            </span>
            {arenaConfig?.excludeSeries && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                (series arenas excluded)
              </span>
            )}
          </div>
        )}
        {arenaMode === 'playlist' && (
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            Playlist · {arenaConfig?.playlistName || arenaConfig?.playlistId || 'not configured'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function LobbyScreen({ room: init, playerId, setRoom, isGuest, onLogin, onStart, onBack, onViewPlayer }) {
  const [room, setLocal]           = useState(init)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [presentIds, setPresentIds] = useState([])
  // 'idle' | 'confirming' — guest-host gate before starting the game
  const [guestStartPrompt, setGuestStartPrompt] = useState('idle')
  // playerId being confirmed for kick, or null
  const [confirmKick, setConfirmKick] = useState(null)

  // Tone state — null = off (inherit from season at draft start), object = host-set
  const [season, setSeason]           = useState(null)
  const [toneEnabled, setToneEnabled] = useState(() => !!init.settings?.tone)
  const [toneTags, setToneTags]       = useState(() => init.settings?.tone?.tags || [])
  const [tonePremise, setTonePremise] = useState(() => init.settings?.tone?.premise || '')

  // Pending invitations (host-only view)
  const [pendingInvitees, setPendingInvitees] = useState([])
  const [cancelInviteId, setCancelInviteId] = useState(null)

  // Invite panel state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviteSearching, setInviteSearching] = useState(false)
  const [inviteSending, setInviteSending] = useState(null) // inviteeId being sent
  const inviteInputRef = useRef(null)

  const isHost = room.host === playerId

  useEffect(() => {
    return subscribeToRoom(room.id, r => {
      if (!(r.players || []).some(p => p.id === playerId)) {
        localStorage.setItem('eights_kicked', JSON.stringify({ code: r.code, at: Date.now() }))
        onBack(); return
      }
      setLocal(r); setRoom(r)
      if (r.phase === 'draft') onStart()
      if (r.phase === 'ended') onBack()
    })
  }, [room.id])

  useEffect(() => {
    return trackRoomPresence(room.id, playerId, isHost ? 'host' : 'player', {
      onPresenceChange: setPresentIds,
    })
  }, [room.id])

  // Load season for tone inheritance (if this game belongs to a season)
  useEffect(() => {
    if (!room.seasonId) return
    getSeason(room.seasonId).then(setSeason)
  }, [room.seasonId])

  // Load pending invitees for host; refresh when player count changes (catches accepts)
  useEffect(() => {
    if (!isHost) return
    getRoomInvitations(room.id).then(setPendingInvitees)
  }, [room.players?.length, isHost])

  // Debounced user search for the invite panel
  useEffect(() => {
    if (!inviteOpen) return
    if (!inviteQuery.trim()) { setInviteResults([]); return }
    setInviteSearching(true)
    const t = setTimeout(async () => {
      const { items } = await searchUsers({ query: inviteQuery, pageSize: 8 })
      const joinedIds  = new Set((room.players || []).map(p => p.id))
      const invitedIds = new Set(pendingInvitees.map(p => p.invitee_id))
      setInviteResults(
        items.filter(u => !joinedIds.has(u.id) && !invitedIds.has(u.id) && u.id !== playerId)
      )
      setInviteSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [inviteQuery, inviteOpen, room.players, pendingInvitees])

  // Focus the search input when the panel opens
  useEffect(() => {
    if (inviteOpen) inviteInputRef.current?.focus()
  }, [inviteOpen])

  async function startGame() {
    const gameTone = toneEnabled && toneTags.length > 0
      ? { tags: toneTags, premise: tonePremise.trim() }
      : null
    const gameWithTone = { settings: { ...room.settings, tone: gameTone } }
    const resolved = resolveTone(gameWithTone, season)
    const updated = { ...room, phase: 'draft', tone: resolved }
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); onStart()
  }

  function handleStartClick() {
    if (isGuest) {
      setGuestStartPrompt('confirming')
    } else {
      startGame()
    }
  }

  async function cancelRoom() {
    const updated = { ...room, phase: 'ended', cancelledAt: Date.now() }
    await sset('room:' + room.id, updated)
    onBack()
  }

  async function kickPlayer(kickedId) {
    const { room: updated } = kickPlayerFromRoom(room, kickedId)
    await sset('room:' + room.id, updated)
    setLocal(updated); setRoom(updated); setConfirmKick(null)
  }

  async function sendInvite(user) {
    setInviteSending(user.id)
    const id = await createRoomInvitation(room.id, user.id, user.username, playerId)
    if (id) {
      setPendingInvitees(prev => [...prev, { id, invitee_id: user.id, invitee_name: user.username }])
      setInviteResults(prev => prev.filter(u => u.id !== user.id))
      setInviteQuery('')
    }
    setInviteSending(null)
  }

  async function cancelInvite(invitationId) {
    await deleteRoomInvitation(invitationId)
    setPendingInvitees(prev => prev.filter(p => p.id !== invitationId))
    setCancelInviteId(null)
  }

  function closeInvitePanel() {
    setInviteOpen(false)
    setInviteQuery('')
    setInviteResults([])
  }

  return (
    <Screen title={`Room ${room.code}`} onBack={onBack} right={<SpectatorList spectators={room.spectators} />}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1rem' }}>Share this code with your friends</p>
      <div style={{ textAlign: 'center', fontSize: 52, fontWeight: 500, letterSpacing: 8, color: 'var(--color-text-primary)', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '1.5rem', marginBottom: '0.75rem' }}>{room.code}</div>
      <ShareLinkButton code={room.code} />
      {room.settings?.spectatorsAllowed !== false && <ShareLinkButton code={room.code} spectate style={{ marginTop: -8 }} />}

      <ConnectionStatus players={room.players} presentIds={presentIds} isHost={isHost} roomCode={room.code} />

      <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 400, margin: '0 0 12px' }}>Players ({room.players.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
        {/* Joined players */}
        {room.players.map(p => (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: confirmKick === p.id ? 'var(--border-radius-md) var(--border-radius-md) 0 0' : 'var(--border-radius-md)' }}>
              <AvatarWithHover player={p} onViewProfile={!p.isBot ? onViewPlayer : null} />
              <span style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>{p.name}</span>
              {p.id === room.host && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-tertiary)', padding: '2px 6px', borderRadius: 99 }}>host</span>}
              {isHost && p.id !== room.host && p.id !== confirmKick && (
                <button
                  onClick={() => setConfirmKick(p.id)}
                  style={{ marginLeft: p.id === room.host ? 0 : 'auto', background: 'transparent', border: 'none', fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px 6px' }}
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
        ))}

        {/* Pending invitees (host view) */}
        {isHost && pendingInvitees.map(inv => (
          <div key={inv.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: cancelInviteId === inv.id ? 'var(--border-radius-md) var(--border-radius-md) 0 0' : 'var(--border-radius-md)', opacity: 0.75 }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⏳</span>
              <span style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>{inv.invitee_name}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-tertiary)', padding: '2px 6px', borderRadius: 99 }}>invited</span>
              {cancelInviteId !== inv.id && (
                <button
                  onClick={() => setCancelInviteId(inv.id)}
                  style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px 6px' }}
                  title="Cancel invitation"
                >✕</button>
              )}
              {cancelInviteId === inv.id && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-danger)' }}>Cancel?</span>
              )}
            </div>
            {cancelInviteId === inv.id && (
              <div style={{ display: 'flex', gap: 0, background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderTop: 'none', borderRadius: '0 0 var(--border-radius-md) var(--border-radius-md)', overflow: 'hidden' }}>
                <button onClick={() => cancelInvite(inv.id)} style={{ flex: 1, padding: '8px', background: 'transparent', border: 'none', borderRight: '0.5px solid var(--color-border-danger)', fontSize: 13, color: 'var(--color-text-danger)', cursor: 'pointer' }}>Yes, cancel</button>
                <button onClick={() => setCancelInviteId(null)} style={{ flex: 1, padding: '8px', background: 'transparent', border: 'none', fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>Never mind</button>
              </div>
            )}
          </div>
        ))}

        {/* Invite panel (host only) */}
        {isHost && !inviteOpen && (
          <button
            onClick={() => setInviteOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'transparent', border: '0.5px dashed var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', color: 'var(--color-text-tertiary)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Invite a player
          </button>
        )}
        {isHost && inviteOpen && (
          <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: inviteResults.length > 0 || inviteSearching ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
              <input
                ref={inviteInputRef}
                value={inviteQuery}
                onChange={e => setInviteQuery(e.target.value)}
                placeholder="Search by username…"
                style={{ flex: 1, padding: '10px 14px', background: 'var(--color-background-secondary)', border: 'none', outline: 'none', fontSize: 14, color: 'var(--color-text-primary)' }}
              />
              <button
                onClick={closeInvitePanel}
                style={{ padding: '10px 14px', background: 'transparent', border: 'none', fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            {inviteSearching && (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-tertiary)', background: 'var(--color-background-secondary)' }}>
                Searching…
              </div>
            )}
            {!inviteSearching && inviteQuery.trim() && inviteResults.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-tertiary)', background: 'var(--color-background-secondary)' }}>
                No registered players found
              </div>
            )}
            {inviteResults.map(user => (
              <button
                key={user.id}
                onClick={() => sendInvite(user)}
                disabled={inviteSending === user.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: 'var(--color-background-secondary)', border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 14, color: inviteSending === user.id ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', cursor: inviteSending === user.id ? 'default' : 'pointer', textAlign: 'left' }}
              >
                <span>{user.username}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {inviteSending === user.id ? 'Sending…' : 'Invite'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ToneSection
        isHost={isHost}
        toneEnabled={toneEnabled}
        toneTags={toneTags}
        tonePremise={tonePremise}
        seasonTone={season?.tone ?? null}
        onToggle={() => {
          if (!toneEnabled && season?.tone && toneTags.length === 0) {
            setToneTags(season.tone.tags || [])
            setTonePremise(season.tone.premise || '')
          }
          setToneEnabled(v => !v)
        }}
        onTagsChange={setToneTags}
        onPremiseChange={setTonePremise}
      />

      <ArenaModeDisplay settings={room.settings} />

      {isHost ? (
        <>
          {/* Guest-host confirmation gate */}
          {guestStartPrompt === 'confirming' ? (
            <div style={{ padding: '12px 14px', background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: '0 0 10px' }}>
                You're the host but not logged in. If you disappear, your players will be stuck — the arena waits for its host.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '7px 10px', color: 'var(--color-text-warning)', borderColor: 'var(--color-border-warning)' }}
                  onClick={() => { setGuestStartPrompt('idle'); onLogin?.() }}>
                  Log in first
                </button>
                <button style={{ ...btn('primary'), flex: 1, fontSize: 13, padding: '7px 10px' }}
                  onClick={startGame}>
                  Start anyway →
                </button>
              </div>
            </div>
          ) : (
            <button style={btn('primary')} onClick={handleStartClick} disabled={room.players.length < 2}>Start game →</button>
          )}

          {!confirmCancel
            ? <button style={{ ...btn('ghost'), marginTop: 10, width: '100%', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', fontSize: 13 }} onClick={() => setConfirmCancel(true)}>Cancel room</button>
            : <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-danger)' }}>Remove this room?</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btn('ghost'), fontSize: 13, padding: '4px 12px' }} onClick={() => setConfirmCancel(false)}>Never mind</button>
                  <button style={{ ...btn('ghost'), fontSize: 13, padding: '4px 12px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }} onClick={cancelRoom}>Yes, cancel</button>
                </div>
              </div>
          }
        </>
      ) : <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>Waiting for host to start…</p>}
    </Screen>
  )
}
