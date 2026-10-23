import { toast } from 'sonner'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'

/**
 * Bark session open runs after the wallet is already unlocked. Failures must not
 * fail the on-chain unlock.
 */
export function reportBarkSessionOpenError(err: unknown): void {
  console.error('Bark session open failed after unlock', err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  if (detail) {
    toast.error('Bark could not start', { description: detail })
    return
  }
  toast.error('Bark could not start')
}
