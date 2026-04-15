/**
 * Zustand `persist` middleware exposes `hasHydrated` / `onFinishHydration` for stores
 * that load persisted state asynchronously.
 */
export type PersistedStoreLike = {
  persist: {
    hasHydrated: () => boolean
    onFinishHydration: (fn: () => void) => () => void
  }
}

export function waitForPersistedStoreHydration(
  store: PersistedStoreLike,
): Promise<void> {
  return new Promise((resolve) => {
    if (store.persist.hasHydrated()) {
      resolve()
      return
    }
    const unsub = store.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
  })
}
