import { describe, it, expect } from 'vitest'
import {
  mergeAndSortDashboardActivity,
  type LightningPaymentWithWallet,
} from '@/lib/lightning-dashboard-sync'
import type { TransactionDetails } from '@/workers/crypto-types'

const chainOlder: TransactionDetails = {
  txid: 'aa',
  sent_sats: 0,
  received_sats: 100,
  fee_sats: null,
  confirmation_block_height: 1,
  confirmation_time: 100,
  is_confirmed: true,
}

const chainNewer: TransactionDetails = {
  txid: 'bb',
  sent_sats: 0,
  received_sats: 200,
  fee_sats: null,
  confirmation_block_height: 2,
  confirmation_time: 200,
  is_confirmed: true,
}

const lnMiddle: LightningPaymentWithWallet = {
  paymentHash: 'ln1',
  pending: false,
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
})
