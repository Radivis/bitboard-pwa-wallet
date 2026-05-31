import { useActiveWalletDescriptorWalletBootstrap } from '@/hooks/useActiveWalletDescriptorWalletBootstrap'

/** Mounts the TanStack Query–driven bootstrap that loads WASM when session exists but wallet is locked/none. */
export function ActiveWalletBootstrap() {
  useActiveWalletDescriptorWalletBootstrap()
  return null
}
