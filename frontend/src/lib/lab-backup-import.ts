import JSZip from 'jszip'
import { LabBackupZipInvalidError } from '@/lib/backup-zip-invalid-error'
import { LAB_BACKUP_SQLITE_ENTRY_NAME } from '@/lib/lab-backup-constants'
import { readFileAsArrayBuffer } from '@/lib/read-file-as-array-buffer'

/**
 * Reads an unsigned lab backup ZIP (single `bitboard-lab-backup.sqlite` entry).
 */
export async function parseLabBackupZipFile(file: File): Promise<{ sqliteBytes: Uint8Array }> {
  const buf = await readFileAsArrayBuffer(file)
  const zip = await JSZip.loadAsync(buf)
  const sqliteEntry = zip.file(LAB_BACKUP_SQLITE_ENTRY_NAME)
  if (!sqliteEntry) {
    throw new LabBackupZipInvalidError(
      'This ZIP is not a Bitboard lab backup (expected bitboard-lab-backup.sqlite inside the archive).',
    )
  }
  const sqliteBuf = await sqliteEntry.async('arraybuffer')
  return { sqliteBytes: new Uint8Array(sqliteBuf) }
}

export { LabBackupZipInvalidError }
