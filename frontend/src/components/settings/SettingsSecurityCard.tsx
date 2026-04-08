import { Shield } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
      <Card
        data-testid="settings-security-card"
        className={cn(
          nearZeroActive && 'border-2 border-destructive shadow-sm ring-1 ring-destructive/20',
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Update the password used to encrypt wallet data in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {nearZeroActive ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenUpgradeFromNearZero}
              >
                Set a real password
              </Button>
              <p className="text-sm text-muted-foreground">
                You are in near-zero security mode. Setting a real password replaces the weak
                storage and encrypts your wallets with a password only you know.
              </p>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={!hasWallets}
                onClick={onOpenChangePassword}
              >
                Change app password
              </Button>
              {!hasWallets && (
                <p className="text-sm text-muted-foreground">
                  Add a wallet first—there is nothing encrypted to re-encrypt yet.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
