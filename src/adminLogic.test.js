import { describe, it, expect } from 'vitest'
import { recalcStatsFromRooms, diffStats, planMerge, applyMergeToRoom } from './adminLogic.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRound({ id = 'r1', number = 1, combatants, winnerId, reactions = {} } = {}) {
  return {
    id, number,
    combatants,
    winner: winnerId ? combatants.find(c => c.id === winnerId) : null,
    playerReactions: reactions,
  }
}

function makeRoom({ id = 'ROOM1', rounds = [], devMode = false, players = [] } = {}) {
  return { id, code: id, players, rounds, devMode, combatants: {} }
}

function makeCombatant({ id, name = 'Fighter', ownerId = 'p1' } = {}) {
  return { id, name, ownerId }
}

// ─── recalcStatsFromRooms ─────────────────────────────────────────────────────

describe('recalcStatsFromRooms', () => {
  const c1 = makeCombatant({ id: 'c1', name: 'Alpha' })
  const c2 = makeCombatant({ id: 'c2', name: 'Beta' })

  it('counts win and loss for a completed round', () => {
    const round = makeRound({ combatants: [c1, c2], winnerId: 'c1' })
    const result = recalcStatsFromRooms([makeRoom({ rounds: [round] })])
    expect(result['c1']).toEqual({ wins: 1, losses: 0, heart: 0, angry: 0, cry: 0 })
    expect(result['c2']).toEqual({ wins: 0, losses: 1, heart: 0, angry: 0, cry: 0 })
  })

  it('skips rounds with no winner', () => {
    const round = makeRound({ combatants: [c1, c2], winnerId: null })
    const result = recalcStatsFromRooms([makeRoom({ rounds: [round] })])
    expect(result).toEqual({})
  })

  it('skips devMode rooms', () => {
    const round = makeRound({ combatants: [c1, c2], winnerId: 'c1' })
    const result = recalcStatsFromRooms([makeRoom({ rounds: [round], devMode: true })])
    expect(result).toEqual({})
  })

  it('accumulates across multiple rounds', () => {
    const round1 = makeRound({ id: 'r1', combatants: [c1, c2], winnerId: 'c1' })
    const round2 = makeRound({ id: 'r2', combatants: [c1, c2], winnerId: 'c2' })
    const result = recalcStatsFromRooms([makeRoom({ rounds: [round1, round2] })])
    expect(result['c1'].wins).toBe(1)
    expect(result['c1'].losses).toBe(1)
    expect(result['c2'].wins).toBe(1)
    expect(result['c2'].losses).toBe(1)
  })

  it('accumulates across multiple rooms', () => {
    const r1 = makeRound({ combatants: [c1, c2], winnerId: 'c1' })
    const r2 = makeRound({ combatants: [c1, c2], winnerId: 'c1' })
    const result = recalcStatsFromRooms([
      makeRoom({ id: 'A', rounds: [r1] }),
      makeRoom({ id: 'B', rounds: [r2] }),
    ])
    expect(result['c1'].wins).toBe(2)
  })

  it('counts reactions from playerReactions', () => {
    const round = makeRound({
      combatants: [c1, c2],
      winnerId: 'c1',
      reactions: {
        p1: { c1: 'heart', c2: 'angry' },
        p2: { c1: 'heart' },
      },
    })
    const result = recalcStatsFromRooms([makeRoom({ rounds: [round] })])
    expect(result['c1'].heart).toBe(2)
    expect(result['c2'].angry).toBe(1)
    expect(result['c1'].angry).toBe(0)
  })

  it('returns empty object for no rooms', () => {
    expect(recalcStatsFromRooms([])).toEqual({})
  })

  it('handles null/undefined rooms gracefully', () => {
    expect(() => recalcStatsFromRooms([null, undefined])).not.toThrow()
    expect(recalcStatsFromRooms([null, undefined])).toEqual({})
  })
})

// ─── diffStats ────────────────────────────────────────────────────────────────

describe('diffStats', () => {
  const recalculated = {
    c1: { wins: 3, losses: 1, heart: 2, angry: 0, cry: 0 },
    c2: { wins: 0, losses: 2, heart: 0, angry: 1, cry: 0 },
  }

  const currentMatch = [
    { id: 'c1', name: 'Alpha', wins: 3, losses: 1, reactions_heart: 2, reactions_angry: 0, reactions_cry: 0 },
    { id: 'c2', name: 'Beta',  wins: 0, losses: 2, reactions_heart: 0, reactions_angry: 1, reactions_cry: 0 },
  ]

  it('returns empty array when all stats match', () => {
    expect(diffStats(recalculated, currentMatch)).toEqual([])
  })

  it('detects a win discrepancy', () => {
    const current = [{ id: 'c1', name: 'Alpha', wins: 2, losses: 1, reactions_heart: 2, reactions_angry: 0, reactions_cry: 0 }]
    const result = diffStats(recalculated, current)
    expect(result).toHaveLength(1)
    expect(result[0].diffs.wins).toEqual({ was: 2, now: 3 })
  })

  it('detects reaction discrepancy', () => {
    const current = [{ id: 'c1', name: 'Alpha', wins: 3, losses: 1, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }]
    const result = diffStats(recalculated, current)
    expect(result[0].diffs.heart).toEqual({ was: 0, now: 2 })
  })

  it('treats missing DB stats as 0', () => {
    const current = [{ id: 'c1', name: 'Alpha' }] // no wins/losses fields
    const result = diffStats(recalculated, current)
    expect(result[0].diffs.wins).toEqual({ was: 0, now: 3 })
  })

  it('combatants not in recalculated show 0 for everything (no diff if DB also 0)', () => {
    const orphan = [{ id: 'zzz', name: 'Ghost', wins: 0, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }]
    expect(diffStats(recalculated, orphan)).toEqual([])
  })

  it('reports combatants in DB with stats but not in room history (should go to 0)', () => {
    const orphan = [{ id: 'zzz', name: 'Ghost', wins: 5, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }]
    const result = diffStats(recalculated, orphan)
    expect(result[0].diffs.wins).toEqual({ was: 5, now: 0 })
  })

  it('includes only fields that differ', () => {
    const current = [{ id: 'c1', name: 'Alpha', wins: 3, losses: 0, reactions_heart: 2, reactions_angry: 0, reactions_cry: 0 }]
    const result = diffStats(recalculated, current)
    expect(Object.keys(result[0].diffs)).toEqual(['losses'])
  })
})

// ─── planMerge ────────────────────────────────────────────────────────────────

describe('planMerge', () => {
  const rooms = [
    makeRoom({ id: 'A', players: [{ id: 'p1' }, { id: 'p2' }] }),
    makeRoom({ id: 'B', players: [{ id: 'p2' }, { id: 'p3' }] }),
    makeRoom({ id: 'C', players: [{ id: 'p3' }] }),
  ]
  const combatants = [
    { owner_id: 'p2' },
    { owner_id: 'p2' },
    { owner_id: 'p3' },
  ]

  it('counts rooms and combatants for the drop user', () => {
    const result = planMerge('p1', 'p2', rooms, combatants)
    expect(result.affectedRooms).toBe(2)
    expect(result.affectedCombatants).toBe(2)
  })

  it('returns zeros when drop user has no rooms or combatants', () => {
    const result = planMerge('p1', 'p9', rooms, combatants)
    expect(result).toEqual({ affectedRooms: 0, affectedCombatants: 0 })
  })

  it('returns zeros when keepId === dropId', () => {
    expect(planMerge('p1', 'p1', rooms, combatants)).toEqual({ affectedRooms: 0, affectedCombatants: 0 })
  })
})

// ─── applyMergeToRoom ─────────────────────────────────────────────────────────

describe('applyMergeToRoom', () => {
  const baseRoom = {
    id: 'ROOM1', code: 'ROOM1', host: 'drop',
    players: [{ id: 'drop', name: 'Old' }, { id: 'other', name: 'Other' }],
    combatants: {
      drop:  [{ id: 'c1', ownerId: 'drop' }],
      other: [{ id: 'c2', ownerId: 'other' }],
    },
    prevWinners: { drop: [{ id: 'cw1' }], other: [] },
    drafts: { drop: { names: ['X'] } },
  }

  it('replaces player id in players array', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    const player = result.players.find(p => p.name === 'Old')
    expect(player.id).toBe('keep')
  })

  it('does not affect other players', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    const other = result.players.find(p => p.id === 'other')
    expect(other).toBeDefined()
  })

  it('transfers host', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    expect(result.host).toBe('keep')
  })

  it('does not transfer host when drop is not host', () => {
    const room = { ...baseRoom, host: 'other' }
    const result = applyMergeToRoom(room, 'drop', 'keep')
    expect(result.host).toBe('other')
  })

  it('re-keys combatants map', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    expect(result.combatants['keep']).toBeDefined()
    expect(result.combatants['drop']).toBeUndefined()
    expect(result.combatants['other']).toBeDefined()
  })

  it('updates ownerId inside combatant objects', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    expect(result.combatants['keep'][0].ownerId).toBe('keep')
  })

  it('re-keys prevWinners map', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    expect(result.prevWinners['keep']).toBeDefined()
    expect(result.prevWinners['drop']).toBeUndefined()
  })

  it('re-keys drafts map', () => {
    const result = applyMergeToRoom(baseRoom, 'drop', 'keep')
    expect(result.drafts['keep']).toBeDefined()
    expect(result.drafts['drop']).toBeUndefined()
  })

  it('does not mutate the original room', () => {
    const original = JSON.parse(JSON.stringify(baseRoom))
    applyMergeToRoom(baseRoom, 'drop', 'keep')
    expect(baseRoom).toEqual(original)
  })

  it('handles rooms with no prevWinners or drafts', () => {
    const minimal = { ...baseRoom, prevWinners: undefined, drafts: undefined }
    expect(() => applyMergeToRoom(minimal, 'drop', 'keep')).not.toThrow()
  })
})
