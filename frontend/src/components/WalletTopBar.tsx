import { useEffect, useState } from 'react'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { ChevronLeft, LockKeyhole, LockKeyholeOpen, Menu, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { DesignAppLogo } from '@/components/design/DesignAppLogo'
import { designFocusClassName } from '@/components/design/design-classes'
import { designNavBarSurfaceClassName } from '@/components/design/design-drawer-chrome'
import { DesignInfomodeToggle } from '@/components/design/DesignInfomodeToggle'
import {
  DESIGN_NETWORK_DRAWER_ID,
  NetworkChainBadge,
} from '@/components/design/DesignNetworkDrawer'
import { DESIGN_SIDE_DRAWER_ID } from '@/components/design/DesignSideDrawer'
import { DRAWER_NETWORK_LABELS } from '@/components/design/network-drawer-labels'
import { WalletUnlock } from '@/components/WalletUnlock'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { usePostLockWalletReturn } from '@/hooks/usePostLockWalletReturn'
import { useWallet, useWallets } from '@/db'
import { orchestrateLock } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import { reportWalletSaveBlockingLock } from '@/lib/wallet/wallet-save-error-toast'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { cn } from '@/lib/shared/utils'
import { selectCommittedNetworkMode, useWalletStore, type NetworkMode } from '@/stores/walletStore'

const APP_TITLE = 'Bitcoin Codex'

const LOCK_WALLET_INFO_TEXT =
  'Immediately clears sensitive keys from this app’s memory and returns you to a locked state. The next time you use Bitboard you will enter your app password again—handy on a shared computer or when you walk away from the device.'

const topBarHitTargetClassName = cn(
  'design-ui inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--design-text-regular)]',
  designFocusClassName,
)

export type WalletTopBarProps = {
  sideDrawerOpen: boolean
  networkDrawerOpen: boolean
  onToggleSideDrawer: () => void
  onToggleNetworkDrawer: () => void
}

export function WalletTopBar({
  sideDrawerOpen,
  networkDrawerOpen,
  onToggleSideDrawer,
  onToggleNetworkDrawer,
}: WalletTopBarProps) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [isLocking, setIsLocking] = useState(false)
  const { finishReturnAfterUnlock, returnWithoutPassword } = usePostLockWalletReturn()

  const committedNetwork = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const { data: wallets } = useWallets()
  const { data: activeWalletRow, isSuccess: activeWalletLoaded } = useWallet(activeWalletId)
  const walletDisplayName =
    activeWalletId && activeWalletLoaded && activeWalletRow?.name
      ? activeWalletRow.name
      : null
  const hasMultipleWallets = (wallets?.length ?? 0) > 1
  const walletIsOpen = walletIsUnlockedOrSyncing(walletStatus)
  const showNetwork = walletIsOpen
  const showLock = activeWalletId !== null
  const showWalletCapsule = showNetwork || hasMultipleWallets || showLock

  useEffect(() => {
    document.title =
      walletDisplayName !== null ? `${APP_TITLE}: ${walletDisplayName}` : APP_TITLE
  }, [walletDisplayName])

  const handleLockOrUnlock = async () => {
    if (!walletIsOpen) {
      if (returnWithoutPassword()) return
      setUnlockOpen(true)
      return
    }
    setIsLocking(true)
    try {
      await orchestrateLock()
      toast.success('Wallet locked')
    } catch (error) {
      if (!reportWalletSaveBlockingLock(error)) {
        throw error
      }
    } finally {
      setIsLocking(false)
    }
  }

  return (
    <header className={cn('sticky top-0 z-50', designNavBarSurfaceClassName)}>
      <div className="mx-auto grid h-14 max-w-screen-xl grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="sr-only">{APP_TITLE}</h1>
          {canGoBack && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.history.back()}
              className={topBarHitTargetClassName}
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
          )}
          <button type="button" aria-label="Home" className={topBarHitTargetClassName}>
            <DesignAppLogo />
          </button>
        </div>

        <div className="flex min-w-0 justify-center">
          {showWalletCapsule && (
            <div
              data-slot="wallet-top-bar-wallet"
              className="flex items-center gap-2 rounded-[30px] border border-[var(--design-wallet-group-stroke)]"
            >
              {showNetwork && (
                <NetworkBadgeButton
                  network={committedNetwork}
                  expanded={networkDrawerOpen}
                  onClick={onToggleNetworkDrawer}
                />
              )}
              {hasMultipleWallets && (
                <button type="button" aria-label="Wallets" className={topBarHitTargetClassName}>
                  <Wallet className="size-6" aria-hidden />
                </button>
              )}
              {hasMultipleWallets && walletDisplayName !== null && (
                <span className="design-ui hidden max-w-48 truncate text-base font-semibold text-[var(--design-text-regular)] md:block">
                  {walletDisplayName}
                </span>
              )}
              {showLock && (
                <InfomodeWrapper
                  as="span"
                  infoId="wallet-lock-wallet"
                  infoTitle="Lock wallet"
                  infoText={LOCK_WALLET_INFO_TEXT}
                  className="inline-flex"
                >
                  <button
                    type="button"
                    aria-label={walletIsOpen ? 'Lock Wallet' : 'Unlock wallet'}
                    disabled={isLocking}
                    onClick={() => void handleLockOrUnlock()}
                    className={topBarHitTargetClassName}
                  >
                    {walletIsOpen ? (
                      <LockKeyholeOpen className="size-6" aria-hidden />
                    ) : (
                      <LockKeyhole className="size-6" aria-hidden />
                    )}
                  </button>
                </InfomodeWrapper>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <DesignInfomodeToggle />
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={sideDrawerOpen}
            aria-controls={DESIGN_SIDE_DRAWER_ID}
            onClick={onToggleSideDrawer}
            className={topBarHitTargetClassName}
          >
            <Menu className="size-6" aria-hidden />
          </button>
        </div>
      </div>
      {unlockOpen && (
        <WalletUnlock
          walletName={walletDisplayName ?? undefined}
          onDismiss={() => setUnlockOpen(false)}
          onUnlockSuccess={() => {
            setUnlockOpen(false)
            finishReturnAfterUnlock()
          }}
        />
      )}
    </header>
  )
}

function NetworkBadgeButton({
  network,
  expanded,
  onClick,
}: {
  network: NetworkMode
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Network, ${DRAWER_NETWORK_LABELS[network]}`}
      aria-expanded={expanded}
      aria-controls={DESIGN_NETWORK_DRAWER_ID}
      onClick={onClick}
      className={topBarHitTargetClassName}
    >
      <NetworkChainBadge network={network} size="header" />
    </button>
  )
}
