import { type ReactNode, useEffect, useLayoutEffect } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useWallets } from '@/db'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { prefetchLabChainState } from '@/hooks/useLabChainStateQuery'
import { ActiveWalletBootstrap } from '@/components/ActiveWalletBootstrap'
import { runMainnetStrictMigrationAfterHydration } from '@/lib/settings/mainnet-access-strict-migration'
import { runRegtestStrictMigrationAfterHydration } from '@/lib/settings/regtest-mode-strict-migration'
import { runSegwitAddressesStrictMigrationAfterHydration } from '@/lib/settings/segwit-addresses-strict-migration'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import { useAutoLockActivityBumps } from '@/hooks/useAutoLockActivityBumps'
import { useLabCrossTabCacheSync } from '@/hooks/useLabCrossTabCacheSync'
import { useWalletCrossTabCacheSync } from '@/hooks/useWalletCrossTabCacheSync'
import {
  syncLockLifecycleFromWalletStore,
  syncLockLifecycleWithActiveWallet,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

interface AppInitializerProps {
  children: ReactNode
}

export function AppInitializer({ children }: AppInitializerProps) {
  useAutoLockActivityBumps()
  useLabCrossTabCacheSync()
  useWalletCrossTabCacheSync()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: wallets, isLoading, isFetching } = useWallets()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const setActiveWallet = useWalletStore((walletState) => walletState.setActiveWallet)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)

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
      const labPrefetchErrorMessage =
        err instanceof Error ? err.message : String(err) || 'Unknown error'
      toast.error(`Failed to init lab: ${labPrefetchErrorMessage}`)
    })
  }, [networkMode])

  useEffect(() => {
    if (isLoading) return

    const isSetupRoute = location.pathname.startsWith('/setup')
    const isWalletsRoute = location.pathname === '/wallet/wallets'
    const isSettingsRoute = location.pathname.startsWith('/settings')
    const isLibraryRoute = location.pathname.startsWith('/library')
    const isLabRoute = location.pathname.startsWith('/lab')
    const isPrivacyRoute = location.pathname === '/privacy'

    if (!wallets || wallets.length === 0) {
      // After create/import, `addWallet` invalidates this query; cached data can stay
      // `[]` until the refetch finishes. Do not send the user back to /setup while the
      // list is catching up or the store already has an active wallet id.
      if (activeWalletId != null || isFetching) {
        return
      }
      if (
        !isSetupRoute &&
        !isSettingsRoute &&
        !isLibraryRoute &&
        !isLabRoute &&
        !isPrivacyRoute
      ) {
        navigate({ to: '/setup' })
      }
      return
    }

    if (wallets.length === 1 && !activeWalletId) {
      setActiveWallet(wallets[0].walletId)
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

  useEffect(() => {
    syncLockLifecycleWithActiveWallet(activeWalletId)
    syncLockLifecycleFromWalletStore()
  }, [activeWalletId, walletStatus])

  return (
    <>
      <ActiveWalletBootstrap />
      {children}
    </>
  )
}
