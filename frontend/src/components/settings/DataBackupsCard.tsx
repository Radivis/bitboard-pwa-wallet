import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, FlaskConical, FileWarning, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { WalletBackupExportPasswordModal } from '@/components/settings/WalletBackupExportPasswordModal'
import { WalletBackupImportPasswordModal } from '@/components/settings/WalletBackupImportPasswordModal'
import { LAB_SQLITE_OPFS_BASENAME, WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import { destroyDatabase, ensureMigrated, getDatabase } from '@/db/database'
import { destroyLabDatabase, ensureLabMigrated } from '@/db/lab-database'
import { anyWalletHasNoMnemonicBackupFlag } from '@/db/wallet-no-mnemonic-backup'
import { resolveArgon2CiParamsOrThrow } from '@/lib/argon2-ci-env'
import {
  opfsRootFileExists,
  readBlobFromOpfsRootIfExists,
  readTextFileFromOpfsRootIfExists,
  removeOpfsRootEntryIfExists,
  triggerBrowserSaveLocalBlob,
  writeArrayBufferToOpfsRoot,
} from '@/lib/opfs-root-file'
import {
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION,
  WALLET_BACKUP_SIGNING_SALT_BYTES,
  WALLET_BACKUP_ZIP_FILENAME,
} from '@/lib/wallet-backup-constants'
import { LAB_BACKUP_SQLITE_ENTRY_NAME, LAB_BACKUP_ZIP_FILENAME } from '@/lib/lab-backup-constants'
import { parseLabBackupZipFile, LabBackupZipInvalidError } from '@/lib/lab-backup-import'
import { parseWalletBackupZipFile, WalletBackupZipInvalidError } from '@/lib/wallet-backup-import'
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

export function DataBackupsCard() {
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
      if (e instanceof WalletBackupZipInvalidError) {
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
        await destroyDatabase()
        await removeOpfsRootEntryIfExists(`${WALLET_SQLITE_OPFS_BASENAME}-wal`)
        await removeOpfsRootEntryIfExists(`${WALLET_SQLITE_OPFS_BASENAME}-shm`)
        const ab = pendingImport.sqliteBytes.buffer.slice(
          pendingImport.sqliteBytes.byteOffset,
          pendingImport.sqliteBytes.byteOffset + pendingImport.sqliteBytes.byteLength,
        ) as ArrayBuffer
        await writeArrayBufferToOpfsRoot(WALLET_SQLITE_OPFS_BASENAME, ab)
        await ensureMigrated()
        toast.success('Wallet backup imported. Reloading…')
        setImportPasswordOpen(false)
        setPendingImport(null)
        window.setTimeout(() => {
          window.location.reload()
        }, 400)
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
      if (e instanceof LabBackupZipInvalidError) {
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
      await destroyLabDatabase()
      await removeOpfsRootEntryIfExists(`${LAB_SQLITE_OPFS_BASENAME}-wal`)
      await removeOpfsRootEntryIfExists(`${LAB_SQLITE_OPFS_BASENAME}-shm`)
      const ab = sqliteBytes.buffer.slice(
        sqliteBytes.byteOffset,
        sqliteBytes.byteOffset + sqliteBytes.byteLength,
      ) as ArrayBuffer
      await writeArrayBufferToOpfsRoot(LAB_SQLITE_OPFS_BASENAME, ab)
      await ensureLabMigrated()
      setLabFileExists(true)
      toast.success('Lab backup imported. Reloading…')
      window.setTimeout(() => {
        window.location.reload()
      }, 400)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lab import failed.')
    } finally {
      setLabImportBusy(false)
    }
  }, [pendingLabSqlite])

  const anyImportBusy = importBusy || labImportBusy

  return (
    <Card id="data-backups">
      <input
        ref={importFileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        aria-hidden
        onChange={(e) => void onImportFilePick(e)}
      />
      <WalletBackupExportPasswordModal
        open={exportPasswordOpen}
        onOpenChange={setExportPasswordOpen}
        onCancel={() => setExportPasswordOpen(false)}
        onConfirm={runSignedWalletExport}
        isBusy={exportBusy === 'wallet'}
      />
      <ConfirmationDialog
        open={importWipeOpen}
        title="Replace local wallet data?"
        message="This will permanently delete the wallet database stored on this device and replace it with the backup from the ZIP. Other tabs may still hold old state until you reload. This cannot be undone."
        confirmText="Continue"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmWipeImport}
        onCancel={cancelImportFlow}
      />
      <ConfirmationDialog
        open={labImportWipeOpen}
        title="Replace local lab data?"
        message="This replaces the lab database on this device with the SQLite file from the ZIP. All current lab data on this device will be lost. The page will reload after import."
        confirmText="Continue"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => {
          void runLabImportAfterWipeConfirm()
        }}
        onCancel={cancelLabImportFlow}
      />
      <WalletBackupImportPasswordModal
        open={importPasswordOpen}
        onOpenChange={setImportPasswordOpen}
        onCancel={cancelImportFlow}
        onConfirm={runVerifiedImport}
        isBusy={importBusy}
      />
      <CardHeader>
        <CardTitle>Data Backups</CardTitle>
        <CardDescription>
          Export full local database files from this device as ZIP archives. Wallet exports are
          signed with your app password (ML-DSA); wallet import only accepts ZIPs that include the
          manifest and verify. Lab exports are a single SQLite file in a ZIP (no signature). Nothing
          is uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            disabled={nearZeroActive || exportBusy !== null}
            onClick={() => exportWallet()}
            className="w-full sm:w-auto"
          >
            <Database className="size-4" aria-hidden />
            Export wallet data
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={nearZeroActive || exportBusy !== null || anyImportBusy}
            onClick={() => importFileInputRef.current?.click()}
            className="w-full sm:w-auto"
          >
            <Upload className="size-4" aria-hidden />
            Import wallet backup
          </Button>
          {nearZeroActive ? (
            <p className="text-sm text-muted-foreground sm:max-w-md">
              Wallet export and import are not available in near-zero security mode. Set a real app
              password in Security first.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={labImportFileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            aria-hidden
            onChange={(e) => void onLabImportFilePick(e)}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              disabled={labFileExists === false || exportBusy !== null}
              onClick={() => void exportLab()}
              className="w-full sm:w-auto"
            >
              <FlaskConical className="size-4" aria-hidden />
              Export lab data
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={exportBusy !== null || anyImportBusy}
              onClick={() => labImportFileInputRef.current?.click()}
              className="w-full sm:w-auto"
            >
              <Upload className="size-4" aria-hidden />
              Import lab backup
            </Button>
            {labFileExists === false ? (
              <p className="text-sm text-muted-foreground sm:max-w-md">
                No lab database file yet. Open the Lab once to create local lab data, or import a lab
                backup ZIP.
              </p>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Lab data is tied to wallets on this device; only use this backup on your own restores.
            Sharing lab exports between different Bitboard Wallet installs is not supported and may
            confuse balances and owners in the lab.
          </p>
        </div>

        {migrationReportExists ? (
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-start">
            <Button
              type="button"
              variant="outline"
              disabled={exportBusy !== null}
              onClick={() => void exportMigrationReport()}
              className="w-full shrink-0 sm:w-auto"
            >
              <FileWarning className="size-4" aria-hidden />
              Export migration error report
            </Button>
            <p className="text-sm text-muted-foreground sm:min-w-0 sm:flex-1">
              Send this file to app support for diagnosis. Support contact details are in the About
              section (TBD).
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
