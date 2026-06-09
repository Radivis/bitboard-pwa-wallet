import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs/opfs-sqlite-database-names'
import { ensureMigrated, getDatabase } from '@/db/database'
import { useWallets } from '@/db'
import { loadWalletSecretsWithPassword } from '@/db/wallet-persistence'
import { resolveArgon2CiParamsOrThrow } from '@/lib/shared/argon2-ci-env'
import {
  readBlobFromOpfsRootIfExists,
  triggerBrowserSaveLocalBlob,
} from '@/db/opfs/opfs-root-file'
import {
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
  ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION,
  WALLET_BACKUP_SIGNING_SALT_BYTES,
  WALLET_BACKUP_ZIP_FILENAME,
} from '@/lib/wallet/wallet-backup-constants'
import { zipWalletBackupForLocalExport } from '@/lib/settings/zip-wallet-backup-export'
import { useWalletStore } from '@/stores/walletStore'
import { getEncryptionWorker } from '@/workers/encryption-factory'

import type { AppPasswordCompareResult } from '@/components/settings/WalletBackupExportPasswordModal'

function walletBackupSignKdfPhc(): string {
  return resolveArgon2CiParamsOrThrow()
    ? ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI
    : ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION
}

export function useWalletBackupExport() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const { data: wallets } = useWallets()
  const [walletExportBusy, setWalletExportBusy] = useState(false)
  const [exportPasswordOpen, setExportPasswordOpen] = useState(false)

  const walletIdForBackupPasswordCompare = activeWalletId ?? wallets?.[0]?.walletId

  const checkSigningPasswordMatchesAppPassword = useCallback(
    async (password: string): Promise<AppPasswordCompareResult> => {
      if (walletIdForBackupPasswordCompare == null) {
        return { match: false, skipped: true }
      }
      await ensureMigrated()
      try {
        await loadWalletSecretsWithPassword(
          getDatabase(),
          password,
          walletIdForBackupPasswordCompare,
        )
        return { match: true, skipped: false }
      } catch {
        return { match: false, skipped: false }
      }
    },
    [walletIdForBackupPasswordCompare],
  )

  const runSignedWalletExport = useCallback(async (password: string) => {
    setWalletExportBusy(true)
    try {
      const blob = await readBlobFromOpfsRootIfExists(WALLET_SQLITE_OPFS_BASENAME)
      if (!blob) {
        toast.error('Wallet data file was not found in local storage.')
        return
      }
      const sqliteBuf = await blob.arrayBuffer()
      const sqliteBytes = new Uint8Array(sqliteBuf)
      const salt = crypto.getRandomValues(new Uint8Array(WALLET_BACKUP_SIGNING_SALT_BYTES))
      const encryptionWorker = getEncryptionWorker()
      const manifestJson = await encryptionWorker.signWalletBackupManifest(
        sqliteBytes,
        password,
        salt,
        walletBackupSignKdfPhc(),
      )
      const zipped = await zipWalletBackupForLocalExport(blob, manifestJson)
      triggerBrowserSaveLocalBlob(zipped, WALLET_BACKUP_ZIP_FILENAME)
      toast.success('Signed wallet backup exported as a ZIP on this device.')
      setExportPasswordOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setWalletExportBusy(false)
    }
  }, [])

  const exportWallet = useCallback(() => {
    setExportPasswordOpen(true)
  }, [])

  return {
    walletExportBusy,
    exportPasswordOpen,
    setExportPasswordOpen,
    checkSigningPasswordMatchesAppPassword,
    runSignedWalletExport,
    exportWallet,
  }
}
