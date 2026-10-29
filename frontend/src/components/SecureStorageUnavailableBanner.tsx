import { useShallow } from 'zustand/react/shallow'
import { DesignBanner } from '@/components/design/DesignBanner'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { useSecureStorageAvailabilityStore } from '@/stores/secureStorageAvailabilityStore'

/**
 * Shown when OPFS-backed SQLite cannot be initialized — the app does not fall back to IndexedDB.
 */
export function SecureStorageUnavailableBanner() {
  const { isAvailable, lastErrorMessage, opfsLikelyUnsupported } =
    useSecureStorageAvailabilityStore(
      useShallow((secureStorageAvailabilityState) => ({
        isAvailable: secureStorageAvailabilityState.isAvailable,
        lastErrorMessage: secureStorageAvailabilityState.lastErrorMessage,
        opfsLikelyUnsupported: secureStorageAvailabilityState.opfsLikelyUnsupported,
      })),
    )

  if (isAvailable) {
    return null
  }

  const title = opfsLikelyUnsupported
    ? 'Secure storage is not available'
    : 'Secure storage could not be opened'

  const body = opfsLikelyUnsupported
    ? 'This browser does not appear to support OPFS (Origin Private File System), which this wallet needs to store data safely. Update your browser or use a different one.'
    : 'Wallet data may not persist on this device. Try updating your browser or use a supported browser, and avoid relying on local data until storage works.'

  return (
    <DesignBanner
      role="alert"
      status="error"
      className="mx-4 mt-4"
      title={title}
      description={body}
      optionalContent={
        lastErrorMessage ? (
          <p className="design-type-addresses break-words" data-testid="secure-storage-error-detail">
            {sanitizeErrorMessageForUi(lastErrorMessage)}
          </p>
        ) : null
      }
    />
  )
}
