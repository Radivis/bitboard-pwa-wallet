import { useQuery } from '@tanstack/react-query'
import { getEsploraUrl } from '@/lib/bitcoin-utils'
import {
  fetchFeeEstimates,
  NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB,
  pickPresetRatesFromEsploraOrFallback,
  type SendFeePresetLabel,
} from '@/lib/esplora-fee-estimates'
import type { NetworkMode } from '@/stores/walletStore'
import { loadCustomEsploraUrl } from '@/lib/wallet-utils'

/** React Query stable key fragment (custom Esplora URL is resolved inside the fetcher). */
export const ESPLORA_FEE_PRESETS_QUERY_KEY = ['esplora-fee-presets'] as const

async function presetRatesForNetwork(
  networkMode: NetworkMode,
): Promise<Record<SendFeePresetLabel, number>> {
  if (networkMode === 'lab') {
    return { ...pickPresetRatesFromEsploraOrFallback(null) }
  }
  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)
  if (!esploraUrl) {
    return { ...pickPresetRatesFromEsploraOrFallback(null) }
  }
  try {
    const estimates = await fetchFeeEstimates(esploraUrl)
    return pickPresetRatesFromEsploraOrFallback(estimates)
  } catch {
    return { ...pickPresetRatesFromEsploraOrFallback(null) }
  }
}

/** Live Esplora `fee-estimates` mapped to Low/Medium/High using targets 144 / 6 / 1, or fallback table. */
export function useEsploraFeePresets(networkMode: NetworkMode) {
  return useQuery({
    queryKey: [...ESPLORA_FEE_PRESETS_QUERY_KEY, networkMode] as const,
    queryFn: () => presetRatesForNetwork(networkMode),
    staleTime: 60_000,
    initialData: {
      Low: NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB.Low,
      Medium: NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB.Medium,
      High: NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB.High,
    },
  })
}
