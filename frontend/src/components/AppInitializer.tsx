import { type ReactNode, useEffect } from 'react'
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

interface AppInitializerProps {
  children: ReactNode
}

export function AppInitializer({ children }: AppInitializerProps) {
  useHydrateLightningConnections()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: wallets, isLoading } = useWallets()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const networkMode = useWalletStore((s) => s.networkMode)
  const sessionPassword = useSessionStore((s) => s.password)

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
  }, [wallets, isLoading, activeWalletId, setActiveWallet, navigate, location.pathname])

  /** After lock, session is cleared; restore near-zero wrapped secret so auto-unlock can run again. */
  useEffect(() => {
    if (sessionPassword !== null) return
    void tryLoadNearZeroSessionIntoMemory(getDatabase())
  }, [sessionPassword])

  return (
    <>
      <ActiveWalletBootstrap />
      {children}
    </>
  )
}
