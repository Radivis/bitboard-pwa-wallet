import { useState, useCallback, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useLabStore } from '@/stores/labStore'
import { useWalletStore } from '@/stores/walletStore'
import { useWallet, useWallets } from '@/db'
import { LabBlocksCard } from '@/components/lab/Blocks'
import { LabMakeTransactionCard } from '@/components/lab/MakeTransaction'
import { LabRulesCard } from '@/components/lab/Rules'
import { LabResetCard } from '@/components/lab/Reset'
import { LabAddressesCard } from '@/components/lab/Addresses'
import { LabUtxosCard } from '@/components/lab/Utxos'
import { LabTransactionsCard } from '@/components/lab/Transactions'

const DEFAULT_LAB_FEE_RATE_SAT_PER_VB = 1
const MIN_LAB_BLOCK_COUNT = 1

export const Route = createFileRoute('/lab/')({
  component: LabIndexPage,
})

function LabIndexPage() {
  const blocks = useLabStore((s) => s.blocks)
  const addresses = useLabStore((s) => s.addresses)
  const addressToOwner = useLabStore((s) => s.addressToOwner)
  const utxos = useLabStore((s) => s.utxos)
  const mempool = useLabStore((s) => s.mempool)
  const transactions = useLabStore((s) => s.transactions)
  const txDetails = useLabStore((s) => s.txDetails)
  const resetLabStore = useLabStore((s) => s.reset)
  const blockCount = blocks.length === 0 ? 0 : blocks[blocks.length - 1].height + 1
  const [mineCount, setMineCount] = useState(String(MIN_LAB_BLOCK_COUNT))
  const [ownerType, setOwnerType] = useState<'name' | 'wallet'>('name')
  const [targetAddress, setTargetAddress] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [mining, setMining] = useState(false)

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const { data: activeWallet } = useWallet(activeWalletId ?? 0)
  const { data: wallets = [] } = useWallets()
  const [showTxForm, setShowTxForm] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [amountSats, setAmountSats] = useState('')
  const [feeRate, setFeeRate] = useState(String(DEFAULT_LAB_FEE_RATE_SAT_PER_VB))
  const [sending, setSending] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const getBalanceForAddress = useCallback(
    (address: string) =>
      utxos
        .filter((u) => u.address === address)
        .reduce((sum, u) => sum + u.amountSats, 0),
    [utxos],
  )

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Failed to copy address')
    }
  }, [])

  const handleMine = useCallback(async () => {
    const count = parseInt(mineCount, 10)
    if (isNaN(count) || count < 1) {
      toast.error('Enter a valid block count')
      return
    }
    const effectiveTarget =
      ownerType === 'wallet' ? (currentAddress ?? '').trim() : targetAddress.trim()
    const mineOptions =
      ownerType === 'wallet' && activeWalletId != null
        ? { ownerWalletId: activeWalletId }
        : ownerName.trim()
          ? { ownerName: ownerName.trim() }
          : undefined
    setMining(true)
    try {
      await useLabStore.getState().mineBlocks(count, effectiveTarget, mineOptions)
      toast.success(`Mined ${count} block(s)`)
    } catch (err) {
      console.error('Mining failed:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err) || 'Unknown error'
      toast.error(`Mining failed: ${msg}`)
    } finally {
      setMining(false)
    }
  }, [
    mineCount,
    ownerType,
    targetAddress,
    ownerName,
    currentAddress,
    activeWalletId,
  ])

  const handleSend = useCallback(async () => {
    const amount = parseInt(amountSats, 10)
    const fee = parseFloat(feeRate)
    if (isNaN(amount) || amount < 1) {
      toast.error('Enter a valid amount')
      return
    }
    if (!fromAddress) {
      toast.error('Select a from address')
      return
    }
    if (!toAddress.trim()) {
      toast.error('Enter a to address')
      return
    }
    setSending(true)
    try {
      await useLabStore.getState().createLabTransaction(
        fromAddress,
        toAddress.trim(),
        amount,
        fee,
      )
      setShowTxForm(false)
      setFromAddress('')
      setToAddress('')
      setAmountSats('')
      toast.success('Transaction added to mempool')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setSending(false)
    }
  }, [fromAddress, toAddress, amountSats, feeRate])

  const handleResetLab = useCallback(async () => {
    setShowResetConfirm(false)
    setResetting(true)
    try {
      await resetLabStore()
      toast.success('Lab reset')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }, [resetLabStore])

  const controlledAddresses = addresses.filter((a) => a.wif)
  const txDetailsByTxid = useMemo(
    () => new Map(txDetails.map((d) => [d.txid, d])),
    [txDetails],
  )
  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const amountA =
          txDetailsByTxid.get(a.txid)?.outputs.reduce((s, o) => s + o.amountSats, 0) ?? 0
        const amountB =
          txDetailsByTxid.get(b.txid)?.outputs.reduce((s, o) => s + o.amountSats, 0) ?? 0
        return amountB - amountA
      }),
    [transactions, txDetailsByTxid],
  )

  const { utxosByOwner, sortedOwnerKeys } = useMemo(() => {
    const byOwner = new Map<string, typeof utxos>()
    for (const utxo of utxos) {
      const owner = (addressToOwner ?? {})[utxo.address] ?? 'Unknown'
      const ownerList = byOwner.get(owner) ?? []
      ownerList.push(utxo)
      byOwner.set(owner, ownerList)
    }
    const sortedOwners = [...byOwner.keys()].sort((a, b) =>
      a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b),
    )
    return { utxosByOwner: byOwner, sortedOwnerKeys: sortedOwners }
  }, [utxos, addressToOwner])

  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight">Lab</h2>

      <LabBlocksCard
        blockCount={blockCount}
        mineCount={mineCount}
        setMineCount={setMineCount}
        ownerType={ownerType}
        setOwnerType={setOwnerType}
        targetAddress={targetAddress}
        setTargetAddress={setTargetAddress}
        ownerName={ownerName}
        setOwnerName={setOwnerName}
        mining={mining}
        onMine={handleMine}
        walletStatus={walletStatus}
        currentAddress={currentAddress}
        activeWallet={activeWallet ?? undefined}
      />

      <LabMakeTransactionCard
        showTxForm={showTxForm}
        setShowTxForm={setShowTxForm}
        fromAddress={fromAddress}
        setFromAddress={setFromAddress}
        toAddress={toAddress}
        setToAddress={setToAddress}
        amountSats={amountSats}
        setAmountSats={setAmountSats}
        feeRate={feeRate}
        setFeeRate={setFeeRate}
        onSend={handleSend}
        sending={sending}
        controlledAddressesCount={controlledAddresses.length}
      />

      <LabAddressesCard
        addresses={addresses}
        addressToOwner={addressToOwner}
        getBalanceForAddress={getBalanceForAddress}
        onCopyAddress={handleCopyAddress}
        wallets={wallets}
      />

      <LabUtxosCard
        utxos={utxos}
        utxosByOwner={utxosByOwner}
        sortedOwnerKeys={sortedOwnerKeys}
        onCopyAddress={handleCopyAddress}
        wallets={wallets}
      />

      <LabTransactionsCard
        mempool={mempool}
        sortedTransactions={sortedTransactions}
        txDetailsByTxid={txDetailsByTxid}
        blockCount={blockCount}
        wallets={wallets}
      />

      <LabRulesCard />

      <LabResetCard
        onResetClick={() => setShowResetConfirm(true)}
        resetting={resetting}
        onConfirmReset={handleResetLab}
        showConfirm={showResetConfirm}
        onCancelConfirm={() => setShowResetConfirm(false)}
      />
    </>
  )
}
