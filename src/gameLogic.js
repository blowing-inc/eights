// Pure game logic extracted from App.jsx for testability.
// No React, no Supabase imports — all functions are deterministic given their inputs.

// ─── Utilities ────────────────────────────────────────────────────────────────

export function uid() { return Math.random().toString(36).slice(2, 9) }

export function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export const COLORS = ['#7F77DD','#1D9E75','#D85A30','#378ADD','#D4537E','#639922','#BA7517','#E24B4A']
export function playerColor(idx) { return COLORS[idx % COLORS.length] }

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
 * Creates 8 combatant objects for a bot player from the predefined template lists.
 * idFn is injectable so tests can use deterministic IDs.
 */
export function makeBotCombatants(botIdx, botId, botName, idFn = uid) {
  return BOT_COMBATANTS[botIdx % 2].map((name, i) => ({
    id: idFn(), name, bio: BOT_BIOS[i],
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
 * Returns true when every real (non-bot) player has exactly 8 combatants submitted.
 * combatants map must already include the current player's freshly submitted list.
 */
export function isDraftComplete(players, combatants) {
  return players.filter(p => !p.isBot).every(p => (combatants[p.id] || []).length === 8)
}

/** How many real players have submitted their full 8-combatant roster. */
export function getReadyPlayerCount(players, combatants) {
  return players.filter(p => !p.isBot && (combatants[p.id] || []).length === 8).length
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
      return {
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
