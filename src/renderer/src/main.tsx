import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FocusTubePipPlayer from './components/focus/FocusTubePipPlayer'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/400-italic.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/600-italic.css'
import '@fontsource/poppins/700.css'
import '@fontsource/poppins/700-italic.css'
import '@fontsource/poppins/800.css'
import '@fontsource/poppins/800-italic.css'
import '@fontsource/poppins/900.css'
import '@fontsource/poppins/900-italic.css'
import './index.css'
import { ThemeProvider } from './theme/ThemeContext'

const isFtPip = typeof window !== 'undefined' && (
  window.location.hash === '#ft-pip' ||
  window.location.search.includes('pip=focustube')
)

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Uncaught UI error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0d14',
            color: '#ffffff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>
            Something went wrong
          </h2>
          <p style={{ maxWidth: '520px', color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              background: '#e50914',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      {isFtPip ? (
        <FocusTubePipPlayer />
      ) : (
        <ThemeProvider>
          <App />
        </ThemeProvider>
      )}
    </RootErrorBoundary>
  </React.StrictMode>
)
