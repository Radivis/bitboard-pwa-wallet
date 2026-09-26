import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EnterAppPasswordModal } from '@/components/EnterAppPasswordModal'
import { SetupFlowHeading } from '@/components/setup/SetupFlowHeading'
import { SetupNewWalletGate } from '@/components/setup/SetupNewWalletGate'
import { useCryptoStore } from '@/stores/cryptoStore'
import { newWalletPersistFieldsFromEncryptResult } from '@/lib/wallet/new-wallet'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
import {
  completeNewWalletSetup,
  toastNewWalletFlowError,
  usePersistAndActivateNewWallet,
  usePrepareNewWalletEncryption,
} from '@/pages/setup/use-new-wallet-setup'

export function ImportWalletPage() {
  const navigate = useNavigate()
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false)

  const validateMnemonic = useCryptoStore((cryptoState) => cryptoState.validateMnemonic)
  const importWalletAndEncryptSecrets = useCryptoStore((cryptoState) => cryptoState.importWalletAndEncryptSecrets)
  const prepareNewWalletEncryptionCall = usePrepareNewWalletEncryption()
  const persistNewWallet = usePersistAndActivateNewWallet()

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

      const encryptionTarget = await prepareNewWalletEncryptionCall(appPassword)
      const importWalletOutcome = await importWalletAndEncryptSecrets({
        mnemonic,
        ...encryptionTarget,
      })

      setMnemonicInput('')

      await persistNewWallet({
        ...newWalletPersistFieldsFromEncryptResult(importWalletOutcome),
        markNoMnemonicBackup: false,
      })
    },
    onSuccess: () => {
      setMnemonicInput('')
      completeNewWalletSetup(navigate, 'Wallet imported successfully!')
    },
    onError: (err) => {
      toastNewWalletFlowError(err, 'Failed to import wallet')
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
        <SetupFlowHeading title="Import Wallet" />

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
