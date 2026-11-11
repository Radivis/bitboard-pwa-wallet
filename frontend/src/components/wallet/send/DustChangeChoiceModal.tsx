import { DialogDescription } from '@/components/ui/dialog'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import { ArticleLink } from '@/lib/library/article-shared'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'

interface DustChangeChoiceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Payment to recipient if kept exact (after any minimum-dust clamp). */
  exactAmountSats: number
  /** Larger payment if user chooses change-free maximum. */
  changeFreeMaxSats: number
  onKeepExact: () => void
  onIncreaseToChangeFree: () => void
  isPending?: boolean
}

/**
 * Case-2 dust: sub-dust remainder would otherwise add to the miner fee with no change output.
 * User chooses exact payment vs increasing to the change-free maximum.
 */
export function DustChangeChoiceModal({
  open,
  onOpenChange,
  exactAmountSats,
  changeFreeMaxSats,
  onKeepExact,
  onIncreaseToChangeFree,
  isPending = false,
}: DustChangeChoiceModalProps) {
  return (
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Change and fees"
      onCancel={() => onOpenChange(false)}
      footer={(requestClose) => (
        <>
          <DesignButton
            type="button"
            appearance="secondary"
            onClick={requestClose}
            disabled={isPending}
          >
            Cancel
          </DesignButton>
          <DesignButton
            type="button"
            appearance="tertiary"
            onClick={onKeepExact}
            disabled={isPending}
          >
            Keep exact amount
          </DesignButton>
          <DesignButton
            type="button"
            onClick={onIncreaseToChangeFree}
            disabled={isPending}
          >
            Increase to change-free max
          </DesignButton>
        </>
      )}
    >
      <DialogDescription asChild>
        <div className="design-type-regular space-y-3 text-left text-muted-foreground">
          <p>
            With your inputs and fee rate, sending exactly{' '}
            <span className="design-type-emphasis text-foreground">
              <BitcoinAmountDisplay amountSats={exactAmountSats} size="sm" />
            </span>{' '}
            would leave no viable change output due to the dust limit. The value that cannot be a valid change output
            would add to the miner fee instead of coming back to you.
          </p>
          <p>
            You can keep that exact payment to the recipient, or increase the payment to{' '}
            <span className="design-type-emphasis text-foreground">
              <BitcoinAmountDisplay amountSats={changeFreeMaxSats} size="sm" />
            </span>{' '}
            so more value goes to the recipient rather than to the fee.
          </p>
          <p>
            <ArticleLink slug="dust-transactions">Dust Transactions</ArticleLink> (Library) explains
            dust limits and why this situation comes up.
          </p>
        </div>
      </DialogDescription>
    </DesignModal>
  )
}
