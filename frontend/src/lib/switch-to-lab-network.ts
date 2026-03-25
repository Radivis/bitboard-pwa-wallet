import { toast } from 'sonner'
import {
  useWalletStore,
  type AddressType,
  type NetworkMode,
  type WalletStatus,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet-unlocked-status'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { updateDescriptorWalletChangeset } from '@/lib/descriptor-wallet-manager'
import { loadDescriptorWalletWithoutSync } from '@/lib/wallet-utils'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { terminateLabWorker } from '@/workers/lab-factory'
import { appQueryClient } from '@/lib/app-query-client'
import { prefetchLabChainState } from '@/hooks/useLabChainStateQuery'
import { errorMessage } from '@/lib/utils'

/**
 * When switching *to* lab with an active WASM wallet: persist the current
 * network’s descriptor wallet state to storage, then load the lab wallet in
 * memory without starting sync. Skipped when there is no session password /
 * active wallet, or when export/update fails (e.g. wallet not initialized yet).
 */
async function persistAndLoadLabWalletIfUnlockedOrSyncing(params: {
  walletStatus: WalletStatus
  previousNetworkMode: NetworkMode
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const { walletStatus, previousNetworkMode, addressType, accountId } = params
  if (!walletIsUnlockedOrSyncing(walletStatus)) return

  const sessionPassword = useSessionStore.getState().password
  const activeWalletId = useWalletStore.getState().activeWalletId
  if (!sessionPassword || !activeWalletId) return

  const { exportChangeset } = useCryptoStore.getState()
  try {
    const currentChangeset = await exportChangeset()
    await updateDescriptorWalletChangeset({
      password: sessionPassword,
      walletId: activeWalletId,
      network: toBitcoinNetwork(previousNetworkMode),
      addressType,
      accountId,
      changesetJson: currentChangeset,
    })
  } catch {
    // No active WASM wallet yet (e.g., first load) -- safe to skip
  }

  await loadDescriptorWalletWithoutSync({
    password: sessionPassword,
    walletId: activeWalletId,
    networkMode: 'lab',
    addressType,
    accountId,
  })
}

export type SwitchToLabNetworkParams = {
  setSwitching: (value: boolean) => void
  setNetworkMode: (mode: NetworkMode) => void
  previousNetworkMode: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
}

/**
 * Tear down any lab worker, optionally sync wallet state into lab mode, warm
 * chain state for queries, then set network to lab. Returns whether the switch
 * completed successfully (network is lab in store).
 */
export async function switchToLabNetwork(
  params: SwitchToLabNetworkParams,
): Promise<boolean> {
  const {
    setSwitching,
    setNetworkMode,
    previousNetworkMode,
    walletStatus,
    addressType,
    accountId,
  } = params
  setSwitching(true)
  try {
    terminateLabWorker()
    await persistAndLoadLabWalletIfUnlockedOrSyncing({
      walletStatus,
      previousNetworkMode,
      addressType,
      accountId,
    })
    await prefetchLabChainState(appQueryClient)
    setNetworkMode('lab')
    return true
  } catch (err) {
    toast.error(errorMessage(err) || 'Failed to start lab')
    return false
  } finally {
    setSwitching(false)
  }
}
