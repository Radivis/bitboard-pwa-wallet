import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { bitcoinUnitQueryKey } from '@/lib/bitcoin-unit-query'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'

/**
 * Default Bitcoin display unit from persisted settings, mirrored in TanStack Query cache.
 */
export function useBitcoinUnit() {
  const queryClient = useQueryClient()
  const defaultBitcoinUnit = useBitcoinDisplayUnitStore((s) => s.defaultBitcoinUnit)

  const query = useQuery({
    queryKey: bitcoinUnitQueryKey,
    queryFn: (): Promise<BitcoinDisplayUnit> =>
      Promise.resolve(useBitcoinDisplayUnitStore.getState().defaultBitcoinUnit),
    initialData: defaultBitcoinUnit,
    staleTime: Infinity,
  })

  useEffect(() => {
    queryClient.setQueryData(bitcoinUnitQueryKey, defaultBitcoinUnit)
  }, [defaultBitcoinUnit, queryClient])

  return query
}
