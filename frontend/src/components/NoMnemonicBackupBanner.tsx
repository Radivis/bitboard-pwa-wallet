import { useState, useEffect, useLayoutEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWalletNoMnemonicBackupFlag } from '@/db'
import { useSessionStore } from '@/stores/sessionStore'
import { useWalletStore } from '@/stores/walletStore'

export function noMnemonicBackupBannerSessionDismissKey(walletId: number): string {
  return `bitboard_no_mnemonic_backup_banner_dismissed:${walletId}`
}

function sessionDismissKey(walletId: number): string {
  return noMnemonicBackupBannerSessionDismissKey(walletId)
}

function readDismissedForWallet(walletId: number | null): boolean {
  if (walletId === null || typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(sessionDismissKey(walletId)) === '1'
}

/**
 * Warning when the active wallet was created with "skip backup"; urges backing up the seed phrase from Management.
 */
export function NoMnemonicBackupBanner() {
  const location = useLocation()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const sessionPassword = useSessionStore((s) => s.password)
  const { data: noBackupFlagActive = false } = useWalletNoMnemonicBackupFlag(
    activeWalletId,
  )
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(readDismissedForWallet(activeWalletId))
  }, [activeWalletId])

  useLayoutEffect(() => {
    if (location.pathname !== '/wallet/receive') return
    if (activeWalletId === null || typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(sessionDismissKey(activeWalletId))
    setDismissed(false)
  }, [location.pathname, activeWalletId])

  if (location.pathname.startsWith('/setup')) {
    return null
  }

  if (!noBackupFlagActive || !sessionPassword || activeWalletId === null) {
    return null
  }

  if (dismissed) {
    return null
  }

  const handleDismissLater = () => {
    sessionStorage.setItem(sessionDismissKey(activeWalletId), '1')
    setDismissed(true)
  }

  return (
    <div
      role="alert"
      className="border-b border-red-900/80 bg-red-600 px-4 py-4 text-red-50 shadow-md dark:bg-red-950 dark:text-red-50"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle
            className="mt-0.5 h-7 w-7 shrink-0 text-red-100"
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold leading-snug">
              Seed phrase not backed up for this wallet
            </p>
            <p className="text-sm leading-relaxed text-red-100">
              Open Wallet → Management and reveal your seed phrase in a private
              place, then write it down and store it safely. Until you do,
              permanent loss of funds is a serious risk if you lose this device
              or your app password.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Button
            type="button"
            variant="secondary"
            className="bg-white text-red-900 hover:bg-red-50 dark:bg-red-100 dark:hover:bg-white"
            asChild
          >
            <Link to="/wallet/management">Back up seed phrase now</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto py-1 text-xs text-red-100 hover:bg-red-700/50 hover:text-white"
            onClick={handleDismissLater}
          >
            Remind me later
          </Button>
        </div>
      </div>
    </div>
  )
}
