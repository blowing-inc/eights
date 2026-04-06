import { useState } from 'react'
import { btn, inp } from '../../styles.js'
import { sget, slist, getAllCombatantsForExport, listUsers } from '../../supabase.js'
import { downloadFile } from '../../export.js'

export default function InspectorTab() {
  const [code,     setCode]     = useState('')
  const [room,     setRoom]     = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  async function lookup() {
    if (!code.trim()) return
    setLoading(true); setRoom(null); setNotFound(false); setExpanded(false)
    const r = await sget('room:' + code.trim().toUpperCase())
    if (r) setRoom(r)
    else setNotFound(true)
    setLoading(false)
  }

  async function exportAll() {
    setExporting(true); setExportMsg('')
    const [rooms, combatants, users] = await Promise.all([slist(), getAllCombatantsForExport(), listUsers()])
    downloadFile(
      `eights-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), rooms, combatants, users }, null, 2),
      'application/json'
    )
    setExporting(false); setExportMsg('Export downloaded.')
  }

  return (
    <>
      {/* Room inspector */}
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>Room inspector</p>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
        Enter a room code to view its full JSON state — useful for debugging stuck or unusual games.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <input
          style={{ ...inp(), margin: 0, flex: 1, textTransform: 'uppercase', letterSpacing: 3, fontSize: 16 }}
          placeholder="XXXX"
          maxLength={4}
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setRoom(null); setNotFound(false) }}
          onKeyDown={e => e.key === 'Enter' && lookup()}
        />
        <button onClick={lookup} disabled={loading || !code.trim()}
          style={{ ...btn('primary'), width: 'auto', padding: '0 16px', fontSize: 13, flex: 'none' }}>
          {loading ? '…' : 'Inspect'}
        </button>
      </div>

      {notFound && <p style={{ color: 'var(--color-text-danger)', fontSize: 13 }}>Room not found.</p>}

      {room && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: 2, marginRight: 8 }}>{room.code}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{room.phase} · {(room.players || []).filter(p => !p.isBot).map(p => p.name).join(', ')}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setExpanded(e => !e)}
                style={{ ...btn('ghost'), padding: '3px 10px', fontSize: 12, width: 'auto' }}>
                {expanded ? 'Collapse' : 'Expand JSON'}
              </button>
              <button
                onClick={() => downloadFile(`room-${room.code}.json`, JSON.stringify(room, null, 2), 'application/json')}
                style={{ ...btn('ghost'), padding: '3px 10px', fontSize: 12, width: 'auto' }}>
                ⬇ Download
              </button>
            </div>
          </div>

          {expanded && (
            <pre style={{ margin: 0, padding: '12px 14px', background: 'var(--color-background-primary)', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 11, color: 'var(--color-text-secondary)', overflowX: 'auto', maxHeight: 400, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(room, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Data export */}
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: '2rem', paddingTop: '1.5rem' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>Full data export</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
          Downloads all rooms, combatants, and users as a single JSON file. PINs are not included.
        </p>
        {exportMsg && (
          <div style={{ padding: '8px 12px', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', borderRadius: 'var(--border-radius-md)', marginBottom: 12, fontSize: 13, color: 'var(--color-text-success)' }}>
            {exportMsg}
          </div>
        )}
        <button onClick={exportAll} disabled={exporting}
          style={{ ...btn('ghost'), padding: '8px 16px', fontSize: 13, width: 'auto' }}>
          {exporting ? 'Exporting…' : '⬇ Export all data (JSON)'}
        </button>
      </div>
    </>
  )
}
