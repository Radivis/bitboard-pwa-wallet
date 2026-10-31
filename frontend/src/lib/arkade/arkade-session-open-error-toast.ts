import { toast } from 'sonner'
import { appendSignetArkadeSessionStartNote } from '@/lib/arkade/signet-arkade-session-start-note'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { tryMapWalletSecretsError } from '@/lib/wallet/wallet-secrets-error-messages'

const ARKADE_DECRYPT_AFTER_UNLOCK_HINT =
  'Your wallet unlocked, but Arkade could not read its data. Try locking and unlocking again.'

/**
 * Arkade session open runs after the wallet is already unlocked. Failures must not
 * be reported as password/decrypt errors.
 */
function toastArkadeSessionStartFailure(title: string, description: string): void {
  const shownDescription = appendSignetArkadeSessionStartNote(
    description,
    getArkadeLoadLifecycleSnapshot().networkMode,
  )
  if (shownDescription === '') {
    toast.error(title)
    return
  }
  toast.error(title, { description: shownDescription })
}

export function reportArkadeSessionOpenError(err: unknown): void {
  console.error('Arkade session open failed after unlock', err)
  if (tryMapWalletSecretsError(err) != null) {
    toastArkadeSessionStartFailure('Arkade could not start', ARKADE_DECRYPT_AFTER_UNLOCK_HINT)
    return
  }
  const detail = sanitizeErrorMessageForUi(errorMessage(err))
  if (detail.includes('not recognized by the connected operator')) {
    toastArkadeSessionStartFailure(
      'Arkade operator mismatch',
      'Saved Arkade data does not match this operator URL. If the operator rotated keys, update the app; otherwise check that you are on the intended Arkade service.',
    )
    return
  }
  if (detail.includes('does not match session network')) {
    toastArkadeSessionStartFailure(
      'Arkade network mismatch',
      'Saved Arkade data was created on a different network than the current wallet mode.',
    )
    return
  }
  if (detail) {
    toastArkadeSessionStartFailure('Arkade could not start', detail)
    return
  }
  toastArkadeSessionStartFailure(
    'Arkade could not start — wallet is unlocked but offchain data is unavailable',
    '',
  )
}
