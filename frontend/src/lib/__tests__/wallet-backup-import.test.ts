import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  WALLET_BACKUP_MANIFEST_ENTRY_NAME,
  WALLET_BACKUP_SQLITE_ENTRY_NAME,
} from '@/lib/wallet-backup-constants'
import { parseWalletBackupZipFile, WalletBackupZipInvalidError } from '@/lib/wallet-backup-import'

describe('parseWalletBackupZipFile', () => {
  it('returns sqlite bytes and manifest JSON when both entries exist', async () => {
    const zip = new JSZip()
    zip.file(WALLET_BACKUP_SQLITE_ENTRY_NAME, new Uint8Array([1, 2, 3]))
    zip.file(WALLET_BACKUP_MANIFEST_ENTRY_NAME, '{"format_version":1}')
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'backup.zip', { type: 'application/zip' })
    const out = await parseWalletBackupZipFile(file)
    expect(out.manifestJson).toBe('{"format_version":1}')
    expect(Array.from(out.sqliteBytes)).toEqual([1, 2, 3])
  })

  it('throws WalletBackupZipInvalidError when manifest is missing', async () => {
    const zip = new JSZip()
    zip.file(WALLET_BACKUP_SQLITE_ENTRY_NAME, new Uint8Array([0]))
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'backup.zip', { type: 'application/zip' })
    await expect(parseWalletBackupZipFile(file)).rejects.toBeInstanceOf(WalletBackupZipInvalidError)
  })
})
