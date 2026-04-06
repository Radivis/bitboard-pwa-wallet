import { useCallback, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { AddressType } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'

export function useAddressTypeSwitchMutation() {
  const [switchPhaseMessage, setSwitchPhaseMessage] = useState<string | null>(
    null,
  )

  const runSwitch = useCallback(async (targetAddressType: AddressType) => {
    const onPhase = (message: string) => {
      setSwitchPhaseMessage(message)
    }
    try {
      const { networkMode, accountId, addressType: currentAddressType } =
        useWalletStore.getState()
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
    } finally {
      setSwitchPhaseMessage(null)
    }
  }, [])

  const mutation = useMutation({
    mutationFn: runSwitch,
  })

  const loading = mutation.isPending

  const statusLine = useMemo(() => {
    if (!mutation.isPending) return null
    return switchPhaseMessage ?? 'Switching address type…'
  }, [mutation.isPending, switchPhaseMessage])

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    loading,
    statusLine,
  }
}
