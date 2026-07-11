import { describe, expect, it } from 'vitest'
import {
  formatIntentFeePrograms,
  formatMissingBlocktimeCompletionWarning,
  formatMissingBlocktimeCompletionWarningLine,
  formatUnilateralExitTimelock,
  formatUnilateralUnrollSuccessMessage,
  isOperatorIndexerCatchingUpError,
  parseCollaborativeExitAmountSats,
  shouldShowUnilateralUnrollProgressToast,
  unilateralExitCompleteTimelockMessage,
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
      'Unroll complete (587b59760280…). Use Complete unilateral exit when the timelock elapses.',
    )
  })

  it('notes indexer lag in success message when warning present', () => {
    expect(
      formatUnilateralUnrollSuccessMessage('587b597602803187e73cb30ca7791254a146755ee6435244d048c8d4072c72a5', {
        indexerWarning: 'Operator indexer has not caught up.',
      }),
    ).toContain('Operator indexer is still catching up')
  })

  it('shows info toasts for unroll, wait, and indexer progress', () => {
    expect(shouldShowUnilateralUnrollProgressToast({ type: 'unroll' })).toBe(true)
    expect(shouldShowUnilateralUnrollProgressToast({ type: 'wait' })).toBe(true)
    expect(shouldShowUnilateralUnrollProgressToast({ type: 'indexer' })).toBe(true)
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

describe('unilateral exit timelock display', () => {
  it('formats block-based operator delay', () => {
    expect(formatUnilateralExitTimelock({ timelockBlocks: 20 })).toBe('20 block confirmations')
  })

  it('formats time-based operator delay', () => {
    expect(formatUnilateralExitTimelock({ timelockSeconds: 172_544 })).toBe('2 days')
  })

  it('describes waiting period on complete step', () => {
    expect(
      unilateralExitCompleteTimelockMessage({ timelockBlocks: 144 }, false),
    ).toContain('144 block confirmations')
  })

  it('notes when timelock is already satisfied', () => {
    expect(unilateralExitCompleteTimelockMessage({ timelockBlocks: 144 }, true)).toContain(
      'satisfied',
    )
  })
})

describe('missing blocktime completion warning', () => {
  const virtualTxid = 'aa'.repeat(32)
  const onChainTxid = 'bb'.repeat(32)

  it('lists each affected VTXO with virtual txid snippet', () => {
    const warning = formatMissingBlocktimeCompletionWarning([
      {
        virtualTxid,
        onChainTxid: virtualTxid,
        onChainVout: 0,
        amountSats: 100_000,
      },
      {
        virtualTxid: 'cc'.repeat(32),
        onChainTxid: onChainTxid,
        onChainVout: 1,
        amountSats: 50_000,
      },
    ])
    expect(warning.summary).toContain('Esplora did not report a confirmation time')
    expect(warning.lines).toHaveLength(2)
    expect(
      formatMissingBlocktimeCompletionWarningLine(warning.lines[0]),
    ).toContain(virtualTxid.slice(0, 12))
    expect(
      formatMissingBlocktimeCompletionWarningLine(warning.lines[1]),
    ).toContain('on-chain')
  })
})

describe('isOperatorIndexerCatchingUpError', () => {
  it('detects structured wasm error code', () => {
    const error = new Error(
      JSON.stringify({
        code: 'operator_indexer_catching_up',
        message: 'Operator indexer is still catching up after unilateral unroll.',
      }),
    )
    expect(isOperatorIndexerCatchingUpError(error)).toBe(true)
    expect(isOperatorIndexerCatchingUpError(new Error('other'))).toBe(false)
  })
})
