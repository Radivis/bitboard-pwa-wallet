import { describe, expect, it } from 'vitest'
import {
  ChainTxType,
  type ChainTx,
  type FeeInfo,
  type VirtualCoin,
} from '@arkade-os/sdk'
import {
  estimateCollaborativeOffboardFees,
  estimateP2APackageFeeSats,
  mapIntentFeeConfigured,
  resolveFeeRateSatPerVb,
  simulateUnrollPlan,
  type TxOnchainStatus,
} from '@/lib/arkade/arkade-exit-fee-estimates'

function baseVtxo(overrides: Partial<VirtualCoin> = {}): VirtualCoin {
  return {
    txid: 'abc123',
    vout: 0,
    value: 100_000,
    status: { confirmed: true, blockHeight: 1 },
    createdAt: new Date('2024-01-01'),
    script: '5120ab',
    isUnrolled: false,
    virtualStatus: { state: 'settled' },
    ...overrides,
  } as VirtualCoin
}

function chainTx(txid: string, type: ChainTxType = ChainTxType.TREE): ChainTx {
  return {
    txid,
    expiresAt: '',
    type,
    spends: [],
  }
}

describe('mapIntentFeeConfigured', () => {
  it('flags CEL keys', () => {
    const feeInfo: FeeInfo = {
      txFeeRate: '2',
      intentFee: {
        offchainInput: 'input prog',
        onchainOutput: 'output prog',
      },
    }
    expect(mapIntentFeeConfigured(feeInfo)).toEqual({
      offchainInput: true,
      onchainInput: false,
      offchainOutput: false,
      onchainOutput: true,
    })
  })
})

describe('estimateCollaborativeOffboardFees', () => {
  const emptyIntentFee: FeeInfo = { txFeeRate: '1', intentFee: {} }

  it('sums input and output fees with zero CEL config', async () => {
    const result = await estimateCollaborativeOffboardFees({
      feeInfo: emptyIntentFee,
      vtxos: [baseVtxo({ value: 100_000 })],
      destinationAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      networkNames: ['testnet', 'signet', 'mutinynet'],
    })
    expect(result.estimateError).toBeUndefined()
    expect(result.estimatedTotalFeeSats).toBe(0)
    expect(result.estimatedReceiveSats).toBe(100_000)
  })

  it('applies partial amount with change back to offchain', async () => {
    const result = await estimateCollaborativeOffboardFees({
      feeInfo: emptyIntentFee,
      vtxos: [baseVtxo({ value: 100_000 })],
      destinationAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      amountSats: 40_000,
      networkNames: ['testnet', 'signet', 'mutinynet'],
    })
    expect(result.estimatedReceiveSats).toBe(40_000)
  })

  it('returns error for invalid destination', async () => {
    const result = await estimateCollaborativeOffboardFees({
      feeInfo: emptyIntentFee,
      vtxos: [baseVtxo()],
      destinationAddress: 'not-an-address',
      networkNames: ['mutinynet'],
    })
    expect(result.estimatedTotalFeeSats).toBeNull()
    expect(result.estimatedReceiveSats).toBeNull()
    expect(result.estimateError).toMatch(/decode/i)
  })
})

describe('simulateUnrollPlan', () => {
  it('counts UNROLL and WAIT from chain when txs are missing', async () => {
    const chain = [
      chainTx('commit', ChainTxType.COMMITMENT),
      chainTx('tree-a'),
      chainTx('tree-b'),
    ]
    const statusByTxid: Record<string, TxOnchainStatus> = {}
    const plan = await simulateUnrollPlan(chain, async (txid) => {
      const status = statusByTxid[txid]
      if (status == null) {
        throw new Error('not found')
      }
      return status
    })
    expect(plan.projectedUnrollSteps).toBe(2)
    expect(plan.unrollTxids).toEqual(['tree-b', 'tree-a'])
    expect(plan.projectedWaitSteps).toBeGreaterThanOrEqual(0)
  })

  it('returns DONE when chain txs are confirmed', async () => {
    const chain = [chainTx('tree-a')]
    const plan = await simulateUnrollPlan(chain, async () => 'confirmed')
    expect(plan.projectedUnrollSteps).toBe(0)
    expect(plan.projectedWaitSteps).toBe(0)
    expect(plan.unrollTxids).toEqual([])
  })
})

describe('estimateP2APackageFeeSats', () => {
  it('uses parent and child vsize', () => {
    const fee = estimateP2APackageFeeSats({
      parentVsize: 200,
      childVsize: 150,
      feeRateSatPerVb: 10,
    })
    expect(fee).toBe(Math.ceil(10 * (200 + 150)))
  })
})

describe('resolveFeeRateSatPerVb', () => {
  it('applies minimum', () => {
    expect(resolveFeeRateSatPerVb(undefined)).toBe(1)
    expect(resolveFeeRateSatPerVb(0)).toBe(1)
    expect(resolveFeeRateSatPerVb(5)).toBe(5)
  })
})
