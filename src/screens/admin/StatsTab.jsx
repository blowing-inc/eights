import { useState } from 'react'
import { btn } from '../../styles.js'
import { slist, getAllCombatantsForExport, adminSetCombatantStats } from '../../supabase.js'
import { recalcStatsFromRooms, diffStats } from '../../adminLogic.js'

export default function StatsTab() {
  const [loading,   setLoading]   = useState(false)
  const [diffs,     setDiffs]     = useState(null)  // null | []
  const [applying,  setApplying]  = useState(false)
  const [msg,       setMsg]       = useState('')

  async function runRecalc() {
    setLoading(true); setMsg(''); setDiffs(null)
    const [rooms, combatants] = await Promise.all([slist(), getAllCombatantsForExport()])
    const recalculated = recalcStatsFromRooms(rooms)
    setDiffs(diffStats(recalculated, combatants))
    setLoading(false)
  }

  async function applyAll() {
    if (!diffs || diffs.length === 0) return
    setApplying(true); setMsg('')
    // Re-fetch so we apply against fresh recalc values
    const [rooms, combatants] = await Promise.all([slist(), getAllCombatantsForExport()])
    const recalculated = recalcStatsFromRooms(rooms)
    const toFix = diffStats(recalculated, combatants)
    for (const d of toFix) {
      const r = recalculated[d.id]
      await adminSetCombatantStats(d.id, r)
    }
    setMsg(`Updated ${toFix.length} combatant${toFix.length !== 1 ? 's' : ''}.`)
    setDiffs([])
    setApplying(false)
  }

  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>Stats recalculation</p>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        Scans all room history and compares derived win/loss/reaction counts against the current bestiary values. Shows only combatants with discrepancies.
      </p>
      <button onClick={runRecalc} disabled={loading || applying}
        style={{ ...btn('ghost'), padding: '8px 16px', fontSize: 13, width: 'auto', marginBottom: '1.25rem' }}>
        {loading ? 'Scanning…' : '🔍 Scan for discrepancies'}
      </button>

      {msg && (
        <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: '1rem', fontSize: 13, color: 'var(--color-text-success)' }}>
          {msg}
        </div>
      )}

      {diffs !== null && diffs.length === 0 && !msg && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>All combatant stats match room history. Nothing to fix.</p>
      )}

      {diffs !== null && diffs.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-warning)', margin: 0 }}>
              {diffs.length} combatant{diffs.length !== 1 ? 's' : ''} with discrepancies
            </p>
            <button onClick={applyAll} disabled={applying}
              style={{ ...btn('primary'), width: 'auto', padding: '6px 14px', fontSize: 13 }}>
              {applying ? 'Applying…' : 'Apply all fixes'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diffs.map(d => (
              <div key={d.id} style={{ padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6 }}>{d.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(d.diffs).map(([field, { was, now }]) => (
                    <span key={field} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{field}:</span>{' '}
                      <span style={{ textDecoration: 'line-through', color: 'var(--color-text-danger)' }}>{was}</span>
                      {' → '}
                      <span style={{ color: 'var(--color-text-success)', fontWeight: 500 }}>{now}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
