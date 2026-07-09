import { useEffect } from 'react'
import { useWalletStore } from '@/stores/walletStore'
import { activeWalletLoadQueryKeyPrefix } from '@/lib/wallet/wallet-load-query-keys'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'

/**
 * Loads the active descriptor wallet into WASM when a session exists but the wallet is
 * not yet unlocked (e.g. after reload or returning from a locked state). Replaces
 * the previous imperative auto-unlock effect in AppInitializer.
 */
export function useActiveWalletDescriptorWalletBootstrap(): void {
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  useActiveWalletLoadQuery()

  useEffect(() => {
    if (walletStatus !== 'locked') return
    void (async () => {
      if (await isWalletSecretsSessionActive()) return
      appQueryClient.removeQueries({ queryKey: [...activeWalletLoadQueryKeyPrefix] })
    })()
  }, [walletStatus])
}
