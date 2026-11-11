import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { blockchainExplorerTransactionUrl } from '@/lib/arkade/arkade-exit-utils'
import type { NetworkMode } from '@/stores/walletStore'

interface CompletedUnilateralExitNoticeProps {
  txid: string
  networkMode: NetworkMode | null | undefined
  onDismiss: () => void
}

export function CompletedUnilateralExitNotice({
  txid,
  networkMode,
  onDismiss,
}: CompletedUnilateralExitNoticeProps) {
  const explorerUrl = blockchainExplorerTransactionUrl(networkMode, txid)

  return (
    <div
      className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"
      data-testid="arkade-complete-exit-txid"
    >
      <p>Unilateral exit completed. Sweep transaction:</p>
      <p className="break-all font-mono text-xs">{txid}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(txid).then(
              () => toast.success('Sweep transaction id copied'),
              () => toast.error('Failed to copy sweep transaction id'),
            )
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          Copy txid
        </Button>
        {explorerUrl != null && (
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden />
              View transaction
            </a>
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
