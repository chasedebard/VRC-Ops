import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  tileName: string
  children: ReactNode
}

interface State {
  hasError: boolean
}

/** Per-tile boundary so one tile's render crash never takes down the rest of
 *  the dashboard — mirrors src/components/ErrorBoundary.tsx's app-level
 *  pattern, scoped to a single grid cell. */
export class TileErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[TileErrorBoundary] ${this.props.tileName} failed to render`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex h-full flex-col items-center justify-center rounded-xl border p-4 text-center text-sm"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
        >
          <p className="font-medium">This tile couldn't be displayed.</p>
        </div>
      )
    }
    return this.props.children
  }
}
