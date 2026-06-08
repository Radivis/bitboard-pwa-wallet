import { toast } from 'sonner'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'

/**
 * Arkade session open runs after the wallet is already unlocked. Failures must not
 * be reported as password/decrypt errors.
 */
export function reportArkadeSessionOpenError(err: unknown): void {
  console.error('Arkade session open failed after unlock', err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  if (detail) {
    toast.error('Arkade could not start', { description: detail })
    return
  }
  toast.error('Arkade could not start — wallet is unlocked but offchain data is unavailable')
}
