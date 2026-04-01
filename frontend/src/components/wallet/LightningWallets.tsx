import { useState, useCallback, useMemo } from 'react'
import { Zap, Trash2, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useLightningStore } from '@/stores/lightningStore'
import { NETWORK_LABELS, useWalletStore } from '@/stores/walletStore'
import {
  useLnWalletBalanceQuery,
  useLnWalletNetworkPlausibilityQuery,
  useTestConnectionMutation,
} from '@/hooks/useLightningMutations'
import { Link } from '@tanstack/react-router'
import { isValidNwcConnectionString } from '@/lib/lightning-backend-service'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
import {
  LIGHTNING_NETWORK_MODES,
  defaultLightningNetworkForAppMode,
  type LightningNetworkMode,
} from '@/lib/lightning-utils'
import { NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE } from '@/lib/bitcoin-utils'

const WALLET_TYPE_LABELS: Record<string, string> = {
  nwc: 'NWC',
}

function walletTypeBadgeLabel(type: string): string {
  return WALLET_TYPE_LABELS[type] ?? type
}

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
  const plausibilityQuery = useLnWalletNetworkPlausibilityQuery(wallet)
  const showNetworkMismatch =
    plausibilityQuery.isSuccess &&
    plausibilityQuery.data.probableMismatch

  return (
    <div
      className={`flex items-start justify-between gap-2 rounded-md border p-3 transition-colors ${
        isActive ? 'border-primary bg-primary/5' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <button
          type="button"
          className="flex w-full flex-col gap-1 text-left"
          onClick={onSetActive}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{wallet.label}</p>
            <Badge variant="outline" className="text-xs">
              {NETWORK_LABELS[wallet.networkMode]}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {walletTypeBadgeLabel(wallet.config.type)}
            </Badge>
            {isActive && (
              <Badge variant="default" className="text-xs">
                Active
              </Badge>
            )}
            {showNetworkMismatch && (
              <Badge variant="destructive" className="text-xs">
                Probable network mismatch
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
        {showNetworkMismatch && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The Lightning wallet&apos;s block height differs from your Esplora
            tip by more than {NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE} blocks. Confirm
            this NWC wallet runs on the same chain as the Esplora endpoint for{' '}
            {NETWORK_LABELS[wallet.networkMode]} in{' '}
            <Link to="/settings" className="font-medium underline">
              Settings
            </Link>
            .
          </p>
        )}
      </div>
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
  const appNetworkMode = useWalletStore((s) => s.networkMode)
  const addConnection = useLightningStore((s) => s.addConnection)

  const [label, setLabel] = useState('')
  const [connectionString, setConnectionString] = useState('')
  const [lnNetwork, setLnNetwork] = useState<LightningNetworkMode>(() =>
    defaultLightningNetworkForAppMode(appNetworkMode),
  )

  const testMutation = useTestConnectionMutation()

  const connectionStringValid = isValidNwcConnectionString(connectionString.trim())
  const canTest = connectionStringValid
  const testSucceeded = testMutation.isSuccess && testMutation.data.ok
  const canSave = canTest && label.trim().length > 0 && testSucceeded

  const handleTestConnection = useCallback(async () => {
    if (!canTest) return
    const result = await testMutation.mutateAsync({
      type: 'nwc',
      connectionString: connectionString.trim(),
    })
    if (result.ok && label.trim() === '' && result.walletName) {
      setLabel(result.walletName)
    }
  }, [canTest, connectionString, testMutation, label])

  const handleSave = useCallback(() => {
    if (!canSave || activeWalletId == null) return
    addConnection({
      walletId: activeWalletId,
      label: label.trim(),
      networkMode: lnNetwork,
      config: {
        type: 'nwc',
        connectionString: connectionString.trim(),
      },
    })
    toast.success(`Lightning wallet "${label.trim()}" connected`)
    setLabel('')
    setConnectionString('')
    setLnNetwork(defaultLightningNetworkForAppMode(appNetworkMode))
    testMutation.reset()
    onConnected()
  }, [
    canSave,
    activeWalletId,
    label,
    connectionString,
    lnNetwork,
    appNetworkMode,
    addConnection,
    testMutation,
    onConnected,
  ])

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
              NWC
            </Button>
            <Button variant="outline" size="sm" className="flex-1" disabled>
              App-internal node (coming soon)
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="ln-network">
            Lightning network <span className="text-destructive">*</span>
          </Label>
          <select
            id="ln-network"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={lnNetwork}
            onChange={(e) => {
              setLnNetwork(e.target.value as LightningNetworkMode)
              resetTest()
            }}
          >
            {LIGHTNING_NETWORK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {NETWORK_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Must match this wallet&apos;s Lightning network and your app network mode
            when sending or receiving.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="nwc-connection-string">NWC Connection String</Label>
          <Input
            id="nwc-connection-string"
            value={connectionString}
            onChange={(e) => {
              setConnectionString(e.target.value)
              resetTest()
            }}
            placeholder="nostr+walletconnect://..."
          />
          {connectionString.trim().length > 0 && !connectionStringValid && (
            <p className="text-xs text-destructive">
              Must start with nostr+walletconnect://
            </p>
          )}
        </div>

        {testSucceeded && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Connected to &ldquo;{testMutation.data.walletName}&rdquo;
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="ln-wallet-label">
            Label <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ln-wallet-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My Lightning Wallet"
          />
          {testSucceeded && label.trim().length === 0 && (
            <p className="text-xs text-muted-foreground">
              Enter a label to save this connection
            </p>
          )}
        </div>
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
  const setActiveConnection = useLightningStore((s) => s.setActiveConnection)
  const removeConnection = useLightningStore((s) => s.removeConnection)

  const [showConnectForm, setShowConnectForm] = useState(false)

  if (activeWalletId == null) return null

  const hasConnections = connections.length > 0

  return (
    <InfomodeWrapper
      infoId="management-lightning-wallets-card"
      infoTitle="Connected Lightning wallets"
      infoText="A connected Lightning wallet lets you send and receive Lightning payments. It uses Nostr Wallet Connect (NWC) to link your Bitboard wallet to any compatible Lightning wallet — such as Alby Hub, Mutiny, or Primal. Your Lightning wallet manages channels and routing for you, so you can focus on sending and receiving. You can connect multiple Lightning wallets and switch between them."
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
                  isActive={
                    wallet.id ===
                    activeConnectionIds[activeWalletId]?.[wallet.networkMode]
                  }
                  onSetActive={() =>
                    setActiveConnection(
                      activeWalletId,
                      wallet.networkMode,
                      wallet.id,
                    )
                  }
                  onRemove={() => removeConnection(wallet.id)}
                />
              ))}
            </div>
          )}

          {!hasConnections && !showConnectForm && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                No Lightning wallet connected yet. Connect one via NWC to start
                sending and receiving Lightning payments.
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
