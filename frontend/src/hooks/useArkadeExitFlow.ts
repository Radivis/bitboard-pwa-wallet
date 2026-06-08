import { useEffect, useState } from 'react'
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeCollaborativeExitFeeQuery,
  useArkadeCollaborativeExitMutation,
  useArkadeCompleteUnilateralExitMutation,
  useArkadeExitCandidatesQuery,
  useArkadeUnilateralExitFeeQuery,
  useArkadeUnilateralUnrollMutation,
} from '@/hooks/useArkadeQueries'
import {
  ARKADE_BUMPER_LOW_BALANCE_FALLBACK_SATS,
  parseCollaborativeExitAmountSats,
} from '@/lib/arkade/arkade-exit-utils'
import type { ArkadeExitCandidateRow, ArkadeUnrollProgressEvent } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

export type UnilateralExitStep = 'select' | 'unroll' | 'complete'

export function useArkadeExitFlow() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const balanceQuery = useArkadeBalanceQuery()

  const [collaborativeOpen, setCollaborativeOpen] = useState(false)
  const [unilateralOpen, setUnilateralOpen] = useState(false)

  const [collabDestination, setCollabDestination] = useState('')
  const [collabAmountSats, setCollabAmountSats] = useState('')

  const [unilateralStep, setUnilateralStep] = useState<UnilateralExitStep>('select')
  const [selectedCandidate, setSelectedCandidate] = useState<ArkadeExitCandidateRow | null>(
    null,
  )
  const [unrollProgress, setUnrollProgress] = useState<ArkadeUnrollProgressEvent[]>([])
  const [unrolledVtxoTxid, setUnrolledVtxoTxid] = useState<string | null>(null)
  const [completeDestination, setCompleteDestination] = useState('')

  const collabAmountParse = parseCollaborativeExitAmountSats(collabAmountSats)
  const collabAmountValid = collabAmountParse.ok
  const collabAmount = collabAmountParse.ok ? collabAmountParse.amountSats : undefined
  const collabAmountError = collabAmountParse.ok ? null : collabAmountParse.message

  const exitCandidatesQuery = useArkadeExitCandidatesQuery(unilateralOpen)
  const bumperInfoQuery = useArkadeBumperInfoQuery(unilateralOpen)
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
  const collaborativeExitMutation = useArkadeCollaborativeExitMutation()
  const unrollMutation = useArkadeUnilateralUnrollMutation()
  const completeExitMutation = useArkadeCompleteUnilateralExitMutation()

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
      setUnrolledVtxoTxid(null)
      setCompleteDestination('')
      return
    }
    if (currentAddress) {
      setCompleteDestination(currentAddress)
    }
  }, [unilateralOpen, currentAddress])

  const canCollaborativeExit =
    collabDestination.trim().length > 0 &&
    collabAmountValid &&
    !collaborativeExitMutation.isPending

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
    unrollMutation.mutate(
      {
        txid: selectedCandidate.txid,
        vout: selectedCandidate.vout,
        onProgress: (event) => {
          setUnrollProgress((previous) => [...previous, event])
          if (event.type === 'done' && event.vtxoTxid) {
            setUnrolledVtxoTxid(event.vtxoTxid)
          }
        },
      },
      {
        onSuccess: (result) => {
          setUnrolledVtxoTxid(result.vtxoTxid)
          setUnilateralStep('complete')
        },
      },
    )
  }

  const handleCompleteExit = () => {
    const vtxoTxid = unrolledVtxoTxid ?? selectedCandidate?.txid
    if (vtxoTxid == null || completeDestination.trim().length === 0) return
    completeExitMutation.mutate(
      {
        vtxoTxids: [vtxoTxid],
        destinationAddress: completeDestination.trim(),
      },
      {
        onSuccess: () => setUnilateralOpen(false),
      },
    )
  }

  const skipToComplete = () => {
    if (selectedCandidate == null) return
    setUnrolledVtxoTxid(selectedCandidate.txid)
    setUnilateralStep('complete')
  }

  const selectCandidate = (row: ArkadeExitCandidateRow) => {
    setSelectedCandidate(row)
    if (row.canComplete) {
      setUnrolledVtxoTxid(row.txid)
    }
  }

  return {
    networkMode,
    currentAddress,
    balanceQuery,
    collaborativeOpen,
    setCollaborativeOpen,
    unilateralOpen,
    setUnilateralOpen,
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
    unrolledVtxoTxid,
    completeDestination,
    setCompleteDestination,
    exitCandidatesQuery,
    bumperInfoQuery,
    collaborativeFeeQuery,
    unilateralFeeQuery,
    collaborativeExitMutation,
    unrollMutation,
    completeExitMutation,
    canCollaborativeExit,
    bumperBalance,
    unilateralFeeEstimate,
    bumperLow,
    handleCollaborativeExit,
    handleStartUnroll,
    handleCompleteExit,
    skipToComplete,
    selectCandidate,
  }
}
