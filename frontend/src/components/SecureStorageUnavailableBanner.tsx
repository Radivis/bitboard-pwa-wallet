import { AlertTriangle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { sanitizeErrorMessageForUi } from '@/lib/sanitize-error-for-ui'
import { useSecureStorageAvailabilityStore } from '@/stores/secureStorageAvailabilityStore'

/**
 * Shown when OPFS-backed SQLite cannot be initialized — the app does not fall back to IndexedDB.
 */
export function SecureStorageUnavailableBanner() {
  const { isAvailable, lastErrorMessage, opfsLikelyUnsupported } =
    useSecureStorageAvailabilityStore(
      useShallow((s) => ({
        isAvailable: s.isAvailable,
        lastErrorMessage: s.lastErrorMessage,
        opfsLikelyUnsupported: s.opfsLikelyUnsupported,
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
    <div
      role="alert"
      className="border-b border-red-900/80 bg-red-600 px-4 py-4 text-red-50 shadow-md dark:bg-red-950 dark:text-red-50"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle
            className="mt-0.5 h-7 w-7 shrink-0 text-red-100"
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold leading-snug">{title}</p>
            <p className="text-sm leading-relaxed text-red-100">{body}</p>
            {lastErrorMessage ? (
              <p
                className="font-mono text-xs leading-relaxed text-red-200/90 break-words"
                data-testid="secure-storage-error-detail"
              >
                {sanitizeErrorMessageForUi(lastErrorMessage)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
