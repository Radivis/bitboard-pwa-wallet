import { toast } from 'sonner'
import type { NetworkMode, AddressType } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { errorMessage } from '@/lib/shared/utils'
import { tryMapWalletSecretsError } from '@/lib/wallet/wallet-secrets-error-messages'
import { isBenignNoActiveWalletError } from '@/lib/shared/wasm-crypto-error'
import {
  updateDescriptorWalletChangeset,
  resolveDescriptorWallet,
} from '@/lib/wallet/descriptor-wallet-manager'
import {
  loadWalletHandlingPersistedChainMismatch,
  syncLoadedDescriptorWalletWithEsplora,
} from '@/lib/wallet/wallet-utils'
import { refreshWalletStoreFromLoadedBdk } from '@/lib/wallet/onchain-bdk-store-sync'
import { invalidateOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import {
  loadingTargetAddressTypeMessage,
  loadingTargetNetworkMessage,
  savingPreviousAddressTypeMessage,
  savingPreviousNetworkMessage,
  syncingTargetNetworkMessage,
  type NetworkSwitchPhaseReporter,
} from '@/lib/settings/network-switch-status-messages'

export type SwitchDescriptorPhaseContext = 'network' | 'addressType'

/**
 * Switch the active descriptor wallet to match the new parameters.
 * Saves the current WASM wallet state, resolves the new descriptor wallet,
 * loads it into WASM, and syncs (non-lab targets only).
 *
 * Contract:
 * - Load phase (resolve + loadWallet + address): on failure, rejects after toast — callers must not commit new network/address in the store.
 * - Sync phase (Esplora): on failure after a successful load, still resolves — callers should commit store so UI matches WASM. Status returns to `unlocked` so the user can use Sync to retry; an error toast explains the failed sync.
 */
export async function switchDescriptorWallet(params: {
  targetNetworkMode: NetworkMode
  targetAddressType: AddressType
  targetAccountId: number
  currentNetworkMode: NetworkMode
  currentAddressType: AddressType
  currentAccountId: number
  /** Settings UI: reflects save → load → sync so long switches are understandable. */
  onPhase?: NetworkSwitchPhaseReporter
  /** Network card vs address-type card copy for phase lines. */
  phaseContext?: SwitchDescriptorPhaseContext
}): Promise<void> {
  const {
    targetNetworkMode,
    targetAddressType,
    targetAccountId,
    currentNetworkMode,
    currentAddressType,
    currentAccountId,
    onPhase,
    phaseContext = 'network',
  } = params
  const { activeWalletId } = useWalletStore.getState()
  const sessionPassword = useSessionStore.getState().password
  if (!activeWalletId || !sessionPassword) {
    throw new Error(
      'Cannot switch descriptor wallet: no active wallet or session',
    )
  }

  const { exportChangeset, loadWallet, getCurrentAddress } =
    useCryptoStore.getState()
  const {
    setWalletStatus,
    setCurrentAddress,
    commitLoadedDescriptorWallet,
    setBalance,
    setTransactions,
    setLastSyncTime,
  } = useWalletStore.getState()

  const isLiveNetworkSwitch =
    phaseContext === 'network' &&
    currentNetworkMode !== targetNetworkMode &&
    currentNetworkMode !== 'lab' &&
    targetNetworkMode !== 'lab'

  try {
    try {
      const currentChangeset = await exportChangeset()
      onPhase?.(
        phaseContext === 'addressType'
          ? savingPreviousAddressTypeMessage(currentAddressType)
          : savingPreviousNetworkMessage(currentNetworkMode),
      )
      await updateDescriptorWalletChangeset({
        password: sessionPassword,
        walletId: activeWalletId,
        network: toBitcoinNetwork(currentNetworkMode),
        addressType: currentAddressType,
        accountId: currentAccountId,
        changesetJson: currentChangeset,
      })
    } catch (err) {
      if (!isBenignNoActiveWalletError(err)) {
        throw err
      }
    }

    onPhase?.(
      phaseContext === 'addressType'
        ? loadingTargetAddressTypeMessage(targetAddressType)
        : loadingTargetNetworkMessage(targetNetworkMode),
    )

    // Drop previous descriptor wallet balance/tx UI so the dashboard never shows another network's totals.
    setCurrentAddress(null)
    setBalance(null)
    setTransactions([])
    setLastSyncTime(null)

    const targetNetwork = toBitcoinNetwork(targetNetworkMode)
    const descriptorWallet = await resolveDescriptorWallet({
      password: sessionPassword,
      walletId: activeWalletId,
      targetNetwork,
      targetAddressType,
      targetAccountId,
    })

    const { usedEmptyChainFallback } =
      await loadWalletHandlingPersistedChainMismatch(loadWallet, {
        externalDescriptor: descriptorWallet.externalDescriptor,
        internalDescriptor: descriptorWallet.internalDescriptor,
        network: targetNetwork,
        changesetJson: descriptorWallet.changeSet,
        useEmptyChain: false,
      })

    const address = await getCurrentAddress()
    setCurrentAddress(address)
    commitLoadedDescriptorWallet({
      networkMode: targetNetworkMode,
      addressType: targetAddressType,
      accountId: targetAccountId,
    })

    if (targetNetworkMode !== 'lab') {
      await refreshWalletStoreFromLoadedBdk()
      // Stale-banner query caches per descriptor wallet persisted `lastSuccessfulEsploraSyncAt`.
      // After switch we cleared lastSyncTime and repopulated balance/txs from BDK; invalidate
      // so the dashboard refetches metadata for the new descriptor wallet before Esplora sync runs.
      invalidateOnchainDashboardQueries()
    }

    if (targetNetworkMode !== 'lab') {
      onPhase?.(syncingTargetNetworkMessage(targetNetworkMode))
      setWalletStatus('syncing')
      const fullScanNeeded =
        isLiveNetworkSwitch ||
        !descriptorWallet.fullScanDone ||
        usedEmptyChainFallback
      await syncLoadedDescriptorWalletWithEsplora({
        networkMode: targetNetworkMode,
        activeWalletId,
        sessionPassword,
        targetNetwork,
        targetAddressType,
        targetAccountId,
        fullScanNeeded,
      })
      // Always return to `unlocked` so dashboard Sync/UX is usable. On `syncFailed`,
      // an error toast was shown; chain data in WASM may still be stale.
      setWalletStatus('unlocked')
    } else {
      setWalletStatus('unlocked')
    }
  } catch (err) {
    const message = toUserFriendlySwitchError(err)
    const detail = errorMessage(err)
    toast.error(
      message === 'Failed to switch descriptor wallet'
        ? `${message}: ${detail}`
        : message,
    )
    throw err
  }
}

export function toUserFriendlySwitchError(err: unknown): string {
  return tryMapWalletSecretsError(err) ?? 'Failed to switch descriptor wallet'
}
