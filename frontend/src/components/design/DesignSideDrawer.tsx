import { useEffect, useRef, type RefObject } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

import { DesignNavButton } from '@/components/design/DesignNavButton'
import { DesignThemeSwitcher } from '@/components/design/DesignThemeSwitcher'
import {
  designDrawerBackdropClassName,
  designDrawerPanelClassName,
  DrawerSectionLabel,
} from '@/components/design/design-drawer-chrome'
import { useDrawerEscape } from '@/components/design/use-drawer-escape'
import {
  DRAWER_ENTER_FROM_RIGHT_CLASS,
  DRAWER_EXIT_TO_RIGHT_CLASS,
  useDrawerPresence,
} from '@/components/design/use-drawer-presence'
import { cn } from '@/lib/shared/utils'

export const DESIGN_SIDE_DRAWER_ID = 'app-side-drawer'

const DRAWER_EDGE_WIDTH_PX = 24
const DRAWER_SWIPE_DISTANCE_PX = 48

type DrawerSwipeGesture = {
  startX: number
  startY: number
  pointerId: number
  mode: 'open' | 'close'
}

export type DesignDrawerNavItem = {
  to: string
  label: string
  icon: LucideIcon
  selected: boolean
  linkPreload?: false
}

type DesignSideDrawerProps = {
  open: boolean
  onOpen: () => void
  onClose: () => void
  navItems: DesignDrawerNavItem[]
}

export function DesignSideDrawer({ open, onOpen, onClose, navItems }: DesignSideDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { mounted, motion } = useDrawerPresence(open)
  useSideDrawerSwipe({ open, panelRef, onOpen, onClose })
  useDrawerEscape(open, onClose)

  if (!mounted) return null

  return (
    <>
      <div
        data-testid="design-side-drawer-backdrop"
        className={designDrawerBackdropClassName}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={DESIGN_SIDE_DRAWER_ID}
        role="dialog"
        aria-label="Menu"
        aria-modal="false"
        aria-hidden={motion === 'exit' || undefined}
        tabIndex={-1}
        data-slot="design-side-drawer"
        data-motion={motion}
        className={cn(
          designDrawerPanelClassName,
          motion === 'enter' ? DRAWER_ENTER_FROM_RIGHT_CLASS : DRAWER_EXIT_TO_RIGHT_CLASS,
          motion === 'exit' && 'pointer-events-none',
        )}
      >
        <div className="flex flex-col gap-2">
          <DrawerSectionLabel>Theme</DrawerSectionLabel>
          <DesignThemeSwitcher />
        </div>
        <div className="h-px bg-[var(--design-drawer-divider)]" />
        <DrawerSectionLabel>Navigation</DrawerSectionLabel>
        <div className="flex flex-col gap-2">
          {navItems.map((item) => (
            <DrawerNavLink key={item.to} item={item} onClose={onClose} />
          ))}
        </div>
      </div>
    </>
  )
}

function DrawerNavLink({ item, onClose }: { item: DesignDrawerNavItem; onClose: () => void }) {
  const Icon = item.icon
  return (
    <DesignNavButton
      asChild
      status={item.selected ? 'selected' : 'default'}
      className="w-full justify-start"
    >
      <Link to={item.to} preload={item.linkPreload} onClick={onClose}>
        <Icon aria-hidden />
        {item.label}
      </Link>
    </DesignNavButton>
  )
}

function useSideDrawerSwipe({
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
    let gesture: DrawerSwipeGesture | null = null

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return
      gesture = gestureForPointerDown(event, open, panelRef.current)
    }

    function handlePointerUp(event: PointerEvent) {
      if (gesture == null || gesture.pointerId !== event.pointerId) return
      const completedGesture = gesture
      gesture = null
      applyDrawerSwipe(completedGesture, event, onOpenRef.current, onCloseRef.current)
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

function gestureForPointerDown(
  event: PointerEvent,
  open: boolean,
  panel: HTMLDivElement | null,
): DrawerSwipeGesture | null {
  const target = event.target
  const startedOnPanel = panel != null && target instanceof Node && panel.contains(target)
  if (open && startedOnPanel) {
    return { startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mode: 'close' }
  }

  const startedOnRightEdge = window.innerWidth - event.clientX <= DRAWER_EDGE_WIDTH_PX
  if (!open && startedOnRightEdge) {
    return { startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mode: 'open' }
  }

  return null
}

function applyDrawerSwipe(
  gesture: DrawerSwipeGesture,
  event: PointerEvent,
  onOpen: () => void,
  onClose: () => void,
) {
  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  const horizontalSwipe = Math.abs(deltaX) >= DRAWER_SWIPE_DISTANCE_PX && Math.abs(deltaX) > Math.abs(deltaY)
  if (!horizontalSwipe) return
  if (gesture.mode === 'open' && deltaX < 0) onOpen()
  if (gesture.mode === 'close' && deltaX > 0) onClose()
}
