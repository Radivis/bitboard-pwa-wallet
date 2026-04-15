import {
  useWalletStore,
  getCommittedAddressType,
  type AddressType,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet-unlocked-status'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'
import type { NetworkSwitchPhaseReporter } from '@/lib/network-switch-status-messages'

export type ExecuteSettingsAddressTypeSwitchParams = {
  targetAddressType: AddressType
  onPhase?: NetworkSwitchPhaseReporter
}

/**
 * Settings / migrations: switch committed address type, or persist preference when the wallet is locked.
 * Matches {@link useSubWalletSwitchMutation} for `'addressType'`.
 */
export async function executeSettingsAddressTypeSwitch(
  params: ExecuteSettingsAddressTypeSwitchParams,
): Promise<void> {
  const { targetAddressType, onPhase } = params
  if (targetAddressType === getCommittedAddressType()) return

  const { walletStatus, networkMode, accountId, addressType: currentAddressType } =
    useWalletStore.getState()

  if (walletIsUnlockedOrSyncing(walletStatus)) {
    await switchDescriptorWallet({
      targetNetworkMode: networkMode,
      targetAddressType,
      targetAccountId: accountId,
      currentNetworkMode: networkMode,
      currentAddressType,
      currentAccountId: accountId,
      phaseContext: 'addressType',
      onPhase,
    })
    return
  }

  useWalletStore.getState().setAddressType(targetAddressType)
}
