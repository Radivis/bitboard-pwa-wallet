import { useState } from 'react'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import { toast } from 'sonner'

interface CopyableVtxoIdListProps {
  vtxoIds: string[]
}

export function CopyableVtxoIdList({ vtxoIds }: CopyableVtxoIdListProps) {
  if (vtxoIds.length === 0) {
    return null
  }

  return (
    <ul className="list-none space-y-1 pl-0" data-testid="unilateral-exit-aborted-vtxo-ids">
      {vtxoIds.map((id) => (
        <CopyableVtxoIdRow key={id} vtxoId={id} />
      ))}
    </ul>
  )
}

function CopyableVtxoIdRow({ vtxoId }: { vtxoId: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(vtxoId)
    setCopied(true)
    toast.success('VTXO id copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <li className="flex items-center gap-2">
      <span className="text-muted-foreground" aria-hidden>*</span>
      <button
        type="button"
        className="font-mono text-left text-xs text-primary underline-offset-4 hover:underline"
        onClick={() => void handleCopy()}
        aria-label={`Copy VTXO id ${vtxoId}`}
        data-testid={`copy-vtxo-id-${vtxoId}`}
      >
        {copied ? 'Copied' : truncateAddress(vtxoId, 8, 8)}
      </button>
    </li>
  )
}
