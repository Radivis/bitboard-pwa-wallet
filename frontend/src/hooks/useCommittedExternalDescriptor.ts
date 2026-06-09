import { useQuery } from '@tanstack/react-query'
import { ensureMigrated, getDatabase, loadWalletSecretsPayload } from '@/db'
import { findDescriptorWallet } from '@/lib/wallet/descriptor-wallet-manager'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import {
  selectCommittedAccountId,
  selectCommittedAddressType,
  selectCommittedNetworkMode,
  useWalletStore,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

export const COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY =
  'committed-external-descriptor' as const

/**
 * Loads the external (receiving) output descriptor for the committed descriptor wallet
 * from encrypted payload when the session password is available.
 */
export function useCommittedExternalDescriptor() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const committedNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const committedAddressType = useWalletStore(selectCommittedAddressType)
  const committedAccountId = useWalletStore(selectCommittedAccountId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)

  const enabled = activeWalletId !== null && walletIsUnlockedOrSyncing(walletStatus)

  return useQuery({
    queryKey: [
      ...WALLET_DB_QUERY_KEY_ROOT,
      COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY,
      activeWalletId,
      committedNetworkMode,
      committedAddressType,
      committedAccountId,
    ],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const walletId = useWalletStore.getState().activeWalletId
      const networkMode = selectCommittedNetworkMode(useWalletStore.getState())
      const addressType = selectCommittedAddressType(useWalletStore.getState())
      const accountId = selectCommittedAccountId(useWalletStore.getState())

      if (walletId === null) {
        return null
      }

      await ensureMigrated()
      const walletDb = getDatabase()
      const payload = await loadWalletSecretsPayload(walletDb, walletId)
      const found = findDescriptorWallet({
        secretsPayload: payload,
        network: toBitcoinNetwork(networkMode),
        addressType,
        accountId,
      })
      return found?.externalDescriptor ?? null
    },
  })
}
