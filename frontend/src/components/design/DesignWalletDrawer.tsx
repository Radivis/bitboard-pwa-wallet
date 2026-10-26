import { useEffect, useRef, type RefObject } from 'react'

import { DesignNavButton } from '@/components/design/DesignNavButton'
import {
  designDrawerBackdropClassName,
  designDrawerPanelClassName,
  DrawerSectionLabel,
} from '@/components/design/design-drawer-chrome'
import { useDrawerEscape } from '@/components/design/use-drawer-escape'
import {
  DRAWER_ENTER_FROM_TOP_CLASS,
  DRAWER_EXIT_TO_TOP_CLASS,
  useDrawerPresence,
} from '@/components/design/use-drawer-presence'
import {
  DESIGN_WALLET_DRAWER_ID,
  pointerStartedOnWalletDrawerToggle,
  walletDrawerSwipeMode,
} from '@/components/design/wallet-drawer-swipe'
import { useWallets } from '@/db'
import { cn } from '@/lib/shared/utils'
import { useWalletStore } from '@/stores/walletStore'

export { DESIGN_WALLET_DRAWER_ID }

const DRAWER_SWIPE_DISTANCE_PX = 48

type DesignWalletDrawerProps = {
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSelectWallet: (walletId: number) => void
  isSwitching?: boolean
}

export function DesignWalletDrawer({
  open,
  onOpen,
  onClose,
  onSelectWallet,
  isSwitching = false,
}: DesignWalletDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { mounted, motion } = useDrawerPresence(open)
  const { data: wallets = [] } = useWallets()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  useWalletDrawerSwipe({ open, panelRef, onOpen, onClose })
  useDrawerEscape(open, onClose)

  if (!mounted) return null

  return (
    <>
      <div
        data-testid="design-wallet-drawer-backdrop"
        className={designDrawerBackdropClassName}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={DESIGN_WALLET_DRAWER_ID}
        role="dialog"
        aria-label="Select wallet"
        aria-modal="false"
        aria-hidden={motion === 'exit' || undefined}
        tabIndex={-1}
        data-slot="design-wallet-drawer"
        data-motion={motion}
        className={cn(
          designDrawerPanelClassName,
          motion === 'enter' ? DRAWER_ENTER_FROM_TOP_CLASS : DRAWER_EXIT_TO_TOP_CLASS,
          motion === 'exit' && 'pointer-events-none',
        )}
      >
        <div className="flex flex-col gap-2">
          <DrawerSectionLabel>Select wallet</DrawerSectionLabel>
          {wallets.map((wallet) => (
            <DesignNavButton
              key={wallet.walletId}
              status={wallet.walletId === activeWalletId ? 'selected' : 'default'}
              className="w-full min-w-0 shrink justify-start overflow-hidden"
              disabled={isSwitching}
              onClick={() => onSelectWallet(wallet.walletId)}
            >
              <span className="min-w-0 truncate">{wallet.name}</span>
            </DesignNavButton>
          ))}
        </div>
      </div>
    </>
  )
}

function useWalletDrawerSwipe({
  open,
  panelRef,
  onOpen,
  onClose,
}: {
  open: boolean
  panelRef: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onClose: () => void
}) {
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  onOpenRef.current = onOpen
  onCloseRef.current = onClose

  useEffect(() => {
    let gesture: { startX: number; startY: number; pointerId: number; mode: 'open' | 'close' } | null =
      null

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return
      gesture = gestureForWalletPointerDown(event, open, panelRef.current)
    }

    function handlePointerUp(event: PointerEvent) {
      if (gesture == null || gesture.pointerId !== event.pointerId) return
      const completedGesture = gesture
      gesture = null
      applyWalletDrawerSwipe(completedGesture, event, onOpenRef.current, onCloseRef.current)
    }

    function handlePointerCancel(event: PointerEvent) {
      if (gesture?.pointerId === event.pointerId) gesture = null
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [open, panelRef])
}

function gestureForWalletPointerDown(
  event: PointerEvent,
  open: boolean,
  panel: HTMLDivElement | null,
) {
  const target = event.target
  const startedOnPanel = panel != null && target instanceof Node && panel.contains(target)
  const mode = walletDrawerSwipeMode({
    open,
    startedOnPanel,
    startedOnToggle: pointerStartedOnWalletDrawerToggle(target),
  })
  if (mode == null) return null
  return { startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mode }
}

function applyWalletDrawerSwipe(
  gesture: { startX: number; startY: number; mode: 'open' | 'close' },
  event: PointerEvent,
  onOpen: () => void,
  onClose: () => void,
) {
  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  const verticalSwipe = Math.abs(deltaY) >= DRAWER_SWIPE_DISTANCE_PX && Math.abs(deltaY) > Math.abs(deltaX)
  if (!verticalSwipe) return
  if (gesture.mode === 'open' && deltaY > 0) onOpen()
  if (gesture.mode === 'close' && deltaY < 0) onClose()
}
