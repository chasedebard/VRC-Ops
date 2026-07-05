import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md text-center">
            <h1 className="mb-2 text-xl font-bold">Something went wrong</h1>
            <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {this.state.error.message}
            </p>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
