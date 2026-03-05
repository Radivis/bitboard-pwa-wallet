import { useState, useMemo, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import {
  isValidAddress,
  formatBTC,
  formatSats,
  getEsploraUrl,
  truncateAddress,
  toBitcoinNetwork,
} from '@/lib/bitcoin-utils'
import { updateWalletChangeset, loadCustomEsploraUrl } from '@/lib/wallet-utils'

export const Route = createFileRoute('/send')({
  component: SendPage,
})

type AmountUnit = 'btc' | 'sats'

const FEE_PRESETS = [
  { label: 'Low', rate: 1 },
  { label: 'Medium', rate: 3 },
  { label: 'High', rate: 5 },
] as const

export function SendPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  if (walletStatus === 'locked') {
    return <WalletUnlock />
  }

  return <SendFlow />
}

function SendFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [amountUnit, setAmountUnit] = useState<AmountUnit>('btc')
  const [feeRate, setFeeRate] = useState(1)
  const [customFeeRate, setCustomFeeRate] = useState('')
  const [useCustomFee, setUseCustomFee] = useState(false)
  const [psbt, setPsbt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const networkMode = useWalletStore((s) => s.networkMode)
  const balance = useWalletStore((s) => s.balance)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const setBalance = useWalletStore((s) => s.setBalance)
  const setTransactions = useWalletStore((s) => s.setTransactions)
  const setLastSyncTime = useWalletStore((s) => s.setLastSyncTime)
  const password = useSessionStore((s) => s.password)

  const buildTransaction = useCryptoStore((s) => s.buildTransaction)
  const signAndExtractTransaction = useCryptoStore((s) => s.signAndExtractTransaction)
  const broadcastTransaction = useCryptoStore((s) => s.broadcastTransaction)
  const syncWallet = useCryptoStore((s) => s.syncWallet)
  const getBalance = useCryptoStore((s) => s.getBalance)
  const getTransactionList = useCryptoStore((s) => s.getTransactionList)
  const exportChangeset = useCryptoStore((s) => s.exportChangeset)

  const confirmedBalance = balance?.confirmed ?? 0

  const effectiveFeeRate = useCustomFee
    ? parseInt(customFeeRate) || 1
    : feeRate

  const amountSats = useMemo(() => {
    if (!amount) return 0
    return amountUnit === 'btc'
      ? Math.floor(parseFloat(amount) * 100_000_000)
      : parseInt(amount) || 0
  }, [amount, amountUnit])

  const addressValid = useMemo(
    () => recipient.length > 0 && isValidAddress(recipient, networkMode),
    [recipient, networkMode],
  )

  const canBuild = addressValid && amountSats > 0 && amountSats <= confirmedBalance

  const handleBuildTransaction = useCallback(async () => {
    if (!canBuild) return

    try {
      setLoading(true)
      const network = toBitcoinNetwork(networkMode)
      const psbtBase64 = await buildTransaction(
        recipient,
        amountSats,
        effectiveFeeRate,
        network,
      )
      setPsbt(psbtBase64)
      setStep(2)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to build transaction',
      )
    } finally {
      setLoading(false)
    }
  }, [canBuild, recipient, amountSats, effectiveFeeRate, networkMode, buildTransaction])

  const handleBroadcast = useCallback(async () => {
    if (!psbt) return

    try {
      setLoading(true)

      const rawTxHex = await signAndExtractTransaction(psbt)

      const customUrl = await loadCustomEsploraUrl(networkMode)
      const esploraUrl = getEsploraUrl(networkMode, customUrl)
      const txid = await broadcastTransaction(rawTxHex, esploraUrl)

      if (password && activeWalletId) {
        const changeset = await exportChangeset()
        await updateWalletChangeset(password, activeWalletId, changeset)
      }

      try {
        setWalletStatus('syncing')
        await syncWallet(esploraUrl)
        const newBalance = await getBalance()
        const newTxs = await getTransactionList()
        setBalance(newBalance)
        setTransactions(newTxs)
        setLastSyncTime(new Date())
        setWalletStatus('unlocked')
      } catch {
        setWalletStatus('unlocked')
      }

      toast.success(`Transaction broadcast! TXID: ${txid.slice(0, 16)}...`)
      navigate({ to: '/' })
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Broadcast failed: ${err.message}`
          : 'Broadcast failed',
      )
    } finally {
      setLoading(false)
    }
  }, [
    psbt,
    networkMode,
    activeWalletId,
    password,
    signAndExtractTransaction,
    broadcastTransaction,
    syncWallet,
    getBalance,
    getTransactionList,
    exportChangeset,
    setWalletStatus,
    setBalance,
    setTransactions,
    setLastSyncTime,
    navigate,
  ])

  if (step === 2 && psbt) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Review Transaction</h2>

        <Card>
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient</span>
                <span className="font-mono">
                  {truncateAddress(recipient)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>
                  {formatBTC(amountSats)} BTC ({formatSats(amountSats)} sats)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee rate</span>
                <span>{effectiveFeeRate} sat/vB</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              {loading ? (
                <div className="flex-1">
                  <LoadingSpinner text="Broadcasting..." />
                </div>
              ) : (
                <Button
                  className="flex-1"
                  onClick={handleBroadcast}
                >
                  Confirm and Send
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Send Bitcoin</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            Send Transaction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleBuildTransaction()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="recipient-address">Recipient Address</Label>
              <Input
                id="recipient-address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="bc1q..."
                disabled={loading}
              />
              {recipient && !addressValid && (
                <p className="text-xs text-destructive">
                  Invalid address for {networkMode}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-amount">
                  Amount ({amountUnit === 'btc' ? 'BTC' : 'sats'})
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAmountUnit((u) => (u === 'btc' ? 'sats' : 'btc'))
                  }
                  className="h-auto py-0 text-xs"
                >
                  Switch to {amountUnit === 'btc' ? 'sats' : 'BTC'}
                </Button>
              </div>
              <Input
                id="send-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amountUnit === 'btc' ? '0.00000000' : '0'}
                step={amountUnit === 'btc' ? '0.00000001' : '1'}
                min="0"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatBTC(confirmedBalance)} BTC (
                {formatSats(confirmedBalance)} sats)
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                Fee Rate (sat/vB)
              </Label>
              <p className="text-xs text-muted-foreground">
                Static presets for now. Dynamic fee estimation will be added later.
              </p>
              <div className="flex gap-2">
                {FEE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={
                      !useCustomFee && feeRate === preset.rate
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setFeeRate(preset.rate)
                      setUseCustomFee(false)
                    }}
                  >
                    {preset.label} ({preset.rate})
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={useCustomFee ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUseCustomFee(true)}
                >
                  Custom
                </Button>
              </div>
              {useCustomFee && (
                <Input
                  type="number"
                  value={customFeeRate}
                  onChange={(e) => setCustomFeeRate(e.target.value)}
                  placeholder="Custom fee rate"
                  min="1"
                  disabled={loading}
                />
              )}
            </div>

            {loading ? (
              <LoadingSpinner text="Building transaction..." />
            ) : (
              <Button
                type="submit"
                className="w-full"
                disabled={!canBuild}
              >
                Review Transaction
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
