import { toast } from 'sonner'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'

export function reportLightningSyncError(err: unknown): void {
  console.error('Lightning sync failed', err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  toast.error(detail || 'Lightning sync failed')
}

export function reportArkadeOperatorSyncError(err: unknown): void {
  console.error('Arkade operator sync failed', err)
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  toast.error(detail || 'Arkade operator sync failed')
}
