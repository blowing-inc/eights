/**
 * adminLogic.js — pure functions for admin operations.
 * No supabase imports, no side effects — fully unit-testable.
 */

// ─── Stats recalculation ──────────────────────────────────────────────────────

/**
 * Derive win/loss/reaction totals for every combatant from room history.
 * Skips devMode rooms and rounds with no winner.
 *
 * @param {object[]} rooms  Array of room data objects (the `data` column values)
 * @returns {{ [combatantId: string]: { wins, losses, heart, angry, cry } }}
 */
export function recalcStatsFromRooms(rooms) {
  const stats = {}

  for (const room of rooms) {
    if (!room || room.devMode) continue
    for (const round of (room.rounds || [])) {
      if (!round.winner) continue
      for (const c of (round.combatants || [])) {
        if (!stats[c.id]) stats[c.id] = { wins: 0, losses: 0, heart: 0, angry: 0, cry: 0 }
        if (round.winner.id === c.id) stats[c.id].wins++
        else stats[c.id].losses++
        const pr = round.playerReactions || {}
        for (const reactions of Object.values(pr)) {
          if (reactions[c.id] === 'heart') stats[c.id].heart++
          if (reactions[c.id] === 'angry') stats[c.id].angry++
          if (reactions[c.id] === 'cry')   stats[c.id].cry++
        }
      }
    }
  }

  return stats
}

/**
 * Compare recalculated stats against the current DB values.
 * Returns only combatants where at least one value differs.
 *
 * @param {{ [id]: { wins, losses, heart, angry, cry } }} recalculated
 * @param {{ id, name, wins, losses, reactions_heart, reactions_angry, reactions_cry }[]} currentCombatants
 * @returns {{ id, name, diffs: { [field]: { was, now } } }[]}
 */
export function diffStats(recalculated, currentCombatants) {
  return currentCombatants
    .map(c => {
      const r = recalculated[c.id] || { wins: 0, losses: 0, heart: 0, angry: 0, cry: 0 }
      const diffs = {}
      if ((c.wins             || 0) !== r.wins)   diffs.wins   = { was: c.wins   || 0, now: r.wins }
      if ((c.losses           || 0) !== r.losses) diffs.losses = { was: c.losses || 0, now: r.losses }
      if ((c.reactions_heart  || 0) !== r.heart)  diffs.heart  = { was: c.reactions_heart  || 0, now: r.heart }
      if ((c.reactions_angry  || 0) !== r.angry)  diffs.angry  = { was: c.reactions_angry  || 0, now: r.angry }
      if ((c.reactions_cry    || 0) !== r.cry)    diffs.cry    = { was: c.reactions_cry    || 0, now: r.cry }
      return Object.keys(diffs).length > 0 ? { id: c.id, name: c.name, diffs } : null
    })
    .filter(Boolean)
}

// ─── Account merge ────────────────────────────────────────────────────────────

/**
 * Preview what a merge will touch without performing it.
 *
 * @param {string}   keepId       Player ID to keep
 * @param {string}   dropId       Player ID to remove
 * @param {object[]} rooms        All room data objects
 * @param {{ owner_id }[]} combatants  All combatant rows from DB
 * @returns {{ affectedRooms: number, affectedCombatants: number }}
 */
export function planMerge(keepId, dropId, rooms, combatants) {
  if (keepId === dropId) return { affectedRooms: 0, affectedCombatants: 0 }
  const affectedRooms      = rooms.filter(r => (r.players || []).some(p => p.id === dropId)).length
  const affectedCombatants = combatants.filter(c => c.owner_id === dropId).length
  return { affectedRooms, affectedCombatants }
}

/**
 * Return a new room object with all references to `fromId` replaced by `toId`.
 * Touches: players array, combatants map key, combatant ownerId fields, host field.
 * Pure — does not mutate the original.
 *
 * @param {object} room
 * @param {string} fromId
 * @param {string} toId
 * @returns {object}
 */
export function applyMergeToRoom(room, fromId, toId) {
  const updated = { ...room }

  // players array
  updated.players = (room.players || []).map(p =>
    p.id === fromId ? { ...p, id: toId } : p
  )

  // host
  if (room.host === fromId) updated.host = toId

  // combatants map: re-key and update ownerId inside each combatant
  const oldCombatants = room.combatants || {}
  const newCombatants = {}
  for (const [pid, list] of Object.entries(oldCombatants)) {
    const newKey = pid === fromId ? toId : pid
    newCombatants[newKey] = list.map(c =>
      c.ownerId === fromId ? { ...c, ownerId: toId } : c
    )
  }
  updated.combatants = newCombatants

  // prevWinners map
  if (room.prevWinners) {
    const pw = {}
    for (const [pid, winners] of Object.entries(room.prevWinners)) {
      pw[pid === fromId ? toId : pid] = winners
    }
    updated.prevWinners = pw
  }

  // drafts map
  if (room.drafts) {
    const drafts = {}
    for (const [pid, draft] of Object.entries(room.drafts)) {
      drafts[pid === fromId ? toId : pid] = draft
    }
    updated.drafts = drafts
  }

  return updated
}
