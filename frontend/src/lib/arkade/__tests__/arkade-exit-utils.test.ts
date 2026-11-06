import { describe, expect, it } from 'vitest'
import {
  ARKADE_TXID_DISPLAY_PREFIX_LENGTH,
  COMPLETE_UNILATERAL_EXIT_SUCCESS_TOAST_MS,
  blockchainExplorerTransactionUrl,
  completeUnilateralExitSuccessToast,
  formatArkadeTxidToastSnippet,
  formatIntentFeePrograms,
  formatMissingBlocktimeCompletionWarning,
  formatMissingBlocktimeCompletionWarningLine,
  formatUnilateralExitCompleteWaitingBanner,
  formatUnilateralExitTimelock,
  isUnilateralExitCompletionNotReadyError,
  parseCollaborativeExitAmountSats,
  selectionCoveredByCompletionEstimate,
  unilateralExitCompleteTimelockMessage,
  unilateralExitWaitingTimelockProgress,
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
    expect(formatUnilateralExitTimelock({ timelockBlocks: 20 }, 'mainnet')).toBe(
      '20 blocks (about 3 hours and 20 minutes)',
    )
  })

  it('omits the block approximation on regtest', () => {
    expect(formatUnilateralExitTimelock({ timelockBlocks: 144 }, 'regtest')).toBe('144 blocks')
  })

  it('formats time-based operator delay', () => {
    expect(formatUnilateralExitTimelock({ timelockSeconds: 172_544 })).toBe('2 days')
  })

  it('describes waiting period on complete step', () => {
    expect(
      unilateralExitCompleteTimelockMessage({ timelockBlocks: 144 }, false, 'signet'),
    ).toContain('144 blocks (about 1 day)')
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
        networkMode: 'mainnet',
      }),
    ).toContain('144 blocks (about 1 day)')
  })

  it('counts down a time-based CSV instead of repeating the full delay', () => {
    const nowUnixSeconds = 1_700_000_000
    const banner = formatUnilateralExitCompleteWaitingBanner({
      waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForTimelock]),
      timelock: { timelockSeconds: 2_040 },
      waitingTxidSnippets: ['aaaaaaaa…'],
      csvReadyAtUnixSeconds: nowUnixSeconds + 120,
      nowUnixSeconds,
    })
    expect(banner).toContain('ends in 2m 0s')
    expect(banner).not.toContain('34 minutes')
  })

  it('counts down a multi-day CSV in days, hours, minutes, and seconds', () => {
    const nowUnixSeconds = 1_700_000_000
    const banner = formatUnilateralExitCompleteWaitingBanner({
      waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForTimelock]),
      timelock: { timelockSeconds: 200_000 },
      waitingTxidSnippets: [],
      csvReadyAtUnixSeconds: nowUnixSeconds + 183_845,
      nowUnixSeconds,
    })
    expect(banner).toContain('ends in 2d 3h 4m 5s')
  })

  it('says the CSV has elapsed when the ready time is already past', () => {
    const nowUnixSeconds = 1_700_000_000
    const banner = formatUnilateralExitCompleteWaitingBanner({
      waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForTimelock]),
      timelock: { timelockSeconds: 2_040 },
      waitingTxidSnippets: [],
      csvReadyAtUnixSeconds: nowUnixSeconds - 5,
      nowUnixSeconds,
    })
    expect(banner).toContain('has elapsed')
  })

  it('counts remaining block confirmations', () => {
    const banner = formatUnilateralExitCompleteWaitingBanner({
      waitingCopyKinds: new Set([VTXO_EXIT_PHASE_COPY.waitingForTimelock]),
      timelock: { timelockBlocks: 144 },
      waitingTxidSnippets: [],
      csvConfirmationsRemaining: 3,
      networkMode: 'signet',
    })
    expect(banner).toContain('Wait for 3 more blocks (about 30 minutes) before completing.')
    expect(banner).not.toContain('144 blocks')
  })
})

describe('complete unilateral exit readiness', () => {
  it('treats the coin-select miss as not-ready rather than a failed complete', () => {
    expect(
      isUnilateralExitCompletionNotReadyError(
        'Arkade client error: no matching unrolled VTXOs found for completion (listed 2, matched 2)',
      ),
    ).toBe(true)
    expect(isUnilateralExitCompletionNotReadyError('bumper sync failed')).toBe(false)
  })

  it('covers the selection only when the estimate total matches and has no error', () => {
    expect(
      selectionCoveredByCompletionEstimate({
        selectedTotalSats: 10_000,
        estimatedSelectedTotalSats: 10_000,
        estimateError: undefined,
      }),
    ).toBe(true)
    expect(
      selectionCoveredByCompletionEstimate({
        selectedTotalSats: 10_000,
        estimatedSelectedTotalSats: 0,
        estimateError: 'no matching unrolled VTXOs found for completion',
      }),
    ).toBe(false)
  })

  it('uses the latest CSV ready time among waiting rows', () => {
    expect(
      unilateralExitWaitingTimelockProgress([
        { canComplete: false, csvReadyAtUnixSeconds: 100 },
        { canComplete: true, csvReadyAtUnixSeconds: 500 },
        { canComplete: false, csvReadyAtUnixSeconds: 250, csvConfirmationsRemaining: 2 },
      ]),
    ).toEqual({ csvReadyAtUnixSeconds: 250, csvConfirmationsRemaining: 2 })
  })

  it('keeps the sweep txid on a success toast long enough to survive navigation', () => {
    const txid = 'ef'.repeat(32)
    const toastContent = completeUnilateralExitSuccessToast(txid)
    expect(toastContent.title).toContain('completed')
    expect(toastContent.options.description).toBe(txid)
    expect(toastContent.options.duration).toBeGreaterThanOrEqual(
      COMPLETE_UNILATERAL_EXIT_SUCCESS_TOAST_MS,
    )
  })

  it('links mutinynet sweep transactions to the mutinynet explorer', () => {
    const txid = 'ab'.repeat(32)
    expect(blockchainExplorerTransactionUrl('mutinynet', txid)).toBe(
      `https://mutinynet.com/tx/${txid}`,
    )
    expect(blockchainExplorerTransactionUrl('regtest', txid)).toBeNull()
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
