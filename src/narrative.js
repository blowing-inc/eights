// Narrative copy: ticker messages and future flavor text (match intros, evolution
// announcements, series recaps). Pure module — no Supabase, no React.

// ─── Ticker messages ──────────────────────────────────────────────────────────

/**
 * Accepts the raw rooms array directly so it can be unit tested without a
 * network call.
 */
export function buildTickerMessages(rooms) {
  const valid = (rooms || []).filter(r => r && !r.devMode)
  const winRounds  = valid.flatMap(r => (r.rounds || []).filter(rd => rd.winner))
  const drawRounds = valid.flatMap(r => (r.rounds || []).filter(rd => rd.draw && !rd.winner))
  const players = [...new Set(valid.flatMap(r => (r.players || []).filter(p => !p.isBot).map(p => p.name)))]

  const stats = {}
  valid.forEach(r => {
    Object.values(r.combatants || {}).flat().filter(c => !c.isBot).forEach(c => {
      if (!stats[c.name]) stats[c.name] = { wins: 0, losses: 0, draws: 0 }
      stats[c.name].wins   += c.wins   || 0
      stats[c.name].losses += c.losses || 0
      stats[c.name].draws  += c.draws  || 0
    })
  })

  const msgs = []
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  ;[...winRounds].sort(() => Math.random() - 0.5).slice(0, 10).forEach(rd => {
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

  ;[...drawRounds].sort(() => Math.random() - 0.5).slice(0, 3).forEach(rd => {
    const names = (rd.combatants || []).map(c => c.name)
    if (names.length < 2) return
    msgs.push(pick([
      `${names[0]} and ${names[1]} fought to a draw. The council is still arguing about it.`,
      `DRAW DECLARED. ${names[0]} vs ${names[1]}. Nobody won. Everyone lost.`,
      `${names[0]} and ${names[1]} were so evenly matched it became a diplomatic incident.`,
      `The arena officially ruled ${names[0]} vs ${names[1]} a draw. Both parties are unsatisfied.`,
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
    "Management is not responsible for emotional damage caused by game results.",
    "Somewhere, a combatant is preparing. It probably won't help.",
    "Submit your 8. Destiny will handle the rest.",
    "This ticker is legally distinct from sports journalism.",
    "Please do not taunt the combatants. They are doing their best.",
    "Win or lose, everyone goes home with a story. Losers go home with two.",
  )

  return msgs.sort(() => Math.random() - 0.5)
}
