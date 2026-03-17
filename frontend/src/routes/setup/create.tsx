import { useState, useMemo } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MnemonicGrid } from '@/components/MnemonicGrid'
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
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'

export const Route = createFileRoute('/setup/create')({
  component: CreateWalletPage,
})

type Step = 1 | 2 | 3 | 4

/** Stored after createWalletAndEncryptSecrets so we can persist in step 4 without keeping mnemonic. */
interface CreateWalletPending {
  encryptedBlob: { ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array }
  walletResult: { first_address: string }
}

export function CreateWalletPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [wordCount, setWordCount] = useState<12 | 24>(12)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mnemonicForBackup, setMnemonicForBackup] = useState('')
  const [pendingCreate, setPendingCreate] = useState<CreateWalletPending | null>(null)
  const [verificationWords, setVerificationWords] = useState<Record<number, string>>({})

  const createWalletAndEncryptSecrets = useCryptoStore((s) => s.createWalletAndEncryptSecrets)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const setCurrentAddress = useWalletStore((s) => s.setCurrentAddress)
  const setSessionPassword = useSessionStore((s) => s.setPassword)

  const words = useMemo(() => (mnemonicForBackup ? mnemonicForBackup.split(' ') : []), [mnemonicForBackup])

  const verificationIndices = useMemo(() => {
    if (words.length === 0) return []
    const indices: number[] = []
    const range = words.length
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * range)
      if (!indices.includes(idx)) indices.push(idx)
    }
    return indices.sort((a, b) => a - b)
  }, [words.length])

  const verificationCorrect = useMemo(() => {
    if (verificationIndices.length === 0) return false
    return verificationIndices.every(
      (idx) => verificationWords[idx]?.toLowerCase().trim() === words[idx],
    )
  }, [verificationIndices, verificationWords, words])

  const passwordsValid = useMemo(() => {
    return password.length >= 8 && password === confirmPassword
  }, [password, confirmPassword])

  const createWalletMutation = useMutation({
    mutationFn: async () => {
      await ensureSecretsChannel()
      const network = toBitcoinNetwork(networkMode)
      const result = await createWalletAndEncryptSecrets(
        password,
        network,
        addressType,
        accountId,
        wordCount,
      )
      return result
    },
    onSuccess: (result) => {
      setMnemonicForBackup(result.mnemonicForBackup)
      setPendingCreate({
        encryptedBlob: result.encryptedBlob,
        walletResult: { first_address: result.walletResult.first_address },
      })
      setStep(2)
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create wallet',
      )
    },
  })

  const queryClient = useQueryClient()
  const finishCreateMutation = useMutation({
    mutationFn: async () => {
      if (!pendingCreate) throw new Error('No pending create')
      const firstAddress = pendingCreate.walletResult.first_address
      setMnemonicForBackup('')
      await ensureMigrated()
      const walletDb = getDatabase()
      let walletId: number
      try {
        walletId = await walletDb.transaction().execute(async (trx) => {
          const result = await trx
            .insertInto('wallets')
            .values({
              name: `Wallet ${Date.now()}`,
              created_at: new Date().toISOString(),
            })
            .executeTakeFirstOrThrow()
          const id = Number(result.insertId)
          await putWalletSecretsEncrypted(trx, id, pendingCreate!.encryptedBlob)
          return id
        })
      } catch (err) {
        queryClient.invalidateQueries({ queryKey: walletKeys.all })
        throw err
      }
      queryClient.invalidateQueries({ queryKey: walletKeys.all })
      setPendingCreate(null)
      setSessionPassword(password)
      setActiveWallet(walletId)
      setCurrentAddress(firstAddress)
      setWalletStatus('unlocked')
      startAutoLockTimer(() => {
        useWalletStore.getState().lockWallet()
      })
    },
    onSuccess: () => {
      toast.success('Wallet created successfully!')
      navigate({ to: '/' })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save wallet',
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
        <h2 className="text-xl font-bold">Create Wallet</h2>
        <div className="ml-auto text-sm text-muted-foreground">
          Step {step} of 3
        </div>
      </div>

      {step === 1 && (
        <StepWordCountAndPassword
          wordCount={wordCount}
          setWordCount={setWordCount}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          isValid={passwordsValid}
          loading={createWalletMutation.isPending}
          onSubmit={() => createWalletMutation.mutate()}
        />
      )}

      {step === 2 && (
        <StepBackup words={words} onContinue={() => setStep(3)} />
      )}

      {step === 3 && (
        <StepVerify
          verificationIndices={verificationIndices}
          verificationWords={verificationWords}
          setVerificationWords={setVerificationWords}
          isCorrect={verificationCorrect}
          loading={finishCreateMutation.isPending}
          onConfirm={() => finishCreateMutation.mutate()}
        />
      )}
    </div>
  )
}

function StepWordCountAndPassword({
  wordCount,
  setWordCount,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  isValid,
  loading,
  onSubmit,
}: {
  wordCount: 12 | 24
  setWordCount: (wc: 12 | 24) => void
  password: string
  setPassword: (pw: string) => void
  confirmPassword: string
  setConfirmPassword: (pw: string) => void
  isValid: boolean
  loading: boolean
  onSubmit: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Wallet</CardTitle>
        <CardDescription>
          Choose seed phrase length and set a password. The seed phrase will be generated and shown on the next step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Word Count</Label>
          <div className="flex gap-2">
            <Button
              variant={wordCount === 12 ? 'default' : 'outline'}
              onClick={() => setWordCount(12)}
              className="flex-1"
            >
              12 Words
            </Button>
            <Button
              variant={wordCount === 24 ? 'default' : 'outline'}
              onClick={() => setWordCount(24)}
              className="flex-1"
            >
              24 Words
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-password">Password</Label>
          <Input
            id="create-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a strong password"
            disabled={loading}
          />
          <PasswordStrengthIndicator password={password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            disabled={loading}
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}
        </div>

        {loading ? (
          <LoadingSpinner text="Generating wallet..." />
        ) : (
          <Button
            onClick={onSubmit}
            className="w-full"
            size="lg"
            disabled={!isValid}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Generate & Continue
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function StepBackup({
  words,
  onContinue,
}: {
  words: string[]
  onContinue: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup Seed Phrase</CardTitle>
        <CardDescription>
          Write down these words in order. You will need them to recover your
          wallet. Never share them with anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MnemonicGrid words={words} columns={words.length > 12 ? 4 : 3} />
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
          Write down these words in order. You will need them to recover your
          wallet.
        </div>
        <Button onClick={onContinue} className="w-full" size="lg">
          I've Written It Down
        </Button>
      </CardContent>
    </Card>
  )
}

function StepVerify({
  verificationIndices,
  verificationWords,
  setVerificationWords,
  isCorrect,
  loading,
  onConfirm,
}: {
  verificationIndices: number[]
  verificationWords: Record<number, string>
  setVerificationWords: (words: Record<number, string>) => void
  isCorrect: boolean
  loading: boolean
  onConfirm: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify Seed Phrase</CardTitle>
        <CardDescription>
          Enter the words at the requested positions to confirm your backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {verificationIndices.map((idx) => (
          <div key={idx} className="space-y-1">
            <Label>Word #{idx + 1}</Label>
            <Input
              value={verificationWords[idx] || ''}
              onChange={(e) =>
                setVerificationWords({
                  ...verificationWords,
                  [idx]: e.target.value,
                })
              }
              placeholder={`Enter word #${idx + 1}`}
              autoComplete="off"
              disabled={loading}
            />
          </div>
        ))}
        {loading ? (
          <LoadingSpinner text="Saving wallet..." />
        ) : (
          <Button
            onClick={onConfirm}
            className="w-full"
            size="lg"
            disabled={!isCorrect}
          >
            Confirm & Finish
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

