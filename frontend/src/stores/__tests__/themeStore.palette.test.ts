import { describe, it, expect } from 'vitest'
import { isWalletThemePaletteActive } from '../themeStore'

describe('isWalletThemePaletteActive', () => {
  it('returns false when there is no active wallet', () => {
    expect(isWalletThemePaletteActive(null, 'none')).toBe(false)
    expect(isWalletThemePaletteActive(null, 'locked')).toBe(false)
    expect(isWalletThemePaletteActive(null, 'unlocked')).toBe(false)
    expect(isWalletThemePaletteActive(null, 'syncing')).toBe(false)
  })

  it('returns false when wallet is locked or none despite an active id', () => {
    expect(isWalletThemePaletteActive(1, 'locked')).toBe(false)
    expect(isWalletThemePaletteActive(1, 'none')).toBe(false)
  })

  it('returns true when unlocked or syncing with an active wallet', () => {
    expect(isWalletThemePaletteActive(1, 'unlocked')).toBe(true)
    expect(isWalletThemePaletteActive(42, 'syncing')).toBe(true)
  })
})
