import { useState, useEffect } from 'react'
import AvatarWithHover from '../components/AvatarWithHover.jsx'
import Pill from '../components/Pill.jsx'
import DevBanner from '../components/DevBanner.jsx'
import RoundChat from '../components/RoundChat.jsx'
import { btn, inp } from '../styles.js'
import { sget, sset, incrementCombatantStats, publishCombatants } from '../supabase.js'
import { POLL_INTERVAL, canEditCombatant } from '../gameLogic.js'

export default function VoteScreen({ room: init, playerId, setRoom, onResult, onViewPlayer }) {
  const [room, setLocal] = useState(init)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editBio,  setEditBio]  = useState('')
  const [saving, setSaving] = useState(false)

  const round = room.rounds[room.currentRound - 1]
  const isHost = room.host === playerId

  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await sget('room:' + room.id)
      if (!r) return
      const rd = r.rounds[r.currentRound - 1]
      if (rd?.winner) {
        const updated = { ...r, phase: 'battle' }
        await sset('room:' + r.id, updated)
        setRoom(updated); onResult(); return
      }
      setLocal(r); setRoom(r)
    }, POLL_INTERVAL)
    return () => clearInterval(iv)
  }, [room.id, room.currentRound])

  async function castReaction(combatantId, emoji) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    const playerReactions = { ...(rd.playerReactions || {}) }
    const mine = { ...(playerReactions[playerId] || {}) }
    if (mine[combatantId] === emoji) delete mine[combatantId]
    else mine[combatantId] = emoji
    playerReactions[playerId] = mine
    rd.playerReactions = playerReactions
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  async function castPick(combatantId) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    rd.picks = { ...(rd.picks || {}), [playerId]: combatantId }
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  async function confirmWinner(combatantId) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    const winner = rd.combatants.find(c => c.id === combatantId)
    if (!winner) return
    rd.winner = winner
    rd.picks = { ...(rd.picks || {}), [playerId]: combatantId }
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const combatants = JSON.parse(JSON.stringify(r.combatants))
    Object.keys(combatants).forEach(pid => {
      combatants[pid] = combatants[pid].map(c => {
        if (!rd.combatants.find(rc => rc.id === c.id)) return c
        const isWin = winner.id === c.id
        return { ...c, wins: c.wins + (isWin ? 1 : 0), losses: c.losses + (isWin ? 0 : 1), battles: [...(c.battles || []), { roundId: rd.id, opponent: rd.combatants.filter(rc => rc.id !== c.id).map(rc => rc.name).join(', '), result: isWin ? 'win' : 'loss' }] }
      })
    })
    const updated = { ...r, rounds, combatants, phase: 'battle' }
    await sset('room:' + r.id, updated)
    setRoom(updated); onResult()
    ;(async () => {
      for (const c of rd.combatants) {
        const isWin = winner.id === c.id
        const pr = rd.playerReactions || {}
        const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
        const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
        const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length
        await incrementCombatantStats(c.id, { wins: isWin ? 1 : 0, losses: isWin ? 0 : 1, heart, angry, cry })
      }
      const totalRounds = Math.min(...r.players.map(p => (r.combatants[p.id] || []).length))
      if (r.currentRound >= totalRounds) {
        const allIds = Object.values(r.combatants)
          .filter(list => list.length === 8)
          .flat().map(c => c.id)
        await publishCombatants(allIds)
      }
    })()
  }

  function startEdit(c) { setEditingId(c.id); setEditName(c.name); setEditBio(c.bio || '') }

  async function saveEdit(c) {
    setSaving(true)
    const r = await sget('room:' + room.id)
    if (!r) { setSaving(false); return }
    const combatants = JSON.parse(JSON.stringify(r.combatants))
    const newName = editName.trim() || c.name
    const newBio  = editBio.trim()
    Object.keys(combatants).forEach(pid => {
      combatants[pid] = combatants[pid].map(x => x.id === c.id ? { ...x, name: newName, bio: newBio } : x)
    })
    const rounds = r.rounds.map(rd => ({
      ...rd,
      combatants: rd.combatants.map(x => x.id === c.id ? { ...x, name: newName, bio: newBio } : x),
      winner: rd.winner?.id === c.id ? { ...rd.winner, name: newName } : rd.winner
    }))
    const updated = { ...r, combatants, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated); setEditingId(null); setSaving(false)
  }

  async function sendChat(text) {
    const r = await sget('room:' + room.id)
    if (!r) return
    const rd = { ...r.rounds[r.currentRound - 1] }
    const sender = r.players.find(p => p.id === playerId)
    rd.chat = [...(rd.chat || []), { playerId, playerName: sender?.name || '?', text, ts: Date.now() }]
    const rounds = [...r.rounds]; rounds[r.currentRound - 1] = rd
    const updated = { ...r, rounds }
    await sset('room:' + r.id, updated)
    setLocal(updated); setRoom(updated)
  }

  if (!round) return null
  const myPick = round.picks?.[playerId]
  const picks = round.picks || {}
  const realPlayers = room.players.filter(p => !p.isBot)
  const pickerNames = cid => realPlayers.filter(p => picks[p.id] === cid).map(p => p.name)

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      {room.devMode && <DevBanner />}
      <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 0.25rem', color: 'var(--color-text-primary)' }}>Round {round.number}</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 1.5rem' }}>
        {isHost ? 'Pick the winner, then confirm to lock it in.' : 'Tap your pick — the host will confirm the final call.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
        {round.combatants.map(c => {
          const owner = room.players.find(p => p.id === c.ownerId)
          const isPicked = myPick === c.id
          const pickers = pickerNames(c.id)
          const canEdit = canEditCombatant(c.ownerId, playerId, room.host)
          const isEditing = editingId === c.id

          return (
            <div key={c.id} style={{ background: isPicked ? 'var(--color-background-info)' : 'var(--color-background-secondary)', border: isPicked ? '2px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', transition: 'border 0.15s' }}>
              <div onClick={() => !isEditing && castPick(c.id)} style={{ padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                    {owner?.isBot && <Pill>bot</Pill>}
                    {canEdit && <button onClick={e => { e.stopPropagation(); isEditing ? setEditingId(null) : startEdit(c) }} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 99, cursor: 'pointer' }}>{isEditing ? 'cancel' : 'edit'}</button>}
                  </div>
                </div>
                {!isEditing && c.bio && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{c.bio}</div>}
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  by {owner && !owner.isBot
                    ? <AvatarWithHover player={owner} onViewProfile={onViewPlayer} />
                    : null}
                  {owner?.name}
                </div>
              </div>

              {isEditing && (
                <div style={{ padding: '0 16px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <input style={{ ...inp(), margin: '10px 0 8px', fontSize: 14 }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                  <textarea style={{ ...inp(), margin: 0, resize: 'none', height: 64, fontSize: 13, width: '100%' }} value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio (optional)" />
                  <button onClick={() => saveEdit(c)} disabled={saving} style={{ ...btn('primary'), marginTop: 8, padding: '8px', fontSize: 13 }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              )}

              {pickers.length > 0 && (
                <div style={{ padding: '6px 16px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {pickers.map(name => (
                    <span key={name} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-background-info)', color: 'var(--color-text-info)', borderRadius: 99, border: '0.5px solid var(--color-border-info)' }}>{name}</span>
                  ))}
                </div>
              )}

              {(() => {
                const pr = round.playerReactions || {}
                const myReaction = (pr[playerId] || {})[c.id]
                const heart = Object.values(pr).filter(m => m[c.id] === 'heart').length
                const angry = Object.values(pr).filter(m => m[c.id] === 'angry').length
                const cry   = Object.values(pr).filter(m => m[c.id] === 'cry').length
                return (
                  <div onClick={e => e.stopPropagation()} style={{ padding: '6px 12px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 6 }}>
                    {[['heart','❤️',heart],['angry','😡',angry],['cry','😂',cry]].map(([key,icon,count]) => (
                      <button key={key} onClick={() => castReaction(c.id, key)} style={{ background: myReaction === key ? 'var(--color-background-info)' : 'var(--color-background-tertiary)', border: myReaction === key ? '1px solid var(--color-border-info)' : '0.5px solid var(--color-border-tertiary)', borderRadius: 99, padding: '7px 12px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {icon}{count > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{count}</span>}
                      </button>
                    ))}
                  </div>
                )
              })()}

              {isHost && isPicked && (
                <div style={{ padding: '0 16px 14px' }}>
                  <button onClick={() => confirmWinner(c.id)} style={{ ...btn('primary'), padding: '10px', fontSize: 14 }}>
                    Confirm {c.name} wins ✓
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isHost && myPick && <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>Pick registered — waiting for host to confirm.</p>}
      {isHost && !myPick && <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Tap a combatant to select, then confirm to finalise.</p>}

      <div style={{ marginTop: '1.5rem', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Round chat</h3>
        <RoundChat messages={round.chat} onSend={sendChat} />
      </div>
    </div>
  )
}
