import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import {
  NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
  type SendFeePresetLabel,
} from '@/lib/esplora/esplora-fee-estimates'
import type { NetworkMode } from '@/stores/walletStore'

const DEFAULT_FEE_PRESET: SendFeePresetLabel = 'Medium'

/**
 * Local on-chain fee preset state (Low / Medium / High / Custom) backed by live Esplora
 * `/fee-estimates`. Same UX as the Send page without coupling to `sendStore`.
 */
export function useOnchainFeeRateSelection(networkMode: NetworkMode) {
  const [feePresetSelection, setFeePresetSelection] =
    useState<SendFeePresetLabel>(DEFAULT_FEE_PRESET)
  const [feeRate, setFeeRate] = useState<number>(
    NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB[DEFAULT_FEE_PRESET],
  )
  const [customFeeRate, setCustomFeeRate] = useState('')
  const [useCustomFee, setUseCustomFee] = useState(false)

  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const presetSatPerVbByLabel =
    feePresetsQuery.data ?? NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB
  const feeEstimatesRefreshing = feePresetsQuery.isFetching

  const customFeeParsed = useMemo(() => {
    const customFeeRateValue = Number.parseFloat(customFeeRate.trim())
    if (!Number.isFinite(customFeeRateValue) || customFeeRateValue <= 0) return null
    return customFeeRateValue
  }, [customFeeRate])

  const effectiveFeeRate = useCustomFee
    ? (customFeeParsed ?? presetSatPerVbByLabel[DEFAULT_FEE_PRESET])
    : feeRate

  const handleSelectFeePreset = useCallback(
    (preset: SendFeePresetLabel, rateSatPerVb: number) => {
      setFeePresetSelection(preset)
      setFeeRate(rateSatPerVb)
      setUseCustomFee(false)
    },
    [],
  )

  const handleSelectCustomMode = useCallback(() => {
    setUseCustomFee(true)
  }, [])

  const resetFeeSelection = useCallback(() => {
    setFeePresetSelection(DEFAULT_FEE_PRESET)
    setFeeRate(NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB[DEFAULT_FEE_PRESET])
    setCustomFeeRate('')
    setUseCustomFee(false)
  }, [])

  useEffect(() => {
    if (useCustomFee) return
    const syncedRate = presetSatPerVbByLabel[feePresetSelection]
    if (syncedRate === undefined) return
    if (syncedRate === feeRate) return
    setFeeRate(syncedRate)
  }, [useCustomFee, feePresetSelection, presetSatPerVbByLabel, feeRate])

  return {
    feePresetSelection,
    presetSatPerVbByLabel,
    feeEstimatesRefreshing,
    handleSelectFeePreset,
    handleSelectCustomMode,
    effectiveFeeRate,
    customFeeRate,
    setCustomFeeRate,
    useCustomFee,
    resetFeeSelection,
  }
}
