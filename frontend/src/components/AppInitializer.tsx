import { type ReactNode, useEffect, useLayoutEffect } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import {
  useWallets,
  getDatabase,
  tryLoadNearZeroSessionIntoMemory,
} from '@/db'
import { appQueryClient } from '@/lib/app-query-client'
import { prefetchLabChainState } from '@/hooks/useLabChainStateQuery'
import { useHydrateLightningConnections } from '@/hooks/useHydrateLightningConnections'
import { ActiveWalletBootstrap } from '@/components/ActiveWalletBootstrap'
import { pathnameRequiresWalletCryptoSession } from '@/lib/pathname-requires-wallet-crypto-session'
import { runMainnetStrictMigrationAfterHydration } from '@/lib/mainnet-access-strict-migration'
import { runRegtestStrictMigrationAfterHydration } from '@/lib/regtest-mode-strict-migration'
import { runSegwitAddressesStrictMigrationAfterHydration } from '@/lib/segwit-addresses-strict-migration'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import { useSecureStorageAvailabilityStore } from '@/stores/secureStorageAvailabilityStore'

interface AppInitializerProps {
  children: ReactNode
}

export function AppInitializer({ children }: AppInitializerProps) {
  useHydrateLightningConnections()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: wallets, isLoading, isFetching } = useWallets()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const networkMode = useWalletStore((s) => s.networkMode)
  const sessionPassword = useSessionStore((s) => s.password)

  useLayoutEffect(() => {
    useWalletCryptoSessionPathGateStore.getState().setPathname(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    runMainnetStrictMigrationAfterHydration()
    runRegtestStrictMigrationAfterHydration()
    runSegwitAddressesStrictMigrationAfterHydration()
  }, [])

  useEffect(() => {
    if (networkMode !== 'lab') return
    prefetchLabChainState(appQueryClient).catch((err) => {
      console.error('Lab chain prefetch failed:', err)
      const msg =
        err instanceof Error ? err.message : String(err) || 'Unknown error'
      toast.error(`Failed to init lab: ${msg}`)
    })
  }, [networkMode])

  useEffect(() => {
    if (isLoading) return

    const isSetupRoute = location.pathname.startsWith('/setup')
    const isWalletsRoute = location.pathname === '/wallet/wallets'
    const isSettingsRoute = location.pathname === '/settings'
    const isLibraryRoute = location.pathname.startsWith('/library')
    const isLabRoute = location.pathname.startsWith('/lab')

    if (!wallets || wallets.length === 0) {
      // After create/import, `addWallet` invalidates this query; cached data can stay
      // `[]` until the refetch finishes. Do not send the user back to /setup while the
      // list is catching up or the store already has an active wallet id.
      if (activeWalletId != null || isFetching) {
        return
      }
      if (!isSetupRoute && !isSettingsRoute && !isLibraryRoute && !isLabRoute) {
        navigate({ to: '/setup' })
      }
      return
    }

    if (wallets.length === 1 && !activeWalletId) {
      setActiveWallet(wallets[0].wallet_id)
      if (isWalletsRoute) {
        navigate({ to: '/wallet' })
      }
      return
    }

    if (wallets.length > 1 && !activeWalletId && !isWalletsRoute) {
      navigate({ to: '/wallet/wallets' })
    }
  }, [
    wallets,
    isLoading,
    isFetching,
    activeWalletId,
    setActiveWallet,
    navigate,
    location.pathname,
  ])

  /**
   * After lock, session is cleared. Restore near-zero session only on routes that need
   * wallet crypto — not on Library, so “lock → Library” stays locked until the user opens Wallet.
   */
  useEffect(() => {
    if (sessionPassword !== null) return
    if (!pathnameRequiresWalletCryptoSession(location.pathname)) return
    if (!useSecureStorageAvailabilityStore.getState().isAvailable) return
    void tryLoadNearZeroSessionIntoMemory(getDatabase())
  }, [sessionPassword, location.pathname])

  return (
    <>
      <ActiveWalletBootstrap />
      {children}
    </>
  )
}
