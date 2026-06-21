/**
 * @deprecated For hydration gating, use `pathnameIsWalletRoute` (wallet routes only) — see
 * docs/wallet-rail-lifecycle.md § "Route independence and wallet hydration".
 *
 * Legacy helper: treated several non-wallet routes as hydration entry points.
 * Lab and Settings must not use this for unlock — use `requireUnlockedWallet` at
 * action time instead (descriptor reveal, mine-to-wallet, network switch, etc.).
 *
 * Library stays session-cleared after lock until the user opens a wallet route;
 * post-lock redirect to Library is intentional for privacy.
 *
 * Slated to be split: wallet-route hydration entry vs removed broad session gate.
 */
export function pathnameRequiresWalletCryptoSession(pathname: string): boolean {
  return (
    pathname.startsWith('/wallet') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/lab')
  )
}
