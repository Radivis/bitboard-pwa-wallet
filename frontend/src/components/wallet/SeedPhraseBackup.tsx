import { useState, useCallback } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import { getDatabase, ensureMigrated, loadWalletSecrets } from '@/db'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MnemonicGrid } from '@/components/MnemonicGrid'

export function SeedPhraseBackup() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [promptPassword, setPromptPassword] = useState('')
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Seed Phrase Backup
            </CardTitle>
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
            setShowMnemonic(false)
            setMnemonicWords([])
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
          <Button
            variant="outline"
            onClick={() => {
              setShowMnemonic(false)
              setMnemonicWords([])
            }}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
