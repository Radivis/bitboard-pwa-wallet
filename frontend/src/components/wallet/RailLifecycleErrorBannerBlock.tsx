import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'

export type RailLifecycleErrorBannerBlockProps = {
  rail: DashboardRailId
  variant: 'load' | 'sync' | 'sync-warning'
  title: string
  errorMessage: string
  onRetry: () => void
  isRetrying?: boolean
  retryLabel?: string
}

export function RailLifecycleErrorBannerBlock({
  rail,
  variant,
  title,
  errorMessage,
  onRetry,
  isRetrying = false,
  retryLabel = 'Retry',
}: RailLifecycleErrorBannerBlockProps) {
  return (
    <div
      role="alert"
      data-testid={`wallet-${variant}-error-banner-${rail}`}
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-500"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs break-words text-muted-foreground">{errorMessage}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying ? 'Retrying…' : retryLabel}
        </Button>
      </div>
    </div>
  )
}
