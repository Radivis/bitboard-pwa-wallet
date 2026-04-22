/* eslint-disable react-refresh/only-export-components -- field group exports supporting types alongside UI */
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { APP_PASSWORD_MIN_LENGTH } from '@/lib/app-password-policy'

export { APP_PASSWORD_MIN_LENGTH }

export interface AppPasswordFieldsConfig {
  ids: {
    newPassword: string
    confirmPassword: string
  }
  infoIds: {
    passwordLabel: string
    strength: string
  }
}

interface AppPasswordFieldsProps {
  config: AppPasswordFieldsConfig
  newPassword: string
  confirmPassword: string
  onNewPasswordChange: (value: string) => void
  onConfirmPasswordChange: (value: string) => void
  /** When false, omit autoFocus on the new-password input (e.g. change flow has current password first). */
  autoFocusNewPassword?: boolean
}

/**
 * Shared new + confirm password inputs, strength meter, and Infomode explainers.
 * Used by first-run SetAppPasswordModal and Settings ChangeAppPasswordModal.
 */
export function AppPasswordFields({
  config,
  newPassword,
  confirmPassword,
  onNewPasswordChange,
  onConfirmPasswordChange,
  autoFocusNewPassword = true,
}: AppPasswordFieldsProps) {
  const { ids, infoIds } = config
  const passwordsMatch = confirmPassword.length === 0 || newPassword === confirmPassword

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={ids.newPassword}>
          <InfomodeWrapper
            as="span"
            infoId={infoIds.passwordLabel}
            infoTitle="Bitboard app password"
            infoText="This password is only for Bitboard in this browser. It encrypts your wallet data on this device. The same password protects every wallet you add here. Your recovery words are what move between apps—not this password."
          >
            Password
          </InfomodeWrapper>
        </Label>
        <PasswordInput
          id={ids.newPassword}
          passwordKind="app"
          nameSuffix="new"
          value={newPassword}
          onChange={(e) => onNewPasswordChange(e.target.value)}
          placeholder="Enter a strong password"
          autoFocus={autoFocusNewPassword}
        />
        <InfomodeWrapper
          as="div"
          className="w-full"
          infoId={infoIds.strength}
          infoTitle="Why a strong password matters"
          infoText="Bitboard derives encryption keys from this password to protect your wallet secrets on this device. A stronger password makes guessing and cracking much harder for anyone who gets access to stored data or your unlocked session. It does not replace your recovery phrase—the phrase backs up your funds elsewhere; this password protects the encrypted copy in this browser."
        >
          {newPassword ? (
            <PasswordStrengthIndicator password={newPassword} />
          ) : (
            <p className="text-xs text-muted-foreground">Strength feedback appears as you type.</p>
          )}
        </InfomodeWrapper>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.confirmPassword}>Confirm password</Label>
        <PasswordInput
          id={ids.confirmPassword}
          passwordKind="app"
          nameSuffix="confirm"
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          placeholder="Confirm your password"
        />
        {confirmPassword && !passwordsMatch && (
          <p className="text-xs text-destructive">Passwords do not match</p>
        )}
      </div>
    </>
  )
}

export function isNewAppPasswordValid(
  newPassword: string,
  confirmPassword: string,
): boolean {
  return (
    newPassword.length >= APP_PASSWORD_MIN_LENGTH && newPassword === confirmPassword
  )
}
