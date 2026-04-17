import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { LAB_BACKUP_SQLITE_ENTRY_NAME } from '@/lib/lab-backup-constants'
import { LabBackupZipInvalidError, parseLabBackupZipFile } from '@/lib/lab-backup-import'

describe('parseLabBackupZipFile', () => {
  it('returns sqlite bytes when the expected entry exists', async () => {
    const zip = new JSZip()
    zip.file(LAB_BACKUP_SQLITE_ENTRY_NAME, new Uint8Array([9, 8, 7]))
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'lab.zip', { type: 'application/zip' })
    const out = await parseLabBackupZipFile(file)
    expect(Array.from(out.sqliteBytes)).toEqual([9, 8, 7])
  })

  it('throws when the lab sqlite entry is missing', async () => {
    const zip = new JSZip()
    zip.file('wrong-name.sqlite', new Uint8Array([0]))
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'lab.zip', { type: 'application/zip' })
    await expect(parseLabBackupZipFile(file)).rejects.toBeInstanceOf(LabBackupZipInvalidError)
  })
})
