import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import {
  hydrateLightningConnectionsForWallet,
  LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY,
} from '@/lib/lightning/lightning-connections-hydration'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

/**
 * After unlock, loads Lightning connections from encrypted wallet secrets into
 * the lightning store. Uses TanStack Query so hydration is declarative and
 * refetches align with wallet/session lifecycle (see
 * `removeLightningConnectionsHydrationQueries`).
 */
export function useHydrateLightningConnections() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)

  const enabled =
    activeWalletId != null &&
    walletIsUnlockedOrSyncing(walletStatus)

  return useQuery({
    queryKey: [...LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY, activeWalletId] as const,
    queryFn: async () => {
      await hydrateLightningConnectionsForWallet({
        walletId: activeWalletId!,
      })
      return true as const
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: 'always',
  })
}
