import { useNavigate } from '@tanstack/react-router'
import { Trash2, Wallet } from 'lucide-react'
import { useWallets } from '@/db'
import { prepareActiveWalletSwitch } from '@/lib/wallet/prepare-active-wallet-switch'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'

export function WalletsPage() {
  const navigate = useNavigate()
  const { data: wallets, isLoading } = useWallets()

  const handleSelectWallet = async (walletId: number) => {
    await prepareActiveWalletSwitch(walletId)
    navigate({ to: '/wallet' })
  }

  /**
   * Delete requires this wallet to be active and (for the mainnet check) eventually unlocked.
   * Reuse the same lock/switch pattern as selecting a wallet, then open Management with
   * `openDelete` so the delete flow runs there.
   */
  const handleDeleteWalletIntent = async (event: React.MouseEvent, walletId: number) => {
    event.stopPropagation()
    await prepareActiveWalletSwitch(walletId)
    navigate({ to: '/wallet/management', search: { openDelete: true } })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner text="Loading wallets..." />
      </div>
    )
  }

  if (!wallets || wallets.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="design-type-screen-heading">Select Wallet</h2>
        <p className="design-type-regular mt-1 text-muted-foreground">
          Choose a wallet to use
        </p>
      </div>

      <div className="space-y-3">
        {wallets.map((wallet) => (
          <DesignCard
            key={wallet.walletId}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => handleSelectWallet(wallet.walletId)}
          >
            <DesignCardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <DesignCardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                {wallet.name}
              </DesignCardTitle>
              <DesignButton
                type="button"
                appearance="tertiary"
                className="shrink-0"
                aria-label={`Delete wallet ${wallet.name}`}
                onClick={(e) => void handleDeleteWalletIntent(e, wallet.walletId)}
                icon={<Trash2 />}
              />
            </DesignCardHeader>
            <DesignCardContent>
              <DesignCardDescription>
                Created {new Date(wallet.createdAt).toLocaleDateString()}
              </DesignCardDescription>
            </DesignCardContent>
          </DesignCard>
        ))}
      </div>
    </div>
  )
}
