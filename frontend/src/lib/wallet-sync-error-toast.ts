import { toast } from 'sonner'
import { asBadLocalChainStateError } from '@/lib/bad-local-chain-state-error'
import { sanitizeErrorMessageForUi } from '@/lib/sanitize-error-for-ui'
import { errorMessage } from '@/lib/utils'

const BAD_CHAIN_SYNC_HINT =
  'Try Full rescan on the wallet dashboard — it can repair saved chain data.'

type WalletSyncErrorContext =
  | 'initial-import'
  | 'bootstrap-load'
  | 'unlock-background-sync'

/**
 * Surfaces Esplora / WASM sync failures with a short, sanitized detail line (no paths/URLs leaked).
 * Logs the raw error to the console for debugging.
 */
export function reportWalletSyncError(
  context: WalletSyncErrorContext,
  err: unknown,
): void {
  const logLabel =
    context === 'initial-import'
      ? 'Post-import initial sync failed'
      : context === 'unlock-background-sync'
        ? 'Background sync failed after unlock'
        : 'Wallet bootstrap sync failed'
  console.error(logLabel, err)

  const badChain = asBadLocalChainStateError(err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))

  if (context === 'initial-import') {
    if (badChain) {
      toast.error('Initial sync failed', {
        description: `${badChain.message} ${BAD_CHAIN_SYNC_HINT}`,
      })
      return
    }
    if (detail) {
      toast.error('Initial sync failed', {
        description: `${detail} · You can sync later from the dashboard.`,
      })
    } else {
      toast.error(
        'Initial sync failed — you can sync later from the dashboard.',
      )
    }
    return
  }

  if (badChain) {
    toast.error('Sync failed', {
      description: `${badChain.message} ${BAD_CHAIN_SYNC_HINT}`,
    })
    return
  }

  if (detail) {
    toast.error('Sync failed', {
      description: `${detail} · Wallet is unlocked but chain data may be stale until sync succeeds.`,
    })
  } else {
    toast.error('Sync failed — wallet unlocked but data may be stale')
  }
}

/**
 * Import-time initial Esplora full scan failed; offer the same retry as the dashboard banner.
 */
export function showImportInitialSyncFailureToast(
  err: unknown,
  onRetry: () => void | Promise<void>,
): void {
  console.error('Post-import initial sync failed', err)

  const badChain = asBadLocalChainStateError(err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  const description = badChain
    ? `${badChain.message} ${BAD_CHAIN_SYNC_HINT} You can also retry.`
    : detail
      ? `${detail} · Retry or use Full rescan on the dashboard.`
      : 'Retry or use Full rescan on the dashboard.'

  toast.error('Initial sync failed', {
    description,
    action: {
      label: 'Retry',
      onClick: () => {
        void onRetry()
      },
    },
  })
}
