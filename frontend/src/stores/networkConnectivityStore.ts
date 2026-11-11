import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { NetworkMode } from '@/stores/walletStore'

export type OnlineNetworkMode = 'mainnet' | 'testnet' | 'signet' | 'mutinynet'
export type OfflineNetworkMode = 'lab' | 'regtest'

const ONLINE_NETWORKS: readonly OnlineNetworkMode[] = ['mainnet', 'testnet', 'signet', 'mutinynet']

type NetworkConnectivityState = {
  lastOnlineNetwork: OnlineNetworkMode
  lastOfflineNetwork: OfflineNetworkMode
  rememberNetwork: (mode: NetworkMode) => void
}

export function isOnlineNetwork(mode: NetworkMode): mode is OnlineNetworkMode {
  return (ONLINE_NETWORKS as readonly NetworkMode[]).includes(mode)
}

export const useNetworkConnectivityStore = create<NetworkConnectivityState>()(
  persist(
    (set) => ({
      lastOnlineNetwork: 'testnet',
      lastOfflineNetwork: 'lab',
      rememberNetwork: (mode) => {
        if (isOnlineNetwork(mode)) {
          set({ lastOnlineNetwork: mode })
          return
        }
        set({ lastOfflineNetwork: mode })
      },
    }),
    {
      name: 'network-connectivity-storage',
      storage: createJSONStorage(() => sqliteStorage),
    },
  ),
)

export function networkTargetForConnectivitySwitch(params: {
  current: NetworkMode
  lastOnlineNetwork: OnlineNetworkMode
  lastOfflineNetwork: OfflineNetworkMode
  regtestEnabled: boolean
}): NetworkMode {
  if (isOnlineNetwork(params.current)) {
    if (params.lastOfflineNetwork === 'regtest' && !params.regtestEnabled) return 'lab'
    return params.lastOfflineNetwork
  }
  return params.lastOnlineNetwork
}
