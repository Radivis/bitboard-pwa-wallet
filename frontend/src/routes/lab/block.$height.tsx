import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Blocks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import {
  LabBlockHeaderCard,
  LabBlockMetadataCard,
  LabBlockTransactionsCard,
} from '@/components/lab/BlockDetailsCards'
import { useWallets } from '@/db'
import { labOpGetBlockByHeight } from '@/lib/lab-worker-operations'
import type { LabBlockDetails } from '@/workers/lab-api'

export const Route = createFileRoute('/lab/block/$height')({
  component: LabBlockByHeightPage,
})

function LabBlockByHeightPage() {
  const { height } = Route.useParams()
  const parsedHeight = Number.parseInt(height, 10)
  const [block, setBlock] = useState<LabBlockDetails | null | undefined>(undefined)
  const { data: wallets = [] } = useWallets()

  const loadBlock = useCallback(async () => {
    if (!Number.isInteger(parsedHeight) || parsedHeight < 0) {
      setBlock(null)
      return
    }
    try {
      const details = await labOpGetBlockByHeight(parsedHeight)
      setBlock(details ?? null)
    } catch {
      setBlock(null)
    }
  }, [parsedHeight])

  useEffect(() => {
    void loadBlock()
  }, [loadBlock])

  if (block === undefined) {
    return <p className="text-muted-foreground">Loading block...</p>
  }

  if (block === null) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Block not found.</p>
        <Link to="/lab/blocks" preload={false}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to blocks
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/lab/blocks" preload={false}>
          <Button variant="ghost" size="icon" aria-label="Back to blocks">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader title={`Block ${block.metadata.height}`} icon={Blocks} />
      </div>

      <LabBlockHeaderCard block={block} />
      <LabBlockMetadataCard block={block} wallets={wallets} />
      <LabBlockTransactionsCard block={block} wallets={wallets} />
    </div>
  )
}
