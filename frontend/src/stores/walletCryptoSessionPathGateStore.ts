import { create } from 'zustand'

/**
 * Current app pathname for gating near-zero session restore and WASM bootstrap.
 * Synced from the router via `AppInitializer` (`useLayoutEffect`) so descendants read
 * a consistent value before their effects run. Unit tests without the app shell default
 * to `/wallet` in {@link renderWithProviders}.
 */
interface WalletCryptoSessionPathGateState {
  pathname: string
  setPathname: (pathname: string) => void
}

export const useWalletCryptoSessionPathGateStore =
  create<WalletCryptoSessionPathGateState>((set) => ({
    /** Real path is set from the router in `AppInitializer` before paint. */
    pathname: '/wallet',
    setPathname: (pathname) => set({ pathname }),
  }))
