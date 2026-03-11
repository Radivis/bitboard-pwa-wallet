import { type ReactNode, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWallets } from '@/db'
import { loadDescriptorWalletAndSync } from '@/lib/wallet-utils'

interface AppInitializerProps {
  children: ReactNode
}

export function AppInitializer({ children }: AppInitializerProps) {
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
  const lastUnlockedWalletId = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) return

    const isSetupRoute = location.pathname.startsWith('/setup')
    const isWalletsRoute = location.pathname === '/wallets'
    const isSettingsRoute = location.pathname === '/settings'
    const isLabRoute = location.pathname.startsWith('/lab')

    if (!wallets || wallets.length === 0) {
      if (!isSetupRoute && !isSettingsRoute && !isLabRoute) {
        navigate({ to: '/setup' })
      }
      return
    }

    if (wallets.length === 1 && !activeWalletId) {
      setActiveWallet(wallets[0].wallet_id)
      if (isWalletsRoute) {
        navigate({ to: '/' })
      }
      return
    }

    if (wallets.length > 1 && !activeWalletId && !isWalletsRoute) {
      navigate({ to: '/wallets' })
    }
  }, [wallets, isLoading, activeWalletId, setActiveWallet, navigate, location.pathname])

  useEffect(() => {
    if (networkMode === 'lab') return
    if (!activeWalletId || !sessionPassword) return
    if (lastUnlockedWalletId.current === activeWalletId) return

    lastUnlockedWalletId.current = activeWalletId
    autoUnlockWallet(activeWalletId, sessionPassword)
  }, [activeWalletId, sessionPassword, networkMode])

  async function autoUnlockWallet(walletId: number, password: string) {
    try {
      await loadDescriptorWalletAndSync(
        password,
        walletId,
        networkMode,
        addressType,
        accountId,
      )
    } catch {
      setWalletStatus('locked')
      lastUnlockedWalletId.current = null
    }
  }

  return <>{children}</>
}
