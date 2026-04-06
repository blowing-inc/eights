// File download helpers used by AdminScreen and HistoryRoomDetail.
import { buildChainEvolutionStory } from './gameLogic.js'

export function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ─── Combatant export ─────────────────────────────────────────────────────────

/**
 * Formats a combatant's full history as plain text.
 * lineageTree is the raw array from getLineageTree — root + all variants,
 * each with id, name, bio, wins, losses, lineage.
 */
export function formatCombatantHistory(combatant, lineageTree = []) {
  const sorted = [...lineageTree].sort((a, b) =>
    (a.lineage?.generation ?? 0) - (b.lineage?.generation ?? 0)
  )
  const lines = []

  lines.push(`EIGHTS — COMBATANT HISTORY`)
  lines.push(`${combatant.name}  ·  by ${combatant.owner_name || '?'}`)
  lines.push('')

  if (sorted.length > 1) {
    lines.push('=== EVOLUTION CHAIN ===')
    sorted.forEach(node => {
      const gen = node.lineage?.generation ?? 0
      const bf  = node.lineage?.bornFrom
      if (bf) {
        lines.push(`  ⚡ Beat ${bf.opponentName || 'opponent'} in ${bf.gameCode} R${bf.roundNumber} →`)
      }
      lines.push(`  Gen ${gen}: ${node.name}`)
      if (node.bio) lines.push(`    "${node.bio}"`)
    })
    lines.push('')
  } else if (combatant.bio) {
    lines.push(`"${combatant.bio}"`)
    lines.push('')
  }

  const total = (combatant.wins || 0) + (combatant.losses || 0)
  lines.push('=== RECORD ===')
  lines.push(`  ${combatant.wins || 0}W  ${combatant.losses || 0}L  ·  ${total} battle${total !== 1 ? 's' : ''}`)

  const heart = combatant.reactions_heart || 0
  const angry = combatant.reactions_angry || 0
  const cry   = combatant.reactions_cry   || 0
  if (heart + angry + cry > 0) {
    lines.push(`  Reactions: ❤️ ${heart}  😡 ${angry}  😂 ${cry}`)
  }

  return lines.join('\n')
}

// ─── Single-tournament export ─────────────────────────────────────────────────

export function formatRoomAsText(room) {
  const players         = (room.players || []).filter(p => !p.isBot)
  const allRounds       = room.rounds || []
  const completedRounds = allRounds.filter(r => r.winner)
  const date = new Date(room.createdAt).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const lines = []

  // Header
  const seriesPart = room.seriesId
    ? ` · Game ${room.seriesIndex || 1} of series ${room.seriesId}`
    : ''
  lines.push(`EIGHTS — ROOM ${room.code}${seriesPart}`)
  lines.push(`Date:    ${date}`)
  lines.push(`Players: ${players.map(p => p.name).join(', ')}`)

  const s = room.settings || {}
  const settingParts = [
    `${s.rosterSize ?? 8} combatants`,
    s.biosRequired        ? 'bios required'        : null,
    s.anonymousCombatants ? 'anonymous combatants' : null,
    s.blindVoting         ? 'blind voting'          : null,
    s.allowSpectators     ? 'spectators allowed'    : null,
  ].filter(Boolean)
  lines.push(`Settings: ${settingParts.join(', ')}`)
  if (room.prevRoomId) lines.push(`Follows:  room ${room.prevRoomId}`)
  if (room.nextRoomId) lines.push(`Continued as: room ${room.nextRoomId}`)
  if (room.devMode)    lines.push('(Dev mode)')
  lines.push('')

  // Results summary
  if (completedRounds.length > 0) {
    lines.push('=== RESULTS ===')
    completedRounds.forEach(r => {
      const ownerName = players.find(p => p.id === r.winner.ownerId)?.name || r.winner.ownerName || '?'
      const evoPart   = r.evolution ? ` → evolved to ${r.evolution.toName}` : ''
      lines.push(`  Round ${r.number}: ${r.winner.name} (by ${ownerName})${evoPart}`)
    })
    lines.push('')
  }

  // Per-round detail
  allRounds.forEach(r => {
    lines.push(`=== ROUND ${r.number} ===`)
    ;(r.combatants || []).forEach(c => {
      const ownerName = players.find(p => p.id === c.ownerId)?.name || c.ownerName || '?'
      lines.push(`  ${c.name} (by ${ownerName})`)
      if (c.bio) lines.push(`    "${c.bio}"`)
    })
    lines.push('')
    lines.push(r.winner ? `  Winner: ${r.winner.name}` : '  No result recorded')
    lines.push('')

    const picks     = r.picks || {}
    const voteLines = Object.entries(picks).map(([pid, cid]) => {
      const pname = players.find(p => p.id === pid)?.name || '?'
      const cname = (r.combatants || []).find(c => c.id === cid)?.name || '?'
      return `    ${pname} → ${cname}`
    })
    if (voteLines.length) {
      lines.push('  Votes:')
      voteLines.forEach(v => lines.push(v))
      lines.push('')
    }

    const pr = r.playerReactions || {}
    const reactionLines = (r.combatants || []).flatMap(c => {
      const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
      const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
      const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length
      return heart + angry + cry > 0
        ? [`    ${c.name}: ❤️ ${heart}  😡 ${angry}  😂 ${cry}`]
        : []
    })
    if (reactionLines.length) {
      lines.push('  Reactions:')
      reactionLines.forEach(l => lines.push(l))
      lines.push('')
    }

    if (r.evolution) {
      const ev        = r.evolution
      const opponents = (r.combatants || []).filter(c => c.id !== ev.fromId).map(c => c.name)
      const fightDesc = opponents.length ? `after the fight with ${opponents.join(' and ')}` : 'after this fight'
      lines.push('  ⚡ Evolution:')
      lines.push(`    ${ev.fromName} evolved to ${ev.toName} ${fightDesc}.`)
      if (ev.toBio) lines.push(`    "${ev.toBio}"`)
      lines.push('')
    }

    const chat = r.chat || []
    if (chat.length) {
      lines.push('  Chat:')
      chat.forEach(m => lines.push(`    ${m.playerName}: ${m.text}`))
      lines.push('')
    }

    lines.push('')
  })

  // Combatant roster
  const allCombatants = Object.values(room.combatants || {}).flat().filter(c => !c.isBot)
  if (allCombatants.length) {
    lines.push('=== COMBATANT ROSTER ===')
    const evolvedTo = {}
    allRounds.forEach(r => { if (r.evolution) evolvedTo[r.evolution.fromId] = r.evolution })

    allCombatants.sort((a, b) => b.wins - a.wins).forEach(c => {
      const owner = players.find(p => p.id === c.ownerId)
      const gen   = c.lineage?.generation ? ` [gen ${c.lineage.generation}]` : ''
      lines.push(`  ${c.name}${gen} — ${c.wins}W ${c.losses}L (by ${owner?.name || c.ownerName || '?'})`)
      if (c.bio) lines.push(`    "${c.bio}"`)
      if (c.trapTarget) {
        const triggered = c.trapTriggered ? ' (triggered)' : ' (not triggered)'
        lines.push(`    🪤 Trap set against: ${c.trapTarget.targetName}${triggered}`)
      }
      const evo = evolvedTo[c.id]
      if (evo) {
        const evoRound   = allRounds.find(r => r.evolution?.fromId === c.id)
        const opponents  = (evoRound?.combatants || []).filter(x => x.id !== c.id).map(x => x.name)
        const fightPart  = opponents.length ? ` after beating ${opponents.join(' and ')}` : ''
        lines.push(`    ⚡ Evolved to: ${evo.toName}${fightPart} (round ${evoRound?.number ?? '?'})`)
        if (evo.toBio) lines.push(`       New bio: "${evo.toBio}"`)
      }
    })
    lines.push('')
  }

  // Evolutions summary
  const evoRounds = allRounds.filter(r => r.evolution)
  if (evoRounds.length) {
    lines.push('=== EVOLUTIONS ===')
    evoRounds.forEach(r => {
      const ev  = r.evolution
      const opp = (r.combatants || []).filter(c => c.id !== ev.fromId).map(c => c.name)
      const vs  = opp.length ? ` (beat ${opp.join(', ')})` : ''
      lines.push(`  Round ${r.number}: ${ev.fromName} → ${ev.toName}${vs}`)
      if (ev.toBio) lines.push(`    New bio: "${ev.toBio}"`)
    })
  }

  return lines.join('\n')
}

// ─── Series export ────────────────────────────────────────────────────────────

// Accepts all rooms in a series sorted by seriesIndex (oldest first).
export function formatSeriesAsText(rooms) {
  if (!rooms.length) return ''

  const seriesId  = rooms[0].seriesId || rooms[0].id
  const allPlayers = [...new Map(
    rooms.flatMap(r => (r.players || []).filter(p => !p.isBot).map(p => [p.id, p]))
  ).values()]

  const firstDate = new Date(rooms[0].createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  const lastDate  = rooms.length > 1
    ? new Date(rooms[rooms.length - 1].createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const lines = []

  // ── Series header ──────────────────────────────────────────────────────────
  lines.push(`EIGHTS — SERIES ${seriesId}`)
  lines.push(`Games:   ${rooms.length}`)
  lines.push(`Players: ${allPlayers.map(p => p.name).join(', ')}`)
  lines.push(`Dates:   ${lastDate ? `${firstDate} – ${lastDate}` : firstDate}`)
  lines.push('')

  // ── Per-game summaries ─────────────────────────────────────────────────────
  rooms.forEach((room, i) => {
    const gameNum   = room.seriesIndex || i + 1
    const players   = (room.players || []).filter(p => !p.isBot)
    const completed = (room.rounds || []).filter(r => r.winner)
    const evoRounds = (room.rounds || []).filter(r => r.evolution)
    const date = new Date(room.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

    lines.push(`${'─'.repeat(60)}`)
    lines.push(`GAME ${gameNum} — ROOM ${room.code} — ${date}`)
    lines.push(`${'─'.repeat(60)}`)

    // Winners per round
    if (completed.length) {
      completed.forEach(r => {
        const ownerName = players.find(p => p.id === r.winner.ownerId)?.name || r.winner.ownerName || '?'
        const evoPart   = r.evolution ? ` → evolved to ${r.evolution.toName}` : ''
        lines.push(`  Round ${r.number}: 🏆 ${r.winner.name} (${ownerName})${evoPart}`)
      })
    } else {
      lines.push('  No rounds completed.')
    }

    // Evolution callouts for this game
    if (evoRounds.length) {
      lines.push('')
      evoRounds.forEach(r => {
        const ev  = r.evolution
        const opp = (r.combatants || []).filter(c => c.id !== ev.fromId).map(c => c.name)
        const vs  = opp.length ? ` after beating ${opp.join(' and ')}` : ''
        lines.push(`  ⚡ ${ev.fromName} → ${ev.toName}${vs}`)
        if (ev.toBio) lines.push(`     "${ev.toBio}"`)
      })
    }

    lines.push('')
  })

  // ── Combatant lineage across the series ───────────────────────────────────
  // Find all lineage roots: combatants that evolved but were never themselves
  // the product of an evolution (i.e. fromId not in any toId set).
  const allEvolutions = rooms.flatMap(r =>
    (r.rounds || []).filter(rd => rd.evolution).map(rd => rd.evolution)
  )

  if (allEvolutions.length) {
    const toIds   = new Set(allEvolutions.map(e => e.toId))
    const rootIds = [...new Set(allEvolutions.map(e => e.fromId).filter(id => !toIds.has(id)))]

    lines.push(`${'─'.repeat(60)}`)
    lines.push('COMBATANT LINEAGE')
    lines.push(`${'─'.repeat(60)}`)

    rootIds.forEach(rootId => {
      const story = buildChainEvolutionStory(rooms, rootId)
      if (!story.length) return

      // Find the owner name from the roster of the first game
      const ownerName = (() => {
        for (const room of rooms) {
          const flat = Object.values(room.combatants || {}).flat()
          const c = flat.find(x => x.id === rootId)
          if (c) return c.ownerName || (room.players || []).find(p => p.id === c.ownerId)?.name || '?'
        }
        return '?'
      })()

      lines.push('')
      lines.push(`  ${story[0].name}  (by ${ownerName})`)

      story.forEach((node, i) => {
        const indent = '    ' + '  '.repeat(i)
        if (i === 0) {
          lines.push(`${indent}Gen 0: ${node.name}`)
        } else {
          const bf = node.bornFrom
          if (bf) {
            const gameLabel = (() => {
              const room = rooms.find(r => r.code === bf.gameCode)
              return room ? `Game ${room.seriesIndex || '?'}` : bf.gameCode
            })()
            lines.push(`${indent.slice(2)}    ⚡ Beat ${bf.opponentName || 'opponent'} in ${gameLabel} R${bf.roundNumber} →`)
          }
          lines.push(`${indent}Gen ${node.generation}: ${node.name}`)
        }
      })
    })

    lines.push('')
  }

  return lines.join('\n')
}
