import { useState, useCallback, useEffect } from 'react'
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
import {
  initLabWorkerWithState,
  persistLabState,
  getLabWorker,
  resetLab,
} from '@/workers/lab-factory'
import { truncateAddress, formatSats } from '@/lib/bitcoin-utils'
import type {
  MempoolEntry,
  LabAddress,
  LabUtxo,
  LabTxRecord,
  LabTxDetails,
} from '@/workers/lab-api'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { Copy } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import { useWallet } from '@/db'
import { displayOwner, WALLET_OWNER_PREFIX } from '@/lib/lab-utils'

export const Route = createFileRoute('/lab/')({
  component: LabIndexPage,
})

function LabIndexPage() {
  const [blockCount, setBlockCount] = useState(0)
  const [addresses, setAddresses] = useState<LabAddress[]>([])
  const [addressToOwner, setAddressToOwner] = useState<Record<string, string>>({})
  const [utxos, setUtxos] = useState<LabUtxo[]>([])
  const [mempool, setMempool] = useState<MempoolEntry[]>([])
  const [transactions, setTransactions] = useState<LabTxRecord[]>([])
  const [txDetails, setTxDetails] = useState<LabTxDetails[]>([])
  const [mineCount, setMineCount] = useState('1')
  const [ownerType, setOwnerType] = useState<'name' | 'wallet'>('name')
  const [targetAddress, setTargetAddress] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [mining, setMining] = useState(false)

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const { data: activeWallet } = useWallet(activeWalletId ?? 0)
  const [showTxForm, setShowTxForm] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [amountSats, setAmountSats] = useState('')
  const [feeRate, setFeeRate] = useState('1')
  const [sending, setSending] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const refreshState = useCallback(async () => {
    try {
      const worker = getLabWorker()
      const [count, addrs, state] = await Promise.all([
        worker.getBlockCount(),
        worker.getAddresses(),
        worker.getStateSnapshot(),
      ])
      setBlockCount(count)
      setAddresses(addrs)
      setAddressToOwner(state.addressToOwner ?? {})
      setUtxos(state.utxos)
      setMempool(state.mempool ?? [])
      setTransactions(state.transactions ?? [])
      setTxDetails(state.txDetails ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh')
    }
  }, [])

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

  useEffect(() => {
    let mounted = true
    initLabWorkerWithState()
      .then(() => {
        if (mounted) refreshState()
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [refreshState])

  const handleMine = useCallback(async () => {
    const count = parseInt(mineCount, 10)
    if (isNaN(count) || count < 1) {
      toast.error('Enter a valid block count')
      return
    }
    const effectiveTarget =
      ownerType === 'wallet' ? (currentAddress ?? '').trim() : targetAddress.trim()
    const effectiveOwner =
      ownerType === 'wallet' && activeWallet?.name
        ? `${WALLET_OWNER_PREFIX}${activeWallet.name}`
        : ownerName.trim() || undefined
    setMining(true)
    try {
      const worker = getLabWorker()
      const state = await worker.mineBlocks(count, effectiveTarget, effectiveOwner)
      await persistLabState(state)
      await refreshState()
      toast.success(`Mined ${count} block(s)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mining failed')
    } finally {
      setMining(false)
    }
  }, [
    mineCount,
    ownerType,
    targetAddress,
    ownerName,
    currentAddress,
    activeWallet?.name,
    refreshState,
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
      const worker = getLabWorker()
      const state = await worker.createTransaction(
        fromAddress,
        toAddress.trim(),
        amount,
        fee,
      )
      await persistLabState(state)
      await refreshState()
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
  }, [fromAddress, toAddress, amountSats, feeRate, refreshState])

  const handleResetLab = useCallback(async () => {
    setShowResetConfirm(false)
    setResetting(true)
    try {
      await resetLab()
      await refreshState()
      toast.success('Lab reset')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }, [refreshState])

  const controlledAddresses = addresses.filter((a) => a.wif)
  const txDetailsByTxid = new Map(txDetails.map((d) => [d.txid, d]))
  const sortedTransactions = [...transactions]
    .sort((a, b) => {
      const amountA =
        txDetailsByTxid.get(a.txid)?.outputs.reduce((s, o) => s + o.amountSats, 0) ?? 0
      const amountB =
        txDetailsByTxid.get(b.txid)?.outputs.reduce((s, o) => s + o.amountSats, 0) ?? 0
      return amountB - amountA
    })

  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight">Lab</h2>

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
                min={1}
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
              {ownerType === 'wallet' ? (
                walletStatus === 'unlocked' || walletStatus === 'syncing' ? (
                  <Input
                    id="target-address"
                    type="text"
                    value={currentAddress ?? ''}
                    readOnly
                    className="min-w-[200px] font-mono text-sm"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    Unlock wallet to mine to it
                  </p>
                )
              ) : (
                <Input
                  id="target-address"
                  type="text"
                  placeholder="bcrt1q..."
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  className="min-w-[200px]"
                />
              )}
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
              onClick={handleMine}
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
              disabled={controlledAddresses.length === 0}
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
                  placeholder="bcrt1q..."
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-address">To address</Label>
                <Input
                  id="to-address"
                  type="text"
                  placeholder="bcrt1q..."
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (sats)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1}
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
                <Button onClick={handleSend} disabled={sending}>
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
              {addresses.map((a) => (
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
                  <span className="w-24 shrink-0">
                    {displayOwner(addressToOwner[a.address] ?? '')}
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
              ))}
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
              {(() => {
                const byOwner = new Map<string, typeof utxos>()
                for (const u of utxos) {
                  const owner = addressToOwner[u.address] ?? 'Unknown'
                  const list = byOwner.get(owner) ?? []
                  list.push(u)
                  byOwner.set(owner, list)
                }
                const sortedOwners = [...byOwner.keys()].sort((a, b) =>
                  a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b),
                )
                return sortedOwners.map((owner) => (
                  <div key={owner}>
                    <h4 className="text-sm font-medium mb-2">{displayOwner(owner)}</h4>
                    <div className="space-y-2">
                      <div className="flex gap-4 text-sm font-medium text-muted-foreground">
                        <span className="flex-1 min-w-0">Address</span>
                        <span className="w-24 shrink-0 text-right">Sats</span>
                        <span className="w-10 shrink-0" />
                      </div>
                      {(byOwner.get(owner) ?? []).map((u) => (
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
                ))
              })()}
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
                      {tx.sender ? displayOwner(tx.sender) : 'unknown'} →{' '}
                      {tx.receiver ? displayOwner(tx.receiver) : 'unknown'}
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
                {sortedTransactions.slice(0, 10).map((tx) => {
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
                        {tx.sender ? displayOwner(tx.sender) : 'unknown'} →{' '}
                        {tx.receiver ? displayOwner(tx.receiver) : 'unknown'}
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

      <Card>
        <CardHeader>
          <CardTitle>Drastic Measures</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
          >
            {resetting ? 'Resetting...' : 'Reset lab'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={showResetConfirm}
        title="Reset lab?"
        message="All blocks, transactions, addresses, and mempool entries in the lab will be deleted. This cannot be undone."
        confirmText="Reset lab"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleResetLab}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  )
}
