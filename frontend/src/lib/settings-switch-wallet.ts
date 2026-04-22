import { toast } from 'sonner'
import type { NetworkMode, AddressType } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { errorMessage } from '@/lib/utils'
import {
  updateDescriptorWalletChangeset,
  resolveDescriptorWallet,
} from '@/lib/descriptor-wallet-manager'
import {
  loadWalletHandlingPersistedChainMismatch,
  syncLoadedSubWalletWithEsplora,
} from '@/lib/wallet-utils'
import {
  loadingTargetAddressTypeMessage,
  loadingTargetNetworkMessage,
  savingPreviousAddressTypeMessage,
  savingPreviousNetworkMessage,
  syncingTargetNetworkMessage,
  type NetworkSwitchPhaseReporter,
} from '@/lib/network-switch-status-messages'

/** WASM when no wallet is loaded in the worker — persisting previous state is not applicable. */
const NO_ACTIVE_WALLET_IN_WASM =
  'No active wallet. Call create_wallet or load_wallet first.'

function isBenignNoWalletLoadedForPersistError(err: unknown): boolean {
  return errorMessage(err).includes(NO_ACTIVE_WALLET_IN_WASM)
}

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
  const { setWalletStatus, setCurrentAddress, commitLoadedSubWallet } =
    useWalletStore.getState()

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
      if (!isBenignNoWalletLoadedForPersistError(err)) {
        throw err
      }
    }

    onPhase?.(
      phaseContext === 'addressType'
        ? loadingTargetAddressTypeMessage(targetAddressType)
        : loadingTargetNetworkMessage(targetNetworkMode),
    )

    const targetNetwork = toBitcoinNetwork(targetNetworkMode)
    const descriptorWallet = await resolveDescriptorWallet({
      password: sessionPassword,
      walletId: activeWalletId,
      targetNetwork,
      targetAddressType,
      targetAccountId,
    })

    const useEmptyChain = targetNetwork === 'testnet'
    await loadWalletHandlingPersistedChainMismatch(loadWallet, {
      externalDescriptor: descriptorWallet.externalDescriptor,
      internalDescriptor: descriptorWallet.internalDescriptor,
      network: targetNetwork,
      changesetJson: descriptorWallet.changeSet,
      useEmptyChain,
    })

    const address = await getCurrentAddress()
    setCurrentAddress(address)
    commitLoadedSubWallet({
      networkMode: targetNetworkMode,
      addressType: targetAddressType,
      accountId: targetAccountId,
    })

    if (targetNetworkMode !== 'lab') {
      onPhase?.(syncingTargetNetworkMessage(targetNetworkMode))
      setWalletStatus('syncing')
      const fullScanNeeded = !descriptorWallet.fullScanDone
      await syncLoadedSubWalletWithEsplora({
        networkMode: targetNetworkMode,
        activeWalletId,
        sessionPassword,
        targetNetwork,
        targetAddressType,
        targetAccountId,
        fullScanNeeded,
      })
      // Always return to `unlocked` so dashboard Sync/UX is usable. On `sync_failed`,
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
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  if (
    msg.includes('password') ||
    msg.includes('decrypt') ||
    msg.includes('incorrect') ||
    msg.includes('corrupted')
  ) {
    return 'Wrong password or corrupted wallet data'
  }
  if (msg.includes('secrets') && msg.includes('not found')) {
    return 'Wallet data not found'
  }
  return 'Failed to switch descriptor wallet'
}
