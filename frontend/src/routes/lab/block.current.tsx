import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Hammer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import {
  LabBlockHeaderCard,
  LabBlockMetadataCard,
  LabBlockTransactionsCard,
} from '@/components/lab/BlockDetailsCards'
import { useWallets } from '@/db'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'
import { selectCommittedAddressType, useWalletStore } from '@/stores/walletStore'
import { LabOwnerType } from '@/lib/lab-owner-type'
import { labOpGetCurrentBlockTemplate } from '@/lib/lab-worker-operations'
import type { LabBlockDetails } from '@/workers/lab-api'

export const Route = createFileRoute('/lab/block/current')({
  component: LabCurrentBlockPage,
})

function LabCurrentBlockPage() {
  const [block, setBlock] = useState<LabBlockDetails | null | undefined>(undefined)
  const { data: wallets = [] } = useWallets()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const labAddressType = useWalletStore(selectCommittedAddressType)
  const lab = useLabIndexPageData()

  const loadCurrentBlockTemplate = useCallback(async () => {
    try {
      const details = await labOpGetCurrentBlockTemplate({
        ownerType: lab.ownerType,
        targetAddress: '',
        ownerLabEntityId:
          lab.ownerType === LabOwnerType.LabEntity
            ? lab.selectedLabEntityId ?? undefined
            : undefined,
        ownerWalletId: activeWalletId ?? undefined,
        walletCurrentAddress: currentAddress,
        labAddressType,
      })
      setBlock(details)
    } catch {
      setBlock(null)
    }
  }, [
    lab.ownerType,
    lab.selectedLabEntityId,
    activeWalletId,
    currentAddress,
    labAddressType,
  ])

  useEffect(() => {
    void loadCurrentBlockTemplate()
  }, [loadCurrentBlockTemplate])

  if (block === undefined) {
    return <p className="text-muted-foreground">Loading current block template...</p>
  }

  if (block === null) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Could not build current block template.</p>
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
        <PageHeader title="Current block template" icon={Hammer} />
      </div>

      <LabBlockHeaderCard block={block} />
      <LabBlockMetadataCard block={block} wallets={wallets} />
      <LabBlockTransactionsCard block={block} wallets={wallets} />
    </div>
  )
}
