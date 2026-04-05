import { useState, useEffect } from 'react'
import Screen from '../components/Screen.jsx'
import PinKeypad from '../components/PinKeypad.jsx'
import { btn, inp, lbl } from '../styles.js'
import { lookupUser, verifyUser, registerUser, setUserPin } from '../supabase.js'

export default function AuthScreen({ onLogin, onBack }) {
  const [username, setUsername] = useState('')
  const [mode, setMode] = useState('lookup') // lookup | login | register | set_pin
  const [pin, setPin] = useState('')
  const [userRecord, setUserRecord] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function lookup() {
    if (!username.trim()) return
    setLoading(true); setError('')
    const user = await lookupUser(username.trim())
    setLoading(false)
    if (!user) {
      setMode('register')
    } else if (user.needs_reset) {
      setUserRecord(user); setMode('set_pin')
    } else {
      setUserRecord(user); setMode('login')
    }
  }

  useEffect(() => {
    if (pin.length < 5) return
    ;(async () => {
      setLoading(true); setError('')
      if (mode === 'register') {
        const result = await registerUser(username.trim(), pin)
        if (result.error) { setError(result.error); setPin(''); setLoading(false); return }
        setLoading(false); onLogin({ id: result.id, username: result.username })
      } else if (mode === 'login') {
        const result = await verifyUser(username.trim(), pin)
        if (!result) { setError('Wrong PIN — try again.'); setPin(''); setLoading(false); return }
        setLoading(false); onLogin({ id: result.id, username: result.username })
      } else if (mode === 'set_pin') {
        await setUserPin(username.trim(), pin)
        setLoading(false); onLogin({ id: userRecord.id, username: userRecord.username })
      }
    })()
  }, [pin])

  if (mode === 'lookup') {
    return (
      <Screen title="Log in / Register" onBack={onBack}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '-0.5rem 0 1.5rem' }}>Enter a username to log in or create an account.</p>
        <label style={lbl}>Username</label>
        <input style={inp()} value={username} onChange={e => setUsername(e.target.value)} placeholder="Your username" autoFocus onKeyDown={e => e.key === 'Enter' && lookup()} />
        {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, margin: '-8px 0 8px' }}>{error}</p>}
        <button style={btn('primary')} onClick={lookup} disabled={!username.trim() || loading}>{loading ? 'Checking…' : 'Continue →'}</button>
      </Screen>
    )
  }

  const headings  = { login: 'Enter your PIN', register: 'Choose a PIN', set_pin: 'Set new PIN' }
  const subtexts  = {
    login:    'Enter your 5-digit PIN.',
    register: `Creating "${username.trim()}". Choose a 5-digit PIN.`,
    set_pin:  'An admin reset your PIN. Set a new one to continue.',
  }

  return (
    <Screen title={headings[mode]} onBack={() => { setMode('lookup'); setPin(''); setError('') }}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '-0.5rem 0 1.5rem', textAlign: 'center' }}>{subtexts[mode]}</p>
      {error && <p style={{ color: 'var(--color-text-danger)', fontSize: 13, textAlign: 'center', margin: '-8px 0 16px' }}>{error}</p>}
      {loading ? <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: '2rem' }}>Please wait…</p> : <PinKeypad pin={pin} onChange={setPin} />}
    </Screen>
  )
}
