import { useCallback, useEffect, useMemo } from 'react'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import {
  NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
  type SendFeePresetLabel,
} from '@/lib/esplora/esplora-fee-estimates'
import { useSendStore } from '@/stores/sendStore'
import { useWalletStore } from '@/stores/walletStore'

export function useSendFlowFees() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const {
    feePresetSelection,
    feeRate,
    customFeeRate,
    useCustomFee,
    setFeeRate,
    setCustomFeeRate,
    setUseCustomFee,
  } = useSendStore()

  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const presetSatPerVbByLabel =
    feePresetsQuery.data ?? NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB
  const feeEstimatesRefreshing = feePresetsQuery.isFetching

  const handleSelectFeePreset = useCallback(
    (preset: SendFeePresetLabel, rateSatPerVb: number) => {
      useSendStore.setState({
        feePresetSelection: preset,
        feeRate: rateSatPerVb,
        useCustomFee: false,
      })
    },
    [],
  )

  const customFeeParsed = useMemo(() => {
    const customFeeRateValue = Number.parseFloat(customFeeRate.trim())
    if (!Number.isFinite(customFeeRateValue) || customFeeRateValue <= 0) return null
    return customFeeRateValue
  }, [customFeeRate])

  const effectiveFeeRate = useCustomFee
    ? (customFeeParsed ?? presetSatPerVbByLabel.Medium)
    : feeRate

  useEffect(() => {
    if (useCustomFee) return
    const syncedRate = presetSatPerVbByLabel[feePresetSelection]
    if (syncedRate === undefined) return
    if (syncedRate === feeRate) return
    setFeeRate(syncedRate)
  }, [
    useCustomFee,
    feePresetSelection,
    presetSatPerVbByLabel,
    feeRate,
    setFeeRate,
  ])

  return {
    feePresetSelection,
    presetSatPerVbByLabel,
    feeEstimatesRefreshing,
    handleSelectFeePreset,
    effectiveFeeRate,
    customFeeRate,
    customFeeParsed,
    useCustomFee,
    setCustomFeeRate,
    setUseCustomFee,
  }
}
