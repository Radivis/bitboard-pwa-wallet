import { recordNonWalletNavigationLeaving } from '@/lib/navigation/non-wallet-navigation-history'

type NavigationResolvedEvent = {
  fromLocation?: { pathname: string } | null
}

type NonWalletNavigationHistoryRouter = {
  subscribe: (
    eventType: 'onResolved',
    listener: (event: NavigationResolvedEvent) => void,
  ) => () => void
}

/**
 * Records safe return paths when the router resolves a navigation away from a non-wallet route.
 * Call once from `main.tsx` after `createRouter`.
 */
export function registerNonWalletNavigationHistory(
  router: NonWalletNavigationHistoryRouter,
): () => void {
  return router.subscribe('onResolved', ({ fromLocation }) => {
    const fromPathname = fromLocation?.pathname
    if (fromPathname != null) {
      recordNonWalletNavigationLeaving(fromPathname)
    }
  })
}
