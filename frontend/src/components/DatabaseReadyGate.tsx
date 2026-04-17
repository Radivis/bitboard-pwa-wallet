import { type ReactNode, useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { getDatabase, getInitialDatabaseHealth, tryLoadNearZeroSessionIntoMemory } from '@/db'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { readTextFileFromOpfsRootIfExists } from '@/lib/opfs-root-file'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MigrationFailureReportModal } from '@/components/MigrationFailureReportModal'
import { pathnameRequiresWalletCryptoSession } from '@/lib/pathname-requires-wallet-crypto-session'
import { assessOpfsLikelyUnsupported } from '@/lib/opfs-capability'
import { useSecureStorageAvailabilityStore } from '@/stores/secureStorageAvailabilityStore'

interface DatabaseReadyGateProps {
  children: ReactNode
}

/**
 * Ensures the database connection is established before rendering children.
 * This prevents the Zustand persist hydration and TanStack Query from racing
 * against a cold worker — the first database access warms up the worker,
 * so subsequent store hydration and queries succeed.
 */
export function DatabaseReadyGate({ children }: DatabaseReadyGateProps) {
  const location = useLocation()
  const [isReady, setIsReady] = useState(false)
  const [migrationFailureReportOpen, setMigrationFailureReportOpen] = useState(false)
  const [migrationFailureReportText, setMigrationFailureReportText] = useState<string | null>(null)

  useEffect(() => {
    const pathOnColdStart = location.pathname
    let cancelled = false

    void (async () => {
      const health = await getInitialDatabaseHealth()
      if (cancelled) return

      if (!health.ok) {
        console.error('Database initialization failed:', health.error)
        const opfsLikelyUnsupported = await assessOpfsLikelyUnsupported()
        if (cancelled) return
        useSecureStorageAvailabilityStore.getState().markUnavailable({
          lastErrorMessage: health.error.message,
          opfsLikelyUnsupported,
        })
        const reportText = await readTextFileFromOpfsRootIfExists(WALLET_MIGRATION_FAILURE_OPFS_FILENAME)
        if (!cancelled && reportText) {
          setMigrationFailureReportText(reportText)
          setMigrationFailureReportOpen(true)
        }
      } else if (pathnameRequiresWalletCryptoSession(pathOnColdStart)) {
        try {
          await tryLoadNearZeroSessionIntoMemory(getDatabase())
        } catch (err) {
          console.error('Near-zero session restore failed:', err)
        }
      }

      if (!cancelled) setIsReady(true)
    })()

    return () => {
      cancelled = true
    }
    // Intentionally once per app mount: re-running would replay DB init on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cold-start path only
  }, [])

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner text="Loading..." />
      </div>
    )
  }

  return (
    <>
      {migrationFailureReportText != null ? (
        <MigrationFailureReportModal
          isOpen={migrationFailureReportOpen}
          reportText={migrationFailureReportText}
          onOpenChange={(open) => {
            setMigrationFailureReportOpen(open)
            if (!open) {
              setMigrationFailureReportText(null)
            }
          }}
        />
      ) : null}
      {children}
    </>
  )
}
