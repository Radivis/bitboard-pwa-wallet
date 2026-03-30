import { useState, useCallback, useMemo } from 'react'
import { Zap, Trash2, Eye, EyeOff, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { useLnWalletBalanceQuery, useTestConnectionMutation } from '@/hooks/useLightningMutations'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'

function WalletRow({
  wallet,
  isActive,
  onSetActive,
  onRemove,
}: {
  wallet: ConnectedLightningWallet
  isActive: boolean
  onSetActive: () => void
  onRemove: () => void
}) {
  const balanceQuery = useLnWalletBalanceQuery(wallet.config)

  return (
    <div
      className={`flex items-center justify-between rounded-md border p-3 transition-colors ${
        isActive ? 'border-primary bg-primary/5' : ''
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col gap-1 text-left"
        onClick={onSetActive}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{wallet.label}</p>
          <Badge variant="outline" className="text-xs">
            {wallet.config.type === 'lnbits' ? 'LNBits' : wallet.config.type}
          </Badge>
          {isActive && (
            <Badge variant="default" className="text-xs">
              Active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {balanceQuery.isPending ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading balance...
            </span>
          ) : balanceQuery.isError ? (
            <span className="text-destructive">Connection error</span>
          ) : (
            <span>{balanceQuery.data.balanceSats.toLocaleString()} sats</span>
          )}
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label={`Remove ${wallet.label}`}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
}

function ConnectWalletForm({ onConnected }: { onConnected: () => void }) {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const addConnection = useLightningStore((s) => s.addConnection)

  const [label, setLabel] = useState('')
  const [lnbitsUrl, setLnbitsUrl] = useState('')
  const [adminApiKey, setAdminApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const testMutation = useTestConnectionMutation()

  const canTest = lnbitsUrl.trim().length > 0 && adminApiKey.trim().length > 0
  const testSucceeded = testMutation.isSuccess && testMutation.data.ok
  const canSave = canTest && label.trim().length > 0 && testSucceeded

  const handleTestConnection = useCallback(() => {
    if (!canTest) return
    testMutation.mutate({
      type: 'lnbits',
      url: lnbitsUrl.trim(),
      adminApiKey: adminApiKey.trim(),
    })
  }, [canTest, lnbitsUrl, adminApiKey, testMutation])

  const handleSave = useCallback(() => {
    if (!canSave || activeWalletId == null) return
    addConnection({
      walletId: activeWalletId,
      label: label.trim(),
      config: {
        type: 'lnbits',
        url: lnbitsUrl.trim(),
        adminApiKey: adminApiKey.trim(),
      },
    })
    toast.success(`Lightning wallet "${label.trim()}" connected`)
    setLabel('')
    setLnbitsUrl('')
    setAdminApiKey('')
    testMutation.reset()
    onConnected()
  }, [canSave, activeWalletId, label, lnbitsUrl, adminApiKey, addConnection, testMutation, onConnected])

  const resetTest = useCallback(() => {
    if (testMutation.isSuccess || testMutation.isError) {
      testMutation.reset()
    }
  }, [testMutation])

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="text-sm font-medium">Connect Lightning Wallet</h4>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <div className="flex gap-2">
            <Button variant="default" size="sm" className="flex-1" disabled>
              LNBits
            </Button>
            <Button variant="outline" size="sm" className="flex-1" disabled>
              NWC (coming soon)
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="ln-wallet-label">Label</Label>
          <Input
            id="ln-wallet-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My Demo Wallet"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="lnbits-url">LNBits URL</Label>
          <Input
            id="lnbits-url"
            value={lnbitsUrl}
            onChange={(e) => {
              setLnbitsUrl(e.target.value)
              resetTest()
            }}
            placeholder="https://demo.lnbits.com"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="lnbits-api-key">Admin API Key</Label>
          <div className="flex gap-2">
            <Input
              id="lnbits-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={adminApiKey}
              onChange={(e) => {
                setAdminApiKey(e.target.value)
                resetTest()
              }}
              placeholder="your-admin-key"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowApiKey((prev) => !prev)}
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {testSucceeded && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Connected to &ldquo;{testMutation.data.walletName}&rdquo;
          </div>
        )}
        {testMutation.isSuccess && !testMutation.data.ok && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            {testMutation.data.error}
          </div>
        )}
        {testMutation.isError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            {testMutation.error instanceof Error
              ? testMutation.error.message
              : 'Connection test failed'}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleTestConnection}
            disabled={!canTest || testMutation.isPending}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Wifi className="mr-2 h-4 w-4" />
                Test Connection
              </>
            )}
          </Button>
          <Button
            className="flex-1"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

export function LightningWallets() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const connectedWallets = useLightningStore((s) => s.connectedWallets)
  const activeConnectionIds = useLightningStore((s) => s.activeConnectionIds)

  const connections = useMemo(
    () =>
      activeWalletId != null
        ? connectedWallets.filter((w) => w.walletId === activeWalletId)
        : [],
    [connectedWallets, activeWalletId],
  )
  const activeConnectionId =
    activeWalletId != null ? activeConnectionIds[activeWalletId] : undefined
  const setActiveConnection = useLightningStore((s) => s.setActiveConnection)
  const removeConnection = useLightningStore((s) => s.removeConnection)

  const [showConnectForm, setShowConnectForm] = useState(false)

  if (activeWalletId == null) return null

  const hasConnections = connections.length > 0

  return (
    <InfomodeWrapper
      infoId="management-lightning-wallets-card"
      infoTitle="Connected Lightning wallets"
      infoText="A connected Lightning wallet lets you send and receive Lightning payments. It connects your Bitboard wallet to a Lightning backend like LNBits. Your Lightning wallet manages channels and routing for you, so you can focus on sending and receiving. You can connect multiple Lightning wallets and switch between them."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lightning Wallets
          </CardTitle>
          <CardDescription>
            Manage Lightning wallet connections for this Bitcoin wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasConnections && (
            <div className="space-y-2">
              {connections.map((wallet) => (
                <WalletRow
                  key={wallet.id}
                  wallet={wallet}
                  isActive={wallet.id === activeConnectionId}
                  onSetActive={() =>
                    setActiveConnection(activeWalletId, wallet.id)
                  }
                  onRemove={() => removeConnection(wallet.id)}
                />
              ))}
            </div>
          )}

          {!hasConnections && !showConnectForm && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                No Lightning wallet connected yet. Connect one to start sending
                and receiving Lightning payments.
              </p>
            </div>
          )}

          {showConnectForm ? (
            <ConnectWalletForm
              onConnected={() => setShowConnectForm(false)}
            />
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowConnectForm(true)}
            >
              <Zap className="mr-2 h-4 w-4" />
              Connect Lightning Wallet
            </Button>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
