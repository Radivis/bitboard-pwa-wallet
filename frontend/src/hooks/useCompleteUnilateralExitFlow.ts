import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { scheduleBackgroundBumperWalletSync } from '@/lib/arkade/background-bumper-wallet-sync'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  useArkadeCompleteUnilateralExitMutation,
  useArkadeUnilateralExitCompletionFeeQuery,
  useArkadeUnilateralExitTimelockQuery,
  useArkadeUnilateralExitsInProgressQuery,
} from '@/hooks/useArkadeQueries'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import type {
  ArkadeUnilateralExitInProgressDto,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import {
  arkadeVtxoOutpointsEqual,
  includesArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

function outpointFromInProgressRow(
  row: ArkadeUnilateralExitInProgressDto,
): ArkadeVtxoOutpoint {
  return { txid: row.txid, vout: row.vout }
}

export function useCompleteUnilateralExitFlow() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)

  const [selectedInProgressOutpoints, setSelectedInProgressOutpoints] = useState<
    ArkadeVtxoOutpoint[]
  >([])
  const [completeDestination, setCompleteDestination] = useState('')

  const completionFeeSelection = useOnchainFeeRateSelection(networkMode)
  const { effectiveFeeRate: completionFeeRateSatPerVb, ...completionFeeRateUi } =
    completionFeeSelection

  const inProgressQuery = useArkadeUnilateralExitsInProgressQuery(true)
  const timelockQuery = useArkadeUnilateralExitTimelockQuery(true)
  const bumperInfoQuery = { data: timelockQuery.data }

  useEffect(() => {
    if (activeWalletId == null || !isArkadeSupportedNetworkMode(networkMode)) {
      return
    }
    scheduleBackgroundBumperWalletSync({
      walletId: activeWalletId,
      networkMode,
    })
  }, [activeWalletId, networkMode])

  const completionFeeQuery = useArkadeUnilateralExitCompletionFeeQuery({
    enabled: true,
    vtxoOutpoints: selectedInProgressOutpoints,
    destinationAddress: completeDestination,
    feeRateSatPerVb: completionFeeRateSatPerVb,
  })
  const completeExitMutation = useArkadeCompleteUnilateralExitMutation()

  const selectedInProgressRows = useMemo(
    () =>
      selectedInProgressOutpoints
        .map((outpoint) =>
          inProgressQuery.data?.find((row) =>
            arkadeVtxoOutpointsEqual(outpointFromInProgressRow(row), outpoint),
          ),
        )
        .filter((row): row is ArkadeUnilateralExitInProgressDto => row != null),
    [inProgressQuery.data, selectedInProgressOutpoints],
  )

  const selectedInProgressTotalSats = useMemo(
    () => selectedInProgressRows.reduce((total, row) => total + row.amountSats, 0),
    [selectedInProgressRows],
  )

  const allSelectedCanComplete =
    selectedInProgressRows.length > 0 &&
    selectedInProgressRows.every((row) => row.canComplete)

  useEffect(() => {
    if (currentAddress) {
      setCompleteDestination(currentAddress)
    }
  }, [currentAddress])

  const toggleInProgressSelection = (row: ArkadeUnilateralExitInProgressDto) => {
    const outpoint = outpointFromInProgressRow(row)
    setSelectedInProgressOutpoints((previous) =>
      includesArkadeVtxoOutpoint(previous, outpoint)
        ? previous.filter((selected) => !arkadeVtxoOutpointsEqual(selected, outpoint))
        : [...previous, outpoint],
    )
  }

  const selectAllReadyInProgress = () => {
    const readyOutpoints = (inProgressQuery.data ?? [])
      .filter((row) => row.canComplete)
      .map(outpointFromInProgressRow)
    setSelectedInProgressOutpoints(readyOutpoints)
  }

  const handleCompleteExit = () => {
    if (!allSelectedCanComplete || completeDestination.trim().length === 0) return
    void completeExitMutation
      .mutateAsync({
        vtxoOutpoints: selectedInProgressOutpoints,
        destinationAddress: completeDestination.trim(),
        feeRateSatPerVb: completionFeeRateSatPerVb,
      })
      .then(() => {
        void navigate({ to: '/wallet/management' })
      })
      .catch(() => {
        // Toast is handled by useArkadeCompleteUnilateralExitMutation.
      })
  }

  return {
    inProgressQuery,
    bumperInfoQuery,
    completionFeeQuery,
    completionFeeRateUi,
    completeExitMutation,
    selectedInProgressOutpoints,
    selectedInProgressRows,
    selectedInProgressTotalSats,
    allSelectedCanComplete,
    completeDestination,
    setCompleteDestination,
    toggleInProgressSelection,
    selectAllReadyInProgress,
    handleCompleteExit,
  }
}
