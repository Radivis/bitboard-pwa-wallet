import { describe, expect, it } from 'vitest'
import {
  formatIntentFeePrograms,
  formatUnilateralUnrollSuccessMessage,
  parseCollaborativeExitAmountSats,
  shouldShowUnilateralUnrollProgressToast,
  unilateralUnrollProgressToastId,
} from '@/lib/arkade/arkade-exit-utils'

describe('formatIntentFeePrograms', () => {
  it('returns none configured when all flags are false', () => {
    expect(
      formatIntentFeePrograms({
        offchainInput: false,
        onchainInput: false,
        offchainOutput: false,
        onchainOutput: false,
      }),
    ).toBe('none configured')
  })

  it('lists enabled fee programs', () => {
    expect(
      formatIntentFeePrograms({
        offchainInput: true,
        onchainInput: false,
        offchainOutput: true,
        onchainOutput: false,
      }),
    ).toBe('offchain inputs, offchain outputs')
  })
})

describe('parseCollaborativeExitAmountSats', () => {
  it('accepts empty for full balance', () => {
    expect(parseCollaborativeExitAmountSats('')).toEqual({ ok: true, amountSats: undefined })
    expect(parseCollaborativeExitAmountSats('   ')).toEqual({ ok: true, amountSats: undefined })
  })

  it('accepts positive integer sats', () => {
    expect(parseCollaborativeExitAmountSats('10000')).toEqual({ ok: true, amountSats: 10_000 })
  })

  it('rejects decimal and non-integer input', () => {
    expect(parseCollaborativeExitAmountSats('0.0006').ok).toBe(false)
    expect(parseCollaborativeExitAmountSats('abc').ok).toBe(false)
    expect(parseCollaborativeExitAmountSats('0').ok).toBe(false)
  })
})

describe('unilateral unroll toast helpers', () => {
  it('formats success message with short txid prefix', () => {
    expect(
      formatUnilateralUnrollSuccessMessage(
        '587b597602803187e73cb30ca7791254a146755ee6435244d048c8d4072c72a5',
      ),
    ).toBe(
      'Unroll complete (587b59760280…) — complete exit after the timelock',
    )
  })

  it('shows info toasts for unroll and wait, not done', () => {
    expect(shouldShowUnilateralUnrollProgressToast({ type: 'unroll' })).toBe(true)
    expect(shouldShowUnilateralUnrollProgressToast({ type: 'wait' })).toBe(true)
    expect(shouldShowUnilateralUnrollProgressToast({ type: 'done' })).toBe(false)
  })

  it('uses txid-scoped toast ids', () => {
    expect(
      unilateralUnrollProgressToastId({
        type: 'unroll',
        txid: '587b597602803187e73cb30ca7791254a146755ee6435244d048c8d4072c72a5',
      }),
    ).toBe('arkade-unroll-587b597602803187e73cb30ca7791254a146755ee6435244d048c8d4072c72a5')
  })
})
