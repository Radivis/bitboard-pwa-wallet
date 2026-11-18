import { describe, expect, it } from 'vitest'
import {
  DESIGN_WALLET_DRAWER_ID,
  networkOpenSwipeStartsOnWalletToggle,
  pointerStartedOnWalletDrawerToggle,
  walletDrawerSwipeMode,
} from '@/components/design/wallet-drawer-swipe'

describe('walletDrawerSwipeMode', () => {
  it('opens from a swipe that starts on the wallet icon', () => {
    expect(
      walletDrawerSwipeMode({ open: false, startedOnPanel: false, startedOnToggle: true }),
    ).toBe('open')
  })

  it('ignores a swipe that starts elsewhere while closed', () => {
    expect(
      walletDrawerSwipeMode({ open: false, startedOnPanel: false, startedOnToggle: false }),
    ).toBeNull()
  })

  it('closes only from a swipe that starts on the open panel', () => {
    expect(
      walletDrawerSwipeMode({ open: true, startedOnPanel: true, startedOnToggle: false }),
    ).toBe('close')
    expect(
      walletDrawerSwipeMode({ open: true, startedOnPanel: false, startedOnToggle: true }),
    ).toBeNull()
  })
})

describe('networkOpenSwipeStartsOnWalletToggle', () => {
  it('blocks a network open-swipe that starts on the wallet icon', () => {
    const walletIcon = document.createElement('button')
    walletIcon.setAttribute('aria-controls', DESIGN_WALLET_DRAWER_ID)
    const iconGlyph = document.createElement('svg')
    walletIcon.append(iconGlyph)
    document.body.append(walletIcon)

    expect(pointerStartedOnWalletDrawerToggle(iconGlyph)).toBe(true)
    expect(networkOpenSwipeStartsOnWalletToggle('open', iconGlyph)).toBe(true)
    expect(networkOpenSwipeStartsOnWalletToggle('close', iconGlyph)).toBe(false)

    walletIcon.remove()
  })

  it('leaves a swipe on the rest of the top bar to the network drawer', () => {
    const networkBadge = document.createElement('button')
    networkBadge.setAttribute('aria-controls', 'app-network-drawer')
    document.body.append(networkBadge)

    expect(pointerStartedOnWalletDrawerToggle(networkBadge)).toBe(false)
    expect(networkOpenSwipeStartsOnWalletToggle('open', networkBadge)).toBe(false)

    networkBadge.remove()
  })

  it('counts a text node inside the wallet icon', () => {
    const walletIcon = document.createElement('button')
    walletIcon.setAttribute('aria-controls', DESIGN_WALLET_DRAWER_ID)
    const label = document.createTextNode('Wallets')
    walletIcon.append(label)
    document.body.append(walletIcon)

    expect(pointerStartedOnWalletDrawerToggle(label)).toBe(true)

    walletIcon.remove()
  })
})
