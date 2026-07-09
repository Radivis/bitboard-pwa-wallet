import { pathnameIsWalletRoute } from '@/lib/shared/pathname-is-wallet-route'

/** Routes gated by {@link WalletRouteSecretsGate} until the wallet is unlocked. */
export function pathnameRequiresWalletUnlock(pathname: string): boolean {
  return pathnameIsWalletRoute(pathname)
}
