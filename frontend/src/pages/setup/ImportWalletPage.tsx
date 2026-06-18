import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EnterAppPasswordModal } from '@/components/EnterAppPasswordModal'
import { SetAppPasswordModal } from '@/components/SetAppPasswordModal'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'
import { startAutoLockTimer } from '@/stores/sessionStore'
import {
  useAddWallet,
  getDatabase,
  ensureMigrated,
  persistNewWalletWithSecrets,
  useWallets,
} from '@/db'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import {
  runImportInitialEsploraSync,
  retryImportInitialEsploraSyncWithWalletStatus,
} from '@/lib/wallet/wallet-utils'
import { showImportInitialSyncFailureToast } from '@/lib/wallet/wallet-sync-error-toast'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import { invalidateWalletRelatedQueriesAndNotifyOtherTabs } from '@/lib/wallet/wallet-query-cache-sync'
import { useSetupAppPasswordGateReady } from '@/hooks/useSetupAppPasswordGateReady'
import {
  ensureWalletSecretsSession,
  isWalletSecretsSessionActive,
} from '@/lib/wallet/wallet-secrets-session'

export function ImportWalletPage() {
  const navigate = useNavigate()
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false)

  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const { appPasswordReady, walletUnlockedOrSyncing, onAppPasswordSessionStarted } =
    useSetupAppPasswordGateReady(walletStatus)

  const validateMnemonic = useCryptoStore((cryptoState) => cryptoState.validateMnemonic)
  const importWalletAndEncryptSecrets = useCryptoStore((cryptoState) => cryptoState.importWalletAndEncryptSecrets)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const accountId = useWalletStore((walletState) => walletState.accountId)
  const setActiveWallet = useWalletStore((walletState) => walletState.setActiveWallet)
  const setWalletStatus = useWalletStore((walletState) => walletState.setWalletStatus)
  const setCurrentAddress = useWalletStore((walletState) => walletState.setCurrentAddress)
  const commitLoadedDescriptorWallet = useWalletStore((walletState) => walletState.commitLoadedDescriptorWallet)
  const setImportInitialSyncErrorMessage = useWalletStore(
    (walletState) => walletState.setImportInitialSyncErrorMessage,
  )
  const addWallet = useAddWallet()
  const queryClient = useQueryClient()

  const mnemonic = useMemo(
    () =>
      mnemonicInput
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(' '),
    [mnemonicInput],
  )

  const wordCount = useMemo(() => mnemonic.split(' ').filter(Boolean).length, [mnemonic])

  useEffect(() => {
    if (wordCount !== 12 && wordCount !== 24) {
      setIsValid(null)
      return
    }

    const timer = setTimeout(async () => {
      try {
        setValidating(true)
        const mnemonicIsValid = await validateMnemonic(mnemonic)
        setIsValid(mnemonicIsValid)
      } catch {
        setIsValid(false)
      } finally {
        setValidating(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [mnemonic, wordCount, validateMnemonic])

  const canRestore = isValid === true

  /**
   * First Esplora full scan after import (long-running); runs after navigation.
   * Lab / no Esplora URL: refresh WASM balance/tx only (see {@link runImportInitialEsploraSync}).
   */
  const runPostImportInitialSync = useCallback(async () => {
    try {
      await runImportInitialEsploraSync()
      setWalletStatus('unlocked')
    } catch (err: unknown) {
      setWalletStatus('unlocked')
      const syncErrorMessage =
        sanitizeErrorMessageForUi(errorMessage(err) ?? String(err)) ||
        'Initial sync failed'
      setImportInitialSyncErrorMessage(syncErrorMessage)
      showImportInitialSyncFailureToast(err, () => {
        void retryImportInitialEsploraSyncWithWalletStatus()
      })
    }
  }, [setImportInitialSyncErrorMessage, setWalletStatus])

  const restoreMutation = useMutation({
    mutationFn: async (appPassword?: string) => {
      if (!canRestore) throw new Error('Invalid input')

      await ensureWalletSecretsSession(appPassword)

      await ensureSecretsChannel()
      const network = toBitcoinNetwork(networkMode)
      const { encryptedPayload, encryptedMnemonic, walletResult } =
        await importWalletAndEncryptSecrets({
          mnemonic,
          network,
          addressType,
          accountId,
        })

      setMnemonicInput('')

      await ensureMigrated()
      const walletDb = getDatabase()

      let walletId: number
      try {
        walletId = await persistNewWalletWithSecrets({
          walletDb,
          insertWalletRow: () =>
            addWallet.mutateAsync({
              name: `Imported Wallet ${Date.now()}`,
              created_at: new Date().toISOString(),
            }),
          encryptedBlobs: {
            payload: encryptedPayload,
            mnemonic: encryptedMnemonic,
          },
        })
      } catch (secretsErr) {
        invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
        throw secretsErr
      }

      setActiveWallet(walletId)
      setCurrentAddress(walletResult.firstAddress)
      commitLoadedDescriptorWallet({
        networkMode,
        addressType,
        accountId,
      })
      setWalletStatus('syncing')

      startAutoLockTimer(() =>
        useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
      )
    },
    onSuccess: () => {
      setMnemonicInput('')
      toast.success('Wallet imported successfully!')
      navigate({ to: '/wallet' })
      void runPostImportInitialSync()
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to import wallet',
      )
    },
  })

  if (walletsLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner text="Loading…" />
      </div>
    )
  }

  const hasWallets = (wallets?.length ?? 0) > 0
  if (hasWallets && !walletUnlockedOrSyncing) {
    return <WalletUnlock variant="setup" />
  }

  if (!hasWallets && !appPasswordReady) {
    return (
      <SetAppPasswordModal
        open
        onSessionStarted={onAppPasswordSessionStarted}
      />
    )
  }

  const startRestore = async () => {
    if (!(await isWalletSecretsSessionActive())) {
      setConfirmPasswordOpen(true)
      return
    }
    restoreMutation.mutate(undefined)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/setup">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-xl font-bold">Import Wallet</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enter Seed Phrase</CardTitle>
          <CardDescription>
            Enter your 12 or 24-word seed phrase to restore your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void startRestore()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mnemonic-input">Seed Phrase</Label>
              <Textarea
                id="mnemonic-input"
                value={mnemonicInput}
                onChange={(e) => setMnemonicInput(e.target.value)}
                placeholder="Enter your seed words separated by spaces..."
                rows={4}
                className="font-mono"
                disabled={restoreMutation.isPending}
              />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {wordCount} / {wordCount > 12 ? 24 : 12} words
                </span>
                {validating && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Validating...
                  </span>
                )}
                {isValid === true && !validating && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Valid mnemonic
                  </span>
                )}
                {isValid === false && !validating && (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3 w-3" />
                    Invalid mnemonic
                  </span>
                )}
              </div>
            </div>

            {restoreMutation.isPending ? (
              <LoadingSpinner text="Restoring wallet..." />
            ) : (
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!canRestore}
              >
                Restore Wallet
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <EnterAppPasswordModal
        open={confirmPasswordOpen}
        onOpenChange={setConfirmPasswordOpen}
        onCancel={() => setConfirmPasswordOpen(false)}
        onConfirm={(appPassword: string | undefined) => {
          setConfirmPasswordOpen(false)
          restoreMutation.mutate(appPassword)
        }}
        isBusy={restoreMutation.isPending}
        title="Enter app password"
        description="Enter your Bitboard app password to encrypt your imported wallet."
        submitLabel="Restore wallet"
        loadingText="Restoring wallet..."
      />
    </div>
  )
}
