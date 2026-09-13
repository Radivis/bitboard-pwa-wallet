import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import {
  getDatabase,
  ensureMigrated,
  clearWalletNoMnemonicBackupFlag,
  useWalletNoMnemonicBackupFlag,
  tryLoadNearZeroSessionIntoMemory,
} from '@/db'
import {
  loadWalletSecrets,
  loadWalletSecretsWithPassword,
} from '@/db/wallet-persistence'
import { invalidateWalletRelatedQueriesAndNotifyOtherTabs } from '@/lib/wallet/wallet-query-cache-sync'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { AppModal } from '@/components/AppModal'
import { EnterAppPasswordModal } from '@/components/EnterAppPasswordModal'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/shared/utils'
import { DialogDescription } from '@/components/ui/dialog'
import { MnemonicGrid } from '@/components/MnemonicGrid'

export function SeedPhraseBackup() {
  const queryClient = useQueryClient()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const nearZeroActive = useNearZeroSecurityStore(
    (nearZeroSecurityState) => nearZeroSecurityState.active,
  )
  const { data: noMnemonicBackupFlag = false } =
    useWalletNoMnemonicBackupFlag(activeWalletId)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const backupConfirmedRef = useRef(backupConfirmed)
  useEffect(() => {
    backupConfirmedRef.current = backupConfirmed
  }, [backupConfirmed])

  const closeMnemonicDialog = useCallback(
    async (confirmed: boolean) => {
      if (confirmed && activeWalletId) {
        await ensureMigrated()
        await clearWalletNoMnemonicBackupFlag(getDatabase(), activeWalletId)
        invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
      }
      setShowMnemonic(false)
      setMnemonicWords([])
      setBackupConfirmed(false)
    },
    [activeWalletId, queryClient],
  )

  const revealMnemonicWords = useCallback((mnemonic: string) => {
    setMnemonicWords(mnemonic.split(' '))
    setShowPasswordPrompt(false)
    setBackupConfirmed(false)
    setShowMnemonic(true)
  }, [])

  const withSeedPhraseLoad = useCallback(
    async (load: (walletId: number) => Promise<void>, fallbackError: string) => {
      if (!activeWalletId) return
      try {
        setLoading(true)
        setError(null)
        await ensureMigrated()
        await load(activeWalletId)
      } catch {
        setError(fallbackError)
      } finally {
        setLoading(false)
      }
    },
    [activeWalletId],
  )

  const handleShowSeedPhraseClick = useCallback(async () => {
    await withSeedPhraseLoad(async (walletId) => {
      const walletDb = getDatabase()
      const nearZeroReady = await tryLoadNearZeroSessionIntoMemory(walletDb)
      if (nearZeroReady) {
        const secrets = await loadWalletSecrets(walletDb, walletId)
        revealMnemonicWords(secrets.mnemonic)
        return
      }
      setShowPasswordPrompt(true)
    }, 'Could not load seed phrase')
  }, [revealMnemonicWords, withSeedPhraseLoad])

  const handleShowSeedPhrase = useCallback(async (password: string) => {
    await withSeedPhraseLoad(async (walletId) => {
      const secrets = await loadWalletSecretsWithPassword(
        getDatabase(),
        password,
        walletId,
      )
      revealMnemonicWords(secrets.mnemonic)
    }, 'Wrong password')
  }, [revealMnemonicWords, withSeedPhraseLoad])

  if (!activeWalletId) return null

  return (
    <>
      <InfomodeWrapper
        infoId="management-seed-phrase-backup-card"
        infoTitle="Seed phrase backup"
        infoText="This section lets you reveal your recovery words again after typing your Bitboard app password. Use it only in a private place—anyone who sees the words can control your funds. It is for checking a paper backup or writing the phrase down if you have not already."
        className="rounded-xl"
      >
        <Card
          className={cn(
            noMnemonicBackupFlag &&
              'border-2 border-destructive shadow-sm ring-1 ring-destructive/20',
          )}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Seed Phrase Backup
            </CardTitle>
            {noMnemonicBackupFlag && (
              <p className="text-sm font-bold text-destructive">
                No backup of the seed phrase has been recorded for this wallet.
                Use “Show Seed Phrase” in a private place, write the words down,
                and store them safely.
              </p>
            )}
            <CardDescription>
              {nearZeroActive
                ? 'View your seed phrase to back up your wallet.'
                : 'View your seed phrase to back up your wallet. You will need to confirm your Bitboard app password.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              onClick={() => {
                void handleShowSeedPhraseClick()
              }}
              disabled={loading}
            >
              {loading ? 'Decrypting...' : 'Show Seed Phrase'}
            </Button>
            {error && !showPasswordPrompt ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </CardContent>
        </Card>
      </InfomodeWrapper>

      <EnterAppPasswordModal
        open={showPasswordPrompt}
        onOpenChange={(open) => {
          setShowPasswordPrompt(open)
          if (!open) setError(null)
        }}
        onCancel={() => setShowPasswordPrompt(false)}
        onConfirm={(password) => {
          void handleShowSeedPhrase(password)
        }}
        isBusy={loading}
        error={error}
        title="Enter Bitboard app password"
        description="Enter your Bitboard app password to view your seed phrase."
        submitLabel="Confirm"
        loadingText="Decrypting..."
      />

      <AppModal
        isOpen={showMnemonic}
        onOpenChange={() => {}}
        onCancel={() => {
          void closeMnemonicDialog(backupConfirmedRef.current)
        }}
        title={
          <>
            <EyeOff className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="min-w-0">Your Seed Phrase</span>
          </>
        }
        contentClassName="sm:max-w-lg"
        footerClassName="justify-end"
        footer={(requestClose) => (
          <Button variant="outline" onClick={requestClose}>
            Close
          </Button>
        )}
      >
        <>
          <DialogDescription>
            Never share these words. Anyone with them can access your funds.
          </DialogDescription>
          <MnemonicGrid
            words={mnemonicWords}
            columns={mnemonicWords.length > 12 ? 4 : 3}
          />
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            Never share these words with anyone. Anyone who has them can steal
            your funds.
          </div>
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="seed-backup-confirmed"
              checked={backupConfirmed}
              onChange={(e) => setBackupConfirmed(e.target.checked)}
              className="mt-1 size-4 shrink-0 rounded border-input"
            />
            <Label
              htmlFor="seed-backup-confirmed"
              className="cursor-pointer text-sm font-normal leading-snug"
            >
              I have actually made a backup of this seed phrase
            </Label>
          </div>
        </>
      </AppModal>
    </>
  )
}
