import { describe, expect, it } from 'vitest'

import {
  isEsploraTxStatusReadyForBdkAnchor,
  parseEsploraTxStatusFromTxEndpointBody,
} from '@/lib/wallet/esplora-tx-anchor-metadata'

describe('isEsploraTxStatusReadyForBdkAnchor', () => {
  it('requires confirmed plus block height, hash, and time', () => {
    expect(
      isEsploraTxStatusReadyForBdkAnchor({
        confirmed: true,
        blockHeight: 179,
        blockHash: 'abc',
        blockTime: 1_700_000_000,
      }),
    ).toBe(true)

    expect(
      isEsploraTxStatusReadyForBdkAnchor({
        confirmed: true,
        blockHeight: 179,
        blockHash: null,
        blockTime: 1_700_000_000,
      }),
    ).toBe(false)
  })
})

describe('parseEsploraTxStatusFromTxEndpointBody', () => {
  it('maps mempool/esplora /tx JSON fields', () => {
    expect(
      parseEsploraTxStatusFromTxEndpointBody('tx1', {
        status: {
          confirmed: true,
          block_height: 179,
          block_hash: '00'.repeat(32),
          block_time: 1_700_000_000,
        },
      }),
    ).toMatchObject({
      txid: 'tx1',
      confirmed: true,
      blockHeight: 179,
      blockHash: '00'.repeat(32),
      blockTime: 1_700_000_000,
    })
  })
})
