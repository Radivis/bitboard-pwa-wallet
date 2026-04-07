import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import {
  hydrateLightningConnectionsForWallet,
  LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY,
} from '@/lib/lightning-connections-hydration'

/**
 * After unlock, loads Lightning connections from encrypted wallet secrets into
 * the lightning store. Uses TanStack Query so hydration is declarative and
 * refetches align with wallet/session lifecycle (see
 * `removeLightningConnectionsHydrationQueries`).
 */
export function useHydrateLightningConnections() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const sessionPassword = useSessionStore((s) => s.password)

  const enabled =
    activeWalletId != null &&
    sessionPassword != null &&
    (walletStatus === 'unlocked' || walletStatus === 'syncing')

  return useQuery({
    queryKey: [...LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY, activeWalletId] as const,
    queryFn: async () => {
      await hydrateLightningConnectionsForWallet({
        password: sessionPassword!,
        walletId: activeWalletId!,
      })
      return true as const
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
