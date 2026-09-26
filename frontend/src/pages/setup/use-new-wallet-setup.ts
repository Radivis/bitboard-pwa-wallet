import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAddWallet, useWallets } from '@/db'
import {
  persistAndActivateNewWallet,
  prepareNewWalletEncryption,
  type PersistAndActivateNewWalletParams,
} from '@/lib/wallet/new-wallet'
import { useWalletStore } from '@/stores/walletStore'

type PersistNewWalletInput = Pick<
  PersistAndActivateNewWalletParams,
  'encryptedBlobs' | 'firstAddress' | 'markNoMnemonicBackup'
>

/** Closes over the wallet list, insert mutation, and query cache shared by create and import. */
export function usePersistAndActivateNewWallet() {
  const { data: wallets } = useWallets()
  const addWallet = useAddWallet()
  const queryClient = useQueryClient()

  return useCallback(
    (newWallet: PersistNewWalletInput) =>
      persistAndActivateNewWallet({
        ...newWallet,
        existingWalletNames: (wallets ?? []).map((wallet) => wallet.name),
        insertWalletRow: (walletRow) =>
          addWallet.mutateAsync({
            name: walletRow.name,
            created_at: walletRow.createdAt,
          }),
        queryClient,
      }),
    [addWallet, queryClient, wallets],
  )
}

/** Network, address type, and account used to encrypt a wallet that is about to be added. */
export function usePrepareNewWalletEncryption() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const accountId = useWalletStore((walletState) => walletState.accountId)

  return useCallback(
    async (appPassword?: string) => {
      const network = await prepareNewWalletEncryption(appPassword, networkMode)
      return { network, addressType, accountId }
    },
    [accountId, addressType, networkMode],
  )
}

export function toastNewWalletFlowError(err: unknown, fallbackMessage: string): void {
  toast.error(err instanceof Error ? err.message : fallbackMessage)
}

export function completeNewWalletSetup(
  navigate: (options: { to: '/wallet' }) => unknown,
  successMessage: string,
): void {
  toast.success(successMessage)
  void navigate({ to: '/wallet' })
}
