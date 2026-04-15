import { useQuery } from '@tanstack/react-query'
import { ensureMigrated, getDatabase, loadWalletSecretsPayload } from '@/db'
import { findDescriptorWallet } from '@/lib/descriptor-wallet-manager'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { useSessionStore } from '@/stores/sessionStore'
import {
  selectCommittedAccountId,
  selectCommittedAddressType,
  selectCommittedNetworkMode,
  useWalletStore,
} from '@/stores/walletStore'

export const COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY =
  'committed-external-descriptor' as const

/**
 * Loads the external (receiving) output descriptor for the committed sub-wallet
 * from encrypted payload when the session password is available.
 */
export function useCommittedExternalDescriptor() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const committedNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const committedAddressType = useWalletStore(selectCommittedAddressType)
  const committedAccountId = useWalletStore(selectCommittedAccountId)
  const sessionPassword = useSessionStore((s) => s.password)

  const enabled = activeWalletId !== null && sessionPassword !== null

  return useQuery({
    queryKey: [
      COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY,
      activeWalletId,
      committedNetworkMode,
      committedAddressType,
      committedAccountId,
    ],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const password = useSessionStore.getState().password
      const walletId = useWalletStore.getState().activeWalletId
      const networkMode = selectCommittedNetworkMode(useWalletStore.getState())
      const addressType = selectCommittedAddressType(useWalletStore.getState())
      const accountId = selectCommittedAccountId(useWalletStore.getState())

      if (!password || walletId === null) {
        return null
      }

      await ensureMigrated()
      const walletDb = getDatabase()
      const payload = await loadWalletSecretsPayload(walletDb, password, walletId)
      const found = findDescriptorWallet({
        secrets: payload,
        network: toBitcoinNetwork(networkMode),
        addressType,
        accountId,
      })
      return found?.externalDescriptor ?? null
    },
  })
}
