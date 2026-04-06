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
