import { describe, expect, it } from 'vitest'
import {
  toUserFriendlyWalletSecretsError,
  tryMapWalletSecretsError,
} from '@/lib/wallet/wallet-secrets-error-messages'

describe('wallet-secrets-error-messages', () => {
  it('maps decrypt failures to password copy', () => {
    expect(
      tryMapWalletSecretsError(
        new Error('Decryption failed: incorrect password or corrupted data'),
      ),
    ).toBe('Wrong password or corrupted wallet data')
  })

  it('maps schema validation failures to password copy', () => {
    expect(
      tryMapWalletSecretsError(
        new Error('Invalid wallet secrets payload: schema validation failed'),
      ),
    ).toBe('Wrong password or corrupted wallet data')
  })

  it('returns null for unrelated errors', () => {
    expect(tryMapWalletSecretsError(new Error('Mutinynet operator unreachable'))).toBeNull()
  })

  it('passes through unrelated unlock errors', () => {
    expect(toUserFriendlyWalletSecretsError(new Error('Mutinynet operator unreachable'))).toBe(
      'Mutinynet operator unreachable',
    )
  })
})
