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
  const players = (room.players || []).filter(p => !p.isBot)
  const allRounds = room.rounds || []
  const completedRounds = allRounds.filter(r => r.winner)
  const date = new Date(room.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const lines = []

  lines.push(`EIGHTS — ROOM ${room.code}`)
  lines.push(`Date: ${date}`)
  lines.push(`Players: ${players.map(p => p.name).join(', ')}`)
  if (room.devMode) lines.push('(Dev mode)')
  lines.push('')

  if (completedRounds.length > 0) {
    lines.push('=== WINNERS ===')
    completedRounds.forEach(r => {
      const ownerName = (room.players || []).find(p => p.id === r.winner.ownerId)?.name || r.winner.ownerName || '?'
      lines.push(`  Round ${r.number}: ${r.winner.name} (by ${ownerName})`)
    })
    lines.push('')
  }

  allRounds.forEach(r => {
    lines.push(`=== ROUND ${r.number} ===`)
    lines.push(r.combatants.map(c => c.name).join(' vs '))
    lines.push(r.winner ? `Winner: ${r.winner.name}` : 'No result recorded')
    lines.push('')

    const picks = r.picks || {}
    const voteLines = Object.entries(picks).map(([pid, cid]) => {
      const pname = (room.players || []).find(p => p.id === pid)?.name || '?'
      const cname = (r.combatants || []).find(c => c.id === cid)?.name || '?'
      return `  ${pname} → ${cname}`
    })
    if (voteLines.length) { lines.push('Votes:'); voteLines.forEach(v => lines.push(v)); lines.push('') }

    const pr = r.playerReactions || {}
    const reactionLines = (r.combatants || []).flatMap(c => {
      const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
      const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
      const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length
      return heart + angry + cry > 0 ? [`  ${c.name}: ❤️ ${heart}  😡 ${angry}  😂 ${cry}`] : []
    })
    if (reactionLines.length) { lines.push('Reactions:'); reactionLines.forEach(l => lines.push(l)); lines.push('') }

    const chat = r.chat || []
    if (chat.length) { lines.push('Chat:'); chat.forEach(m => lines.push(`  ${m.playerName}: ${m.text}`)); lines.push('') }

    lines.push('')
  })

  const allCombatants = Object.values(room.combatants || {}).flat().filter(c => !c.isBot)
  if (allCombatants.length) {
    lines.push('=== COMBATANT ROSTER ===')
    allCombatants.sort((a, b) => b.wins - a.wins).forEach(c => {
      const owner = (room.players || []).find(p => p.id === c.ownerId)
      lines.push(`  ${c.name} — ${c.wins}W ${c.losses}L (by ${owner?.name || c.ownerName || '?'})`)
      if (c.bio) lines.push(`    "${c.bio}"`)
    })
  }

  return lines.join('\n')
}
