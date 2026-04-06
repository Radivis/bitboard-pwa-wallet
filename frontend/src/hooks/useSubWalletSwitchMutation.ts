import { useCallback, useMemo, useState } from 'react'
import { useMutation, useIsFetching } from '@tanstack/react-query'
import type { AddressType, NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { executeSettingsNetworkSwitch } from '@/lib/network-mode-switch'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'
import { ACTIVE_WALLET_LOAD_QUERY_ROOT } from '@/lib/wallet-load-query-keys'
import {
  DEFAULT_SWITCHING_ADDRESS_TYPE_STATUS_LINE,
  DEFAULT_SWITCHING_NETWORK_STATUS_LINE,
  LOADING_WALLET_FOR_SWITCH_STATUS_LINE,
} from '@/lib/network-switch-status-messages'

export type SubWalletSwitchContext = 'network' | 'addressType'

export function useSubWalletSwitchMutation(
  switchContext: 'network',
): {
  mutate: (target: NetworkMode) => void
  isPending: boolean
  loading: boolean
  statusLine: string | null
}
export function useSubWalletSwitchMutation(
  switchContext: 'addressType',
): {
  mutate: (target: AddressType) => void
  isPending: boolean
  loading: boolean
  statusLine: string | null
}
export function useSubWalletSwitchMutation(switchContext: SubWalletSwitchContext) {
  const [switchPhaseMessage, setSwitchPhaseMessage] = useState<string | null>(
    null,
  )

  const bootstrapFetchingRaw =
    useIsFetching({ queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] }) > 0

  const runSwitch = useCallback(
    async (target: NetworkMode | AddressType) => {
      const onPhase = (message: string) => {
        setSwitchPhaseMessage(message)
      }
      try {
        if (switchContext === 'network') {
          await executeSettingsNetworkSwitch({
            targetNetwork: target as NetworkMode,
            onPhase,
          })
        } else {
          const { networkMode, accountId, addressType: currentAddressType } =
            useWalletStore.getState()
          await switchDescriptorWallet({
            targetNetworkMode: networkMode,
            targetAddressType: target as AddressType,
            targetAccountId: accountId,
            currentNetworkMode: networkMode,
            currentAddressType,
            currentAccountId: accountId,
            phaseContext: 'addressType',
            onPhase,
          })
        }
      } finally {
        setSwitchPhaseMessage(null)
      }
    },
    [switchContext],
  )

  const mutation = useMutation({
    mutationFn: runSwitch,
  })

  const loading =
    switchContext === 'network'
      ? bootstrapFetchingRaw || mutation.isPending
      : mutation.isPending

  const statusLine = useMemo(() => {
    if (switchContext === 'network') {
      if (bootstrapFetchingRaw) return LOADING_WALLET_FOR_SWITCH_STATUS_LINE
      if (mutation.isPending) {
        return switchPhaseMessage ?? DEFAULT_SWITCHING_NETWORK_STATUS_LINE
      }
      return null
    }
    if (mutation.isPending) {
      return switchPhaseMessage ?? DEFAULT_SWITCHING_ADDRESS_TYPE_STATUS_LINE
    }
    return null
  }, [
    switchContext,
    bootstrapFetchingRaw,
    mutation.isPending,
    switchPhaseMessage,
  ])

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    loading,
    statusLine,
  }
}
