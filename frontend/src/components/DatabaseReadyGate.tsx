import { type ReactNode, useEffect, useState } from 'react'
import { checkDatabaseHealth } from '@/db'
import { LoadingSpinner } from '@/components/LoadingSpinner'

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
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    checkDatabaseHealth().then(() => {
      setIsReady(true)
    })
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
