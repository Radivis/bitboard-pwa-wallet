import { useActiveWalletDescriptorWalletBootstrap } from '@/hooks/useActiveWalletDescriptorWalletBootstrap'
import { useOnchainPeriodicSyncQuery } from '@/hooks/useOnchainPeriodicSyncQuery'
import { useUnilateralExitAutomationBootstrap } from '@/hooks/useUnilateralExitAutomationBootstrap'

/** Mounts the TanStack Query–driven bootstrap that loads WASM when session exists but wallet is locked/none. */
export function ActiveWalletBootstrap() {
  useActiveWalletDescriptorWalletBootstrap()
  useOnchainPeriodicSyncQuery()
  useUnilateralExitAutomationBootstrap()
  return null
}
