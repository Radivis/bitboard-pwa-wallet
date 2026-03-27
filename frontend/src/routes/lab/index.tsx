import { createFileRoute } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabBlocksCard } from '@/components/lab/Blocks'
import { LabMakeTransactionCard } from '@/components/lab/MakeTransaction'
import { LabRulesCard } from '@/components/lab/Rules'
import { LabResetCard } from '@/components/lab/Reset'
import { LabAddressesCard } from '@/components/lab/Addresses'
import { LabUtxosCard } from '@/components/lab/Utxos'
import { LabTransactionsCard } from '@/components/lab/Transactions'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'

export const Route = createFileRoute('/lab/')({
  component: LabIndexPage,
})

function LabIndexPage() {
  const lab = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Lab" icon={FlaskConical} />

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

      <LabTransactionsCard
        mempool={lab.mempool}
        sortedTransactions={lab.sortedTransactions}
        txDetailsByTxid={lab.txDetailsByTxid}
        blockCount={lab.blockCount}
        wallets={lab.wallets}
      />

      <LabRulesCard />

      <LabResetCard
        onResetClick={() => lab.setShowResetConfirm(true)}
        resetting={lab.resetting}
        onConfirmReset={lab.onConfirmReset}
        showConfirm={lab.showResetConfirm}
        onCancelConfirm={() => lab.setShowResetConfirm(false)}
      />
    </>
  )
}
