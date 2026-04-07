import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteWallet, useWallet, useWalletNoMnemonicBackupFlag, useWallets } from '@/db'
import { finalizeWalletDeletion } from '@/lib/wallet-delete-finalize'
import { sumMainnetOnChainSatsForWallet } from '@/lib/mainnet-onchain-balance-probe'
import { errorMessage } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { useWalletStore } from '@/stores/walletStore'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DeleteWalletSectionProps = {
  /**
   * When true (e.g. from `/wallet/management?openDelete=true` after choosing delete on the
   * wallet list), opens the first confirmation once the wallet is unlocked.
   */
  autoOpenFirstDialog?: boolean
  /** Clear the route search flag so refresh does not reopen the dialog. */
  onAutoOpenConsumed?: () => void
}

export function DeleteWalletSection({
  autoOpenFirstDialog = false,
  onAutoOpenConsumed,
}: DeleteWalletSectionProps) {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const { data: walletRow } = useWallet(activeWalletId)
  const { data: wallets = [] } = useWallets()
  const { data: noMnemonicBackupFlag = false } = useWalletNoMnemonicBackupFlag(activeWalletId)
  const deleteWalletMutation = useDeleteWallet()

  const [firstDialogOpen, setFirstDialogOpen] = useState(false)
  const [mainnetWarnOpen, setMainnetWarnOpen] = useState(false)
  const [mainnetBlockedOpen, setMainnetBlockedOpen] = useState(false)
  const [probingMainnet, setProbingMainnet] = useState(false)

  const walletName = walletRow?.name?.trim() || 'this wallet'
  const sessionPassword = useSessionStore((s) => s.password)
  const canAttemptDelete = walletStatus === 'unlocked' && sessionPassword != null

  useEffect(() => {
    if (
      autoOpenFirstDialog &&
      activeWalletId != null &&
      walletStatus === 'unlocked' &&
      sessionPassword != null
    ) {
      setFirstDialogOpen(true)
      onAutoOpenConsumed?.()
    }
  }, [
    autoOpenFirstDialog,
    activeWalletId,
    walletStatus,
    sessionPassword,
    onAutoOpenConsumed,
  ])

  const closeAll = useCallback(() => {
    setFirstDialogOpen(false)
    setMainnetWarnOpen(false)
    setMainnetBlockedOpen(false)
  }, [])

  const performDelete = useCallback(async () => {
    if (activeWalletId == null || sessionPassword == null) return

    const deletedWalletId = activeWalletId
    const wasActiveWallet = true
    const nextActiveWalletId =
      wallets.find((w) => w.wallet_id !== deletedWalletId)?.wallet_id ?? null

    try {
      await deleteWalletMutation.mutateAsync(deletedWalletId)
      await finalizeWalletDeletion({
        deletedWalletId,
        wasActiveWallet,
        nextActiveWalletId,
      })
      toast.success('Wallet deleted')
      closeAll()
      if (wasActiveWallet) {
        if (nextActiveWalletId === null) {
          navigate({ to: '/setup' })
        } else {
          navigate({ to: '/wallet' })
        }
      }
    } catch (err) {
      toast.error(`Could not delete wallet: ${errorMessage(err)}`)
    }
  }, [
    activeWalletId,
    sessionPassword,
    wallets,
    deleteWalletMutation,
    closeAll,
    navigate,
  ])

  const onFirstDialogConfirm = useCallback(async () => {
    if (activeWalletId == null || sessionPassword == null) {
      toast.error('Unlock your wallet to delete it.')
      return
    }
    setFirstDialogOpen(false)
    setProbingMainnet(true)
    try {
      const total = await sumMainnetOnChainSatsForWallet({
        password: sessionPassword,
        walletId: activeWalletId,
      })
      if (total > 0 && noMnemonicBackupFlag) {
        setMainnetBlockedOpen(true)
      } else if (total > 0) {
        setMainnetWarnOpen(true)
      } else {
        await performDelete()
      }
    } catch (err) {
      toast.error(`Could not check mainnet balance: ${errorMessage(err)}`)
      setFirstDialogOpen(true)
    } finally {
      setProbingMainnet(false)
    }
  }, [activeWalletId, sessionPassword, noMnemonicBackupFlag, performDelete])

  if (activeWalletId == null) return null

  return (
    <>
      <div className="border-t border-border pt-6">
        <InfomodeWrapper
          infoId="wallet-delete-wallet"
          infoTitle="Delete wallet"
          infoText="Removes this wallet’s name, encrypted data, and settings from this device only. It does not remove coins from the Bitcoin network—you can still recover funds with your seed phrase in another wallet unless you delete without a backup."
        >
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">Danger zone</p>
            <p className="text-sm text-muted-foreground">
              Permanently remove this wallet from Bitboard on this device.
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={!canAttemptDelete || probingMainnet || deleteWalletMutation.isPending}
              onClick={() => setFirstDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete wallet
            </Button>
            {!canAttemptDelete && (
              <p className="text-xs text-muted-foreground">
                Unlock your wallet to delete it.
              </p>
            )}
          </div>
        </InfomodeWrapper>
      </div>

      <Dialog open={firstDialogOpen} onOpenChange={setFirstDialogOpen}>
        <DialogContent showCloseButton={!probingMainnet}>
          <DialogHeader>
            <DialogTitle>Delete {walletName}?</DialogTitle>
            <DialogDescription>
              This removes the wallet from Bitboard on this device. You cannot undo this. If
              you might need this wallet again, confirm you have your recovery phrase saved
              somewhere safe before continuing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={probingMainnet}
              onClick={() => setFirstDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={probingMainnet || deleteWalletMutation.isPending}
              onClick={() => void onFirstDialogConfirm()}
            >
              {probingMainnet ? 'Checking…' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mainnetWarnOpen} onOpenChange={setMainnetWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mainnet bitcoin may be at risk</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This wallet has a non-zero <strong className="text-foreground">mainnet</strong>{' '}
                  on-chain balance (Lightning / NWC balances are not counted here). Your recovery
                  phrase is the only way to move those coins again if you remove this wallet from
                  Bitboard.
                </p>
                <p>
                  If you delete this wallet without a complete, correct backup of your seed
                  phrase, you can <strong className="text-destructive">permanently lose access</strong>{' '}
                  to your bitcoin. There is no way for Bitboard or anyone else to recover it for
                  you.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setMainnetWarnOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteWalletMutation.isPending}
              onClick={() => void performDelete().then(() => setMainnetWarnOpen(false))}
            >
              I have a backup — delete wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mainnetBlockedOpen} onOpenChange={setMainnetBlockedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot delete this wallet</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This wallet has a non-zero <strong className="text-foreground">mainnet</strong>{' '}
                  on-chain balance. Deleting it now would be extremely dangerous because Bitboard
                  has no record that you have backed up your recovery phrase.
                </p>
                <p>
                  Without that phrase,{' '}
                  <strong className="text-destructive">
                    deleting the wallet will permanently destroy your ability to spend or recover
                    those coins
                  </strong>
                  .
                </p>
                <p className="font-bold text-foreground">
                  Deletion cannot proceed while the &quot;no mnemonic backup&quot; flag is set for
                  this wallet and mainnet funds are present. Use Seed Phrase Backup in Management
                  to record your recovery phrase first; then you can delete the wallet if you still
                  want to.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="default" onClick={() => setMainnetBlockedOpen(false)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
