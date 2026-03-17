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
import { syncActiveWalletAndUpdateState } from '@/lib/wallet-utils'

/**
 * Switch the active descriptor wallet to match the new parameters.
 * Saves the current WASM wallet state, resolves the new descriptor wallet,
 * loads it into WASM, and syncs.
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
  if (!activeWalletId || !sessionPassword) return

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
      try {
        await syncActiveWalletAndUpdateState(targetNetworkMode)
      } catch (syncErr) {
        const detail = errorMessage(syncErr)
        toast.error(`Sync failed after switching: ${detail}`)
      }
    }
    setWalletStatus('unlocked')
    toast.success(`${targetSubWalletLabel} sub-wallet loaded`)
  } catch (err) {
    const message = toUserFriendlySwitchError(err)
    const detail = errorMessage(err)
    toast.error(message === 'Failed to switch descriptor wallet' ? `${message}: ${detail}` : message)
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
