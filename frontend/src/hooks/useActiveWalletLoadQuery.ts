import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { loadDescriptorWalletAndSync, loadDescriptorWalletWithoutSync } from '@/lib/wallet-utils'
import { activeWalletLoadQueryKey } from '@/lib/wallet-load-query-keys'
import { waitForCryptoWorkerHealthy } from '@/workers/crypto-factory'
import { pathnameRequiresWalletCryptoSession } from '@/lib/pathname-requires-wallet-crypto-session'
import { reportWalletSyncError } from '@/lib/wallet-sync-error-toast'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'

/**
 * TanStack Query observer for loading the active sub-wallet when a session exists
 * but the wallet is not yet unlocked (reload, after lock + near-zero restore, etc.).
 * Safe to call from multiple components — they share one cache entry per key.
 */
export function useActiveWalletLoadQuery() {
  const sessionPassword = useSessionStore((s) => s.password)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const activeWalletBootstrapInFlight = useWalletStore(
    (s) => s.activeWalletBootstrapInFlight,
  )
  const manualWalletUnlockInFlight = useWalletStore(
    (s) => s.manualWalletUnlockInFlight,
  )
  const pathname = useWalletCryptoSessionPathGateStore((s) => s.pathname)
  const onWalletCryptoRoute = pathnameRequiresWalletCryptoSession(pathname)

  /**
   * `loadDescriptorWalletAndSync` marks the wallet unlocked before Esplora sync; bootstrap
   * uses background sync (`awaitSync: false`) so the query finishes right after WASM load.
   * `activeWalletBootstrapInFlight` keeps the query enabled until `queryFn` returns so
   * TanStack Query does not cancel mid-flight when status flips to unlocked mid-load.
   * `manualWalletUnlockInFlight` must suppress bootstrap while {@link WalletUnlock} holds
   * the session password but has not finished loading — otherwise unlock and bootstrap run
   * `loadDescriptorWalletAndSync` in parallel (duplicate sync toasts and work).
   * Bootstrap is off on Library (etc.) so locking → Library does not immediately reload keys.
   */
  const needsBootstrap =
    onWalletCryptoRoute &&
    sessionPassword != null &&
    activeWalletId != null &&
    !manualWalletUnlockInFlight &&
    (walletStatus === 'locked' ||
      walletStatus === 'none' ||
      activeWalletBootstrapInFlight)

  const query = useQuery({
    queryKey: activeWalletLoadQueryKey({
      activeWalletId,
      sessionPresent: sessionPassword != null,
      networkMode,
      addressType,
      accountId,
    }),
    queryFn: async () => {
      const { setActiveWalletBootstrapInFlight } = useWalletStore.getState()
      setActiveWalletBootstrapInFlight(true)
      try {
        const {
          activeWalletId: bootstrapWalletId,
          networkMode: bootstrapNetworkMode,
          addressType: bootstrapAddressType,
          accountId: bootstrapAccountId,
        } = useWalletStore.getState()
        const sessionPassword = useSessionStore.getState().password
        if (bootstrapWalletId == null || sessionPassword == null) {
          throw new Error('Bootstrap query ran without wallet or session')
        }
        await waitForCryptoWorkerHealthy()
        if (bootstrapNetworkMode === 'lab') {
          await loadDescriptorWalletWithoutSync({
            password: sessionPassword,
            walletId: bootstrapWalletId,
            networkMode: bootstrapNetworkMode,
            addressType: bootstrapAddressType,
            accountId: bootstrapAccountId,
          })
        } else {
          await loadDescriptorWalletAndSync({
            password: sessionPassword,
            walletId: bootstrapWalletId,
            networkMode: bootstrapNetworkMode,
            addressType: bootstrapAddressType,
            accountId: bootstrapAccountId,
            awaitSync: false,
            onSyncError: (err) => {
              reportWalletSyncError('bootstrap-load', err)
            },
          })
        }
        return true
      } finally {
        useWalletStore.getState().setActiveWalletBootstrapInFlight(false)
      }
    },
    enabled: needsBootstrap,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 2,
    refetchOnWindowFocus: 'always',
  })

  return { ...query, needsBootstrap }
}
