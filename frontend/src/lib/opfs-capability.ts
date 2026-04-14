/**
 * Origin Private File System (OPFS) capability checks for messaging when secure
 * SQLite storage fails — we do not fall back to IndexedDB; we surface browser support instead.
 */

/** True when the StorageManager exposes `getDirectory` (OPFS entry point). */
export function isOpfsApiPresent(): boolean {
  if (typeof navigator === 'undefined' || navigator.storage === undefined) {
    return false
  }
  return typeof navigator.storage.getDirectory === 'function'
}

/**
 * Attempts to open the OPFS root. Returns false if the API rejects or throws.
 */
export async function tryProbeOpfsAccess(): Promise<boolean> {
  if (!isOpfsApiPresent()) return false
  try {
    await navigator.storage!.getDirectory()
    return true
  } catch {
    return false
  }
}

/**
 * True when OPFS appears missing or unusable — use for stronger “update your browser” copy.
 * When the API is present and the probe succeeds, secure-storage failure is likely elsewhere
 * (quota, corruption, etc.); messaging stays slightly broader.
 */
export async function assessOpfsLikelyUnsupported(): Promise<boolean> {
  if (!isOpfsApiPresent()) return true
  return !(await tryProbeOpfsAccess())
}
