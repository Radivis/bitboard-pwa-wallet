import { useEffect, useRef } from 'react'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'

export type RailLoadTarget = {
  walletId: number
  networkMode: NetworkMode
}

/**
 * Unlock starts a rail load only when the rail is usable at that moment.
 * When `isRailActivated` flips to true later while the wallet stays unlocked
 * (feature enabled, or the feature store hydrated after unlock), start the load then.
 */
export function useRailLoadOnFeatureActivation(params: {
  isRailActivated: boolean
  isRailActiveForNetwork: (networkMode: NetworkMode) => boolean
  startRailLoad: (target: RailLoadTarget) => void
}): void {
  const { isRailActivated, isRailActiveForNetwork, startRailLoad } = params
  const wasRailActivatedRef = useRef(isRailActivated)
  const isRailActiveForNetworkRef = useRef(isRailActiveForNetwork)
  const startRailLoadRef = useRef(startRailLoad)
  isRailActiveForNetworkRef.current = isRailActiveForNetwork
  startRailLoadRef.current = startRailLoad

  useEffect(() => {
    const becameActivated = isRailActivated && !wasRailActivatedRef.current
    wasRailActivatedRef.current = isRailActivated
    if (!becameActivated) return

    const { activeWalletId, walletStatus, networkMode } = useWalletStore.getState()
    if (activeWalletId == null || walletStatus !== 'unlocked') return
    if (!isRailActiveForNetworkRef.current(networkMode)) return

    startRailLoadRef.current({ walletId: activeWalletId, networkMode })
  }, [isRailActivated])
}
