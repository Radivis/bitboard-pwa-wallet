import { describe, it, expect } from 'vitest'
import { pathnameIsWalletRoute } from '@/lib/shared/pathname-is-wallet-route'

describe('pathnameIsWalletRoute', () => {
  it('returns true for wallet dashboard paths', () => {
    expect(pathnameIsWalletRoute('/wallet')).toBe(true)
    expect(pathnameIsWalletRoute('/wallet/send')).toBe(true)
    expect(pathnameIsWalletRoute('/wallet/wallets')).toBe(true)
  })

  it('returns false for non-wallet paths', () => {
    expect(pathnameIsWalletRoute('/')).toBe(false)
    expect(pathnameIsWalletRoute('/guides')).toBe(false)
    expect(pathnameIsWalletRoute('/guides/introduction')).toBe(false)
    expect(pathnameIsWalletRoute('/settings')).toBe(false)
    expect(pathnameIsWalletRoute('/settings/security')).toBe(false)
    expect(pathnameIsWalletRoute('/lab')).toBe(false)
    expect(pathnameIsWalletRoute('/lab/blocks')).toBe(false)
    expect(pathnameIsWalletRoute('/library')).toBe(false)
    expect(pathnameIsWalletRoute('/setup')).toBe(false)
    expect(pathnameIsWalletRoute('/privacy')).toBe(false)
  })
})
