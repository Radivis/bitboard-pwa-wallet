import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { InfomodeRegistryEntry } from '@/components/infomode/infomode-types'

const VIEWPORT_MARGIN_PX = 8
const GAP_PX = 8

interface InfomodePopupProps {
  open: boolean
  anchorElement: HTMLElement | null
  entry: InfomodeRegistryEntry | null
  onRequestClose: () => void
}

function computePopupPosition(
  anchorElement: HTMLElement,
  popupElement: HTMLElement,
): { top: number; left: number } {
  const anchorRect = anchorElement.getBoundingClientRect()
  const popupRect = popupElement.getBoundingClientRect()
  const vpW = window.innerWidth
  const vpH = window.innerHeight

  let top = anchorRect.bottom + GAP_PX
  let left = anchorRect.left

  if (top + popupRect.height > vpH - VIEWPORT_MARGIN_PX) {
    top = anchorRect.top - popupRect.height - GAP_PX
  }
  if (left + popupRect.width > vpW - VIEWPORT_MARGIN_PX) {
    left = vpW - popupRect.width - VIEWPORT_MARGIN_PX
  }
  if (left < VIEWPORT_MARGIN_PX) {
    left = VIEWPORT_MARGIN_PX
  }
  if (top < VIEWPORT_MARGIN_PX) {
    top = VIEWPORT_MARGIN_PX
  }

  return { top, left }
}

export function InfomodePopup({
  open,
  anchorElement,
  entry,
  onRequestClose,
}: InfomodePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !anchorElement || !popupRef.current) {
      return
    }

    function updatePosition() {
      if (!anchorElement || !popupRef.current) {
        return
      }
      setPosition(computePopupPosition(anchorElement, popupRef.current))
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, anchorElement, entry])

  if (!open || !anchorElement || !entry) {
    return null
  }

  const content =
    entry.kind === 'inline' ? (
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-tight text-popover-foreground">
          {entry.title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.text}</p>
      </div>
    ) : (
      <entry.Content />
    )

  return createPortal(
    <div
      ref={popupRef}
      data-infomode-popup=""
      role="dialog"
      aria-modal="false"
      aria-label="Infomode explanation"
      className={cn(
        'fixed z-[100] max-h-[min(50vh,24rem)] w-[min(calc(100vw-2rem),20rem)] overflow-y-auto rounded-lg border border-border',
        'bg-popover p-4 text-popover-foreground shadow-lg',
      )}
      style={{ top: position.top, left: position.left }}
    >
      {content}
      <button
        type="button"
        className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={onRequestClose}
      >
        Close
      </button>
    </div>,
    document.body,
  )
}
