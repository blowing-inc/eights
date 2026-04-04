// Pure game logic extracted from App.jsx for testability.
// No React, no Supabase imports — all functions are deterministic given their inputs.

// ─── Utilities ────────────────────────────────────────────────────────────────

export function uid() { return Math.random().toString(36).slice(2, 9) }

export function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export const COLORS = ['#7F77DD','#1D9E75','#D85A30','#378ADD','#D4537E','#639922','#BA7517','#E24B4A']
export function playerColor(idx) { return COLORS[idx % COLORS.length] }

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
