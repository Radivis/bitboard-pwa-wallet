import { useEffect } from 'react'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { ACTIVE_WALLET_LOAD_QUERY_ROOT } from '@/lib/wallet-load-query-keys'
import { appQueryClient } from '@/lib/app-query-client'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'

/**
 * Loads the active sub-wallet into WASM when a session exists but the wallet is
 * not yet unlocked (e.g. after reload or returning from a locked state). Replaces
 * the previous imperative auto-unlock effect in AppInitializer.
 */
export function useActiveWalletSubWalletBootstrap(): void {
  const sessionPassword = useSessionStore((s) => s.password)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const query = useActiveWalletLoadQuery()

  useEffect(() => {
    if (sessionPassword !== null) return
    appQueryClient.removeQueries({ queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] })
  }, [sessionPassword])

  useEffect(() => {
    if (!query.isError) return
    setWalletStatus('locked')
  }, [query.isError, setWalletStatus])
}
