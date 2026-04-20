import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'

interface MigrationFailureReportModalProps {
  isOpen: boolean
  reportText: string
  onOpenChange: (open: boolean) => void
}

/**
 * Shown when wallet DB health fails and a migration failure JSON file exists in OPFS.
 */
export function MigrationFailureReportModal({
  isOpen,
  reportText,
  onOpenChange,
}: MigrationFailureReportModalProps) {
  const navigate = useNavigate()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText)
      toast.success('Copied to clipboard.')
    } catch {
      toast.error('Could not copy. Select the text manually.')
    }
  }

  const handleGoToSettings = () => {
    onOpenChange(false)
    void navigate({
      to: '/settings/security',
      search: { section: 'data-backups' },
    })
  }

  return (
    <AppModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Wallet upgrade failed"
      onCancel={() => onOpenChange(false)}
      contentClassName="sm:max-w-2xl"
      footer={() => (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <Button type="button" variant="outline" onClick={handleCopy}>
            Copy report
          </Button>
          <Button type="button" onClick={handleGoToSettings}>
            Go to Settings
          </Button>
        </div>
      )}
    >
      <div className="flex max-h-[min(50vh,420px)] flex-col gap-3 overflow-hidden">
        <p className="text-sm text-muted-foreground">
          A diagnostic file was saved on this device. You can copy the report below or export the
          same file from Settings → Data Backups.
        </p>
        <pre
          className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground"
          tabIndex={0}
        >
          {reportText}
        </pre>
      </div>
    </AppModal>
  )
}
