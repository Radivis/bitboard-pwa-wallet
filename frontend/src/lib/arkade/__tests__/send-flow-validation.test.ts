import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/arkade/arkade-address', () => ({
  isValidArkadeAddress: (address: string) => address.startsWith('tark1'),
}))

vi.mock('@/lib/lightning/send-flow-validation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/lightning/send-flow-validation')>()
  return {
    ...actual,
    isLightningSendMode: (lightningAvailable: boolean, normalizedRecipient: string) =>
      lightningAvailable && normalizedRecipient.startsWith('lntbs'),
    isSendRecipientFormatValid: ({
      normalizedRecipient,
      networkMode,
    }: {
      normalizedRecipient: string
      networkMode: string
      lightningAvailable: boolean
    }) =>
      networkMode === 'signet' &&
      (normalizedRecipient.startsWith('tb1') ||
        normalizedRecipient.startsWith('lntbs')),
  }
})

import {
  canBuildArkadeSend,
  isArkadeSendMode,
  isSendRecipientFormatValidWithArkade,
} from '@/lib/arkade/send-flow-validation'

const arkRecipient = 'tark1qvalidaddress'
const lnInvoice = 'lntbs1testinvoice'
const onChainRecipient = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

describe('isArkadeSendMode', () => {
  it('is true for valid ark address when arkade is available', () => {
    expect(isArkadeSendMode(true, arkRecipient, true)).toBe(true)
  })

  it('is false when lightning destination takes priority', () => {
    expect(isArkadeSendMode(true, lnInvoice, true)).toBe(false)
  })

  it('is false when arkade is unavailable', () => {
    expect(isArkadeSendMode(false, arkRecipient, true)).toBe(false)
  })
})

describe('isSendRecipientFormatValidWithArkade', () => {
  it('accepts on-chain, lightning, and arkade formats', () => {
    expect(
      isSendRecipientFormatValidWithArkade({
        normalizedRecipient: onChainRecipient,
        networkMode: 'signet',
        lightningAvailable: true,
        arkadeAvailable: true,
      }),
    ).toBe(true)
    expect(
      isSendRecipientFormatValidWithArkade({
        normalizedRecipient: lnInvoice,
        networkMode: 'signet',
        lightningAvailable: true,
        arkadeAvailable: true,
      }),
    ).toBe(true)
    expect(
      isSendRecipientFormatValidWithArkade({
        normalizedRecipient: arkRecipient,
        networkMode: 'signet',
        lightningAvailable: true,
        arkadeAvailable: true,
      }),
    ).toBe(true)
  })
})

describe('canBuildArkadeSend', () => {
  const base = {
    isArkadeSendMode: true,
    normalizedRecipient: arkRecipient,
    amountSats: 10_000,
    recipientFormatValid: true,
    arkadeConfirmedBalanceSats: 100_000,
    arkadeBalanceQuerySuccess: true,
    networkMode: 'signet' as const,
  }

  it('allows valid arkade send', () => {
    expect(canBuildArkadeSend(base)).toBe(true)
  })

  it('rejects lab network', () => {
    expect(canBuildArkadeSend({ ...base, networkMode: 'lab' })).toBe(false)
  })

  it('rejects amount above arkade balance', () => {
    expect(
      canBuildArkadeSend({ ...base, amountSats: 200_000 }),
    ).toBe(false)
  })
})
