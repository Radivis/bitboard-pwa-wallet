import JSZip from 'jszip'
import { readFileAsArrayBuffer } from '@/lib/read-file-as-array-buffer'
import {
  WALLET_BACKUP_MANIFEST_ENTRY_NAME,
  WALLET_BACKUP_SQLITE_ENTRY_NAME,
} from '@/lib/wallet-backup-constants'

export class WalletBackupZipInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WalletBackupZipInvalidError'
  }
}

export async function parseWalletBackupZipFile(file: File): Promise<{
  sqliteBytes: Uint8Array
  manifestJson: string
}> {
  const buf = await readFileAsArrayBuffer(file)
  const zip = await JSZip.loadAsync(buf)
  const sqliteEntry = zip.file(WALLET_BACKUP_SQLITE_ENTRY_NAME)
  const manifestEntry = zip.file(WALLET_BACKUP_MANIFEST_ENTRY_NAME)
  if (!sqliteEntry || !manifestEntry) {
    throw new WalletBackupZipInvalidError(
      'This ZIP is not a signed Bitboard wallet backup (expected wallet SQLite file and manifest).',
    )
  }
  const sqliteBuf = await sqliteEntry.async('arraybuffer')
  const manifestJson = await manifestEntry.async('string')
  return { sqliteBytes: new Uint8Array(sqliteBuf), manifestJson }
}
