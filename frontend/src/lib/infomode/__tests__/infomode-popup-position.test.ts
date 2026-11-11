import { describe, expect, it } from 'vitest'
import { computeInfomodePopupPosition } from '@/lib/infomode/infomode-popup-position'

const VIEWPORT_MARGIN_PX = 8
const ANCHOR_GAP_PX = 8

const viewport = {
  viewportWidth: 800,
  viewportHeight: 600,
}

const popupSize = {
  popupWidth: 200,
  popupHeight: 120,
}

describe('computeInfomodePopupPosition', () => {
  it('places the top-left corner on the pointer when the popup fits below', () => {
    expect(
      computeInfomodePopupPosition({
        placement: 'pointer',
        pointerX: 40,
        pointerY: 80,
        ...popupSize,
        ...viewport,
      }),
    ).toEqual({ top: 80, left: 40 })
  })

  it('places the bottom edge on the pointer when the popup does not fit below', () => {
    const pointerY = 520
    const position = computeInfomodePopupPosition({
      placement: 'pointer',
      pointerX: 40,
      pointerY,
      ...popupSize,
      ...viewport,
    })

    expect(position).toEqual({ top: pointerY - popupSize.popupHeight, left: 40 })
    expect(position.top + popupSize.popupHeight).toBe(pointerY)
  })

  it('clamps the top to the viewport margin when upward placement would leave the viewport', () => {
    expect(
      computeInfomodePopupPosition({
        placement: 'pointer',
        pointerX: 40,
        pointerY: 100,
        popupWidth: popupSize.popupWidth,
        popupHeight: 550,
        ...viewport,
      }),
    ).toEqual({ top: VIEWPORT_MARGIN_PX, left: 40 })
  })

  it('shifts the popup left when the pointer is near the right edge', () => {
    const pointerX = 700
    const position = computeInfomodePopupPosition({
      placement: 'pointer',
      pointerX,
      pointerY: 40,
      ...popupSize,
      ...viewport,
    })

    expect(pointerX + popupSize.popupWidth).toBeGreaterThan(
      viewport.viewportWidth - VIEWPORT_MARGIN_PX,
    )
    expect(position).toEqual({
      top: 40,
      left: viewport.viewportWidth - popupSize.popupWidth - VIEWPORT_MARGIN_PX,
    })
  })

  it('clamps the left edge to the viewport margin when the pointer is near the left edge', () => {
    expect(
      computeInfomodePopupPosition({
        placement: 'pointer',
        pointerX: 2,
        pointerY: 40,
        ...popupSize,
        ...viewport,
      }),
    ).toEqual({ top: 40, left: VIEWPORT_MARGIN_PX })
  })

  it('places the popup below the anchor for keyboard activation when it fits', () => {
    const anchorBox = { top: 100, left: 48, bottom: 140 }

    expect(
      computeInfomodePopupPosition({
        placement: 'anchor',
        anchorBox,
        ...popupSize,
        ...viewport,
      }),
    ).toEqual({ top: anchorBox.bottom + ANCHOR_GAP_PX, left: anchorBox.left })
  })

  it('places the popup above the anchor for keyboard activation when it does not fit below', () => {
    const anchorBox = { top: 500, left: 48, bottom: 540 }

    expect(
      computeInfomodePopupPosition({
        placement: 'anchor',
        anchorBox,
        ...popupSize,
        ...viewport,
      }),
    ).toEqual({
      top: anchorBox.top - popupSize.popupHeight - ANCHOR_GAP_PX,
      left: anchorBox.left,
    })
  })
})
