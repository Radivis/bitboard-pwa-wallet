import { useState, useMemo, useEffect, useCallback } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SetAppPasswordModal } from '@/components/SetAppPasswordModal'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore, startAutoLockTimer } from '@/stores/sessionStore'
import {
  useAddWallet,
  getDatabase,
  ensureMigrated,
  persistNewWalletWithSecrets,
  walletKeys,
  useWallets,
} from '@/db'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { toBitcoinNetwork, getEsploraUrl } from '@/lib/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet-utils'

export const Route = createFileRoute('/setup/import')({
  component: ImportWalletPage,
})

export function ImportWalletPage() {
  const navigate = useNavigate()
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)

  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const sessionPassword = useSessionStore((s) => s.password)

  const validateMnemonic = useCryptoStore((s) => s.validateMnemonic)
  const importWalletAndEncryptSecrets = useCryptoStore((s) => s.importWalletAndEncryptSecrets)
  const fullScanWallet = useCryptoStore((s) => s.fullScanWallet)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const setCurrentAddress = useWalletStore((s) => s.setCurrentAddress)
  const commitLoadedSubWallet = useWalletStore((s) => s.commitLoadedSubWallet)
  const setBalance = useWalletStore((s) => s.setBalance)
  const setTransactions = useWalletStore((s) => s.setTransactions)
  const getBalanceFromWorker = useCryptoStore((s) => s.getBalance)
  const getTransactionList = useCryptoStore((s) => s.getTransactionList)
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
        const valid = await validateMnemonic(mnemonic)
        setIsValid(valid)
      } catch {
        setIsValid(false)
      } finally {
        setValidating(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [mnemonic, wordCount, validateMnemonic])

  const canRestore = isValid === true

  /** First Esplora full scan can take a long time; run it after navigation so the wallet UI is usable immediately. */
  const runPostImportInitialSync = useCallback(async () => {
    try {
      const customUrl = await loadCustomEsploraUrl(networkMode)
      const esploraUrl = getEsploraUrl(networkMode, customUrl)
      await fullScanWallet(esploraUrl, 20)

      const balance = await getBalanceFromWorker()
      const txs = await getTransactionList()
      setBalance(balance)
      setTransactions(txs)
      setWalletStatus('unlocked')
    } catch {
      toast.error('Initial sync failed — you can sync later from the dashboard')
      setWalletStatus('unlocked')
    }
  }, [
    networkMode,
    fullScanWallet,
    getBalanceFromWorker,
    getTransactionList,
    setBalance,
    setTransactions,
    setWalletStatus,
  ])

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!canRestore) throw new Error('Invalid input')

      const password = useSessionStore.getState().password
      if (!password) throw new Error('App password required')

      await ensureSecretsChannel()
      const network = toBitcoinNetwork(networkMode)
      const { encryptedPayload, encryptedMnemonic, walletResult } =
        await importWalletAndEncryptSecrets({
          mnemonic,
          password,
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
        queryClient.invalidateQueries({ queryKey: walletKeys.all })
        throw secretsErr
      }

      setActiveWallet(walletId)
      setCurrentAddress(walletResult.first_address)
      commitLoadedSubWallet({
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

  if (hasWallets && !sessionPassword) {
    return <WalletUnlock variant="setup" />
  }

  if (!hasWallets && !sessionPassword) {
    return <SetAppPasswordModal open />
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
              restoreMutation.mutate()
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
    </div>
  )
}
