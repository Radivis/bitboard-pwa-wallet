import {
  useWalletStore,
  getCommittedNetworkMode,
  type AddressType,
  type NetworkMode,
  type WalletStatus,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { switchDescriptorWallet } from '@/lib/wallet/settings-switch-wallet'
import { terminateLabWorker } from '@/workers/lab-factory'
import {
  closeArkadeSession,
  refreshArkadeSessionAfterNetworkSwitch,
} from '@/lib/arkade/arkade-session-service'
import { switchToLabNetwork } from '@/lib/lab/switch-to-lab-network'
import type { NetworkSwitchPhaseReporter } from '@/lib/settings/network-switch-status-messages'
import { useSessionStore } from '@/stores/sessionStore'

async function switchDescriptorWalletWhileUnlockedOrSyncing(params: {
  targetNetwork: NetworkMode
  previousNetwork: NetworkMode
  addressType: AddressType
  accountId: number
  afterDescriptorSwitch?: () => void | Promise<void>
  onPhase?: NetworkSwitchPhaseReporter
}): Promise<void> {
  const {
    targetNetwork,
    previousNetwork,
    addressType,
    accountId,
    afterDescriptorSwitch,
    onPhase,
  } = params
  await switchDescriptorWallet({
    targetNetworkMode: targetNetwork,
    targetAddressType: addressType,
    targetAccountId: accountId,
    currentNetworkMode: previousNetwork,
    currentAddressType: addressType,
    currentAccountId: accountId,
    onPhase,
  })
  await afterDescriptorSwitch?.()
}

async function switchFromLabNetwork(params: {
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
  onPhase?: NetworkSwitchPhaseReporter
}): Promise<void> {
  const {
    setNetworkMode,
    targetNetwork,
    walletStatus,
    addressType,
    accountId,
    onPhase,
  } = params
  if (walletIsUnlockedOrSyncing(walletStatus)) {
    await switchDescriptorWalletWhileUnlockedOrSyncing({
      targetNetwork,
      previousNetwork: 'lab',
      addressType,
      accountId,
      onPhase,
      afterDescriptorSwitch: () => {
        terminateLabWorker()
      },
    })
    return
  }

  terminateLabWorker()
  setNetworkMode(targetNetwork)
}

async function switchBetweenLiveNetworks(params: {
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  previousNetwork: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
  onPhase?: NetworkSwitchPhaseReporter
}): Promise<void> {
  const {
    setNetworkMode,
    targetNetwork,
    previousNetwork,
    walletStatus,
    addressType,
    accountId,
    onPhase,
  } = params
  if (!walletIsUnlockedOrSyncing(walletStatus)) {
    setNetworkMode(targetNetwork)
    return
  }

  await switchDescriptorWalletWhileUnlockedOrSyncing({
    targetNetwork,
    previousNetwork,
    addressType,
    accountId,
    onPhase,
  })
}

export type ExecuteSettingsNetworkSwitchParams = {
  targetNetwork: NetworkMode
  onPhase?: NetworkSwitchPhaseReporter
}

/**
 * Settings network buttons: lab ↔ live routing, phase lines, and locked-wallet shortcuts.
 */
export async function executeSettingsNetworkSwitch(
  params: ExecuteSettingsNetworkSwitchParams,
): Promise<void> {
  const { targetNetwork, onPhase } = params
  const setNetworkMode = useWalletStore.getState().setNetworkMode
  const currentMode = getCommittedNetworkMode()
  const { walletStatus, addressType, accountId } = useWalletStore.getState()

  if (targetNetwork === currentMode) return

  const previousNetworkMode = currentMode

  // Close before descriptor switch commits networkMode — otherwise Arkade queries race open/close.
  if (targetNetwork !== 'lab' || previousNetworkMode !== 'lab') {
    await closeArkadeSession()
  }

  if (targetNetwork === 'lab') {
    await switchToLabNetwork({
      previousNetworkMode,
      walletStatus,
      addressType,
      accountId,
      onPhase,
    })
    return
  }

  if (previousNetworkMode === 'lab') {
    await switchFromLabNetwork({
      setNetworkMode,
      targetNetwork,
      walletStatus,
      addressType,
      accountId,
      onPhase,
    })
  } else {
    await switchBetweenLiveNetworks({
      setNetworkMode,
      targetNetwork,
      previousNetwork: previousNetworkMode,
      walletStatus,
      addressType,
      accountId,
      onPhase,
    })
  }

  const sessionPassword = useSessionStore.getState().password
  const activeWalletId = useWalletStore.getState().activeWalletId
  await refreshArkadeSessionAfterNetworkSwitch({
    password: sessionPassword,
    walletId: activeWalletId,
    networkMode: targetNetwork,
  })
}
