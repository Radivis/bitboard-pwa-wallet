import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs/opfs-sqlite-database-names'
import { destroyDatabase, ensureMigrated, getDatabase } from '@/db/database'
import { anyWalletHasNoMnemonicBackupFlag } from '@/db/wallet-no-mnemonic-backup'
import { BackupZipInvalidError } from '@/lib/shared/backup-zip-invalid-error'
import { replaceOpfsSqliteAfterDestroy } from '@/db/opfs/opfs-sqlite-replace-and-reload'
import { parseWalletBackupZipFile } from '@/lib/wallet/wallet-backup-import'
import { WALLET_BACKUP_IMPORT_MAX_VERIFY_ATTEMPTS } from '@/lib/wallet/wallet-backup-constants'
import { getEncryptionWorker } from '@/workers/encryption-factory'

function walletBackupImportVerifyAttemptsRemaining(failureCount: number): number {
  return WALLET_BACKUP_IMPORT_MAX_VERIFY_ATTEMPTS - failureCount
}

export function useWalletBackupImport() {
  const [importWipeOpen, setImportWipeOpen] = useState(false)
  const [importPasswordOpen, setImportPasswordOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [pendingImport, setPendingImport] = useState<{
    sqliteBytes: Uint8Array
    manifestJson: string
  } | null>(null)
  const [, setImportVerificationFailureCount] = useState(0)
  const [importBypassModalOpen, setImportBypassModalOpen] = useState(false)
  const [importVerifyInlineMessage, setImportVerifyInlineMessage] = useState<string | null>(null)
  const [importPasswordResetKey, setImportPasswordResetKey] = useState(0)
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const resetImportVerificationUi = useCallback(() => {
    setImportVerificationFailureCount(0)
    setImportVerifyInlineMessage(null)
    setImportPasswordResetKey(0)
  }, [])

  const resetWalletImportUiState = useCallback(
    (options?: { keepPendingImport?: boolean; keepWipeOpen?: boolean }) => {
      if (!options?.keepPendingImport) {
        setPendingImport(null)
      }
      if (!options?.keepWipeOpen) {
        setImportWipeOpen(false)
      }
      setImportPasswordOpen(false)
      setImportBypassModalOpen(false)
      resetImportVerificationUi()
    },
    [resetImportVerificationUi],
  )

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
          'Import blocked: back up every wallet seed phrase in Wallet Management before importing wallet data.',
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
    resetWalletImportUiState()
  }, [resetWalletImportUiState])

  const confirmWipeImport = useCallback(() => {
    setImportWipeOpen(false)
    resetImportVerificationUi()
    setImportPasswordOpen(true)
  }, [resetImportVerificationUi])

  const clearWalletImportUiState = useCallback(() => {
    resetWalletImportUiState({ keepWipeOpen: true })
  }, [resetWalletImportUiState])

  const applyWalletBackupReplace = useCallback(
    async (sqliteBytes: Uint8Array) => {
      await replaceOpfsSqliteAfterDestroy({
        opfsBasename: WALLET_SQLITE_OPFS_BASENAME,
        sqliteBytes,
        destroyDatabase,
        ensureMigrated,
        successToastMessage: 'Wallet backup imported. Reloading…',
        onBeforeReload: clearWalletImportUiState,
      })
    },
    [clearWalletImportUiState],
  )

  const runVerifiedImport = useCallback(
    async (password: string) => {
      if (!pendingImport) return
      setImportBusy(true)
      setImportVerifyInlineMessage(null)
      try {
        const encryptionWorker = getEncryptionWorker()
        await encryptionWorker.verifyWalletBackupManifest(
          pendingImport.sqliteBytes,
          password,
          pendingImport.manifestJson,
        )
        await applyWalletBackupReplace(pendingImport.sqliteBytes)
      } catch {
        setImportVerificationFailureCount((prev) => {
          const next = prev + 1
          if (next >= WALLET_BACKUP_IMPORT_MAX_VERIFY_ATTEMPTS) {
            setImportPasswordOpen(false)
            setImportBypassModalOpen(true)
          } else {
            setImportVerifyInlineMessage(
              `Verification failed. ${walletBackupImportVerifyAttemptsRemaining(next)} attempt(s) remaining.`,
            )
            setImportPasswordResetKey((k) => k + 1)
          }
          return next
        })
      } finally {
        setImportBusy(false)
      }
    },
    [pendingImport, applyWalletBackupReplace],
  )

  const runUnverifiedWalletBackupImport = useCallback(async () => {
    const snapshot = pendingImport
    if (!snapshot) return
    // Commit busy state before any await so the bypass modal blocks dismiss and we do not
    // interleave with other UI work that might touch the DB (same as verified import path).
    flushSync(() => {
      setImportBusy(true)
    })
    try {
      await applyWalletBackupReplace(snapshot.sqliteBytes)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setImportBusy(false)
    }
  }, [pendingImport, applyWalletBackupReplace])

  const abortWalletBackupImportBypass = useCallback(() => {
    setImportBypassModalOpen(false)
    setPendingImport(null)
    resetImportVerificationUi()
  }, [resetImportVerificationUi])

  return {
    importWipeOpen,
    importPasswordOpen,
    setImportPasswordOpen,
    importBusy,
    importFileInputRef,
    onImportFilePick,
    cancelImportFlow,
    confirmWipeImport,
    runVerifiedImport,
    runUnverifiedWalletBackupImport,
    abortWalletBackupImportBypass,
    importBypassModalOpen,
    importVerifyInlineMessage,
    importPasswordResetKey,
  }
}
