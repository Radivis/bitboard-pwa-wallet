import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import { checkForServiceWorkerUpdate } from '@/lib/pwa/check-for-service-worker-update'

/**
 * Prompts the user when a new app version has been downloaded by the service worker.
 * Refresh applies the update; "Later" keeps the current tab on the old bundle until reload.
 */
export function PwaUpdateBanner() {
  const [updatePromptDismissed, setUpdatePromptDismissed] = useState(false)
  const {
    needRefresh: [updateAvailable, setUpdateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      setUpdatePromptDismissed(false)
    },
    onRegisteredSW() {
      checkForServiceWorkerUpdate()
    },
  })

  useEffect(() => {
    const onDocumentVisible = () => {
      if (document.visibilityState === 'visible') {
        checkForServiceWorkerUpdate()
      }
    }

    document.addEventListener('visibilitychange', onDocumentVisible)
    return () => document.removeEventListener('visibilitychange', onDocumentVisible)
  }, [])

  if (!updateAvailable || updatePromptDismissed) {
    return null
  }

  const applyUpdateAndReload = async () => {
    setUpdateAvailable(false)
    await updateServiceWorker(true)
  }

  return (
    <div
      role="region"
      aria-label="App update available"
      className="border-b border-amber-900/70 bg-amber-600 px-4 py-4 text-amber-50 shadow-md dark:bg-amber-950 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 gap-3">
          <RefreshCw className="mt-0.5 h-6 w-6 shrink-0 text-amber-100" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold leading-snug">A new version is available</p>
            <p className="text-sm leading-relaxed text-amber-100">
              Refresh to load security fixes and the latest features. Finish any in-progress
              send or password change first if needed.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
          <Button
            type="button"
            variant="secondary"
            className="border-amber-700/80 bg-amber-900/50 text-amber-50 hover:bg-amber-900/70"
            onClick={() => setUpdatePromptDismissed(true)}
          >
            Later
          </Button>
          <Button type="button" onClick={() => void applyUpdateAndReload()}>
            Refresh to update
          </Button>
        </div>
      </div>
    </div>
  )
}
