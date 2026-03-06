import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { BalanceInfo, TransactionDetails } from '@/workers/crypto-types'

export type NetworkMode = 'regtest' | 'signet' | 'testnet' | 'mainnet'

export type WalletStatus = 'none' | 'locked' | 'unlocked' | 'syncing'

export type AddressType = 'taproot' | 'segwit'

export const NETWORK_LABELS: Record<NetworkMode, string> = {
  regtest: 'Regtest',
  signet: 'Signet',
  testnet: 'Testnet',
  mainnet: 'Mainnet',
}

interface PersistedWalletState {
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  activeWalletId: number | null
}

interface TransientWalletState {
  walletStatus: WalletStatus
  balance: BalanceInfo | null
  currentAddress: string | null
  lastSyncTime: Date | null
  transactions: TransactionDetails[]
}

interface WalletActions {
  setNetworkMode: (mode: NetworkMode) => void
  setAddressType: (type: AddressType) => void
  setAccountId: (id: number) => void
  setActiveWallet: (id: number | null) => void
  setWalletStatus: (status: WalletStatus) => void
  setBalance: (balance: BalanceInfo | null) => void
  setCurrentAddress: (address: string | null) => void
  setLastSyncTime: (time: Date | null) => void
  setTransactions: (txs: TransactionDetails[]) => void
  lockWallet: () => void
  resetWallet: () => void
}

type WalletState = PersistedWalletState & TransientWalletState & WalletActions

const TRANSIENT_DEFAULTS: TransientWalletState = {
  walletStatus: 'none',
  balance: null,
  currentAddress: null,
  lastSyncTime: null,
  transactions: [],
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
      activeWalletId: null,

      ...TRANSIENT_DEFAULTS,

      setNetworkMode: (mode) => set({ networkMode: mode }),
      setAddressType: (type) => set({ addressType: type }),
      setAccountId: (id) => set({ accountId: id }),
      setActiveWallet: (id) => set({ activeWalletId: id }),
      setWalletStatus: (status) => set({ walletStatus: status }),
      setBalance: (balance) => set({ balance }),
      setCurrentAddress: (address) => set({ currentAddress: address }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),
      setTransactions: (txs) => set({ transactions: txs }),

      lockWallet: () => set({ ...TRANSIENT_DEFAULTS, walletStatus: 'locked' }),

      resetWallet: () =>
        set({
          activeWalletId: null,
          ...TRANSIENT_DEFAULTS,
        }),
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        networkMode: state.networkMode,
        addressType: state.addressType,
        accountId: state.accountId,
        activeWalletId: state.activeWalletId,
      }),
    },
  ),
)
