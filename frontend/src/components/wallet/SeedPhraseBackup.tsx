import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import {
  getDatabase,
  ensureMigrated,
  loadWalletSecrets,
  clearWalletNoMnemonicBackupFlag,
  walletKeys,
  useWalletNoMnemonicBackupFlag,
} from '@/db'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MnemonicGrid } from '@/components/MnemonicGrid'

export function SeedPhraseBackup() {
  const queryClient = useQueryClient()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const { data: noMnemonicBackupFlag = false } =
    useWalletNoMnemonicBackupFlag(activeWalletId)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [promptPassword, setPromptPassword] = useState('')
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
        await queryClient.invalidateQueries({
          queryKey: walletKeys.noMnemonicBackup(activeWalletId),
        })
      }
      setShowMnemonic(false)
      setMnemonicWords([])
      setBackupConfirmed(false)
    },
    [activeWalletId, queryClient],
  )

  const handleShowSeedPhrase = useCallback(async () => {
    if (!activeWalletId) return
    try {
      setLoading(true)
      setError(null)
      await ensureMigrated()
      const walletDb = getDatabase()
      const secrets = await loadWalletSecrets(walletDb, promptPassword, activeWalletId)
      setMnemonicWords(secrets.mnemonic.split(' '))
      setShowPasswordPrompt(false)
      setBackupConfirmed(false)
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
              View your seed phrase to back up your wallet. You will need to
              confirm your Bitboard app password.
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
      </InfomodeWrapper>

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
            <DialogTitle>Confirm Bitboard app password</DialogTitle>
            <DialogDescription>
              Enter your Bitboard app password to view your seed phrase.
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
              <Label htmlFor="backup-password">Bitboard app password</Label>
              <Input
                id="backup-password"
                type="password"
                value={promptPassword}
                onChange={(e) => setPromptPassword(e.target.value)}
                placeholder="Enter your Bitboard app password"
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
            void closeMnemonicDialog(backupConfirmedRef.current)
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
          <Button variant="outline" onClick={() => setShowMnemonic(false)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
