import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { activeWalletLoadQueryKey } from '@/lib/wallet/wallet-load-query-keys'
import { pathnameIsWalletRoute } from '@/lib/shared/pathname-is-wallet-route'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
import { reportWalletSyncError } from '@/lib/wallet/wallet-sync-error-toast'
import { useLockLifecycleSnapshot } from '@/hooks/useLockLifecycleSnapshot'
import {
  canStartBootstrapUnlock,
  orchestrateBootstrapUnlock,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import type { LockLifecycleOperation } from '@/lib/wallet/lifecycle/lock-lifecycle-types'

function lockUnlockOperationInProgress(operation: LockLifecycleOperation): boolean {
  return operation === 'manual_unlock' || operation === 'bootstrap_unlock'
}

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
  const onWalletRoute = pathnameIsWalletRoute(pathname)
  const lockLifecycle = useLockLifecycleSnapshot()
  const lockUnlockInProgress = lockUnlockOperationInProgress(lockLifecycle.operation)

  /**
   * `loadDescriptorWalletAndSync` marks the wallet unlocked before Esplora sync; bootstrap
   * uses background sync (`awaitSync: false`) so the query finishes right after WASM load.
   * LockLifecycle `bootstrap_unlock` keeps the query enabled until `queryFn` returns so
   * TanStack Query does not cancel mid-flight when status flips to unlocked mid-load.
   * Manual unlock must suppress bootstrap — otherwise unlock and bootstrap run
   * `loadDescriptorWalletAndSync` in parallel (duplicate sync toasts and work).
   * Bootstrap starts only on wallet-route entry; `lockUnlockInProgress` keeps it enabled
   * if the user navigates away mid-bootstrap (route-independent lifecycle).
   */
  const wantsBootstrap =
    activeWalletId != null &&
    canStartBootstrapUnlock() &&
    (!walletIsUnlockedOrSyncing(walletStatus) || lockUnlockInProgress)

  const needsBootstrap = wantsBootstrap && (onWalletRoute || lockUnlockInProgress)

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
