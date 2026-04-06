import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { loadDescriptorWalletAndSync, loadDescriptorWalletWithoutSync } from '@/lib/wallet-utils'
import {
  activeWalletLoadQueryKey,
  ACTIVE_WALLET_LOAD_QUERY_ROOT,
} from '@/lib/wallet-load-query-keys'
import { appQueryClient } from '@/lib/app-query-client'

/**
 * Loads the active sub-wallet into WASM when a session exists but the wallet is
 * not yet unlocked (e.g. after reload or returning from a locked state). Replaces
 * the previous imperative auto-unlock effect in AppInitializer.
 */
export function useActiveWalletSubWalletBootstrap(): void {
  const sessionPassword = useSessionStore((s) => s.password)

  useEffect(() => {
    if (sessionPassword !== null) return
    appQueryClient.removeQueries({ queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] })
  }, [sessionPassword])

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)

  const needsBootstrap =
    activeWalletId != null &&
    sessionPassword != null &&
    walletStatus !== 'unlocked' &&
    walletStatus !== 'syncing'

  const query = useQuery({
    queryKey: activeWalletLoadQueryKey({
      activeWalletId,
      sessionPresent: sessionPassword != null,
      networkMode,
      addressType,
      accountId,
    }),
    queryFn: async () => {
      if (activeWalletId == null || sessionPassword == null) {
        throw new Error('Bootstrap query ran without wallet or session')
      }
      if (networkMode === 'lab') {
        await loadDescriptorWalletWithoutSync({
          password: sessionPassword,
          walletId: activeWalletId,
          networkMode,
          addressType,
          accountId,
        })
      } else {
        await loadDescriptorWalletAndSync({
          password: sessionPassword,
          walletId: activeWalletId,
          networkMode,
          addressType,
          accountId,
          onSyncError: (err) => {
            const msg = err instanceof Error ? err.message : String(err)
            toast.error(msg || 'Sync failed — wallet unlocked but data may be stale')
          },
        })
      }
      return true
    },
    enabled: needsBootstrap,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  useEffect(() => {
    if (!query.isError) return
    setWalletStatus('locked')
  }, [query.isError, setWalletStatus])
}
