import { useState, useMemo } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
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
import { useAddWallet, getDatabase, ensureMigrated, saveWalletSecrets } from '@/db'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'

export const Route = createFileRoute('/setup/create')({
  component: CreateWalletPage,
})

type Step = 1 | 2 | 3 | 4

function CreateWalletPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [wordCount, setWordCount] = useState<12 | 24>(12)
  const [mnemonic, setMnemonic] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationWords, setVerificationWords] = useState<Record<number, string>>({})

  const generateMnemonic = useCryptoStore((s) => s.generateMnemonic)
  const createWallet = useCryptoStore((s) => s.createWallet)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const setCurrentAddress = useWalletStore((s) => s.setCurrentAddress)
  const setSessionPassword = useSessionStore((s) => s.setPassword)
  const addWallet = useAddWallet()

  const words = useMemo(() => (mnemonic ? mnemonic.split(' ') : []), [mnemonic])

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

  const generateMnemonicMutation = useMutation({
    mutationFn: (wc: 12 | 24) => generateMnemonic(wc),
    onSuccess: (result) => {
      setMnemonic(result)
      setStep(2)
    },
    onError: () => {
      toast.error('Failed to generate mnemonic')
    },
  })

  const createWalletMutation = useMutation({
    mutationFn: async () => {
      const network = toBitcoinNetwork(networkMode)
      const walletResult = await createWallet(mnemonic, network, addressType)

      await ensureMigrated()
      const db = getDatabase()

      const walletId = await addWallet.mutateAsync({
        name: `Wallet ${Date.now()}`,
        network: networkMode,
        created_at: new Date().toISOString(),
      })

      await saveWalletSecrets(db, password, walletId, {
        mnemonic,
        externalDescriptor: walletResult.external_descriptor,
        internalDescriptor: walletResult.internal_descriptor,
        changeSet: walletResult.changeset_json,
      })

      setSessionPassword(password)
      setActiveWallet(walletId)
      setCurrentAddress(walletResult.first_address)
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
        err instanceof Error ? err.message : 'Failed to create wallet',
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
          Step {step} of 4
        </div>
      </div>

      {step === 1 && (
        <StepGenerate
          wordCount={wordCount}
          setWordCount={setWordCount}
          onGenerate={() => generateMnemonicMutation.mutate(wordCount)}
          loading={generateMnemonicMutation.isPending}
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
          onContinue={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <StepPassword
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          isValid={passwordsValid}
          loading={createWalletMutation.isPending}
          onSubmit={() => createWalletMutation.mutate()}
        />
      )}
    </div>
  )
}

function StepGenerate({
  wordCount,
  setWordCount,
  onGenerate,
  loading,
}: {
  wordCount: 12 | 24
  setWordCount: (wc: 12 | 24) => void
  onGenerate: () => void
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Seed Phrase</CardTitle>
        <CardDescription>
          Choose the length of your seed phrase and generate it.
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

        {loading ? (
          <LoadingSpinner text="Generating seed phrase..." />
        ) : (
          <Button onClick={onGenerate} className="w-full" size="lg">
            <RefreshCw className="mr-2 h-4 w-4" />
            Generate Mnemonic
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
  onContinue,
}: {
  verificationIndices: number[]
  verificationWords: Record<number, string>
  setVerificationWords: (words: Record<number, string>) => void
  isCorrect: boolean
  onContinue: () => void
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
            />
          </div>
        ))}
        <Button
          onClick={onContinue}
          className="w-full"
          size="lg"
          disabled={!isCorrect}
        >
          Confirm
        </Button>
      </CardContent>
    </Card>
  )
}

function StepPassword({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  isValid,
  loading,
  onSubmit,
}: {
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
        <CardTitle>Set Password</CardTitle>
        <CardDescription>
          Choose a strong password to encrypt your wallet. You will need this
          password every time you open the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
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
            <LoadingSpinner text="Creating wallet..." />
          ) : (
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={!isValid}
            >
              Create Wallet
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
