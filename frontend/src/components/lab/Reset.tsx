import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
      <Card>
        <CardHeader>
          <CardTitle>Drastic Measures</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={onResetClick} disabled={resetting}>
            {resetting ? 'Resetting...' : 'Reset lab'}
          </Button>
        </CardContent>
      </Card>
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
