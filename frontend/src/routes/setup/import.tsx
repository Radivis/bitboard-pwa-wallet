import { useState, useMemo, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore, startAutoLockTimer } from '@/stores/sessionStore'
import {
  getDatabase,
  ensureMigrated,
  putWalletSecretsEncrypted,
  walletKeys,
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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validating, setValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)

  const validateMnemonic = useCryptoStore((s) => s.validateMnemonic)
  const importWalletAndEncryptSecrets = useCryptoStore((s) => s.importWalletAndEncryptSecrets)
  const fullScanWallet = useCryptoStore((s) => s.fullScanWallet)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const setCurrentAddress = useWalletStore((s) => s.setCurrentAddress)
  const setBalance = useWalletStore((s) => s.setBalance)
  const setTransactions = useWalletStore((s) => s.setTransactions)
  const setSessionPassword = useSessionStore((s) => s.setPassword)
  const getBalanceFromWorker = useCryptoStore((s) => s.getBalance)
  const getTransactionList = useCryptoStore((s) => s.getTransactionList)
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

  const passwordsValid = useMemo(() => {
    return password.length >= 8 && password === confirmPassword
  }, [password, confirmPassword])

  const canRestore = isValid === true && passwordsValid

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!canRestore) throw new Error('Invalid input')

      await ensureSecretsChannel()
      const network = toBitcoinNetwork(networkMode)
      const { encryptedBlob, walletResult } = await importWalletAndEncryptSecrets(
        mnemonic,
        password,
        network,
        addressType,
        accountId,
      )

      setMnemonicInput('')

      await ensureMigrated()
      const walletDb = getDatabase()

      let walletId: number
      try {
        walletId = await walletDb.transaction().execute(async (trx) => {
          const result = await trx
            .insertInto('wallets')
            .values({
              name: `Imported Wallet ${Date.now()}`,
              created_at: new Date().toISOString(),
            })
            .executeTakeFirstOrThrow()
          const id = Number(result.insertId)
          await putWalletSecretsEncrypted(trx, id, encryptedBlob)
          return id
        })
      } catch (err) {
        queryClient.invalidateQueries({ queryKey: walletKeys.all })
        throw err
      }
      queryClient.invalidateQueries({ queryKey: walletKeys.all })

      setSessionPassword(password)
      setActiveWallet(walletId)
      setCurrentAddress(walletResult.first_address)
      setWalletStatus('unlocked')

      startAutoLockTimer(() => {
        useWalletStore.getState().lockWallet()
      })

      try {
        const customUrl = await loadCustomEsploraUrl(networkMode)
        const esploraUrl = getEsploraUrl(networkMode, customUrl)
        await fullScanWallet(esploraUrl, 20)

        const balance = await getBalanceFromWorker()
        const txs = await getTransactionList()
        setBalance(balance)
        setTransactions(txs)
      } catch {
        toast.error('Initial sync failed — you can sync later from the dashboard')
      }
    },
    onSuccess: () => {
      setMnemonicInput('')
      toast.success('Wallet imported successfully!')
      navigate({ to: '/' })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to import wallet',
      )
    },
  })

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

            <div className="space-y-2">
              <Label htmlFor="import-password">Password</Label>
              <Input
                id="import-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a strong password"
                disabled={restoreMutation.isPending}
              />
              <PasswordStrengthIndicator password={password} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-confirm-password">Confirm Password</Label>
              <Input
                id="import-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={restoreMutation.isPending}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">
                  Passwords do not match
                </p>
              )}
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
