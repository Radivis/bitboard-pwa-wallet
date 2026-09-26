import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EnterAppPasswordModal } from '@/components/EnterAppPasswordModal'
import { SetupBackToWelcomeButton } from '@/components/SetupBackToWelcomeButton'
import { SetupNewWalletGate } from '@/components/setup/SetupNewWalletGate'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'
import { useAddWallet, useWallets } from '@/db'
import {
  persistAndActivateNewWallet,
  prepareNewWalletEncryption,
} from '@/lib/wallet/new-wallet'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'

export function ImportWalletPage() {
  const navigate = useNavigate()
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false)

  const { data: wallets } = useWallets()

  const validateMnemonic = useCryptoStore((cryptoState) => cryptoState.validateMnemonic)
  const importWalletAndEncryptSecrets = useCryptoStore((cryptoState) => cryptoState.importWalletAndEncryptSecrets)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const accountId = useWalletStore((walletState) => walletState.accountId)
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

  const restoreMutation = useMutation({
    mutationFn: async (appPassword?: string) => {
      if (!canRestore) throw new Error('Invalid input')

      const network = await prepareNewWalletEncryption(appPassword, networkMode)
      const { encryptedPayload, encryptedMnemonic, walletResult } =
        await importWalletAndEncryptSecrets({
          mnemonic,
          network,
          addressType,
          accountId,
        })

      setMnemonicInput('')

      await persistAndActivateNewWallet({
        encryptedBlobs: {
          payload: encryptedPayload,
          mnemonic: encryptedMnemonic,
        },
        firstAddress: walletResult.firstAddress,
        markNoMnemonicBackup: false,
        existingWalletNames: (wallets ?? []).map((wallet) => wallet.name),
        insertWalletRow: (walletRow) =>
          addWallet.mutateAsync({
            name: walletRow.name,
            created_at: walletRow.createdAt,
          }),
        queryClient,
      })
    },
    onSuccess: () => {
      setMnemonicInput('')
      toast.success('Wallet imported successfully!')
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to import wallet',
      )
    },
  })

  const startRestore = async () => {
    if (!(await isWalletSecretsSessionActive())) {
      setConfirmPasswordOpen(true)
      return
    }
    restoreMutation.mutate(undefined)
  }

  return (
    <SetupNewWalletGate>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <SetupBackToWelcomeButton />
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
    </SetupNewWalletGate>
  )
}
