import { useCallback, useMemo, useState } from 'react'
import { useMutation, useIsFetching } from '@tanstack/react-query'
import type { AddressType, NetworkMode } from '@/stores/walletStore'
import { executeSettingsNetworkSwitch } from '@/lib/settings/network-mode-switch'
import { executeSettingsAddressTypeSwitch } from '@/lib/settings/execute-settings-address-type-switch'
import { activeWalletLoadQueryKeyPrefix } from '@/lib/wallet/wallet-load-query-keys'
import {
  DEFAULT_SWITCHING_ADDRESS_TYPE_STATUS_LINE,
  DEFAULT_SWITCHING_NETWORK_STATUS_LINE,
  LOADING_WALLET_FOR_SWITCH_STATUS_LINE,
} from '@/lib/settings/network-switch-status-messages'

export type DescriptorWalletSwitchContext = 'network' | 'addressType'

export function useDescriptorWalletSwitchMutation(
  switchContext: 'network',
): {
  mutate: (target: NetworkMode) => void
  mutateAsync: (target: NetworkMode) => Promise<void>
  isSwitching: boolean
  statusLine: string | null
}
export function useDescriptorWalletSwitchMutation(
  switchContext: 'addressType',
): {
  mutate: (target: AddressType) => void
  mutateAsync: (target: AddressType) => Promise<void>
  isSwitching: boolean
  statusLine: string | null
}
export function useDescriptorWalletSwitchMutation(switchContext: DescriptorWalletSwitchContext) {
  const [switchPhaseMessage, setSwitchPhaseMessage] = useState<string | null>(
    null,
  )

  const bootstrapFetchingRaw =
    useIsFetching({ queryKey: [...activeWalletLoadQueryKeyPrefix] }) > 0

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
          await executeSettingsAddressTypeSwitch({
            targetAddressType: target as AddressType,
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

  const isSwitching =
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
    mutateAsync: mutation.mutateAsync,
    isSwitching,
    statusLine,
  }
}
