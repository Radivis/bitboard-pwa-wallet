import { useEffect, useMemo, useState } from 'react'
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeCollaborativeExitFeeQuery,
  useArkadeCollaborativeExitMutation,
  useArkadeCompleteUnilateralExitMutation,
  useArkadeUnilateralExitCompletionFeeQuery,
  useArkadeUnilateralExitsInProgressQuery,
} from '@/hooks/useArkadeQueries'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import { parseCollaborativeExitAmountSats } from '@/lib/arkade/arkade-exit-utils'
import {
  isCollaborativeExitInsufficientFundsError,
  isSignerRotationCooperativeExitBlocked,
} from '@/lib/arkade/arkade-cooperative-exit'
import type {
  ArkadeUnilateralExitInProgressRow,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import {
  arkadeVtxoOutpointsEqual,
  includesArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'
import { useUnilateralExitAutomationStore } from '@/stores/unilateralExitAutomationStore'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'

function outpointFromInProgressRow(
  row: ArkadeUnilateralExitInProgressRow,
): ArkadeVtxoOutpoint {
  return { txid: row.txid, vout: row.vout }
}

export function useArkadeExitFlow() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const activeArkadeConnectionId = useWalletStore(
    (walletState) => walletState.activeArkadeConnectionId,
  )
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const signerMigrationHint = useWalletStore((walletState) => walletState.arkadeSignerMigrationHint)
  const balanceQuery = useArkadeBalanceQuery()

  const [collaborativeOpen, setCollaborativeOpen] = useState(false)
  const [completeUnilateralOpen, setCompleteUnilateralOpen] = useState(false)

  const [collabDestination, setCollabDestination] = useState('')
  const [collabAmountSats, setCollabAmountSats] = useState('')

  const [selectedInProgressOutpoints, setSelectedInProgressOutpoints] = useState<
    ArkadeVtxoOutpoint[]
  >([])
  const [completeDestination, setCompleteDestination] = useState('')

  const completionFeeSelection = useOnchainFeeRateSelection(networkMode)
  const {
    effectiveFeeRate: completionFeeRateSatPerVb,
    resetFeeSelection: resetCompletionFeeSelection,
    ...completionFeeRateUi
  } = completionFeeSelection

  const collabAmountParse = parseCollaborativeExitAmountSats(collabAmountSats)
  const collabAmountValid = collabAmountParse.ok
  const collabAmount = collabAmountParse.ok ? collabAmountParse.amountSats : undefined
  const collabAmountError = collabAmountParse.ok ? null : collabAmountParse.message

  const unilateralExitInProgressSats = balanceQuery.data?.unilateralExitInProgressSats ?? 0
  const inProgressQuery = useArkadeUnilateralExitsInProgressQuery(
    completeUnilateralOpen || unilateralExitInProgressSats > 0,
  )
  const bumperInfoQuery = useArkadeBumperInfoQuery(completeUnilateralOpen)
  const collaborativeFeeQuery = useArkadeCollaborativeExitFeeQuery({
    enabled: collaborativeOpen,
    destinationAddress: collabDestination,
    amountSats: collabAmount,
  })
  const completionFeeQuery = useArkadeUnilateralExitCompletionFeeQuery({
    enabled: completeUnilateralOpen,
    vtxoOutpoints: selectedInProgressOutpoints,
    destinationAddress: completeDestination,
    feeRateSatPerVb: completionFeeRateSatPerVb,
  })
  const collaborativeExitMutation = useArkadeCollaborativeExitMutation()
  const completeExitMutation = useArkadeCompleteUnilateralExitMutation()

  const selectedInProgressRows = useMemo(
    () =>
      selectedInProgressOutpoints
        .map((outpoint) =>
          inProgressQuery.data?.find((row) =>
            arkadeVtxoOutpointsEqual(outpointFromInProgressRow(row), outpoint),
          ),
        )
        .filter((row): row is ArkadeUnilateralExitInProgressRow => row != null),
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
    if (collaborativeOpen && currentAddress) {
      setCollabDestination(currentAddress)
    }
  }, [collaborativeOpen, currentAddress])

  useEffect(() => {
    if (!completeUnilateralOpen) {
      setSelectedInProgressOutpoints([])
      setCompleteDestination('')
      resetCompletionFeeSelection()
      return
    }
    if (currentAddress) {
      setCompleteDestination(currentAddress)
    }
  }, [completeUnilateralOpen, currentAddress, resetCompletionFeeSelection])

  const collaborativeExitBlockedByRotation =
    isSignerRotationCooperativeExitBlocked(signerMigrationHint)
  const collaborativeFeeEstimate = collaborativeFeeQuery.data
  const collaborativeExitBlockedByFunds =
    collaborativeFeeEstimate != null &&
    isCollaborativeExitInsufficientFundsError(collaborativeFeeEstimate)

  const canCollaborativeExit =
    collabDestination.trim().length > 0 &&
    collabAmountValid &&
    !collaborativeExitMutation.isPending &&
    !collaborativeExitBlockedByRotation &&
    !collaborativeExitBlockedByFunds

  const hasUnilateralExitInProgress =
    unilateralExitInProgressSats > 0 || (inProgressQuery.data?.length ?? 0) > 0

  const handleCollaborativeExit = () => {
    if (!canCollaborativeExit) return
    collaborativeExitMutation.mutate(
      {
        destinationAddress: collabDestination.trim(),
        amountSats: collabAmount,
      },
      {
        onSuccess: () => setCollaborativeOpen(false),
      },
    )
  }

  const toggleInProgressSelection = (row: ArkadeUnilateralExitInProgressRow) => {
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
        setCompleteUnilateralOpen(false)
        if (activeWalletId != null && activeArkadeConnectionId != null) {
          useUnilateralExitAutomationStore
            .getState()
            .completeJob(activeWalletId, networkMode, activeArkadeConnectionId)
          useUnilateralExitControlStore.getState().reset()
        }
      })
      .catch(() => {
        // Toast is handled by useArkadeCompleteUnilateralExitMutation.
      })
  }

  return {
    networkMode,
    currentAddress,
    signerMigrationHint,
    balanceQuery,
    collaborativeOpen,
    setCollaborativeOpen,
    completeUnilateralOpen,
    setCompleteUnilateralOpen,
    collabDestination,
    setCollabDestination,
    collabAmountSats,
    setCollabAmountSats,
    collabAmount,
    collabAmountError,
    selectedInProgressOutpoints,
    selectedInProgressRows,
    selectedInProgressTotalSats,
    allSelectedCanComplete,
    completeDestination,
    setCompleteDestination,
    inProgressQuery,
    bumperInfoQuery,
    collaborativeFeeQuery,
    completionFeeQuery,
    completionFeeRateUi,
    completionFeeRateSatPerVb,
    collaborativeExitMutation,
    completeExitMutation,
    canCollaborativeExit,
    collaborativeExitBlockedByRotation,
    collaborativeExitBlockedByFunds,
    unilateralExitInProgressSats,
    hasUnilateralExitInProgress,
    handleCollaborativeExit,
    handleCompleteExit,
    toggleInProgressSelection,
    selectAllReadyInProgress,
  }
}
