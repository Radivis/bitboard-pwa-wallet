import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useUpdateWallet, useWallet, useWallets } from '@/db'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { DeleteWalletSection } from '@/components/wallet/DeleteWalletSection'

const MAX_WALLET_NAME_LENGTH = 128

export type WalletManagementProps = {
  deleteWalletAutoOpen?: boolean
  onDeleteWalletAutoOpenConsumed?: () => void
}

export function WalletManagement({
  deleteWalletAutoOpen = false,
  onDeleteWalletAutoOpenConsumed,
}: WalletManagementProps = {}) {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const { data: wallets } = useWallets()
  const { data: walletRow, isSuccess: walletRowLoaded } = useWallet(activeWalletId)
  const updateWallet = useUpdateWallet()
  const [draftName, setDraftName] = useState('')
  const hasMultipleWallets = (wallets?.length ?? 0) > 1

  useEffect(() => {
    if (walletRowLoaded && walletRow?.name !== undefined) {
      setDraftName(walletRow.name)
    }
  }, [activeWalletId, walletRowLoaded, walletRow?.name])

  if (!activeWalletId) return null

  const trimmedDraft = draftName.trim()
  const storedName = (walletRow?.name ?? '').trim()
  const nameValid =
    trimmedDraft.length > 0 && trimmedDraft.length <= MAX_WALLET_NAME_LENGTH
  const nameChanged = trimmedDraft !== storedName

  const handleSaveWalletName = async () => {
    if (!nameValid) {
      if (trimmedDraft.length === 0) {
        toast.error('Enter a wallet name')
      } else {
        toast.error(`Name must be at most ${MAX_WALLET_NAME_LENGTH} characters`)
      }
      return
    }
    await updateWallet.mutateAsync({
      walletId: activeWalletId,
      walletChanges: { name: trimmedDraft },
    })
    toast.success('Wallet name updated')
  }

  return (
    <DesignCard>
      <DesignCardHeader>
        <DesignCardTitle>Wallet Management</DesignCardTitle>
        <DesignCardDescription>
          Rename this wallet, add another, or switch between wallets when you have more than one.
        </DesignCardDescription>
      </DesignCardHeader>
      <DesignCardContent className="space-y-6">
        <InfomodeWrapper
          infoId="wallet-rename"
          infoTitle="Wallet name"
          infoText="This label is only used inside Bitboard (for example in the header and wallet list). It is not sent to the Bitcoin network and does not affect your recovery phrase or addresses."
          className="space-y-2"
        >
          <Label htmlFor="wallet-display-name">Wallet name</Label>
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
            <DesignInput
              id="wallet-display-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={MAX_WALLET_NAME_LENGTH}
              autoComplete="off"
              className="sm:flex-1"
            />
            <DesignButton
              type="button"
              appearance="tertiary"
              disabled={!nameChanged || !nameValid || updateWallet.isPending}
              onClick={() => void handleSaveWalletName()}
            >
              Save name
            </DesignButton>
          </div>
        </InfomodeWrapper>
        <div className="flex flex-wrap gap-2">
          <InfomodeWrapper
            infoId="wallet-add-wallet"
            infoTitle="Add wallet"
            infoText="Opens the setup flow so you can create a brand-new wallet or import another recovery phrase. Use the same Bitboard app password you already set—it encrypts every wallet on this device. If your session is locked, you will unlock first. You can switch between wallets from the wallet list when you have more than one."
          >
            <DesignButton appearance="secondary" onClick={() => navigate({ to: '/setup' })}>
              Add Wallet
            </DesignButton>
          </InfomodeWrapper>
          {hasMultipleWallets && (
            <DesignButton
              appearance="secondary"
              onClick={() => navigate({ to: '/wallet/wallets' })}
            >
              Switch Wallet
            </DesignButton>
          )}
        </div>
        <DeleteWalletSection
          autoOpenFirstDialog={deleteWalletAutoOpen}
          onAutoOpenConsumed={onDeleteWalletAutoOpenConsumed}
        />
      </DesignCardContent>
    </DesignCard>
  )
}
