import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  fetchLabAddressBalancesSats,
  fetchLabAddressesForOwnerPage,
  fetchLabBlockTransactionsPage,
  fetchLabOwnerKeysPage,
  fetchLabUtxosForOwnerPage,
  labAddressBalancesQueryKey,
  labAddressesByOwnerQueryKey,
  labBlockTxsQueryKey,
  labOwnerKeysQueryKey,
  labUtxosByOwnerQueryKey,
  LAB_CARD_PAGE_SIZE,
  LAB_ENTITY_INNER_PAGE_SIZE,
} from '@/lib/lab-paginated-queries'

export function useLabBlockTransactionsPage(
  blockHeight: number,
  pageIndex: number,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: labBlockTxsQueryKey(blockHeight, pageIndex),
    queryFn: () => fetchLabBlockTransactionsPage(blockHeight, pageIndex, LAB_CARD_PAGE_SIZE),
    enabled: enabled && Number.isInteger(blockHeight) && blockHeight >= 0,
  })

  useEffect(() => {
    if (!enabled || !Number.isInteger(blockHeight) || blockHeight < 0) return
    void queryClient.prefetchQuery({
      queryKey: labBlockTxsQueryKey(blockHeight, pageIndex + 1),
      queryFn: () => fetchLabBlockTransactionsPage(blockHeight, pageIndex + 1, LAB_CARD_PAGE_SIZE),
    })
  }, [queryClient, blockHeight, pageIndex, enabled])

  return query
}

export function useLabOwnerKeysPage(pageIndex: number, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: labOwnerKeysQueryKey(pageIndex),
    queryFn: () => fetchLabOwnerKeysPage(pageIndex, LAB_CARD_PAGE_SIZE),
    enabled,
  })

  useEffect(() => {
    if (!enabled) return
    void queryClient.prefetchQuery({
      queryKey: labOwnerKeysQueryKey(pageIndex + 1),
      queryFn: () => fetchLabOwnerKeysPage(pageIndex + 1, LAB_CARD_PAGE_SIZE),
    })
  }, [queryClient, pageIndex, enabled])

  return query
}

export function useLabAddressesForOwnerPage(
  ownerKey: string,
  pageIndex: number,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: labAddressesByOwnerQueryKey(ownerKey, pageIndex),
    queryFn: () => fetchLabAddressesForOwnerPage(ownerKey, pageIndex, LAB_ENTITY_INNER_PAGE_SIZE),
    enabled: enabled && ownerKey.length > 0,
  })

  useEffect(() => {
    if (!enabled || ownerKey.length === 0) return
    void queryClient.prefetchQuery({
      queryKey: labAddressesByOwnerQueryKey(ownerKey, pageIndex + 1),
      queryFn: () => fetchLabAddressesForOwnerPage(ownerKey, pageIndex + 1, LAB_ENTITY_INNER_PAGE_SIZE),
    })
  }, [queryClient, ownerKey, pageIndex, enabled])

  return query
}

export function useLabUtxosForOwnerPage(
  ownerKey: string,
  pageIndex: number,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: labUtxosByOwnerQueryKey(ownerKey, pageIndex),
    queryFn: () => fetchLabUtxosForOwnerPage(ownerKey, pageIndex, LAB_ENTITY_INNER_PAGE_SIZE),
    enabled: enabled && ownerKey.length > 0,
  })

  useEffect(() => {
    if (!enabled || ownerKey.length === 0) return
    void queryClient.prefetchQuery({
      queryKey: labUtxosByOwnerQueryKey(ownerKey, pageIndex + 1),
      queryFn: () => fetchLabUtxosForOwnerPage(ownerKey, pageIndex + 1, LAB_ENTITY_INNER_PAGE_SIZE),
    })
  }, [queryClient, ownerKey, pageIndex, enabled])

  return query
}

export function useLabAddressBalancesForAddresses(
  addresses: readonly string[],
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options
  const sortedKey = [...addresses].sort().join('|')

  return useQuery({
    queryKey: labAddressBalancesQueryKey(sortedKey),
    queryFn: () => fetchLabAddressBalancesSats(addresses),
    enabled: enabled && addresses.length > 0,
  })
}
