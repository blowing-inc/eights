// Pure game logic extracted from App.jsx for testability.
// No React, no Supabase imports — all functions are deterministic given their inputs.

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
    ...settings,
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
 * Simulates all remaining rounds of a battle to completion.
 * Picks a random winner for each unplayed round.
 * Returns the fully updated room object (does not write to DB).
 */
export function simulateBattleToEnd(room) {
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
 * Whether the host can force-start the battle phase with only some players ready.
 * Requires: is host, at least 2 ready, and at least 1 still not ready.
 */
export function canForceStart(isHost, readyCount, totalRealPlayers) {
  return isHost && readyCount >= 2 && readyCount < totalRealPlayers
}

// ─── Battle logic ─────────────────────────────────────────────────────────────

/**
 * Whether the host can undo the last round.
 * Requires: is host, at least one round has been played, and that round has a winner.
 */
export function canUndoLastRound(isHost, currentRound, round) {
  return isHost && currentRound > 0 && Boolean(round?.winner)
}

/**
 * Whether a player can edit a combatant (owner or room host).
 */
export function canEditCombatant(ownerId, playerId, hostId) {
  return ownerId === playerId || playerId === hostId
}

// ─── Room lifecycle ───────────────────────────────────────────────────────────

/**
 * Scans a completed room's rounds and builds a per-owner map of winning combatants.
 * Used to populate prevWinners on the next battle room so the draft can enforce
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

// ─── confirmWinner stat mutation ──────────────────────────────────────────────

/**
 * Given the full room object and a winning combatant id, returns updated
 * combatants map with wins/losses incremented and battle records appended.
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

// ─── undoLastRound stat mutation ──────────────────────────────────────────────

/**
 * Reverses the stat changes from the last completed round.
 * Returns a new combatants map with wins/losses decremented and the round's
 * battle record entries removed.  Clamps to 0 (never goes negative).
 */
export function undoRound(room, round) {
  const combatants = JSON.parse(JSON.stringify(room.combatants))
  if (!round?.winner) return combatants

  Object.keys(combatants).forEach(pid => {
    combatants[pid] = combatants[pid].map(c => {
      if (!round.combatants.find(rc => rc.id === c.id)) return c
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

// ─── Ticker messages ──────────────────────────────────────────────────────────

/**
 * Isolated from slist() — accepts the raw rooms array directly so it can be
 * unit tested without a network call.
 */
export function buildTickerMessages(rooms) {
  const valid = (rooms || []).filter(r => r && !r.devMode)
  const completedRounds = valid.flatMap(r => (r.rounds || []).filter(rd => rd.winner))
  const players = [...new Set(valid.flatMap(r => (r.players || []).filter(p => !p.isBot).map(p => p.name)))]

  const stats = {}
  valid.forEach(r => {
    Object.values(r.combatants || {}).flat().filter(c => !c.isBot).forEach(c => {
      if (!stats[c.name]) stats[c.name] = { wins: 0, losses: 0 }
      stats[c.name].wins   += c.wins   || 0
      stats[c.name].losses += c.losses || 0
    })
  })

  const msgs = []
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  ;[...completedRounds].sort(() => Math.random() - 0.5).slice(0, 10).forEach(rd => {
    const w = rd.winner.name
    const losers = (rd.combatants || []).filter(c => c.id !== rd.winner.id).map(c => c.name)
    if (!losers.length) return
    const l1 = losers[0], l2 = losers[1]
    msgs.push(pick([
      `Can you believe ${w} took down ${losers.join(' and ')} in single combat?`,
      `JUST IN: ${w} has defeated ${l1}. ${l1} could not be reached for comment.`,
      `In a bout for the ages, ${w} demolished ${l1} into fine powder.`,
      `${w} wins again. ${l1} is reportedly reconsidering their life choices.`,
      l2 ? `${w} somehow beat both ${l1} AND ${l2}. The physics community is disturbed.`
         : `The council has ruled that ${l1}'s loss to ${w} was, quote, "totally deserved."`,
      `Eyewitnesses describe the scene: ${w} victorious, ${l1} inconsolable. Details at 11.`,
      `${l1} entered the arena confident. ${w} had other plans.`,
      `Officials confirm ${w} defeated ${l1}. No further explanation was provided.`,
    ]))
  })

  Object.entries(stats).forEach(([name, s]) => {
    if (s.losses >= 4) msgs.push(pick([
      `Breaking news: ${name} has now lost ${s.losses} times. Thoughts and prayers.`,
      `${name} is ${s.wins}-${s.losses}. Statistically speaking, rough.`,
      `Sources close to ${name} say they are "doing fine." They are not fine.`,
    ]))
    if (s.wins >= 4 && s.losses === 0) msgs.push(pick([
      `${name} sits at ${s.wins}-0. Suspicious. Very suspicious.`,
      `Nobody has beaten ${name} yet. The arena is getting nervous.`,
      `ALERT: ${name} remains undefeated. An investigation has been opened.`,
    ]))
    if (s.wins >= 3 && s.losses >= 3) msgs.push(
      `${name} is ${s.wins}-${s.losses}. A complicated legacy. A messy record. A legend, maybe.`
    )
  })

  ;[...players].sort(() => Math.random() - 0.5).slice(0, 4).forEach(p => msgs.push(pick([
    `Greetings, returning player ${p}. The arena remembers. The arena judges.`,
    `${p} is back. Somebody warn the others.`,
    `A warm welcome to ${p}, who has definitely lost sleep over these matches.`,
    `${p} has rejoined the arena. Their combatants tremble with anticipation.`,
  ])))

  msgs.push(
    "Today's forecast: chaotic neutral with a high chance of upsets.",
    "All combatants are equal. Some are just more equal than others.",
    "The council reminds you: it's not personal. Actually, it's extremely personal.",
    "Scientists are baffled. Philosophers are concerned. Combatants are ready.",
    "No crying in the arena. This is your only warning.",
    "The loser will not be forgotten. Neither will the winner. We forget nothing.",
    "New challenger approaching. Old challenger still sulking in the corner.",
    "The arena does not accept appeals, complaints, or requests for recounts.",
    "Fun fact: 100% of combatants who have never lost are currently undefeated.",
    "Management is not responsible for emotional damage caused by tournament results.",
    "Somewhere, a combatant is preparing. It probably won't help.",
    "Submit your 8. Destiny will handle the rest.",
    "This ticker is legally distinct from sports journalism.",
    "Please do not taunt the combatants. They are doing their best.",
    "Win or lose, everyone goes home with a story. Losers go home with two.",
  )

  return msgs.sort(() => Math.random() - 0.5)
}

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
  const family = (allCombatants || []).filter(c =>
    c.id === rootId || c.lineage?.rootId === rootId
  )
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
 * Use this when you have combatant data (Bestiary, detail pages). Use
 * buildChainEvolutionStory when you have room history (HistoryScreen).
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
      if (!round.evolution) continue
      const { fromId, fromName, toId, toName } = round.evolution
      if (!knownIds.has(fromId)) continue
      const opponent = (round.combatants || []).find(c => c.id !== fromId)
      events.push({
        fromId, fromName, toId, toName,
        roundNumber:  round.number,
        gameCode:     room.code,
        opponentName: opponent?.name || null,
      })
      knownIds.add(toId)
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
      bornFrom: {
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

// ─── History grouping ─────────────────────────────────────────────────────────

/**
 * Groups a flat list of rooms into display items for HistoryScreen.
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
