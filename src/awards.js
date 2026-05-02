// Pure awards / achievement logic — no React, no Supabase.
// Owns: superlative computation (computeSuperlatives) for the combatant detail page.
// Does not mutate any data — consumes tallyReactions and computeSeriesStandings
//   from gameLogic.js but only reads their output.
import { tallyReactions, computeSeriesStandings } from './gameLogic.js'

// ─── Achievement superlatives ─────────────────────────────────────────────────

/**
 * Returns an array of { label, tooltip } objects for the combatant detail page.
 *
 * Superlatives are shown on the detail page only — not on small cards.
 * The list is intentionally conservative: only emit an entry when the stat
 * is unambiguously worth surfacing (thresholds below).
 *
 * @param {object} c        - combatant record (wins, losses, draws, mvp_record)
 * @param {Array|null} h2h  - head-to-head rows from getCombatantRoundHistory, or null if not yet loaded
 * @returns {{ label: string, tooltip: string }[]}
 */
export function computeSuperlatives(c, h2h) {
  const superlatives = []
  const wins   = c.wins   || 0
  const losses = c.losses || 0
  const draws  = c.draws  || 0
  const total  = wins + losses + draws

  if (total === 0) return superlatives

  // Unique opponents beaten — requires h2h data
  if (h2h && h2h.length > 0) {
    const beaten = h2h.filter(r => r.wins > 0).length
    const faced  = h2h.length
    if (beaten > 0) {
      superlatives.push({
        label:   `Beat ${beaten} ${beaten === 1 ? 'opponent' : 'opponents'}`,
        tooltip: `Won at least one matchup against ${beaten} of ${faced} distinct ${faced === 1 ? 'opponent' : 'opponents'} faced`,
      })
    }
  }

  // Undefeated — at least one win, zero losses (draws don't break it)
  if (wins > 0 && losses === 0) {
    const detail = draws > 0 ? ` (${wins}W ${draws}D)` : ` (${wins}W)`
    superlatives.push({
      label:   'Undefeated',
      tooltip: `Has never lost a round${detail}`,
    })
  }

  // Win rate — only surface when meaningful (≥5 rounds, ≥70% wins)
  if (total >= 5 && wins / total >= 0.7) {
    const pct = Math.round((wins / total) * 100)
    superlatives.push({
      label:   `${pct}% win rate`,
      tooltip: `Won ${wins} of ${total} rounds played`,
    })
  }

  // MVP wins — voting ships 1.3.x; field is captured in schema now
  const mvpCount = (c.mvp_record || []).length
  if (mvpCount > 0) {
    superlatives.push({
      label:   `MVP ${mvpCount === 1 ? 'once' : `${mvpCount} times`}`,
      tooltip: `Named most valuable combatant by player vote ${mvpCount === 1 ? 'once' : `${mvpCount} times`}`,
    })
  }

  return superlatives
}

// ─── Award nomination pools ───────────────────────────────────────────────────

// All distinct combatants that appeared in any game across a series or season.
// rooms: array of room records (from getHeritageChain or getSeasonRooms).
export function getSeriesCombatantNominees(rooms) {
  const seen = new Set()
  const nominees = []
  for (const room of rooms) {
    for (const combatants of Object.values(room.combatants || {})) {
      for (const c of combatants) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          nominees.push({ id: c.id, name: c.name, type: 'combatant' })
        }
      }
    }
  }
  return nominees
}

// All evolutions that occurred across a series or season as nominee objects.
// Display name includes opponent context per the narrative principle:
// "they beat [opponent] and became this."
// rooms: array of room records (from getHeritageChain or getSeasonRooms).
export function getSeriesEvolutionNominees(rooms) {
  const seen = new Set()
  const nominees = []
  for (const room of rooms) {
    for (const round of (room.rounds || [])) {
      if (!round.evolution) continue
      const { fromId, fromName, toId, toName } = round.evolution
      if (seen.has(toId)) continue
      seen.add(toId)
      const opponent = (round.combatants || []).find(c => c.id !== fromId)
      const opponentName = opponent?.name || '?'
      nominees.push({
        id:   toId,
        name: `${toName} (${fromName} beat ${opponentName})`,
        type: 'combatant',
      })
    }
  }
  return nominees
}

// Season-scoped aliases — same room-structure logic, different semantic scope.
export const getSeasonCombatantNominees = getSeriesCombatantNominees
export const getSeasonEvolutionNominees  = getSeriesEvolutionNominees

// ─── Automatic award computation ──────────────────────────────────────────────

// Returns the shaped objects for `createAutoAwards`. Each object is fully
// resolved (awarded_at set by caller) and has no ballot_state.
//
// Shape: { type, layer, scope_id, scope_type, recipient_id, recipient_name,
//          recipient_type, value, co_award }

function coAwardRows(entries, { type, layer, scopeId, scopeType, recipientType, value }) {
  const coAward = entries.length > 1
  return entries.map(([id, name]) => ({
    type, layer,
    scope_id:       scopeId,
    scope_type:     scopeType,
    recipient_id:   id,
    recipient_name: name,
    recipient_type: recipientType,
    value:          value ?? null,
    co_award:       coAward,
  }))
}

/**
 * Computes automatic game-level awards from a completed room record.
 * Skips dev-mode games and games with no resolved rounds.
 *
 * Awards: most_wins (player), undefeated (player), shutout (player),
 *         most_reactions (combatant)
 */
export function computeGameAutoAwards(room) {
  if (room.devMode) return []

  const resolvedRounds = (room.rounds || []).filter(r => r.winner || r.draw)
  if (resolvedRounds.length === 0) return []

  const players = (room.players || []).filter(p => !p.isBot)
  if (players.length === 0) return []

  const scope = { layer: 'game', scopeId: room.id, scopeType: 'game' }
  const awards = []

  // ── Per-player round tallies ─────────────────────────────────────────────
  const tally = {}
  for (const p of players) tally[p.id] = { wins: 0, losses: 0, name: p.name }

  for (const round of resolvedRounds) {
    if (round.winner) {
      if (tally[round.winner.ownerId]) tally[round.winner.ownerId].wins++
      for (const c of (round.combatants || []).filter(c => c.id !== round.winner.id)) {
        if (tally[c.ownerId]) tally[c.ownerId].losses++
      }
    } else if (round.draw) {
      // draws don't break undefeated; don't count as wins or losses
    }
  }

  // most_wins
  const maxWins = Math.max(...Object.values(tally).map(p => p.wins))
  if (maxWins > 0) {
    const tops = Object.entries(tally).filter(([, p]) => p.wins === maxWins).map(([id, p]) => [id, p.name])
    awards.push(...coAwardRows(tops, { ...scope, recipientType: 'player', value: maxWins, type: 'most_wins' }))
  }

  // undefeated: ≥1 win, 0 losses
  const undefeated = Object.entries(tally).filter(([, p]) => p.wins > 0 && p.losses === 0).map(([id, p]) => [id, p.name])
  for (const [id, name] of undefeated) {
    awards.push(...coAwardRows([[id, name]], { ...scope, recipientType: 'player', value: null, type: 'undefeated' }))
  }

  // shutout: 0 wins, ≥1 loss
  const shutout = Object.entries(tally).filter(([, p]) => p.wins === 0 && p.losses > 0).map(([id, p]) => [id, p.name])
  for (const [id, name] of shutout) {
    awards.push(...coAwardRows([[id, name]], { ...scope, recipientType: 'player', value: null, type: 'shutout' }))
  }

  // most_reactions: combatant with most total reactions across all rounds
  const reactionTotals = {}
  for (const combatants of Object.values(room.combatants || {})) {
    for (const c of combatants) {
      if (c.isBot) continue
      let total = 0
      for (const round of resolvedRounds) {
        const { heart, angry, cry } = tallyReactions(round.playerReactions, c.id)
        total += heart + angry + cry
      }
      if (total > 0) reactionTotals[c.id] = { total, name: c.name }
    }
  }
  const maxReactions = Math.max(...Object.values(reactionTotals).map(r => r.total), 0)
  if (maxReactions > 0) {
    const tops = Object.entries(reactionTotals).filter(([, r]) => r.total === maxReactions).map(([id, r]) => [id, r.name])
    awards.push(...coAwardRows(tops, { ...scope, recipientType: 'combatant', value: maxReactions, type: 'most_reactions' }))
  }

  return awards
}

function _computeAutoAwardsForScope(rooms, scope) {
  const valid = (rooms || []).filter(r => r.phase === 'ended' && !r.endedEarly && !r.devMode)
  if (valid.length === 0) return []

  const awards = []

  // most_wins: reuse standings logic
  const standings = computeSeriesStandings(valid)
  if (standings.length > 0) {
    const maxWins = standings[0].wins
    if (maxWins > 0) {
      const tops = standings.filter(s => s.wins === maxWins).map(s => [s.playerId, s.playerName])
      awards.push(...coAwardRows(tops, { ...scope, recipientType: 'player', value: maxWins, type: 'most_wins' }))
    }
  }

  // most_evolutions: player who triggered the most evolutions
  const evoCount = {}
  for (const room of valid) {
    const playerMap = Object.fromEntries((room.players || []).filter(p => !p.isBot).map(p => [p.id, p.name]))
    for (const round of (room.rounds || [])) {
      if (!round.evolution || !round.winner) continue
      const ownerId = round.winner.ownerId
      const ownerName = playerMap[ownerId] || round.winner.ownerName
      if (!ownerId || !ownerName) continue
      if (!evoCount[ownerId]) evoCount[ownerId] = { count: 0, name: ownerName }
      evoCount[ownerId].count++
    }
  }
  const maxEvos = Math.max(...Object.values(evoCount).map(e => e.count), 0)
  if (maxEvos > 0) {
    const tops = Object.entries(evoCount).filter(([, e]) => e.count === maxEvos).map(([id, e]) => [id, e.name])
    awards.push(...coAwardRows(tops, { ...scope, recipientType: 'player', value: maxEvos, type: 'most_evolutions' }))
  }

  return awards
}

/**
 * Computes automatic series-level awards from all rooms in a series.
 * Only considers rooms with phase 'ended' (not endedEarly, not dev).
 *
 * Awards: most_wins (player), most_evolutions (player)
 */
export function computeSeriesAutoAwards(rooms, seriesId) {
  return _computeAutoAwardsForScope(rooms, { layer: 'series', scopeId: seriesId, scopeType: 'series' })
}

/**
 * Computes automatic season-level awards from all rooms in a season.
 * Same logic as series but scoped to the season container.
 *
 * Awards: most_wins (player), most_evolutions (player)
 */
export function computeSeasonAutoAwards(rooms, seasonId) {
  return _computeAutoAwardsForScope(rooms, { layer: 'season', scopeId: seasonId, scopeType: 'season' })
}

// Human-readable labels for every award type used in display components.
export const AWARD_TYPE_LABELS = {
  mvp:                    'MVP',
  most_wins:              'Most Round Wins',
  undefeated:             'Undefeated',
  shutout:                'Shutout',
  most_reactions:         'Most Reactive',
  most_evolutions:        'Most Evolutions',
  favorite_combatant:     'Favorite Combatant',
  most_creative_combatant:'Most Creative',
  best_evolution:         'Best Evolution',
  best_combatant:         'Best Combatant',
}
