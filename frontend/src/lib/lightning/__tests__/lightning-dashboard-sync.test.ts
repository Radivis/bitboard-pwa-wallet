import { describe, it, expect } from 'vitest'
import {
  ARKADE_BOARDING_ACTIVITY_LABEL,
  isBoardingFundToVtxoPair,
  mergeAndSortDashboardActivity,
  type LightningPaymentWithWallet,
} from '@/lib/lightning/lightning-dashboard-sync'
import type { TransactionDetails } from '@/workers/crypto-types'

const chainOlder: TransactionDetails = {
  txid: 'aa',
  sentSats: 0,
  receivedSats: 100,
  feeSats: null,
  confirmationBlockHeight: 1,
  confirmationTime: 100,
  isConfirmed: true,
  isLabTx: false,
}

const chainNewer: TransactionDetails = {
  txid: 'bb',
  sentSats: 0,
  receivedSats: 200,
  feeSats: null,
  confirmationBlockHeight: 2,
  confirmationTime: 200,
  isConfirmed: true,
  isLabTx: false,
}

const lnMiddle: LightningPaymentWithWallet = {
  paymentHash: 'ln1',
  isPending: false,
  amountSats: 50,
  memo: 'x',
  timestamp: 150,
  bolt11: 'lntb',
  direction: 'incoming',
  feesPaidSats: 0,
  connectionId: 'conn-1',
  walletLabel: 'Test LN Wallet',
}

describe('mergeAndSortDashboardActivity', () => {
  it('orders newest first', () => {
    const merged = mergeAndSortDashboardActivity(
      [chainOlder, chainNewer],
      [lnMiddle],
    )
    expect(merged.map((i) => (i.kind === 'chain' ? i.tx.txid : i.payment.paymentHash))).toEqual([
      'bb',
      'ln1',
      'aa',
    ])
  })

  it('dedupe is done upstream; merge only combines lists', () => {
    const merged = mergeAndSortDashboardActivity([], [lnMiddle])
    expect(merged).toHaveLength(1)
    expect(merged[0].kind).toBe('lightning')
  })

  it('includes Arkade payments in merged activity', () => {
    const merged = mergeAndSortDashboardActivity(
      [chainOlder],
      [],
      [
        {
          direction: 'incoming',
          amountSats: 25_000,
          timestamp: 1_700_000_500,
          txid: 'ark-in-1',
        },
      ],
    )
    expect(merged).toHaveLength(2)
    expect(merged[0].kind).toBe('arkade')
    if (merged[0].kind === 'arkade') {
      expect(merged[0].payment.txid).toBe('ark-in-1')
    }
  })

  it('places Arkade boarding receive above matching on-chain send when timestamps tie', () => {
    const boardingSecond = 1_748_836_800
    const chainSend: TransactionDetails = {
      txid: 'chain-board-fund',
      sentSats: 200_000,
      receivedSats: 0,
      feeSats: null,
      confirmationBlockHeight: 100,
      confirmationTime: boardingSecond,
      isConfirmed: true,
      isLabTx: false,
    }
    const arkReceive = {
      direction: 'incoming' as const,
      amountSats: 200_000,
      timestamp: boardingSecond,
      txid: 'ark-vtxo-from-board',
    }

    expect(isBoardingFundToVtxoPair(chainSend, arkReceive)).toBe(true)

    const merged = mergeAndSortDashboardActivity([chainSend], [], [arkReceive])
    expect(merged).toHaveLength(2)
    expect(merged[0].kind).toBe('arkade')
    if (merged[0].kind === 'arkade') {
      expect(merged[0].payment.txid).toBe('ark-vtxo-from-board')
    }
    expect(merged[1].kind).toBe('chain')
    if (merged[0].kind === 'arkade') {
      expect(merged[0].activityLabel).toBe(ARKADE_BOARDING_ACTIVITY_LABEL)
    }
    if (merged[1].kind === 'chain') {
      expect(merged[1].activityLabel).toBe(ARKADE_BOARDING_ACTIVITY_LABEL)
    }
  })

  it('does not reorder unrelated chain and Arkade rows that share a timestamp', () => {
    const sharedSecond = 1_748_836_900
    const chainSend: TransactionDetails = {
      txid: 'chain-unrelated',
      sentSats: 50_000,
      receivedSats: 0,
      feeSats: null,
      confirmationBlockHeight: 101,
      confirmationTime: sharedSecond,
      isConfirmed: true,
      isLabTx: false,
    }
    const arkReceive = {
      direction: 'incoming' as const,
      amountSats: 200_000,
      timestamp: sharedSecond,
      txid: 'ark-unrelated',
    }

    expect(isBoardingFundToVtxoPair(chainSend, arkReceive)).toBe(false)

    const merged = mergeAndSortDashboardActivity([chainSend], [], [arkReceive])
    expect(merged[0].kind).toBe('chain')
    expect(merged[1].kind).toBe('arkade')
  })

  it('keeps unconfirmed on-chain txs in the top slice when many confirmed txs exist', () => {
    const confirmedChain = Array.from({ length: 11 }, (_, index) => ({
      txid: `confirmed-${index}`,
      sentSats: 0,
      receivedSats: 1_000,
      feeSats: null,
      confirmationBlockHeight: 800_000 + index,
      confirmationTime: 1_700_000_000 + index,
      isConfirmed: true,
      isLabTx: false,
    }))

    const pendingSend: TransactionDetails = {
      txid: 'pending-send',
      sentSats: 5_000,
      receivedSats: 0,
      feeSats: 200,
      confirmationBlockHeight: null,
      confirmationTime: null,
      isConfirmed: false,
      isLabTx: false,
    }

    const merged = mergeAndSortDashboardActivity(
      [...confirmedChain, pendingSend],
      [lnMiddle],
    )
    const topTenTxids = merged
      .slice(0, 10)
      .map((item) => (item.kind === 'chain' ? item.tx.txid : item.payment.paymentHash))

    expect(topTenTxids[0]).toBe('pending-send')
    expect(topTenTxids).toContain('pending-send')
  })
})
