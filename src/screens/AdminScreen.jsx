import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import Screen from '../components/Screen.jsx'
import PinKeypad from '../components/PinKeypad.jsx'
import GamesTab      from './admin/GamesTab.jsx'
import UsersTab      from './admin/UsersTab.jsx'
import CombatantsTab from './admin/CombatantsTab.jsx'
import StatsTab      from './admin/StatsTab.jsx'
import InspectorTab  from './admin/InspectorTab.jsx'

const TABS = ['Games', 'Users', 'Combatants', 'Stats', 'Inspector']
const SESSION_KEY = 'adminSession'

// Parse the token payload and return it if not expired, otherwise null.
// The payload is base64url-encoded JSON with an { exp } field.
// We can read exp client-side without the secret — we just can't forge the sig.
function getValidSession() {
  try {
    const token = sessionStorage.getItem(SESSION_KEY)
    if (!token) return null
    const [payload] = token.split('.')
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return Date.now() < exp ? token : null
  } catch {
    return null
  }
}

export default function AdminScreen({ onBack }) {
  const [phase,    setPhase]    = useState(() => getValidSession() ? 'admin' : 'pin')
  const [pin,      setPin]      = useState('')
  const [pinError, setPinError] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [tab,      setTab]      = useState('Games')

  useEffect(() => {
    if (pin.length < 5) return

    async function verify() {
      setLoading(true)
      setPinError('')
      const { data, error } = await supabase.functions.invoke('verify-admin-pin', { body: { pin } })
      setLoading(false)
      if (error || !data?.token) {
        setPinError('Wrong admin PIN.')
        setPin('')
        return
      }
      sessionStorage.setItem(SESSION_KEY, data.token)
      setPhase('admin')
    }

    verify()
  }, [pin])

  if (phase === 'pin') {
    return (
      <Screen title="Admin" onBack={onBack}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '-0.5rem 0 1.5rem', textAlign: 'center' }}>
          Enter the admin PIN to continue.
        </p>
        {pinError && (
          <p style={{ color: 'var(--color-text-danger)', fontSize: 13, textAlign: 'center', margin: '-8px 0 16px' }}>
            {pinError}
          </p>
        )}
        <PinKeypad pin={pin} onChange={loading ? () => {} : setPin} />
        {loading && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
            Verifying…
          </p>
        )}
      </Screen>
    )
  }

  return (
    <Screen title="Admin" onBack={onBack}>
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--color-border-tertiary)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', whiteSpace: 'nowrap',
              borderBottom: tab === t ? '2px solid var(--color-text-primary)' : '2px solid transparent',
              padding: '6px 14px', fontSize: 13,
              color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', marginBottom: -1,
            }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Games'      && <GamesTab />}
      {tab === 'Users'      && <UsersTab />}
      {tab === 'Combatants' && <CombatantsTab />}
      {tab === 'Stats'      && <StatsTab />}
      {tab === 'Inspector'  && <InspectorTab />}
    </Screen>
  )
}
