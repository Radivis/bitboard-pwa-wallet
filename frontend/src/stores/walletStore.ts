import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import type { BalanceInfo, TransactionDetails } from '@/workers/crypto-types'

export type NetworkMode = 'lab' | 'regtest' | 'signet' | 'testnet' | 'mainnet'

export type WalletStatus = 'none' | 'locked' | 'unlocked' | 'syncing'

export { AddressType }

export const NETWORK_LABELS: Record<NetworkMode, string> = {
  lab: 'Lab',
  regtest: 'Regtest',
  signet: 'Signet',
  testnet: 'Testnet',
  mainnet: 'Mainnet',
}

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  [AddressType.Taproot]: 'Taproot',
  [AddressType.SegWit]: 'SegWit',
}

export function getDescriptorWalletLabel(
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

/** Descriptor wallet triple that BDK/WASM was last loaded for; null when worker purged or not yet loaded. */
export type LoadedDescriptorWallet = {
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

/** Last-loaded descriptor wallet, else persisted preference — use for UI selection and theme accents. */
export function selectCommittedNetworkMode(state: {
  loadedDescriptorWallet: LoadedDescriptorWallet | null
  networkMode: NetworkMode
}): NetworkMode {
  return state.loadedDescriptorWallet?.networkMode ?? state.networkMode
}

export function selectCommittedAddressType(state: {
  loadedDescriptorWallet: LoadedDescriptorWallet | null
  addressType: AddressType
}): AddressType {
  return state.loadedDescriptorWallet?.addressType ?? state.addressType
}

export function selectCommittedAccountId(state: {
  loadedDescriptorWallet: LoadedDescriptorWallet | null
  accountId: number
}): number {
  return state.loadedDescriptorWallet?.accountId ?? state.accountId
}

interface TransientWalletState {
  walletStatus: WalletStatus
  /**
   * True while {@link WalletUnlock} runs `loadDescriptorWalletAndSync`. Must suppress the
   * active-wallet bootstrap query: setting the session password enables `needsBootstrap` while
   * status is still locked, which would otherwise start a second parallel load + Esplora sync
   * (duplicate toasts / duplicate sync work).
   */
  manualWalletUnlockInFlight: boolean
  /** True while TanStack active-wallet bootstrap `queryFn` runs; keeps the query enabled after status flips to unlocked mid-load. */
  activeWalletBootstrapInFlight: boolean
  balance: BalanceInfo | null
  currentAddress: string | null
  lastSyncTime: Date | null
  transactions: TransactionDetails[]
  loadedDescriptorWallet: LoadedDescriptorWallet | null
  /**
   * Set when post-import Esplora full scan fails; in-memory only (not persisted).
   * Cleared on successful retry, lock, or dismiss.
   */
  importInitialSyncErrorMessage: string | null
}

interface WalletActions {
  setNetworkMode: (networkMode: NetworkMode) => void
  setAddressType: (addressType: AddressType) => void
  setAccountId: (accountId: number) => void
  /** Persists network/address/account and sets `loadedDescriptorWallet` together (use after a successful WASM load). */
  commitLoadedDescriptorWallet: (loadedDescriptorWallet: LoadedDescriptorWallet) => void
  setActiveWallet: (walletId: number | null) => void
  setWalletStatus: (walletStatus: WalletStatus) => void
  setBalance: (balance: BalanceInfo | null) => void
  setCurrentAddress: (address: string | null) => void
  setLastSyncTime: (lastSyncTime: Date | null) => void
  setTransactions: (transactions: TransactionDetails[]) => void
  setActiveWalletBootstrapInFlight: (inFlight: boolean) => void
  setManualWalletUnlockInFlight: (inFlight: boolean) => void
  setImportInitialSyncErrorMessage: (message: string | null) => void
  lockWallet: () => void
  resetWallet: () => void
}

type WalletState = PersistedWalletState & TransientWalletState & WalletActions

const TRANSIENT_DEFAULTS: TransientWalletState = {
  walletStatus: 'none',
  manualWalletUnlockInFlight: false,
  activeWalletBootstrapInFlight: false,
  balance: null,
  currentAddress: null,
  lastSyncTime: null,
  transactions: [],
  loadedDescriptorWallet: null,
  importInitialSyncErrorMessage: null,
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: null,

      ...TRANSIENT_DEFAULTS,

      setNetworkMode: (networkMode) => set({ networkMode }),
      setAddressType: (addressType) => set({ addressType }),
      setAccountId: (accountId) => set({ accountId }),
      commitLoadedDescriptorWallet: (loadedDescriptorWallet) =>
        set({
          networkMode: loadedDescriptorWallet.networkMode,
          addressType: loadedDescriptorWallet.addressType,
          accountId: loadedDescriptorWallet.accountId,
          loadedDescriptorWallet,
        }),
      setActiveWallet: (walletId) => set({ activeWalletId: walletId }),
      setWalletStatus: (walletStatus) => set({ walletStatus }),
      setBalance: (balance) => set({ balance }),
      setCurrentAddress: (address) => set({ currentAddress: address }),
      setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
      setTransactions: (transactions) => set({ transactions }),
      setActiveWalletBootstrapInFlight: (inFlight) =>
        set({ activeWalletBootstrapInFlight: inFlight }),
      setManualWalletUnlockInFlight: (inFlight) =>
        set({ manualWalletUnlockInFlight: inFlight }),
      setImportInitialSyncErrorMessage: (message) =>
        set({ importInitialSyncErrorMessage: message }),

      lockWallet: () =>
        set({
          ...TRANSIENT_DEFAULTS,
          walletStatus: 'locked',
          loadedDescriptorWallet: null,
        }),

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

/** Imperative: same as `selectCommittedAddressType` on current store state. */
export function getCommittedAddressType(): AddressType {
  return selectCommittedAddressType(useWalletStore.getState())
}

/** Imperative: same as `selectCommittedAccountId` on current store state. */
export function getCommittedAccountId(): number {
  return selectCommittedAccountId(useWalletStore.getState())
}
