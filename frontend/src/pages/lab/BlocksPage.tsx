import { Blocks } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabBlocksCard } from '@/components/lab/Blocks'
import { LabMempoolCard } from '@/components/lab/Mempool'
import { LabPreviousBlocksCard } from '@/components/lab/PreviousBlocks'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'

export function BlocksPage() {
  const labPageData = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Blocks" icon={Blocks} />

      <LabBlocksCard
        blockCount={labPageData.blockCount}
        mineCount={labPageData.mineCount}
        setMineCount={labPageData.setMineCount}
        ownerType={labPageData.ownerType}
        setOwnerType={labPageData.setOwnerType}
        entities={labPageData.entities}
        selectedLabEntityId={labPageData.selectedLabEntityId}
        setSelectedLabEntityId={labPageData.setSelectedLabEntityId}
        mining={labPageData.mining}
        onMine={labPageData.onMine}
        walletStatus={labPageData.walletStatus}
        currentAddress={labPageData.currentAddress}
        activeWallet={labPageData.activeWallet}
      />

      <LabMempoolCard
        mempool={labPageData.mempool}
        wallets={labPageData.wallets}
      />

      <LabPreviousBlocksCard
        blocks={labPageData.blocks}
        mineOperations={labPageData.mineOperations}
        txDetails={labPageData.txDetails}
        entities={labPageData.entities}
        wallets={labPageData.wallets}
      />
    </>
  )
}
