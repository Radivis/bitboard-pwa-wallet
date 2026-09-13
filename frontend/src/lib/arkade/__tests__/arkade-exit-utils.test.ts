import { describe, expect, it } from 'vitest'
import {
  ARKADE_TXID_DISPLAY_PREFIX_LENGTH,
  formatArkadeTxidToastSnippet,
  formatIntentFeePrograms,
  formatMissingBlocktimeCompletionWarning,
  formatMissingBlocktimeCompletionWarningLine,
  formatUnilateralExitCompleteWaitingBanner,
  formatUnilateralExitTimelock,
  parseCollaborativeExitAmountSats,
  unilateralExitCompleteTimelockMessage,
} from '@/lib/arkade/arkade-exit-utils'
import { VTXO_EXIT_PHASE_COPY } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-selectors'

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
    expect(
      unilateralExitCompleteTimelockMessage({ timelockBlocks: 144 }, true),
    ).toContain('satisfied')
  })

  it('formats waiting banner for confirmations vs timelock', () => {
    expect(
      formatUnilateralExitCompleteWaitingBanner({
        waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForHostTransactionBroadcast]),
        timelock: { timelockBlocks: 144 },
        waitingTxidSnippets: ['aaaaaaaa…'],
      }),
    ).toContain('host transaction to broadcast')
    expect(
      formatUnilateralExitCompleteWaitingBanner({
        waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForFirstConfirmation]),
        timelock: { timelockBlocks: 144 },
        waitingTxidSnippets: ['aaaaaaaa…'],
      }),
    ).toContain('first on-chain confirmation')
    expect(
      formatUnilateralExitCompleteWaitingBanner({
        waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForSixConfirmations]),
        timelock: { timelockBlocks: 144 },
        waitingTxidSnippets: ['aaaaaaaa…'],
      }),
    ).toContain('6 on-chain confirmations')
    expect(
      formatUnilateralExitCompleteWaitingBanner({
        waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForTimelock]),
        timelock: { timelockBlocks: 144 },
        waitingTxidSnippets: ['aaaaaaaa…'],
      }),
    ).toContain('144 block confirmations')
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

describe('formatArkadeTxidToastSnippet', () => {
  it('uses the shared display prefix length', () => {
    const txid = 'ab'.repeat(32)
    expect(formatArkadeTxidToastSnippet(txid)).toBe(
      `${txid.slice(0, ARKADE_TXID_DISPLAY_PREFIX_LENGTH)}…`,
    )
  })
})
