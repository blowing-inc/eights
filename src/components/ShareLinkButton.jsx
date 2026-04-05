import { useState } from 'react'
import { btn } from '../styles.js'

export default function ShareLinkButton({ code, spectate, style }) {
  const [copied, setCopied] = useState(false)
  function share() {
    const url = `${window.location.origin}${window.location.pathname}?${spectate ? 'spectate' : 'join'}=${code}`
    if (navigator.share) {
      navigator.share({ title: spectate ? 'Watch my Eights game' : 'Join my Eights game', url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
    }
  }
  return (
    <button onClick={share} style={{ ...btn('ghost'), width: '100%', marginBottom: '1.5rem', fontSize: 13, ...style }}>
      {copied ? 'Link copied!' : spectate ? '👁 Share spectator link' : '🔗 Share join link'}
    </button>
  )
}
