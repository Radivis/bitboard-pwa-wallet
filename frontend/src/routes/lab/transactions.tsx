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
  const lab = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Transactions" icon={ArrowLeftRight} />

      <DeadLabEntityRecipientModal
        open={lab.deadRecipientModalOpen}
        onOpenChange={(open) => {
          if (!open) lab.onCloseDeadRecipientModal()
        }}
        onCancel={lab.onCloseDeadRecipientModal}
        entityDisplayName={lab.deadRecipientModalDisplayName}
        addressType={lab.deadRecipientModalAddressType}
        onConfirm={lab.onConfirmDeadRecipientSend}
        isPending={lab.sending}
      />

      <DustChangeChoiceModal
        open={lab.dustCase2ModalOpen}
        onOpenChange={(open) => {
          if (!open) lab.onCloseDustCase2Modal()
        }}
        exactAmountSats={lab.dustCase2ExactAmountSats}
        changeFreeMaxSats={lab.dustCase2ChangeFreeMaxSats}
        onKeepExact={lab.onDustCase2KeepExact}
        onIncreaseToChangeFree={lab.onDustCase2IncreaseToChangeFree}
        isPending={lab.sending}
      />

      <LabMakeTransactionCard
        showTxForm={lab.showTxForm}
        setShowTxForm={lab.setShowTxForm}
        fromAddress={lab.fromAddress}
        setFromAddress={lab.setFromAddress}
        toAddress={lab.toAddress}
        setToAddress={lab.setToAddress}
        amountSats={lab.amountSats}
        setAmountSats={lab.setAmountSats}
        feeRate={lab.feeRate}
        setFeeRate={lab.setFeeRate}
        onSend={lab.onSend}
        sending={lab.sending}
        sendDisabledFromDeadEntity={lab.sendDisabledFromDeadEntity}
        deadFromEntityDisplayName={lab.deadFromEntityDisplayName}
        controlledAddressesCount={lab.controlledAddressesCount}
        randomTransactionCount={lab.randomTransactionCount}
        setRandomTransactionCount={lab.setRandomTransactionCount}
        onCreateRandomTransactions={lab.onCreateRandomTransactions}
        creatingRandomTransactions={lab.creatingRandomTransactions}
        randomBatchProgress={lab.randomBatchProgress}
        labEntitiesCount={lab.labEntitiesCount}
      />

      <LabAddressesCard onCopyAddress={lab.onCopyAddress} wallets={lab.wallets} />

      <LabUtxosCard onCopyAddress={lab.onCopyAddress} wallets={lab.wallets} />
    </>
  )
}
