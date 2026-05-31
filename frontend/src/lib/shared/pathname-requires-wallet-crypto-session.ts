/**
 * Routes where we load the near-zero session into memory and bootstrap WASM.
 * Library (and similar) stays session-cleared after lock until the user opens wallet,
 * setup, settings, or lab — matching “lock then Library” privacy expectations.
 */
export function pathnameRequiresWalletCryptoSession(pathname: string): boolean {
  return (
    pathname.startsWith('/wallet') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/lab')
  )
}
