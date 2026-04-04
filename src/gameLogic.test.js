import { describe, it, expect } from 'vitest'
import {
  initials, playerColor, COLORS,
  totalRoundsFor, matchupForRound,
  applyWinner, undoRound,
  tallyReactions, toggleReaction,
  isFinalRound,
  authFlowFor,
  ownerLabel,
  buildTickerMessages,
} from './gameLogic.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCombatant(overrides = {}) {
  return { id: 'c1', name: 'Fighter', bio: '', ownerId: 'p1', ownerName: 'Alice', wins: 0, losses: 0, battles: [], ...overrides }
}

function makeRoom(overrides = {}) {
  const p1 = { id: 'p1', name: 'Alice', color: '#fff', isBot: false }
  const p2 = { id: 'p2', name: 'Bob',   color: '#000', isBot: false }
  const base = {
    id: 'ROOM1', code: 'ROOM1', host: 'p1', phase: 'battle',
    players: [p1, p2],
    combatants: {
      p1: Array(8).fill(0).map((_, i) => makeCombatant({ id: `p1c${i}`, name: `Alice-${i}`, ownerId: 'p1', ownerName: 'Alice' })),
      p2: Array(8).fill(0).map((_, i) => makeCombatant({ id: `p2c${i}`, name: `Bob-${i}`,   ownerId: 'p2', ownerName: 'Bob'   })),
    },
    rounds: [], currentRound: 0, createdAt: Date.now(),
  }
  return { ...base, ...overrides }
}

function makeRound(winnerId, combatants, overrides = {}) {
  return {
    id: 'rd1', number: 1, picks: {}, playerReactions: {},
    combatants,
    winner: combatants.find(c => c.id === winnerId) || null,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ─── initials ─────────────────────────────────────────────────────────────────

describe('initials', () => {
  it('takes first letter of each word, uppercased, max 2', () => {
    expect(initials('Alice')).toBe('A')
    expect(initials('Alice Bob')).toBe('AB')
    expect(initials('alice bob charlie')).toBe('AB')
  })

  it('handles single character names', () => {
    expect(initials('X')).toBe('X')
  })
})

// ─── playerColor ──────────────────────────────────────────────────────────────

describe('playerColor', () => {
  it('returns the correct color for indices 0-7', () => {
    COLORS.forEach((col, i) => expect(playerColor(i)).toBe(col))
  })

  it('wraps at 8', () => {
    expect(playerColor(8)).toBe(playerColor(0))
    expect(playerColor(9)).toBe(playerColor(1))
  })
})

// ─── totalRoundsFor ───────────────────────────────────────────────────────────

describe('totalRoundsFor', () => {
  it('returns minimum combatant count across players', () => {
    const room = makeRoom()
    expect(totalRoundsFor(room)).toBe(8)
  })

  it('is limited by the player with fewest combatants', () => {
    const room = makeRoom()
    room.combatants.p2 = room.combatants.p2.slice(0, 5)
    expect(totalRoundsFor(room)).toBe(5)
  })

  it('returns 0 when a player has no combatants', () => {
    const room = makeRoom()
    room.combatants.p1 = []
    expect(totalRoundsFor(room)).toBe(0)
  })

  it('handles a missing player combatant key gracefully', () => {
    const room = makeRoom()
    delete room.combatants.p2
    // p2 treated as 0 length → min is 0
    expect(totalRoundsFor(room)).toBe(0)
  })
})

// ─── matchupForRound ──────────────────────────────────────────────────────────

describe('matchupForRound', () => {
  it('picks slot [roundNum-1] from each player', () => {
    const room = makeRoom()
    const matchup = matchupForRound(room, 1)
    expect(matchup).toHaveLength(2)
    expect(matchup[0].id).toBe('p1c0')
    expect(matchup[1].id).toBe('p2c0')
  })

  it('picks the correct slot for later rounds', () => {
    const room = makeRoom()
    const matchup = matchupForRound(room, 4)
    expect(matchup[0].id).toBe('p1c3')
    expect(matchup[1].id).toBe('p2c3')
  })

  it('filters out missing slots (bot with fewer combatants)', () => {
    const room = makeRoom()
    room.combatants.p2 = room.combatants.p2.slice(0, 2)
    const matchup = matchupForRound(room, 3) // p2 has no slot 2
    expect(matchup).toHaveLength(1)
    expect(matchup[0].id).toBe('p1c2')
  })
})

// ─── applyWinner ──────────────────────────────────────────────────────────────

describe('applyWinner', () => {
  it('increments winner wins and loser losses', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = applyWinner(room, round, c1.id)
    expect(result.p1[0].wins).toBe(1)
    expect(result.p1[0].losses).toBe(0)
    expect(result.p2[0].wins).toBe(0)
    expect(result.p2[0].losses).toBe(1)
  })

  it('appends a battle record to both combatants', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = applyWinner(room, round, c1.id)
    expect(result.p1[0].battles).toHaveLength(1)
    expect(result.p1[0].battles[0].result).toBe('win')
    expect(result.p2[0].battles[0].result).toBe('loss')
  })

  it('records the correct opponent name', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = applyWinner(room, round, c1.id)
    expect(result.p1[0].battles[0].opponent).toBe(c2.name)
    expect(result.p2[0].battles[0].opponent).toBe(c1.name)
  })

  it('does not modify combatants not in the round', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = applyWinner(room, round, c1.id)
    // Slot 1 of each player was not in the round
    expect(result.p1[1].wins).toBe(0)
    expect(result.p2[1].losses).toBe(0)
  })

  it('returns unchanged combatants if winnerId is not found in round', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = applyWinner(room, round, 'nonexistent')
    expect(result.p1[0].wins).toBe(0)
    expect(result.p2[0].losses).toBe(0)
  })

  it('does not mutate the original room', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    applyWinner(room, round, c1.id)
    expect(room.combatants.p1[0].wins).toBe(0)
  })
})

// ─── undoRound ────────────────────────────────────────────────────────────────

describe('undoRound', () => {
  it('decrements winner wins and loser losses', () => {
    const room = makeRoom()
    room.combatants.p1[0].wins   = 1
    room.combatants.p2[0].losses = 1
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = undoRound(room, round)
    expect(result.p1[0].wins).toBe(0)
    expect(result.p2[0].losses).toBe(0)
  })

  it('never goes below 0', () => {
    const room = makeRoom() // wins/losses both 0
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const result = undoRound(room, round)
    expect(result.p1[0].wins).toBe(0)
    expect(result.p2[0].losses).toBe(0)
  })

  it('removes only the matching battle record', () => {
    const room = makeRoom()
    room.combatants.p1[0].battles = [
      { roundId: 'rd1', opponent: 'Bob-0', result: 'win'  },
      { roundId: 'rd2', opponent: 'Bob-1', result: 'loss' },
    ]
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2], { id: 'rd1' })

    const result = undoRound(room, round)
    expect(result.p1[0].battles).toHaveLength(1)
    expect(result.p1[0].battles[0].roundId).toBe('rd2')
  })

  it('is the inverse of applyWinner', () => {
    const room = makeRoom()
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    const after  = applyWinner(room, round, c1.id)
    const roomAfter = { ...room, combatants: after }
    const undone = undoRound(roomAfter, { ...round, winner: c1 })

    expect(undone.p1[0].wins).toBe(0)
    expect(undone.p1[0].losses).toBe(0)
    expect(undone.p2[0].wins).toBe(0)
    expect(undone.p2[0].losses).toBe(0)
    expect(undone.p1[0].battles).toHaveLength(0)
    expect(undone.p2[0].battles).toHaveLength(0)
  })

  it('does not mutate the original room', () => {
    const room = makeRoom()
    room.combatants.p1[0].wins = 2
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    const round = makeRound(c1.id, [c1, c2])

    undoRound(room, round)
    expect(room.combatants.p1[0].wins).toBe(2)
  })
})

// ─── tallyReactions ───────────────────────────────────────────────────────────

describe('tallyReactions', () => {
  it('counts each reaction type correctly', () => {
    const pr = {
      p1: { c1: 'heart' },
      p2: { c1: 'heart' },
      p3: { c1: 'angry' },
    }
    expect(tallyReactions(pr, 'c1')).toEqual({ heart: 2, angry: 1, cry: 0 })
  })

  it('ignores reactions for other combatants', () => {
    const pr = { p1: { c2: 'heart' } }
    expect(tallyReactions(pr, 'c1')).toEqual({ heart: 0, angry: 0, cry: 0 })
  })

  it('handles null/undefined playerReactions', () => {
    expect(tallyReactions(null, 'c1')).toEqual({ heart: 0, angry: 0, cry: 0 })
    expect(tallyReactions(undefined, 'c1')).toEqual({ heart: 0, angry: 0, cry: 0 })
  })

  it('handles empty playerReactions', () => {
    expect(tallyReactions({}, 'c1')).toEqual({ heart: 0, angry: 0, cry: 0 })
  })
})

// ─── toggleReaction ───────────────────────────────────────────────────────────

describe('toggleReaction', () => {
  it('adds a reaction when none exists', () => {
    const result = toggleReaction({}, 'p1', 'c1', 'heart')
    expect(result.p1.c1).toBe('heart')
  })

  it('replaces a different emoji', () => {
    const pr = { p1: { c1: 'heart' } }
    const result = toggleReaction(pr, 'p1', 'c1', 'angry')
    expect(result.p1.c1).toBe('angry')
  })

  it('removes the emoji when toggled off (same emoji again)', () => {
    const pr = { p1: { c1: 'heart' } }
    const result = toggleReaction(pr, 'p1', 'c1', 'heart')
    expect(result.p1.c1).toBeUndefined()
  })

  it('does not affect other players reactions', () => {
    const pr = { p2: { c1: 'angry' } }
    const result = toggleReaction(pr, 'p1', 'c1', 'heart')
    expect(result.p2.c1).toBe('angry')
    expect(result.p1.c1).toBe('heart')
  })

  it('does not mutate original playerReactions', () => {
    const pr = { p1: { c1: 'heart' } }
    toggleReaction(pr, 'p1', 'c1', 'angry')
    expect(pr.p1.c1).toBe('heart')
  })
})

// ─── isFinalRound ─────────────────────────────────────────────────────────────

describe('isFinalRound', () => {
  it('returns true when currentRound equals the total number of rounds', () => {
    const room = makeRoom({ currentRound: 8 })
    expect(isFinalRound(room)).toBe(true)
  })

  it('returns false before the last round', () => {
    const room = makeRoom({ currentRound: 7 })
    expect(isFinalRound(room)).toBe(false)
  })

  it('returns false when currentRound is 0', () => {
    const room = makeRoom({ currentRound: 0 })
    expect(isFinalRound(room)).toBe(false)
  })

  it('accounts for uneven rosters', () => {
    const room = makeRoom({ currentRound: 5 })
    room.combatants.p2 = room.combatants.p2.slice(0, 5)
    expect(isFinalRound(room)).toBe(true)
  })
})

// ─── authFlowFor ──────────────────────────────────────────────────────────────

describe('authFlowFor', () => {
  it('returns register when no user found', () => {
    expect(authFlowFor(null)).toBe('register')
    expect(authFlowFor(undefined)).toBe('register')
  })

  it('returns set_pin when user needs_reset', () => {
    expect(authFlowFor({ id: 'u1', username: 'Mike', needs_reset: true })).toBe('set_pin')
  })

  it('returns login for a normal existing user', () => {
    expect(authFlowFor({ id: 'u1', username: 'Mike', needs_reset: false })).toBe('login')
  })
})

// ─── ownerLabel ───────────────────────────────────────────────────────────────

describe('ownerLabel', () => {
  it('appends (guest) for guest players', () => {
    expect(ownerLabel('Alice', true)).toBe('Alice (guest)')
  })

  it('returns bare name for logged-in players', () => {
    expect(ownerLabel('Alice', false)).toBe('Alice')
  })
})

// ─── buildTickerMessages ─────────────────────────────────────────────────────

describe('buildTickerMessages', () => {
  it('always returns at least the 15 static filler messages', () => {
    const msgs = buildTickerMessages([])
    expect(msgs.length).toBeGreaterThanOrEqual(15)
  })

  it('returns an array of strings', () => {
    const msgs = buildTickerMessages([])
    msgs.forEach(m => expect(typeof m).toBe('string'))
  })

  it('generates round-based messages when completed rounds exist', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'Blaster' })
    const c2 = makeCombatant({ id: 'c2', name: 'Crusher' })
    const round = { id: 'rd1', number: 1, combatants: [c1, c2], winner: c1, picks: {}, createdAt: Date.now() }
    const room = {
      id: 'R1', devMode: false, players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: { p1: [c1] }, rounds: [round], currentRound: 1, createdAt: Date.now(),
    }
    const msgs = buildTickerMessages([room])
    // At least one message should reference the winner or loser
    const mentions = msgs.filter(m => m.includes('Blaster') || m.includes('Crusher'))
    expect(mentions.length).toBeGreaterThan(0)
  })

  it('skips devMode rooms entirely', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'DevFighter' })
    const c2 = makeCombatant({ id: 'c2', name: 'OtherFighter' })
    const round = { id: 'rd1', number: 1, combatants: [c1, c2], winner: c1, picks: {}, createdAt: Date.now() }
    const room = {
      id: 'DEV1', devMode: true, players: [], combatants: { p1: [c1] },
      rounds: [round], currentRound: 1, createdAt: Date.now(),
    }
    const msgs = buildTickerMessages([room])
    const mentions = msgs.filter(m => m.includes('DevFighter'))
    expect(mentions).toHaveLength(0)
  })

  it('generates a loss-shame message for combatants with 4+ losses', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'PunchingBag', wins: 0, losses: 5 })
    const room = {
      id: 'R1', devMode: false, players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: { p1: [c1] }, rounds: [], currentRound: 0, createdAt: Date.now(),
    }
    const msgs = buildTickerMessages([room])
    const shameMsg = msgs.find(m => m.includes('PunchingBag'))
    expect(shameMsg).toBeDefined()
  })

  it('generates an undefeated message for 4+ wins with 0 losses', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'Invincible', wins: 4, losses: 0 })
    const room = {
      id: 'R1', devMode: false, players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: { p1: [c1] }, rounds: [], currentRound: 0, createdAt: Date.now(),
    }
    const msgs = buildTickerMessages([room])
    const heroMsg = msgs.find(m => m.includes('Invincible'))
    expect(heroMsg).toBeDefined()
  })

  it('handles null/undefined gracefully', () => {
    expect(() => buildTickerMessages(null)).not.toThrow()
    expect(() => buildTickerMessages(undefined)).not.toThrow()
    expect(() => buildTickerMessages([null, undefined])).not.toThrow()
  })
})
