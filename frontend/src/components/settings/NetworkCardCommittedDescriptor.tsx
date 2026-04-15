import { useCallback, useEffect, useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
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
  const [descriptorVisible, setDescriptorVisible] = useState(false)

  useEffect(() => {
    setDescriptorVisible(false)
  }, [query.data])

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm font-medium leading-none text-foreground">Receiving descriptor</p>
          {sessionPassword && query.data ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => setDescriptorVisible((v) => !v)}
              aria-label={
                descriptorVisible ? 'Hide receiving descriptor' : 'Show receiving descriptor'
              }
              aria-pressed={descriptorVisible}
            >
              {descriptorVisible ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>
        {sessionPassword && query.data && descriptorVisible ? (
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
        ) : descriptorVisible ? (
          <p className="break-all font-mono text-xs leading-relaxed text-muted-foreground">
            {query.data}
          </p>
        ) : (
          <p className="select-none font-mono text-xs leading-relaxed text-muted-foreground/80">
            <span aria-hidden>{'•'.repeat(48)}</span>
            <span className="sr-only">
              Receiving descriptor hidden. Use the show button next to the label to reveal it.
            </span>
          </p>
        )}
    </InfomodeWrapper>
  )
}
