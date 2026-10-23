import { useActiveWalletDescriptorWalletBootstrap } from '@/hooks/useActiveWalletDescriptorWalletBootstrap'
import { useBarkPeriodicSyncQuery } from '@/hooks/useBarkPeriodicSyncQuery'
import { useOnchainPeriodicSyncQuery } from '@/hooks/useOnchainPeriodicSyncQuery'

/** Mounts the TanStack Query–driven bootstrap that loads WASM when session exists but wallet is locked/none. */
export function ActiveWalletBootstrap() {
  useActiveWalletDescriptorWalletBootstrap()
  useOnchainPeriodicSyncQuery()
  useBarkPeriodicSyncQuery()
  return null
}
