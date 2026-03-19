import { toast } from 'sonner'
import {
  getSubWalletLabel,
  type NetworkMode,
  type AddressType,
} from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { errorMessage } from '@/lib/utils'
import {
  updateDescriptorWalletChangeset,
  resolveDescriptorWallet,
} from '@/lib/descriptor-wallet-manager'
import { syncLoadedSubWalletWithEsplora } from '@/lib/wallet-utils'

/**
 * Switch the active descriptor wallet to match the new parameters.
 * Saves the current WASM wallet state, resolves the new descriptor wallet,
 * loads it into WASM, and syncs (non-lab targets only).
 *
 * Contract:
 * - Load phase (resolve + loadWallet + address): on failure, rejects after toast — callers must not commit new network/address in the store.
 * - Sync phase (Esplora): on failure after a successful load, still resolves — callers should commit store so UI matches WASM; wallet stays `syncing` until the user retries or fixes network.
 */
export async function switchDescriptorWallet(
  targetNetworkMode: NetworkMode,
  targetAddressType: AddressType,
  targetAccountId: number,
  currentNetworkMode: NetworkMode,
  currentAddressType: AddressType,
  currentAccountId: number,
): Promise<void> {
  const { activeWalletId } = useWalletStore.getState()
  const sessionPassword = useSessionStore.getState().password
  if (!activeWalletId || !sessionPassword) {
    throw new Error(
      'Cannot switch descriptor wallet: no active wallet or session',
    )
  }

  const { exportChangeset, loadWallet, getCurrentAddress } =
    useCryptoStore.getState()
  const { setWalletStatus, setCurrentAddress } = useWalletStore.getState()

  const previousSubWalletLabel = getSubWalletLabel(
    currentNetworkMode,
    currentAddressType,
  )
  const targetSubWalletLabel = getSubWalletLabel(
    targetNetworkMode,
    targetAddressType,
  )

  try {
    toast.info(`Unloading ${previousSubWalletLabel} sub-wallet`)
    try {
      const currentChangeset = await exportChangeset()
      await updateDescriptorWalletChangeset(
        sessionPassword,
        activeWalletId,
        toBitcoinNetwork(currentNetworkMode),
        currentAddressType,
        currentAccountId,
        currentChangeset,
      )
      toast.success(`${previousSubWalletLabel} sub-wallet unloaded`)
    } catch {
      // No active WASM wallet yet (e.g., first load) -- safe to skip
    }

    toast.info(`Loading ${targetSubWalletLabel} sub-wallet`)
    const targetNetwork = toBitcoinNetwork(targetNetworkMode)
    const descriptorWallet = await resolveDescriptorWallet(
      sessionPassword,
      activeWalletId,
      targetNetwork,
      targetAddressType,
      targetAccountId,
    )

    const useEmptyChain = targetNetwork === 'testnet'
    await loadWallet(
      descriptorWallet.externalDescriptor,
      descriptorWallet.internalDescriptor,
      targetNetwork,
      descriptorWallet.changeSet,
      useEmptyChain,
    )

    const address = await getCurrentAddress()
    setCurrentAddress(address)

    if (targetNetworkMode !== 'lab') {
      setWalletStatus('syncing')
      const fullScanNeeded = descriptorWallet.fullScanDone !== true
      const syncResult = await syncLoadedSubWalletWithEsplora({
        networkMode: targetNetworkMode,
        activeWalletId,
        sessionPassword,
        targetNetwork,
        targetAddressType,
        targetAccountId,
        fullScanNeeded,
      })
      if (syncResult === 'completed') {
        setWalletStatus('unlocked')
        toast.success(`${targetSubWalletLabel} sub-wallet loaded`)
      }
      // On `sync_failed`, keep `syncing` — load succeeded but chain data may be stale.
    } else {
      setWalletStatus('unlocked')
      toast.success(`${targetSubWalletLabel} sub-wallet loaded`)
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
