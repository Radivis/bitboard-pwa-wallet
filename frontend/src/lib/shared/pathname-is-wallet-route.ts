/**
 * Wallet dashboard routes where automatic hydration (near-zero restore + bootstrap load) may start.
 * Start (`/`) is the app hub and does not hydrate. See docs/wallet-rail-lifecycle.md.
 */
export function pathnameIsWalletRoute(pathname: string): boolean {
  return pathname.startsWith('/wallet')
}
