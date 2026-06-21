/** Stable getSnapshot for useSyncExternalStore when the source returns fresh object copies. */
export function createStableSnapshotGetter<T>(
  getSnapshot: () => T,
  isEqual: (previous: T, next: T) => boolean,
): () => T {
  let cachedSnapshot: T | null = null

  return () => {
    const nextSnapshot = getSnapshot()
    if (cachedSnapshot != null && isEqual(cachedSnapshot, nextSnapshot)) {
      return cachedSnapshot
    }
    cachedSnapshot = nextSnapshot
    return nextSnapshot
  }
}

export function shallowRecordEqual<T extends Record<string, unknown>>(
  previous: T,
  next: T,
): boolean {
  const previousKeys = Object.keys(previous) as (keyof T)[]
  if (previousKeys.length !== Object.keys(next).length) {
    return false
  }
  return previousKeys.every((key) => Object.is(previous[key], next[key]))
}
