import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'

export function LabResetCard({
  onResetClick,
  resetting,
  onConfirmReset,
  showConfirm,
  onCancelConfirm,
}: {
  onResetClick: () => void
  resetting: boolean
  onConfirmReset: () => void
  showConfirm: boolean
  onCancelConfirm: () => void
}) {
  return (
    <>
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>Drastic Measures</DesignCardTitle>
          <DesignCardDescription>Irreversible actions</DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent>
          <Button variant="destructive" onClick={onResetClick} disabled={resetting}>
            {resetting ? 'Resetting...' : 'Reset lab'}
          </Button>
        </DesignCardContent>
      </DesignCard>
      <ConfirmationDialog
        open={showConfirm}
        title="Reset lab?"
        message="All blocks, transactions, addresses, and mempool entries in the lab will be deleted. This cannot be undone."
        confirmText="Reset lab"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={onConfirmReset}
        onCancel={onCancelConfirm}
      />
    </>
  )
}
