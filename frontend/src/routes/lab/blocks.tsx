import { createFileRoute } from '@tanstack/react-router'
import { Blocks } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabBlocksCard } from '@/components/lab/Blocks'
import { LabMempoolCard } from '@/components/lab/Mempool'
import { LabPreviousBlocksCard } from '@/components/lab/PreviousBlocks'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'

export const Route = createFileRoute('/lab/blocks')({
  component: LabBlocksPage,
})

function LabBlocksPage() {
  const lab = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Blocks" icon={Blocks} />

      <LabBlocksCard
        blockCount={lab.blockCount}
        mineCount={lab.mineCount}
        setMineCount={lab.setMineCount}
        ownerType={lab.ownerType}
        setOwnerType={lab.setOwnerType}
        targetAddress={lab.targetAddress}
        setTargetAddress={lab.setTargetAddress}
        ownerName={lab.ownerName}
        setOwnerName={lab.setOwnerName}
        mining={lab.mining}
        onMine={lab.onMine}
        walletStatus={lab.walletStatus}
        currentAddress={lab.currentAddress}
        activeWallet={lab.activeWallet}
      />

      <LabMempoolCard
        mempool={lab.mempool}
        wallets={lab.wallets}
      />

      <LabPreviousBlocksCard blocks={lab.blocks} />
    </>
  )
}
