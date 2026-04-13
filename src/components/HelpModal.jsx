import { useState } from 'react'
import { btn } from '../styles.js'

const SECTIONS = [
  {
    title: 'The basics',
    content: `One player creates a room and shares the code. Everyone joins and drafts a roster of combatants — made-up characters, inside jokes, real people, anything goes.

Each round, one combatant per player is matched up. Players vote on the winner. The host confirms the result. Repeat until all rounds are played.`
  },
  {
    title: 'Creating a room',
    content: `Hit "Create a room" on the home screen and set your options:

· Roster size — how many combatants each player drafts (3–12). Default is 8.
· Allow spectators — lets people watch without playing.
· Anonymous combatants — hides owner names during voting.
· Blind voting — votes are hidden until everyone has picked.
· Bios required — forces players to write a bio for each combatant.

Share the room code or spectator link with your group.`
  },
  {
    title: 'The draft',
    content: `Each player names their combatants in secret. You can optionally write a bio for each one.

If you've played a previous battle in a series, your champions from the last game are required — you must place them in a slot before you can lock in your roster.

The host can force-start once most players are ready.`
  },
  {
    title: 'Voting',
    content: `Each round shows one combatant per player. Everyone votes for who they think should win. The host sees all votes and makes the final call — confirm the winner or declare a draw.

After confirming, the host can choose to evolve the winner: give them a new name and updated bio to mark how the victory changed them.`
  },
  {
    title: 'Evolution',
    content: `When a combatant wins a round, the host can evolve them instead of just confirming. Evolution is a narrative moment — it documents what changed.

The host can write the evolution themselves, or hand it to the combatant's owner. Either way, you pick a new name and write (or update) the bio for the evolved form.

The original combatant's stats and bio are preserved. The evolved variant is a new entry in the Bestiary with its own record. In a series, the evolved form appears as a required pick in the next draft.`
  },
  {
    title: 'Battle history & series',
    content: `Every game is saved in Battle History. Tap a room to see round-by-round results, combatant rosters, reactions, and chat.

If you hosted a completed tournament, you'll see a "Continue series" option — this starts a new draft with the same players, carrying forward champions and evolved forms.

A series groups all connected games together and shows standings across every game played.`
  },
  {
    title: 'The Bestiary',
    content: `The Bestiary is the permanent record of every combatant ever entered across all games. Search by name, bio text, or player name.

Each combatant page shows their win/loss record, bio history, reactions, and — if they evolved — the full lineage of what they became and why.`
  },
  {
    title: 'Accounts & guests',
    content: `You can play as a guest — just enter a name. Guests work fine for a single session, but your history may not follow you if you switch devices or refresh.

Creating an account (top-right on the home screen) ties your games and combatants to you. Log in on any device and your history and open lobbies will reappear.`
  },
]

export default function HelpModal({ onClose }) {
  const [section, setSection] = useState(0)
  const s = SECTIONS[section]

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg) var(--border-radius-lg) 0 0', width: '100%', maxWidth: 500, maxHeight: '85dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>How to play</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
          {SECTIONS.map((sec, i) => (
            <button
              key={i}
              onClick={() => setSection(i)}
              style={{
                whiteSpace: 'nowrap', fontSize: 12, padding: '4px 10px', borderRadius: 99, border: '0.5px solid', cursor: 'pointer', flexShrink: 0,
                background:   i === section ? 'var(--color-background-info)' : 'transparent',
                color:        i === section ? 'var(--color-text-info)'       : 'var(--color-text-secondary)',
                borderColor:  i === section ? 'var(--color-border-info)'     : 'var(--color-border-tertiary)',
              }}
            >
              {sec.title}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: '16px', flex: 1 }}>
          <h3 style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 12px' }}>{s.title}</h3>
          {s.content.split('\n\n').map((para, i) => (
            <p key={i} style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-line' }}>{para}</p>
          ))}
        </div>

        {/* Prev / Next */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
          <button
            onClick={() => setSection(i => i - 1)}
            disabled={section === 0}
            style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '8px' }}
          >← Prev</button>
          <button
            onClick={() => section === SECTIONS.length - 1 ? onClose() : setSection(i => i + 1)}
            style={{ ...btn('primary'), flex: 2, fontSize: 13, padding: '8px' }}
          >{section === SECTIONS.length - 1 ? 'Got it' : 'Next →'}</button>
        </div>
      </div>
    </div>
  )
}
