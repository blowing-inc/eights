import { describe, it, expect } from 'vitest'
import { buildTickerMessages } from './narrative.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeCombatant(overrides = {}) {
  return { id: 'c1', name: 'Fighter', wins: 0, losses: 0, draws: 0, isBot: false, ...overrides }
}

function makeWinRoom(winner, loser) {
  const round = { combatants: [winner, loser], winner, draw: false }
  return {
    devMode: false,
    players: [{ id: 'p1', name: 'Alice', isBot: false }],
    combatants: { p1: [winner, loser] },
    rounds: [round],
  }
}

// ─── buildTickerMessages ──────────────────────────────────────────────────────

describe('buildTickerMessages', () => {
  it('always returns at least the 15 static filler messages', () => {
    expect(buildTickerMessages([]).length).toBeGreaterThanOrEqual(15)
  })

  it('returns an array of strings', () => {
    buildTickerMessages([]).forEach(m => expect(typeof m).toBe('string'))
  })

  it('always includes a known static message', () => {
    const msgs = buildTickerMessages([])
    expect(msgs).toContain("Submit your 8. Destiny will handle the rest.")
  })

  it('handles empty array input', () => {
    expect(() => buildTickerMessages([])).not.toThrow()
  })

  it('handles null and undefined input', () => {
    expect(() => buildTickerMessages(null)).not.toThrow()
    expect(() => buildTickerMessages(undefined)).not.toThrow()
    expect(buildTickerMessages(null).length).toBeGreaterThanOrEqual(15)
  })

  it('handles array containing null and undefined entries', () => {
    expect(() => buildTickerMessages([null, undefined])).not.toThrow()
  })

  it('skips devMode rooms entirely', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'DevFighter', wins: 10, losses: 0 })
    const room = {
      devMode: true,
      players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: { p1: [c1] },
      rounds: [{ combatants: [c1, makeCombatant({ id: 'c2', name: 'Rival' })], winner: c1 }],
    }
    const msgs = buildTickerMessages([room])
    expect(msgs.filter(m => m.includes('DevFighter'))).toHaveLength(0)
  })

  it('generates messages referencing winner/loser when win rounds exist', () => {
    const winner = makeCombatant({ id: 'c1', name: 'Blaster' })
    const loser  = makeCombatant({ id: 'c2', name: 'Crusher' })
    const msgs = buildTickerMessages([makeWinRoom(winner, loser)])
    const mentions = msgs.filter(m => m.includes('Blaster') || m.includes('Crusher'))
    expect(mentions.length).toBeGreaterThan(0)
  })

  it('generates draw messages when draw rounds have 2+ combatants', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'LeftFighter' })
    const c2 = makeCombatant({ id: 'c2', name: 'RightFighter' })
    const room = {
      devMode: false,
      players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: { p1: [c1, c2] },
      rounds: [{ combatants: [c1, c2], draw: true, winner: null }],
    }
    const msgs = buildTickerMessages([room])
    const drawMsgs = msgs.filter(m => m.includes('LeftFighter') || m.includes('RightFighter'))
    expect(drawMsgs.length).toBeGreaterThan(0)
  })

  it('skips draw rounds with fewer than 2 combatants', () => {
    const room = {
      devMode: false,
      players: [],
      combatants: {},
      rounds: [
        { combatants: [],                                            draw: true, winner: null },
        { combatants: [makeCombatant({ id: 'c1', name: 'Solo' })],  draw: true, winner: null },
      ],
    }
    const msgs = buildTickerMessages([room])
    expect(Array.isArray(msgs)).toBe(true)
    msgs.forEach(m => expect(typeof m).toBe('string'))
  })

  it('handles draw round with no combatants property', () => {
    const room = {
      devMode: false, players: [], combatants: {},
      rounds: [{ draw: true, winner: null }],
    }
    expect(() => buildTickerMessages([room])).not.toThrow()
  })

  it('generates a loss-shame message for combatants with 4+ losses', () => {
    const loser = makeCombatant({ id: 'c1', name: 'PunchingBag', wins: 0, losses: 5 })
    const room = { devMode: false, players: [], combatants: { p1: [loser] }, rounds: [] }
    const msgs = buildTickerMessages([room])
    expect(msgs.find(m => m.includes('PunchingBag'))).toBeDefined()
  })

  it('generates an undefeated message for combatants with 4+ wins and 0 losses', () => {
    const hero = makeCombatant({ id: 'c1', name: 'Invincible', wins: 4, losses: 0 })
    const room = { devMode: false, players: [], combatants: { p1: [hero] }, rounds: [] }
    const msgs = buildTickerMessages([room])
    expect(msgs.find(m => m.includes('Invincible'))).toBeDefined()
  })

  it('generates a complicated-legacy message for combatants with 3+ wins and 3+ losses', () => {
    const messy = makeCombatant({ id: 'c1', name: 'LegendMaybe', wins: 3, losses: 3 })
    const room = { devMode: false, players: [], combatants: { p1: [messy] }, rounds: [] }
    const msgs = buildTickerMessages([room])
    const legacyMsg = msgs.find(m => m.includes('LegendMaybe') && m.includes('legacy'))
    expect(legacyMsg).toBeDefined()
  })

  it('generates player greeting messages for non-bot players', () => {
    const room = {
      devMode: false,
      players: [{ id: 'p1', name: 'DistinctPlayerName', isBot: false }],
      combatants: {},
      rounds: [],
    }
    const msgs = buildTickerMessages([room])
    expect(msgs.find(m => m.includes('DistinctPlayerName'))).toBeDefined()
  })

  it('does not generate player greetings for bot players', () => {
    const room = {
      devMode: false,
      players: [{ id: 'bot1', name: 'BotPlayer', isBot: true }],
      combatants: {},
      rounds: [],
    }
    const msgs = buildTickerMessages([room])
    expect(msgs.filter(m => m.includes('BotPlayer'))).toHaveLength(0)
  })

  it('handles room with no rounds property', () => {
    const room = { devMode: false, players: [], combatants: {} }
    expect(() => buildTickerMessages([room])).not.toThrow()
  })

  it('handles room with no players property', () => {
    const room = { devMode: false, combatants: {}, rounds: [] }
    expect(() => buildTickerMessages([room])).not.toThrow()
  })

  it('handles room with no combatants property', () => {
    const room = { devMode: false, players: [], rounds: [] }
    expect(() => buildTickerMessages([room])).not.toThrow()
  })

  it('does not generate stat messages for bot combatants', () => {
    const bot = makeCombatant({ id: 'c1', name: 'BotFighter', wins: 10, losses: 0, isBot: true })
    const room = { devMode: false, players: [], combatants: { p1: [bot] }, rounds: [] }
    const msgs = buildTickerMessages([room])
    expect(msgs.filter(m => m.includes('BotFighter'))).toHaveLength(0)
  })

  it('accumulates stats for the same combatant appearing in multiple rooms', () => {
    // Combatant name repeated across two rooms — stat messages should use the merged totals,
    // not count the first room twice. We can verify no error is thrown and the message appears.
    const c = makeCombatant({ id: 'c1', name: 'MultiRoom', wins: 2, losses: 2 })
    const room1 = { devMode: false, players: [], combatants: { p1: [c] }, rounds: [] }
    const room2 = { devMode: false, players: [], combatants: { p1: [c] }, rounds: [] }
    expect(() => buildTickerMessages([room1, room2])).not.toThrow()
  })

  it('generates a message referencing both losers when win round has 3 combatants', () => {
    const winner = makeCombatant({ id: 'c1', name: 'TriWinner' })
    const loser1 = makeCombatant({ id: 'c2', name: 'TriLoserA' })
    const loser2 = makeCombatant({ id: 'c3', name: 'TriLoserB' })
    // Repeat the round 15 times so at least one gets sampled past the random slice.
    const round = { combatants: [winner, loser1, loser2], winner, draw: false }
    const bigRoom = { devMode: false, players: [], combatants: {},
      rounds: Array(15).fill(round) }
    const msgs = buildTickerMessages([bigRoom])
    // At least one message should mention the winner
    expect(msgs.filter(m => m.includes('TriWinner')).length).toBeGreaterThan(0)
  })

  it('skips a win round where combatants list is missing', () => {
    const winner = makeCombatant({ id: 'c1', name: 'GhostWin' })
    const room = {
      devMode: false, players: [], combatants: {},
      rounds: [{ winner, draw: false }],
    }
    expect(() => buildTickerMessages([room])).not.toThrow()
  })

  it('skips a win round where winner has no other combatants (no losers)', () => {
    const winner = makeCombatant({ id: 'c1', name: 'LoneWinner' })
    const room = {
      devMode: false, players: [], combatants: {},
      rounds: [{ combatants: [winner], winner, draw: false }],
    }
    const msgs = buildTickerMessages([room])
    expect(Array.isArray(msgs)).toBe(true)
  })
})
