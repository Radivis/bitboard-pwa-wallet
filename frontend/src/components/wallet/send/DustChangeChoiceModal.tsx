import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/AppModal'
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
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Change and fees"
      onCancel={() => onOpenChange(false)}
      footer={(requestClose) => (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onKeepExact}
            disabled={isPending}
          >
            Keep exact amount
          </Button>
          <Button
            type="button"
            onClick={onIncreaseToChangeFree}
            disabled={isPending}
          >
            Increase to change-free max
          </Button>
        </>
      )}
    >
      <DialogDescription asChild>
        <div className="space-y-3 text-left text-sm text-muted-foreground">
          <p>
            With your inputs and fee rate, sending exactly{' '}
            <span className="font-medium text-foreground">
              <BitcoinAmountDisplay amountSats={exactAmountSats} size="sm" />
            </span>{' '}
            would leave no viable change output due to the dust limit. The value that cannot be a valid change output
            would add to the miner fee instead of coming back to you.
          </p>
          <p>
            You can keep that exact payment to the recipient, or increase the payment to{' '}
            <span className="font-medium text-foreground">
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
    </AppModal>
  )
}
