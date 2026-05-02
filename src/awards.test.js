import { describe, it, expect } from 'vitest'
import {
  computeSuperlatives,
  getSeriesCombatantNominees,
  getSeriesEvolutionNominees,
  getSeasonCombatantNominees,
  getSeasonEvolutionNominees,
  computeGameAutoAwards,
  computeSeriesAutoAwards,
  computeSeasonAutoAwards,
} from './awards.js'

// ─── computeSuperlatives ─────────────────────────────────────────────────────

describe('computeSuperlatives', () => {
  function makeCombatantStats(overrides = {}) {
    return { wins: 0, losses: 0, draws: 0, mvp_record: [], ...overrides }
  }

  it('returns empty array when combatant has never fought', () => {
    expect(computeSuperlatives(makeCombatantStats(), null)).toEqual([])
  })

  it('returns empty array when combatant has only draws and no wins', () => {
    expect(computeSuperlatives(makeCombatantStats({ draws: 2 }), null)).toEqual([])
  })

  // Helper: extract labels from the { label, tooltip } objects for readability.
  function labels(sup) { return sup.map(s => s.label) }

  it('returns Undefeated when wins > 0 and losses === 0', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 3 }), null)
    expect(labels(sup)).toContain('Undefeated')
  })

  it('Undefeated tooltip includes win count', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 3 }), null)
    const entry = sup.find(s => s.label === 'Undefeated')
    expect(entry.tooltip).toMatch('3W')
  })

  it('Undefeated tooltip includes draw count when draws present', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 2, draws: 1 }), null)
    const entry = sup.find(s => s.label === 'Undefeated')
    expect(entry.tooltip).toMatch('1D')
  })

  it('does not return Undefeated when there is at least one loss', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 3, losses: 1 }), null)
    expect(labels(sup)).not.toContain('Undefeated')
  })

  it('Undefeated is still returned when there are draws alongside wins', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 2, draws: 1 }), null)
    expect(labels(sup)).toContain('Undefeated')
  })

  it('returns win rate when >= 5 rounds and >= 70% wins', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 7, losses: 3 }), null)
    expect(labels(sup)).toContain('70% win rate')
  })

  it('win rate tooltip names the round counts', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 7, losses: 3 }), null)
    const entry = sup.find(s => s.label === '70% win rate')
    expect(entry.tooltip).toMatch('7')
    expect(entry.tooltip).toMatch('10')
  })

  it('does not return win rate when fewer than 5 rounds', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 4, losses: 0 }), null)
    expect(labels(sup).some(l => l.includes('win rate'))).toBe(false)
  })

  it('does not return win rate when below 70% threshold', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 6, losses: 4 }), null)
    expect(labels(sup).some(l => l.includes('win rate'))).toBe(false)
  })

  it('returns MVP once when mvp_record has one entry', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 1, mvp_record: [{ gameCode: 'ABC' }] }), null)
    expect(labels(sup)).toContain('MVP once')
  })

  it('returns MVP N times when mvp_record has multiple entries', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 2, mvp_record: [{}, {}] }), null)
    expect(labels(sup)).toContain('MVP 2 times')
  })

  it('returns Beat N opponents from h2h data', () => {
    const h2h = [
      { opponentName: 'Alpha', wins: 2, losses: 0 },
      { opponentName: 'Beta',  wins: 1, losses: 1 },
      { opponentName: 'Gamma', wins: 0, losses: 2 },
    ]
    const sup = computeSuperlatives(makeCombatantStats({ wins: 3, losses: 3 }), h2h)
    expect(labels(sup)).toContain('Beat 2 opponents')
  })

  it('Beat opponents tooltip includes beaten count and total faced', () => {
    const h2h = [
      { opponentName: 'Alpha', wins: 2, losses: 0 },
      { opponentName: 'Beta',  wins: 1, losses: 1 },
      { opponentName: 'Gamma', wins: 0, losses: 2 },
    ]
    const sup = computeSuperlatives(makeCombatantStats({ wins: 3, losses: 3 }), h2h)
    const entry = sup.find(s => s.label.startsWith('Beat'))
    expect(entry.tooltip).toMatch('2')
    expect(entry.tooltip).toMatch('3')
  })

  it('uses singular "opponent" when exactly one opponent was beaten', () => {
    const h2h = [{ opponentName: 'Alpha', wins: 1, losses: 0 }]
    const sup = computeSuperlatives(makeCombatantStats({ wins: 1 }), h2h)
    expect(labels(sup)).toContain('Beat 1 opponent')
  })

  it('does not include Beat opponents line when h2h is null', () => {
    const sup = computeSuperlatives(makeCombatantStats({ wins: 3, losses: 3 }), null)
    expect(labels(sup).some(l => l.startsWith('Beat'))).toBe(false)
  })

  it('does not include Beat opponents when no opponents were beaten', () => {
    const h2h = [{ opponentName: 'Alpha', wins: 0, losses: 3 }]
    const sup = computeSuperlatives(makeCombatantStats({ wins: 0, losses: 3 }), h2h)
    expect(labels(sup).some(l => l.startsWith('Beat'))).toBe(false)
  })

  it('each entry has both label and tooltip strings', () => {
    const h2h = [{ opponentName: 'Alpha', wins: 2, losses: 1 }]
    const sup = computeSuperlatives(makeCombatantStats({ wins: 2, losses: 1 }), h2h)
    sup.forEach(s => {
      expect(typeof s.label).toBe('string')
      expect(typeof s.tooltip).toBe('string')
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.tooltip.length).toBeGreaterThan(0)
    })
  })
})

// ─── getSeriesCombatantNominees ───────────────────────────────────────────────

describe('getSeriesCombatantNominees', () => {
  it('returns all distinct combatants across all rooms', () => {
    const rooms = [
      { combatants: { p1: [{ id: 'c1', name: 'Fighter1' }], p2: [{ id: 'c2', name: 'Fighter2' }] } },
      { combatants: { p1: [{ id: 'c1', name: 'Fighter1' }], p2: [{ id: 'c3', name: 'Fighter3' }] } },
    ]
    const nominees = getSeriesCombatantNominees(rooms)
    expect(nominees).toHaveLength(3)
    expect(nominees.map(n => n.id).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(nominees.every(n => n.type === 'combatant')).toBe(true)
  })

  it('deduplicates combatants that appear in multiple games', () => {
    const c = { id: 'c1', name: 'Fighter' }
    const rooms = [
      { combatants: { p1: [c] } },
      { combatants: { p1: [c] } },
    ]
    expect(getSeriesCombatantNominees(rooms)).toHaveLength(1)
  })

  it('returns empty for no rooms', () => {
    expect(getSeriesCombatantNominees([])).toEqual([])
  })

  it('returns empty when rooms have no combatants', () => {
    expect(getSeriesCombatantNominees([{ combatants: {} }])).toEqual([])
  })
})

// ─── getSeriesEvolutionNominees ───────────────────────────────────────────────

describe('getSeriesEvolutionNominees', () => {
  const evolRound = {
    evolution: { fromId: 'c1', fromName: 'Fighter', toId: 'v1', toName: 'SuperFighter' },
    combatants: [{ id: 'c1', name: 'Fighter' }, { id: 'c2', name: 'Rival' }],
  }

  it('returns evolution nominees with opponent name in display', () => {
    const nominees = getSeriesEvolutionNominees([{ rounds: [evolRound] }])
    expect(nominees).toHaveLength(1)
    expect(nominees[0].id).toBe('v1')
    expect(nominees[0].type).toBe('combatant')
    expect(nominees[0].name).toContain('SuperFighter')
    expect(nominees[0].name).toContain('Fighter')
    expect(nominees[0].name).toContain('Rival')
  })

  it('deduplicates evolutions that appear across multiple rooms', () => {
    const rooms = [{ rounds: [evolRound] }, { rounds: [evolRound] }]
    expect(getSeriesEvolutionNominees(rooms)).toHaveLength(1)
  })

  it('returns empty when no evolutions occurred', () => {
    const rooms = [{ rounds: [{ winner: { id: 'c1' }, combatants: [{ id: 'c1' }, { id: 'c2' }] }] }]
    expect(getSeriesEvolutionNominees(rooms)).toHaveLength(0)
  })

  it('returns empty for no rooms', () => {
    expect(getSeriesEvolutionNominees([])).toEqual([])
  })

  it('falls back to "?" when opponent cannot be identified', () => {
    const round = {
      evolution: { fromId: 'c1', fromName: 'Fighter', toId: 'v1', toName: 'SuperFighter' },
      combatants: [{ id: 'c1', name: 'Fighter' }],
    }
    const nominees = getSeriesEvolutionNominees([{ rounds: [round] }])
    expect(nominees[0].name).toContain('?')
  })
})

// ─── getSeasonCombatantNominees ───────────────────────────────────────────────

describe('getSeasonCombatantNominees', () => {
  it('returns all distinct combatants across all season rooms', () => {
    const rooms = [
      { combatants: { p1: [{ id: 'c1', name: 'Fighter1' }], p2: [{ id: 'c2', name: 'Fighter2' }] } },
      { combatants: { p1: [{ id: 'c1', name: 'Fighter1' }], p2: [{ id: 'c3', name: 'Fighter3' }] } },
    ]
    const nominees = getSeasonCombatantNominees(rooms)
    expect(nominees).toHaveLength(3)
    expect(nominees.map(n => n.id).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(nominees.every(n => n.type === 'combatant')).toBe(true)
  })

  it('deduplicates combatants across multiple games in the season', () => {
    const c = { id: 'c1', name: 'Fighter' }
    const rooms = [{ combatants: { p1: [c] } }, { combatants: { p1: [c] } }]
    expect(getSeasonCombatantNominees(rooms)).toHaveLength(1)
  })

  it('returns empty for no rooms', () => {
    expect(getSeasonCombatantNominees([])).toEqual([])
  })
})

// ─── getSeasonEvolutionNominees ───────────────────────────────────────────────

describe('getSeasonEvolutionNominees', () => {
  const evolRound = {
    evolution: { fromId: 'c1', fromName: 'Fighter', toId: 'v1', toName: 'SuperFighter' },
    combatants: [{ id: 'c1', name: 'Fighter' }, { id: 'c2', name: 'Rival' }],
  }

  it('returns evolution nominees with opponent name in display', () => {
    const nominees = getSeasonEvolutionNominees([{ rounds: [evolRound] }])
    expect(nominees).toHaveLength(1)
    expect(nominees[0].id).toBe('v1')
    expect(nominees[0].type).toBe('combatant')
    expect(nominees[0].name).toContain('SuperFighter')
    expect(nominees[0].name).toContain('Fighter')
    expect(nominees[0].name).toContain('Rival')
  })

  it('deduplicates evolutions across multiple season games', () => {
    const rooms = [{ rounds: [evolRound] }, { rounds: [evolRound] }]
    expect(getSeasonEvolutionNominees(rooms)).toHaveLength(1)
  })

  it('returns empty when no evolutions occurred', () => {
    const rooms = [{ rounds: [{ winner: { id: 'c1' }, combatants: [{ id: 'c1' }, { id: 'c2' }] }] }]
    expect(getSeasonEvolutionNominees(rooms)).toHaveLength(0)
  })

  it('returns empty for no rooms', () => {
    expect(getSeasonEvolutionNominees([])).toEqual([])
  })
})

// ─── computeGameAutoAwards ────────────────────────────────────────────────────

describe('computeGameAutoAwards', () => {
  function makeCompletedRoom(overrides = {}) {
    const p1 = { id: 'p1', name: 'Alice', isBot: false }
    const p2 = { id: 'p2', name: 'Bob',   isBot: false }
    const c1 = { id: 'c1', name: 'Fighter', ownerId: 'p1' }
    const c2 = { id: 'c2', name: 'Rival',   ownerId: 'p2' }
    return {
      id: 'room1', code: 'ROOM1', phase: 'ended',
      players: [p1, p2],
      combatants: { p1: [c1], p2: [c2] },
      rounds: [
        { id: 'r1', winner: { id: 'c1', name: 'Fighter', ownerId: 'p1' }, combatants: [c1, c2] },
      ],
      ...overrides,
    }
  }

  it('returns empty for dev mode room', () => {
    expect(computeGameAutoAwards(makeCompletedRoom({ devMode: true }))).toEqual([])
  })

  it('returns empty for room with no resolved rounds', () => {
    expect(computeGameAutoAwards(makeCompletedRoom({ rounds: [] }))).toEqual([])
  })

  it('returns most_wins for player with most round wins', () => {
    const room = makeCompletedRoom()
    const awards = computeGameAutoAwards(room)
    const mw = awards.find(a => a.type === 'most_wins')
    expect(mw).toBeDefined()
    expect(mw.recipient_id).toBe('p1')
    expect(mw.recipient_name).toBe('Alice')
    expect(mw.recipient_type).toBe('player')
    expect(mw.value).toBe(1)
    expect(mw.co_award).toBe(false)
    expect(mw.layer).toBe('game')
    expect(mw.scope_id).toBe('room1')
  })

  it('returns co_award most_wins when tied', () => {
    const p1 = { id: 'p1', name: 'Alice', isBot: false }
    const p2 = { id: 'p2', name: 'Bob',   isBot: false }
    const c1 = { id: 'c1', name: 'Fighter', ownerId: 'p1' }
    const c2 = { id: 'c2', name: 'Rival',   ownerId: 'p2' }
    const room = {
      id: 'room1', code: 'ROOM1', phase: 'ended',
      players: [p1, p2],
      combatants: { p1: [c1, c2], p2: [c2, c1] },
      rounds: [
        { winner: { id: 'c1', ownerId: 'p1' }, combatants: [c1, c2] },
        { winner: { id: 'c2', ownerId: 'p2' }, combatants: [c1, c2] },
      ],
    }
    const awards = computeGameAutoAwards(room)
    const mw = awards.filter(a => a.type === 'most_wins')
    expect(mw).toHaveLength(2)
    expect(mw.every(a => a.co_award)).toBe(true)
  })

  it('returns undefeated for player with wins and no losses', () => {
    const room = makeCompletedRoom()
    const awards = computeGameAutoAwards(room)
    const ud = awards.find(a => a.type === 'undefeated')
    expect(ud).toBeDefined()
    expect(ud.recipient_id).toBe('p1')
  })

  it('returns shutout for player with losses and no wins', () => {
    const room = makeCompletedRoom()
    const awards = computeGameAutoAwards(room)
    const sh = awards.find(a => a.type === 'shutout')
    expect(sh).toBeDefined()
    expect(sh.recipient_id).toBe('p2')
  })

  it('does not return shutout for a player who only drew', () => {
    const p1 = { id: 'p1', name: 'Alice', isBot: false }
    const p2 = { id: 'p2', name: 'Bob',   isBot: false }
    const c1 = { id: 'c1', ownerId: 'p1' }
    const c2 = { id: 'c2', ownerId: 'p2' }
    const room = {
      id: 'room1', phase: 'ended',
      players: [p1, p2],
      combatants: { p1: [c1], p2: [c2] },
      rounds: [{ draw: true, combatants: [c1, c2] }],
    }
    const awards = computeGameAutoAwards(room)
    expect(awards.find(a => a.type === 'shutout')).toBeUndefined()
  })

  it('returns most_reactions for combatant with most reactions', () => {
    const p1 = { id: 'p1', name: 'Alice', isBot: false }
    const p2 = { id: 'p2', name: 'Bob',   isBot: false }
    const c1 = { id: 'c1', name: 'Popular', ownerId: 'p1' }
    const c2 = { id: 'c2', name: 'Quiet',   ownerId: 'p2' }
    const room = {
      id: 'room1', phase: 'ended',
      players: [p1, p2],
      combatants: { p1: [c1], p2: [c2] },
      rounds: [{
        winner: { id: 'c1', ownerId: 'p1' },
        combatants: [c1, c2],
        playerReactions: { p1: { c1: 'heart' }, p2: { c1: 'heart' } },
      }],
    }
    const awards = computeGameAutoAwards(room)
    const mr = awards.find(a => a.type === 'most_reactions')
    expect(mr).toBeDefined()
    expect(mr.recipient_id).toBe('c1')
    expect(mr.value).toBe(2)
  })

  it('skips most_reactions when no reactions exist', () => {
    const room = makeCompletedRoom()
    const awards = computeGameAutoAwards(room)
    expect(awards.find(a => a.type === 'most_reactions')).toBeUndefined()
  })
})

// ─── computeSeriesAutoAwards ──────────────────────────────────────────────────

describe('computeSeriesAutoAwards', () => {
  const p1 = { id: 'p1', name: 'Alice', isBot: false }
  const p2 = { id: 'p2', name: 'Bob',   isBot: false }
  const c1 = { id: 'c1', name: 'Fighter', ownerId: 'p1' }
  const c2 = { id: 'c2', name: 'Rival',   ownerId: 'p2' }

  function makeSeriesRoom(rounds, overrides = {}) {
    return {
      id: 'room1', phase: 'ended',
      players: [p1, p2],
      combatants: { p1: [c1], p2: [c2] },
      rounds,
      ...overrides,
    }
  }

  it('returns empty for rooms not fully ended', () => {
    const room = makeSeriesRoom([], { phase: 'battle' })
    expect(computeSeriesAutoAwards([room], 'series1')).toEqual([])
  })

  it('returns most_wins for player with most round wins across rooms', () => {
    const room1 = makeSeriesRoom([{ winner: { id: 'c1', ownerId: 'p1', name: 'Fighter' }, combatants: [c1, c2] }])
    const room2 = makeSeriesRoom([{ winner: { id: 'c1', ownerId: 'p1', name: 'Fighter' }, combatants: [c1, c2] }], { id: 'room2' })
    const awards = computeSeriesAutoAwards([room1, room2], 'series1')
    const mw = awards.find(a => a.type === 'most_wins')
    expect(mw).toBeDefined()
    expect(mw.recipient_id).toBe('p1')
    expect(mw.value).toBe(2)
    expect(mw.layer).toBe('series')
    expect(mw.scope_id).toBe('series1')
  })

  it('returns most_evolutions for player with most evolutions triggered', () => {
    const room = makeSeriesRoom([{
      winner: { id: 'c1', name: 'Fighter', ownerId: 'p1' },
      combatants: [c1, c2],
      evolution: { fromId: 'c1', fromName: 'Fighter', toId: 'v1', toName: 'SuperFighter' },
    }])
    const awards = computeSeriesAutoAwards([room], 'series1')
    const me = awards.find(a => a.type === 'most_evolutions')
    expect(me).toBeDefined()
    expect(me.recipient_id).toBe('p1')
    expect(me.value).toBe(1)
  })

  it('skips most_evolutions when no evolutions occurred', () => {
    const room = makeSeriesRoom([{ winner: c1, combatants: [c1, c2] }])
    const awards = computeSeriesAutoAwards([room], 'series1')
    expect(awards.find(a => a.type === 'most_evolutions')).toBeUndefined()
  })

  it('excludes endedEarly and devMode rooms', () => {
    const earlyRoom = makeSeriesRoom([{ winner: c1, combatants: [c1, c2] }], { endedEarly: true })
    const devRoom   = makeSeriesRoom([{ winner: c1, combatants: [c1, c2] }], { devMode: true })
    expect(computeSeriesAutoAwards([earlyRoom, devRoom], 'series1')).toEqual([])
  })
})

// ─── computeSeasonAutoAwards ──────────────────────────────────────────────────

describe('computeSeasonAutoAwards', () => {
  it('uses same logic as computeSeriesAutoAwards but with season scope', () => {
    const p1 = { id: 'p1', name: 'Alice', isBot: false }
    const p2 = { id: 'p2', name: 'Bob',   isBot: false }
    const c1 = { id: 'c1', name: 'Fighter', ownerId: 'p1' }
    const c2 = { id: 'c2', name: 'Rival',   ownerId: 'p2' }
    const room = {
      id: 'room1', phase: 'ended',
      players: [p1, p2],
      combatants: { p1: [c1], p2: [c2] },
      rounds: [{ winner: { id: 'c1', ownerId: 'p1' }, combatants: [c1, c2] }],
    }
    const awards = computeSeasonAutoAwards([room], 'season1')
    const mw = awards.find(a => a.type === 'most_wins')
    expect(mw).toBeDefined()
    expect(mw.layer).toBe('season')
    expect(mw.scope_id).toBe('season1')
    expect(mw.scope_type).toBe('season')
  })

  it('returns empty for rooms with no completed games', () => {
    const room = { id: 'room1', phase: 'battle', players: [], combatants: {}, rounds: [] }
    expect(computeSeasonAutoAwards([room], 'season1')).toEqual([])
  })
})
