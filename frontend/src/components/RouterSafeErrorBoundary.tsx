import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type RouterSafeErrorBoundaryProps = {
  children: ReactNode
}

type RouterSafeErrorBoundaryState = {
  error: Error | null
}

function errorFromUnknownThrow(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  if (error == null) {
    return new Error('An unexpected error occurred')
  }
  return new Error(String(error))
}

/**
 * Keeps the shell visible when a route match throws a non-Error (including
 * `undefined`). TanStack Router's default CatchBoundary logs `error.message`
 * and can blank the page if the thrown value is empty.
 */
export class RouterSafeErrorBoundary extends Component<
  RouterSafeErrorBoundaryProps,
  RouterSafeErrorBoundaryState
> {
  state: RouterSafeErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): RouterSafeErrorBoundaryState {
    return { error: errorFromUnknownThrow(error) }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error('RouterSafeErrorBoundary caught', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.error == null) {
      return this.props.children
    }

    return (
      <div className="space-y-4">
        <p className="text-destructive">{this.state.error.message}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            this.setState({ error: null })
          }}
        >
          Try again
        </Button>
      </div>
    )
  }
}
