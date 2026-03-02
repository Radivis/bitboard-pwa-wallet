import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NetworkMode = 'regtest' | 'signet' | 'testnet' | 'mainnet'

export const NETWORK_LABELS: Record<NetworkMode, string> = {
  regtest: 'Regtest',
  signet: 'Signet',
  testnet: 'Testnet',
  mainnet: 'Mainnet',
}

interface WalletState {
  networkMode: NetworkMode
  setNetworkMode: (mode: NetworkMode) => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      networkMode: 'signet',
      setNetworkMode: (mode) => set({ networkMode: mode }),
    }),
    { name: 'wallet-storage' },
  ),
)
