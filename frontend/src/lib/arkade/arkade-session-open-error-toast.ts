import { toast } from 'sonner'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import { tryMapWalletSecretsError } from '@/lib/wallet/wallet-secrets-error-messages'

const ARKADE_DECRYPT_AFTER_UNLOCK_HINT =
  'Your wallet unlocked, but Arkade could not read its data. Try locking and unlocking again.'

/**
 * Arkade session open runs after the wallet is already unlocked. Failures must not
 * be reported as password/decrypt errors.
 */
export function reportArkadeSessionOpenError(err: unknown): void {
  console.error('Arkade session open failed after unlock', err)
  if (tryMapWalletSecretsError(err) != null) {
    toast.error('Arkade could not start', { description: ARKADE_DECRYPT_AFTER_UNLOCK_HINT })
    return
  }
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  if (detail) {
    toast.error('Arkade could not start', { description: detail })
    return
  }
  toast.error('Arkade could not start — wallet is unlocked but offchain data is unavailable')
}
