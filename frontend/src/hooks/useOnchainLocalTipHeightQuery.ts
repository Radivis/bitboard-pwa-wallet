import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ONCHAIN_DASHBOARD_QUERY_KEY } from '@/lib/wallet/onchain-dashboard-sync'
import { readChangesetLocalTipHeight } from '@/lib/wallet/signet-mutinynet-chain-classifier'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import type { TransactionDetails } from '@/workers/crypto-types'

export function onchainLocalTipHeightQueryKey(
  walletId: number | null,
  networkMode: NetworkMode,
  transactionListGeneration: number,
) {
  return [
    ...ONCHAIN_DASHBOARD_QUERY_KEY,
    'local-tip-height',
    walletId,
    networkMode,
    transactionListGeneration,
  ] as const
}

/**
 * Counts replacements of the transaction list, including one whose rows are unchanged.
 *
 * Confirmation counts are the local chain tip minus each row's block height.
 * A sync can advance that tip and call `setTransactions` with an equal list:
 * same txids, same heights. A query key built from those fields would not
 * change, so the tip would stay stale. The generation changes on array
 * identity, which makes the query run again. This is not the activity page,
 * and it does not poll.
 */
function useTransactionListGeneration(transactions: TransactionDetails[]): number {
  const [snapshot, setSnapshot] = useState({ transactions, generation: 0 })
  if (snapshot.transactions !== transactions) {
    setSnapshot({ transactions, generation: snapshot.generation + 1 })
  }
  return snapshot.transactions === transactions ? snapshot.generation : snapshot.generation + 1
}

export function useOnchainLocalTipHeightQuery() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const transactions = useWalletStore((walletState) => walletState.transactions)
  const transactionListGeneration = useTransactionListGeneration(transactions)

  return useQuery({
    queryKey: onchainLocalTipHeightQueryKey(
      activeWalletId,
      networkMode,
      transactionListGeneration,
    ),
    enabled: networkMode !== 'lab',
    queryFn: readLocalTipHeightFromLoadedWallet,
    refetchOnWindowFocus: false,
  })
}

async function readLocalTipHeightFromLoadedWallet(): Promise<number | null> {
  try {
    const changesetJson = await useCryptoStore.getState().exportChangeset()
    return readChangesetLocalTipHeight(changesetJson)
  } catch {
    return null
  }
}
