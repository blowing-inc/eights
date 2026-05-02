// Pure lineage / evolution logic — no React, no Supabase.
// Owns: combatant ancestry, active-form resolution (buildActiveFormMap /
//   applyActiveFormMap), and evolution story building (buildChainEvolutionStory).
// Does not own: round resolution, draft mechanics, or room settings — those live
//   in gameLogic.js.

// ─── Lineage / evolution ──────────────────────────────────────────────────────

/**
 * round.evolution shape — written to a round object when a variant is created.
 * Stored inside rooms.data JSON; no separate DB table needed.
 *
 * {
 *   fromId:    string  — global combatant ID that was evolved
 *   fromName:  string  — name at the time of evolution (snapshot)
 *   toId:      string  — global combatant ID of the new variant
 *   toName:    string  — name the variant was given
 *   authorId:  string  — playerId of whoever wrote the variant (host or owner)
 * }
 *
 * combatant.lineage shape (stored on the global combatants table):
 * null for generation-0 originals.
 *
 * {
 *   rootId:     string  — id of the original combatant at the start of the tree
 *   parentId:   string  — id of the immediate predecessor
 *   generation: number  — 0 = original, 1 = first variant, etc.
 * }
 */

/**
 * Aggregate wins/losses/reactions across an entire lineage tree.
 * Pass the root combatant's id and all global combatant records.
 * allCombatants entries use the DB column names (reactions_heart etc.).
 *
 * @param {string}   rootId
 * @param {object[]} allCombatants
 * @returns {{ wins, losses, heart, angry, cry, forms }}
 */
export function getLineageStats(rootId, allCombatants) {
  const all = allCombatants || []

  // Primary family: root itself and all descendants sharing the same rootId
  const seen = new Set()
  const family = []
  for (const c of all) {
    if (c.id === rootId || c.lineage?.rootId === rootId) {
      seen.add(c.id)
      family.push(c)
    }
  }

  // Collect co-parent root IDs from any merged combatant in the primary family
  const coParentRoots = new Set()
  for (const c of family) {
    for (const cpId of (c.lineage?.coParentIds || [])) {
      if (seen.has(cpId)) continue
      const cp = all.find(x => x.id === cpId)
      coParentRoots.add(cp?.lineage?.rootId || cpId)
    }
  }

  // Add co-parent lineage branches without double-counting
  for (const c of all) {
    if (seen.has(c.id)) continue
    const cRoot = c.lineage?.rootId || c.id
    if (coParentRoots.has(c.id) || coParentRoots.has(cRoot)) {
      seen.add(c.id)
      family.push(c)
    }
  }

  return family.reduce((acc, c) => ({
    wins:   acc.wins   + (c.wins             || 0),
    losses: acc.losses + (c.losses           || 0),
    heart:  acc.heart  + (c.reactions_heart  || 0),
    angry:  acc.angry  + (c.reactions_angry  || 0),
    cry:    acc.cry    + (c.reactions_cry     || 0),
    forms:  acc.forms  + 1,
  }), { wins: 0, losses: 0, heart: 0, angry: 0, cry: 0, forms: 0 })
}

/**
 * Walk a heritage chain's rooms and return a map of
 * { [ancestorId]: currentTipId } for every combatant evolved in that chain.
 * Returns an empty object for standalone games or chains with no evolutions.
 * Pass rooms in chronological order (oldest first).
 *
 * @param {object[]} rooms  Array of room data objects
 * @returns {{ [string]: string }}
 */
export function buildActiveFormMap(rooms) {
  const map = {}
  for (const room of (rooms || [])) {
    for (const round of (room.rounds || [])) {
      if (!round.evolution) continue
      const { fromId, toId } = round.evolution
      // If fromId is already a replacement in the map, update the root key
      const root = Object.keys(map).find(k => map[k] === fromId) || fromId
      map[root] = toId
    }
  }
  return map
}

/**
 * Builds the ordered evolution story from a lineage tree — the array returned
 * by getLineageTree(rootId) — which contains the root combatant plus all of
 * its variants in DB insertion order.
 *
 * Produces the same { combatantId, name, generation, bornFrom } shape as
 * buildChainEvolutionStory so display code is interchangeable between the two.
 * Use this when you have combatant data (The Cast, detail pages). Use
 * buildChainEvolutionStory when you have room history (ChroniclesScreen).
 *
 * Requires that each variant's lineage.bornFrom was populated at creation time
 * (VoteScreen handleEvolution, Tier 4+).
 *
 * @param {object[]} combatants  Root + all variant combatants for one character
 * @returns {{ combatantId: string, name: string, generation: number, bornFrom: object|null }[]}
 */
export function buildStoryFromLineageTree(combatants) {
  return [...(combatants || [])]
    .sort((a, b) => (a.lineage?.generation ?? 0) - (b.lineage?.generation ?? 0))
    .map(c => ({
      combatantId: c.id,
      name:        c.name,
      generation:  c.lineage?.generation ?? 0,
      bornFrom:    c.lineage?.bornFrom   ?? null,
    }))
}

/**
 * Translates a prevWinners map so that any winner who has since evolved is
 * replaced by their current active form.
 *
 * prevWinners    — { [ownerId]: [{ id, name, bio }, ...] }
 * activeFormMap  — { [originalId]: variantId } from buildActiveFormMap
 * combatantsById — { [id]: { id, name, bio } } — lookup that must contain variant data
 *
 * Entries whose variant data is absent in combatantsById are left unchanged
 * (safe fallback — never loses data).
 *
 * @param {object}  prevWinners
 * @param {object}  activeFormMap
 * @param {object}  combatantsById
 * @returns {object}
 */
export function applyActiveFormMap(prevWinners, activeFormMap, combatantsById) {
  if (!prevWinners || !activeFormMap || !combatantsById) return prevWinners || {}
  return Object.fromEntries(
    Object.entries(prevWinners).map(([ownerId, winners]) => [
      ownerId,
      winners.map(w => {
        const variantId = activeFormMap[w.id]
        if (!variantId) return w
        const variant = combatantsById[variantId]
        if (!variant) return w
        return { id: variant.id, name: variant.name, bio: variant.bio || '' }
      }),
    ])
  )
}

/**
 * Build the ordered evolution story for one character through a heritage chain.
 * Returns an empty array if the rootId was never evolved in these rooms.
 *
 * Each entry:
 *   { combatantId, name, generation, bornFrom }
 *
 * bornFrom is null for the original (generation 0), otherwise:
 *   { roundNumber, gameCode, opponentName, parentId, parentName }
 *
 * @param {object[]} rooms   Array of room data objects (chronological)
 * @param {string}   rootId  The generation-0 combatant id
 * @returns {object[]}
 */
export function buildChainEvolutionStory(rooms, rootId) {
  const events = []
  const knownIds = new Set([rootId])

  for (const room of (rooms || [])) {
    for (const round of (room.rounds || [])) {
      if (round.evolution) {
        const { fromId, fromName, toId, toName } = round.evolution
        if (!knownIds.has(fromId)) continue
        const opponent = (round.combatants || []).find(c => c.id !== fromId)
        events.push({
          type: 'evolution',
          fromId, fromName, toId, toName,
          roundNumber:  round.number,
          gameCode:     room.code,
          opponentName: opponent?.name || null,
        })
        knownIds.add(toId)
      } else if (round.merge) {
        const { fromIds, fromNames, toId, toName } = round.merge
        const ancestorIdx = (fromIds || []).findIndex(id => knownIds.has(id))
        if (ancestorIdx === -1) continue
        events.push({
          type:     'merge',
          fromId:   fromIds[ancestorIdx],
          fromName: (fromNames || [])[ancestorIdx] || '',
          fromIds:  fromIds || [],
          fromNames: fromNames || [],
          toId, toName,
          roundNumber: round.number,
          gameCode:    room.code,
        })
        knownIds.add(toId)
      }
    }
  }

  if (events.length === 0) return []

  const story = [{
    combatantId: rootId,
    name:        events[0].fromName,
    generation:  0,
    bornFrom:    null,
  }]

  events.forEach((e, i) => {
    story.push({
      combatantId: e.toId,
      name:        e.toName,
      generation:  i + 1,
      bornFrom: e.type === 'merge'
        ? {
            type:        'merge',
            parentNames: e.fromNames,
            parentIds:   e.fromIds,
            roundNumber: e.roundNumber,
            gameCode:    e.gameCode,
          }
        : {
            roundNumber:  e.roundNumber,
            gameCode:     e.gameCode,
            opponentName: e.opponentName,
            parentId:     e.fromId,
            parentName:   e.fromName,
          },
    })
  })

  return story
}
