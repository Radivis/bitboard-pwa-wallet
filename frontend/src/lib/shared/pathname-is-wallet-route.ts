/**
 * Wallet dashboard routes where automatic hydration (near-zero restore + bootstrap load) may start.
 * See docs/wallet-rail-lifecycle.md § "Route independence and wallet hydration".
 */
export function pathnameIsWalletRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/wallet')
}
