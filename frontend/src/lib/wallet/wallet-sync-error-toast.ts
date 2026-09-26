import { toast } from 'sonner'
import {
  asBadLocalChainStateError,
  BAD_LOCAL_CHAIN_FULL_RESCAN_ACTION,
} from '@/lib/shared/bad-local-chain-state-error'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'

const BAD_CHAIN_SYNC_HINT = `Try ${BAD_LOCAL_CHAIN_FULL_RESCAN_ACTION} — it can repair saved chain data.`

type WalletSyncErrorContext =
  | 'initial-sync'
  | 'bootstrap-load'
  | 'unlock-background-sync'
  | 'require-unlocked-wallet'

/**
 * Surfaces Esplora / WASM sync failures with a short, sanitized detail line (no paths/URLs leaked).
 * Logs the raw error to the console for debugging.
 */
export function reportWalletSyncError(
  context: WalletSyncErrorContext,
  err: unknown,
): void {
  const logLabel =
    context === 'initial-sync'
      ? 'Initial sync failed'
      : context === 'unlock-background-sync' || context === 'require-unlocked-wallet'
        ? 'Background sync failed after unlock'
        : 'Wallet bootstrap sync failed'
  console.error(logLabel, err)

  const badChain = asBadLocalChainStateError(err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))

  if (context === 'initial-sync') {
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
 * Create or import initial Esplora full scan failed; offer the same retry as the dashboard banner.
 */
export function showInitialSyncFailureToast(
  err: unknown,
  onRetry: () => void | Promise<void>,
): void {
  console.error('Initial sync failed', err)

  const badChain = asBadLocalChainStateError(err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  const description = badChain
    ? `${badChain.message} ${BAD_CHAIN_SYNC_HINT} You can also retry.`
    : detail
      ? `${detail} · Retry or use ${BAD_LOCAL_CHAIN_FULL_RESCAN_ACTION}.`
      : `Retry or use ${BAD_LOCAL_CHAIN_FULL_RESCAN_ACTION}.`

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
