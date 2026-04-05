import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'system-ui, sans-serif', textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 36 }}>⚔️</div>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Something went wrong</h2>
        <p style={{ fontSize: 14, color: '#888', margin: 0, maxWidth: 300 }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none', background: '#378ADD', color: '#fff', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
          Reload app
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
