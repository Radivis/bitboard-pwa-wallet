import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { activeWalletLoadQueryKey } from '@/lib/wallet/wallet-load-query-keys'
import { pathnameRequiresWalletCryptoSession } from '@/lib/shared/pathname-requires-wallet-crypto-session'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
import { reportWalletSyncError } from '@/lib/wallet/wallet-sync-error-toast'
import {
  canStartBootstrapUnlock,
  isLockUnlockInProgress,
  orchestrateBootstrapUnlock,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

/**
 * TanStack Query observer for loading the active descriptor wallet when a session exists
 * but the wallet is not yet unlocked (reload, after lock + near-zero restore, etc.).
 * Safe to call from multiple components — they share one cache entry per key.
 */
export function useActiveWalletLoadQuery() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const accountId = useWalletStore((walletState) => walletState.accountId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const pathname = useWalletCryptoSessionPathGateStore((walletCryptoSessionPathGateState) => walletCryptoSessionPathGateState.pathname)
  const onWalletCryptoRoute = pathnameRequiresWalletCryptoSession(pathname)
  const lockUnlockInProgress = isLockUnlockInProgress()

  /**
   * `loadDescriptorWalletAndSync` marks the wallet unlocked before Esplora sync; bootstrap
   * uses background sync (`awaitSync: false`) so the query finishes right after WASM load.
   * LockLifecycle `bootstrap_unlock` keeps the query enabled until `queryFn` returns so
   * TanStack Query does not cancel mid-flight when status flips to unlocked mid-load.
   * Manual unlock must suppress bootstrap — otherwise unlock and bootstrap run
   * `loadDescriptorWalletAndSync` in parallel (duplicate sync toasts and work).
   * Bootstrap is off on Library (etc.) so locking → Library does not immediately reload keys.
   */
  const needsBootstrap =
    onWalletCryptoRoute &&
    activeWalletId != null &&
    canStartBootstrapUnlock() &&
    (!walletIsUnlockedOrSyncing(walletStatus) || lockUnlockInProgress)

  const query = useQuery({
    queryKey: activeWalletLoadQueryKey({
      activeWalletId,
      networkMode,
      addressType,
      accountId,
      lockUnlockInProgress,
    }),
    queryFn: async () => {
      const {
        activeWalletId: bootstrapWalletId,
        networkMode: bootstrapNetworkMode,
        addressType: bootstrapAddressType,
        accountId: bootstrapAccountId,
      } = useWalletStore.getState()
      if (bootstrapWalletId == null) {
        throw new Error('Bootstrap query ran without wallet or session')
      }
      if (!(await isWalletSecretsSessionActive())) {
        throw new Error('Bootstrap query ran without wallet secrets session')
      }
      await orchestrateBootstrapUnlock({
        walletId: bootstrapWalletId,
        networkMode: bootstrapNetworkMode,
        addressType: bootstrapAddressType,
        accountId: bootstrapAccountId,
        onSyncError: (err) => {
          reportWalletSyncError('bootstrap-load', err)
        },
      })
      return true
    },
    enabled: needsBootstrap,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 2,
    refetchOnWindowFocus: 'always',
  })

  return { ...query, needsBootstrap }
}
