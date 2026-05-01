import { useState } from 'react'
import Screen from '../components/Screen.jsx'
import { btn, inp, lbl, tab } from '../styles.js'
import { sset, getArenaPickerOptions, getPlaylistPickerOptions } from '../supabase.js'
import { playerColor, buildArenaSnapshot } from '../gameLogic.js'

function SettingRow({ label, description, value, onToggle, indented }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', paddingLeft: indented ? 16 : 0 }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{description}</div>
      </div>
      <button
        onClick={onToggle}
        style={{ flexShrink: 0, marginLeft: 16, width: 40, height: 22, borderRadius: 99, border: 'none', outline: value ? 'none' : '0.5px solid var(--color-border-secondary)', padding: 0, background: value ? 'var(--color-text-info)' : 'var(--color-background-tertiary)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
      >
        <span style={{ position: 'absolute', top: 3, left: value ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
      </button>
    </div>
  )
}

function RosterSizeRow({ value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Roster size</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 1 }}>Combatants each player drafts</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 16 }}>
        <button onClick={() => onChange(Math.max(3, value - 1))} disabled={value <= 3}
          style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 16, cursor: value <= 3 ? 'default' : 'pointer', opacity: value <= 3 ? 0.35 : 1, lineHeight: 1 }}>−</button>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 18, textAlign: 'center' }}>{value}</span>
        <button onClick={() => onChange(Math.min(12, value + 1))} disabled={value >= 12}
          style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 16, cursor: value >= 12 ? 'default' : 'pointer', opacity: value >= 12 ? 0.35 : 1, lineHeight: 1 }}>+</button>
      </div>
    </div>
  )
}

const SETTINGS = [
  ['isPublic',               'Open lobby',              'Anyone can browse and join without an invite code'],
  ['spectatorsAllowed',      'Allow spectators',        'Let others watch without playing'],
  ['anonymousCombatants',    'Anonymous combatants',    'Hide owner names during voting'],
  ['blindVoting',            'Blind voting',            'Hide votes until everyone has picked'],
  ['biosRequired',           'Bios required',           'Players must write a bio for each combatant'],
  ['allowEvolutions',        'Allow evolutions',        'Winners can be evolved into a new form after a round.'],
  ['allowDraws',             'Allow draws',             'Host can declare a round a draw instead of picking a winner.'],
]

const ARENA_MODES = [
  { value: 'none',        label: 'None' },
  { value: 'single',      label: 'Single' },
  { value: 'random-pool', label: 'Random pool' },
  { value: 'playlist',    label: 'Playlist' },
]

const POOL_OPTIONS = [
  { value: 'standard',       label: 'Standard' },
  { value: 'wacky',          label: 'Wacky' },
  { value: 'league',         label: 'League' },
  { value: 'weighted-liked', label: 'Fan favourites' },
]

export default function CreateRoom({ playerId, playerName, setPlayerName, lockedName, isGuest, onLogin, onCreated, onBack, seasonId }) {
  const [name, setName] = useState(playerName)
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({ rosterSize: 8, isPublic: false, spectatorsAllowed: true, anonymousCombatants: false, blindVoting: false, biosRequired: false, allowEvolutions: true, allowDraws: true, allowMerges: true, arenaMode: 'none', arenaConfig: null, arenaEvolutionEnabled: false })

  // Arena picker state for single mode
  const [arenas,       setArenas]       = useState([])
  const [arenaSearch,  setArenaSearch]  = useState('')
  const [arenasLoaded, setArenasLoaded] = useState(false)

  // Playlist picker state
  const [playlists,       setPlaylists]       = useState([])
  const [playlistSearch,  setPlaylistSearch]  = useState('')
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false)

  function toggle(key) { setSettings(s => ({ ...s, [key]: !s[key] })) }

  function selectArenaMode(mode) {
    setSettings(s => ({ ...s, arenaMode: mode, arenaConfig: null }))
    setArenaSearch('')
    setPlaylistSearch('')
    if (mode === 'single' && !arenasLoaded) {
      getArenaPickerOptions(playerId).then(data => { setArenas(data); setArenasLoaded(true) })
    }
    if (mode === 'random-pool') {
      setSettings(s => ({ ...s, arenaMode: mode, arenaConfig: { pool: 'standard', excludeSeries: false } }))
    }
    if (mode === 'playlist' && !playlistsLoaded) {
      getPlaylistPickerOptions(playerId).then(data => { setPlaylists(data); setPlaylistsLoaded(true) })
    }
  }

  function pickPlaylist(playlist) {
    setSettings(s => ({ ...s, arenaConfig: { playlistId: playlist.id, playlistName: playlist.name } }))
  }

  function clearPlaylistSelection() {
    setSettings(s => ({ ...s, arenaConfig: null }))
  }

  function pickArena(arena) {
    setSettings(s => ({ ...s, arenaConfig: { arenaId: arena.id, arenaSnapshot: buildArenaSnapshot(arena) } }))
  }

  function clearArenaSelection() {
    setSettings(s => ({ ...s, arenaConfig: null }))
  }

  function setPool(pool) {
    setSettings(s => ({ ...s, arenaConfig: { ...(s.arenaConfig || {}), pool } }))
  }

  function toggleExcludeSeries() {
    setSettings(s => ({ ...s, arenaConfig: { ...(s.arenaConfig || {}), excludeSeries: !(s.arenaConfig?.excludeSeries) } }))
  }

  async function create() {
    if (!name.trim()) return
    setLoading(true)
    const roomCode = Math.random().toString(36).slice(2, 6).toUpperCase()
    const room = {
      id: roomCode, code: roomCode, host: playerId, phase: 'lobby',
      players: [{ id: playerId, name: name.trim(), color: playerColor(0), ready: false, isGuest }],
      combatants: {}, rounds: [], currentRound: 0, createdAt: Date.now(),
      settings,
      ...(seasonId ? { seasonId } : {}),
    }
    await sset('room:' + roomCode, room)
    sessionStorage.setItem('eights_pname', name.trim())
    setPlayerName(name.trim())
    setLoading(false)
    onCreated(room)
  }

  const filteredArenas = arenaSearch.trim()
    ? arenas.filter(a => a.name.toLowerCase().includes(arenaSearch.trim().toLowerCase()) || (a.bio || '').toLowerCase().includes(arenaSearch.trim().toLowerCase()))
    : arenas

  const filteredPlaylists = playlistSearch.trim()
    ? playlists.filter(p => p.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()))
    : playlists

  const selectedArenaSnapshot = settings.arenaConfig?.arenaSnapshot || null
  const selectedPlaylist = settings.arenaConfig?.playlistId ? { id: settings.arenaConfig.playlistId, name: settings.arenaConfig.playlistName } : null

  return (
    <Screen title="New room" onBack={onBack}>
      <label style={lbl}>Your name</label>
      <input style={{ ...inp(), opacity: lockedName ? 0.65 : 1 }} value={name} onChange={e => { if (!lockedName) setName(e.target.value) }} placeholder="Enter your name" onKeyDown={e => e.key === 'Enter' && create()} autoFocus={!lockedName} readOnly={lockedName} />
      {lockedName && <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '-8px 0 8px' }}>Logged in — name set by account.</p>}

      {isGuest && (
        <p style={{ fontSize: 12, color: 'var(--color-text-warning)', margin: '-8px 0 8px' }}>
          You're creating as a guest. If you disappear, the game has no host — nobody moves forward.{' '}
          <button onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-warning)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Log in first →</button>
        </p>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1.5rem 0 0' }}>Settings</h3>
      <div style={{ marginBottom: '1.5rem' }}>
        <RosterSizeRow value={settings.rosterSize} onChange={v => setSettings(s => ({ ...s, rosterSize: v }))} />
        {SETTINGS.map(([key, label, desc]) => (
          <div key={key}>
            <SettingRow label={label} description={desc} value={settings[key]} onToggle={() => toggle(key)} />
            {key === 'allowEvolutions' && !settings.allowEvolutions && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '2px 0 6px', marginTop: -4 }}>
                Winners carry forward unchanged in a series.
              </div>
            )}
            {key === 'allowDraws' && settings.allowDraws && (
              <SettingRow
                label="Allow merges"
                description="Combatants that draw can merge into a new combined form."
                value={settings.allowMerges}
                onToggle={() => toggle('allowMerges')}
                indented
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Arena ───────────────────────────────────────────────────────── */}
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Arena</h3>
      <div style={{ marginBottom: '1.5rem' }}>
        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {ARENA_MODES.map(({ value, label, disabled }) => (
            <button
              key={value}
              onClick={() => !disabled && selectArenaMode(value)}
              disabled={disabled}
              style={{
                ...tab(settings.arenaMode === value),
                flex: 1,
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 12,
              }}
              title={disabled ? 'Coming soon' : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Arena evolution — available for any non-none mode */}
        {settings.arenaMode !== 'none' && (
          <SettingRow
            label="Arena evolution"
            description="Host can evolve the arena after any round"
            value={settings.arenaEvolutionEnabled}
            onToggle={() => toggle('arenaEvolutionEnabled')}
          />
        )}

        {/* Single mode: arena search + select */}
        {settings.arenaMode === 'single' && (
          <div>
            {selectedArenaSnapshot ? (
              <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedArenaSnapshot.name}</div>
                    {selectedArenaSnapshot.description && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {selectedArenaSnapshot.description}
                      </p>
                    )}
                    {selectedArenaSnapshot.houseRules && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0', fontStyle: 'italic' }}>
                        Rules: {selectedArenaSnapshot.houseRules.length > 60 ? selectedArenaSnapshot.houseRules.slice(0, 60) + '…' : selectedArenaSnapshot.houseRules}
                      </p>
                    )}
                  </div>
                  <button onClick={clearArenaSelection} style={{ ...btn('ghost'), padding: '3px 10px', fontSize: 12, flexShrink: 0 }}>Change</button>
                </div>
              </div>
            ) : (
              <>
                <input
                  style={{ ...inp(), margin: '0 0 6px', fontSize: 14 }}
                  value={arenaSearch}
                  onChange={e => setArenaSearch(e.target.value)}
                  placeholder="Search arenas…"
                  autoFocus
                />
                {!arenasLoaded ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
                ) : filteredArenas.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
                    {arenas.length === 0 ? 'No arenas yet — create one in The Workshop first.' : 'No arenas match your search.'}
                  </p>
                ) : (
                  <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                    {filteredArenas.map((arena, i) => (
                      <button
                        key={arena.id}
                        onClick={() => pickArena(arena)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: i % 2 === 0 ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{arena.name}</span>
                          {arena.status === 'stashed' && (
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>stashed</span>
                          )}
                        </div>
                        {arena.bio && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                            {arena.bio}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Random pool mode: pool selector + series exclusion */}
        {settings.arenaMode === 'random-pool' && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Pool</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {POOL_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setPool(value)}
                  style={{ ...tab(settings.arenaConfig?.pool === value), fontSize: 12 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <SettingRow
              label="Exclude series arenas"
              description="Skip arenas already played in the current series"
              value={settings.arenaConfig?.excludeSeries || false}
              onToggle={toggleExcludeSeries}
            />
          </div>
        )}

        {/* Playlist mode: playlist search + select */}
        {settings.arenaMode === 'playlist' && (
          <div>
            {selectedPlaylist ? (
              <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedPlaylist.name}</div>
                  </div>
                  <button onClick={clearPlaylistSelection} style={{ ...btn('ghost'), padding: '3px 10px', fontSize: 12, flexShrink: 0 }}>Change</button>
                </div>
              </div>
            ) : (
              <>
                <input
                  style={{ ...inp(), margin: '0 0 6px', fontSize: 14 }}
                  value={playlistSearch}
                  onChange={e => setPlaylistSearch(e.target.value)}
                  placeholder="Search playlists…"
                  autoFocus
                />
                {!playlistsLoaded ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>Loading…</p>
                ) : filteredPlaylists.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
                    {playlists.length === 0 ? 'No playlists yet — create one in The Workshop first.' : 'No playlists match your search.'}
                  </p>
                ) : (
                  <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                    {filteredPlaylists.map((playlist, i) => (
                      <button
                        key={playlist.id}
                        onClick={() => pickPlaylist(playlist)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: i % 2 === 0 ? 'var(--color-background-secondary)' : 'var(--color-background-primary)', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{playlist.name}</span>
                          {playlist.status === 'stashed' && (
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-tertiary)' }}>stashed</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <button style={btn('primary')} onClick={create} disabled={!name.trim() || loading}>{loading ? 'Creating…' : 'Create room'}</button>
    </Screen>
  )
}
