import { useEffect, useMemo, useState } from 'react'
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeCollaborativeExitFeeQuery,
  useArkadeCollaborativeExitMutation,
  useArkadeCompleteUnilateralExitMutation,
  useArkadeExitCandidatesQuery,
  useArkadeUnilateralExitCompletionFeeQuery,
  useArkadeUnilateralExitFeeQuery,
  useArkadeUnilateralExitsInProgressQuery,
  useArkadeUnilateralUnrollMutation,
} from '@/hooks/useArkadeQueries'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import {
  ARKADE_BUMPER_LOW_BALANCE_FALLBACK_SATS,
  parseCollaborativeExitAmountSats,
} from '@/lib/arkade/arkade-exit-utils'
import {
  isCollaborativeExitInsufficientFundsError,
  isSignerRotationCooperativeExitBlocked,
} from '@/lib/arkade/arkade-cooperative-exit'
import type {
  ArkadeExitCandidateRow,
  ArkadeUnilateralExitInProgressRow,
  ArkadeUnrollProgressEvent,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import {
  arkadeVtxoOutpointsEqual,
  includesArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

export type UnilateralExitStep = 'select' | 'unroll'

function outpointFromInProgressRow(
  row: ArkadeUnilateralExitInProgressRow,
): ArkadeVtxoOutpoint {
  return { txid: row.txid, vout: row.vout }
}

export function useArkadeExitFlow() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const signerMigrationHint = useWalletStore((walletState) => walletState.arkadeSignerMigrationHint)
  const balanceQuery = useArkadeBalanceQuery()

  const [collaborativeOpen, setCollaborativeOpen] = useState(false)
  const [unilateralOpen, setUnilateralOpen] = useState(false)
  const [completeUnilateralOpen, setCompleteUnilateralOpen] = useState(false)

  const [collabDestination, setCollabDestination] = useState('')
  const [collabAmountSats, setCollabAmountSats] = useState('')

  const [unilateralStep, setUnilateralStep] = useState<UnilateralExitStep>('select')
  const [selectedCandidate, setSelectedCandidate] = useState<ArkadeExitCandidateRow | null>(
    null,
  )
  const [unrollProgress, setUnrollProgress] = useState<ArkadeUnrollProgressEvent[]>([])
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

  const exitCandidatesQuery = useArkadeExitCandidatesQuery(unilateralOpen)
  const inProgressQuery = useArkadeUnilateralExitsInProgressQuery(
    completeUnilateralOpen || (balanceQuery.data?.unilateralExitInProgressSats ?? 0) > 0,
  )
  const bumperInfoQuery = useArkadeBumperInfoQuery(unilateralOpen || completeUnilateralOpen)
  const collaborativeFeeQuery = useArkadeCollaborativeExitFeeQuery({
    enabled: collaborativeOpen,
    destinationAddress: collabDestination,
    amountSats: collabAmount,
  })
  const unilateralFeeQuery = useArkadeUnilateralExitFeeQuery({
    enabled: unilateralOpen && unilateralStep === 'select',
    txid: selectedCandidate?.txid,
    vout: selectedCandidate?.vout,
  })
  const completionFeeQuery = useArkadeUnilateralExitCompletionFeeQuery({
    enabled: completeUnilateralOpen,
    vtxoOutpoints: selectedInProgressOutpoints,
    destinationAddress: completeDestination,
    feeRateSatPerVb: completionFeeRateSatPerVb,
  })
  const collaborativeExitMutation = useArkadeCollaborativeExitMutation()
  const unrollMutation = useArkadeUnilateralUnrollMutation()
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
    if (!unilateralOpen) {
      setUnilateralStep('select')
      setSelectedCandidate(null)
      setUnrollProgress([])
      return
    }
  }, [unilateralOpen])

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

  const bumperBalance =
    unilateralFeeQuery.data?.bumperBalanceSats ?? bumperInfoQuery.data?.balanceSats ?? 0
  const unilateralFeeEstimate = unilateralFeeQuery.data
  const bumperLowFromEstimate =
    unilateralFeeEstimate != null && !unilateralFeeEstimate.bumperSufficient
  const bumperLow =
    bumperLowFromEstimate ||
    (unilateralFeeEstimate == null &&
      bumperInfoQuery.isSuccess &&
      bumperBalance < ARKADE_BUMPER_LOW_BALANCE_FALLBACK_SATS)

  const unilateralExitInProgressSats = balanceQuery.data?.unilateralExitInProgressSats ?? 0

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

  const handleStartUnroll = () => {
    if (selectedCandidate == null) return
    setUnilateralStep('unroll')
    setUnrollProgress([])
    void unrollMutation
      .mutateAsync({
        txid: selectedCandidate.txid,
        vout: selectedCandidate.vout,
        amountSats: selectedCandidate.amountSats,
        onProgress: (event) => {
          setUnrollProgress((previous) => [...previous, event])
        },
      })
      .then(() => {
        setUnilateralOpen(false)
      })
      .catch(() => {
        // Toast and optimistic revert are handled by useArkadeUnilateralUnrollMutation.
      })
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
      })
      .catch(() => {
        // Toast is handled by useArkadeCompleteUnilateralExitMutation.
      })
  }

  const selectCandidate = (row: ArkadeExitCandidateRow) => {
    setSelectedCandidate(row)
  }

  return {
    networkMode,
    currentAddress,
    signerMigrationHint,
    balanceQuery,
    collaborativeOpen,
    setCollaborativeOpen,
    unilateralOpen,
    setUnilateralOpen,
    completeUnilateralOpen,
    setCompleteUnilateralOpen,
    collabDestination,
    setCollabDestination,
    collabAmountSats,
    setCollabAmountSats,
    collabAmount,
    collabAmountError,
    unilateralStep,
    setUnilateralStep,
    selectedCandidate,
    unrollProgress,
    selectedInProgressOutpoints,
    selectedInProgressRows,
    selectedInProgressTotalSats,
    allSelectedCanComplete,
    completeDestination,
    setCompleteDestination,
    exitCandidatesQuery,
    inProgressQuery,
    bumperInfoQuery,
    collaborativeFeeQuery,
    unilateralFeeQuery,
    completionFeeQuery,
    completionFeeRateUi,
    completionFeeRateSatPerVb,
    collaborativeExitMutation,
    unrollMutation,
    completeExitMutation,
    canCollaborativeExit,
    collaborativeExitBlockedByRotation,
    collaborativeExitBlockedByFunds,
    bumperBalance,
    unilateralFeeEstimate,
    bumperLow,
    unilateralExitInProgressSats,
    handleCollaborativeExit,
    handleStartUnroll,
    handleCompleteExit,
    toggleInProgressSelection,
    selectAllReadyInProgress,
    selectCandidate,
  }
}
