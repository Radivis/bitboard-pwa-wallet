import { useActiveWalletSubWalletBootstrap } from '@/hooks/useActiveWalletSubWalletBootstrap'

/** Mounts the TanStack Query–driven bootstrap that loads WASM when session exists but wallet is locked/none. */
export function ActiveWalletBootstrap() {
  useActiveWalletSubWalletBootstrap()
  return null
}
