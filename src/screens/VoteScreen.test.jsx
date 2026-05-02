import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import VoteScreen from './VoteScreen.jsx'

vi.mock('../supabase.js', () => ({
  sget: vi.fn(),
  sset: vi.fn(),
  incrementCombatantStats: vi.fn(),
  publishCombatants: vi.fn(),
  subscribeToRoom: vi.fn(() => () => {}),
  createVariantCombatant: vi.fn(),
  checkCombatantNameExists: vi.fn(),
  getCombatant: vi.fn(),
  trackRoomPresence: vi.fn(() => () => {}),
}))

vi.mock('../components/AvatarWithHover.jsx', () => ({ default: ({ player }) => <span>{player?.name || 'player'}</span> }))
vi.mock('../components/Pill.jsx', () => ({ default: ({ children }) => <span>{children}</span> }))
vi.mock('../components/DevBanner.jsx', () => ({ default: () => <div>DevBanner</div> }))
vi.mock('../components/RoundChat.jsx', () => ({ default: () => <div>RoundChat</div> }))
vi.mock('../components/EvolutionForm.jsx', () => ({ default: () => <div>EvolutionForm</div> }))
vi.mock('../components/ConnectionStatus.jsx', () => ({ default: () => <div>ConnectionStatus</div> }))
vi.mock('../components/SpectatorList.jsx', () => ({ default: () => <div>SpectatorList</div> }))
vi.mock('../components/CombatantSheet.jsx', () => ({ default: () => <div>CombatantSheet</div> }))

function makeRoom(settings = {}) {
  return {
    id: 'ROOM1',
    code: 'ROOM1',
    host: 'p1',
    phase: 'battle',
    settings,
    players: [
      { id: 'p1', name: 'Host', color: '#111' },
      { id: 'p2', name: 'Guest', color: '#222' },
    ],
    spectators: [],
    combatants: {
      p1: [{ id: 'c1', name: 'Alpha', ownerId: 'p1', ownerName: 'Host', wins: 0 }],
      p2: [{ id: 'c2', name: 'Beta', ownerId: 'p2', ownerName: 'Guest', wins: 0 }],
    },
    rounds: [{
      number: 1,
      combatants: [
        { id: 'c1', name: 'Alpha', ownerId: 'p1', ownerName: 'Host', wins: 0, losses: 0, battles: [] },
        { id: 'c2', name: 'Beta', ownerId: 'p2', ownerName: 'Guest', wins: 0, losses: 0, battles: [] },
      ],
      picks: { p1: 'c1' },
      playerReactions: {},
      chat: [],
    }],
    currentRound: 1,
  }
}

function renderVoteScreen(room) {
  return renderToStaticMarkup(
    <VoteScreen
      room={room}
      playerId="p1"
      setRoom={() => {}}
      onResult={() => {}}
      onViewPlayer={() => {}}
      onHome={() => {}}
      isGuest={false}
      onLogin={() => {}}
    />
  )
}

// Settings-gate smoke tests — intentional exceptions to "UI components don't need tests."
// These don't test rendering behavior; they verify that room settings wire through
// to the correct conditional UI. The gates live in VoteScreen but are driven by
// normalizeRoomSettings defaults, so an end-to-end render is the only way to catch
// a wiring break without mocking half the component.
describe('VoteScreen room setting gates', () => {
  it('shows the Evolve action when allowEvolutions is enabled', () => {
    const html = renderVoteScreen(makeRoom({ allowEvolutions: true }))
    expect(html).toContain('Evolve ⚡')
  })

  it('hides the Evolve action when allowEvolutions is disabled', () => {
    const html = renderVoteScreen(makeRoom({ allowEvolutions: false }))
    expect(html).not.toContain('Evolve ⚡')
  })

  it('shows Declare draw when allowDraws is enabled', () => {
    const html = renderVoteScreen(makeRoom({ allowDraws: true }))
    expect(html).toContain('Declare draw')
  })

  it('hides Declare draw when allowDraws is disabled', () => {
    const html = renderVoteScreen(makeRoom({ allowDraws: false }))
    expect(html).not.toContain('Declare draw')
  })

  // allowMerges gates the draw flow's "All advance" branch at runtime (drawFlow.step === 2),
  // not the initial render. That branching is covered by the resolveAllAdvanceSelection unit tests above.
})
