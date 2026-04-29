// Shared style helpers used across all screens and components.

export function inp(extra) {
  return {
    display: 'block', width: '100%', padding: '10px 12px', fontSize: 16,
    background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)',
    border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)',
    outline: 'none', boxSizing: 'border-box', margin: '4px 0 12px',
    ...extra
  }
}

export const lbl = { fontSize: 13, color: 'var(--color-text-secondary)', display: 'block' }

export function btn(variant) {
  const base = { display: 'block', width: '100%', padding: '11px 16px', fontSize: 15, fontFamily: 'var(--font-sans)', borderRadius: 'var(--border-radius-md)', cursor: 'pointer', textAlign: 'center', fontWeight: 400, transition: 'opacity 0.15s' }
  if (variant === 'primary') return { ...base, background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', border: 'none' }
  if (variant === 'ghost')   return { ...base, background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', width: 'auto' }
  return { ...base, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-secondary)' }
}

// Active/inactive toggle used in sort bars, view toggles, and filter tabs.
// Renders as a ghost button with info-color highlight when active.
export function tab(isActive) {
  return {
    ...btn('ghost'),
    padding: '4px 12px',
    fontSize: 12,
    background:  isActive ? 'var(--color-background-info)' : 'transparent',
    color:       isActive ? 'var(--color-text-info)'       : 'var(--color-text-secondary)',
    borderColor: isActive ? 'var(--color-border-info)'     : 'var(--color-border-secondary)',
  }
}
