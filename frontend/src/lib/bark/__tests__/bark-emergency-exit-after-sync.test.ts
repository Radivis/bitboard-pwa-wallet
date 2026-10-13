import { beforeEach, describe, expect, it, vi } from 'vitest'

const CUSTOM_ESPLORA_URL = 'https://my-own-esplora.example/api'
const PENDING_CLAIM = { txid: 'claim-txid', vtxoIds: ['vtxo-1'] }

const customEsploraUrlState = vi.hoisted(() => ({ current: null as string | null }))

const barkWorkerMock = vi.hoisted(() => ({
  readPendingEmergencyClaim: vi.fn(),
  listEmergencyExits: vi.fn(),
  writePendingEmergencyClaim: vi.fn(),
  readProceedAutomatically: vi.fn(),
  readEmergencyExitFeePrefs: vi.fn(),
}))

const claimTransactionVisibilityMock = vi.hoisted(() => vi.fn())
const runBarkEmergencyExitProgress = vi.hoisted(() => vi.fn())
const presetRatesForNetwork = vi.hoisted(() => vi.fn())
const catchUpOnchainWalletForBarkExit = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => barkWorkerMock,
}))

vi.mock('@/lib/bark/bark-claim-transaction-visibility', () => ({
  claimTransactionVisibility: claimTransactionVisibilityMock,
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  loadCustomEsploraUrl: async () => customEsploraUrlState.current,
}))

vi.mock('@/lib/bark/bark-emergency-exit-progress-deps', () => ({
  runBarkEmergencyExitProgress,
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  presetRatesForNetwork,
}))

vi.mock('@/lib/bark/bark-emergency-exit-onchain-catch-up-live', () => ({
  catchUpOnchainWalletForBarkExit,
  fetchBarkExitChainTip: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: { getState: () => ({ activeWalletId: 1 }) },
  selectCommittedNetworkMode: () => 'signet',
}))

import { settleBarkEmergencyExitAfterSync } from '@/lib/bark/bark-emergency-exit-after-sync'
import {
  IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY,
  useBarkEmergencyExitAutomationStore,
} from '@/stores/barkEmergencyExitAutomationStore'

const presets = { Low: 0.5, Medium: 2, High: 8 }

describe('settleBarkEmergencyExitAfterSync', () => {
  beforeEach(() => {
    customEsploraUrlState.current = null
    barkWorkerMock.readPendingEmergencyClaim.mockResolvedValue(PENDING_CLAIM)
    barkWorkerMock.listEmergencyExits.mockResolvedValue([])
    barkWorkerMock.writePendingEmergencyClaim.mockResolvedValue(undefined)
    barkWorkerMock.readProceedAutomatically.mockResolvedValue(false)
    barkWorkerMock.readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'Medium',
      maxFeeRateSatPerVb: 10,
    })
    claimTransactionVisibilityMock.mockReset().mockResolvedValue('unknown')
    presetRatesForNetwork.mockReset().mockResolvedValue(presets)
    runBarkEmergencyExitProgress.mockReset().mockResolvedValue({
      requestedChildren: 0,
      providedChildren: 0,
    })
    catchUpOnchainWalletForBarkExit.mockClear()
    useBarkEmergencyExitAutomationStore.setState(IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY)
  })

  it('BARK-EMG-25 checks pending claim visibility against the custom Esplora URL when one is set', async () => {
    customEsploraUrlState.current = CUSTOM_ESPLORA_URL

    await settleBarkEmergencyExitAfterSync('signet')

    expect(claimTransactionVisibilityMock).toHaveBeenCalledWith(
      CUSTOM_ESPLORA_URL,
      PENDING_CLAIM.txid,
    )
  })

  it('BARK-EMG-27 progresses a sync at High while automatic proceeding is off', async () => {
    barkWorkerMock.listEmergencyExits.mockResolvedValue([{ vtxoId: 'vtxo-1' }])

    await settleBarkEmergencyExitAfterSync('signet')

    expect(runBarkEmergencyExitProgress).toHaveBeenCalledWith(
      { walletId: 1, networkMode: 'signet' },
      8,
    )
    expect(barkWorkerMock.readEmergencyExitFeePrefs).not.toHaveBeenCalled()
  })

  it('BARK-EMG-27 uses the automatic fee lock during sync when proceeding is on', async () => {
    barkWorkerMock.listEmergencyExits.mockResolvedValue([{ vtxoId: 'vtxo-1' }])
    barkWorkerMock.readProceedAutomatically.mockResolvedValue(true)
    barkWorkerMock.readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'Low',
      maxFeeRateSatPerVb: 10,
    })

    await settleBarkEmergencyExitAfterSync('signet')

    expect(runBarkEmergencyExitProgress).toHaveBeenCalledWith(
      { walletId: 1, networkMode: 'signet' },
      0.5,
    )
    expect(presetRatesForNetwork).toHaveBeenCalled()
  })

  it('BARK-EMG-27 does not progress a sync when the automatic fee cap is already exceeded', async () => {
    barkWorkerMock.listEmergencyExits.mockResolvedValue([{ vtxoId: 'vtxo-1' }])
    barkWorkerMock.readProceedAutomatically.mockResolvedValue(true)
    barkWorkerMock.readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'High',
      maxFeeRateSatPerVb: 5,
    })

    await settleBarkEmergencyExitAfterSync('signet')

    expect(runBarkEmergencyExitProgress).not.toHaveBeenCalled()
    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBe('feeCapExceeded')
  })
})
