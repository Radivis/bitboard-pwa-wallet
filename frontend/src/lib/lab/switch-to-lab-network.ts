import { toast } from 'sonner'
import {
  useWalletStore,
  type AddressType,
  type NetworkMode,
  type WalletStatus,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import { withWalletWriterLock } from '@/lib/shared/opfs-writer-lock'
import {
  awaitOnchainQuiescenceBeforeDescriptorMutation,
  exportChangesetForPersistence,
  shouldSkipOutgoingDescriptorSaveOnSyncError,
} from '@/lib/wallet/lifecycle/onchain-descriptor-mutation-guard'
import { loadDescriptorWalletWithoutSync } from '@/lib/wallet/wallet-utils'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { terminateLabWorker } from '@/workers/lab-factory'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { prefetchLabChainState } from '@/hooks/useLabChainStateQuery'
import { errorMessage } from '@/lib/shared/utils'
import {
  loadingTargetNetworkMessage,
  savingPreviousNetworkMessage,
  type NetworkSwitchPhaseReporter,
} from '@/lib/settings/network-switch-status-messages'

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
  onPhase?: NetworkSwitchPhaseReporter
}): Promise<void> {
  const { walletStatus, previousNetworkMode, addressType, accountId, onPhase } =
    params
  if (!walletIsUnlockedOrSyncing(walletStatus)) return

  const activeWalletId = useWalletStore.getState().activeWalletId
  if (!activeWalletId) return

  try {
    await awaitOnchainQuiescenceBeforeDescriptorMutation()

    await withWalletWriterLock(async () => {
      if (!shouldSkipOutgoingDescriptorSaveOnSyncError()) {
        try {
          const currentChangeset = await exportChangesetForPersistence()
          onPhase?.(savingPreviousNetworkMessage(previousNetworkMode))
          await updateDescriptorWalletChangeset({
            walletId: activeWalletId,
            network: toBitcoinNetwork(previousNetworkMode),
            addressType,
            accountId,
            changesetJson: currentChangeset,
          })
        } catch {
          // No active WASM wallet yet (e.g., first load) -- safe to skip
        }
      }

      onPhase?.(loadingTargetNetworkMessage('lab'))

      await loadDescriptorWalletWithoutSync({
        walletId: activeWalletId,
        networkMode: 'lab',
        addressType,
        accountId,
      })
    })
  } catch {
    // Quiescence or load failed without active WASM wallet — safe to skip persist
  }
}

export type SwitchToLabNetworkParams = {
  previousNetworkMode: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
  onPhase?: NetworkSwitchPhaseReporter
}

/**
 * Tear down any lab worker, optionally sync wallet state into lab mode, warm
 * chain state for queries, then set network to lab. Returns whether the switch
 * completed successfully (network is lab in store).
 */
export async function switchToLabNetwork(
  params: SwitchToLabNetworkParams,
): Promise<boolean> {
  const { previousNetworkMode, walletStatus, addressType, accountId, onPhase } =
    params
  try {
    terminateLabWorker()
    await persistAndLoadLabWalletIfUnlockedOrSyncing({
      walletStatus,
      previousNetworkMode,
      addressType,
      accountId,
      onPhase,
    })
    await prefetchLabChainState(appQueryClient)
    if (!walletIsUnlockedOrSyncing(walletStatus)) {
      useWalletStore.getState().setNetworkMode('lab')
    }
    return true
  } catch (err) {
    toast.error(errorMessage(err) || 'Failed to start lab')
    return false
  }
}
