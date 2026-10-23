import { describe, expect, it, vi } from 'vitest'
import {
  performBarkBoard,
  type PerformBarkBoardDeps,
} from '@/lib/bark/perform-bark-board'

const accepted = {
  fundingTxid: 'aa',
  vtxoAmountSats: 9_000,
  movementId: 4,
}

function deps(overrides: Partial<PerformBarkBoardDeps> = {}): PerformBarkBoardDeps {
  return {
    signFundingPsbt: vi.fn(async () => ({
      psbtBase64: 'signed-psbt',
      rawTxHex: 'dead',
      txid: 'aa',
    })),
    submitBoardPsbt: vi.fn(async () => accepted),
    applyUnconfirmedFundingTx: vi.fn(async () => undefined),
    persistOnchainChangeset: vi.fn(async () => undefined),
    startOnchainBackgroundSync: vi.fn(),
    syncBark: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('performBarkBoard', () => {
  it('BARK-BOARD-05 signs the reviewed PSBT and submits that signature to Bark', async () => {
    const boardDeps = deps()
    const esploraBroadcast = vi.fn()
    const result = await performBarkBoard(boardDeps, 'reviewed-psbt')

    expect(boardDeps.signFundingPsbt).toHaveBeenCalledWith('reviewed-psbt')
    expect(boardDeps.submitBoardPsbt).toHaveBeenCalledWith('signed-psbt')
    expect(boardDeps.applyUnconfirmedFundingTx).toHaveBeenCalledWith('dead')
    expect(esploraBroadcast).not.toHaveBeenCalled()
    expect(result.fundingTxid).toBe('aa')
    expect(result.localWalletWarning).toBeNull()
  })

  it('BARK-BOARD-06 does not apply the funding transaction when Bark rejects the PSBT', async () => {
    const boardDeps = deps({
      submitBoardPsbt: vi.fn(async () => {
        throw new Error('server rejected the board')
      }),
    })

    await expect(performBarkBoard(boardDeps, 'reviewed-psbt')).rejects.toThrow(
      'server rejected the board',
    )
    expect(boardDeps.applyUnconfirmedFundingTx).not.toHaveBeenCalled()
    expect(boardDeps.persistOnchainChangeset).not.toHaveBeenCalled()
    expect(boardDeps.startOnchainBackgroundSync).not.toHaveBeenCalled()
  })

  it('BARK-BOARD-07 does not expose or persist a receive key index', async () => {
    const persistReceiveKeyIndex = vi.fn()
    const result = await performBarkBoard(deps(), 'reviewed-psbt')

    expect(persistReceiveKeyIndex).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('receiveKeyIndex')
    expect(result).not.toHaveProperty('index')
  })

  it('keeps the board accepted when the local wallet apply fails', async () => {
    const boardDeps = deps({
      applyUnconfirmedFundingTx: vi.fn(async () => {
        throw new Error('changeset locked')
      }),
    })

    const result = await performBarkBoard(boardDeps, 'reviewed-psbt')
    expect(result.fundingTxid).toBe('aa')
    expect(result.localWalletWarning).toBe('changeset locked')
    expect(boardDeps.syncBark).toHaveBeenCalled()
    expect(boardDeps.persistOnchainChangeset).not.toHaveBeenCalled()
  })
})
