import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Sun, Moon, Monitor, Lock, Eye, EyeOff, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import {
  useWalletStore,
  NETWORK_LABELS,
  getSubWalletLabel,
  type NetworkMode,
  type AddressType,
} from '@/stores/walletStore'
import { useWallets } from '@/db'
import { useSessionStore, clearAutoLockTimer } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { getDatabase, ensureMigrated, loadWalletSecrets } from '@/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { MnemonicGrid } from '@/components/MnemonicGrid'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { DEFAULT_ESPLORA_URLS, toBitcoinNetwork } from '@/lib/bitcoin-utils'
import {
  saveCustomEsploraUrl,
  deleteCustomEsploraUrl,
  loadCustomEsploraUrl,
  syncActiveWalletAndUpdateState,
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet-utils'
import {
  resolveDescriptorWallet,
  updateDescriptorWalletChangeset,
} from '@/lib/descriptor-wallet-manager'
import { Link } from '@tanstack/react-router'
import { initLabWorkerWithState, terminateLabWorker } from '@/workers/lab-factory'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const NETWORK_OPTIONS: NetworkMode[] = [
  'mainnet',
  'testnet',
  'signet',
  'regtest',
  'lab',
]

/**
 * Switch the active descriptor wallet to match the new parameters.
 * Saves the current WASM wallet state, resolves the new descriptor wallet,
 * loads it into WASM, and syncs.
 *
 * @param currentNetworkMode - The network we're switching FROM (must be captured before setNetworkMode)
 * @param currentAddressType - The address type we're switching FROM (must be captured before setAddressType)
 * @param currentAccountId - The account we're switching FROM
 */
async function switchDescriptorWallet(
  targetNetworkMode: NetworkMode,
  targetAddressType: AddressType,
  targetAccountId: number,
  currentNetworkMode: NetworkMode,
  currentAddressType: AddressType,
  currentAccountId: number,
) {
  const { activeWalletId } = useWalletStore.getState()
  const sessionPassword = useSessionStore.getState().password
  if (!activeWalletId || !sessionPassword) return

  const { exportChangeset, loadWallet, getCurrentAddress } =
    useCryptoStore.getState()
  const { setWalletStatus, setCurrentAddress } = useWalletStore.getState()

  const previousSubWalletLabel = getSubWalletLabel(
    currentNetworkMode,
    currentAddressType,
  )
  const targetSubWalletLabel = getSubWalletLabel(
    targetNetworkMode,
    targetAddressType,
  )

  try {
    toast.info(`Unloading ${previousSubWalletLabel} sub-wallet`)
    // Save current WASM wallet state before switching (use current params, not target)
    try {
      const currentChangeset = await exportChangeset()
      await updateDescriptorWalletChangeset(
        sessionPassword,
        activeWalletId,
        toBitcoinNetwork(currentNetworkMode),
        currentAddressType,
        currentAccountId,
        currentChangeset,
      )
      toast.success(`${previousSubWalletLabel} sub-wallet unloaded`)
    } catch {
      // No active WASM wallet yet (e.g., first load) -- safe to skip
    }

    toast.info(`Loading ${targetSubWalletLabel} sub-wallet`)
    const targetNetwork = toBitcoinNetwork(targetNetworkMode)
    const descriptorWallet = await resolveDescriptorWallet(
      sessionPassword,
      activeWalletId,
      targetNetwork,
      targetAddressType,
      targetAccountId,
    )

    await loadWallet(
      descriptorWallet.externalDescriptor,
      descriptorWallet.internalDescriptor,
      targetNetwork,
      descriptorWallet.changeSet,
    )

    const address = await getCurrentAddress()
    setCurrentAddress(address)
    setWalletStatus('syncing')
    try {
      await syncActiveWalletAndUpdateState(targetNetworkMode)
    } catch {
      toast.error('Sync failed after switching')
    }
    setWalletStatus('unlocked')
    toast.success(`${targetSubWalletLabel} sub-wallet loaded`)
  } catch (err) {
    const message = toUserFriendlySwitchError(err)
    toast.error(message)
  }
}

function toUserFriendlySwitchError(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  if (
    msg.includes('password') ||
    msg.includes('decrypt') ||
    msg.includes('incorrect') ||
    msg.includes('corrupted')
  ) {
    return 'Wrong password or corrupted wallet data'
  }
  if (msg.includes('secrets') && msg.includes('not found')) {
    return 'Wallet data not found'
  }
  return 'Failed to switch descriptor wallet'
}

function NetworkSelector() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const setNetworkMode = useWalletStore((s) => s.setNetworkMode)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const [switching, setSwitching] = useState(false)

  const setAddressType = useWalletStore((s) => s.setAddressType)

  const handleNetworkChange = useCallback(
    async (network: NetworkMode) => {
      if (network === networkMode) return
      const previousNetworkMode = networkMode

      if (network === 'lab') {
        setNetworkMode(network)
        setSwitching(true)
        try {
          terminateLabWorker()
          if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
            const sessionPassword = useSessionStore.getState().password
            const activeWalletId = useWalletStore.getState().activeWalletId
            if (sessionPassword && activeWalletId) {
              const { exportChangeset } = useCryptoStore.getState()
              try {
                const currentChangeset = await exportChangeset()
                await updateDescriptorWalletChangeset(
                  sessionPassword,
                  activeWalletId,
                  toBitcoinNetwork(previousNetworkMode),
                  addressType,
                  accountId,
                  currentChangeset,
                )
              } catch {
                // No active WASM wallet yet (e.g., first load) -- safe to skip
              }
              await loadDescriptorWalletWithoutSync(
                sessionPassword,
                activeWalletId,
                'lab',
                addressType,
                accountId,
              )
            }
          }
          await initLabWorkerWithState()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to start lab')
        } finally {
          setSwitching(false)
        }
        return
      }

      if (previousNetworkMode === 'lab') {
        terminateLabWorker()
      }

      setNetworkMode(network)

      if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
        setSwitching(true)
        try {
          await switchDescriptorWallet(
            network,
            addressType,
            accountId,
            previousNetworkMode,
            addressType,
            accountId,
          )
        } finally {
          setSwitching(false)
        }
      }
    },
    [networkMode, setNetworkMode, setAddressType, walletStatus, addressType, accountId],
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {NETWORK_OPTIONS.map((network) => (
          <Button
            key={network}
            variant={networkMode === network ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleNetworkChange(network)}
            disabled={switching}
          >
            {NETWORK_LABELS[network]}
          </Button>
        ))}
      </div>
      {networkMode === 'lab' && (
        <div>
          <Link to="/lab">
            <Button variant="outline" size="sm">
              Manage lab
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function ThemeSelector() {
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)

  return (
    <div className="flex flex-wrap gap-2">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={themeMode === value ? 'default' : 'outline'}
          size="sm"
          onClick={() => setThemeMode(value)}
          className="gap-2"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  )
}

function AddressTypeSelector() {
  const addressType = useWalletStore((s) => s.addressType)
  const setAddressType = useWalletStore((s) => s.setAddressType)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const networkMode = useWalletStore((s) => s.networkMode)
  const accountId = useWalletStore((s) => s.accountId)
  const [showWarning, setShowWarning] = useState(false)
  const [pendingType, setPendingType] = useState<'taproot' | 'segwit' | null>(null)
  const [switching, setSwitching] = useState(false)

  const handleChange = (type: 'taproot' | 'segwit') => {
    if (type === addressType) return
    if (activeWalletId) {
      setPendingType(type)
      setShowWarning(true)
    } else {
      setAddressType(type)
    }
  }

  const applyAddressTypeChange = useCallback(
    async (type: AddressType) => {
      const previousAddressType = addressType
      setAddressType(type)

      if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
        setSwitching(true)
        try {
          await switchDescriptorWallet(
            networkMode,
            type,
            accountId,
            networkMode,
            previousAddressType,
            accountId,
          )
        } finally {
          setSwitching(false)
        }
      }
    },
    [setAddressType, walletStatus, networkMode, addressType, accountId],
  )

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant={addressType === 'taproot' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleChange('taproot')}
          className="flex-1"
          disabled={switching}
        >
          Taproot (BIP86)
        </Button>
        <Button
          variant={addressType === 'segwit' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleChange('segwit')}
          className="flex-1"
          disabled={switching}
        >
          SegWit (BIP84)
        </Button>
      </div>
      <ConfirmationDialog
        open={showWarning}
        title="Change Address Type?"
        message="Changing address type will switch to a different descriptor wallet derived from the same seed. Your funds on the previous address type remain accessible. Continue?"
        confirmText="Change"
        onConfirm={() => {
          if (pendingType) applyAddressTypeChange(pendingType)
          setShowWarning(false)
          setPendingType(null)
        }}
        onCancel={() => {
          setShowWarning(false)
          setPendingType(null)
        }}
      />
    </>
  )
}

function EsploraEndpointConfig() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const [customUrl, setCustomUrl] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCustomEsploraUrl(networkMode).then((url) => {
      if (url) {
        setCustomUrl(url)
        setIsCustom(true)
      } else {
        setCustomUrl(DEFAULT_ESPLORA_URLS[networkMode])
        setIsCustom(false)
      }
    })
  }, [networkMode])

  const handleSave = useCallback(async () => {
    try {
      setLoading(true)
      await saveCustomEsploraUrl(networkMode, customUrl)
      setIsCustom(true)
      toast.success('Esplora endpoint saved')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save endpoint',
      )
    } finally {
      setLoading(false)
    }
  }, [networkMode, customUrl])

  const handleReset = useCallback(async () => {
    try {
      setLoading(true)
      await deleteCustomEsploraUrl(networkMode)
      setCustomUrl(DEFAULT_ESPLORA_URLS[networkMode])
      setIsCustom(false)
      toast.success('Reset to default endpoint')
    } catch {
      toast.error('Failed to reset endpoint')
    } finally {
      setLoading(false)
    }
  }, [networkMode])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Esplora Endpoint for {NETWORK_LABELS[networkMode]}
          </CardTitle>
          {isCustom && <Badge variant="secondary">Custom</Badge>}
        </div>
        <CardDescription>
          Network-specific: changing network will use the endpoint configured for
          that network.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="esplora-url">Endpoint URL</Label>
          <Input
            id="esplora-url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={DEFAULT_ESPLORA_URLS[networkMode]}
            disabled={loading}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading} size="sm">
            Save Endpoint
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={loading || !isCustom}
            size="sm"
          >
            Reset to Default
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SeedPhraseBackup() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [promptPassword, setPromptPassword] = useState('')
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleShowSeedPhrase = useCallback(async () => {
    if (!activeWalletId) return
    try {
      setLoading(true)
      setError(null)
      await ensureMigrated()
      const db = getDatabase()
      const secrets = await loadWalletSecrets(db, promptPassword, activeWalletId)
      setMnemonicWords(secrets.mnemonic.split(' '))
      setShowPasswordPrompt(false)
      setShowMnemonic(true)
      setPromptPassword('')
    } catch {
      setError('Wrong password')
    } finally {
      setLoading(false)
    }
  }, [activeWalletId, promptPassword])

  if (!activeWalletId) return null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Seed Phrase Backup
          </CardTitle>
          <CardDescription>
            View your seed phrase to back up your wallet. You will need to
            confirm your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => setShowPasswordPrompt(true)}
          >
            Show Seed Phrase
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={showPasswordPrompt}
        onOpenChange={(open) => {
          if (!open) {
            setShowPasswordPrompt(false)
            setPromptPassword('')
            setError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Password</DialogTitle>
            <DialogDescription>
              Enter your wallet password to view your seed phrase.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleShowSeedPhrase()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="backup-password">Password</Label>
              <Input
                id="backup-password"
                type="password"
                value={promptPassword}
                onChange={(e) => setPromptPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!promptPassword || loading}
            >
              {loading ? 'Decrypting...' : 'Confirm'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showMnemonic}
        onOpenChange={(open) => {
          if (!open) {
            setShowMnemonic(false)
            setMnemonicWords([])
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5" />
              Your Seed Phrase
            </DialogTitle>
            <DialogDescription>
              Never share these words. Anyone with them can access your funds.
            </DialogDescription>
          </DialogHeader>
          <MnemonicGrid
            words={mnemonicWords}
            columns={mnemonicWords.length > 12 ? 4 : 3}
          />
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            Never share these words with anyone. Anyone who has them can steal
            your funds.
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setShowMnemonic(false)
              setMnemonicWords([])
            }}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function WalletManagement() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const lockWallet = useWalletStore((s) => s.lockWallet)
  const terminateWorker = useCryptoStore((s) => s.terminateWorker)
  const clearSession = useSessionStore((s) => s.clear)
  const { data: wallets } = useWallets()
  const hasMultipleWallets = (wallets?.length ?? 0) > 1

  if (!activeWalletId) return null

  const handleLockWallet = () => {
    lockWallet()
    terminateWorker()
    clearSession()
    clearAutoLockTimer()
    toast.success('Wallet locked')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Wallet Management
        </CardTitle>
        <CardDescription>
          Lock your wallet to require a password for the next access, or switch
          between multiple wallets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate({ to: '/setup' })}>
            Add Wallet
          </Button>
          {hasMultipleWallets && (
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/wallets' })}
            >
              Switch Wallet
            </Button>
          )}
          {walletStatus === 'unlocked' && (
            <Button variant="outline" onClick={handleLockWallet}>
              Lock Wallet
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      {activeWalletId && <WalletManagement />}

      <Card>
        <CardHeader>
          <CardTitle>Network</CardTitle>
          <CardDescription>
            Select the Bitcoin network to connect to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NetworkSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address Type</CardTitle>
          <CardDescription>
            Choose the address format for new wallets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddressTypeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred color scheme.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <EsploraEndpointConfig />

      {activeWalletId && <SeedPhraseBackup />}

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Bitboard Wallet &mdash; A Progressive Web App Bitcoin wallet.</p>
          <p>Version 0.1.0</p>
        </CardContent>
      </Card>
    </div>
  )
}
