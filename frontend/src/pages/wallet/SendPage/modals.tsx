import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { DustChangeChoiceModal } from '@/components/wallet/send/DustChangeChoiceModal'
import type { PrepareOnchainSendResult } from '@/workers/crypto-api'

type BuildTransactionMutationForDustModal = {
  mutateAsync: (params: {
    normalizedRecipient: string
    amountSats: number
    effectiveFeeRate: number
    applyChangeFreeBump?: boolean
  }) => Promise<PrepareOnchainSendResult>
  isPending: boolean
}

export function SendFlowDustModals(props: {
  dustCase2Modal: null | {
    pendingOutcome: PrepareOnchainSendResult
    changeFreeMaxSats: number
  }
  setDustCase2Modal: Dispatch<
    SetStateAction<
      null | {
        pendingOutcome: PrepareOnchainSendResult
        changeFreeMaxSats: number
      }
    >
  >
  labDustCase2Modal: null | {
    changeFreeMaxSats: number
    exactAmountSats: number
    originalAmountSats: number
  }
  setLabDustCase2Modal: Dispatch<
    SetStateAction<
      null | {
        changeFreeMaxSats: number
        exactAmountSats: number
        originalAmountSats: number
      }
    >
  >
  labChangeFreeBumpBaseAmountSatsRef: MutableRefObject<number | null>
  buildMutation: BuildTransactionMutationForDustModal
  normalizedRecipient: string
  amountSats: number
  effectiveFeeRate: number
  applyOnchainPrepareOutcomeToSendStore: (
    outcome: PrepareOnchainSendResult,
  ) => void
  setStep: (step: 1 | 2) => void
  setLabApplyChangeFreeBump: Dispatch<SetStateAction<boolean>>
  onLabIncreaseToChangeFreeReview: () => Promise<void>
  labReviewPending: boolean
}) {
  const {
    dustCase2Modal,
    setDustCase2Modal,
    labDustCase2Modal,
    setLabDustCase2Modal,
    labChangeFreeBumpBaseAmountSatsRef,
    buildMutation,
    normalizedRecipient,
    amountSats,
    effectiveFeeRate,
    applyOnchainPrepareOutcomeToSendStore,
    setStep,
    setLabApplyChangeFreeBump,
    onLabIncreaseToChangeFreeReview,
    labReviewPending,
  } = props

  return (
    <>
      <DustChangeChoiceModal
        open={dustCase2Modal != null}
        onOpenChange={(o) => {
          if (!o) setDustCase2Modal(null)
        }}
        exactAmountSats={dustCase2Modal?.pendingOutcome.finalAmountSats ?? 0}
        changeFreeMaxSats={dustCase2Modal?.changeFreeMaxSats ?? 0}
        onKeepExact={() => {
          if (!dustCase2Modal) return
          const pending = dustCase2Modal.pendingOutcome
          setDustCase2Modal(null)
          applyOnchainPrepareOutcomeToSendStore(pending)
        }}
        onIncreaseToChangeFree={async () => {
          if (!dustCase2Modal) return
          try {
            const outcome = await buildMutation.mutateAsync({
              normalizedRecipient,
              amountSats,
              effectiveFeeRate,
              applyChangeFreeBump: true,
            })
            setDustCase2Modal(null)
            applyOnchainPrepareOutcomeToSendStore(outcome)
          } catch {
            /* mutation onError */
          }
        }}
        isPending={buildMutation.isPending}
      />
      <DustChangeChoiceModal
        open={labDustCase2Modal != null}
        onOpenChange={(o) => {
          if (!o) {
            setLabDustCase2Modal(null)
            labChangeFreeBumpBaseAmountSatsRef.current = null
          }
        }}
        exactAmountSats={labDustCase2Modal?.exactAmountSats ?? 0}
        changeFreeMaxSats={labDustCase2Modal?.changeFreeMaxSats ?? 0}
        onKeepExact={() => {
          setLabDustCase2Modal(null)
          setLabApplyChangeFreeBump(false)
          labChangeFreeBumpBaseAmountSatsRef.current = null
          setStep(2)
        }}
        onIncreaseToChangeFree={async () => {
          if (!labDustCase2Modal) return
          await onLabIncreaseToChangeFreeReview()
        }}
        isPending={labReviewPending}
      />
    </>
  )
}
