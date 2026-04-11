import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'
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
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let top = anchorRect.bottom + GAP_PX
  let left = anchorRect.left

  if (top + popupRect.height > viewportHeight - VIEWPORT_MARGIN_PX) {
    top = anchorRect.top - popupRect.height - GAP_PX
  }
  if (left + popupRect.width > viewportWidth - VIEWPORT_MARGIN_PX) {
    left = viewportWidth - popupRect.width - VIEWPORT_MARGIN_PX
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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
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

  useLayoutEffect(() => {
    if (!open || !anchorElement || !entry) {
      return
    }
    const elementToRestore =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      elementToRestore?.focus({ preventScroll: true })
    }
  }, [open, anchorElement, entry])

  useEffect(() => {
    if (!open) {
      return
    }
    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      onRequestClose()
    }
    document.addEventListener('keydown', handleDocumentKeyDown, true)
    return () => document.removeEventListener('keydown', handleDocumentKeyDown, true)
  }, [open, onRequestClose])

  if (!open || !anchorElement || !entry) {
    return null
  }

  const content =
    entry.kind === 'inline' ? (
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-tight text-popover-foreground">
          {entry.title}
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {entry.text}
        </p>
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
        /* Do not add `relative` here — tailwind-merge would drop `fixed` and break viewport positioning. */
        'bg-popover py-3 pl-4 pr-11 text-popover-foreground shadow-lg',
      )}
      style={{ top: position.top, left: position.left }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onRequestClose}
        aria-label="Close explanation"
        className={cn(
          'absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground opacity-60',
          'transition-[opacity,background-color,color] hover:bg-accent/80 hover:text-foreground hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        )}
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </button>
      {content}
    </div>,
    document.body,
  )
}
