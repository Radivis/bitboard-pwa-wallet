import JSZip from 'jszip'
import { readFileAsArrayBuffer } from '@/lib/read-file-as-array-buffer'
import {
  WALLET_BACKUP_MANIFEST_ENTRY_NAME,
  WALLET_BACKUP_SQLITE_ENTRY_NAME,
} from '@/lib/wallet-backup-constants'
import { finalizeZipExportWithDeflate } from '@/lib/zip-single-file-export'

/**
 * Packs signed wallet backup: SQLite file + manifest JSON into one ZIP (DEFLATE).
 */
export async function zipWalletBackupForLocalExport(
  sqliteBlob: Blob,
  manifestJson: string,
): Promise<Blob> {
  const zip = new JSZip()
  const sqliteBuffer = await readFileAsArrayBuffer(sqliteBlob)
  zip.file(WALLET_BACKUP_SQLITE_ENTRY_NAME, sqliteBuffer)
  zip.file(WALLET_BACKUP_MANIFEST_ENTRY_NAME, manifestJson)
  return finalizeZipExportWithDeflate(zip)
}
