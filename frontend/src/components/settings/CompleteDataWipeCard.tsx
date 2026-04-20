import { useCallback, useState } from 'react'
import { Eraser } from 'lucide-react'
import { toast } from 'sonner'
import { getDatabase, ensureMigrated, useWallets } from '@/db'
import { anyWalletHasNoMnemonicBackupFlag } from '@/db/wallet-no-mnemonic-backup'
import { formatBTC, formatSats } from '@/lib/bitcoin-utils'
import { listWalletsWithPositiveMainnetOnChainBalance } from '@/lib/mainnet-onchain-balance-probe'
import { wipeAllAppDataOpfsAndReload } from '@/lib/wipe-all-app-data-opfs-and-reload'
import { useSessionStore } from '@/stores/sessionStore'
import { useWalletStore } from '@/stores/walletStore'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn, errorMessage } from '@/lib/utils'

export function CompleteDataWipeCard() {
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const sessionPassword = useSessionStore((s) => s.password)
  const { data: wallets = [] } = useWallets()

  const [riskModalOpen, setRiskModalOpen] = useState(false)
  const [riskUnderstood, setRiskUnderstood] = useState(false)
  const [probing, setProbing] = useState(false)
  const [mainnetModalOpen, setMainnetModalOpen] = useState(false)
  const [mainnetRows, setMainnetRows] = useState<
    Awaited<ReturnType<typeof listWalletsWithPositiveMainnetOnChainBalance>>
  >([])
  const [noBackupModalOpen, setNoBackupModalOpen] = useState(false)
  const [wipeBusy, setWipeBusy] = useState(false)

  const hasWallets = wallets.length > 0
  const canStartFlow =
    !hasWallets || (walletStatus === 'unlocked' && sessionPassword != null)

  const resetRiskModalForm = useCallback(() => {
    setRiskUnderstood(false)
  }, [])

  const advanceToNoBackupOrWipe = useCallback(async () => {
    await ensureMigrated()
    if (await anyWalletHasNoMnemonicBackupFlag(getDatabase())) {
      setNoBackupModalOpen(true)
      return
    }
    try {
      setWipeBusy(true)
      await wipeAllAppDataOpfsAndReload()
    } catch (err) {
      console.error('[CompleteDataWipeCard] wipeAllAppDataOpfsAndReload failed (advanceToNoBackupOrWipe)', err)
      toast.error(errorMessage(err))
      setWipeBusy(false)
    }
  }, [])

  const onRiskModalContinue = useCallback(async () => {
    if (!riskUnderstood) return
    setRiskModalOpen(false)
    resetRiskModalForm()

    if (!hasWallets) {
      await advanceToNoBackupOrWipe()
      return
    }

    if (sessionPassword == null) {
      toast.error('Unlock your wallet to continue.')
      return
    }

    setProbing(true)
    try {
      const rows = await listWalletsWithPositiveMainnetOnChainBalance({
        password: sessionPassword,
        wallets: wallets.map((w) => ({
          wallet_id: w.wallet_id,
          name: w.name,
        })),
      })
      if (rows.length > 0) {
        setMainnetRows(rows)
        setMainnetModalOpen(true)
      } else {
        await advanceToNoBackupOrWipe()
      }
    } catch (err) {
      console.error('[CompleteDataWipeCard] mainnet balance probe failed', err)
      toast.error(`Could not check mainnet balance: ${errorMessage(err)}`)
      setRiskModalOpen(true)
    } finally {
      setProbing(false)
    }
  }, [
    riskUnderstood,
    resetRiskModalForm,
    hasWallets,
    sessionPassword,
    wallets,
    advanceToNoBackupOrWipe,
  ])

  const onMainnetModalContinue = useCallback(async () => {
    setMainnetModalOpen(false)
    await advanceToNoBackupOrWipe()
  }, [advanceToNoBackupOrWipe])

  const onNoBackupProceedAnyway = useCallback(async () => {
    setNoBackupModalOpen(false)
    try {
      setWipeBusy(true)
      await wipeAllAppDataOpfsAndReload()
    } catch (err) {
      console.error('[CompleteDataWipeCard] wipeAllAppDataOpfsAndReload failed (onNoBackupProceedAnyway)', err)
      toast.error(errorMessage(err))
      setWipeBusy(false)
    }
  }, [])

  return (
    <>
      <Card
        data-testid="complete-data-wipe-card"
        className="border-2 border-destructive shadow-sm ring-1 ring-destructive/20"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eraser className="h-5 w-5" />
            Delete all app data
          </CardTitle>
          <CardDescription>
            Permanently remove all local Bitboard data on this device: the wallet database and the
            lab database (both stored as SQLite in your browser). This cannot be undone. You will
            need your seed phrase or a signed wallet backup to recover funds; Lightning connection
            details and other app data stored locally will be lost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="destructive"
            disabled={!canStartFlow || probing || wipeBusy}
            onClick={() => {
              resetRiskModalForm()
              setRiskModalOpen(true)
            }}
          >
            Delete all app data
          </Button>
          {hasWallets && !canStartFlow && (
            <p className="text-xs text-muted-foreground">
              Unlock your wallet to run preflight checks before wiping.
            </p>
          )}
        </CardContent>
      </Card>

      <AppModal
        isOpen={riskModalOpen}
        onOpenChange={(open) => {
          setRiskModalOpen(open)
          if (!open) resetRiskModalForm()
        }}
        onCancel={() => {}}
        title="Delete all local app data?"
        isCloseButtonHidden={probing}
        footer={(requestClose) => (
          <>
            <Button type="button" variant="outline" disabled={probing} onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={probing || !riskUnderstood}
              onClick={() => void onRiskModalContinue()}
            >
              {probing ? 'Checking…' : 'Continue'}
            </Button>
          </>
        )}
      >
        <DialogDescription asChild>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              This will erase <strong className="text-foreground">everything</strong> Bitboard keeps
              on this device in its databases—including all wallets, encrypted secrets, settings
              stored with them, and lab simulator state.
            </p>
            <p>
              You will <strong className="text-destructive">lose access to your bitcoin</strong> on
              this device unless you have a correct seed phrase backup or a signed wallet export.
              If you are unsure, cancel and back up first.
            </p>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="complete-wipe-risk-understood"
                checked={riskUnderstood}
                onChange={(e) => setRiskUnderstood(e.target.checked)}
                disabled={probing}
                className="mt-1 size-4 shrink-0 rounded border-input"
              />
              <Label
                htmlFor="complete-wipe-risk-understood"
                className="cursor-pointer text-sm font-normal leading-snug text-foreground"
              >
                I understand this cannot be undone
              </Label>
            </div>
          </div>
        </DialogDescription>
      </AppModal>

      <AppModal
        isOpen={mainnetModalOpen}
        onOpenChange={setMainnetModalOpen}
        onCancel={() => {}}
        title="Mainnet bitcoin may be at risk"
        footer={(requestClose) => (
          <>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={wipeBusy}
              onClick={() => void onMainnetModalContinue()}
            >
              I have verified my seed phrase backups
            </Button>
          </>
        )}
      >
        <DialogDescription asChild>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              The following wallets have a non-zero{' '}
              <strong className="text-foreground">mainnet</strong> on-chain balance (Lightning / NWC
              balances are not counted here). Your recovery phrase for each is the only way to move
              those coins again after this device is wiped.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {mainnetRows.map((row) => (
                <li key={row.walletId}>
                  <span className="text-foreground">{row.name}</span>
                  {' — '}
                  {formatSats(row.totalSats)} sats ({formatBTC(row.totalSats)} BTC)
                </li>
              ))}
            </ul>
            <p>
              Confirm that backups of the corresponding seed phrases exist and are ready to use
              before you wipe this device.
            </p>
          </div>
        </DialogDescription>
      </AppModal>

      <AppModal
        isOpen={noBackupModalOpen}
        onOpenChange={setNoBackupModalOpen}
        onCancel={() => {}}
        title="Seed phrase backup strongly recommended"
        contentClassName="sm:max-w-lg"
        footer={(requestClose) => (
          <>
            <Button type="button" variant="default" onClick={requestClose}>
              Back up seed phrases first
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={cn('whitespace-normal text-left')}
              disabled={wipeBusy}
              onClick={() => void onNoBackupProceedAnyway()}
            >
              I am aware of that serious risk, but need my data be wiped anyway
            </Button>
          </>
        )}
      >
        <DialogDescription asChild>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              At least one wallet still has{' '}
              <strong className="text-foreground">no recorded seed phrase backup</strong> in
              Bitboard (Management → Seed Phrase Backup). If you wipe now without a real backup, you
              are likely to <strong className="text-destructive">lose your funds permanently</strong>
              .
            </p>
            <p>
              We strongly recommend opening Wallet → Management and backing up every seed phrase
              before continuing.
            </p>
          </div>
        </DialogDescription>
      </AppModal>
    </>
  )
}
