import { toast } from 'sonner'
import { OnchainSaveBlockingLockError } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'

const ONCHAIN_SAVE_BLOCKING_LOCK_MESSAGE =
  "Latest wallet data couldn't be saved. Use Retry on the dashboard before locking."

export function reportOnchainSaveBlockingLock(error: unknown): boolean {
  if (!(error instanceof OnchainSaveBlockingLockError)) {
    return false
  }
  toast.error(ONCHAIN_SAVE_BLOCKING_LOCK_MESSAGE)
  return true
}
