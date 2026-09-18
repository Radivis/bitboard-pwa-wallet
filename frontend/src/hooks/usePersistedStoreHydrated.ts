import { useEffect, useState } from 'react'
import {
  waitForPersistedStoreHydration,
  type PersistedStoreLike,
} from '@/lib/settings/persisted-store-hydration'

/** True once a Zustand `persist` store has finished loading from SQLite. */
export function usePersistedStoreHydrated(store: PersistedStoreLike): boolean {
  const [hydrated, setHydrated] = useState(() => store.persist.hasHydrated())

  useEffect(() => {
    if (hydrated) {
      return
    }
    let cancelled = false
    void waitForPersistedStoreHydration(store).then(() => {
      if (!cancelled) {
        setHydrated(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [store, hydrated])

  return hydrated
}
