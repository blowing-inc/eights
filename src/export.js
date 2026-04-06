// File download helpers used by AdminScreen and HistoryRoomDetail.

export function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export function formatRoomAsText(room) {
  const players        = (room.players || []).filter(p => !p.isBot)
  const allRounds      = room.rounds || []
  const completedRounds = allRounds.filter(r => r.winner)
  const date = new Date(room.createdAt).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const lines = []

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`EIGHTS — ROOM ${room.code}`)
  lines.push(`Date:    ${date}`)
  lines.push(`Players: ${players.map(p => p.name).join(', ')}`)

  const s = room.settings || {}
  const settingParts = [
    `${s.rosterSize ?? 8} combatants`,
    s.biosRequired        ? 'bios required'         : null,
    s.anonymousCombatants ? 'anonymous combatants'  : null,
    s.blindVoting         ? 'blind voting'           : null,
    s.allowSpectators     ? 'spectators allowed'     : null,
  ].filter(Boolean)
  lines.push(`Settings: ${settingParts.join(', ')}`)

  if (room.prevRoomId) lines.push(`Heritage: follows room ${room.prevRoomId}`)
  if (room.nextRoomId) lines.push(`Continued as: room ${room.nextRoomId}`)
  if (room.devMode)    lines.push('(Dev mode)')
  lines.push('')

  // ── Winners summary ─────────────────────────────────────────────────────────
  if (completedRounds.length > 0) {
    lines.push('=== RESULTS ===')
    completedRounds.forEach(r => {
      const ownerName = players.find(p => p.id === r.winner.ownerId)?.name || r.winner.ownerName || '?'
      const evoPart   = r.evolution ? ` → evolved to ${r.evolution.toName}` : ''
      lines.push(`  Round ${r.number}: ${r.winner.name} (by ${ownerName})${evoPart}`)
    })
    lines.push('')
  }

  // ── Per-round detail ────────────────────────────────────────────────────────
  allRounds.forEach(r => {
    lines.push(`=== ROUND ${r.number} ===`)

    // Combatants with bios
    ;(r.combatants || []).forEach(c => {
      const ownerName = players.find(p => p.id === c.ownerId)?.name || c.ownerName || '?'
      lines.push(`  ${c.name} (by ${ownerName})`)
      if (c.bio) lines.push(`    "${c.bio}"`)
    })
    lines.push('')

    lines.push(r.winner ? `  Winner: ${r.winner.name}` : '  No result recorded')
    lines.push('')

    // Votes
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

    // Reactions
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

    // Evolution narrative
    if (r.evolution) {
      const ev        = r.evolution
      const opponents = (r.combatants || []).filter(c => c.id !== ev.fromId).map(c => c.name)
      const fightDesc = opponents.length
        ? `after the fight with ${opponents.join(' and ')}`
        : 'after this fight'
      lines.push('  ⚡ Evolution:')
      lines.push(`    ${ev.fromName} evolved to ${ev.toName} ${fightDesc}.`)
      if (ev.toBio) lines.push(`    "${ev.toBio}"`)
      lines.push('')
    }

    // Chat
    const chat = r.chat || []
    if (chat.length) {
      lines.push('  Chat:')
      chat.forEach(m => lines.push(`    ${m.playerName}: ${m.text}`))
      lines.push('')
    }

    lines.push('')
  })

  // ── Combatant roster ────────────────────────────────────────────────────────
  const allCombatants = Object.values(room.combatants || {}).flat().filter(c => !c.isBot)
  if (allCombatants.length) {
    lines.push('=== COMBATANT ROSTER ===')

    // Build a map of which combatants evolved and into what, for annotation
    const evolvedTo = {}
    allRounds.forEach(r => {
      if (r.evolution) evolvedTo[r.evolution.fromId] = r.evolution
    })

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
        const opponents = (allRounds.find(r => r.evolution?.fromId === c.id)?.combatants || [])
          .filter(x => x.id !== c.id).map(x => x.name)
        const fightPart = opponents.length ? ` after beating ${opponents.join(' and ')}` : ''
        lines.push(`    ⚡ Evolved to: ${evo.toName}${fightPart} (round ${allRounds.find(r => r.evolution?.fromId === c.id)?.number ?? '?'})`)
        if (evo.toBio) lines.push(`       New bio: "${evo.toBio}"`)
      }
    })
    lines.push('')
  }

  // ── Evolutions this game ────────────────────────────────────────────────────
  const evolutionRounds = allRounds.filter(r => r.evolution)
  if (evolutionRounds.length) {
    lines.push('=== EVOLUTIONS ===')
    evolutionRounds.forEach(r => {
      const ev        = r.evolution
      const opponents = (r.combatants || []).filter(c => c.id !== ev.fromId).map(c => c.name)
      const vs        = opponents.length ? ` (beat ${opponents.join(', ')})` : ''
      lines.push(`  Round ${r.number}: ${ev.fromName} → ${ev.toName}${vs}`)
      if (ev.toBio) lines.push(`    New bio: "${ev.toBio}"`)
    })
  }

  return lines.join('\n')
}
