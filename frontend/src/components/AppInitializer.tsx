import { type ReactNode, useEffect, useRef } from 'react'
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
import {
  loadDescriptorWalletAndSync,
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet-utils'

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
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const sessionPassword = useSessionStore((s) => s.password)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const lastUnlockedWalletId = useRef<number | null>(null)

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

  useEffect(() => {
    if (!activeWalletId || !sessionPassword) return
    if (
      lastUnlockedWalletId.current === activeWalletId &&
      walletStatus !== 'locked'
    ) {
      return
    }

    lastUnlockedWalletId.current = activeWalletId

    const { walletStatus: status } = useWalletStore.getState()
    if (status === 'unlocked' || status === 'syncing') {
      return
    }

    autoUnlockWallet(activeWalletId, sessionPassword)
    // autoUnlockWallet omitted from deps: it is defined below and captures latest state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeWalletId,
    sessionPassword,
    networkMode,
    addressType,
    accountId,
    walletStatus,
  ])

  async function autoUnlockWallet(walletId: number, password: string) {
    try {
      if (networkMode === 'lab') {
        await loadDescriptorWalletWithoutSync({
          password,
          walletId,
          networkMode,
          addressType,
          accountId,
        })
      } else {
        await loadDescriptorWalletAndSync({
          password,
          walletId,
          networkMode,
          addressType,
          accountId,
          onSyncError: (err) => {
            const msg =
              err instanceof Error ? err.message : String(err)
            toast.error(msg || 'Sync failed — wallet unlocked but data may be stale')
          },
        })
      }
    } catch {
      setWalletStatus('locked')
      lastUnlockedWalletId.current = null
    }
  }

  return <>{children}</>
}
