import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { createBackendService } from '@/lib/lightning/lightning-backend-service'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning/lightning-connection-utils'
import { sendPageLnBalanceQueryKey } from '@/lib/lightning/lightning-query-keys'
import { LN_WALLET_BALANCE_STALE_MS } from '@/lib/lightning/lightning-query-timings'
import type { NetworkMode } from '@/stores/walletStore'

/**
 * Matching NWC connections for the send screen, per-connection balance queries,
 * and the user’s selected wallet when paying a Lightning invoice.
 */
export function useSendLightningBalances(params: {
  isLightningEnabled: boolean
  networkMode: NetworkMode
  activeWalletId: number | null
  connectedLightningWallets: ConnectedLightningWallet[]
  isLightningSendMode: boolean
}) {
  const {
    isLightningEnabled,
    networkMode,
    activeWalletId,
    connectedLightningWallets,
    isLightningSendMode,
  } = params

  const matchingLightningConnections = useMemo(
    (): ConnectedLightningWallet[] =>
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets,
        activeWalletId,
        networkMode,
        isLightningEnabled: isLightningEnabled,
      }),
    [
      isLightningEnabled,
      networkMode,
      activeWalletId,
      connectedLightningWallets,
    ],
  )

  const [selectedLightningConnectionId, setSelectedLightningConnectionId] =
    useState<string | null>(null)

  useEffect(() => {
    if (!isLightningSendMode) {
      setSelectedLightningConnectionId(null)
      return
    }
    const ids = matchingLightningConnections.map((connection) => connection.id)
    if (matchingLightningConnections.length === 1) {
      setSelectedLightningConnectionId(matchingLightningConnections[0].id)
    } else if (matchingLightningConnections.length > 1) {
      setSelectedLightningConnectionId((prev) =>
        prev != null && ids.includes(prev) ? prev : null,
      )
    } else {
      setSelectedLightningConnectionId(null)
    }
  }, [isLightningSendMode, matchingLightningConnections])

  const balanceQueries = useQueries({
    queries: matchingLightningConnections.map((connection) => ({
      queryKey: sendPageLnBalanceQueryKey(connection.id),
      queryFn: () => createBackendService(connection.config).getBalance(),
      enabled: isLightningSendMode && matchingLightningConnections.length > 0,
      staleTime: LN_WALLET_BALANCE_STALE_MS,
    })),
  })

  const selectedLightningWallet = useMemo(
    () =>
      matchingLightningConnections.find(
        (connection) => connection.id === selectedLightningConnectionId,
      ) ?? null,
    [matchingLightningConnections, selectedLightningConnectionId],
  )

  const selectedLnBalanceIndex = matchingLightningConnections.findIndex(
    (connection) => connection.id === selectedLightningConnectionId,
  )
  const selectedLnBalanceQuery =
    selectedLnBalanceIndex >= 0 ? balanceQueries[selectedLnBalanceIndex] : null
  const selectedLnBalanceSats = selectedLnBalanceQuery?.data?.balanceSats

  const hasLightningWalletSelected =
    selectedLightningConnectionId != null && selectedLightningWallet != null

  return {
    matchingLightningConnections,
    selectedLightningConnectionId,
    setSelectedLightningConnectionId,
    balanceQueries,
    selectedLightningWallet,
    selectedLnBalanceQuery,
    selectedLnBalanceSats,
    hasLightningWalletSelected,
  }
}
