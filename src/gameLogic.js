// Pure game logic — core state transitions, draft mechanics, player utilities,
// room settings, bot generation, and series standings.
// No React, no Supabase imports — all functions are deterministic given their inputs.
//
// Extracted modules (not owned here):
//   lineage.js   — combatant ancestry, active-form resolution, evolution story
//   awards.js    — superlatives and computed achievements
//   narrative.js — ticker messages and flavor copy
import { buildActiveFormMap, applyActiveFormMap } from './lineage.js'

// ─── Utilities ────────────────────────────────────────────────────────────────

export function uid() { return Math.random().toString(36).slice(2, 9) }

export function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export const COLORS = ['#7F77DD','#1D9E75','#D85A30','#378ADD','#D4537E','#639922','#BA7517','#E24B4A']
export function playerColor(idx) { return COLORS[idx % COLORS.length] }

// ─── Room settings ───────────────────────────────────────────────────────────

/**
 * Returns a settings object with all defaults applied.
 * Call this whenever you need to read settings from a room — handles rooms
 * created before any given setting existed.
 */
export function normalizeRoomSettings(settings) {
  return {
    rosterSize:           8,
    spectatorsAllowed:    true,
    anonymousCombatants:  false,
    blindVoting:          false,
    biosRequired:         false,
    allowEvolutions:      true,
    allowDraws:           true,
    allowMerges:          true,
    arenaMode:            'none',
    arenaConfig:          null,
    arenaEvolutionEnabled: false,
    isPublic:             false,
    tone:                 null,
    ...settings,
  }
}

/**
 * Resolves the tone for a game at draft start.
 * Prefers an explicitly set game-level tone over the parent season's tone.
 * Returns null if neither has a tone set.
 */
export function resolveTone(game, season) {
  return game?.settings?.tone ?? season?.tone ?? null
}

/**
 * Derives a display tone for a season or series by comparing the snapshotted
 * room.tone across all games in the container.
 *
 * Returns:
 *   { type: 'consistent', tags: string[], premise: string | null }
 *     when all games with a tone share identical tag sets
 *   { type: 'varied' }
 *     when tone tags differ across any games
 *   null
 *     when no games had tone set
 */
export function computeSeasonToneDisplay(rooms) {
  const toned = (rooms || []).filter(r => r.tone?.tags?.length > 0)
  if (toned.length === 0) return null

  const fingerprint = r => [...r.tone.tags].sort().join('\0')
  const first = fingerprint(toned[0])
  const consistent = toned.every(r => fingerprint(r) === first)

  if (!consistent) return { type: 'varied' }

  const sorted = [...toned].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  const premise = sorted.find(r => r.tone.premise)?.tone.premise ?? null

  return { type: 'consistent', tags: toned[0].tone.tags, premise }
}

/**
 * Builds a round.arena snapshot from an arena DB record.
 * Maps arena.bio → description and arena.rules → houseRules per the schema contract.
 */
export function buildArenaSnapshot(arena) {
  return {
    id:          arena.id,
    name:        arena.name,
    description: arena.bio   || '',
    houseRules:  arena.rules || null,
    tags:        arena.tags  || [],
  }
}

// ─── Dev helpers ─────────────────────────────────────────────────────────────

// Instant dummy roster for dev mode draft screen
export const DEV_ROSTER_NAMES = [
  'Dumpster Fire', 'Spreadsheet Phantom', 'Generic Protagonist',
  'Tuesday', 'Partially Hydrated Raisin', 'Sentient Parking Ticket',
  'Discount Wizard', 'A Strongly Worded Email',
  'Cursed Footnote', 'Mild Inconvenience', 'Unlicensed Philosopher', 'The Concept Of Monday',
]
export const DEV_ROSTER_BIOS = [
  'Moves fast and breaks things. Mostly themselves.',
  'Haunts corporate hallways. Unknown motives.',
  'Technically the hero. Nobody asked.',
  'Unremarkable day. Exceptional fighter.',
  'Once powerful. Now just wrinkly.',
  'Cannot be appealed. Cannot be ignored.',
  'Studied the blade. Briefly.',
  'Will not be cc\'d on the outcome.',
  'Found in the appendix. Should have stayed there.',
  'Not a threat. Somehow always a threat.',
  'Has opinions. Too many opinions.',
  'Responsible for everything. Accountable to no one.',
]

/**
 * Simulates all remaining rounds of a game to completion.
 * Picks a random winner for each unplayed round.
 * Returns the fully updated room object (does not write to DB).
 */
export function simulateGameToEnd(room) {
  const totalRounds = Math.min(...room.players.map(p => (room.combatants[p.id] || []).length))
  let updated = JSON.parse(JSON.stringify(room))

  // If the current round is already open (exists but has no winner), resolve it first.
  // Otherwise start from the next round.
  const currentRoundObj = updated.currentRound > 0 ? updated.rounds[updated.currentRound - 1] : null
  const startFrom = currentRoundObj && !currentRoundObj.winner
    ? updated.currentRound
    : updated.currentRound + 1

  for (let roundNum = startFrom; roundNum <= totalRounds; roundNum++) {
    // For the in-progress round, use the combatants already stored on it.
    // For new rounds, derive from roster position.
    const isCurrentRound = roundNum === updated.currentRound && updated.rounds[roundNum - 1]
    const matchup = isCurrentRound
      ? updated.rounds[roundNum - 1].combatants
      : updated.players.map(p => (updated.combatants[p.id] || [])[roundNum - 1]).filter(Boolean)

    if (!matchup.length) break
    const winner = matchup[Math.floor(Math.random() * matchup.length)]
    const roundId = isCurrentRound ? updated.rounds[roundNum - 1].id : uid()

    // Update combatant win/loss records
    Object.keys(updated.combatants).forEach(pid => {
      updated.combatants[pid] = updated.combatants[pid].map(c => {
        if (!matchup.find(rc => rc.id === c.id)) return c
        const isWin = winner.id === c.id
        return {
          ...c,
          wins: c.wins + (isWin ? 1 : 0),
          losses: c.losses + (isWin ? 0 : 1),
          battles: [...(c.battles || []), {
            roundId,
            opponent: matchup.filter(rc => rc.id !== c.id).map(rc => rc.name).join(', '),
            result: isWin ? 'win' : 'loss',
          }],
        }
      })
    })

    if (isCurrentRound) {
      // Resolve the open round in-place
      updated.rounds[roundNum - 1] = { ...updated.rounds[roundNum - 1], winner }
    } else {
      updated.rounds = [...updated.rounds, { id: roundId, number: roundNum, combatants: matchup, picks: {}, winner, createdAt: Date.now() }]
      updated.currentRound = roundNum
    }
  }

  updated.phase = 'battle'
  return updated
}

// ─── Bot data ─────────────────────────────────────────────────────────────────

export const BOT_COMBATANTS = [
  ['Lorem Ipsum','Dolor Sit','Amet Consectetur','Adipiscing Elit','Sed Do Eiusmod','Tempor Incididunt','Ut Labore','Et Dolore'],
  ['Magna Aliqua','Enim Minim','Veniam Quis','Nostrud Exercit','Ullamco Laboris','Nisi Aliquip','Ex Ea Commodo','Consequat Duis'],
]
export const BOT_BIOS = [
  'Forged in the fires of placeholder text, their power is unknowable.',
  'Ancient beyond reckoning. Meaning: disputed.',
  'Transcends the concept of biography.',
  'Once defeated a semicolon in single combat.',
  'No bio. Only vibes.',
  'Their origin story is redacted for legal reasons.',
  'Exists primarily as a rhetorical device.',
  'Lorem ipsum dolor sit amet — this IS their bio.',
]

/**
 * Creates combatant objects for a bot player from the predefined template lists.
 * rosterSize controls how many are created (default 8).
 * idFn is injectable so tests can use deterministic IDs.
 */
export function makeBotCombatants(botIdx, botId, botName, { rosterSize = 8, idFn = uid } = {}) {
  return BOT_COMBATANTS[botIdx % 2].slice(0, rosterSize).map((name, i) => ({
    id: idFn(), name, bio: BOT_BIOS[i % BOT_BIOS.length],
    ownerId: botId, ownerName: botName,
    isBot: true, wins: 0, losses: 0, draws: 0, battles: [],
  }))
}

/** Creates count bot player objects (max 2 named bots, rest get generic names). */
export function makeBots(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'bot_' + i,
    name: ['Bot Alpha', 'Bot Beta'][i] || 'Bot ' + i,
    color: playerColor(i + 1),
    ready: true,
    isBot: true,
  }))
}

// ─── Draft logic ──────────────────────────────────────────────────────────────

/**
 * Returns true if the slot at slotIndex "contains" the given prevWinner —
 * matching by name (case-insensitive) OR by global combatant id.
 */
export function slotMatchesPrevWinner(names, globalIds, slotIndex, prevWinner) {
  const name = (names[slotIndex] || '').trim().toLowerCase()
  const gid  = globalIds[slotIndex] || null
  return name === prevWinner.name.toLowerCase() || (gid !== null && gid === prevWinner.id)
}

/**
 * Returns true when every prevWinner has been placed in at least one draft slot.
 */
export function areAllPrevWinnersPlaced(prevWinners, names, globalIds) {
  return prevWinners.every(w =>
    names.some((_, i) => slotMatchesPrevWinner(names, globalIds, i, w))
  )
}

/**
 * Returns the subset of prevWinners that have NOT been placed in any draft slot.
 */
export function getUnplacedWinners(prevWinners, names, globalIds) {
  return prevWinners.filter(w =>
    !names.some((_, i) => slotMatchesPrevWinner(names, globalIds, i, w))
  )
}

/**
 * Constructs a single combatant object from draft form inputs.
 * Reuses globalId when provided (stats accumulate across games).
 * idFn is injectable for deterministic test IDs.
 */
export function buildCombatantFromDraft(name, bio, globalId, ownerId, ownerName, idFn = uid) {
  return {
    id: globalId || idFn(),
    name: name.trim(),
    bio: bio.trim(),
    ownerId,
    ownerName,
    wins: 0, losses: 0, draws: 0, battles: [],
  }
}

/**
 * Returns true when every real (non-bot) player has exactly rosterSize combatants submitted.
 * combatants map must already include the current player's freshly submitted list.
 */
export function isDraftComplete(players, combatants, rosterSize = 8) {
  return players.filter(p => !p.isBot).every(p => (combatants[p.id] || []).length === rosterSize)
}

/** How many real players have submitted their full roster. */
export function getReadyPlayerCount(players, combatants, rosterSize = 8) {
  return players.filter(p => !p.isBot && (combatants[p.id] || []).length === rosterSize).length
}

/**
 * Whether the host can force-start the round phase with only some players ready.
 * Requires: is host, at least 2 ready, and at least 1 still not ready.
 */
export function canForceStart(isHost, readyCount, totalRealPlayers) {
  return isHost && readyCount >= 2 && readyCount < totalRealPlayers
}

// ─── Round logic ──────────────────────────────────────────────────────────────

/**
 * Whether the host can undo the last round.
 * Requires: is host, at least one round has been played, and that round is resolved (winner or draw).
 */
export function canUndoLastRound(isHost, currentRound, round) {
  return isHost && currentRound > 0 && Boolean(round?.winner || round?.draw)
}

/**
 * Whether a player can edit a combatant (owner or room host).
 */
export function canEditCombatant(ownerId, playerId, hostId) {
  return ownerId === playerId || playerId === hostId
}

// ─── Ephemeral badges ─────────────────────────────────────────────────────────

/**
 * Derives ephemeral system badges from a combatant's in-game battle record.
 * Not stored — computed fresh from the combatant's battles array each render.
 *
 * Returns an array of badge objects, each with a `type` and optional fields:
 *   { type: 'on_fire',     count: number }   — won last 3+ rounds in a row
 *   { type: 'cold_streak', count: number }   — lost last 3+ rounds in a row
 *   { type: 'trapper' }                      — trapTriggered is true
 *
 * @param {object} combatant — in-room combatant with battles[] and trapTriggered
 * @returns {Array}
 */
export function getEphemeralBadges(combatant) {
  const badges = []
  const battles = combatant?.battles || []

  if (battles.length >= 3) {
    // Count consecutive matching results from the end of the list
    const lastResult = battles[battles.length - 1].result
    if (lastResult === 'win' || lastResult === 'loss') {
      let streak = 0
      for (let i = battles.length - 1; i >= 0; i--) {
        if (battles[i].result === lastResult) streak++
        else break
      }
      if (streak >= 3) {
        badges.push({ type: lastResult === 'win' ? 'on_fire' : 'cold_streak', count: streak })
      }
    }
  }

  if (combatant?.trapTriggered) {
    badges.push({ type: 'trapper' })
  }

  return badges
}

// ─── Room lifecycle ───────────────────────────────────────────────────────────

/**
 * Scans a completed room's rounds and builds a per-owner map of winning combatants.
 * Used to populate prevWinners on the next game room so the draft can enforce
 * that champions are re-entered.
 * Returns { [ownerId]: [{ id, name, bio }, ...] }
 */
export function extractPreviousWinners(rounds) {
  const map = {}
  ;(rounds || []).filter(rd => rd.winner).forEach(rd => {
    const ownerId = rd.winner.ownerId
    if (!map[ownerId]) map[ownerId] = []
    map[ownerId].push({ id: rd.winner.id, name: rd.winner.name, bio: rd.winner.bio || '' })
  })
  return map
}

// ─── Room stats ───────────────────────────────────────────────────────────────

/**
 * Returns the number of rounds that can be played given the current combatant
 * rosters — minimum across all players.
 */
export function totalRoundsFor(room) {
  const lengths = room.players.map(p => (room.combatants[p.id] || []).length)
  if (lengths.length === 0) return 0
  return Math.min(...lengths)
}

/**
 * Returns the matchup array for a given 1-based round number:
 * one combatant per player at index (roundNum - 1), bots included.
 */
export function matchupForRound(room, roundNum) {
  return room.players
    .map(p => (room.combatants[p.id] || [])[roundNum - 1])
    .filter(Boolean)
}

// ─── Round outcome stat mutations ─────────────────────────────────────────────

/**
 * Given the full room object and a winning combatant id, returns updated
 * combatants map with wins/losses incremented and round records appended.
 * Does NOT mutate the input — returns a new deep-copied map.
 */
export function applyWinner(room, round, winnerId) {
  const combatants = JSON.parse(JSON.stringify(room.combatants))
  const winner = round.combatants.find(c => c.id === winnerId)
  if (!winner) return combatants

  Object.keys(combatants).forEach(pid => {
    combatants[pid] = combatants[pid].map(c => {
      if (!round.combatants.find(rc => rc.id === c.id)) return c
      const isWin = winner.id === c.id
      const updated = {
        ...c,
        wins:   c.wins   + (isWin ? 1 : 0),
        losses: c.losses + (isWin ? 0 : 1),
        battles: [
          ...(c.battles || []),
          {
            roundId:  round.id,
            opponent: round.combatants.filter(rc => rc.id !== c.id).map(rc => rc.name).join(', '),
            result:   isWin ? 'win' : 'loss',
          },
        ],
      }
      // Mark trap as sprung if this combatant's trap target appeared in the same round
      if (c.trapTarget) {
        const targetInRound = round.combatants.some(rc => rc.id === c.trapTarget.targetId)
        if (targetInRound) updated.trapTriggered = true
      }
      return updated
    })
  })
  return combatants
}

// Returns the next state when the host taps "All advance" in the draw flow.
// When merges are enabled the flow proceeds to the merge-name step (step 3).
// When disabled it short-circuits to a plain all_advance confirmation.
export function resolveAllAdvanceSelection(selectedIds, allowMerges) {
  return allowMerges
    ? { type: 'prompt_merge', drawFlow: { step: 3, selectedIds } }
    : { type: 'confirm_draw', combatantIds: selectedIds, drawOutcome: 'all_advance' }
}

/**
 * Applies draw (and optional partial loss) outcomes and appends round records.
 * round.draw === true  → all combatants in round.combatants drew (legacy).
 * round.draw.combatantIds → those ids drew; remaining combatants in round took a loss.
 * round.drawOutcome === 'all_advance' → drawers get wins instead of draws.
 * round.drawOutcome === 'no_advance' (default/missing) → drawers get draws.
 * Does NOT mutate the input — returns a new deep-copied map.
 */
export function applyDraw(room, round) {
  const combatants = JSON.parse(JSON.stringify(room.combatants))
  const isLegacy   = !round.draw || round.draw === true
  const drawIds    = isLegacy ? null : (round.draw?.combatantIds ?? [])
  const allAdvance = round.drawOutcome === 'all_advance'

  Object.keys(combatants).forEach(pid => {
    combatants[pid] = combatants[pid].map(c => {
      if (!round.combatants.find(rc => rc.id === c.id)) return c
      const drew = isLegacy || drawIds.includes(c.id)
      return {
        ...c,
        wins:   allAdvance && drew ? (c.wins   || 0) + 1 : (c.wins   || 0),
        draws:  !allAdvance && drew ? (c.draws  || 0) + 1 : (c.draws  || 0),
        losses: drew ? (c.losses || 0) : (c.losses || 0) + 1,
        battles: [
          ...(c.battles || []),
          {
            roundId:  round.id,
            opponent: round.combatants.filter(rc => rc.id !== c.id).map(rc => rc.name).join(', '),
            result:   drew ? (allAdvance ? 'win' : 'draw') : 'loss',
          },
        ],
      }
    })
  })
  return combatants
}

/**
 * Reverses the stat changes from the last completed round (win or draw).
 * Returns a new combatants map with stats decremented and the round's
 * round record entries removed.  Clamps to 0 (never goes negative).
 */
export function undoRound(room, round) {
  const combatants = JSON.parse(JSON.stringify(room.combatants))
  if (!round?.winner && !round?.draw && !round?.merge) return combatants

  Object.keys(combatants).forEach(pid => {
    combatants[pid] = combatants[pid].map(c => {
      if (!round.combatants.find(rc => rc.id === c.id)) return c

      if (round.merge) {
        // Merge: all parents got wins. Reverse wins for each parent.
        if (!round.merge.fromIds.includes(c.id)) return c
        return {
          ...c,
          wins:    Math.max(0, (c.wins || 0) - 1),
          battles: (c.battles || []).filter(b => b.roundId !== round.id),
        }
      }

      if (round.draw) {
        const isLegacy   = round.draw === true  // object draw is always non-legacy
        const drawIds    = isLegacy ? null : (round.draw?.combatantIds ?? [])
        const drew       = isLegacy || drawIds.includes(c.id)
        const allAdvance = round.drawOutcome === 'all_advance'
        return {
          ...c,
          wins:    allAdvance && drew ? Math.max(0, (c.wins   || 0) - 1) : (c.wins   || 0),
          draws:   !allAdvance && drew ? Math.max(0, (c.draws  || 0) - 1) : (c.draws  || 0),
          losses:  drew ? (c.losses || 0) : Math.max(0, (c.losses || 0) - 1),
          battles: (c.battles || []).filter(b => b.roundId !== round.id),
        }
      }

      const wasWin = round.winner.id === c.id
      return {
        ...c,
        wins:    Math.max(0, c.wins   - (wasWin ? 1 : 0)),
        losses:  Math.max(0, c.losses - (wasWin ? 0 : 1)),
        battles: (c.battles || []).filter(b => b.roundId !== round.id),
      }
    })
  })
  return combatants
}

// ─── Merge evolution ─────────────────────────────────────────────────────────

/**
 * Applies wins to all N merge parent combatants and appends their battle records.
 * Does NOT create the merged combatant — that is handled by the caller via
 * createVariantCombatant. Does NOT mutate the input — returns a new deep-copied map.
 */
export function applyMerge(room, round) {
  const combatants = JSON.parse(JSON.stringify(room.combatants))
  const merge = round.merge
  if (!merge) return combatants

  Object.keys(combatants).forEach(pid => {
    combatants[pid] = combatants[pid].map(c => {
      if (!merge.fromIds.includes(c.id)) return c
      const opponents = round.combatants
        .filter(rc => rc.id !== c.id && merge.fromIds.includes(rc.id))
        .map(rc => rc.name)
      return {
        ...c,
        wins: (c.wins || 0) + 1,
        battles: [
          ...(c.battles || []),
          {
            roundId:  round.id,
            opponent: opponents.join(', '),
            result:   'win',
          },
        ],
      }
    })
  })
  return combatants
}

// ─── Evolution round builder ──────────────────────────────────────────────────

/**
 * Assembles the finalised round object after an evolution is confirmed.
 * Pure — no Supabase, no uid() calls, no side effects.
 *
 * Params:
 *   round          — the current round object (from room.rounds)
 *   winnerId       — id of the winning combatant
 *   newId          — pre-generated id for the new variant combatant
 *   newName        — name of the evolved form
 *   variantBio     — bio for the evolved form (may be empty string)
 *   authorId       — id of the player who wrote the evolution
 *   pickerPlayerId — id of the player whose pick to record (typically the host)
 *
 * Returns a new round object with winner, evolution, resolvedAt, and picks set.
 * evolutionPending is removed from the returned object.
 *
 * Throws if required fields are missing or if winnerId is not found in round.combatants.
 * bornFrom is the lineage link that powers buildChainEvolutionStory — the caller
 * must supply it via the globalWinner Supabase fetch; it is not derived here.
 */
export function buildEvolutionRound(round, winnerId, newId, newName, variantBio, authorId, pickerPlayerId) {
  if (!winnerId) throw new Error('buildEvolutionRound: winnerId is required')
  if (!newId)    throw new Error('buildEvolutionRound: newId is required')
  if (!newName?.trim()) throw new Error('buildEvolutionRound: newName is required')

  const winner = round.combatants.find(c => c.id === winnerId)
  if (!winner) throw new Error(`buildEvolutionRound: winnerId "${winnerId}" not found in round.combatants`)

  const evolution = {
    fromId:    winnerId,
    fromName:  winner.name,
    toId:      newId,
    toName:    newName,
    toBio:     variantBio || '',
    ownerId:   winner.ownerId,
    ownerName: winner.ownerName,
    authorId,
  }

  const finalRound = {
    ...round,
    winner,
    evolution,
    resolvedAt: Date.now(),
    picks: { ...(round.picks || {}), [pickerPlayerId]: winnerId },
  }
  delete finalRound.evolutionPending

  return finalRound
}

// ─── Reaction tallying ────────────────────────────────────────────────────────

/**
 * Given a round's playerReactions map ({ [playerId]: { [combatantId]: emoji } })
 * returns { heart, angry, cry } tallies for a specific combatant.
 */
export function tallyReactions(playerReactions, combatantId) {
  const pr = playerReactions || {}
  return {
    heart: Object.values(pr).filter(m => m[combatantId] === 'heart').length,
    angry: Object.values(pr).filter(m => m[combatantId] === 'angry').length,
    cry:   Object.values(pr).filter(m => m[combatantId] === 'cry').length,
  }
}

/**
 * Applies one player's reaction toggle to the playerReactions map.
 * Same emoji a second time removes it (toggle). Returns new map.
 */
export function toggleReaction(playerReactions, playerId, combatantId, emoji) {
  const updated = { ...(playerReactions || {}) }
  const mine = { ...(updated[playerId] || {}) }
  if (mine[combatantId] === emoji) delete mine[combatantId]
  else mine[combatantId] = emoji
  updated[playerId] = mine
  return updated
}

// ─── Publish gate ─────────────────────────────────────────────────────────────

/**
 * Returns true if the just-confirmed round is the final one, meaning all
 * combatants should be published to the global bestiary.
 */
export function isFinalRound(room) {
  const total = totalRoundsFor(room)
  return total > 0 && room.currentRound >= total
}

/**
 * Returns the deduplicated set of combatant IDs to publish when a game completes.
 * Includes every combatant from players who submitted a full roster, plus any
 * evolution variants created during the game. Stash/publish status is not checked
 * here — the caller (publishCombatants) performs the DB update unconditionally, which
 * is a no-op for already-published combatants.
 *
 * combatants — room.combatants map: { [playerId]: [combatant, ...] }
 * rounds     — resolved rounds array (should include the current round's result)
 * rosterSize — expected number of combatants per player
 */
export function getCombatantsToPublish(combatants, rounds, rosterSize) {
  const rosterIds  = Object.values(combatants)
    .filter(list => list.length === rosterSize)
    .flat().map(c => c.id)
  const variantIds = rounds.filter(r => r.evolution).map(r => r.evolution.toId)
  const mergeIds   = rounds.filter(r => r.merge).map(r => r.merge.toId)
  return [...new Set([...rosterIds, ...variantIds, ...mergeIds])]
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Determines which auth flow to enter based on the lookupUser result.
 * Returns 'register' | 'set_pin' | 'login'
 */
export function authFlowFor(lookupResult) {
  if (!lookupResult) return 'register'
  if (lookupResult.needs_reset) return 'set_pin'
  return 'login'
}

// ─── Guest label ──────────────────────────────────────────────────────────────

export function ownerLabel(name, isGuest) {
  return isGuest ? `${name} (guest)` : name
}

// ─── Next game preparation ────────────────────────────────────────────────────

/**
 * Pure function: derives the new room and the updated completed room for a
 * "Host Next Game" transition. Contains all series/heritage logic so App.jsx
 * only handles the two DB writes and navigation.
 *
 * @param {object} completedRoom  The room that just finished
 * @param {object} opts
 * @param {string} opts.newRoomCode  Pre-generated code for the new room
 * @param {string} opts.hostId       Player ID of the host
 * @param {number} [opts.now]        Timestamp for createdAt (defaults to Date.now())
 * @returns {{ newRoom: object, updatedCompletedRoom: object }}
 */
export function prepareNextGame(completedRoom, { newRoomCode, hostId, now = Date.now() }) {
  let prevWinners = extractPreviousWinners(completedRoom.rounds)

  // Translate any evolved winners to their current active form using the
  // self-contained evolution records on each round (not room.combatants).
  const activeFormMap = buildActiveFormMap([completedRoom])
  if (Object.keys(activeFormMap).length > 0) {
    const variantById = {}
    for (const rd of (completedRoom.rounds || [])) {
      if (rd.evolution) {
        variantById[rd.evolution.toId] = {
          id:   rd.evolution.toId,
          name: rd.evolution.toName,
          bio:  rd.evolution.toBio || '',
        }
      }
    }
    prevWinners = applyActiveFormMap(prevWinners, activeFormMap, variantById)
  }

  const seriesId    = completedRoom.seriesId    || completedRoom.id
  const seriesIndex = (completedRoom.seriesIndex || 1) + 1

  // In dev mode, pre-populate bot combatants so they don't need to draft.
  const { rosterSize } = normalizeRoomSettings(completedRoom.settings)
  const botCombatants = {}
  if (completedRoom.devMode) {
    completedRoom.players
      .filter(p => p.isBot)
      .forEach((b, i) => { botCombatants[b.id] = makeBotCombatants(i, b.id, b.name, { rosterSize }) })
  }

  const newRoom = {
    id: newRoomCode, code: newRoomCode, host: hostId, phase: 'draft',
    players: completedRoom.players,
    combatants: botCombatants, rounds: [], currentRound: 0,
    prevRoomId:  completedRoom.id,
    seriesId, seriesIndex,
    createdAt: now, prevWinners,
    ...(completedRoom.settings  && { settings:  completedRoom.settings }),
    ...(completedRoom.devMode   && { devMode:   true }),
  }

  const updatedCompletedRoom = {
    ...completedRoom,
    nextRoomId:  newRoomCode,
    seriesId,
    seriesIndex: completedRoom.seriesIndex || 1,
  }

  return { newRoom, updatedCompletedRoom }
}

// ─── Guest session migration ──────────────────────────────────────────────────

/**
 * Replaces every occurrence of oldId with newId throughout a room blob.
 * Used when a guest logs in mid-game to associate the active session with their account.
 *
 * Touches: host, players, combatants map key + ownerId, rounds combatants ownerId,
 *          rounds winner ownerId, rounds picks keys, rounds playerReactions keys,
 *          rounds chat playerId, prevWinners map key.
 */
export function replacePlayerIdInRoom(room, oldId, newId) {
  if (!room || !oldId || !newId || oldId === newId) return room

  const players = (room.players || []).map(p =>
    p.id === oldId ? { ...p, id: newId } : p
  )

  const combatants = { ...room.combatants }
  if (combatants[oldId]) {
    combatants[newId] = combatants[oldId].map(c => ({ ...c, ownerId: newId }))
    delete combatants[oldId]
  }

  const host = room.host === oldId ? newId : room.host

  const rounds = (room.rounds || []).map(rd => ({
    ...rd,
    combatants: (rd.combatants || []).map(c =>
      c.ownerId === oldId ? { ...c, ownerId: newId } : c
    ),
    winner: rd.winner?.ownerId === oldId
      ? { ...rd.winner, ownerId: newId }
      : rd.winner,
    picks: rd.picks
      ? Object.fromEntries(Object.entries(rd.picks).map(([k, v]) => [k === oldId ? newId : k, v]))
      : rd.picks,
    playerReactions: rd.playerReactions
      ? Object.fromEntries(Object.entries(rd.playerReactions).map(([k, v]) => [k === oldId ? newId : k, v]))
      : rd.playerReactions,
    chat: (rd.chat || []).map(m =>
      m.playerId === oldId ? { ...m, playerId: newId } : m
    ),
  }))

  const prevWinners = room.prevWinners ? { ...room.prevWinners } : undefined
  if (prevWinners?.[oldId]) {
    prevWinners[newId] = prevWinners[oldId]
    delete prevWinners[oldId]
  }

  return {
    ...room,
    host,
    players,
    combatants,
    rounds,
    ...(prevWinners !== undefined ? { prevWinners } : {}),
  }
}

// ─── Host kick ────────────────────────────────────────────────────────────────

/**
 * Removes a player from the room. Returns the updated room and any combatants
 * the player had already submitted, so the caller can stash or discard them.
 *
 * Touches: players[], combatants map, drafts map.
 * prevWinners is preserved — it is a historical record from a prior game.
 */
export function kickPlayerFromRoom(room, kickedId) {
  if (!room || !kickedId) return { room, submittedCombatants: [] }
  if (!(room.players || []).some(p => p.id === kickedId)) return { room, submittedCombatants: [] }

  const players = (room.players || []).filter(p => p.id !== kickedId)
  const submittedCombatants = room.combatants?.[kickedId] || []

  const { [kickedId]: _c, ...remainingCombatants } = room.combatants || {}

  const drafts = room.drafts ? { ...room.drafts } : undefined
  if (drafts) delete drafts[kickedId]

  return {
    room: {
      ...room,
      players,
      combatants: remainingCombatants,
      ...(drafts !== undefined ? { drafts } : {}),
    },
    submittedCombatants,
  }
}

// ─── Series standings ─────────────────────────────────────────────────────────

/**
 * Computes cumulative round-win counts per player across all games in a series.
 * Returns rows sorted by wins descending.
 *
 * @param {object[]} rooms  All rooms in the series (any order)
 * @returns {{ playerId: string, playerName: string, wins: number, losses: number, draws: number, games: number }[]}
 */
export function computeSeriesStandings(rooms) {
  const standings = {}  // { [playerId]: { playerName, wins, losses, draws, games } }

  for (const room of (rooms || [])) {
    if (room.devMode) continue
    // Register every real player who participated
    for (const p of (room.players || []).filter(p => !p.isBot)) {
      if (!standings[p.id]) standings[p.id] = { playerName: p.name, wins: 0, losses: 0, draws: 0, games: 0 }
      standings[p.id].games++
    }
    // Tally round outcomes
    for (const round of (room.rounds || [])) {
      if (round.draw) {
        for (const c of (round.combatants || [])) {
          if (standings[c.ownerId]) standings[c.ownerId].draws++
        }
      } else if (round.winner) {
        if (standings[round.winner.ownerId]) standings[round.winner.ownerId].wins++
        for (const c of (round.combatants || []).filter(c => c.id !== round.winner.id)) {
          if (standings[c.ownerId]) standings[c.ownerId].losses++
        }
      }
    }
  }

  return Object.entries(standings)
    .map(([playerId, s]) => ({ playerId, ...s }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
}

// ─── History grouping ─────────────────────────────────────────────────────────

/**
 * Groups a flat list of rooms into display items for ChroniclesScreen.
 *
 * Returns an array sorted newest-first, each item either:
 *   { type: 'series',     seriesId, rooms: Room[], latestAt: number }
 *   { type: 'standalone', room: Room,              latestAt: number }
 *
 * Rooms that share a seriesId are grouped together. Rooms without seriesId
 * but linked via prevRoomId/nextRoomId are grouped by walking the in-memory
 * chain to find the oldest ancestor (backward compat for pre-series rooms).
 */
export function groupRoomsForHistory(rooms) {
  // Build a quick lookup
  const byId = {}
  rooms.forEach(r => { byId[r.id] = r })

  // Find the oldest ancestor in a prevRoomId chain for rooms without seriesId
  function chainRoot(room) {
    let current = room
    const visited = new Set()
    while (current.prevRoomId && !visited.has(current.id)) {
      visited.add(current.id)
      const prev = byId[current.prevRoomId]
      if (!prev) break
      current = prev
    }
    return current.id
  }

  const seriesMap = {}   // seriesId → Room[]

  rooms.forEach(r => {
    // Determine the canonical series key
    let key
    if (r.seriesId) {
      key = r.seriesId
    } else if (r.prevRoomId || r.nextRoomId) {
      key = chainRoot(r)
    } else {
      key = null  // truly standalone
    }

    if (key) {
      if (!seriesMap[key]) seriesMap[key] = []
      seriesMap[key].push(r)
    }
  })

  const items = []

  // Series items
  Object.entries(seriesMap).forEach(([seriesId, seriesRooms]) => {
    const sorted = [...seriesRooms].sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0))
    const latestAt = Math.max(...seriesRooms.map(r => r.createdAt))
    items.push({ type: 'series', seriesId, rooms: sorted, latestAt })
  })

  // Standalone items
  rooms.forEach(r => {
    if (!r.seriesId && !r.prevRoomId && !r.nextRoomId) {
      items.push({ type: 'standalone', room: r, latestAt: r.createdAt })
    }
  })

  return items.sort((a, b) => b.latestAt - a.latestAt)
}

// ─── Voting engine ────────────────────────────────────────────────────────────

/**
 * Pure voting resolution function. Determines the outcome of a ballot phase.
 * Called by VotingPanel on every state change and used directly in unit tests.
 *
 * @param {object}   params
 * @param {{ nomineeId: string }[]} params.votes          — actual nominations cast; abstains are absent
 * @param {number}                  params.voterCount     — total eligible voters
 * @param {string[]}                params.lockedVoterIds — voters who locked in (voted OR abstained)
 * @param {'nomination'|'runoff'}   params.phase
 * @param {boolean}                 params.hostClose      — true when host forces early resolution
 * @param {string[]|null}           [params.runoffPool]   — nominee IDs active in the runoff phase;
 *                                                          required when phase is 'runoff' and hostClose is true
 *
 * @returns {{ outcome: string, winnerIds: string[] }}
 *   pending   — not everyone has locked in and host hasn't closed; nothing to resolve yet
 *   winner    — one clear winner; winnerIds has exactly one entry
 *   runoff    — nomination-phase tie with no host close; winnerIds lists the tied nominees
 *   co_award  — forced tie resolution; winnerIds lists all co-recipients
 *   no_votes  — no nominations were cast; no award
 */
export function resolveVotingPhase({ votes, voterCount, lockedVoterIds, phase, hostClose, runoffPool }) {
  const allLockedIn = lockedVoterIds.length >= voterCount
  if (!allLockedIn && !hostClose) return { outcome: 'pending', winnerIds: [] }

  // Closing the runoff early co-awards all runoff nominees regardless of current votes.
  // (This differs from closing nomination early, which resolves with current votes.)
  if (phase === 'runoff' && hostClose) {
    const ids = runoffPool?.length ? runoffPool : []
    return ids.length ? { outcome: 'co_award', winnerIds: ids } : { outcome: 'no_votes', winnerIds: [] }
  }

  const tally = {}
  for (const v of votes) {
    tally[v.nomineeId] = (tally[v.nomineeId] || 0) + 1
  }

  if (Object.keys(tally).length === 0) return { outcome: 'no_votes', winnerIds: [] }

  const maxVotes = Math.max(...Object.values(tally))
  const leaders  = Object.keys(tally).filter(id => tally[id] === maxVotes)

  if (leaders.length === 1) return { outcome: 'winner', winnerIds: leaders }

  // Tie: open runoff only during nomination without a host close.
  // Any other tie context (runoff deadlock, nomination host close) resolves as co-award.
  if (phase === 'nomination' && !hostClose) return { outcome: 'runoff', winnerIds: leaders }
  return { outcome: 'co_award', winnerIds: leaders }
}

