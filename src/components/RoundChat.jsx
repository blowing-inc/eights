import { useState, useRef, useEffect } from 'react'
import { inp, btn } from '../styles.js'

// readOnly = true for history view. onSend is omitted in that case.
export default function RoundChat({ messages, onSend }) {
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length])

  function send() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  const msgs = messages || []

  return (
    <div>
      {msgs.length === 0 && onSend && (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>No messages yet.</p>
      )}
      {msgs.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginBottom: onSend ? 10 : 0, paddingRight: 2 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginRight: 5 }}>{m.playerName}:</span>
              <span style={{ color: 'var(--color-text-primary)' }}>{m.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      {onSend && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            style={{ ...inp(), margin: 0, flex: 1, fontSize: 15 }}
            placeholder="Add context or commentary…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
          />
          <button onClick={send} disabled={!text.trim()} style={{ ...btn('primary'), width: 'auto', padding: '0 18px', fontSize: 18, flexShrink: 0 }}>→</button>
        </div>
      )}
    </div>
  )
}
