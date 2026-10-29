import { DesignBanner } from '@/components/design/DesignBanner'
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
    <DesignBanner
      role="alert"
      status={variant === 'sync-warning' ? 'warning' : 'error'}
      data-testid={`wallet-${variant}-error-banner-${rail}`}
      title={title}
      description={errorMessage}
      primaryAction={{
        label: isRetrying ? 'Retrying…' : retryLabel,
        onClick: onRetry,
        disabled: isRetrying,
      }}
    />
  )
}
