export type InfomodePopupPlacement = 'pointer' | 'anchor'

export type InfomodePopupAnchorBox = {
  top: number
  left: number
  bottom: number
}

type PopupSizeAndViewport = {
  popupWidth: number
  popupHeight: number
  viewportWidth: number
  viewportHeight: number
}

export type InfomodePopupPositionInput = PopupSizeAndViewport &
  (
    | {
        placement: 'pointer'
        pointerX: number
        pointerY: number
      }
    | {
        placement: 'anchor'
        anchorBox: InfomodePopupAnchorBox
      }
  )

const VIEWPORT_MARGIN_PX = 8
const ANCHOR_GAP_PX = 8

/**
 * Pointer clicks pin the top-left corner to the pointer when the full popup
 * fits below it, and the bottom edge to the pointer otherwise. Keyboard
 * activation keeps the popup just below the anchor, or just above it when
 * that does not fit. Horizontal position starts at the pointer or the anchor's
 * left edge and shifts only to stay inside the viewport margin.
 */
export function computeInfomodePopupPosition(
  input: InfomodePopupPositionInput,
): { top: number; left: number } {
  const leftOrigin = input.placement === 'pointer' ? input.pointerX : input.anchorBox.left
  const top =
    input.placement === 'pointer'
      ? topForPointer(input.pointerY, input.popupHeight, input.viewportHeight)
      : topForAnchor(input.anchorBox, input.popupHeight, input.viewportHeight)

  return {
    top,
    left: leftWithinViewport(leftOrigin, input.popupWidth, input.viewportWidth),
  }
}

function topForPointer(pointerY: number, popupHeight: number, viewportHeight: number): number {
  const spaceBelowPointer = viewportHeight - VIEWPORT_MARGIN_PX - pointerY
  if (spaceBelowPointer >= popupHeight) {
    return pointerY
  }

  const upwardTop = pointerY - popupHeight
  if (upwardTop < VIEWPORT_MARGIN_PX) {
    return VIEWPORT_MARGIN_PX
  }
  return upwardTop
}

function topForAnchor(
  anchorBox: InfomodePopupAnchorBox,
  popupHeight: number,
  viewportHeight: number,
): number {
  let top = anchorBox.bottom + ANCHOR_GAP_PX
  if (top + popupHeight > viewportHeight - VIEWPORT_MARGIN_PX) {
    top = anchorBox.top - popupHeight - ANCHOR_GAP_PX
  }
  if (top < VIEWPORT_MARGIN_PX) {
    return VIEWPORT_MARGIN_PX
  }
  return top
}

function leftWithinViewport(left: number, popupWidth: number, viewportWidth: number): number {
  const maxLeft = viewportWidth - popupWidth - VIEWPORT_MARGIN_PX
  if (left > maxLeft) {
    return Math.max(maxLeft, VIEWPORT_MARGIN_PX)
  }
  if (left < VIEWPORT_MARGIN_PX) {
    return VIEWPORT_MARGIN_PX
  }
  return left
}
