import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BarkCpfpUnfundableError } from '@/lib/bark/perform-bark-emergency-exit'
import {
  IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY,
  clearBarkEmergencyExitAutomationPause,
  useBarkEmergencyExitAutomationStore,
} from '@/stores/barkEmergencyExitAutomationStore'

const readEmergencyExitFeePrefs = vi.hoisted(() => vi.fn())
const presetRatesForNetwork = vi.hoisted(() => vi.fn())
const runBarkEmergencyExitProgress = vi.hoisted(() => vi.fn())
const catchUpOnchainWalletForBarkExit = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({ readEmergencyExitFeePrefs }),
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  presetRatesForNetwork,
}))

vi.mock('@/lib/bark/bark-emergency-exit-progress-deps', () => ({
  runBarkEmergencyExitProgress,
}))

vi.mock('@/lib/bark/bark-emergency-exit-onchain-catch-up-live', () => ({
  catchUpOnchainWalletForBarkExit,
  fetchBarkExitChainTip: vi.fn(),
}))

import { progressBarkEmergencyExitAutomatically } from '@/lib/bark/bark-emergency-exit-automation'

const presets = { Low: 0.5, Medium: 2, High: 8 }
const scope = { walletId: 1, networkMode: 'signet' as const }

describe('progressBarkEmergencyExitAutomatically', () => {
  beforeEach(() => {
    useBarkEmergencyExitAutomationStore.setState(IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY)
    readEmergencyExitFeePrefs.mockReset()
    presetRatesForNetwork.mockReset().mockResolvedValue(presets)
    runBarkEmergencyExitProgress.mockReset().mockResolvedValue({
      requestedChildren: 1,
      providedChildren: 1,
    })
    catchUpOnchainWalletForBarkExit.mockClear()
  })

  it('BARK-EMG-27 locks the live preset for the call when it is within the max', async () => {
    readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'Medium',
      maxFeeRateSatPerVb: 10,
    })

    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })

    expect(runBarkEmergencyExitProgress).toHaveBeenCalledWith(scope, 2)
    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBeNull()
  })

  it('BARK-EMG-27 pauses without progressing when the live preset exceeds the max', async () => {
    readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'High',
      maxFeeRateSatPerVb: 5,
    })

    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })
    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })

    expect(runBarkEmergencyExitProgress).not.toHaveBeenCalled()
    expect(presetRatesForNetwork).toHaveBeenCalledTimes(1)
    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBe('feeCapExceeded')
  })

  it('BARK-EMG-27 resumes after the degree or max change clears the pause', async () => {
    readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'High',
      maxFeeRateSatPerVb: 5,
    })
    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })
    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBe('feeCapExceeded')

    clearBarkEmergencyExitAutomationPause()
    readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'Low',
      maxFeeRateSatPerVb: 10,
    })

    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })

    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBeNull()
    expect(runBarkEmergencyExitProgress).toHaveBeenCalledWith(scope, 0.5)
  })

  it('BARK-EMG-27 pauses when the step is unfundable and does not pause a partial funding wait', async () => {
    readEmergencyExitFeePrefs.mockResolvedValue({
      feePresetLabel: 'Medium',
      maxFeeRateSatPerVb: 10,
    })
    runBarkEmergencyExitProgress.mockResolvedValueOnce({
      requestedChildren: 2,
      providedChildren: 1,
    })

    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })

    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBeNull()
    expect(runBarkEmergencyExitProgress).toHaveBeenCalledTimes(1)

    runBarkEmergencyExitProgress.mockRejectedValueOnce(
      new BarkCpfpUnfundableError({
        waitingNeededSats: 3_000,
        onchainTotalSats: 100,
        unfundedParentTxids: [],
      }),
    )
    await expect(
      progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' }),
    ).resolves.toBeUndefined()
    expect(useBarkEmergencyExitAutomationStore.getState().pausedReason).toBe('fundsInsufficient')

    runBarkEmergencyExitProgress.mockClear()
    await progressBarkEmergencyExitAutomatically({ scope, networkMode: 'signet' })
    expect(runBarkEmergencyExitProgress).not.toHaveBeenCalled()
  })
})
