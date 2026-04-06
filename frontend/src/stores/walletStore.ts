import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { BalanceInfo, TransactionDetails } from '@/workers/crypto-types'

export type NetworkMode = 'lab' | 'regtest' | 'signet' | 'testnet' | 'mainnet'

export type WalletStatus = 'none' | 'locked' | 'unlocked' | 'syncing'

export type AddressType = 'taproot' | 'segwit'

export const NETWORK_LABELS: Record<NetworkMode, string> = {
  lab: 'Lab',
  regtest: 'Regtest',
  signet: 'Signet',
  testnet: 'Testnet',
  mainnet: 'Mainnet',
}

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  taproot: 'Taproot',
  segwit: 'SegWit',
}

export function getSubWalletLabel(
  networkMode: NetworkMode,
  addressType: AddressType,
): string {
  return `${NETWORK_LABELS[networkMode]} ${ADDRESS_TYPE_LABELS[addressType]}`
}

interface PersistedWalletState {
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  activeWalletId: number | null
}

/** Sub-wallet triple that BDK/WASM was last loaded for; null when worker purged or not yet loaded. */
export type LoadedSubWallet = {
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

/** Last-loaded sub-wallet, else persisted preference — use for UI selection and theme accents. */
export function selectCommittedNetworkMode(s: {
  loadedSubWallet: LoadedSubWallet | null
  networkMode: NetworkMode
}): NetworkMode {
  return s.loadedSubWallet?.networkMode ?? s.networkMode
}

export function selectCommittedAddressType(s: {
  loadedSubWallet: LoadedSubWallet | null
  addressType: AddressType
}): AddressType {
  return s.loadedSubWallet?.addressType ?? s.addressType
}

interface TransientWalletState {
  walletStatus: WalletStatus
  balance: BalanceInfo | null
  currentAddress: string | null
  lastSyncTime: Date | null
  transactions: TransactionDetails[]
  loadedSubWallet: LoadedSubWallet | null
}

interface WalletActions {
  setNetworkMode: (mode: NetworkMode) => void
  setAddressType: (type: AddressType) => void
  setAccountId: (id: number) => void
  /** Persists network/address/account and sets `loadedSubWallet` together (use after a successful WASM load). */
  commitLoadedSubWallet: (sub: LoadedSubWallet) => void
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
  loadedSubWallet: null,
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
      commitLoadedSubWallet: (sub) =>
        set({
          networkMode: sub.networkMode,
          addressType: sub.addressType,
          accountId: sub.accountId,
          loadedSubWallet: sub,
        }),
      setActiveWallet: (id) => set({ activeWalletId: id }),
      setWalletStatus: (status) => set({ walletStatus: status }),
      setBalance: (balance) => set({ balance }),
      setCurrentAddress: (address) => set({ currentAddress: address }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),
      setTransactions: (txs) => set({ transactions: txs }),

      lockWallet: () =>
        set({ ...TRANSIENT_DEFAULTS, walletStatus: 'locked', loadedSubWallet: null }),

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

/** Imperative: same as `selectCommittedNetworkMode` on current store state. */
export function getCommittedNetworkMode(): NetworkMode {
  return selectCommittedNetworkMode(useWalletStore.getState())
}
