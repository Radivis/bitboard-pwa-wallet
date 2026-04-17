import JSZip from 'jszip'
import {
  WALLET_BACKUP_MANIFEST_ENTRY_NAME,
  WALLET_BACKUP_SQLITE_ENTRY_NAME,
} from '@/lib/wallet-backup-constants'

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * Packs signed wallet backup: SQLite file + manifest JSON into one ZIP (DEFLATE).
 */
export async function zipWalletBackupForLocalExport(
  sqliteBlob: Blob,
  manifestJson: string,
): Promise<Blob> {
  const zip = new JSZip()
  const sqliteBuffer = await blobToArrayBuffer(sqliteBlob)
  zip.file(WALLET_BACKUP_SQLITE_ENTRY_NAME, sqliteBuffer)
  zip.file(WALLET_BACKUP_MANIFEST_ENTRY_NAME, manifestJson)
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  })
}
