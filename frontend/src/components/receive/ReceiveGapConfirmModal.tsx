import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'
import {
  HARD_GAP_CONFIRM_TITLE,
  HARD_GAP_GENERATE_LABEL,
  HARD_GAP_OPT_IN_LABEL,
  SOFT_GAP_CONFIRM_TITLE,
  SOFT_GAP_GENERATE_LABEL,
  SOFT_GAP_KEEP_LABEL,
  hardGapConfirmBody,
  softGapConfirmBody,
  type ReceiveGapConfirmKind,
} from '@/lib/wallet/receive-gap-surface'

interface ReceiveGapConfirmModalProps {
  open: boolean
  mode: Exclude<ReceiveGapConfirmKind, 'none'>
  gap: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
}

export function ReceiveGapConfirmModal({
  open,
  mode,
  gap,
  onOpenChange,
  onConfirm,
}: ReceiveGapConfirmModalProps) {
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const isHardWarning = mode === 'hard'

  useEffect(() => {
    if (open) {
      setAcknowledgedRisk(false)
      setConfirmPending(false)
    }
  }, [open, mode])

  return (
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title={isHardWarning ? HARD_GAP_CONFIRM_TITLE : SOFT_GAP_CONFIRM_TITLE}
      optIn={
        isHardWarning
          ? {
              id: 'receive-gap-hard-ack',
              label: HARD_GAP_OPT_IN_LABEL,
              checked: acknowledgedRisk,
              onChange: setAcknowledgedRisk,
              disabled: confirmPending,
              testId: 'receive-gap-hard-ack',
            }
          : undefined
      }
      footer={() => (
        <>
          <DesignButton
            type="button"
            appearance="secondary"
            disabled={confirmPending}
            onClick={() => onOpenChange(false)}
          >
            {SOFT_GAP_KEEP_LABEL}
          </DesignButton>
          <DesignButton
            type="button"
            disabled={confirmPending || (isHardWarning && !acknowledgedRisk)}
            data-testid={isHardWarning ? 'receive-gap-hard-confirm' : 'receive-gap-soft-confirm'}
            onClick={() => {
              setConfirmPending(true)
              Promise.resolve(onConfirm()).finally(() => setConfirmPending(false))
            }}
          >
            {isHardWarning ? HARD_GAP_GENERATE_LABEL : SOFT_GAP_GENERATE_LABEL}
          </DesignButton>
        </>
      )}
    >
      <div className="design-type-regular space-y-3 text-muted-foreground">
        <DialogDescription className="sr-only">
          {isHardWarning
            ? 'Confirm that you understand a normal wallet may not find funds sent to the next address.'
            : 'Confirm generating another address while the current one has not been paid.'}
        </DialogDescription>
        <p>{isHardWarning ? hardGapConfirmBody() : softGapConfirmBody(gap)}</p>
      </div>
    </DesignModal>
  )
}
