import { describe, it, expect } from 'vitest'
import { pathnameIsWalletRoute } from '@/lib/shared/pathname-is-wallet-route'

describe('pathnameIsWalletRoute', () => {
  it('returns true for wallet dashboard paths', () => {
    expect(pathnameIsWalletRoute('/')).toBe(true)
    expect(pathnameIsWalletRoute('/wallet')).toBe(true)
    expect(pathnameIsWalletRoute('/wallet/send')).toBe(true)
    expect(pathnameIsWalletRoute('/wallet/wallets')).toBe(true)
  })

  it('returns false for non-wallet paths', () => {
    expect(pathnameIsWalletRoute('/settings')).toBe(false)
    expect(pathnameIsWalletRoute('/settings/security')).toBe(false)
    expect(pathnameIsWalletRoute('/lab')).toBe(false)
    expect(pathnameIsWalletRoute('/lab/blocks')).toBe(false)
    expect(pathnameIsWalletRoute('/library')).toBe(false)
    expect(pathnameIsWalletRoute('/setup')).toBe(false)
    expect(pathnameIsWalletRoute('/privacy')).toBe(false)
  })
})
