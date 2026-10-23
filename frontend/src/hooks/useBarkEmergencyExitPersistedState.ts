import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import { effectiveBarkEmergencyExitMaxFeeRate } from '@/lib/bark/bark-emergency-exit-automated-fee'
import {
  syncBarkEmergencyExitAutomation,
  stopBarkEmergencyExitAutomation,
} from '@/lib/bark/bark-emergency-exit-automation'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { errorMessage } from '@/lib/shared/utils'
import {
  defaultMaxFeeRateSatPerVb,
  resolveAutomatedStepFeeRateSatPerVb,
} from '@/lib/onchain/automated-step-fee-rate'
import { DEFAULT_BARK_EMERGENCY_EXIT_FEE_PRESET } from '@/lib/wallet/wallet-domain-types'
import {
  clearBarkEmergencyExitAutomationPause,
  pauseBarkEmergencyExitAutomation,
  useBarkEmergencyExitAutomationStore,
} from '@/stores/barkEmergencyExitAutomationStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore, type NetworkMode } from '@/stores/walletStore'
import type { BarkEmergencyExitFeePrefs, PendingEmergencyClaim } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkPendingEmergencyClaimQueryKey(
  walletId: number | null,
  networkMode: string,
) {
  return ['bark', 'pending-emergency-claim', walletId, networkMode] as const
}

export function barkProceedAutomaticallyQueryKey(
  walletId: number | null,
  networkMode: string,
) {
  return ['bark', 'proceed-automatically', walletId, networkMode] as const
}

export function barkEmergencyExitFeePrefsQueryKey(
  walletId: number | null,
  networkMode: string,
) {
  return ['bark', 'emergency-exit-fee-prefs', walletId, networkMode] as const
}

function sessionQueryEnabled(params: {
  isBarkEnabled: boolean
  networkMode: NetworkMode
  loadPhase: string
  walletId: number | null
}): boolean {
  return (
    params.isBarkEnabled &&
    isBarkNetworkMode(params.networkMode) &&
    params.loadPhase === 'loaded' &&
    params.walletId != null
  )
}

function replaceFeePrefs(
  current: BarkEmergencyExitFeePrefs | undefined,
  next: Partial<BarkEmergencyExitFeePrefs>,
  fallbackPreset: BarkEmergencyExitFeePrefs['feePresetLabel'],
): BarkEmergencyExitFeePrefs {
  return {
    feePresetLabel: next.feePresetLabel ?? current?.feePresetLabel ?? fallbackPreset,
    maxFeeRateSatPerVb:
      next.maxFeeRateSatPerVb !== undefined
        ? next.maxFeeRateSatPerVb
        : (current?.maxFeeRateSatPerVb ?? null),
  }
}

function writeFeePrefsCache(
  queryClient: QueryClient,
  feePrefsKey: ReturnType<typeof barkEmergencyExitFeePrefsQueryKey>,
  next: Partial<BarkEmergencyExitFeePrefs>,
  fallbackPreset: BarkEmergencyExitFeePrefs['feePresetLabel'],
): void {
  queryClient.setQueryData(feePrefsKey, (current: BarkEmergencyExitFeePrefs | undefined) =>
    replaceFeePrefs(current, next, fallbackPreset),
  )
}

/**
 * Persisted emergency-exit reads and the fee-pref writes.
 * Start, progress, and claim stay on the page hook.
 */
export function useBarkEmergencyExitPersistedState() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const feeSelection = useOnchainFeeRateSelection(networkMode)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const queryClient = useQueryClient()
  const enabled = sessionQueryEnabled({
    isBarkEnabled,
    networkMode,
    loadPhase: loadSnapshot.loadPhase,
    walletId: activeWalletId,
  })

  const pendingClaimQuery = useQuery({
    queryKey: barkPendingEmergencyClaimQueryKey(activeWalletId, networkMode),
    enabled,
    queryFn: () => getBarkWorker().readPendingEmergencyClaim(),
  })
  const proceedAutomaticallyQuery = useQuery({
    queryKey: barkProceedAutomaticallyQueryKey(activeWalletId, networkMode),
    enabled,
    queryFn: () => getBarkWorker().readProceedAutomatically(),
  })
  const feePrefsQuery = useQuery({
    queryKey: barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode),
    enabled,
    queryFn: () => getBarkWorker().readEmergencyExitFeePrefs(),
  })

  const proceedAutomatically = proceedAutomaticallyQuery.data === true
  const pausedReason = useBarkEmergencyExitAutomationStore(
    (automationState) => automationState.pausedReason,
  )
  const automatedFeePresetLabel =
    feePrefsQuery.data?.feePresetLabel ?? DEFAULT_BARK_EMERGENCY_EXIT_FEE_PRESET
  const maxFeeRateSatPerVb = effectiveBarkEmergencyExitMaxFeeRate(
    feePrefsQuery.data?.maxFeeRateSatPerVb ?? null,
    feeSelection.presetSatPerVbByLabel.High,
  )
  const automatedFeeResolution = resolveAutomatedStepFeeRateSatPerVb(
    automatedFeePresetLabel,
    feeSelection.presetSatPerVbByLabel,
    maxFeeRateSatPerVb,
  )
  const displayedPauseReason =
    !proceedAutomatically
      ? null
      : (pausedReason ?? (automatedFeeResolution.capExceeded ? 'feeCapExceeded' : null))
  const feeRateForActions = proceedAutomatically
    ? automatedFeeResolution.feeRateSatPerVb
    : feeSelection.effectiveFeeRate

  function feeCapBlocksBroadcast(): boolean {
    if (!proceedAutomatically) return false
    if (pausedReason === 'feeCapExceeded' || automatedFeeResolution.capExceeded) {
      if (pausedReason !== 'feeCapExceeded') {
        pauseBarkEmergencyExitAutomation('feeCapExceeded')
      }
      return true
    }
    return false
  }

  async function onProceedAutomaticallyChange(enabledProceeding: boolean) {
    if (activeWalletId == null || !isBarkNetworkMode(networkMode)) return
    const queryKey = barkProceedAutomaticallyQueryKey(activeWalletId, networkMode)
    const feePrefsKey = barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode)
    queryClient.setQueryData(queryKey, enabledProceeding)
    try {
      await getBarkWorker().writeProceedAutomatically(enabledProceeding)
      if (enabledProceeding) {
        const maxFeeRate = defaultMaxFeeRateSatPerVb(feeSelection.presetSatPerVbByLabel.High)
        await getBarkWorker().writeEmergencyExitMaxFeeRate(maxFeeRate)
        writeFeePrefsCache(
          queryClient,
          feePrefsKey,
          { maxFeeRateSatPerVb: maxFeeRate },
          automatedFeePresetLabel,
        )
        void syncBarkEmergencyExitAutomation({ walletId: activeWalletId, networkMode })
      } else {
        stopBarkEmergencyExitAutomation()
      }
    } catch (err) {
      queryClient.setQueryData(queryKey, !enabledProceeding)
      if (enabledProceeding) {
        await getBarkWorker().writeProceedAutomatically(false).catch(() => undefined)
      }
      toast.error(errorMessage(err) || 'Could not save automatic proceeding')
    }
  }

  async function onAutomaticFeePresetChange(
    feePresetLabel: BarkEmergencyExitFeePrefs['feePresetLabel'],
  ) {
    if (activeWalletId == null) return
    const feePrefsKey = barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode)
    try {
      await getBarkWorker().writeEmergencyExitFeePreset(feePresetLabel)
      writeFeePrefsCache(queryClient, feePrefsKey, { feePresetLabel }, feePresetLabel)
      clearBarkEmergencyExitAutomationPause()
    } catch (err) {
      toast.error(errorMessage(err) || 'Could not save the fee rate')
    }
  }

  async function onMaxFeeRateChange(nextMaxFeeRateSatPerVb: number) {
    if (activeWalletId == null) return
    const feePrefsKey = barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode)
    try {
      await getBarkWorker().writeEmergencyExitMaxFeeRate(nextMaxFeeRateSatPerVb)
      writeFeePrefsCache(
        queryClient,
        feePrefsKey,
        { maxFeeRateSatPerVb: nextMaxFeeRateSatPerVb },
        automatedFeePresetLabel,
      )
      clearBarkEmergencyExitAutomationPause()
    } catch (err) {
      toast.error(errorMessage(err) || 'Could not save the maximum fee rate')
    }
  }

  return {
    pendingEmergencyClaim: (pendingClaimQuery.data ?? null) as PendingEmergencyClaim | null,
    proceedAutomatically,
    proceedAutomaticallyPending: proceedAutomaticallyQuery.isPending,
    onProceedAutomaticallyChange: (enabledProceeding: boolean) =>
      void onProceedAutomaticallyChange(enabledProceeding),
    onAutomaticFeePresetChange: (
      preset: BarkEmergencyExitFeePrefs['feePresetLabel'],
      _rateSatPerVb: number,
    ) => void onAutomaticFeePresetChange(preset),
    onMaxFeeRateChange: (nextMaxFeeRateSatPerVb: number) =>
      void onMaxFeeRateChange(nextMaxFeeRateSatPerVb),
    displayedPauseReason,
    feeRateForActions,
    feeCapBlocksBroadcast,
    manualFeePresetSelection: feeSelection.feePresetSelection,
    automatedFeePresetLabel,
    presetSatPerVbByLabel: feeSelection.presetSatPerVbByLabel,
    feeEstimatesRefreshing: feeSelection.feeEstimatesRefreshing,
    customFeeRate: feeSelection.customFeeRate,
    useCustomFee: feeSelection.useCustomFee,
    maxFeeRateSatPerVb,
    onSelectManualPreset: feeSelection.handleSelectFeePreset,
    setCustomFeeRate: feeSelection.setCustomFeeRate,
    onSelectCustomMode: feeSelection.handleSelectCustomMode,
  }
}
