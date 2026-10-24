import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Blocks } from 'lucide-react'
import { DesignButton } from '@/components/design/DesignButton'
import { PageHeader } from '@/components/PageHeader'
import {
  LabBlockHeaderCard,
  LabBlockMetadataCard,
  LabBlockTransactionsCard,
} from '@/components/lab/BlockDetailsCards'
import { useWallets } from '@/db'
import { labOpGetBlockByHeight } from '@/lib/lab/lab-worker-operations'
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
          <DesignButton appearance="secondary" icon={<ArrowLeft aria-hidden />}>
            Back to blocks
          </DesignButton>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/lab/blocks" preload={false}>
          <DesignButton appearance="tertiary" className="h-12 w-12 px-0" aria-label="Back to blocks" icon={<ArrowLeft aria-hidden />} />
        </Link>
        <PageHeader title={`Block ${block.metadata.height}`} icon={Blocks} />
      </div>

      <LabBlockHeaderCard block={block} />
      <LabBlockMetadataCard block={block} wallets={wallets} />
      <LabBlockTransactionsCard block={block} wallets={wallets} />
    </div>
  )
}
