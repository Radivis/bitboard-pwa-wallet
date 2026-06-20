import { toast } from 'sonner'
import { OnchainSaveBlockingLockError } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import { ArkadeSaveBlockingLockError } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import { LightningSaveBlockingLockError } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'

const WALLET_SAVE_BLOCKING_LOCK_MESSAGE =
  "Latest wallet data couldn't be saved. Use Retry on the dashboard before locking."

export function reportWalletSaveBlockingLock(error: unknown): boolean {
  if (
    !(error instanceof OnchainSaveBlockingLockError) &&
    !(error instanceof ArkadeSaveBlockingLockError) &&
    !(error instanceof LightningSaveBlockingLockError)
  ) {
    return false
  }
  toast.error(WALLET_SAVE_BLOCKING_LOCK_MESSAGE)
  return true
}

/** @deprecated Use reportWalletSaveBlockingLock */
export function reportOnchainSaveBlockingLock(error: unknown): boolean {
  return reportWalletSaveBlockingLock(error)
}
