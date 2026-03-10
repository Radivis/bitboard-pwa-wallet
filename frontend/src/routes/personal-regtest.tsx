import { useState, useCallback, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
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
  initRegtestWorkerWithState,
  persistRegtestState,
  getRegtestWorker,
} from '@/workers/regtest-factory'
import { truncateAddress } from '@/lib/bitcoin-utils'
import type { RegtestAddress } from '@/workers/regtest-api'

export const Route = createFileRoute('/personal-regtest')({
  component: PersonalRegtestPage,
})

function PersonalRegtestPage() {
  const navigate = useNavigate()
  const networkMode = useWalletStore((s) => s.networkMode)
  const [blockCount, setBlockCount] = useState(0)
  const [addresses, setAddresses] = useState<RegtestAddress[]>([])
  const [mineCount, setMineCount] = useState('1')
  const [targetAddress, setTargetAddress] = useState('')
  const [mining, setMining] = useState(false)
  const [showTxForm, setShowTxForm] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [amountSats, setAmountSats] = useState('')
  const [feeRate, setFeeRate] = useState('1')
  const [sending, setSending] = useState(false)

  const refreshState = useCallback(async () => {
    try {
      const worker = getRegtestWorker()
      const count = await worker.getBlockCount()
      const addrs = await worker.getAddresses()
      setBlockCount(count)
      setAddresses(addrs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh')
    }
  }, [])

  useEffect(() => {
    if (networkMode !== 'personal-regtest') {
      navigate({ to: '/settings' })
      return
    }

    let mounted = true
    initRegtestWorkerWithState()
      .then(() => {
        if (mounted) refreshState()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to init regtest')
      })
    return () => {
      mounted = false
    }
  }, [networkMode, navigate, refreshState])

  const handleMine = useCallback(async () => {
    const count = parseInt(mineCount, 10)
    if (isNaN(count) || count < 1) {
      toast.error('Enter a valid block count')
      return
    }
    setMining(true)
    try {
      const worker = getRegtestWorker()
      const state = await worker.mineBlocks(count, targetAddress.trim())
      await persistRegtestState(state)
      await refreshState()
      toast.success(`Mined ${count} block(s)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mining failed')
    } finally {
      setMining(false)
    }
  }, [mineCount, targetAddress, refreshState])

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
      const worker = getRegtestWorker()
      const state = await worker.createTransaction(
        fromAddress,
        toAddress.trim(),
        amount,
        fee,
      )
      await persistRegtestState(state)
      await refreshState()
      setShowTxForm(false)
      setFromAddress('')
      setToAddress('')
      setAmountSats('')
      toast.success('Transaction sent and confirmed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setSending(false)
    }
  }, [fromAddress, toAddress, amountSats, feeRate, refreshState])

  const controlledAddresses = addresses.filter((a) => a.wif)

  if (networkMode !== 'personal-regtest') {
    return null
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Personal Regtest</h2>

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
              <Label htmlFor="target-address">Target address (blank = random)</Label>
              <Input
                id="target-address"
                type="text"
                placeholder="bcrt1q..."
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="min-w-[200px]"
              />
            </div>
            <Button onClick={handleMine} disabled={mining}>
              {mining ? 'Mining...' : 'Mine blocks'}
            </Button>
          </div>
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
                <span className="w-48">Address</span>
                <span>Controlled</span>
              </div>
              {addresses.map((a) => (
                <div
                  key={a.address}
                  className="flex gap-4 py-2 border-b border-border last:border-0"
                >
                  <span className="font-mono text-sm break-all">{truncateAddress(a.address)}</span>
                  <span>{a.wif ? 'Yes' : 'No'}</span>
                </div>
              ))}
            </div>
          )}
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
                <select
                  id="from-address"
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Select...</option>
                  {controlledAddresses.map((a) => (
                    <option key={a.address} value={a.address}>
                      {truncateAddress(a.address)}
                    </option>
                  ))}
                </select>
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
    </div>
  )
}
