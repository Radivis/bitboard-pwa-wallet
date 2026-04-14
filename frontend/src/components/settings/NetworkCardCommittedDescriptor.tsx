import { useCallback } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { useCommittedExternalDescriptor } from '@/hooks/useCommittedExternalDescriptor'
import { useSessionStore } from '@/stores/sessionStore'
import { CommittedDescriptorInfomodeContent } from '@/components/settings/CommittedDescriptorInfomodeContent'
import { LoadingSpinner } from '@/components/LoadingSpinner'

export function NetworkCardCommittedDescriptor() {
  const sessionPassword = useSessionStore((s) => s.password)
  const query = useCommittedExternalDescriptor()

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Descriptor copied to clipboard')
    } catch {
      toast.error('Failed to copy descriptor')
    }
  }, [])

  return (
    <InfomodeWrapper
        infoId="settings-network-committed-descriptor"
        infoComponent={CommittedDescriptorInfomodeContent}
        className="space-y-2"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <p className="text-sm font-medium leading-none text-foreground">Receiving descriptor</p>
          {sessionPassword && query.data ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 self-start px-2 sm:self-auto"
              onClick={() => handleCopy(query.data ?? '')}
              aria-label="Copy receiving descriptor"
            >
              <Copy className="mr-1 h-4 w-4" aria-hidden />
              Copy
            </Button>
          ) : null}
        </div>

        {!sessionPassword ? (
          <p className="text-sm text-muted-foreground">
            Unlock your wallet to view the receiving descriptor.
          </p>
        ) : query.isPending ? (
          <LoadingSpinner
            text="Loading descriptor…"
            className="flex-row items-center justify-start gap-2 py-1 [&_.animate-spin]:h-4 [&_.animate-spin]:w-4"
          />
        ) : query.isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load the descriptor. Try unlocking again or return after a moment.
          </p>
        ) : query.data === null || query.data === '' ? (
          <p className="text-sm text-muted-foreground">
            No saved descriptor for this network and address type yet.
          </p>
        ) : (
          <p className="break-all font-mono text-xs leading-relaxed text-muted-foreground">
            {query.data}
          </p>
        )}
      </InfomodeWrapper>
  )
}
