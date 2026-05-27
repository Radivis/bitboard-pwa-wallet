import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LAB_SQLITE_OPFS_BASENAME } from '@/db/opfs/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { destroyLabDatabase, ensureLabMigrated } from '@/db/lab-database'
import { BackupZipInvalidError } from '@/lib/shared/backup-zip-invalid-error'
import {
  opfsRootFileExists,
  readBlobFromOpfsRootIfExists,
  readTextFileFromOpfsRootIfExists,
  triggerBrowserSaveLocalBlob,
} from '@/db/opfs/opfs-root-file'
import { replaceOpfsSqliteAfterDestroy } from '@/db/opfs/opfs-sqlite-replace-and-reload'
import { LAB_BACKUP_SQLITE_ENTRY_NAME, LAB_BACKUP_ZIP_FILENAME } from '@/lib/lab/lab-backup-constants'
import { parseLabBackupZipFile } from '@/lib/lab/lab-backup-import'
import { zipSingleFileForLocalExport } from '@/lib/settings/zip-single-file-export'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { useWalletBackupExport } from '@/components/settings/use-wallet-backup-export'
import { useWalletBackupImport } from '@/components/settings/use-wallet-backup-import'

const MIGRATION_REPORT_INNER_NAME = 'wallet-schema-migration-failure.json'
const MIGRATION_REPORT_ZIP_NAME = 'wallet-schema-migration-failure.zip'

export function useDataBackupsCard() {
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const walletBackupExport = useWalletBackupExport()
  const walletBackupImport = useWalletBackupImport()

  const [migrationReportExists, setMigrationReportExists] = useState(false)
  const [labFileExists, setLabFileExists] = useState<boolean | null>(null)
  const [labExportBusy, setLabExportBusy] = useState(false)
  const [reportExportBusy, setReportExportBusy] = useState(false)
  const [labImportWipeOpen, setLabImportWipeOpen] = useState(false)
  const [labImportBusy, setLabImportBusy] = useState(false)
  const [pendingLabSqlite, setPendingLabSqlite] = useState<Uint8Array | null>(null)
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

  const exportBusy = walletBackupExport.walletExportBusy
    ? 'wallet'
    : labExportBusy
      ? 'lab'
      : reportExportBusy
        ? 'report'
        : null

  const exportLab = useCallback(async () => {
    setLabExportBusy(true)
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
      setLabExportBusy(false)
    }
  }, [])

  const exportMigrationReport = useCallback(async () => {
    setReportExportBusy(true)
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
      setReportExportBusy(false)
    }
  }, [])

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

  const anyImportBusy = walletBackupImport.importBusy || labImportBusy

  return {
    nearZeroActive,
    migrationReportExists,
    labFileExists,
    exportBusy,
    exportPasswordOpen: walletBackupExport.exportPasswordOpen,
    setExportPasswordOpen: walletBackupExport.setExportPasswordOpen,
    importWipeOpen: walletBackupImport.importWipeOpen,
    importPasswordOpen: walletBackupImport.importPasswordOpen,
    setImportPasswordOpen: walletBackupImport.setImportPasswordOpen,
    importBusy: walletBackupImport.importBusy,
    labImportWipeOpen,
    importFileInputRef: walletBackupImport.importFileInputRef,
    labImportFileInputRef,
    runSignedWalletExport: walletBackupExport.runSignedWalletExport,
    exportWallet: walletBackupExport.exportWallet,
    exportLab,
    exportMigrationReport,
    onImportFilePick: walletBackupImport.onImportFilePick,
    cancelImportFlow: walletBackupImport.cancelImportFlow,
    confirmWipeImport: walletBackupImport.confirmWipeImport,
    runVerifiedImport: walletBackupImport.runVerifiedImport,
    runUnverifiedWalletBackupImport: walletBackupImport.runUnverifiedWalletBackupImport,
    abortWalletBackupImportBypass: walletBackupImport.abortWalletBackupImportBypass,
    checkSigningPasswordMatchesAppPassword: walletBackupExport.checkSigningPasswordMatchesAppPassword,
    importBypassModalOpen: walletBackupImport.importBypassModalOpen,
    importVerifyInlineMessage: walletBackupImport.importVerifyInlineMessage,
    importPasswordResetKey: walletBackupImport.importPasswordResetKey,
    onLabImportFilePick,
    cancelLabImportFlow,
    runLabImportAfterWipeConfirm,
    anyImportBusy,
  }
}
