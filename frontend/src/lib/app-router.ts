import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'

/** Registered from `main.tsx` so imperative code (e.g. lock) can navigate without hooks. */
type AppRouter = {
  readonly state: { location: { pathname: string } }
  navigate: (opts: { to: string; replace?: boolean }) => Promise<unknown> | unknown
}

let appRouter: AppRouter | null = null

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
    void appRouter.navigate({ to: '/library/', replace: true })
  }
}
