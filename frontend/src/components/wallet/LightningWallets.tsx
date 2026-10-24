import { useState, useCallback, useMemo, useEffect } from 'react'
import { Zap, Trash2, Pencil, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { DesignButton } from '@/components/design/DesignButton'
import { designDestructiveIconClassName } from '@/components/design/design-classes'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { NwcWalletOptionsInfomodeContent } from '@/components/wallet/NwcWalletOptionsInfomodeContent'
import { useInfomodeStore } from '@/stores/infomodeStore'
import { useLightningStore } from '@/stores/lightningStore'
import { NETWORK_LABELS, useWalletStore } from '@/stores/walletStore'
import {
  useLnWalletBalanceQuery,
  useLnWalletNetworkPlausibilityQuery,
  useTestConnectionMutation,
} from '@/hooks/useLightningMutations'
import { Link } from '@tanstack/react-router'
import { isValidNwcConnectionString } from '@/lib/lightning/lightning-backend-service'
import {
  MAX_LIGHTNING_WALLET_LABEL_LENGTH,
  MAX_NWC_CONNECTION_STRING_LENGTH,
} from '@/lib/lightning/lightning-input-limits'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE } from '@/lib/wallet/bitcoin-utils'
import { getPrefixedBitcoinDisplayUnitLabel } from '@/lib/wallet/bitcoin-display-unit'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const WALLET_TYPE_LABELS: Record<string, string> = {
  nwc: 'NWC',
}

function walletTypeBadgeLabel(type: string): string {
  return WALLET_TYPE_LABELS[type] ?? type
}

function RenameLightningWalletDialog({
  wallet,
  open,
  onOpenChange,
}: {
  wallet: ConnectedLightningWallet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const renameConnection = useLightningStore((lightningState) => lightningState.renameConnection)
  const [draftLabel, setDraftLabel] = useState('')
  const [savePending, setSavePending] = useState(false)

  const trimmedDraft = draftLabel.trim()
  const storedTrimmed = wallet.label.trim()
  const lengthValid =
    trimmedDraft.length > 0 &&
    trimmedDraft.length <= MAX_LIGHTNING_WALLET_LABEL_LENGTH
  const canSave =
    lengthValid && trimmedDraft !== storedTrimmed && !savePending

  useEffect(() => {
    if (open) {
      setDraftLabel(wallet.label)
    }
  }, [open, wallet.id, wallet.label])

  const handleSave = async () => {
    if (!canSave) return
    setSavePending(true)
    try {
      await renameConnection({
        connectionId: wallet.id,
        newLabel: draftLabel,
      })
      toast.success('Lightning wallet renamed')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to rename Lightning wallet',
      )
    } finally {
      setSavePending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Lightning wallet</DialogTitle>
          <DialogDescription>
            Choose a unique label. Names reserved for automatic labels are not
            allowed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`ln-rename-${wallet.id}`}>Label</Label>
          <DesignInput
            id={`ln-rename-${wallet.id}`}
            value={draftLabel}
            maxLength={MAX_LIGHTNING_WALLET_LABEL_LENGTH}
            onChange={(e) => setDraftLabel(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <DesignButton
            type="button"
            appearance="secondary"
            onClick={() => onOpenChange(false)}
            disabled={savePending}
          >
            Cancel
          </DesignButton>
          <DesignButton
            type="button"
            disabled={!canSave}
            onClick={() => void handleSave()}
            icon={savePending ? <Loader2 className="animate-spin" /> : undefined}
          >
            {savePending ? 'Saving…' : 'Save'}
          </DesignButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const [renameOpen, setRenameOpen] = useState(false)
  const balanceQuery = useLnWalletBalanceQuery({
    connectionId: wallet.id,
    walletId: wallet.walletId,
    networkMode: wallet.networkMode,
    config: wallet.config,
  })
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
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {balanceQuery.isPending ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading balance...
              </span>
            ) : balanceQuery.isError ? (
              <span className="text-destructive">Connection error</span>
            ) : (
              <>
                <span>
                  <span className="design-mono tabular-nums">
                    {balanceQuery.data.balanceSats.toLocaleString()}{' '}
                    {getPrefixedBitcoinDisplayUnitLabel('sat', wallet.networkMode)}
                  </span>
                  {balanceQuery.data.isStaleBalance ? (
                    <span className="ml-1.5 text-amber-700 dark:text-amber-400">
                      (cached)
                    </span>
                  ) : null}
                </span>
                {balanceQuery.data.isStaleBalance &&
                  balanceQuery.data.balanceSnapshotAt != null && (
                    <span className="text-[11px] text-amber-700/90 dark:text-amber-400/90">
                      Last saved in this app:{' '}
                      {new Date(
                        balanceQuery.data.balanceSnapshotAt,
                      ).toLocaleString()}
                    </span>
                  )}
              </>
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
      <div className="flex shrink-0 gap-1">
        <DesignButton
          appearance="tertiary"
          onClick={(e) => {
            e.stopPropagation()
            setRenameOpen(true)
          }}
          aria-label={`Rename ${wallet.label}`}
          icon={<Pencil />}
        />
        <DesignButton
          appearance="tertiary"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove ${wallet.label}`}
          icon={<Trash2 className={designDestructiveIconClassName} />}
        />
      </div>
      <RenameLightningWalletDialog
        wallet={wallet}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
    </div>
  )
}

function ConnectWalletForm({ onConnected }: { onConnected: () => void }) {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const addConnection = useLightningStore((lightningState) => lightningState.addConnection)
  const isInfomodeActive = useInfomodeStore((infomodeState) => infomodeState.isActive)

  const [label, setLabel] = useState('')
  const [connectionString, setConnectionString] = useState('')

  const testMutation = useTestConnectionMutation()

  const connectionStringValid = isValidNwcConnectionString(connectionString.trim())
  const canTest = connectionStringValid
  const testSucceeded =
    testMutation.isSuccess && testMutation.data?.ok === true
  const canSave =
    canTest && testSucceeded && testMutation.data?.ok === true

  const handleTestConnection = useCallback(async () => {
    if (!canTest) return
    await testMutation.mutateAsync({
      type: 'nwc',
      connectionString: connectionString.trim(),
    })
  }, [canTest, connectionString, testMutation])

  const handleSave = useCallback(async () => {
    const testData = testMutation.data
    if (!canSave || activeWalletId == null || testData?.ok !== true) return
    try {
      const { label: savedLabel } = await addConnection({
        walletId: activeWalletId,
        label: label.trim(),
        networkMode: testData.lightningNetworkMode,
        config: {
          type: 'nwc',
          connectionString: connectionString.trim(),
        },
      })
      toast.success(`Lightning wallet "${savedLabel}" connected`)
      setLabel('')
      setConnectionString('')
      testMutation.reset()
      onConnected()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Lightning connection')
    }
  }, [canSave, activeWalletId, label, connectionString, testMutation, addConnection, onConnected])

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <InfomodeWrapper
              infoId="connect-lightning-nwc-type"
              infoComponent={NwcWalletOptionsInfomodeContent}
              className="min-w-0 w-full sm:flex-1"
            >
              <DesignButton
                className="w-full"
                type="button"
                disabled={!isInfomodeActive}
                aria-label={
                  isInfomodeActive
                    ? 'NWC — open wallet guide'
                    : 'NWC (turn on Infomode in the header to open the wallet guide)'
                }
                title={
                  isInfomodeActive
                    ? 'Open NWC-compatible wallet guide'
                    : 'Turn on Infomode (header) to tap here for the wallet guide'
                }
              >
                NWC
              </DesignButton>
            </InfomodeWrapper>
            <InfomodeWrapper
              infoId="connect-lightning-app-internal-type"
              infoTitle="App-internal Lightning (planned)"
              infoText="This mode will implement a fully Bitboard-internal Lightning wallet: channels and keys live in the app instead of an external wallet over NWC. That can be a simple way to get started with everything in one place, but the caveats are serious. Lightning requires you to react to certain on-chain events in time; without connecting to a watchtower service that monitors the chain on your behalf, you would need to log into Bitboard on your own about once a day to review and act on time-critical transactions—until watchtower support exists or you use another connection mode."
              className="min-w-0 w-full sm:flex-1"
            >
              <DesignButton
                appearance="secondary"
                className="w-full"
                type="button"
                disabled={!isInfomodeActive}
                aria-label={
                  isInfomodeActive
                    ? 'App-internal node (coming soon) — open explanation'
                    : 'App-internal node (turn on Infomode in the header for details)'
                }
                title={
                  isInfomodeActive
                    ? 'Planned: in-app Lightning wallet — tap for risks and expectations'
                    : 'Turn on Infomode (header) to read about the planned app-internal mode'
                }
              >
                App-internal node (coming soon)
              </DesignButton>
            </InfomodeWrapper>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="nwc-connection-string">NWC Connection String</Label>
          <DesignInput
            id="nwc-connection-string"
            value={connectionString}
            maxLength={MAX_NWC_CONNECTION_STRING_LENGTH}
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

        {testSucceeded && testMutation.data.ok && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Connected to &ldquo;{testMutation.data.walletName}&rdquo;
            </div>
            <p className="text-xs text-muted-foreground">
              Network reported by wallet:{' '}
              {NETWORK_LABELS[testMutation.data.lightningNetworkMode]}
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="ln-wallet-label">Label</Label>
          <DesignInput
            id="ln-wallet-label"
            value={label}
            maxLength={MAX_LIGHTNING_WALLET_LABEL_LENGTH}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My Lightning Wallet"
          />
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
          <DesignButton
            appearance="secondary"
            className="flex-1"
            onClick={handleTestConnection}
            disabled={!canTest || testMutation.isPending}
            icon={
              testMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Wifi />
              )
            }
          >
            {testMutation.isPending ? 'Testing...' : 'Test Connection'}
          </DesignButton>
          <DesignButton
            className="flex-1"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save
          </DesignButton>
        </div>
      </div>
    </div>
  )
}

export function LightningWallets() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const connectedWallets = useLightningStore((lightningState) => lightningState.connectedWallets)
  const activeConnectionIds = useLightningStore((lightningState) => lightningState.activeConnectionIds)

  const connections = useMemo(
    () =>
      activeWalletId != null
        ? connectedWallets.filter((w) => w.walletId === activeWalletId)
        : [],
    [connectedWallets, activeWalletId],
  )
  const setActiveConnection = useLightningStore((lightningState) => lightningState.setActiveConnection)
  const removeConnection = useLightningStore((lightningState) => lightningState.removeConnection)

  const [showConnectForm, setShowConnectForm] = useState(false)

  if (activeWalletId == null) return null

  const hasConnections = connections.length > 0

  return (
    <InfomodeWrapper
      infoId="management-lightning-wallets-card"
      infoTitle="Connected Lightning wallets"
      infoText="A connected Lightning wallet lets you send and receive Lightning payments. It uses Nostr Wallet Connect (NWC) to link your Bitboard wallet to any compatible Lightning wallet. Your Lightning wallet manages channels and routing for you, so you can focus on sending and receiving. You can connect multiple Lightning wallets and switch between them. With Infomode on, tap the NWC type control in Connect Lightning Wallet to open a short guide with links to Library articles on popular NWC wallets, or tap App-internal node (coming soon) to read about the planned in-app Lightning mode and its risks."
      className="rounded-xl"
    >
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lightning Wallets
          </DesignCardTitle>
          <DesignCardDescription>
            Manage Lightning wallet connections for this Bitcoin wallet.
          </DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent className="space-y-4">
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
                  onRemove={() => {
                    void removeConnection(wallet.id).catch((err) => {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : 'Failed to remove Lightning connection',
                      )
                    })
                  }}
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
            <DesignButton
              appearance="secondary"
              className="w-full"
              onClick={() => setShowConnectForm(true)}
              icon={<Zap />}
            >
              Connect Lightning Wallet
            </DesignButton>
          )}
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}
