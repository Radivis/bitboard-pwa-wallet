import { useEffect, useState } from 'react'
import {
  useArkadeBalanceQuery,
  useArkadeCollaborativeExitFeeQuery,
  useArkadeCollaborativeExitMutation,
  useArkadeUnilateralExitsInProgressQuery,
  useHasPendingBatchIntent,
  useHasPendingBatchIntentKind,
  usePendingBatchIntents,
} from '@/hooks/useArkadeQueries'
import { parseCollaborativeExitAmountSats } from '@/lib/arkade/arkade-exit-utils'
import {
  ARKADE_INTENT_LIFECYCLE_PHASES,
  isIntentSubmitPhase,
  pendingIntentBannerPhase,
} from '@/lib/arkade/arkade-pending-batch-intent'
import {
  isCollaborativeExitInsufficientFundsError,
  isSignerRotationCooperativeExitBlocked,
} from '@/lib/arkade/arkade-cooperative-exit'
import { useWalletStore } from '@/stores/walletStore'

export function useArkadeExitFlow() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const signerMigrationHint = useWalletStore((walletState) => walletState.arkadeSignerMigrationHint)
  const balanceQuery = useArkadeBalanceQuery()

  const [collaborativeOpen, setCollaborativeOpen] = useState(false)

  const [collabDestination, setCollabDestination] = useState('')
  const [collabAmountSats, setCollabAmountSats] = useState('')

  const collabAmountParse = parseCollaborativeExitAmountSats(collabAmountSats)
  const collabAmountValid = collabAmountParse.ok
  const collabAmount = collabAmountParse.ok ? collabAmountParse.amountSats : undefined
  const collabAmountError = collabAmountParse.ok ? null : collabAmountParse.message

  const unilateralExitInProgressSats = balanceQuery.data?.unilateralExitInProgressSats ?? 0
  const inProgressQuery = useArkadeUnilateralExitsInProgressQuery(unilateralExitInProgressSats > 0)
  const collaborativeFeeQuery = useArkadeCollaborativeExitFeeQuery({
    enabled: collaborativeOpen,
    destinationAddress: collabDestination,
    amountSats: collabAmount,
  })
  const collaborativeExitMutation = useArkadeCollaborativeExitMutation()
  const pendingBatchIntents = usePendingBatchIntents()
  const hasPendingBatchIntent = useHasPendingBatchIntent()
  const hasPendingCollaborativeExit = useHasPendingBatchIntentKind('collaborative_exit')
  const hasProcessingCollaborativeExit = pendingBatchIntents.some(
    (intent) =>
      intent.kind === 'collaborative_exit' &&
      pendingIntentBannerPhase(intent) === ARKADE_INTENT_LIFECYCLE_PHASES.processing,
  )
  const collaborativeExitSubmitPhase = isIntentSubmitPhase({
    mutationPending: collaborativeExitMutation.isPending,
    pendingForAction: hasPendingCollaborativeExit,
  })

  useEffect(() => {
    if (collaborativeOpen && currentAddress) {
      setCollabDestination(currentAddress)
    }
  }, [collaborativeOpen, currentAddress])

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
    !collaborativeExitBlockedByFunds &&
    !hasPendingBatchIntent

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

  return {
    networkMode,
    currentAddress,
    signerMigrationHint,
    balanceQuery,
    collaborativeOpen,
    setCollaborativeOpen,
    collabDestination,
    setCollabDestination,
    collabAmountSats,
    setCollabAmountSats,
    collabAmount,
    collabAmountError,
    inProgressQuery,
    collaborativeFeeQuery,
    collaborativeExitMutation,
    collaborativeExitSubmitPhase,
    hasProcessingCollaborativeExit,
    canCollaborativeExit,
    collaborativeExitBlockedByRotation,
    collaborativeExitBlockedByFunds,
    unilateralExitInProgressSats,
    hasUnilateralExitInProgress,
    handleCollaborativeExit,
  }
}
