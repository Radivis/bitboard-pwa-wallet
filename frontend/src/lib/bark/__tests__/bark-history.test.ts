import { describe, expect, it } from 'vitest'
import { barkMovementActivityLabel, readBarkHistoryJson } from '@/lib/bark/bark-history'
import { prepareBoardFundingFromWasm } from '@/lib/bark/bark-board-session'

describe('barkMovementActivityLabel', () => {
  it('BARK-EXIT-09 labels a bark.offboard movement as Bark exit', () => {
    expect(barkMovementActivityLabel('bark.offboard')).toBe('Bark exit')
    expect(barkMovementActivityLabel('bark.board')).toBe('Bark boarding')
  })

  it('BARK-EMG-09 labels a bark.exit movement as Bark emergency exit', () => {
    expect(barkMovementActivityLabel('bark.exit')).toBe('Bark emergency exit')
    expect(barkMovementActivityLabel('bark.offboard')).toBe('Bark exit')
  })

  it('BARK-HIST-05 labels a bark.round refresh as Bark refresh', () => {
    expect(barkMovementActivityLabel('bark.round', 'refresh')).toBe('Bark refresh')
    expect(barkMovementActivityLabel('bark.round', 'other')).toBe('Bark')
  })
})

describe('readBarkHistoryJson', () => {
  it('BARK-HIST-01 maps a history payload to status and signed balance', () => {
    const rows = readBarkHistoryJson(
      JSON.stringify([
        {
          id: 7,
          status: 'failed',
          subsystemName: 'bark.board',
          subsystemKind: 'board',
          effectiveBalanceSats: -1200,
          offchainFeeSats: 40,
          createdAtUnixSeconds: 1_700_000_000,
        },
      ]),
    )

    expect(rows).toEqual([
      {
        id: 7,
        status: 'failed',
        subsystemName: 'bark.board',
        subsystemKind: 'board',
        effectiveBalanceSats: -1200,
        offchainFeeSats: 40,
        createdAtUnixSeconds: 1_700_000_000,
      },
    ])
  })

  it('rejects an unknown status', () => {
    expect(() =>
      readBarkHistoryJson(
        JSON.stringify([
          {
            id: 1,
            status: 'exploded',
            subsystemName: 'bark.board',
            subsystemKind: 'board',
            effectiveBalanceSats: 1,
            offchainFeeSats: 0,
            createdAtUnixSeconds: 1,
          },
        ]),
      ),
    ).toThrow(/unknown status/)
  })
})

describe('prepareBoardFundingFromWasm', () => {
  it('BARK-BOARD-07 returns the funding address without a receive key index', async () => {
    const prepared = await prepareBoardFundingFromWasm({
      bark_estimate_board_offchain_fee: async () => {
        throw new Error('not used')
      },
      bark_prepare_board_funding: async () => ({
        funding_address: 'tb1qboard',
        expiry_height: 42,
        free: () => undefined,
      }),
      bark_board_psbt: async () => {
        throw new Error('not used')
      },
      bark_history: async () => '[]',
    })

    expect(prepared).toEqual({ fundingAddress: 'tb1qboard', expiryHeight: 42 })
    expect(prepared).not.toHaveProperty('index')
    expect(prepared).not.toHaveProperty('receiveKeyIndex')
  })
})
