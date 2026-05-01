import { useState, useEffect } from 'react'
import Pill from './Pill.jsx'
import { getSeason } from '../supabase.js'

// Compact ambient strip shown at the top of draft, vote, and game-end screens.
// Surfaces season context, tone, and (when relevant) the current arena.
// Returns null when there is nothing to show.
export default function ContextStrip({ room, currentArena }) {
  const [season, setSeason] = useState(null)

  useEffect(() => {
    if (!room.seasonId) return
    getSeason(room.seasonId).then(setSeason)
  }, [room.seasonId])

  const tone     = room.tone
  const hasTone  = tone?.tags?.length > 0 || !!tone?.premise
  const hasArena = !!currentArena

  if (!season && !hasTone && !hasArena) return null

  const seasonLabel = season
    ? [season.name, room.seriesIndex ? `Game ${room.seriesIndex}` : null].filter(Boolean).join(' · ')
    : null

  return (
    <div style={{ marginBottom: '1rem', padding: '8px 12px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {seasonLabel && (
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {seasonLabel}
          </div>
        )}
        {tone?.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tone.tags.map(tag => <Pill key={tag}>{tag}</Pill>)}
          </div>
        )}
        {tone?.premise && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            {tone.premise}
          </div>
        )}
        {hasArena && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            @ {currentArena.name}
          </div>
        )}
      </div>
    </div>
  )
}
