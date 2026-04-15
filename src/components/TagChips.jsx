// TagChips: renders a tag array as small inline chips.
// onRemove: optional — if provided, renders an × button on each chip.
// onFilter: optional — if provided, clicking the tag label triggers a filter action.
export default function TagChips({ tags = [], onRemove, onFilter }) {
  if (!tags.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {tags.map(tag => (
        <span
          key={tag}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            padding: '2px 7px',
            background: 'var(--color-background-tertiary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 99,
            fontSize: 11,
            color: 'var(--color-text-secondary)',
          }}
        >
          <span
            onClick={onFilter ? () => onFilter(tag) : undefined}
            style={{ cursor: onFilter ? 'pointer' : 'default' }}
          >
            {tag}
          </span>
          {onRemove && (
            <button
              onClick={() => onRemove(tag)}
              style={{
                background: 'none', border: 'none', padding: '0 0 0 3px',
                cursor: 'pointer', color: 'var(--color-text-tertiary)',
                fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center',
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
