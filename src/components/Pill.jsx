export default function Pill({ children }) {
  return <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)', borderRadius: 99, border: '0.5px solid var(--color-border-tertiary)' }}>{children}</span>
}
