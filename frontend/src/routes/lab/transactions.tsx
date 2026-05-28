import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeftRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabMakeTransactionCard } from '@/components/lab/MakeTransaction'
import { DeadLabEntityRecipientModal } from '@/components/lab/DeadLabEntityRecipientModal'
import { DustChangeChoiceModal } from '@/components/wallet/send/DustChangeChoiceModal'
import { LabAddressesCard } from '@/components/lab/Addresses'
import { LabUtxosCard } from '@/components/lab/Utxos'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'

export const Route = createFileRoute('/lab/transactions')({
  component: LabTransactionsPage,
})

function LabTransactionsPage() {
  const labPageData = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Transactions" icon={ArrowLeftRight} />

      <DeadLabEntityRecipientModal
        open={labPageData.deadRecipientModalOpen}
        onOpenChange={(open) => {
          if (!open) labPageData.onCloseDeadRecipientModal()
        }}
        onCancel={labPageData.onCloseDeadRecipientModal}
        entityDisplayName={labPageData.deadRecipientModalDisplayName}
        addressType={labPageData.deadRecipientModalAddressType}
        onConfirm={labPageData.onConfirmDeadRecipientSend}
        isPending={labPageData.sending}
      />

      <DustChangeChoiceModal
        open={labPageData.dustCase2ModalOpen}
        onOpenChange={(open) => {
          if (!open) labPageData.onCloseDustCase2Modal()
        }}
        exactAmountSats={labPageData.dustCase2ExactAmountSats}
        changeFreeMaxSats={labPageData.dustCase2ChangeFreeMaxSats}
        onKeepExact={labPageData.onDustCase2KeepExact}
        onIncreaseToChangeFree={labPageData.onDustCase2IncreaseToChangeFree}
        isPending={labPageData.sending}
      />

      <LabMakeTransactionCard
        showTxForm={labPageData.showTxForm}
        setShowTxForm={labPageData.setShowTxForm}
        fromAddress={labPageData.fromAddress}
        setFromAddress={labPageData.setFromAddress}
        toAddress={labPageData.toAddress}
        setToAddress={labPageData.setToAddress}
        amountSats={labPageData.amountSats}
        setAmountSats={labPageData.setAmountSats}
        feeRate={labPageData.feeRate}
        setFeeRate={labPageData.setFeeRate}
        onSend={labPageData.onSend}
        sending={labPageData.sending}
        sendDisabledFromDeadEntity={labPageData.sendDisabledFromDeadEntity}
        deadFromEntityDisplayName={labPageData.deadFromEntityDisplayName}
        controlledAddressesCount={labPageData.controlledAddressesCount}
        randomTransactionCount={labPageData.randomTransactionCount}
        setRandomTransactionCount={labPageData.setRandomTransactionCount}
        onCreateRandomTransactions={labPageData.onCreateRandomTransactions}
        creatingRandomTransactions={labPageData.creatingRandomTransactions}
        randomBatchProgress={labPageData.randomBatchProgress}
        labEntitiesCount={labPageData.labEntitiesCount}
        hasMinedBlocks={labPageData.blockCount > 0}
      />

      <LabAddressesCard onCopyAddress={labPageData.onCopyAddress} wallets={labPageData.wallets} />

      <LabUtxosCard onCopyAddress={labPageData.onCopyAddress} wallets={labPageData.wallets} />
    </>
  )
}
