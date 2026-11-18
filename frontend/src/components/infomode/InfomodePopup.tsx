import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'
import { designFocusClassName } from '@/components/design/design-classes'
import type { InfomodeRegistryEntry } from '@/components/infomode/infomode-types'
import {
  computeInfomodePopupPosition,
  type InfomodePopupPlacement,
} from '@/lib/infomode/infomode-popup-position'

interface InfomodePopupProps {
  open: boolean
  anchorElement: HTMLElement | null
  placement: InfomodePopupPlacement
  pointerX: number
  pointerY: number
  entry: InfomodeRegistryEntry | null
  onRequestClose: () => void
}

function measurePopupPosition(
  popupElement: HTMLElement,
  anchorElement: HTMLElement,
  placement: InfomodePopupPlacement,
  pointerX: number,
  pointerY: number,
): { top: number; left: number } {
  const popupRect = popupElement.getBoundingClientRect()
  const popupSizeAndViewport = {
    popupWidth: popupRect.width,
    popupHeight: popupRect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }

  if (placement === 'pointer') {
    return computeInfomodePopupPosition({
      placement,
      pointerX,
      pointerY,
      ...popupSizeAndViewport,
    })
  }

  const anchorRect = anchorElement.getBoundingClientRect()
  return computeInfomodePopupPosition({
    placement,
    anchorBox: {
      top: anchorRect.top,
      left: anchorRect.left,
      bottom: anchorRect.bottom,
    },
    ...popupSizeAndViewport,
  })
}

export function InfomodePopup({
  open,
  anchorElement,
  placement,
  pointerX,
  pointerY,
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
      setPosition(
        measurePopupPosition(popupRef.current, anchorElement, placement, pointerX, pointerY),
      )
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, anchorElement, entry, placement, pointerX, pointerY])

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
      <div className="contents">
        <h2 className="design-type-emphasis text-[var(--design-text-regular)]">
          {entry.title}
        </h2>
        <p className="design-type-regular whitespace-pre-line text-[var(--design-text-subdued)]">
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
      /* Do not add `relative` here — tailwind-merge would drop `fixed` and break viewport positioning. */
      className="design-ui fixed z-[100]"
      style={{ top: position.top, left: position.left }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onRequestClose}
        aria-label="Close explanation"
        className={designFocusClassName}
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </button>
      {content}
    </div>,
    document.body,
  )
}
