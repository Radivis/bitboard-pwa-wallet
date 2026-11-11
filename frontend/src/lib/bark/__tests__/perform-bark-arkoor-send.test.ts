import { describe, expect, it, vi } from 'vitest'
import { BARK_EMERGENCY_EXIT_BLOCKS_ACTION } from '@/lib/bark/emergency-exit-blocks-action'
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
    readBalance: vi.fn(async () => {
      calls.push('balance')
      const spendableSats = calls.filter((call) => call === 'balance').length === 1 ? 50_000 : 40_000
      return { spendableSats, exitingSats: 0 }
    }),
    sendArkoor: vi.fn(async () => {
      calls.push('send')
    }),
    sync: vi.fn(async () => {
      calls.push('sync')
      return {
        lastSuccessfulSyncAt: '2026-10-01T12:00:00.000Z',
        refreshStatus: 'idle' as const,
      }
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
      'balance',
      'estimate',
      'send',
      'sync',
      'balance',
    ])
  })

  it('refuses before the fee quote when an emergency exit holds the coins', async () => {
    const { deps } = sendDeps()
    deps.readBalance.mockResolvedValue({ spendableSats: 0, exitingSats: 50_000 })

    await expect(
      performBarkArkoorSend(deps, { address, amountSats: 10_000 }),
    ).rejects.toThrow(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)

    expect(deps.estimateArkoorFeeSats).not.toHaveBeenCalled()
    expect(deps.sendArkoor).not.toHaveBeenCalled()
  })

  it('names the emergency exit when the fee no longer fits beside exiting coins', async () => {
    const { deps } = sendDeps()
    deps.readBalance.mockResolvedValue({ spendableSats: 10_000, exitingSats: 40_000 })
    deps.estimateArkoorFeeSats.mockResolvedValue(1)

    await expect(
      performBarkArkoorSend(deps, { address, amountSats: 10_000 }),
    ).rejects.toThrow(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)

    expect(deps.sendArkoor).not.toHaveBeenCalled()
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
