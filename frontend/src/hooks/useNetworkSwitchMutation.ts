import { useCallback, useMemo, useState } from 'react'
import { useMutation, useIsFetching } from '@tanstack/react-query'
import type { NetworkMode } from '@/stores/walletStore'
import { executeSettingsNetworkSwitch } from '@/lib/network-mode-switch'
import { ACTIVE_WALLET_LOAD_QUERY_ROOT } from '@/lib/wallet-load-query-keys'

export function useNetworkSwitchMutation() {
  const [switchPhaseMessage, setSwitchPhaseMessage] = useState<string | null>(
    null,
  )

  const bootstrapFetching =
    useIsFetching({ queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] }) > 0

  const runNetworkChange = useCallback(async (network: NetworkMode) => {
    const onPhase = (message: string) => {
      setSwitchPhaseMessage(message)
    }
    try {
      await executeSettingsNetworkSwitch({ targetNetwork: network, onPhase })
    } finally {
      setSwitchPhaseMessage(null)
    }
  }, [])

  const mutation = useMutation({
    mutationFn: runNetworkChange,
  })

  const loading = bootstrapFetching || mutation.isPending

  const statusLine = useMemo(() => {
    if (bootstrapFetching) return 'Loading wallet…'
    if (mutation.isPending) {
      return switchPhaseMessage ?? 'Switching network…'
    }
    return null
  }, [bootstrapFetching, mutation.isPending, switchPhaseMessage])

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    loading,
    statusLine,
  }
}
