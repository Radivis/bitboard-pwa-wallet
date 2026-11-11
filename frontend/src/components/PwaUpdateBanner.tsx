import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { DesignBanner } from '@/components/design/DesignBanner'
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
    <DesignBanner
      role="region"
      aria-label="App update available"
      status="info"
      className="mx-4 mt-4"
      title="A new version is available"
      description="Refresh to load security fixes and the latest features. Finish any in-progress send or password change first if needed."
      primaryAction={{
        label: 'Refresh to update',
        onClick: () => void applyUpdateAndReload(),
      }}
      secondaryAction={{
        label: 'Later',
        onClick: () => setUpdatePromptDismissed(true),
      }}
    />
  )
}
