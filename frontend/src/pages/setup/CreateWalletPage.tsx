import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DialogDescription } from '@/components/ui/dialog'
import { AppModal } from '@/components/AppModal'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { MnemonicGrid } from '@/components/MnemonicGrid'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ConfirmAppPasswordModal } from '@/components/EnterAppPasswordModal'
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
  setWalletNoMnemonicBackupFlag,
  useWallets,
  type SplitWalletSecretsEncryptedBlobs,
} from '@/db'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { invalidateWalletRelatedQueriesAndNotifyOtherTabs } from '@/lib/wallet/wallet-query-cache-sync'
import { useSetupAppPasswordGateReady } from '@/hooks/useSetupAppPasswordGateReady'
import {
  ensureWalletSecretsSession,
  isWalletSecretsSessionActive,
} from '@/lib/wallet/wallet-secrets-session'

type Step = 1 | 2 | 3

/** Number of random word positions asked during seed verification (step 3). */
const SEED_VERIFICATION_WORD_COUNT = 3

/** Stored after createWalletAndEncryptSecrets so we can persist in step 3 without keeping mnemonic. */
interface CreateWalletPending {
  encryptedBlobs: SplitWalletSecretsEncryptedBlobs
  walletResult: { firstAddress: string }
}

export function CreateWalletPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [wordCount, setWordCount] = useState<12 | 24>(12)
  const [mnemonicForBackup, setMnemonicForBackup] = useState('')
  const [pendingCreate, setPendingCreate] = useState<CreateWalletPending | null>(null)
  const [verificationWords, setVerificationWords] = useState<Record<number, string>>({})
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false)
  const [pendingCreateAction, setPendingCreateAction] = useState<
    'generate' | 'quickCreate' | null
  >(null)

  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)

  const createWalletAndEncryptSecrets = useCryptoStore((cryptoState) => cryptoState.createWalletAndEncryptSecrets)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const accountId = useWalletStore((walletState) => walletState.accountId)
  const setActiveWallet = useWalletStore((walletState) => walletState.setActiveWallet)
  const setWalletStatus = useWalletStore((walletState) => walletState.setWalletStatus)
  const setCurrentAddress = useWalletStore((walletState) => walletState.setCurrentAddress)
  const setBalance = useWalletStore((walletState) => walletState.setBalance)
  const setTransactions = useWalletStore((walletState) => walletState.setTransactions)
  const setLastSyncTime = useWalletStore((walletState) => walletState.setLastSyncTime)
  const commitLoadedDescriptorWallet = useWalletStore((walletState) => walletState.commitLoadedDescriptorWallet)
  const addWallet = useAddWallet()

  const words = useMemo(() => (mnemonicForBackup ? mnemonicForBackup.split(' ') : []), [mnemonicForBackup])

  const verificationIndices = useMemo(() => {
    if (words.length === 0) return []
    const indices: number[] = []
    const range = words.length
    while (indices.length < SEED_VERIFICATION_WORD_COUNT) {
      const randomWordIndex = Math.floor(Math.random() * range)
      if (!indices.includes(randomWordIndex)) indices.push(randomWordIndex)
    }
    return indices.sort((a, b) => a - b)
  }, [words.length])

  const verificationCorrect = useMemo(() => {
    if (verificationIndices.length === 0) return false
    return verificationIndices.every(
      (wordIndex) =>
        verificationWords[wordIndex]?.toLowerCase().trim() === words[wordIndex],
    )
  }, [verificationIndices, verificationWords, words])

  const queryClient = useQueryClient()
  const { appPasswordReady, walletUnlockedOrSyncing, onAppPasswordSessionStarted } =
    useSetupAppPasswordGateReady(walletStatus)

  const persistAndActivateNewWallet = useCallback(
    async ({
      encryptedBlobs,
      firstAddress,
      markNoMnemonicBackup,
    }: {
      encryptedBlobs: SplitWalletSecretsEncryptedBlobs
      firstAddress: string
      markNoMnemonicBackup: boolean
    }) => {
      await ensureMigrated()
      const walletDb = getDatabase()
      let walletId: number
      try {
        walletId = await persistNewWalletWithSecrets({
          walletDb,
          insertWalletRow: () =>
            addWallet.mutateAsync({
              name: `Wallet ${Date.now()}`,
              created_at: new Date().toISOString(),
            }),
          encryptedBlobs,
        })
      } catch (secretsErr) {
        invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
        throw secretsErr
      }
      if (markNoMnemonicBackup) {
        await setWalletNoMnemonicBackupFlag(walletDb, walletId)
        invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
      }
      // Drop previous wallet's on-chain / sync UI so the dashboard never shows stale data.
      setBalance(null)
      setTransactions([])
      setLastSyncTime(null)
      setCurrentAddress(null)
      setActiveWallet(walletId)
      setCurrentAddress(firstAddress)
      commitLoadedDescriptorWallet({
        networkMode,
        addressType,
        accountId,
      })
      setWalletStatus('unlocked')
      startAutoLockTimer(() =>
        useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
      )
    },
    [
      accountId,
      addWallet,
      addressType,
      commitLoadedDescriptorWallet,
      networkMode,
      queryClient,
      setActiveWallet,
      setBalance,
      setCurrentAddress,
      setLastSyncTime,
      setTransactions,
      setWalletStatus,
    ],
  )

  const runCreateWalletAndEncryptSecrets = useCallback(async (appPassword?: string) => {
    await ensureWalletSecretsSession(appPassword)
    await ensureSecretsChannel()
    const network = toBitcoinNetwork(networkMode)
    return createWalletAndEncryptSecrets({
      network,
      addressType,
      accountId,
      wordCount,
    })
  }, [
    accountId,
    addressType,
    createWalletAndEncryptSecrets,
    networkMode,
    wordCount,
  ])

  const createWalletMutation = useMutation({
    mutationFn: runCreateWalletAndEncryptSecrets,
    onSuccess: (createWalletOutcome) => {
      setMnemonicForBackup(createWalletOutcome.mnemonicForBackup)
      setPendingCreate({
        encryptedBlobs: {
          payload: createWalletOutcome.encryptedPayload,
          mnemonic: createWalletOutcome.encryptedMnemonic,
        },
        walletResult: { firstAddress: createWalletOutcome.walletResult.firstAddress },
      })
      setStep(2)
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create wallet',
      )
    },
  })

  const [skipBackupWarningOpen, setSkipBackupWarningOpen] = useState(false)

  const quickCreateWalletMutation = useMutation({
    mutationFn: async (appPassword?: string) => {
      const createWalletOutcome = await runCreateWalletAndEncryptSecrets(appPassword)
      await persistAndActivateNewWallet({
        encryptedBlobs: {
          payload: createWalletOutcome.encryptedPayload,
          mnemonic: createWalletOutcome.encryptedMnemonic,
        },
        firstAddress: createWalletOutcome.walletResult.firstAddress,
        markNoMnemonicBackup: true,
      })
    },
    onSuccess: () => {
      setSkipBackupWarningOpen(false)
      toast.success('Wallet created successfully!')
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create wallet',
      )
    },
  })

  const requestAppPasswordForCreate = useCallback(
    async (action: 'generate' | 'quickCreate') => {
      if (await isWalletSecretsSessionActive()) {
        if (action === 'generate') {
          createWalletMutation.mutate(undefined)
        } else {
          quickCreateWalletMutation.mutate(undefined)
        }
        return
      }
      setPendingCreateAction(action)
      setConfirmPasswordOpen(true)
    },
    [createWalletMutation, quickCreateWalletMutation],
  )

  const finishCreateMutation = useMutation({
    mutationFn: async () => {
      if (!pendingCreate) throw new Error('No pending create')
      const firstAddress = pendingCreate.walletResult.firstAddress
      setMnemonicForBackup('')
      await persistAndActivateNewWallet({
        encryptedBlobs: pendingCreate.encryptedBlobs,
        firstAddress,
        markNoMnemonicBackup: false,
      })
      setPendingCreate(null)
    },
    onSuccess: () => {
      toast.success('Wallet created successfully!')
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save wallet',
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

  const handleConfirmAppPassword = (appPassword: string) => {
    setConfirmPasswordOpen(false)
    const action = pendingCreateAction
    setPendingCreateAction(null)
    if (action === 'quickCreate') {
      quickCreateWalletMutation.mutate(appPassword)
      return
    }
    createWalletMutation.mutate(appPassword)
  }

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
        <>
          <StepWordCountGenerate
            wordCount={wordCount}
            setWordCount={setWordCount}
            loading={
              createWalletMutation.isPending || quickCreateWalletMutation.isPending
            }
            onSubmit={() => void requestAppPasswordForCreate('generate')}
            onOpenSkipBackupWarning={() => setSkipBackupWarningOpen(true)}
          />
          <AppModal
            isOpen={skipBackupWarningOpen}
            onOpenChange={setSkipBackupWarningOpen}
            onCancel={() => {}}
            title="Quick start without viewing backup"
            contentClassName="sm:max-w-lg"
            footer={(requestClose) => (
              <>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Abort
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={quickCreateWalletMutation.isPending}
                  onClick={() => void requestAppPasswordForCreate('quickCreate')}
                >
                  Understood! Proceed!
                </Button>
              </>
            )}
          >
            <DialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-foreground">
                <p>
                  This quick start option still creates a seed phrase and stores it encrypted on this
                  device, but it will not be shown here. You can view it and back it up later from{' '}
                  <strong>Wallet → Management</strong> — doing so is strongly recommended.
                </p>
                <p>
                  It is <strong>much safer</strong> to make a backup of the seed phrase immediately
                  using &quot;Generate &amp; Continue&quot; instead.
                </p>
                <p className="font-semibold text-destructive">
                  If you skip writing down your seed phrase, permanent loss of funds is highly likely
                  if you lose this device, damage your data, or forget your Bitboard app password —
                  treat total loss as the expected outcome.
                </p>
              </div>
            </DialogDescription>
          </AppModal>
        </>
      )}

      {step === 2 && (
        <StepBackup words={words} onContinue={() => setStep(3)} />
      )}

      <ConfirmAppPasswordModal
        open={confirmPasswordOpen}
        onOpenChange={setConfirmPasswordOpen}
        onCancel={() => {
          setConfirmPasswordOpen(false)
          setPendingCreateAction(null)
        }}
        onConfirm={handleConfirmAppPassword}
        isBusy={createWalletMutation.isPending || quickCreateWalletMutation.isPending}
        title="Confirm app password"
        description="Enter your Bitboard app password to encrypt your new wallet."
        submitLabel={pendingCreateAction === 'quickCreate' ? 'Create wallet' : 'Generate wallet'}
        loadingText="Generating wallet..."
      />

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

function StepWordCountGenerate({
  wordCount,
  setWordCount,
  loading,
  onSubmit,
  onOpenSkipBackupWarning,
}: {
  wordCount: 12 | 24
  setWordCount: (wc: 12 | 24) => void
  loading: boolean
  onSubmit: () => void
  onOpenSkipBackupWarning: () => void
}) {
  const seedPhraseInfoTitle = 'Seed phrase'
  const seedPhraseInfoText =
    'A seed phrase is an ordered list of everyday words that encodes your wallet’s master secret. It’s the usual way to make a simple, memorable backup you can write on paper. Bitboard follows the same industry-standard format (BIP39) that most Bitcoin wallets use, so the same words can typically restore your wallet in another trusted app—not just here.'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Wallet</CardTitle>
        <CardDescription>
          Choose{' '}
          <InfomodeWrapper
            as="span"
            infoId="create-wallet-step1-seed-phrase-in-description-a"
            infoTitle={seedPhraseInfoTitle}
            infoText={seedPhraseInfoText}
          >
            seed phrase
          </InfomodeWrapper>{' '}
          length. The{' '}
          <InfomodeWrapper
            as="span"
            infoId="create-wallet-step1-seed-phrase-in-description-b"
            infoTitle={seedPhraseInfoTitle}
            infoText={seedPhraseInfoText}
          >
            seed phrase
          </InfomodeWrapper>{' '}
          will be generated and shown on the next step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>
            <InfomodeWrapper
              as="span"
              infoId="create-wallet-step1-word-count-label"
              infoTitle="Word count"
              infoText="Whether you pick 12 or 24 words barely changes how strong your wallet is—the generator uses enough randomness either way. This choice is mostly about how long you want your written backup to be and what you find easier to handle, not about turning security up or down."
            >
              Word Count
            </InfomodeWrapper>
          </Label>
          <div className="flex gap-2">
            <InfomodeWrapper
              infoId="create-wallet-step1-twelve-words"
              infoTitle="12-word backup"
              infoText="Twelve words are quicker to write down and type if you restore later. They still represent an enormous amount of randomness, so they are considered very secure when created by the wallet. The tradeoff is simply length: shorter backup, slightly fewer combinations than 24 words (both are far beyond guessable)."
              className="min-w-0 flex-1"
            >
              <Button
                variant={wordCount === 12 ? 'default' : 'outline'}
                onClick={() => setWordCount(12)}
                className="w-full"
              >
                12 Words
              </Button>
            </InfomodeWrapper>
            <InfomodeWrapper
              infoId="create-wallet-step1-twenty-four-words"
              infoTitle="24-word backup"
              infoText="Twenty-four words take more time to copy but give a larger mathematical space. Some people prefer that extra peace of mind. It is not automatically “twice as safe” as 12 words—both are secure; this is mainly about how much you are comfortable writing and storing."
              className="min-w-0 flex-1"
            >
              <Button
                variant={wordCount === 24 ? 'default' : 'outline'}
                onClick={() => setWordCount(24)}
                className="w-full"
              >
                24 Words
              </Button>
            </InfomodeWrapper>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner text="Generating wallet..." />
        ) : (
          <>
            <Button
              onClick={onSubmit}
              className="w-full"
              size="lg"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Generate & Continue
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              size="lg"
              onClick={onOpenSkipBackupWarning}
            >
              Generate but skip backup
            </Button>
          </>
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
