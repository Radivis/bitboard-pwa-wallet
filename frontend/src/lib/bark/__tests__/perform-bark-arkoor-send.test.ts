import { describe, expect, it, vi } from 'vitest'
import { performBarkArkoorSend } from '@/lib/bark/perform-bark-arkoor-send'

const address =
  'tark1pem36wcfzqqpfx70khldrqd863rjxgq9d26efp0j43rwfpskdvgmkp60d87h443fzqypec02q3nccdj3gajzj92rekcm8qaqvhmnn9m5rr2rgjp82xldkp6q8gx5p7'

function sendDeps() {
  const calls: string[] = []
  const deps = {
    validateArkoorAddress: vi.fn(async () => {
      calls.push('validate')
    }),
    estimateArkoorFeeSats: vi.fn(async () => {
      calls.push('estimate')
      return 0
    }),
    readSpendableSats: vi.fn(async () => {
      calls.push('balance')
      return calls.filter((call) => call === 'balance').length === 1 ? 50_000 : 40_000
    }),
    sendArkoor: vi.fn(async () => {
      calls.push('send')
    }),
    sync: vi.fn(async () => {
      calls.push('sync')
      return { lastSuccessfulSyncAt: '2026-10-01T12:00:00.000Z' }
    }),
  }
  return { calls, deps }
}

describe('performBarkArkoorSend', () => {
  it('validates, estimates, sends, then syncs and reads the new balance', async () => {
    const { calls, deps } = sendDeps()

    await expect(
      performBarkArkoorSend(deps, { address, amountSats: 10_000 }),
    ).resolves.toEqual({
      feeSats: 0,
      spendableSats: 40_000,
      lastSuccessfulSyncAt: '2026-10-01T12:00:00.000Z',
    })

    expect(calls).toEqual([
      'validate',
      'estimate',
      'balance',
      'send',
      'sync',
      'balance',
    ])
  })

  it('does not sync when the send fails', async () => {
    const { deps } = sendDeps()
    deps.sendArkoor.mockRejectedValueOnce(new Error('server_mismatch'))

    await expect(
      performBarkArkoorSend(deps, { address, amountSats: 10_000 }),
    ).rejects.toThrow('server_mismatch')

    expect(deps.sync).not.toHaveBeenCalled()
  })
})
