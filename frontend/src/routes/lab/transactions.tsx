import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeftRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabMakeTransactionCard } from '@/components/lab/MakeTransaction'
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
        controlledAddressesCount={lab.controlledAddressesCount}
        randomTransactionCount={lab.randomTransactionCount}
        setRandomTransactionCount={lab.setRandomTransactionCount}
        onCreateRandomTransactions={lab.onCreateRandomTransactions}
        creatingRandomTransactions={lab.creatingRandomTransactions}
        labEntitiesCount={lab.labEntitiesCount}
      />

      <LabAddressesCard
        addresses={lab.addresses}
        addressToOwner={lab.addressToOwner}
        getBalanceForAddress={lab.getBalanceForAddress}
        onCopyAddress={lab.onCopyAddress}
        wallets={lab.wallets}
      />

      <LabUtxosCard
        utxos={lab.utxos}
        utxosByOwner={lab.utxosByOwner}
        sortedOwnerKeys={lab.sortedOwnerKeys}
        onCopyAddress={lab.onCopyAddress}
        wallets={lab.wallets}
      />
    </>
  )
}
