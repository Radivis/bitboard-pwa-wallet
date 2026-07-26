import { useActiveWalletDescriptorWalletBootstrap } from '@/hooks/useActiveWalletDescriptorWalletBootstrap'
import { useOnchainPeriodicSyncQuery } from '@/hooks/useOnchainPeriodicSyncQuery'
import { useUnilateralExitAutomationRunner } from '@/hooks/useUnilateralExitAutomationRunner'

/** Mounts the TanStack Query–driven bootstrap that loads WASM when session exists but wallet is locked/none. */
export function ActiveWalletBootstrap() {
  useActiveWalletDescriptorWalletBootstrap()
  useOnchainPeriodicSyncQuery()
  useUnilateralExitAutomationRunner()
  return null
}
