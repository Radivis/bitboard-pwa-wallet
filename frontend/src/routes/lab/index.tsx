import { useState, useCallback, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useLabStore } from '@/stores/labStore'
import { truncateAddress, formatSats } from '@/lib/bitcoin-utils'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { useWalletStore } from '@/stores/walletStore'
import { useWallet, useWallets } from '@/db'
import { getOwnerDisplayName, getOwnerIcon } from '@/lib/lab-utils'
import { Wallet, FlaskConical, Copy } from 'lucide-react'

const DEFAULT_LAB_FEE_RATE_SAT_PER_VB = 1
const MIN_LAB_BLOCK_COUNT = 1
const MAX_DISPLAYED_LAB_TRANSACTIONS = 10

export const Route = createFileRoute('/lab/')({
  component: LabIndexPage,
})

function TargetAddressField({
  ownerType,
  walletStatus,
  currentAddress,
  targetAddress,
  onTargetAddressChange,
}: {
  ownerType: 'name' | 'wallet'
  walletStatus: string
  currentAddress: string | null
  targetAddress: string
  onTargetAddressChange: (value: string) => void
}) {
  if (ownerType === 'wallet') {
    if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
      return (
        <Input
          id="target-address"
          type="text"
          value={currentAddress ?? ''}
          readOnly
          className="min-w-[200px] font-mono text-sm"
        />
      )
    }
    return (
      <p className="text-sm text-muted-foreground py-2">
        Unlock wallet to mine to it
      </p>
    )
  }
  return (
    <Input
      id="target-address"
      type="text"
      placeholder="bcrt1q... or bcrt1p..."
      value={targetAddress}
      onChange={(e) => onTargetAddressChange(e.target.value)}
      className="min-w-[200px]"
    />
  )
}

function LabBlocksCard({
  blockCount,
  mineCount,
  setMineCount,
  ownerType,
  setOwnerType,
  targetAddress,
  setTargetAddress,
  ownerName,
  setOwnerName,
  mining,
  onMine,
  walletStatus,
  currentAddress,
  activeWallet,
}: {
  blockCount: number
  mineCount: string
  setMineCount: (v: string) => void
  ownerType: 'name' | 'wallet'
  setOwnerType: (v: 'name' | 'wallet') => void
  targetAddress: string
  setTargetAddress: (v: string) => void
  ownerName: string
  setOwnerName: (v: string) => void
  mining: boolean
  onMine: () => void
  walletStatus: string
  currentAddress: string | null
  activeWallet: { name: string } | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocks</CardTitle>
        <CardDescription>Blocks mined: {blockCount}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-2">
            <Label htmlFor="mine-count">Number of blocks</Label>
            <Input
              id="mine-count"
              type="number"
              min={MIN_LAB_BLOCK_COUNT}
              value={mineCount}
              onChange={(e) => setMineCount(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label>Owner type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={ownerType === 'name' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOwnerType('name')}
              >
                Name
              </Button>
              <Button
                type="button"
                variant={ownerType === 'wallet' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOwnerType('wallet')}
              >
                Wallet
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-address">
              {ownerType === 'wallet'
                ? 'Target address (active wallet)'
                : 'Target address (blank = random)'}
            </Label>
            <TargetAddressField
              ownerType={ownerType}
              walletStatus={walletStatus}
              currentAddress={currentAddress}
              targetAddress={targetAddress}
              onTargetAddressChange={setTargetAddress}
            />
          </div>
          {ownerType === 'name' && (
            <div className="space-y-2">
              <Label htmlFor="owner-name">Owner (optional)</Label>
              <Input
                id="owner-name"
                type="text"
                placeholder="Alice"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="min-w-[120px]"
              />
            </div>
          )}
          {ownerType === 'wallet' && activeWallet && (
            <p className="text-sm text-muted-foreground">
              Mining to: {activeWallet.name}
            </p>
          )}
          <Button
            onClick={onMine}
            disabled={
              mining ||
              (ownerType === 'wallet' &&
                (walletStatus !== 'unlocked' && walletStatus !== 'syncing')) ||
              (ownerType === 'wallet' && (!currentAddress || !activeWallet))
            }
          >
            {mining ? 'Mining...' : 'Mine blocks'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LabTransactionCard({
  showTxForm,
  setShowTxForm,
  fromAddress,
  setFromAddress,
  toAddress,
  setToAddress,
  amountSats,
  setAmountSats,
  feeRate,
  setFeeRate,
  onSend,
  sending,
  controlledAddressesCount,
}: {
  showTxForm: boolean
  setShowTxForm: (v: boolean) => void
  fromAddress: string
  setFromAddress: (v: string) => void
  toAddress: string
  setToAddress: (v: string) => void
  amountSats: string
  setAmountSats: (v: string) => void
  feeRate: string
  setFeeRate: (v: string) => void
  onSend: () => void
  sending: boolean
  controlledAddressesCount: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction</CardTitle>
        <CardDescription>Send coins to another address</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showTxForm ? (
          <Button
            variant="outline"
            onClick={() => setShowTxForm(true)}
            disabled={controlledAddressesCount === 0}
          >
            Make transaction
          </Button>
        ) : (
          <div className="space-y-4 border rounded-lg p-4">
            <div className="space-y-2">
              <Label htmlFor="from-address">From address</Label>
              <Input
                id="from-address"
                type="text"
                placeholder="bcrt1q... or bcrt1p..."
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-address">To address</Label>
              <Input
                id="to-address"
                type="text"
                placeholder="bcrt1q... or bcrt1p..."
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (sats)</Label>
              <Input
                id="amount"
                type="number"
                min={MIN_LAB_BLOCK_COUNT}
                placeholder="1000"
                value={amountSats}
                onChange={(e) => setAmountSats(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-rate">Fee rate (sat/vB)</Label>
              <Input
                id="fee-rate"
                type="number"
                min={0.1}
                step={0.1}
                placeholder="1"
                value={feeRate}
                onChange={(e) => setFeeRate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={onSend} disabled={sending}>
                {sending ? 'Sending...' : 'Send'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTxForm(false)
                  setFromAddress('')
                  setToAddress('')
                  setAmountSats('')
                }}
                disabled={sending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LabRulesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>
          How the lab simulation works and how it differs from Bitcoin mainnet
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          <li>
            <strong>No Proof of Work.</strong> In the lab, new blocks are created by clicking
            &quot;Mine blocks&quot;. On mainnet, miners must solve a cryptographic puzzle
            (Proof of Work) to produce a valid block.
          </li>
          <li>
            <strong>Immediate coinbase spendability.</strong> Newly mined coins can be spent
            immediately in the lab. On mainnet, coinbase outputs require 100 confirmations
            before they can be spent.
          </li>
          <li>
            <strong>Mempool first.</strong> New transactions enter the mempool and stay there
            until a block is mined. Mining a block includes mempool transactions and confirms
            them.
          </li>
          <li>
            <strong>Transaction fees go to the miner.</strong> When a block is mined, all
            fees from the included transactions are added to the coinbase output, just like
            on mainnet.
          </li>
          <li>
            <strong>One spend per UTXO.</strong> Each UTXO can only be spent once in a
            block. If two mempool transactions try to spend the same UTXO (double-spend),
            only the one with the higher fee is included. Ties are decided randomly. The
            losing transaction is discarded from the mempool entirely.
          </li>
          <li>
            <strong>Balances reflect confirmed UTXOs only.</strong> Unconfirmed (mempool)
            spends do not reduce your balance until the block is mined. You can create
            conflicting transactions to observe this.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}

function LabResetCard({
  onResetClick,
  resetting,
  onConfirmReset,
  showConfirm,
  onCancelConfirm,
}: {
  onResetClick: () => void
  resetting: boolean
  onConfirmReset: () => void
  showConfirm: boolean
  onCancelConfirm: () => void
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Drastic Measures</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={onResetClick} disabled={resetting}>
            {resetting ? 'Resetting...' : 'Reset lab'}
          </Button>
        </CardContent>
      </Card>
      <ConfirmationDialog
        open={showConfirm}
        title="Reset lab?"
        message="All blocks, transactions, addresses, and mempool entries in the lab will be deleted. This cannot be undone."
        confirmText="Reset lab"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={onConfirmReset}
        onCancel={onCancelConfirm}
      />
    </>
  )
}

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
    for (const u of utxos) {
      const owner = (addressToOwner ?? {})[u.address] ?? 'Unknown'
      const list = byOwner.get(owner) ?? []
      list.push(u)
      byOwner.set(owner, list)
    }
    const sorted = [...byOwner.keys()].sort((a, b) =>
      a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b),
    )
    return { utxosByOwner: byOwner, sortedOwnerKeys: sorted }
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

      <LabTransactionCard
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

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>Addresses that have interacted with the network</CardDescription>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No addresses yet. Mine blocks to create addresses.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-4 text-sm font-medium text-muted-foreground">
                <span className="flex-1 min-w-0">Address</span>
                <span className="w-24 shrink-0 text-right">Balance</span>
                <span className="w-24 shrink-0">Owner</span>
                <span className="w-10 shrink-0" />
              </div>
              {addresses.map((a) => {
                const owner = (addressToOwner ?? {})[a.address] ?? 'Unknown'
                return (
                  <div
                  key={a.address}
                  className="flex gap-4 items-center py-2 border-b border-border last:border-0"
                >
                  <span className="font-mono text-sm break-all flex-1 min-w-0">
                    {truncateAddress(a.address)}
                  </span>
                  <span className="tabular-nums text-right w-24 shrink-0">
                    {formatSats(getBalanceForAddress(a.address))} sats
                  </span>
                  <span className="w-24 shrink-0 flex items-center gap-1">
                    {getOwnerIcon(owner) === 'wallet' ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <FlaskConical className="h-4 w-4" />
                      )}
                      {getOwnerDisplayName(owner, wallets)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleCopyAddress(a.address)}
                    aria-label={`Copy ${truncateAddress(a.address)}`}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>UTXOs</CardTitle>
          <CardDescription>Unspent transaction outputs, grouped by owner</CardDescription>
        </CardHeader>
        <CardContent>
          {utxos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No UTXOs yet. Mine blocks to create coinbase outputs.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedOwnerKeys.map((owner) => (
                <div key={owner}>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                    {getOwnerIcon(owner) === 'wallet' ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <FlaskConical className="h-4 w-4" />
                    )}
                    {getOwnerDisplayName(owner, wallets)}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex gap-4 text-sm font-medium text-muted-foreground">
                      <span className="flex-1 min-w-0">Address</span>
                      <span className="w-24 shrink-0 text-right">Sats</span>
                      <span className="w-10 shrink-0" />
                    </div>
                    {(utxosByOwner.get(owner) ?? []).map((u) => (
                      <div
                        key={`${u.txid}:${u.vout}`}
                        className="flex gap-4 items-center py-2 border-b border-border last:border-0"
                      >
                        <span className="font-mono text-sm break-all flex-1 min-w-0">
                          {truncateAddress(u.address)}
                        </span>
                        <span className="tabular-nums text-right w-24 shrink-0">
                          {formatSats(u.amountSats)} sats
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleCopyAddress(u.address)}
                          aria-label={`Copy ${truncateAddress(u.address)}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Mempool and confirmed transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {mempool.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Mempool</h4>
              <div className="space-y-2">
                {mempool.map((tx) => (
                  <Link
                    key={tx.txid}
                    to="/lab/tx/$txid"
                    params={{ txid: tx.txid }}
                    className="flex gap-4 items-center py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
                  >
                    <span className="font-mono text-sm truncate flex-1 min-w-0" title={tx.txid}>
                      {truncateAddress(tx.txid)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {tx.sender ? getOwnerDisplayName(tx.sender, wallets) : 'unknown'} →{' '}
                      {tx.receiver ? getOwnerDisplayName(tx.receiver, wallets) : 'unknown'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium mb-2">Confirmed</h4>
            {sortedTransactions.length === 0 && mempool.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No transactions yet. Create a transaction to see it here.
              </p>
            ) : sortedTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No confirmed transactions yet. Mine blocks to confirm mempool transactions.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedTransactions.slice(0, MAX_DISPLAYED_LAB_TRANSACTIONS).map((tx) => {
                  const details = txDetailsByTxid.get(tx.txid)
                  const confirmations = details
                    ? blockCount - details.blockHeight
                    : 0
                  return (
                    <Link
                      key={tx.txid}
                      to="/lab/tx/$txid"
                      params={{ txid: tx.txid }}
                      className="flex gap-4 items-center py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
                    >
                      <span className="font-mono text-sm truncate flex-1 min-w-0" title={tx.txid}>
                        {truncateAddress(tx.txid)}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {tx.sender ? getOwnerDisplayName(tx.sender, wallets) : 'unknown'} →{' '}
                        {tx.receiver ? getOwnerDisplayName(tx.receiver, wallets) : 'unknown'}
                        {' '}
                        ({confirmations} confirmations)
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
