import { toast } from 'sonner'
import {
  removeOpfsRootEntryIfExists,
  writeArrayBufferToOpfsRoot,
} from '@/lib/opfs-root-file'

/** Brief delay so OPFS / SQLite settle before a full page reload. */
export const RELOAD_AFTER_OPFS_WRITE_MS = 400

export async function replaceOpfsSqliteAfterDestroy(options: {
  opfsBasename: string
  sqliteBytes: Uint8Array
  destroyDatabase: () => Promise<void>
  ensureMigrated: () => Promise<void>
  successToastMessage: string
  onBeforeReload?: () => void
}): Promise<void> {
  const {
    opfsBasename,
    sqliteBytes,
    destroyDatabase,
    ensureMigrated,
    successToastMessage,
    onBeforeReload,
  } = options

  await destroyDatabase()
  await removeOpfsRootEntryIfExists(`${opfsBasename}-wal`)
  await removeOpfsRootEntryIfExists(`${opfsBasename}-shm`)
  const ab = sqliteBytes.buffer.slice(
    sqliteBytes.byteOffset,
    sqliteBytes.byteOffset + sqliteBytes.byteLength,
  ) as ArrayBuffer
  await writeArrayBufferToOpfsRoot(opfsBasename, ab)
  await ensureMigrated()
  onBeforeReload?.()
  toast.success(successToastMessage)
  window.setTimeout(() => {
    window.location.reload()
  }, RELOAD_AFTER_OPFS_WRITE_MS)
}
