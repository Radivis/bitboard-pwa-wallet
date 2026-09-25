import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useArkadeBalanceQuery,
  useArkadeCollaborativeExitFeeQuery,
  useArkadeCollaborativeExitMutation,
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

export function useCollaborativeExitFlow() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const signerMigrationHint = useWalletStore((walletState) => walletState.arkadeSignerMigrationHint)
  const balanceQuery = useArkadeBalanceQuery()

  const [collabDestination, setCollabDestination] = useState('')
  const [collabAmountSats, setCollabAmountSats] = useState('')

  const collabAmountParse = parseCollaborativeExitAmountSats(collabAmountSats)
  const collabAmountValid = collabAmountParse.ok
  const collabAmount = collabAmountParse.ok ? collabAmountParse.amountSats : undefined
  const collabAmountError = collabAmountParse.ok ? null : collabAmountParse.message

  const collaborativeFeeQuery = useArkadeCollaborativeExitFeeQuery({
    enabled: true,
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
    if (currentAddress) {
      setCollabDestination(currentAddress)
    }
  }, [currentAddress])

  useEffect(() => {
    if (hasProcessingCollaborativeExit) {
      void navigate({ to: '/wallet/management' })
    }
  }, [hasProcessingCollaborativeExit, navigate])

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

  const handleCollaborativeExit = () => {
    if (!canCollaborativeExit) return
    collaborativeExitMutation.mutate(
      {
        destinationAddress: collabDestination.trim(),
        amountSats: collabAmount,
      },
      {
        onSuccess: () => {
          void navigate({ to: '/wallet/management' })
        },
      },
    )
  }

  return {
    networkMode,
    currentAddress,
    balanceQuery,
    collabDestination,
    setCollabDestination,
    collabAmountSats,
    setCollabAmountSats,
    collabAmount,
    collabAmountError,
    collaborativeFeeQuery,
    collaborativeExitMutation,
    collaborativeExitSubmitPhase,
    hasProcessingCollaborativeExit,
    canCollaborativeExit,
    collaborativeExitBlockedByRotation,
    collaborativeExitBlockedByFunds,
    handleCollaborativeExit,
  }
}
