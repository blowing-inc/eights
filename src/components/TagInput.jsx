import { useState, useEffect, useRef } from 'react'
import { inp } from '../styles.js'
import { getTagSuggestions } from '../supabase.js'
import TagChips from './TagChips.jsx'

// Lowercase, no special characters, spaces allowed.
function normalizeTag(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

// TagInput: editable tag list with autocomplete.
// value:    string[] of current tags
// onChange: (newTags: string[]) => void
export default function TagInput({ value = [], onChange }) {
  const [text,        setText]        = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!text.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(() => {
      getTagSuggestions(text.trim()).then(tags => {
        setSuggestions(tags.filter(t => !value.includes(t)))
      })
    }, 200)
  }, [text, value])

  function addTag(raw) {
    const tag = normalizeTag(raw)
    if (!tag || value.includes(tag)) { setText(''); setOpen(false); return }
    onChange([...value, tag])
    setText(''); setOpen(false); setSuggestions([])
  }

  function removeTag(tag) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (text.trim()) addTag(text)
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <TagChips tags={value} onRemove={removeTag} />
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inp(), margin: 0 }}
          placeholder={value.length ? 'Add another tag…' : 'Add a tag (Enter to confirm)…'}
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
        />
        {open && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--border-radius-md)',
            zIndex: 200, overflow: 'hidden',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          }}>
            {suggestions.map((tag, i) => (
              <button
                key={tag}
                onMouseDown={() => addTag(tag)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'transparent', border: 'none',
                  borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                  cursor: 'pointer', fontSize: 13, color: 'var(--color-text-primary)',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>
        Lowercase, spaces allowed. Press Enter or comma to add.
      </p>
    </div>
  )
}
