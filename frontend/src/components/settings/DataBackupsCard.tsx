import { Database, FlaskConical, FileWarning, Upload } from 'lucide-react'
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
import { WalletBackupImportBypassModal } from '@/components/settings/WalletBackupImportBypassModal'
import { WalletBackupImportPasswordModal } from '@/components/settings/WalletBackupImportPasswordModal'
import { useDataBackupsCard } from '@/components/settings/use-data-backups-card'

export function DataBackupsCard() {
  const {
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
    runUnverifiedWalletBackupImport,
    abortWalletBackupImportBypass,
    checkSigningPasswordMatchesAppPassword,
    importBypassModalOpen,
    importVerifyInlineMessage,
    importPasswordResetKey,
    onLabImportFilePick,
    cancelLabImportFlow,
    runLabImportAfterWipeConfirm,
    anyImportBusy,
  } = useDataBackupsCard()

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
        checkSigningPasswordMatchesAppPassword={checkSigningPasswordMatchesAppPassword}
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
        message="This replaces the lab database on this device with the SQLite file from the ZIP. Lab backups are not signed—only continue if you trust this file. All current lab data on this device will be lost. The page will reload after import."
        confirmText="Continue"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => {
          void runLabImportAfterWipeConfirm()
        }}
        onCancel={cancelLabImportFlow}
      />
      <WalletBackupImportBypassModal
        open={importBypassModalOpen}
        onOpenChange={(open) => {
          if (!open) abortWalletBackupImportBypass()
        }}
        onAbort={abortWalletBackupImportBypass}
        onProceedAnyway={runUnverifiedWalletBackupImport}
        isBusy={importBusy}
      />
      <WalletBackupImportPasswordModal
        open={importPasswordOpen}
        onOpenChange={setImportPasswordOpen}
        onCancel={cancelImportFlow}
        onConfirm={runVerifiedImport}
        isBusy={importBusy}
        verificationError={importVerifyInlineMessage}
        passwordResetKey={importPasswordResetKey}
      />
      <CardHeader>
        <CardTitle>Data Backups</CardTitle>
        <CardDescription>
          Export full local database files from this device as ZIP archives. Wallet exports are
          signed with a password you choose (ML-DSA); the export dialog warns if it differs from your
          app password. Wallet import verifies the manifest by default; after repeated failures you
          can choose to import without verification. Lab exports are a single SQLite file in a ZIP
          with no cryptographic authentication—only import lab ZIPs you trust. Nothing is uploaded.
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
              Send this file to the project maintainer for diagnosis when your deployment lists
              contact details under Settings → Developer contact.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
