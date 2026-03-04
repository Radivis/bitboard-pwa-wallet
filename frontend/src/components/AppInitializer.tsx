import { type ReactNode, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore, startAutoLockTimer } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWallets, getDatabase, ensureMigrated, loadWalletSecrets } from '@/db'
import { getEsploraUrl, toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet-utils'

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
  const setBalance = useWalletStore((s) => s.setBalance)
  const setTransactions = useWalletStore((s) => s.setTransactions)
  const networkMode = useWalletStore((s) => s.networkMode)
  const sessionPassword = useSessionStore((s) => s.password)
  const autoUnlockAttempted = useRef(false)

  const loadWallet = useCryptoStore((s) => s.loadWallet)
  const syncWallet = useCryptoStore((s) => s.syncWallet)
  const getBalance = useCryptoStore((s) => s.getBalance)
  const getTransactionList = useCryptoStore((s) => s.getTransactionList)

  useEffect(() => {
    if (isLoading) return

    const isSetupRoute = location.pathname.startsWith('/setup')

    if (!wallets || wallets.length === 0) {
      if (!isSetupRoute) {
        navigate({ to: '/setup' })
      }
      return
    }

    if (!activeWalletId) {
      setActiveWallet(wallets[0].wallet_id)
    }
  }, [wallets, isLoading, activeWalletId, setActiveWallet, navigate, location.pathname])

  useEffect(() => {
    if (!activeWalletId || !sessionPassword || autoUnlockAttempted.current) return

    autoUnlockAttempted.current = true
    autoUnlockWallet(activeWalletId, sessionPassword)
  }, [activeWalletId, sessionPassword])

  async function autoUnlockWallet(walletId: number, password: string) {
    try {
      await ensureMigrated()
      const db = getDatabase()
      const secrets = await loadWalletSecrets(db, password, walletId)

      await loadWallet(
        secrets.externalDescriptor,
        secrets.internalDescriptor,
        toBitcoinNetwork(networkMode),
        secrets.changeSet,
      )

      setWalletStatus('unlocked')

      startAutoLockTimer(() => {
        useWalletStore.getState().lockWallet()
      })

      try {
        const customUrl = await loadCustomEsploraUrl(networkMode)
        const esploraUrl = getEsploraUrl(networkMode, customUrl)
        await syncWallet(esploraUrl)

        const balance = await getBalance()
        const txs = await getTransactionList()
        setBalance(balance)
        setTransactions(txs)
      } catch {
        // Sync failure is non-fatal during auto-unlock
      }
    } catch {
      setWalletStatus('locked')
    }
  }

  return <>{children}</>
}
