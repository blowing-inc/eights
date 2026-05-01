import { useState, useEffect } from 'react'
import { btn } from '../styles.js'
import { resolveVotingPhase } from '../gameLogic.js'
import {
  getAwardWithBallot,
  getVotesForAward,
  subscribeToAward,
  lockInVote,
  lockInAbstain,
  advanceToRunoff,
  resolveAward,
} from '../supabase.js'

// Shared voting engine component used for MVP (game level), series awards,
// season awards, and any future voted award.
//
// Manages its own Supabase subscriptions and handles all phase transitions
// (nomination → runoff → resolution). The parent provides the award ID and
// nomination pool; VotingPanel drives the rest.
//
// Props:
//   awardId    — ID of the pending award row (recipient_id null, awarded_at null)
//   label      — display label for this award ('MVP', 'Best combatant of the series', …)
//   nominees   — [{ id, name, type: 'combatant'|'player' }] — initial nomination pool
//   voters     — [{ id, name }] — eligible voters
//   playerId   — current player's ID
//   isHost     — bool; only the host may close the ballot or trigger phase transitions
//   onResolved — ({ outcome, winners: [{ id, name }] }) → called when award is decided
//               outcome: 'winner' | 'co_award' | 'no_votes'
export default function VotingPanel({ awardId, label, nominees, voters, playerId, isHost, onResolved }) {
  const [award,        setAward]        = useState(null)
  const [votes,        setVotes]        = useState([])
  const [myNomineeId,  setMyNomineeId]  = useState(null)  // picked but not yet locked
  const [submitting,   setSubmitting]   = useState(false)
  const [resolved,     setResolved]     = useState(false)

  // Load initial award state and any existing votes
  useEffect(() => {
    getAwardWithBallot(awardId).then(a => {
      setAward(a)
      // If already resolved when we load (edge case: re-mount after resolution)
      if (a?.awarded_at) setResolved(true)
    })
    getVotesForAward(awardId).then(setVotes)
  }, [awardId])

  // Subscribe to award row updates (ballot_state and resolution changes)
  useEffect(() => {
    return subscribeToAward(awardId, updated => {
      setAward(updated)
      if (updated.awarded_at) setResolved(true)
    })
  }, [awardId])

  // ── Derived ballot state ─────────────────────────────────────────────────

  const ballotState      = award?.ballot_state || { phase: 'nomination', lockedVoterIds: [], runoffPool: null }
  const phase            = ballotState.phase || 'nomination'
  const lockedVoterIds   = ballotState.lockedVoterIds || []
  const runoffPool       = ballotState.runoffPool || null
  const activeNominees   = phase === 'runoff' && runoffPool ? runoffPool : nominees
  const isLockedIn       = lockedVoterIds.includes(playerId)
  const myVote           = votes.find(v => v.voter_id === playerId && v.phase === phase)

  // ── Resolution check (host only to avoid write races) ────────────────────

  useEffect(() => {
    if (!isHost || resolved || !award || award.awarded_at) return

    const phaseVotes = votes.filter(v => v.phase === phase)
    const resolution = resolveVotingPhase({
      votes:          phaseVotes,
      voterCount:     voters.length,
      lockedVoterIds,
      phase,
      hostClose:      false,
      runoffPool:     runoffPool?.map(n => n.id) || null,
    })

    if (resolution.outcome === 'pending') return

    if (resolution.outcome === 'runoff') {
      const pool = resolution.winnerIds.map(id => {
        const n = nominees.find(x => x.id === id)
        return n || { id, name: id, type: 'combatant' }
      })
      advanceToRunoff(awardId, pool).catch(console.error)
      return
    }

    handleResolution(resolution)
  }, [votes, award, phase, lockedVoterIds, resolved, isHost])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleLockIn() {
    if (!myNomineeId || submitting || isLockedIn) return
    setSubmitting(true)
    const nominee = activeNominees.find(n => n.id === myNomineeId)
    if (!nominee) { setSubmitting(false); return }
    const voter = voters.find(v => v.id === playerId)
    await lockInVote({
      awardId, voterId: playerId, voterName: voter?.name || '?',
      nomineeId: myNomineeId, nomineeType: nominee.type, nomineeName: nominee.name,
      phase,
    })
    // Update local votes so the resolution effect runs immediately on the host
    const newVote = {
      award_id: awardId, voter_id: playerId, voter_name: voter?.name || '?',
      nominee_id: myNomineeId, nominee_type: nominee.type, nominee_name: nominee.name,
      phase, cast_at: new Date().toISOString(),
    }
    setVotes(prev => [...prev, newVote])
    setSubmitting(false)
  }

  async function handleAbstain() {
    if (submitting || isLockedIn) return
    setSubmitting(true)
    await lockInAbstain(awardId, playerId)
    setSubmitting(false)
  }

  async function handleHostClose() {
    if (!isHost || resolved) return
    const phaseVotes = votes.filter(v => v.phase === phase)
    const resolution = resolveVotingPhase({
      votes:          phaseVotes,
      voterCount:     voters.length,
      lockedVoterIds,
      phase,
      hostClose:      true,
      runoffPool:     runoffPool?.map(n => n.id) || null,
    })
    handleResolution(resolution)
  }

  async function handleResolution(resolution) {
    if (resolved) return
    setResolved(true)
    const { outcome, winnerIds } = resolution

    if (outcome === 'no_votes') {
      // No nominations — clear ballot_state and notify parent (no award written)
      onResolved({ outcome: 'no_votes', winners: [] })
      return
    }

    // Tally votes in the final phase so callers can compute vote share.
    const finalPhaseVotes = votes.filter(v => v.phase === phase)
    const votesByNomineeId = {}
    finalPhaseVotes.forEach(v => {
      votesByNomineeId[v.nominee_id] = (votesByNomineeId[v.nominee_id] || 0) + 1
    })

    const winners = winnerIds.map(id => {
      const n = activeNominees.find(x => x.id === id)
      return n || { id, name: id, type: 'combatant' }
    })
    await resolveAward({ awardId, winners, coAward: outcome === 'co_award' })
    onResolved({ outcome, winners, votesByNomineeId })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!award) return null

  // After resolution: show the result
  if (resolved && award.awarded_at) {
    return <VotingResult award={award} label={label} nominees={nominees} />
  }

  const lockedCount = lockedVoterIds.length
  const totalVoters = voters.length

  return (
    <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {phase === 'runoff' ? `${label} — Tiebreaker` : label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {lockedCount} of {totalVoters} locked in
        </div>
      </div>

      {/* Live status strip — names visible, picks hidden */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {voters.map(v => {
          const didLockIn = lockedVoterIds.includes(v.id)
          return (
            <span
              key={v.id}
              style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99,
                background:   didLockIn ? 'var(--color-background-success)' : 'var(--color-background-tertiary)',
                color:        didLockIn ? 'var(--color-text-success)'       : 'var(--color-text-tertiary)',
                border:       didLockIn ? '0.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-tertiary)',
                fontWeight:   didLockIn ? 500 : 400,
              }}
            >
              {v.name}
            </span>
          )
        })}
      </div>

      {/* Nomination pool */}
      {!isLockedIn && (
        <>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
            {phase === 'runoff' ? 'It\'s a tie — vote again:' : 'Your nomination:'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {activeNominees.map(n => {
              const selected = myNomineeId === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setMyNomineeId(selected ? null : n.id)}
                  style={{ ...btn(selected ? 'primary' : 'ghost'), textAlign: 'left', fontSize: 14, padding: '9px 13px' }}
                >
                  {selected ? '✓ ' : ''}{n.name}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleLockIn}
              disabled={!myNomineeId || submitting}
              style={{ ...btn('primary'), flex: 2, fontSize: 13, padding: '9px' }}
            >
              {submitting ? 'Locking in…' : 'Lock in'}
            </button>
            <button
              onClick={handleAbstain}
              disabled={submitting}
              style={{ ...btn('ghost'), flex: 1, fontSize: 13, padding: '9px' }}
            >
              Abstain
            </button>
          </div>
        </>
      )}

      {/* Locked-in confirmation for the current player */}
      {isLockedIn && !resolved && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center', margin: '4px 0' }}>
          {myVote ? `You nominated ${myVote.nominee_name}.` : 'You abstained.'} Waiting for others…
        </p>
      )}

      {/* Host controls */}
      {isHost && (
        <button
          onClick={handleHostClose}
          disabled={resolved}
          style={{ ...btn('ghost'), width: '100%', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 10 }}
        >
          Close ballot early
        </button>
      )}
    </div>
  )
}

// Read-only result display shown after the award is resolved.
function VotingResult({ award, label, _nominees }) {
  const recipientName = award.recipient_name || '?'
  const isCoAward = award.co_award

  return (
    <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-success)' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-success)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {isCoAward ? `${label} — co-award` : label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {recipientName}
      </div>
      {isCoAward && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          Shared award — all nominees tied
        </div>
      )}
    </div>
  )
}
