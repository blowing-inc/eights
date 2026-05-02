import { describe, it, expect } from 'vitest'
import {
  getLineageStats,
  buildActiveFormMap,
  buildChainEvolutionStory,
  buildStoryFromLineageTree,
  applyActiveFormMap,
} from './lineage.js'

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

  it('includes co-parent branch stats for merged combatants', () => {
    // Egg (c1) + Bacon (b1) + Toast (t1) merge into Breakfast (bk)
    // bk lineage: rootId=c1, coParentIds=[b1,t1]
    const egg      = { id: 'c1', wins: 3, losses: 1, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }
    const bacon    = { id: 'b1', wins: 2, losses: 0, reactions_heart: 1, reactions_angry: 0, reactions_cry: 0 }
    const toast    = { id: 't1', wins: 1, losses: 1, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }
    const breakfast = { id: 'bk', wins: 1, losses: 0, reactions_heart: 2, reactions_angry: 0, reactions_cry: 0,
      lineage: { rootId: 'c1', parentId: 'c1', coParentIds: ['b1', 't1'], generation: 1 } }
    const result = getLineageStats('c1', [egg, bacon, toast, breakfast])
    // Should include Egg + Breakfast (primary) + Bacon + Toast (co-parents)
    expect(result.wins).toBe(7)    // 3+2+1+1
    expect(result.losses).toBe(2)  // 1+0+1+0
    expect(result.heart).toBe(3)   // 0+1+0+2
    expect(result.forms).toBe(4)
  })

  it('does not double-count combatants in co-parent branches', () => {
    const egg      = { id: 'c1', wins: 3, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }
    const bacon    = { id: 'b1', wins: 2, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }
    const breakfast = { id: 'bk', wins: 1, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0,
      lineage: { rootId: 'c1', parentId: 'c1', coParentIds: ['b1'], generation: 1 } }
    const result = getLineageStats('c1', [egg, bacon, breakfast])
    expect(result.wins).toBe(6)   // 3+2+1
    expect(result.forms).toBe(3)  // egg, bacon, breakfast — no duplicates
  })

  it('co-parent lineage variants are also included', () => {
    // Bacon (b1) evolved to Bacon+ (b2), then Bacon+ merged with Egg (c1)
    const egg     = { id: 'c1', wins: 3, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }
    const bacon   = { id: 'b1', wins: 2, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0 }
    const baconPlus = { id: 'b2', wins: 1, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0,
      lineage: { rootId: 'b1', parentId: 'b1', generation: 1 } }
    const breakfast = { id: 'bk', wins: 0, losses: 0, reactions_heart: 0, reactions_angry: 0, reactions_cry: 0,
      lineage: { rootId: 'c1', parentId: 'c1', coParentIds: ['b2'], generation: 1 } }
    const result = getLineageStats('c1', [egg, bacon, baconPlus, breakfast])
    // Primary: egg + breakfast. Co-parent: b2, which has rootId b1 → also include bacon.
    expect(result.forms).toBe(4)
    expect(result.wins).toBe(6)   // 3+0+2+1
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

  function makeMergeRoom(code, { fromIds, fromNames, toId, toName, roundNumber = 1 }) {
    return {
      code,
      rounds: [{
        id: 'rd' + roundNumber, number: roundNumber,
        combatants: fromIds.map((id, i) => ({ id, name: fromNames[i] })),
        draw: { combatantIds: fromIds },
        merge: { fromIds, fromNames, toId, toName, primaryOwnerId: 'p1', primaryOwnerName: 'Alice', coOwnerIds: [], coOwnerNames: [], mergeNote: null },
      }],
    }
  }

  it('direct merge: rootId is one of the merge parents', () => {
    const room = makeMergeRoom('XKQT', {
      fromIds: ['c1', 'b1', 't1'], fromNames: ['Egg', 'Bacon', 'Toast'],
      toId: 'bk', toName: 'Breakfast', roundNumber: 3,
    })
    const story = buildChainEvolutionStory([room], 'c1')
    expect(story).toHaveLength(2)
    expect(story[0]).toEqual({ combatantId: 'c1', name: 'Egg', generation: 0, bornFrom: null })
    expect(story[1].combatantId).toBe('bk')
    expect(story[1].name).toBe('Breakfast')
    expect(story[1].generation).toBe(1)
  })

  it('merge bornFrom has type merge, parentNames, parentIds, roundNumber, gameCode', () => {
    const room = makeMergeRoom('XKQT', {
      fromIds: ['c1', 'b1', 't1'], fromNames: ['Egg', 'Bacon', 'Toast'],
      toId: 'bk', toName: 'Breakfast', roundNumber: 3,
    })
    const story = buildChainEvolutionStory([room], 'c1')
    expect(story[1].bornFrom).toEqual({
      type:        'merge',
      parentNames: ['Egg', 'Bacon', 'Toast'],
      parentIds:   ['c1', 'b1', 't1'],
      roundNumber: 3,
      gameCode:    'XKQT',
    })
  })

  it('evolution then merge: root evolves, evolved form merges', () => {
    const room1 = makeEvolvedRoom('GAME1', [
      { fromId: 'c1', fromName: 'Egg', toId: 'c2', toName: 'Egg+', roundNumber: 1 },
    ])
    const room2 = makeMergeRoom('GAME2', {
      fromIds: ['c2', 'b1'], fromNames: ['Egg+', 'Bacon'],
      toId: 'bk', toName: 'Breakfast', roundNumber: 2,
    })
    const story = buildChainEvolutionStory([room1, room2], 'c1')
    expect(story).toHaveLength(3)
    expect(story.map(s => s.name)).toEqual(['Egg', 'Egg+', 'Breakfast'])
    expect(story[1].bornFrom.opponentName).toBeDefined()  // evolution bornFrom
    expect(story[2].bornFrom.type).toBe('merge')
    expect(story[2].bornFrom.parentNames).toEqual(['Egg+', 'Bacon'])
  })

  it('ignores merge where no parent is in known IDs', () => {
    const room = makeMergeRoom('XKQT', {
      fromIds: ['z1', 'z2'], fromNames: ['Z1', 'Z2'],
      toId: 'zm', toName: 'ZMerged', roundNumber: 1,
    })
    expect(buildChainEvolutionStory([room], 'c1')).toEqual([])
  })

  it('merge using secondary parent: story still follows known ancestor', () => {
    const room = makeMergeRoom('XKQT', {
      fromIds: ['b1', 'c1', 't1'], fromNames: ['Bacon', 'Egg', 'Toast'],
      toId: 'bk', toName: 'Breakfast', roundNumber: 1,
    })
    const story = buildChainEvolutionStory([room], 'c1')
    expect(story).toHaveLength(2)
    expect(story[0].name).toBe('Egg')  // rootId=c1's name from fromNames
    expect(story[1].name).toBe('Breakfast')
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

// ─── buildChainEvolutionStory / buildStoryFromLineageTree output shape parity ─

describe('buildChainEvolutionStory and buildStoryFromLineageTree output shape parity', () => {
  // Both functions should produce nodes of exactly { combatantId, name, generation, bornFrom }.
  // buildChainEvolutionStory reads room history; buildStoryFromLineageTree reads stored lineage data.
  // When the stored bornFrom matches what the chain would compute, the outputs should be structurally identical.

  const GAME_CODE = 'XKQT'
  const ROUND_NUM = 2

  const room = {
    code: GAME_CODE,
    rounds: [{
      id:         'rd2',
      number:     ROUND_NUM,
      combatants: [{ id: 'c1', name: 'MJ' }, { id: 'opp', name: 'Stick in Road' }],
      winner:     { id: 'c1' },
      evolution:  { fromId: 'c1', fromName: 'MJ', toId: 'c2', toName: 'MJ scuffed', authorId: 'p1' },
    }],
  }

  const combatants = [
    { id: 'c1', name: 'MJ', lineage: null },
    { id: 'c2', name: 'MJ scuffed', lineage: {
      generation: 1, rootId: 'c1', parentId: 'c1',
      bornFrom: { opponentName: 'Stick in Road', roundNumber: ROUND_NUM, gameCode: GAME_CODE, parentId: 'c1', parentName: 'MJ' },
    }},
  ]

  it('both functions produce nodes with identical keys', () => {
    const chainStory = buildChainEvolutionStory([room], 'c1')
    const treeStory  = buildStoryFromLineageTree(combatants)
    expect(chainStory).toHaveLength(treeStory.length)
    chainStory.forEach((node, i) => {
      expect(Object.keys(node).sort()).toEqual(Object.keys(treeStory[i]).sort())
    })
  })

  it('both functions return the same root node (generation 0, bornFrom null)', () => {
    const chainStory = buildChainEvolutionStory([room], 'c1')
    const treeStory  = buildStoryFromLineageTree(combatants)
    expect(chainStory[0].generation).toBe(0)
    expect(chainStory[0].bornFrom).toBeNull()
    expect(treeStory[0].generation).toBe(0)
    expect(treeStory[0].bornFrom).toBeNull()
  })

  it('both functions return generation 1 node with matching bornFrom shape', () => {
    const chainNode = buildChainEvolutionStory([room], 'c1')[1]
    const treeNode  = buildStoryFromLineageTree(combatants)[1]
    // Shape check: both have the same bornFrom keys
    expect(Object.keys(chainNode.bornFrom).sort()).toEqual(Object.keys(treeNode.bornFrom).sort())
    // Value check: shared fields match
    expect(chainNode.bornFrom.roundNumber).toBe(treeNode.bornFrom.roundNumber)
    expect(chainNode.bornFrom.gameCode).toBe(treeNode.bornFrom.gameCode)
    expect(chainNode.bornFrom.opponentName).toBe(treeNode.bornFrom.opponentName)
    expect(chainNode.bornFrom.parentName).toBe(treeNode.bornFrom.parentName)
  })
})
