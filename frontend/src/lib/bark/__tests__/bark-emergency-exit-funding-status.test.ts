import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runBarkEmergencyExitProgress } from '@/lib/bark/bark-emergency-exit-progress-deps'
import {
  barkEmergencyExitFundingStatusFor,
  barkEmergencyExitUnfundedParentTxidsFor,
  formatBarkEmergencyExitFundingBanner,
} from '@/lib/bark/bark-emergency-exit-funding-status'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import type { BarkEmergencyCpfpRequest } from '@/workers/bark-api'

const barkWorker = vi.hoisted(() => ({
  progressEmergencyExits: vi.fn(),
  provideEmergencyExitCpfp: vi.fn(),
}))

const cryptoWorker = vi.hoisted(() => ({
  signP2aCpfpChild: vi.fn(),
  applyUnconfirmedFundingTx: vi.fn(),
  getBalance: vi.fn(),
}))

function balanceWithTotal(totalSats: number) {
  return {
    confirmedSats: 0,
    trustedPendingSats: totalSats,
    untrustedPendingSats: 0,
    immatureSats: 0,
    totalSats,
  }
}

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => barkWorker,
}))

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => cryptoWorker,
}))

const SIGNET_WALLET = { walletId: 1, networkMode: 'signet' } as const
const INSUFFICIENT_FUNDS = new Error(
  'bark_cpfp_insufficient_funds: needed_sats=3000; Insufficient funds',
)

function cpfpRequest(parentTxid: string): BarkEmergencyCpfpRequest {
  return { vtxoId: `vtxo-${parentTxid}`, parentTxid, parentTxHex: '00' }
}

function fundingStatus() {
  return useBarkEmergencyExitFundingStore.getState().fundingStatus
}

function unfundedParentTxids() {
  return useBarkEmergencyExitFundingStore.getState().unfundedParents?.txids ?? []
}

function progressReturns(parentTxids: string[]) {
  barkWorker.progressEmergencyExits.mockResolvedValue({
    requests: parentTxids.map(cpfpRequest),
  })
}

describe('runBarkEmergencyExitProgress', () => {
  beforeEach(() => {
    useBarkEmergencyExitFundingStore.getState().clearFundingStatus()
    useBarkEmergencyExitFundingStore.getState().clearUnfundedParents()
    barkWorker.progressEmergencyExits.mockReset()
    barkWorker.provideEmergencyExitCpfp.mockReset().mockResolvedValue(undefined)
    cryptoWorker.signP2aCpfpChild.mockReset().mockResolvedValue('child')
    cryptoWorker.applyUnconfirmedFundingTx.mockReset().mockResolvedValue(undefined)
    cryptoWorker.getBalance.mockReset().mockResolvedValue(balanceWithTotal(1_000_000))
  })

  it('BARK-EMG-21 publishes the funding status when a run leaves exits waiting', async () => {
    progressReturns(['parent-1', 'parent-2'])
    cryptoWorker.signP2aCpfpChild
      .mockResolvedValueOnce('child-1')
      .mockRejectedValueOnce(INSUFFICIENT_FUNDS)
    const listener = vi.fn()
    const unsubscribe = useBarkEmergencyExitFundingStore.subscribe(listener)

    await runBarkEmergencyExitProgress(SIGNET_WALLET, 1)
    unsubscribe()

    expect(fundingStatus()).toEqual({
      ...SIGNET_WALLET,
      providedChildren: 1,
      requestedChildren: 2,
      unfundedParentTxids: ['parent-2'],
    })
    expect(unfundedParentTxids()).toEqual(['parent-2'])
    expect(listener).toHaveBeenCalled()
  })

  it('BARK-EMG-21 clears the funding status after a run funds every request', async () => {
    progressReturns(['parent-1'])
    cryptoWorker.signP2aCpfpChild.mockRejectedValueOnce(INSUFFICIENT_FUNDS)
    await runBarkEmergencyExitProgress(SIGNET_WALLET, 1)
    expect(fundingStatus()).not.toBeNull()

    await runBarkEmergencyExitProgress(SIGNET_WALLET, 1)

    expect(fundingStatus()).toBeNull()
    expect(unfundedParentTxids()).toEqual([])
  })

  it('BARK-EMG-22 clears the funding status when progress fails as unfundable', async () => {
    progressReturns(['parent-1'])
    cryptoWorker.signP2aCpfpChild.mockRejectedValueOnce(INSUFFICIENT_FUNDS)
    await runBarkEmergencyExitProgress(SIGNET_WALLET, 1)
    expect(fundingStatus()).not.toBeNull()

    cryptoWorker.signP2aCpfpChild.mockRejectedValueOnce(INSUFFICIENT_FUNDS)
    cryptoWorker.getBalance.mockResolvedValueOnce(balanceWithTotal(100))

    await expect(runBarkEmergencyExitProgress(SIGNET_WALLET, 1)).rejects.toThrow(
      /^bark_cpfp_unfundable: /,
    )
    expect(fundingStatus()).toBeNull()
    expect(unfundedParentTxids()).toEqual(['parent-1'])
  })

  it('BARK-EMG-21 clears the funding status after a run with no requests', async () => {
    progressReturns(['parent-1'])
    cryptoWorker.signP2aCpfpChild.mockRejectedValueOnce(INSUFFICIENT_FUNDS)
    await runBarkEmergencyExitProgress(SIGNET_WALLET, 1)

    progressReturns([])
    await runBarkEmergencyExitProgress(SIGNET_WALLET, 1)

    expect(fundingStatus()).toBeNull()
    expect(unfundedParentTxids()).toEqual([])
  })
})

describe('barkEmergencyExitFundingStatusFor', () => {
  const status = {
    ...SIGNET_WALLET,
    providedChildren: 1,
    requestedChildren: 3,
    unfundedParentTxids: ['parent-2'],
  }

  it('returns the status for the same wallet and network', () => {
    expect(barkEmergencyExitFundingStatusFor(status, SIGNET_WALLET)).toBe(status)
  })

  it('hides the status from another wallet or network', () => {
    expect(barkEmergencyExitFundingStatusFor(status, { walletId: 2, networkMode: 'signet' })).toBeNull()
    expect(barkEmergencyExitFundingStatusFor(status, { walletId: 1, networkMode: 'mainnet' })).toBeNull()
  })
})

describe('barkEmergencyExitUnfundedParentTxidsFor', () => {
  const stored = { ...SIGNET_WALLET, txids: ['parent-2'] }

  it('returns the shortfall parents for the same wallet and network', () => {
    expect(barkEmergencyExitUnfundedParentTxidsFor(stored, SIGNET_WALLET)).toEqual(['parent-2'])
  })

  it('hides the shortfall parents from another wallet or network', () => {
    expect(barkEmergencyExitUnfundedParentTxidsFor(stored, { walletId: 2, networkMode: 'signet' })).toEqual([])
    expect(barkEmergencyExitUnfundedParentTxidsFor(stored, { walletId: 1, networkMode: 'mainnet' })).toEqual([])
    expect(barkEmergencyExitUnfundedParentTxidsFor(null, SIGNET_WALLET)).toEqual([])
  })
})

describe('formatBarkEmergencyExitFundingBanner', () => {
  function bannerFor(providedChildren: number, requestedChildren: number): string {
    return formatBarkEmergencyExitFundingBanner({
      ...SIGNET_WALLET,
      providedChildren,
      requestedChildren,
      unfundedParentTxids: [],
    })
  }

  it('BARK-EMG-21 names how many exit transactions are broadcasting and how many wait for funds', () => {
    expect(bannerFor(1, 3)).toBe(
      'Broadcasting 1 of 3 exit transactions. 2 are waiting for confirmed funds.',
    )
  })

  it('BARK-EMG-21 uses the singular when one exit transaction waits after a partial broadcast', () => {
    expect(bannerFor(2, 3)).toBe(
      'Broadcasting 2 of 3 exit transactions. 1 is waiting for confirmed funds.',
    )
  })

  it('BARK-EMG-21 explains the wait for change when no exit transaction could be broadcast', () => {
    expect(bannerFor(0, 1)).toBe(
      '1 exit transaction is waiting for confirmed funds. Change from earlier exit transactions must confirm first.',
    )
  })

  it('BARK-EMG-21 uses the plural when several exit transactions wait and none could be broadcast', () => {
    expect(bannerFor(0, 2)).toBe(
      '2 exit transactions are waiting for confirmed funds. Change from earlier exit transactions must confirm first.',
    )
  })
})
