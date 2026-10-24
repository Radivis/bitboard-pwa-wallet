/* eslint-disable react-refresh/only-export-components -- banner exports supporting props type with the component */
import { useState, useEffect, useLayoutEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { DesignBanner } from '@/components/design/DesignBanner'
import { useWalletNoMnemonicBackupFlag } from '@/db'
import { useWalletStore } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

export function noMnemonicBackupBannerSessionDismissKey(walletId: number): string {
  return `bitboard_no_mnemonic_backup_banner_dismissed:${walletId}`
}

function readDismissedForWallet(walletId: number | null): boolean {
  if (walletId === null || typeof sessionStorage === 'undefined') return false
  return (
    sessionStorage.getItem(noMnemonicBackupBannerSessionDismissKey(walletId)) === '1'
  )
}

/**
 * Warning when the active wallet was created with "skip backup"; urges backing up the seed phrase from Management.
 */
export function NoMnemonicBackupBanner() {
  const location = useLocation()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
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
    sessionStorage.removeItem(noMnemonicBackupBannerSessionDismissKey(activeWalletId))
    setDismissed(false)
  }, [location.pathname, activeWalletId])

  if (location.pathname.startsWith('/setup')) {
    return null
  }

  if (
    !noBackupFlagActive ||
    !walletIsUnlockedOrSyncing(walletStatus) ||
    activeWalletId === null
  ) {
    return null
  }

  if (dismissed) {
    return null
  }

  const handleDismissLater = () => {
    sessionStorage.setItem(
      noMnemonicBackupBannerSessionDismissKey(activeWalletId),
      '1',
    )
    setDismissed(true)
  }

  return (
    <DesignBanner
      role="alert"
      status="risk"
      className="mx-4 mt-4"
      title="Seed phrase not backed up for this wallet"
      description="Open Wallet → Management and reveal your seed phrase in a private place, then write it down and store it safely. Until you do, permanent loss of funds is a serious risk if you lose this device or your app password."
      primaryAction={{
        label: 'Back up seed phrase now',
        to: '/wallet/management',
      }}
      secondaryAction={{
        label: 'Remind me later',
        onClick: handleDismissLater,
      }}
    />
  )
}
