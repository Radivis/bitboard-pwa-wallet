import { useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useDescriptorWalletSwitchMutation } from '@/hooks/useDescriptorWalletSwitchMutation'
import { useRequireUnlockedWallet } from '@/hooks/useRequireUnlockedWallet'
import { useFeatureStore } from '@/stores/featureStore'
import {
  selectCommittedNetworkMode,
  useWalletStore,
  type NetworkMode,
} from '@/stores/walletStore'

export const MAINNET_ACCESS_REQUIRED_MESSAGE =
  'Activate Mainnet access in Settings → Features before selecting Mainnet.'

export function useNetworkModeSelection(): {
  displayNetworkMode: NetworkMode
  regtestEnabled: boolean
  mainnetSelectionBlocked: boolean
  isSwitching: boolean
  statusLine: string | null
  selectNetwork: (network: NetworkMode) => void
  unlockDialog: ReactNode
} {
  const displayNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isMainnetAccessEnabled = useFeatureStore(
    (featureState) => featureState.isMainnetAccessEnabled,
  )
  const regtestEnabled = useFeatureStore((featureState) => featureState.isRegtestModeEnabled)
  const { runWhenUnlocked, unlockDialog } = useRequireUnlockedWallet()
  const { mutate: switchMutate, isSwitching, statusLine } =
    useDescriptorWalletSwitchMutation('network')

  const mainnetSelectionBlocked = !isMainnetAccessEnabled && displayNetworkMode !== 'mainnet'

  const selectNetwork = useCallback(
    (network: NetworkMode) => {
      if (network === 'mainnet' && mainnetSelectionBlocked) {
        toast.info(MAINNET_ACCESS_REQUIRED_MESSAGE)
        return
      }
      if (network === displayNetworkMode) return
      if (activeWalletId !== null) {
        runWhenUnlocked(() => switchMutate(network))
        return
      }
      switchMutate(network)
    },
    [activeWalletId, displayNetworkMode, mainnetSelectionBlocked, runWhenUnlocked, switchMutate],
  )

  return {
    displayNetworkMode,
    regtestEnabled,
    mainnetSelectionBlocked,
    isSwitching,
    statusLine,
    selectNetwork,
    unlockDialog,
  }
}
