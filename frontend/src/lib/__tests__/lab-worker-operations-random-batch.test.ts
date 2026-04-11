import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_LAB_STATE, type LabState } from '@/workers/lab-api'

const {
  mockLabWorker,
  persistLabState,
  initLabWorkerWithState,
  prepareRandomLabEntityTransaction,
  finalizeLabEntityMempoolTransaction,
  getStateSnapshot,
} = vi.hoisted(() => {
  const persistLabState = vi.fn().mockResolvedValue(undefined)
  const initLabWorkerWithState = vi.fn().mockResolvedValue(undefined)
  const prepareRandomLabEntityTransaction = vi.fn()
  const finalizeLabEntityMempoolTransaction = vi.fn()
  const getStateSnapshot = vi.fn()

  const mockLabWorker = {
    prepareRandomLabEntityTransaction,
    finalizeLabEntityMempoolTransaction,
    getStateSnapshot,
  }

  return {
    mockLabWorker,
    persistLabState,
    initLabWorkerWithState,
    prepareRandomLabEntityTransaction,
    finalizeLabEntityMempoolTransaction,
    getStateSnapshot,
  }
})

vi.mock('@/workers/lab-factory', () => ({
  getLabWorker: () => mockLabWorker,
  initLabWorkerWithState,
  persistLabState,
  loadLabStateFromDatabase: vi.fn(),
  resetLab: vi.fn(),
}))

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => ({
    labEntityBuildAndSignLabTransaction: vi.fn().mockResolvedValue({
      signed_tx_hex: 'deadbeef',
      fee_sats: 140,
      has_change: false,
      changeset_json: '{}',
    }),
  }),
}))

import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab-random-limits'
import { labOpCreateRandomLabEntityTransactions } from '@/lib/lab-worker-operations'

let mempoolSize = 0

function buildPrepared() {
  return {
    prepareParams: {
      entityName: 'Alice',
      fromAddress: 'bcrt1from',
      toAddress: 'bcrt1to',
      amountSats: 5000,
      feeRateSatPerVb: 1,
    },
    entityName: 'Alice',
    crypto: {
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      changesetJson: '{}',
      network: 'regtest',
      addressType: 'segwit',
      accountId: 0,
      utxosJson: '[]',
      toAddress: 'bcrt1to',
      amountSats: 5000,
      feeRateSatPerVb: 1,
    },
    mempoolMetadata: {
      sender: 'Alice',
      receiver: 'Bob',
      feeSats: 0,
      inputs: [{ txid: 'aa', vout: 0 }],
      inputsDetail: [
        {
          address: 'bcrt1from',
          amountSats: 10_000,
          owner: 'Alice',
          prevTxid: 'aa',
          prevVout: 0,
        },
      ],
      outputsDetail: [{ address: 'bcrt1to', amountSats: 5000, owner: 'Bob' }],
      hasChange: false,
      walletChangeAddress: '',
    },
    totalInput: 10_000,
  }
}

function snapshotFromMempool(): LabState {
  return {
    ...EMPTY_LAB_STATE,
    mempool: Array.from({ length: mempoolSize }, (_, i) => ({
      signedTxHex: '00',
      txid: `tx${i}`,
      sender: 'Alice',
      receiver: 'Bob',
      feeSats: 1,
      vsize: 100,
      weight: 400,
      inputs: [],
      inputsDetail: [],
      outputsDetail: [],
    })),
  }
}

describe('labOpCreateRandomLabEntityTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mempoolSize = 0
    initLabWorkerWithState.mockResolvedValue(undefined)
    persistLabState.mockResolvedValue(undefined)
    prepareRandomLabEntityTransaction.mockReset()
    finalizeLabEntityMempoolTransaction.mockReset()
    getStateSnapshot.mockReset()

    finalizeLabEntityMempoolTransaction.mockImplementation(async () => {
      mempoolSize += 1
      return snapshotFromMempool()
    })
    getStateSnapshot.mockImplementation(async () => snapshotFromMempool())
  })

  it('hydrates once, finalizes N times, and persists exactly once for N random txs', async () => {
    const prepared = buildPrepared()
    prepareRandomLabEntityTransaction.mockResolvedValue(prepared as never)

    const result = await labOpCreateRandomLabEntityTransactions(4)

    expect(initLabWorkerWithState).toHaveBeenCalledTimes(1)
    expect(persistLabState).toHaveBeenCalledTimes(1)
    expect(prepareRandomLabEntityTransaction).toHaveBeenCalledTimes(4)
    expect(finalizeLabEntityMempoolTransaction).toHaveBeenCalledTimes(4)
    expect(result.createdCount).toBe(4)
    expect(result.state.mempool).toHaveLength(4)
  })

  it('still persists once when prepare returns null on first attempt', async () => {
    prepareRandomLabEntityTransaction.mockResolvedValue(null)

    const result = await labOpCreateRandomLabEntityTransactions(3)

    expect(initLabWorkerWithState).toHaveBeenCalledTimes(1)
    expect(persistLabState).toHaveBeenCalledTimes(1)
    expect(finalizeLabEntityMempoolTransaction).not.toHaveBeenCalled()
    expect(result.createdCount).toBe(0)
  })

  it('calls onProgress after each finalized random tx', async () => {
    const onProgress = vi.fn()
    const prepared = buildPrepared()
    prepareRandomLabEntityTransaction.mockResolvedValue(prepared as never)

    await labOpCreateRandomLabEntityTransactions(4, { onProgress })

    expect(onProgress).toHaveBeenCalledTimes(4)
    expect(onProgress.mock.calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ])
  })

  it(`rejects when count exceeds LAB_MAX_RANDOM_ENTITY_TRANSACTIONS (${LAB_MAX_RANDOM_ENTITY_TRANSACTIONS})`, async () => {
    await expect(
      labOpCreateRandomLabEntityTransactions(LAB_MAX_RANDOM_ENTITY_TRANSACTIONS + 1),
    ).rejects.toThrow(
      new RegExp(`At most ${LAB_MAX_RANDOM_ENTITY_TRANSACTIONS} random lab transactions per batch`),
    )

    expect(initLabWorkerWithState).not.toHaveBeenCalled()
    expect(persistLabState).not.toHaveBeenCalled()
  })
})
