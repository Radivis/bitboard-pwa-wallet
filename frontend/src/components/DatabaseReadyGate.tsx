import { type ReactNode, useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { checkDatabaseHealth, getDatabase, tryLoadNearZeroSessionIntoMemory } from '@/db'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { pathnameRequiresWalletCryptoSession } from '@/lib/pathname-requires-wallet-crypto-session'

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

  useEffect(() => {
    const pathOnColdStart = location.pathname
    checkDatabaseHealth()
      .then(async () => {
        if (pathnameRequiresWalletCryptoSession(pathOnColdStart)) {
          await tryLoadNearZeroSessionIntoMemory(getDatabase())
        }
      })
      .then(() => {
        setIsReady(true)
      })
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

  return <>{children}</>
}
