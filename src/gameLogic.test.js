import { describe, it, expect, beforeEach } from 'vitest'
import {
  initials, playerColor, COLORS,
  BOT_COMBATANTS, BOT_BIOS, makeBotCombatants, makeBots,
  totalRoundsFor, matchupForRound,
  applyWinner, undoRound,
  tallyReactions, toggleReaction,
  isFinalRound,
  authFlowFor,
  ownerLabel,
  buildTickerMessages,
  slotMatchesPrevWinner, areAllPrevWinnersPlaced, getUnplacedWinners,
  buildCombatantFromDraft, isDraftComplete,
  getReadyPlayerCount, canForceStart,
  canUndoLastRound, canEditCombatant,
  extractPreviousWinners,
  normalizeRoomSettings,
  simulateGameToEnd,
  getLineageStats,
  buildActiveFormMap,
  buildChainEvolutionStory,
  buildStoryFromLineageTree,
  applyActiveFormMap,
  groupRoomsForHistory,
  prepareNextGame,
  computeSeriesStandings,
  applyDraw,
  replacePlayerIdInRoom,
  buildEvolutionRound,
  getEphemeralBadges,
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

  it('appends a round record to both combatants', () => {
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

  it('removes only the matching round record', () => {
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

  it('generates a draw message when a draw round has 2+ combatants', () => {
    const c1 = makeCombatant({ id: 'c1', name: 'LeftFighter' })
    const c2 = makeCombatant({ id: 'c2', name: 'RightFighter' })
    const room = {
      id: 'R1', devMode: false, players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: { p1: [c1, c2] },
      rounds: [
        { id: 'rd1', number: 1, combatants: [c1, c2], draw: true, winner: null, picks: {}, createdAt: Date.now() },
      ],
      currentRound: 1, createdAt: Date.now(),
    }
    const msgs = buildTickerMessages([room])
    const drawMsgs = msgs.filter(m => m.includes('LeftFighter') || m.includes('RightFighter'))
    expect(drawMsgs.length).toBeGreaterThan(0)
  })

  it('skips draw rounds with fewer than 2 combatants', () => {
    const room = {
      id: 'R1', devMode: false, players: [{ id: 'p1', name: 'Alice', isBot: false }],
      combatants: {},
      rounds: [
        { id: 'rd1', number: 1, combatants: [], draw: true, winner: null, picks: {}, createdAt: Date.now() },
        { id: 'rd2', number: 2, combatants: [makeCombatant({ id: 'c1', name: 'Solo' })], draw: true, winner: null, picks: {}, createdAt: Date.now() },
      ],
      currentRound: 2, createdAt: Date.now(),
    }
    // Should not throw and should return strings (draw messages not added for <2 combatants)
    const msgs = buildTickerMessages([room])
    expect(Array.isArray(msgs)).toBe(true)
    msgs.forEach(m => expect(typeof m).toBe('string'))
  })
})

// ─── makeBotCombatants ────────────────────────────────────────────────────────

describe('makeBotCombatants', () => {
  let n = 0
  const seqId = () => 'id' + (++n)
  beforeEach(() => { n = 0 })

  it('returns 8 combatants by default', () => {
    const result = makeBotCombatants(0, 'bot_0', 'Bot Alpha', { idFn: seqId })
    expect(result).toHaveLength(8)
  })

  it('respects rosterSize option', () => {
    expect(makeBotCombatants(0, 'b', 'B', { rosterSize: 4, idFn: seqId })).toHaveLength(4)
    expect(makeBotCombatants(0, 'b', 'B', { rosterSize: 6, idFn: seqId })).toHaveLength(6)
  })

  it('uses the first template list for botIdx 0 or even', () => {
    const result = makeBotCombatants(0, 'bot_0', 'Bot Alpha', { idFn: seqId })
    expect(result[0].name).toBe(BOT_COMBATANTS[0][0])
  })

  it('uses the second template list for botIdx 1 or odd', () => {
    const result = makeBotCombatants(1, 'bot_1', 'Bot Beta', { idFn: seqId })
    expect(result[0].name).toBe(BOT_COMBATANTS[1][0])
  })

  it('wraps template list selection (botIdx 2 → list 0)', () => {
    const r0 = makeBotCombatants(0, 'b', 'B', { idFn: seqId })
    n = 0
    const r2 = makeBotCombatants(2, 'b', 'B', { idFn: seqId })
    expect(r2.map(c => c.name)).toEqual(r0.map(c => c.name))
  })

  it('assigns ownerId and ownerName correctly', () => {
    const result = makeBotCombatants(0, 'bot_0', 'Bot Alpha', { idFn: seqId })
    result.forEach(c => {
      expect(c.ownerId).toBe('bot_0')
      expect(c.ownerName).toBe('Bot Alpha')
    })
  })

  it('marks all combatants as bots with zero stats', () => {
    const result = makeBotCombatants(0, 'bot_0', 'Bot Alpha', { idFn: seqId })
    result.forEach(c => {
      expect(c.isBot).toBe(true)
      expect(c.wins).toBe(0)
      expect(c.losses).toBe(0)
      expect(c.battles).toEqual([])
    })
  })

  it('assigns a unique id per combatant via idFn', () => {
    const result = makeBotCombatants(0, 'bot_0', 'Bot Alpha', { idFn: seqId })
    const ids = result.map(c => c.id)
    expect(new Set(ids).size).toBe(8)
  })

  it('uses BOT_BIOS in order', () => {
    const result = makeBotCombatants(0, 'bot_0', 'Bot Alpha', { idFn: seqId })
    result.forEach((c, i) => expect(c.bio).toBe(BOT_BIOS[i]))
  })
})

// ─── makeBots ─────────────────────────────────────────────────────────────────

describe('makeBots', () => {
  it('returns the requested number of bots', () => {
    expect(makeBots(2)).toHaveLength(2)
    expect(makeBots(1)).toHaveLength(1)
  })

  it('names the first two bots Alpha and Beta', () => {
    const bots = makeBots(2)
    expect(bots[0].name).toBe('Bot Alpha')
    expect(bots[1].name).toBe('Bot Beta')
  })

  it('falls back to "Bot N" for indices beyond 1', () => {
    const bots = makeBots(3)
    expect(bots[2].name).toBe('Bot 2')
  })

  it('marks all bots as ready and isBot:true', () => {
    makeBots(2).forEach(b => {
      expect(b.isBot).toBe(true)
      expect(b.ready).toBe(true)
    })
  })

  it('gives each bot a deterministic stable id', () => {
    const bots = makeBots(2)
    expect(bots[0].id).toBe('bot_0')
    expect(bots[1].id).toBe('bot_1')
  })
})

// ─── slotMatchesPrevWinner ────────────────────────────────────────────────────

describe('slotMatchesPrevWinner', () => {
  const winner = { id: 'gid1', name: 'Thunder Fist' }

  it('matches by exact name (case-insensitive)', () => {
    expect(slotMatchesPrevWinner(['Thunder Fist'], [null], 0, winner)).toBe(true)
    expect(slotMatchesPrevWinner(['thunder fist'], [null], 0, winner)).toBe(true)
    expect(slotMatchesPrevWinner(['THUNDER FIST'], [null], 0, winner)).toBe(true)
  })

  it('matches by global id', () => {
    expect(slotMatchesPrevWinner(['Something Else'], ['gid1'], 0, winner)).toBe(true)
  })

  it('does not match on wrong name and no id', () => {
    expect(slotMatchesPrevWinner(['Other Fighter'], [null], 0, winner)).toBe(false)
  })

  it('trims whitespace from the slot name before comparing', () => {
    expect(slotMatchesPrevWinner(['  Thunder Fist  '], [null], 0, winner)).toBe(true)
  })

  it('does not match when global id is null even if name also differs', () => {
    expect(slotMatchesPrevWinner(['Nope'], [null], 0, winner)).toBe(false)
  })

  it('checks the correct slot index', () => {
    const names = ['Wrong', 'Thunder Fist']
    const gids  = [null, null]
    expect(slotMatchesPrevWinner(names, gids, 0, winner)).toBe(false)
    expect(slotMatchesPrevWinner(names, gids, 1, winner)).toBe(true)
  })
})

// ─── areAllPrevWinnersPlaced ──────────────────────────────────────────────────

describe('areAllPrevWinnersPlaced', () => {
  it('returns true when every winner appears in at least one slot', () => {
    const winners = [{ id: 'g1', name: 'Fighter A' }, { id: 'g2', name: 'Fighter B' }]
    const names   = ['Fighter A', 'Fighter B', '', '', '', '', '', '']
    const gids    = Array(8).fill(null)
    expect(areAllPrevWinnersPlaced(winners, names, gids)).toBe(true)
  })

  it('returns false when a winner is not in any slot', () => {
    const winners = [{ id: 'g1', name: 'Fighter A' }, { id: 'g2', name: 'Missing One' }]
    const names   = ['Fighter A', '', '', '', '', '', '', '']
    const gids    = Array(8).fill(null)
    expect(areAllPrevWinnersPlaced(winners, names, gids)).toBe(false)
  })

  it('returns true when prevWinners is empty', () => {
    expect(areAllPrevWinnersPlaced([], ['Anything'], [null])).toBe(true)
  })

  it('matches via global id even if name differs', () => {
    const winners = [{ id: 'g1', name: 'Fighter A' }]
    const names   = ['Different Name']
    const gids    = ['g1']
    expect(areAllPrevWinnersPlaced(winners, names, gids)).toBe(true)
  })
})

// ─── getUnplacedWinners ───────────────────────────────────────────────────────

describe('getUnplacedWinners', () => {
  it('returns winners not found in any slot', () => {
    const winners = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }]
    const names   = ['A', '', '', '', '', '', '', '']
    const gids    = Array(8).fill(null)
    const result  = getUnplacedWinners(winners, names, gids)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('B')
  })

  it('returns empty array when all winners are placed', () => {
    const winners = [{ id: 'g1', name: 'A' }]
    expect(getUnplacedWinners(winners, ['A'], [null])).toEqual([])
  })

  it('returns all winners when none are placed', () => {
    const winners = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }]
    const result  = getUnplacedWinners(winners, ['', ''], [null, null])
    expect(result).toHaveLength(2)
  })

  it('is the complement of areAllPrevWinnersPlaced', () => {
    const winners = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }]
    const names   = ['A', '']
    const gids    = [null, null]
    const unplaced = getUnplacedWinners(winners, names, gids)
    expect(unplaced.length > 0).toBe(!areAllPrevWinnersPlaced(winners, names, gids))
  })
})

// ─── buildCombatantFromDraft ──────────────────────────────────────────────────

describe('buildCombatantFromDraft', () => {
  it('trims name and bio', () => {
    const c = buildCombatantFromDraft('  Blaster  ', '  Born fighting.  ', null, 'p1', 'Alice')
    expect(c.name).toBe('Blaster')
    expect(c.bio).toBe('Born fighting.')
  })

  it('reuses globalId when provided', () => {
    const c = buildCombatantFromDraft('Blaster', '', 'existing-id', 'p1', 'Alice')
    expect(c.id).toBe('existing-id')
  })

  it('generates a new id when globalId is null', () => {
    const c = buildCombatantFromDraft('Blaster', '', null, 'p1', 'Alice', () => 'new-id')
    expect(c.id).toBe('new-id')
  })

  it('sets ownerId and ownerName', () => {
    const c = buildCombatantFromDraft('F', '', null, 'p1', 'Alice', () => 'x')
    expect(c.ownerId).toBe('p1')
    expect(c.ownerName).toBe('Alice')
  })

  it('initialises stats at zero', () => {
    const c = buildCombatantFromDraft('F', '', null, 'p1', 'Alice', () => 'x')
    expect(c.wins).toBe(0)
    expect(c.losses).toBe(0)
    expect(c.battles).toEqual([])
  })
})

// ─── isDraftComplete ──────────────────────────────────────────────────────────

describe('isDraftComplete', () => {
  const p1 = { id: 'p1', isBot: false }
  const p2 = { id: 'p2', isBot: false }
  const bot = { id: 'bot_0', isBot: true }
  const full8 = Array(8).fill({ id: 'c', name: 'F', bio: '' })

  it('returns true when all real players have 8 combatants (default rosterSize)', () => {
    expect(isDraftComplete([p1, p2], { p1: full8, p2: full8 })).toBe(true)
  })

  it('returns false when any real player has fewer than rosterSize', () => {
    expect(isDraftComplete([p1, p2], { p1: full8, p2: full8.slice(0, 7) })).toBe(false)
  })

  it('returns false when a player has no combatants yet', () => {
    expect(isDraftComplete([p1, p2], { p1: full8 })).toBe(false)
  })

  it('ignores bots', () => {
    expect(isDraftComplete([p1, bot], { p1: full8, bot_0: [] })).toBe(true)
  })

  it('returns true for a single real player who is done', () => {
    expect(isDraftComplete([p1], { p1: full8 })).toBe(true)
  })

  it('respects a custom rosterSize', () => {
    const full5 = Array(5).fill({ id: 'c', name: 'F', bio: '' })
    expect(isDraftComplete([p1], { p1: full5 }, 5)).toBe(true)
    expect(isDraftComplete([p1], { p1: full5 }, 8)).toBe(false)
  })
})

// ─── getReadyPlayerCount ──────────────────────────────────────────────────────

describe('getReadyPlayerCount', () => {
  const p1 = { id: 'p1', isBot: false }
  const p2 = { id: 'p2', isBot: false }
  const bot = { id: 'bot_0', isBot: true }
  const full8 = Array(8).fill({ id: 'c' })

  it('counts players with exactly rosterSize combatants (default 8)', () => {
    expect(getReadyPlayerCount([p1, p2], { p1: full8, p2: full8 })).toBe(2)
  })

  it('does not count players with fewer than rosterSize', () => {
    expect(getReadyPlayerCount([p1, p2], { p1: full8, p2: [] })).toBe(1)
  })

  it('does not count bots', () => {
    expect(getReadyPlayerCount([p1, bot], { p1: full8, bot_0: full8 })).toBe(1)
  })

  it('returns 0 when nobody is ready', () => {
    expect(getReadyPlayerCount([p1, p2], {})).toBe(0)
  })

  it('respects a custom rosterSize', () => {
    const full5 = Array(5).fill({ id: 'c' })
    expect(getReadyPlayerCount([p1, p2], { p1: full5, p2: full5 }, 5)).toBe(2)
    expect(getReadyPlayerCount([p1, p2], { p1: full5, p2: full5 }, 8)).toBe(0)
  })
})

// ─── groupRoomsForHistory ─────────────────────────────────────────────────────

describe('groupRoomsForHistory', () => {
  function room(id, overrides = {}) {
    return { id, code: id.toUpperCase(), createdAt: Date.now(), rounds: [], players: [], ...overrides }
  }

  it('returns empty array for no rooms', () => {
    expect(groupRoomsForHistory([])).toEqual([])
  })

  it('returns standalone items for unlinked rooms', () => {
    const rooms = [room('a'), room('b')]
    const result = groupRoomsForHistory(rooms)
    expect(result).toHaveLength(2)
    expect(result.every(i => i.type === 'standalone')).toBe(true)
  })

  it('groups rooms sharing a seriesId into one series item', () => {
    const sid = 'series1'
    const rooms = [
      room('a', { seriesId: sid, seriesIndex: 1 }),
      room('b', { seriesId: sid, seriesIndex: 2 }),
      room('c', { seriesId: sid, seriesIndex: 3 }),
    ]
    const result = groupRoomsForHistory(rooms)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('series')
    expect(result[0].rooms).toHaveLength(3)
    expect(result[0].seriesId).toBe(sid)
  })

  it('sorts rooms within a series by seriesIndex', () => {
    const sid = 'sid'
    const rooms = [
      room('c', { seriesId: sid, seriesIndex: 3 }),
      room('a', { seriesId: sid, seriesIndex: 1 }),
      room('b', { seriesId: sid, seriesIndex: 2 }),
    ]
    const result = groupRoomsForHistory(rooms)
    expect(result[0].rooms.map(r => r.seriesIndex)).toEqual([1, 2, 3])
  })

  it('groups legacy linked rooms (prevRoomId/nextRoomId, no seriesId) into a series', () => {
    const r1 = room('g1', { nextRoomId: 'g2' })
    const r2 = room('g2', { prevRoomId: 'g1', nextRoomId: 'g3' })
    const r3 = room('g3', { prevRoomId: 'g2' })
    const result = groupRoomsForHistory([r1, r2, r3])
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('series')
    expect(result[0].rooms).toHaveLength(3)
  })

  it('sorts items newest-first by latestAt', () => {
    const older = room('x', { createdAt: 1000 })
    const newer = room('y', { createdAt: 2000 })
    const result = groupRoomsForHistory([older, newer])
    expect(result[0].room.id).toBe('y')
    expect(result[1].room.id).toBe('x')
  })

  it('stops chain walk when prevRoomId points outside the room set', () => {
    // r2 has a prevRoomId that isn't in the list — chainRoot should stop at r2 itself
    const r2 = room('r2', { prevRoomId: 'missing-room' })
    const result = groupRoomsForHistory([r2])
    // Still grouped as a series (solo chain) since prevRoomId is set — does not throw
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('series')
    expect(result[0].rooms).toHaveLength(1)
    expect(result[0].rooms[0].id).toBe('r2')
  })

  it('mixed: series and standalone both appear', () => {
    const sid = 'sX'
    const rooms = [
      room('a', { seriesId: sid, seriesIndex: 1 }),
      room('b', { seriesId: sid, seriesIndex: 2 }),
      room('standalone'),
    ]
    const result = groupRoomsForHistory(rooms)
    expect(result).toHaveLength(2)
    const types = result.map(i => i.type).sort()
    expect(types).toEqual(['series', 'standalone'])
  })
})

// ─── prepareNextGame ──────────────────────────────────────────────────────────

describe('prepareNextGame', () => {
  const baseRoom = {
    id: 'ROOM1', code: 'ROOM1', host: 'p1', phase: 'battle',
    players: [{ id: 'p1', name: 'Alice', isBot: false }],
    combatants: {}, rounds: [], currentRound: 0, createdAt: 1000,
  }

  it('sets seriesId from completedRoom.id when no prior series', () => {
    const { newRoom, updatedCompletedRoom } = prepareNextGame(baseRoom, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    expect(newRoom.seriesId).toBe('ROOM1')
    expect(updatedCompletedRoom.seriesId).toBe('ROOM1')
  })

  it('inherits existing seriesId', () => {
    const room = { ...baseRoom, seriesId: 'ORIG', seriesIndex: 2 }
    const { newRoom, updatedCompletedRoom } = prepareNextGame(room, { newRoomCode: 'ROOM3', hostId: 'p1', now: 3000 })
    expect(newRoom.seriesId).toBe('ORIG')
    expect(updatedCompletedRoom.seriesId).toBe('ORIG')
  })

  it('increments seriesIndex', () => {
    const room = { ...baseRoom, seriesId: 'S1', seriesIndex: 1 }
    const { newRoom } = prepareNextGame(room, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    expect(newRoom.seriesIndex).toBe(2)
  })

  it('stamps seriesIndex: 1 on the completed room when first next-game', () => {
    const { updatedCompletedRoom } = prepareNextGame(baseRoom, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    expect(updatedCompletedRoom.seriesIndex).toBe(1)
  })

  it('sets prevRoomId and nextRoomId correctly', () => {
    const { newRoom, updatedCompletedRoom } = prepareNextGame(baseRoom, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    expect(newRoom.prevRoomId).toBe('ROOM1')
    expect(updatedCompletedRoom.nextRoomId).toBe('ROOM2')
  })

  it('starts new room with empty combatants and rounds', () => {
    const { newRoom } = prepareNextGame(baseRoom, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    expect(newRoom.combatants).toEqual({})
    expect(newRoom.rounds).toEqual([])
    expect(newRoom.phase).toBe('draft')
  })

  it('pre-populates bot combatants when devMode is true', () => {
    const room = {
      ...baseRoom,
      devMode: true,
      players: [
        { id: 'p1', name: 'Alice', isBot: false },
        { id: 'bot1', name: 'Robo', isBot: true },
      ],
    }
    const { newRoom } = prepareNextGame(room, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    expect(newRoom.combatants['bot1']).toBeDefined()
    expect(newRoom.combatants['bot1'].length).toBeGreaterThan(0)
  })

  it('translates evolved winners to their active form in prevWinners', () => {
    const room = {
      ...baseRoom,
      rounds: [{
        id: 'r1', number: 1,
        combatants: [{ id: 'c1', name: 'MJ', ownerId: 'p1', ownerName: 'Alice' }],
        winner: { id: 'c1', name: 'MJ', ownerId: 'p1' },
        picks: {},
        evolution: { fromId: 'c1', fromName: 'MJ', toId: 'c2', toName: 'MJ Evolved', toBio: 'new form', ownerId: 'p1', ownerName: 'Alice' },
      }],
    }
    const { newRoom } = prepareNextGame(room, { newRoomCode: 'ROOM2', hostId: 'p1', now: 2000 })
    const winners = newRoom.prevWinners?.p1 || []
    expect(winners.some(w => w.id === 'c2' && w.name === 'MJ Evolved')).toBe(true)
  })
})

// ─── canForceStart ────────────────────────────────────────────────────────────

describe('canForceStart', () => {
  it('returns true when host, 2+ ready, and at least 1 not ready', () => {
    expect(canForceStart(true, 2, 3)).toBe(true)
  })

  it('returns false when not host', () => {
    expect(canForceStart(false, 2, 3)).toBe(false)
  })

  it('returns false when fewer than 2 players ready', () => {
    expect(canForceStart(true, 1, 3)).toBe(false)
  })

  it('returns false when all players are ready (no need to force)', () => {
    expect(canForceStart(true, 3, 3)).toBe(false)
  })

  it('returns false when nobody is ready', () => {
    expect(canForceStart(true, 0, 3)).toBe(false)
  })
})

// ─── canUndoLastRound ─────────────────────────────────────────────────────────

describe('canUndoLastRound', () => {
  const roundWithWinner    = { winner: { id: 'c1', name: 'F' } }
  const roundWithoutWinner = { winner: null }

  it('returns true for host, round > 0, and round has winner', () => {
    expect(canUndoLastRound(true, 1, roundWithWinner)).toBe(true)
  })

  it('returns false when not host', () => {
    expect(canUndoLastRound(false, 1, roundWithWinner)).toBe(false)
  })

  it('returns false when currentRound is 0', () => {
    expect(canUndoLastRound(true, 0, roundWithWinner)).toBe(false)
  })

  it('returns false when round has no winner yet', () => {
    expect(canUndoLastRound(true, 1, roundWithoutWinner)).toBe(false)
  })

  it('returns false when round is undefined', () => {
    expect(canUndoLastRound(true, 1, undefined)).toBe(false)
  })
})

// ─── canEditCombatant ─────────────────────────────────────────────────────────

describe('canEditCombatant', () => {
  it('returns true for the combatant owner', () => {
    expect(canEditCombatant('p1', 'p1', 'p2')).toBe(true)
  })

  it('returns true for the room host', () => {
    expect(canEditCombatant('p1', 'p2', 'p2')).toBe(true)
  })

  it('returns false for a third-party player', () => {
    expect(canEditCombatant('p1', 'p3', 'p2')).toBe(false)
  })

  it('returns true when owner and host are the same player', () => {
    expect(canEditCombatant('p1', 'p1', 'p1')).toBe(true)
  })
})

// ─── extractPreviousWinners ───────────────────────────────────────────────────

describe('extractPreviousWinners', () => {
  function makeRound(winner) {
    return { id: 'rd' + winner.id, combatants: [], winner, picks: {} }
  }

  it('groups winners by ownerId', () => {
    const w1 = { id: 'c1', name: 'Titan',  bio: 'Mighty.', ownerId: 'p1' }
    const w2 = { id: 'c2', name: 'Specter', bio: 'Ghostly.', ownerId: 'p2' }
    const result = extractPreviousWinners([makeRound(w1), makeRound(w2)])
    expect(result.p1).toHaveLength(1)
    expect(result.p1[0].name).toBe('Titan')
    expect(result.p2[0].name).toBe('Specter')
  })

  it('accumulates multiple winners for the same player', () => {
    const w1 = { id: 'c1', name: 'A', bio: '', ownerId: 'p1' }
    const w2 = { id: 'c2', name: 'B', bio: '', ownerId: 'p1' }
    const result = extractPreviousWinners([makeRound(w1), makeRound(w2)])
    expect(result.p1).toHaveLength(2)
  })

  it('skips rounds without a winner', () => {
    const result = extractPreviousWinners([{ id: 'rd1', winner: null, combatants: [], picks: {} }])
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('defaults bio to empty string when winner.bio is undefined', () => {
    const w = { id: 'c1', name: 'Fighter', ownerId: 'p1' } // no bio field
    const result = extractPreviousWinners([makeRound(w)])
    expect(result.p1[0].bio).toBe('')
  })

  it('returns an empty object for empty rounds', () => {
    expect(extractPreviousWinners([])).toEqual({})
  })

  it('handles null/undefined gracefully', () => {
    expect(() => extractPreviousWinners(null)).not.toThrow()
    expect(() => extractPreviousWinners(undefined)).not.toThrow()
  })

  it('only includes id, name, bio in each entry (not full combatant)', () => {
    const w = { id: 'c1', name: 'X', bio: 'Y', ownerId: 'p1', wins: 99, losses: 0 }
    const result = extractPreviousWinners([makeRound(w)])
    const entry = result.p1[0]
    expect(Object.keys(entry).sort()).toEqual(['bio', 'id', 'name'])
  })
})

// ─── normalizeRoomSettings ────────────────────────────────────────────────────

describe('normalizeRoomSettings', () => {
  it('fills all defaults when passed undefined', () => {
    const s = normalizeRoomSettings(undefined)
    expect(s.rosterSize).toBe(8)
    expect(s.spectatorsAllowed).toBe(true)
    expect(s.anonymousCombatants).toBe(false)
    expect(s.blindVoting).toBe(false)
    expect(s.biosRequired).toBe(false)
  })

  it('fills all defaults when passed an empty object', () => {
    const s = normalizeRoomSettings({})
    expect(s.rosterSize).toBe(8)
    expect(s.spectatorsAllowed).toBe(true)
  })

  it('preserves explicit values', () => {
    const s = normalizeRoomSettings({ rosterSize: 5, blindVoting: true })
    expect(s.rosterSize).toBe(5)
    expect(s.blindVoting).toBe(true)
    expect(s.biosRequired).toBe(false) // still defaulted
  })

  it('preserves false explicitly set', () => {
    const s = normalizeRoomSettings({ spectatorsAllowed: false })
    expect(s.spectatorsAllowed).toBe(false)
  })

  it('is non-destructive — does not mutate the input', () => {
    const input = { rosterSize: 6 }
    const result = normalizeRoomSettings(input)
    expect(result).not.toBe(input)
    expect(input.biosRequired).toBeUndefined()
  })
})

// ─── applyWinner — trap detection ────────────────────────────────────────────

describe('applyWinner trap detection', () => {
  function makeRoomWithCombatants(c1, c2) {
    return {
      combatants: { p1: [c1], p2: [c2] },
    }
  }

  it('sets trapTriggered when trap target is in the same round', () => {
    const trapper = { id: 'c1', ownerId: 'p1', wins: 0, losses: 0, battles: [], trapTarget: { targetId: 'c2' } }
    const target  = { id: 'c2', ownerId: 'p2', wins: 0, losses: 0, battles: [] }
    const round   = { id: 'r1', combatants: [trapper, target], winner: trapper }
    const room    = makeRoomWithCombatants(trapper, target)
    const result  = applyWinner(room, round, 'c1')
    expect(result.p1[0].trapTriggered).toBe(true)
  })

  it('does not set trapTriggered when trap target is not in the round', () => {
    const trapper = { id: 'c1', ownerId: 'p1', wins: 0, losses: 0, battles: [], trapTarget: { targetId: 'c99' } }
    const other   = { id: 'c2', ownerId: 'p2', wins: 0, losses: 0, battles: [] }
    const round   = { id: 'r1', combatants: [trapper, other], winner: trapper }
    const room    = makeRoomWithCombatants(trapper, other)
    const result  = applyWinner(room, round, 'c1')
    expect(result.p1[0].trapTriggered).toBeUndefined()
  })

  it('does not set trapTriggered on combatants with no trapTarget', () => {
    const c1 = { id: 'c1', ownerId: 'p1', wins: 0, losses: 0, battles: [] }
    const c2 = { id: 'c2', ownerId: 'p2', wins: 0, losses: 0, battles: [] }
    const round = { id: 'r1', combatants: [c1, c2], winner: c1 }
    const result = applyWinner(makeRoomWithCombatants(c1, c2), round, 'c1')
    expect(result.p1[0].trapTriggered).toBeUndefined()
    expect(result.p2[0].trapTriggered).toBeUndefined()
  })

  it('does not mutate the original room', () => {
    const c1 = { id: 'c1', ownerId: 'p1', wins: 0, losses: 0, battles: [] }
    const c2 = { id: 'c2', ownerId: 'p2', wins: 0, losses: 0, battles: [] }
    const room = makeRoomWithCombatants(c1, c2)
    const original = JSON.parse(JSON.stringify(room))
    applyWinner(room, { id: 'r1', combatants: [c1, c2], winner: c1 }, 'c1')
    expect(room).toEqual(original)
  })
})

// ─── simulateGameToEnd ────────────────────────────────────────────────────────

describe('simulateGameToEnd', () => {
  it('simulates all 8 rounds from a fresh game (currentRound 0)', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const result = simulateGameToEnd(room)
    expect(result.rounds).toHaveLength(8)
    expect(result.currentRound).toBe(8)
    expect(result.phase).toBe('battle')
  })

  it('every simulated round has a winner', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const result = simulateGameToEnd(room)
    result.rounds.forEach(r => {
      expect(r.winner).not.toBeNull()
      expect(r.winner).toBeDefined()
    })
  })

  it('continues from mid-game (currentRound 3, 3 completed rounds)', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    // Build 3 completed rounds manually
    let partial = simulateGameToEnd({ ...room, currentRound: 0, rounds: [] })
    // Trim to 3 rounds to simulate mid-game state
    partial = { ...partial, rounds: partial.rounds.slice(0, 3), currentRound: 3 }
    const result = simulateGameToEnd(partial)
    expect(result.rounds).toHaveLength(8)
    expect(result.currentRound).toBe(8)
  })

  it('resolves an open (winner-less) round in-place without duplicating it', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const c1 = room.combatants.p1[0]
    const c2 = room.combatants.p2[0]
    // Simulate round 1 open — round exists, no winner
    const openRound = { id: 'rd_open', number: 1, combatants: [c1, c2], picks: {}, winner: null, createdAt: Date.now() }
    const midRoom = { ...room, currentRound: 1, rounds: [openRound] }
    const result = simulateGameToEnd(midRoom)
    // Round 1 should be resolved in-place (same id), not duplicated
    expect(result.rounds[0].id).toBe('rd_open')
    expect(result.rounds[0].winner).not.toBeNull()
    expect(result.rounds).toHaveLength(8)
  })

  it('accumulates win/loss stats on combatants', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const result = simulateGameToEnd(room)
    // Each player's combatants should have 1 win+loss total across all 8 slots
    const p1Stats = result.combatants.p1.map(c => c.wins + c.losses)
    const p2Stats = result.combatants.p2.map(c => c.wins + c.losses)
    p1Stats.forEach(total => expect(total).toBe(1))
    p2Stats.forEach(total => expect(total).toBe(1))
  })

  it('each combatant gets exactly one round record', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const result = simulateGameToEnd(room)
    result.combatants.p1.forEach(c => expect(c.battles).toHaveLength(1))
    result.combatants.p2.forEach(c => expect(c.battles).toHaveLength(1))
  })

  it('breaks early if a matchup slot is empty', () => {
    const room = makeRoom()
    // Give p2 only 3 combatants — totalRounds will be 3
    room.combatants.p2 = room.combatants.p2.slice(0, 3)
    const result = simulateGameToEnd({ ...room, currentRound: 0, rounds: [] })
    expect(result.rounds).toHaveLength(3)
  })

  it("sets phase to 'battle' even when totalRounds is 0", () => {
    const room = makeRoom()
    room.combatants.p1 = []
    const result = simulateGameToEnd({ ...room, currentRound: 0, rounds: [] })
    expect(result.rounds).toHaveLength(0)
    expect(result.phase).toBe('battle')
  })

  it('does not mutate the original room', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const original = JSON.parse(JSON.stringify(room))
    simulateGameToEnd(room)
    expect(room).toEqual(original)
  })

  it('winner is always one of the round combatants', () => {
    const room = makeRoom({ currentRound: 0, rounds: [] })
    const result = simulateGameToEnd(room)
    result.rounds.forEach(r => {
      const ids = r.combatants.map(c => c.id)
      expect(ids).toContain(r.winner.id)
    })
  })
})

// ─── getLineageStats ──────────────────────────────────────────────────────────

describe('getLineageStats', () => {
  const root    = { id: 'c1', wins: 3, losses: 1, reactions_heart: 2, reactions_angry: 0, reactions_cry: 1 }
  const variant = { id: 'c2', wins: 2, losses: 0, reactions_heart: 1, reactions_angry: 1, reactions_cry: 0, lineage: { rootId: 'c1', parentId: 'c1', generation: 1 } }
  const other   = { id: 'c3', wins: 10, losses: 5, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }

  it('returns zeros with no matching combatants', () => {
    expect(getLineageStats('c1', [])).toEqual({ wins: 0, losses: 0, heart: 0, angry: 0, cry: 0, forms: 0 })
  })

  it('counts root own stats when it is the only form', () => {
    const result = getLineageStats('c1', [root])
    expect(result).toEqual({ wins: 3, losses: 1, heart: 2, angry: 0, cry: 1, forms: 1 })
  })

  it('sums root and all variants', () => {
    const result = getLineageStats('c1', [root, variant, other])
    expect(result.wins).toBe(5)
    expect(result.losses).toBe(1)
    expect(result.heart).toBe(3)
    expect(result.angry).toBe(1)
    expect(result.cry).toBe(1)
    expect(result.forms).toBe(2)
  })

  it('ignores combatants from a different lineage', () => {
    const result = getLineageStats('c1', [root, other])
    expect(result.wins).toBe(3)
    expect(result.forms).toBe(1)
  })

  it('handles null/undefined allCombatants', () => {
    expect(getLineageStats('c1', null)).toEqual({ wins: 0, losses: 0, heart: 0, angry: 0, cry: 0, forms: 0 })
    expect(getLineageStats('c1', undefined)).toEqual({ wins: 0, losses: 0, heart: 0, angry: 0, cry: 0, forms: 0 })
  })

  it('handles missing stat fields on combatant', () => {
    const sparse = { id: 'c1' }
    const result = getLineageStats('c1', [sparse])
    expect(result).toEqual({ wins: 0, losses: 0, heart: 0, angry: 0, cry: 0, forms: 1 })
  })
})

// ─── buildActiveFormMap ───────────────────────────────────────────────────────

describe('buildActiveFormMap', () => {
  function makeEvolvedRoom(code, fromId, fromName, toId, toName, roundNumber = 1) {
    return {
      code,
      rounds: [{
        id: 'rd1', number: roundNumber,
        combatants: [{ id: fromId, name: fromName }, { id: 'opp', name: 'Opponent' }],
        winner: { id: fromId },
        evolution: { fromId, fromName, toId, toName, authorId: 'p1' },
      }],
    }
  }

  it('returns empty map for rooms with no evolutions', () => {
    const room = { code: 'A', rounds: [{ id: 'r1', number: 1, combatants: [], winner: null }] }
    expect(buildActiveFormMap([room])).toEqual({})
  })

  it('maps a single evolution', () => {
    const room = makeEvolvedRoom('A', 'c1', 'MJ', 'c2', 'MJ scuffed')
    expect(buildActiveFormMap([room])).toEqual({ c1: 'c2' })
  })

  it('chains: A→B then B→C collapses to A→C', () => {
    const room1 = makeEvolvedRoom('A', 'c1', 'MJ', 'c2', 'MJ scuffed')
    const room2 = makeEvolvedRoom('B', 'c2', 'MJ scuffed', 'c3', 'MJ magic carpet')
    expect(buildActiveFormMap([room1, room2])).toEqual({ c1: 'c3' })
  })

  it('handles multiple independent lineages in the same chain', () => {
    const room = {
      code: 'A',
      rounds: [
        { id: 'r1', number: 1, combatants: [], winner: null, evolution: { fromId: 'c1', fromName: 'A', toId: 'c2', toName: 'A2', authorId: 'p1' } },
        { id: 'r2', number: 2, combatants: [], winner: null, evolution: { fromId: 'd1', fromName: 'B', toId: 'd2', toName: 'B2', authorId: 'p1' } },
      ],
    }
    const result = buildActiveFormMap([room])
    expect(result).toEqual({ c1: 'c2', d1: 'd2' })
  })

  it('handles null/empty rooms', () => {
    expect(buildActiveFormMap([])).toEqual({})
    expect(buildActiveFormMap(null)).toEqual({})
  })

  it('does not mutate inputs', () => {
    const room = makeEvolvedRoom('A', 'c1', 'MJ', 'c2', 'MJ2')
    const original = JSON.parse(JSON.stringify(room))
    buildActiveFormMap([room])
    expect(room).toEqual(original)
  })
})

// ─── buildChainEvolutionStory ─────────────────────────────────────────────────

describe('buildChainEvolutionStory', () => {
  function makeEvolvedRoom(code, evolutions) {
    // evolutions: [{ fromId, fromName, toId, toName, roundNumber, opponentId, opponentName }]
    return {
      code,
      rounds: evolutions.map(e => ({
        id:         'rd' + e.roundNumber,
        number:     e.roundNumber,
        combatants: [
          { id: e.fromId, name: e.fromName },
          { id: e.opponentId || 'opp', name: e.opponentName || 'Opponent' },
        ],
        winner:    { id: e.fromId },
        evolution: { fromId: e.fromId, fromName: e.fromName, toId: e.toId, toName: e.toName, authorId: 'p1' },
      })),
    }
  }

  it('returns empty array when rootId was never evolved', () => {
    const room = { code: 'A', rounds: [{ id: 'r1', number: 1, combatants: [], winner: null }] }
    expect(buildChainEvolutionStory([room], 'c1')).toEqual([])
  })

  it('returns empty array for null/empty rooms', () => {
    expect(buildChainEvolutionStory([], 'c1')).toEqual([])
    expect(buildChainEvolutionStory(null, 'c1')).toEqual([])
  })

  it('single evolution produces two entries: original + variant', () => {
    const room = makeEvolvedRoom('XKQT', [
      { fromId: 'c1', fromName: 'MJ', toId: 'c2', toName: 'MJ scuffed', roundNumber: 2, opponentName: 'Stick in Road' },
    ])
    const story = buildChainEvolutionStory([room], 'c1')
    expect(story).toHaveLength(2)
    expect(story[0]).toEqual({ combatantId: 'c1', name: 'MJ', generation: 0, bornFrom: null })
    expect(story[1].combatantId).toBe('c2')
    expect(story[1].name).toBe('MJ scuffed')
    expect(story[1].generation).toBe(1)
  })

  it('captures bornFrom context: roundNumber, gameCode, opponentName, parentId, parentName', () => {
    const room = makeEvolvedRoom('XKQT', [
      { fromId: 'c1', fromName: 'MJ', toId: 'c2', toName: 'MJ scuffed', roundNumber: 2, opponentName: 'Stick in Road' },
    ])
    const story = buildChainEvolutionStory([room], 'c1')
    expect(story[1].bornFrom).toEqual({
      roundNumber:  2,
      gameCode:     'XKQT',
      opponentName: 'Stick in Road',
      parentId:     'c1',
      parentName:   'MJ',
    })
  })

  it('chains across multiple rooms: A→B (room1), B→C (room2)', () => {
    const room1 = makeEvolvedRoom('XKQT', [
      { fromId: 'c1', fromName: 'MJ', toId: 'c2', toName: 'MJ scuffed', roundNumber: 2 },
    ])
    const room2 = makeEvolvedRoom('BPMZ', [
      { fromId: 'c2', fromName: 'MJ scuffed', toId: 'c3', toName: 'MJ magic carpet', roundNumber: 4 },
    ])
    const story = buildChainEvolutionStory([room1, room2], 'c1')
    expect(story).toHaveLength(3)
    expect(story[2].name).toBe('MJ magic carpet')
    expect(story[2].generation).toBe(2)
    expect(story[2].bornFrom.gameCode).toBe('BPMZ')
  })

  it('ignores evolutions belonging to a different lineage', () => {
    const room = {
      code: 'A',
      rounds: [
        { id: 'r1', number: 1, combatants: [{ id: 'z1', name: 'Z' }, { id: 'opp', name: 'O' }], winner: null,
          evolution: { fromId: 'z1', fromName: 'Z', toId: 'z2', toName: 'Z2', authorId: 'p1' } },
      ],
    }
    expect(buildChainEvolutionStory([room], 'c1')).toEqual([])
  })

  it('generations are sequential integers starting at 0', () => {
    const room1 = makeEvolvedRoom('A', [{ fromId: 'c1', fromName: 'A', toId: 'c2', toName: 'B', roundNumber: 1 }])
    const room2 = makeEvolvedRoom('B', [{ fromId: 'c2', fromName: 'B', toId: 'c3', toName: 'C', roundNumber: 1 }])
    const room3 = makeEvolvedRoom('C', [{ fromId: 'c3', fromName: 'C', toId: 'c4', toName: 'D', roundNumber: 1 }])
    const story = buildChainEvolutionStory([room1, room2, room3], 'c1')
    expect(story.map(s => s.generation)).toEqual([0, 1, 2, 3])
  })
})

// ─── buildStoryFromLineageTree ────────────────────────────────────────────────

describe('buildStoryFromLineageTree', () => {
  const root = { id: 'c1', name: 'MJ', lineage: null }
  const v1   = { id: 'c2', name: 'MJ scuffed', lineage: { generation: 1, rootId: 'c1', parentId: 'c1', bornFrom: { opponentName: 'Stick', roundNumber: 2, gameCode: 'XKQT', parentName: 'MJ' } } }
  const v2   = { id: 'c3', name: 'MJ magic carpet', lineage: { generation: 2, rootId: 'c1', parentId: 'c2', bornFrom: { opponentName: 'Goat', roundNumber: 5, gameCode: 'BPMZ', parentName: 'MJ scuffed' } } }

  it('returns empty array for null/empty input', () => {
    expect(buildStoryFromLineageTree(null)).toEqual([])
    expect(buildStoryFromLineageTree([])).toEqual([])
  })

  it('returns a single entry for a root with no variants', () => {
    const story = buildStoryFromLineageTree([root])
    expect(story).toHaveLength(1)
    expect(story[0]).toEqual({ combatantId: 'c1', name: 'MJ', generation: 0, bornFrom: null })
  })

  it('returns root then variants ordered by generation', () => {
    const story = buildStoryFromLineageTree([v1, root, v2]) // intentionally shuffled
    expect(story.map(s => s.generation)).toEqual([0, 1, 2])
    expect(story.map(s => s.name)).toEqual(['MJ', 'MJ scuffed', 'MJ magic carpet'])
  })

  it('includes bornFrom context on variants', () => {
    const story = buildStoryFromLineageTree([root, v1])
    expect(story[1].bornFrom).toEqual({ opponentName: 'Stick', roundNumber: 2, gameCode: 'XKQT', parentName: 'MJ' })
  })

  it('root always has bornFrom null', () => {
    const story = buildStoryFromLineageTree([root, v1])
    expect(story[0].bornFrom).toBeNull()
  })

  it('produces same shape as buildChainEvolutionStory', () => {
    const story = buildStoryFromLineageTree([root, v1])
    story.forEach(node => {
      expect(node).toHaveProperty('combatantId')
      expect(node).toHaveProperty('name')
      expect(node).toHaveProperty('generation')
      expect(node).toHaveProperty('bornFrom')
    })
  })

  it('does not mutate input array', () => {
    const input = [v2, root, v1]
    const copy  = [...input]
    buildStoryFromLineageTree(input)
    expect(input).toEqual(copy)
  })
})

// ─── applyActiveFormMap ───────────────────────────────────────────────────────

describe('applyActiveFormMap', () => {
  const variant = { id: 'c2', name: 'MJ scuffed', bio: 'took a tumble' }
  const byId = { c2: variant }

  it('returns empty object for null/missing prevWinners', () => {
    expect(applyActiveFormMap(null, {}, {})).toEqual({})
    expect(applyActiveFormMap(undefined, {}, {})).toEqual({})
  })

  it('returns prevWinners unchanged when activeFormMap is empty', () => {
    const pw = { p1: [{ id: 'c1', name: 'MJ', bio: '' }] }
    expect(applyActiveFormMap(pw, {}, byId)).toEqual(pw)
  })

  it('substitutes an evolved winner with their variant', () => {
    const pw = { p1: [{ id: 'c1', name: 'MJ', bio: '' }] }
    const result = applyActiveFormMap(pw, { c1: 'c2' }, byId)
    expect(result.p1[0]).toEqual({ id: 'c2', name: 'MJ scuffed', bio: 'took a tumble' })
  })

  it('leaves winner unchanged when variant is not found in combatantsById', () => {
    const pw = { p1: [{ id: 'c1', name: 'MJ', bio: '' }] }
    const result = applyActiveFormMap(pw, { c1: 'c2' }, {})
    expect(result.p1[0]).toEqual({ id: 'c1', name: 'MJ', bio: '' })
  })

  it('handles multiple owners with partial substitutions', () => {
    const pw = {
      p1: [{ id: 'c1', name: 'MJ', bio: '' }],
      p2: [{ id: 'd1', name: 'Goat', bio: 'baa' }],
    }
    const result = applyActiveFormMap(pw, { c1: 'c2' }, byId)
    expect(result.p1[0].id).toBe('c2')
    expect(result.p2[0].id).toBe('d1') // unchanged
  })

  it('defaults bio to empty string when variant bio is absent', () => {
    const pw = { p1: [{ id: 'c1', name: 'MJ', bio: '' }] }
    const nobio = { c2: { id: 'c2', name: 'MJ scuffed' } }
    const result = applyActiveFormMap(pw, { c1: 'c2' }, nobio)
    expect(result.p1[0].bio).toBe('')
  })

  it('does not mutate inputs', () => {
    const pw = { p1: [{ id: 'c1', name: 'MJ', bio: '' }] }
    const map = { c1: 'c2' }
    const original = JSON.parse(JSON.stringify(pw))
    applyActiveFormMap(pw, map, byId)
    expect(pw).toEqual(original)
  })
})

// ─── computeSeriesStandings ───────────────────────────────────────────────────

describe('computeSeriesStandings', () => {
  const p1 = { id: 'p1', name: 'Alice', isBot: false }
  const p2 = { id: 'p2', name: 'Bob',   isBot: false }
  const bot = { id: 'bot1', name: 'Bot', isBot: true }

  function makeRoom(players, rounds, opts = {}) {
    return { id: 'r' + Math.random(), players, rounds, devMode: false, ...opts }
  }

  it('returns empty array for no rooms', () => {
    expect(computeSeriesStandings([])).toEqual([])
    expect(computeSeriesStandings(null)).toEqual([])
  })

  it('counts wins and losses across a single room', () => {
    const rounds = [
      { winner: { id: 'c1', ownerId: 'p1' }, combatants: [{ id: 'c1', ownerId: 'p1' }, { id: 'c2', ownerId: 'p2' }] },
      { winner: { id: 'c3', ownerId: 'p2' }, combatants: [{ id: 'c3', ownerId: 'p2' }, { id: 'c4', ownerId: 'p1' }] },
    ]
    const rows = computeSeriesStandings([makeRoom([p1, p2], rounds)])
    const alice = rows.find(r => r.playerId === 'p1')
    const bob   = rows.find(r => r.playerId === 'p2')
    expect(alice).toMatchObject({ wins: 1, losses: 1, games: 1 })
    expect(bob).toMatchObject({ wins: 1, losses: 1, games: 1 })
  })

  it('accumulates across multiple rooms', () => {
    const winRound = (winnerId, loserId) => ({
      winner: { id: 'c-' + winnerId, ownerId: winnerId },
      combatants: [{ id: 'c-' + winnerId, ownerId: winnerId }, { id: 'c-' + loserId, ownerId: loserId }],
    })
    const room1 = makeRoom([p1, p2], [winRound('p1', 'p2'), winRound('p1', 'p2')])
    const room2 = makeRoom([p1, p2], [winRound('p2', 'p1')])
    const rows = computeSeriesStandings([room1, room2])
    const alice = rows.find(r => r.playerId === 'p1')
    const bob   = rows.find(r => r.playerId === 'p2')
    expect(alice).toMatchObject({ wins: 2, losses: 1, games: 2 })
    expect(bob).toMatchObject({ wins: 1, losses: 2, games: 2 })
  })

  it('sorts by wins descending, losses ascending as tiebreak', () => {
    const winRound = (winnerId, loserId) => ({
      winner: { id: 'c-' + winnerId, ownerId: winnerId },
      combatants: [{ id: 'c-' + winnerId, ownerId: winnerId }, { id: 'c-' + loserId, ownerId: loserId }],
    })
    const room = makeRoom([p1, p2], [winRound('p1', 'p2'), winRound('p1', 'p2'), winRound('p2', 'p1')])
    const rows = computeSeriesStandings([room])
    expect(rows[0].playerId).toBe('p1')
    expect(rows[1].playerId).toBe('p2')
  })

  it('counts draws for both combatant owners', () => {
    const drawRound = {
      draw: true,
      combatants: [{ id: 'c1', ownerId: 'p1' }, { id: 'c2', ownerId: 'p2' }],
    }
    const rows = computeSeriesStandings([makeRoom([p1, p2], [drawRound])])
    const alice = rows.find(r => r.playerId === 'p1')
    const bob   = rows.find(r => r.playerId === 'p2')
    expect(alice).toMatchObject({ wins: 0, losses: 0, draws: 1 })
    expect(bob).toMatchObject({ wins: 0, losses: 0, draws: 1 })
  })

  it('skips devMode rooms', () => {
    const round = { winner: { id: 'c1', ownerId: 'p1' }, combatants: [{ id: 'c1', ownerId: 'p1' }, { id: 'c2', ownerId: 'p2' }] }
    const rows = computeSeriesStandings([makeRoom([p1, p2], [round], { devMode: true })])
    expect(rows).toEqual([])
  })

  it('excludes bots from standings', () => {
    const round = { winner: { id: 'c1', ownerId: 'p1' }, combatants: [{ id: 'c1', ownerId: 'p1' }, { id: 'c2', ownerId: 'bot1' }] }
    const rows = computeSeriesStandings([makeRoom([p1, bot], [round])])
    expect(rows.find(r => r.playerId === 'bot1')).toBeUndefined()
    expect(rows.find(r => r.playerId === 'p1')).toMatchObject({ wins: 1, games: 1 })
  })

  it('handles rooms with no completed rounds', () => {
    const rows = computeSeriesStandings([makeRoom([p1, p2], [])])
    expect(rows.find(r => r.playerId === 'p1')).toMatchObject({ wins: 0, losses: 0, draws: 0, games: 1 })
  })

  it('handles rooms with no rounds key at all', () => {
    const room = { id: 'r1', players: [p1, p2], devMode: false }
    expect(() => computeSeriesStandings([room])).not.toThrow()
    const rows = computeSeriesStandings([room])
    expect(rows.find(r => r.playerId === 'p1')).toMatchObject({ games: 1 })
  })

  it('does not credit a draw to a combatant whose owner is not in standings (e.g. bot)', () => {
    const drawRound = {
      draw: true,
      combatants: [{ id: 'c1', ownerId: 'p1' }, { id: 'cbot', ownerId: 'bot1' }],
    }
    const rows = computeSeriesStandings([makeRoom([p1, bot], [drawRound])])
    const alice = rows.find(r => r.playerId === 'p1')
    // p1 gets a draw credit; bot1 is excluded from standings
    expect(alice).toMatchObject({ draws: 1 })
    expect(rows.find(r => r.playerId === 'bot1')).toBeUndefined()
  })
})

// ─── applyDraw / undoRound (draw) ─────────────────────────────────────────────

describe('applyDraw', () => {
  const room = {
    combatants: {
      p1: [{ id: 'c1', name: 'A', wins: 1, losses: 0, draws: 0, battles: [] }],
      p2: [{ id: 'c2', name: 'B', wins: 0, losses: 1, draws: 0, battles: [] }],
    },
  }
  const round = { id: 'r1', combatants: [{ id: 'c1', name: 'A', ownerId: 'p1' }, { id: 'c2', name: 'B', ownerId: 'p2' }] }

  it('increments draws for both combatants', () => {
    const result = applyDraw(room, round)
    expect(result.p1[0].draws).toBe(1)
    expect(result.p2[0].draws).toBe(1)
  })

  it('does not increment wins or losses', () => {
    const result = applyDraw(room, round)
    expect(result.p1[0].wins).toBe(1)
    expect(result.p1[0].losses).toBe(0)
    expect(result.p2[0].wins).toBe(0)
    expect(result.p2[0].losses).toBe(1)
  })

  it('appends draw round records for both', () => {
    const result = applyDraw(room, round)
    expect(result.p1[0].battles).toHaveLength(1)
    expect(result.p1[0].battles[0]).toMatchObject({ roundId: 'r1', result: 'draw', opponent: 'B' })
    expect(result.p2[0].battles[0]).toMatchObject({ roundId: 'r1', result: 'draw', opponent: 'A' })
  })

  it('does not mutate input', () => {
    const original = JSON.parse(JSON.stringify(room))
    applyDraw(room, round)
    expect(room).toEqual(original)
  })
})

describe('undoRound (draw)', () => {
  const room = {
    combatants: {
      p1: [{ id: 'c1', name: 'A', wins: 0, losses: 0, draws: 1, battles: [{ roundId: 'r1', result: 'draw' }] }],
      p2: [{ id: 'c2', name: 'B', wins: 0, losses: 0, draws: 1, battles: [{ roundId: 'r1', result: 'draw' }] }],
    },
  }
  const round = { id: 'r1', draw: true, combatants: [{ id: 'c1', ownerId: 'p1' }, { id: 'c2', ownerId: 'p2' }] }

  it('decrements draws for both combatants', () => {
    const result = undoRound(room, round)
    expect(result.p1[0].draws).toBe(0)
    expect(result.p2[0].draws).toBe(0)
  })

  it('removes round records for that round', () => {
    const result = undoRound(room, round)
    expect(result.p1[0].battles).toHaveLength(0)
    expect(result.p2[0].battles).toHaveLength(0)
  })

  it('clamps draws to 0, never negative', () => {
    const noDraws = { combatants: { p1: [{ id: 'c1', draws: 0, battles: [] }], p2: [{ id: 'c2', draws: 0, battles: [] }] } }
    const result = undoRound(noDraws, round)
    expect(result.p1[0].draws).toBe(0)
  })

  it('returns unchanged combatants when round is not resolved', () => {
    const unresolved = { id: 'r9', combatants: round.combatants }
    const result = undoRound(room, unresolved)
    expect(result).toEqual(room.combatants)
  })
})

describe('canUndoLastRound (draw)', () => {
  it('allows undo of a draw round', () => {
    expect(canUndoLastRound(true, 1, { draw: true, combatants: [] })).toBe(true)
  })

  it('disallows undo when round has no winner and no draw', () => {
    expect(canUndoLastRound(true, 1, { combatants: [] })).toBe(false)
  })
})

// ─── replacePlayerIdInRoom ────────────────────────────────────────────────────

describe('replacePlayerIdInRoom', () => {
  const OLD = 'guest-1'
  const NEW = 'user-99'

  function makeRoom(overrides = {}) {
    return {
      id: 'room1',
      host: OLD,
      players: [{ id: OLD, name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      combatants: {
        [OLD]: [{ id: 'c1', ownerId: OLD }, { id: 'c2', ownerId: OLD }],
        p2:    [{ id: 'c3', ownerId: 'p2' }],
      },
      rounds: [
        {
          id: 'r1',
          combatants: [{ id: 'c1', ownerId: OLD }, { id: 'c3', ownerId: 'p2' }],
          winner:     { id: 'c1', ownerId: OLD },
          picks:      { [OLD]: 'c1', p2: 'c3' },
          playerReactions: { [OLD]: { c3: 'heart' }, p2: { c1: 'angry' } },
          chat:       [{ playerId: OLD, text: 'hi' }, { playerId: 'p2', text: 'yo' }],
        },
      ],
      prevWinners: { [OLD]: [{ id: 'c1', name: 'A' }], p2: [] },
      ...overrides,
    }
  }

  it('updates host', () => {
    expect(replacePlayerIdInRoom(makeRoom(), OLD, NEW).host).toBe(NEW)
  })

  it('does not change unrelated host', () => {
    const room = makeRoom({ host: 'p2' })
    expect(replacePlayerIdInRoom(room, OLD, NEW).host).toBe('p2')
  })

  it('updates player id in players list', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.players.find(p => p.id === NEW)).toBeTruthy()
    expect(result.players.find(p => p.id === OLD)).toBeUndefined()
  })

  it('remaps combatants map key and ownerId', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.combatants[NEW]).toHaveLength(2)
    expect(result.combatants[NEW][0].ownerId).toBe(NEW)
    expect(result.combatants[OLD]).toBeUndefined()
    expect(result.combatants.p2[0].ownerId).toBe('p2') // unchanged
  })

  it('updates round combatant ownerId', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    const rc = result.rounds[0].combatants.find(c => c.ownerId === NEW)
    expect(rc).toBeTruthy()
    expect(result.rounds[0].combatants.find(c => c.ownerId === OLD)).toBeUndefined()
  })

  it('updates round winner ownerId', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.rounds[0].winner.ownerId).toBe(NEW)
  })

  it('remaps picks key', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.rounds[0].picks[NEW]).toBe('c1')
    expect(result.rounds[0].picks[OLD]).toBeUndefined()
    expect(result.rounds[0].picks.p2).toBe('c3') // unchanged
  })

  it('remaps playerReactions key', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.rounds[0].playerReactions[NEW]).toEqual({ c3: 'heart' })
    expect(result.rounds[0].playerReactions[OLD]).toBeUndefined()
  })

  it('updates chat playerId', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.rounds[0].chat[0].playerId).toBe(NEW)
    expect(result.rounds[0].chat[1].playerId).toBe('p2') // unchanged
  })

  it('remaps prevWinners key', () => {
    const result = replacePlayerIdInRoom(makeRoom(), OLD, NEW)
    expect(result.prevWinners[NEW]).toBeTruthy()
    expect(result.prevWinners[OLD]).toBeUndefined()
    expect(result.prevWinners.p2).toEqual([]) // unchanged
  })

  it('is a no-op when oldId === newId', () => {
    const room = makeRoom()
    expect(replacePlayerIdInRoom(room, OLD, OLD)).toEqual(room)
  })

  it('does not mutate the input', () => {
    const room = makeRoom()
    const original = JSON.parse(JSON.stringify(room))
    replacePlayerIdInRoom(room, OLD, NEW)
    expect(room).toEqual(original)
  })
})

// ─── buildEvolutionRound ──────────────────────────────────────────────────────

describe('buildEvolutionRound', () => {
  const winner   = { id: 'c1', name: 'Titan',   bio: 'Big.', ownerId: 'p1', ownerName: 'Alice' }
  const opponent = { id: 'c2', name: 'Specter', bio: 'Fast.', ownerId: 'p2', ownerName: 'Bob' }

  function makeRound(overrides = {}) {
    return {
      id: 'r1', number: 1,
      combatants: [winner, opponent],
      picks: {},
      evolutionPending: { winnerId: 'c1', requestedFrom: 'p1' },
      ...overrides,
    }
  }

  it('returns a round with winner set to the winning combatant', () => {
    const result = buildEvolutionRound(makeRound(), 'c1', 'v1', 'Titan Prime', 'Upgraded.', 'p1', 'p1')
    expect(result.winner).toEqual(winner)
  })

  it('builds the evolution object with all required fields', () => {
    const result = buildEvolutionRound(makeRound(), 'c1', 'v1', 'Titan Prime', 'Upgraded.', 'p1', 'p1')
    expect(result.evolution).toEqual({
      fromId:    'c1',
      fromName:  'Titan',
      toId:      'v1',
      toName:    'Titan Prime',
      toBio:     'Upgraded.',
      ownerId:   'p1',
      ownerName: 'Alice',
      authorId:  'p1',
    })
  })

  it('records the picker\'s vote in picks', () => {
    const result = buildEvolutionRound(makeRound(), 'c1', 'v1', 'Titan Prime', 'Upgraded.', 'p1', 'p1')
    expect(result.picks['p1']).toBe('c1')
  })

  it('preserves existing picks from other players', () => {
    const round = makeRound({ picks: { p2: 'c2' } })
    const result = buildEvolutionRound(round, 'c1', 'v1', 'Titan Prime', '', 'p1', 'p1')
    expect(result.picks['p2']).toBe('c2')
    expect(result.picks['p1']).toBe('c1')
  })

  it('sets resolvedAt to a recent timestamp', () => {
    const before = Date.now()
    const result = buildEvolutionRound(makeRound(), 'c1', 'v1', 'Titan Prime', '', 'p1', 'p1')
    expect(result.resolvedAt).toBeGreaterThanOrEqual(before)
    expect(result.resolvedAt).toBeLessThanOrEqual(Date.now())
  })

  it('removes evolutionPending from the returned round', () => {
    const result = buildEvolutionRound(makeRound(), 'c1', 'v1', 'Titan Prime', '', 'p1', 'p1')
    expect(result.evolutionPending).toBeUndefined()
  })

  it('defaults variantBio to empty string when falsy', () => {
    const result = buildEvolutionRound(makeRound(), 'c1', 'v1', 'Titan Prime', '', 'p1', 'p1')
    expect(result.evolution.toBio).toBe('')
  })

  it('preserves all other round fields', () => {
    const round = makeRound({ number: 3, playerReactions: { p1: { c1: 'heart' } } })
    const result = buildEvolutionRound(round, 'c1', 'v1', 'Titan Prime', '', 'p1', 'p1')
    expect(result.number).toBe(3)
    expect(result.playerReactions).toEqual({ p1: { c1: 'heart' } })
  })

  it('does not mutate the input round', () => {
    const round    = makeRound()
    const original = JSON.parse(JSON.stringify(round))
    buildEvolutionRound(round, 'c1', 'v1', 'Titan Prime', '', 'p1', 'p1')
    expect(round).toEqual(original)
  })

  it('throws when winnerId is not found in round.combatants', () => {
    expect(() => buildEvolutionRound(makeRound(), 'c99', 'v1', 'Titan Prime', '', 'p1', 'p1'))
      .toThrow('not found in round.combatants')
  })

  it('throws when winnerId is missing', () => {
    expect(() => buildEvolutionRound(makeRound(), '', 'v1', 'Titan Prime', '', 'p1', 'p1'))
      .toThrow('winnerId is required')
  })

  it('throws when newId is missing', () => {
    expect(() => buildEvolutionRound(makeRound(), 'c1', '', 'Titan Prime', '', 'p1', 'p1'))
      .toThrow('newId is required')
  })

  it('throws when newName is blank', () => {
    expect(() => buildEvolutionRound(makeRound(), 'c1', 'v1', '   ', '', 'p1', 'p1'))
      .toThrow('newName is required')
  })
})

describe('getEphemeralBadges', () => {
  function makeBattles(results) {
    return results.map((result, i) => ({ roundId: `r${i}`, opponent: 'Someone', result }))
  }

  it('returns empty array for a combatant with no battles', () => {
    expect(getEphemeralBadges({ battles: [] })).toEqual([])
  })

  it('returns empty array when no battles field exists', () => {
    expect(getEphemeralBadges({})).toEqual([])
  })

  it('returns no badge for 2 consecutive wins', () => {
    const c = { battles: makeBattles(['win', 'win']) }
    expect(getEphemeralBadges(c)).toEqual([])
  })

  it('returns on_fire with count 3 for exactly 3 consecutive wins', () => {
    const c = { battles: makeBattles(['win', 'win', 'win']) }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'on_fire', count: 3 }])
  })

  it('returns on_fire with count 5 for 5 consecutive wins', () => {
    const c = { battles: makeBattles(['win', 'win', 'win', 'win', 'win']) }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'on_fire', count: 5 }])
  })

  it('streak is broken by a non-win — 2 wins after a loss gives no badge', () => {
    const c = { battles: makeBattles(['win', 'loss', 'win', 'win']) }
    expect(getEphemeralBadges(c)).toEqual([])
  })

  it('streak counts only tail run — 1 loss then 3 wins gives on_fire 3', () => {
    const c = { battles: makeBattles(['win', 'win', 'loss', 'win', 'win', 'win']) }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'on_fire', count: 3 }])
  })

  it('returns no badge for 2 consecutive losses', () => {
    const c = { battles: makeBattles(['loss', 'loss']) }
    expect(getEphemeralBadges(c)).toEqual([])
  })

  it('returns cold_streak with count 3 for exactly 3 consecutive losses', () => {
    const c = { battles: makeBattles(['loss', 'loss', 'loss']) }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'cold_streak', count: 3 }])
  })

  it('returns cold_streak with count 4 for 4 consecutive losses', () => {
    const c = { battles: makeBattles(['win', 'loss', 'loss', 'loss', 'loss']) }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'cold_streak', count: 4 }])
  })

  it('draws break a win streak', () => {
    const c = { battles: makeBattles(['win', 'win', 'win', 'draw', 'win', 'win']) }
    expect(getEphemeralBadges(c)).toEqual([])
  })

  it('draws do not themselves trigger on_fire or cold_streak', () => {
    const c = { battles: makeBattles(['draw', 'draw', 'draw']) }
    expect(getEphemeralBadges(c)).toEqual([])
  })

  it('returns trapper badge when trapTriggered is true', () => {
    const c = { battles: [], trapTriggered: true }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'trapper' }])
  })

  it('does not return trapper badge when trapTriggered is false', () => {
    const c = { battles: [], trapTriggered: false }
    expect(getEphemeralBadges(c)).toEqual([])
  })

  it('can return both on_fire and trapper', () => {
    const c = { battles: makeBattles(['win', 'win', 'win']), trapTriggered: true }
    expect(getEphemeralBadges(c)).toEqual([{ type: 'on_fire', count: 3 }, { type: 'trapper' }])
  })
})
