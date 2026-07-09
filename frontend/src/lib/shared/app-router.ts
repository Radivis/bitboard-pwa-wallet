import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import { getLatestNonWalletPath } from '@/lib/navigation/non-wallet-navigation-history'

/** Registered from `main.tsx` so imperative code (e.g. lock) can navigate without hooks. */
type AppRouter = {
  readonly state: { location: { pathname: string } }
  navigate: (opts: { to: string; replace?: boolean }) => Promise<unknown> | unknown
}

let appRouter: AppRouter | null = null

export const LIBRARY_INDEX_PATH = '/library/'

export function registerAppRouter(router: AppRouter): void {
  appRouter = router
}

/**
 * After lock, send users away from wallet routes for privacy (library index is non-wallet UI).
 */
export function navigateToLibraryIfOnWalletRoute(): void {
  if (!appRouter) return
  const pathname = appRouter.state.location.pathname
  if (pathname.startsWith('/wallet')) {
    usePostLockPrivacyRedirectStore
      .getState()
      .setPrivacyRedirectFromLock(pathname)
    void appRouter.navigate({ to: LIBRARY_INDEX_PATH, replace: true })
  }
}

/**
 * Leave the wallet unlock gate: return to the latest visited non-wallet route, or Library.
 */
export function navigateAwayFromWalletUnlockPrompt(): void {
  if (!appRouter) return
  const latestNonWalletPath = getLatestNonWalletPath()
  void appRouter.navigate({
    to: latestNonWalletPath ?? LIBRARY_INDEX_PATH,
    replace: true,
  })
}
