import { Shield } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { cn } from '@/lib/shared/utils'

export interface SettingsSecurityCardProps {
  hasWallets: boolean
  nearZeroActive: boolean
  onOpenChangePassword: () => void
  onOpenUpgradeFromNearZero: () => void
}

export function SettingsSecurityCard({
  hasWallets,
  nearZeroActive,
  onOpenChangePassword,
  onOpenUpgradeFromNearZero,
}: SettingsSecurityCardProps) {
  return (
    <InfomodeWrapper
      infoId="settings-security-card"
      infoTitle="Security"
      infoText="Change the Bitboard app password that encrypts all wallets on this device. With a normal password you will need your current password; if you still use near-zero security mode, use Set a real password instead. All stored secrets are re-encrypted in one atomic step so your data never sits half-updated."
      className="rounded-xl"
    >
      <DesignCard
        data-testid="settings-security-card"
        className={cn(
          nearZeroActive && 'border-2 border-destructive shadow-sm ring-1 ring-destructive/20',
        )}
      >
        <DesignCardHeader>
          <DesignCardTitle>
            <Shield className="h-5 w-5" />
            Security
          </DesignCardTitle>
          <DesignCardDescription>
            Update the password used to encrypt wallet data in this browser.
          </DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent className="gap-3">
          {nearZeroActive ? (
            <>
              <DesignButton
                type="button"
                appearance="tertiary"
                onClick={onOpenUpgradeFromNearZero}
              >
                Set a real password
              </DesignButton>
              <p className="text-sm text-muted-foreground">
                You are in near-zero security mode. Setting a real password replaces the weak
                storage and encrypts your wallets with a password only you know.
              </p>
            </>
          ) : (
            <>
              <DesignButton
                type="button"
                appearance="tertiary"
                disabled={!hasWallets}
                onClick={onOpenChangePassword}
              >
                Change app password
              </DesignButton>
              {!hasWallets && (
                <p className="text-sm text-muted-foreground">
                  Add a wallet first—there is nothing encrypted to re-encrypt yet.
                </p>
              )}
            </>
          )}
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}
