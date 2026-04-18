import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LAB_SQLITE_OPFS_BASENAME, WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { destroyDatabase, ensureMigrated, getDatabase } from '@/db/database'
import { destroyLabDatabase, ensureLabMigrated } from '@/db/lab-database'
import { anyWalletHasNoMnemonicBackupFlag } from '@/db/wallet-no-mnemonic-backup'
import { resolveArgon2CiParamsOrThrow } from '@/lib/argon2-ci-env'
import { BackupZipInvalidError } from '@/lib/backup-zip-invalid-error'
import {
  opfsRootFileExists,
  readBlobFromOpfsRootIfExists,
  readTextFileFromOpfsRootIfExists,
  triggerBrowserSaveLocalBlob,
} from '@/lib/opfs-root-file'
import { replaceOpfsSqliteAfterDestroy } from '@/lib/opfs-sqlite-replace-and-reload'
import {
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION,
  WALLET_BACKUP_SIGNING_SALT_BYTES,
  WALLET_BACKUP_ZIP_FILENAME,
} from '@/lib/wallet-backup-constants'
import { LAB_BACKUP_SQLITE_ENTRY_NAME, LAB_BACKUP_ZIP_FILENAME } from '@/lib/lab-backup-constants'
import { parseLabBackupZipFile } from '@/lib/lab-backup-import'
import { parseWalletBackupZipFile } from '@/lib/wallet-backup-import'
import { zipSingleFileForLocalExport } from '@/lib/zip-single-file-export'
import { zipWalletBackupForLocalExport } from '@/lib/zip-wallet-backup-export'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { getEncryptionWorker } from '@/workers/encryption-factory'

const MIGRATION_REPORT_INNER_NAME = 'wallet-schema-migration-failure.json'
const MIGRATION_REPORT_ZIP_NAME = 'wallet-schema-migration-failure.zip'

function walletBackupSignKdfPhc(): string {
  return resolveArgon2CiParamsOrThrow()
    ? ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI
    : ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION
}

export function useDataBackupsCard() {
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const [migrationReportExists, setMigrationReportExists] = useState(false)
  const [labFileExists, setLabFileExists] = useState<boolean | null>(null)
  const [exportBusy, setExportBusy] = useState<'wallet' | 'lab' | 'report' | null>(null)
  const [exportPasswordOpen, setExportPasswordOpen] = useState(false)
  const [importWipeOpen, setImportWipeOpen] = useState(false)
  const [importPasswordOpen, setImportPasswordOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [labImportWipeOpen, setLabImportWipeOpen] = useState(false)
  const [labImportBusy, setLabImportBusy] = useState(false)
  const [pendingLabSqlite, setPendingLabSqlite] = useState<Uint8Array | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    sqliteBytes: Uint8Array
    manifestJson: string
  } | null>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const labImportFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [report, lab] = await Promise.all([
          opfsRootFileExists(WALLET_MIGRATION_FAILURE_OPFS_FILENAME),
          opfsRootFileExists(LAB_SQLITE_OPFS_BASENAME),
        ])
        if (!cancelled) {
          setMigrationReportExists(report)
          setLabFileExists(lab)
        }
      } catch {
        if (!cancelled) {
          setMigrationReportExists(false)
          setLabFileExists(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const runSignedWalletExport = useCallback(async (password: string) => {
    setExportBusy('wallet')
    try {
      const blob = await readBlobFromOpfsRootIfExists(WALLET_SQLITE_OPFS_BASENAME)
      if (!blob) {
        toast.error('Wallet data file was not found in local storage.')
        return
      }
      const sqliteBuf = await blob.arrayBuffer()
      const sqliteBytes = new Uint8Array(sqliteBuf)
      const salt = crypto.getRandomValues(new Uint8Array(WALLET_BACKUP_SIGNING_SALT_BYTES))
      const enc = getEncryptionWorker()
      const manifestJson = await enc.signWalletBackupManifest(
        sqliteBytes,
        password,
        salt,
        walletBackupSignKdfPhc(),
      )
      const zipped = await zipWalletBackupForLocalExport(blob, manifestJson)
      triggerBrowserSaveLocalBlob(zipped, WALLET_BACKUP_ZIP_FILENAME)
      toast.success('Signed wallet backup exported as a ZIP on this device.')
      setExportPasswordOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExportBusy(null)
    }
  }, [])

  const exportWallet = useCallback(() => {
    setExportPasswordOpen(true)
  }, [])

  const exportLab = useCallback(async () => {
    setExportBusy('lab')
    try {
      const blob = await readBlobFromOpfsRootIfExists(LAB_SQLITE_OPFS_BASENAME)
      if (!blob) {
        toast.error('Lab data file was not found. Open the Lab at least once to create it.')
        return
      }
      const zipped = await zipSingleFileForLocalExport(blob, LAB_BACKUP_SQLITE_ENTRY_NAME)
      triggerBrowserSaveLocalBlob(zipped, LAB_BACKUP_ZIP_FILENAME)
      toast.success('Lab data exported as a ZIP on this device.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExportBusy(null)
    }
  }, [])

  const exportMigrationReport = useCallback(async () => {
    setExportBusy('report')
    try {
      const text = await readTextFileFromOpfsRootIfExists(WALLET_MIGRATION_FAILURE_OPFS_FILENAME)
      if (!text) {
        toast.error('Migration error report was not found.')
        setMigrationReportExists(false)
        return
      }
      const jsonBlob = new Blob([text], { type: 'application/json' })
      const zipped = await zipSingleFileForLocalExport(jsonBlob, MIGRATION_REPORT_INNER_NAME)
      triggerBrowserSaveLocalBlob(zipped, MIGRATION_REPORT_ZIP_NAME)
      toast.success('Error report exported as a ZIP on this device.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExportBusy(null)
    }
  }, [])

  const onImportFilePick = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.zip')) {
      toast.error('Please choose a ZIP file.')
      return
    }
    try {
      const parsed = await parseWalletBackupZipFile(file)
      await ensureMigrated()
      const blocked = await anyWalletHasNoMnemonicBackupFlag(getDatabase())
      if (blocked) {
        toast.error(
          'Import blocked: back up every wallet seed phrase in Settings before importing wallet data.',
        )
        return
      }
      setPendingImport(parsed)
      setImportWipeOpen(true)
    } catch (e) {
      if (e instanceof BackupZipInvalidError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Could not read backup ZIP.')
      }
    }
  }, [])

  const cancelImportFlow = useCallback(() => {
    setPendingImport(null)
    setImportWipeOpen(false)
    setImportPasswordOpen(false)
  }, [])

  const confirmWipeImport = useCallback(() => {
    setImportWipeOpen(false)
    setImportPasswordOpen(true)
  }, [])

  const runVerifiedImport = useCallback(
    async (password: string) => {
      if (!pendingImport) return
      setImportBusy(true)
      try {
        const enc = getEncryptionWorker()
        await enc.verifyWalletBackupManifest(
          pendingImport.sqliteBytes,
          password,
          pendingImport.manifestJson,
        )
        const sqliteBytes = pendingImport.sqliteBytes
        await replaceOpfsSqliteAfterDestroy({
          opfsBasename: WALLET_SQLITE_OPFS_BASENAME,
          sqliteBytes,
          destroyDatabase,
          ensureMigrated,
          successToastMessage: 'Wallet backup imported. Reloading…',
          onBeforeReload: () => {
            setImportPasswordOpen(false)
            setPendingImport(null)
          },
        })
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : 'Import failed (wrong password or invalid backup).'
        toast.error(msg)
      } finally {
        setImportBusy(false)
      }
    },
    [pendingImport],
  )

  const onLabImportFilePick = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Please choose a ZIP file.')
      return
    }
    try {
      const { sqliteBytes } = await parseLabBackupZipFile(file)
      setPendingLabSqlite(sqliteBytes)
      setLabImportWipeOpen(true)
    } catch (e) {
      if (e instanceof BackupZipInvalidError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Could not read lab backup ZIP.')
      }
    }
  }, [])

  const cancelLabImportFlow = useCallback(() => {
    setPendingLabSqlite(null)
    setLabImportWipeOpen(false)
  }, [])

  const runLabImportAfterWipeConfirm = useCallback(async () => {
    if (!pendingLabSqlite) return
    const sqliteBytes = pendingLabSqlite
    setPendingLabSqlite(null)
    setLabImportWipeOpen(false)
    setLabImportBusy(true)
    try {
      await replaceOpfsSqliteAfterDestroy({
        opfsBasename: LAB_SQLITE_OPFS_BASENAME,
        sqliteBytes,
        destroyDatabase: destroyLabDatabase,
        ensureMigrated: ensureLabMigrated,
        successToastMessage: 'Lab backup imported. Reloading…',
        onBeforeReload: () => setLabFileExists(true),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lab import failed.')
    } finally {
      setLabImportBusy(false)
    }
  }, [pendingLabSqlite])

  const anyImportBusy = importBusy || labImportBusy

  return {
    nearZeroActive,
    migrationReportExists,
    labFileExists,
    exportBusy,
    exportPasswordOpen,
    setExportPasswordOpen,
    importWipeOpen,
    importPasswordOpen,
    setImportPasswordOpen,
    importBusy,
    labImportWipeOpen,
    importFileInputRef,
    labImportFileInputRef,
    runSignedWalletExport,
    exportWallet,
    exportLab,
    exportMigrationReport,
    onImportFilePick,
    cancelImportFlow,
    confirmWipeImport,
    runVerifiedImport,
    onLabImportFilePick,
    cancelLabImportFlow,
    runLabImportAfterWipeConfirm,
    anyImportBusy,
  }
}
