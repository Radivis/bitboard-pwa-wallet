import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { createBackendService } from '@/lib/lightning-backend-service'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning-connection-utils'
import { LN_WALLET_BALANCE_STALE_MS } from '@/lib/lightning-query-timings'
import type { NetworkMode } from '@/stores/walletStore'

/**
 * Matching NWC connections for the send screen, per-connection balance queries,
 * and the user’s selected wallet when paying a Lightning invoice.
 */
export function useSendLightningBalances(params: {
  lightningEnabled: boolean
  networkMode: NetworkMode
  activeWalletId: number | null
  connectedLightningWallets: ConnectedLightningWallet[]
  isLightningSendMode: boolean
}) {
  const {
    lightningEnabled,
    networkMode,
    activeWalletId,
    connectedLightningWallets,
    isLightningSendMode,
  } = params

  const matchingLightningConnections = useMemo(
    (): ConnectedLightningWallet[] =>
      getLightningConnectionsForActiveWallet(
        connectedLightningWallets,
        activeWalletId,
        networkMode,
        lightningEnabled,
      ),
    [
      lightningEnabled,
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
    const ids = matchingLightningConnections.map((c) => c.id)
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

  const lnBalanceQueries = useQueries({
    queries: matchingLightningConnections.map((conn) => ({
      queryKey: ['send-page-ln-balance', conn.id],
      queryFn: () => createBackendService(conn.config).getBalance(),
      enabled: isLightningSendMode && matchingLightningConnections.length > 0,
      staleTime: LN_WALLET_BALANCE_STALE_MS,
    })),
  })

  const selectedLightningWallet = useMemo(
    () =>
      matchingLightningConnections.find(
        (c) => c.id === selectedLightningConnectionId,
      ) ?? null,
    [matchingLightningConnections, selectedLightningConnectionId],
  )

  const selectedLnBalanceIndex = matchingLightningConnections.findIndex(
    (c) => c.id === selectedLightningConnectionId,
  )
  const selectedLnBalanceQuery =
    selectedLnBalanceIndex >= 0 ? lnBalanceQueries[selectedLnBalanceIndex] : null
  const selectedLnBalanceSats = selectedLnBalanceQuery?.data?.balanceSats

  const hasLightningWalletSelected =
    selectedLightningConnectionId != null && selectedLightningWallet != null

  return {
    matchingLightningConnections,
    selectedLightningConnectionId,
    setSelectedLightningConnectionId,
    lnBalanceQueries,
    selectedLightningWallet,
    selectedLnBalanceQuery,
    selectedLnBalanceSats,
    hasLightningWalletSelected,
  }
}
