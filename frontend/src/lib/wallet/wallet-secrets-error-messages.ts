import { errorMessage } from '@/lib/shared/utils'

function errorTextLowercase(err: unknown): string {
  return err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
}

/** Returns user-facing copy for decrypt/secrets failures, or null when unrelated. */
export function tryMapWalletSecretsError(err: unknown): string | null {
  const errorMessageLowercase = errorTextLowercase(err)
  if (
    errorMessageLowercase.includes('password') ||
    errorMessageLowercase.includes('decrypt') ||
    errorMessageLowercase.includes('incorrect') ||
    errorMessageLowercase.includes('corrupted') ||
    errorMessageLowercase.includes('schema validation failed')
  ) {
    return 'Wrong password or corrupted wallet data'
  }
  if (
    errorMessageLowercase.includes('secrets') &&
    errorMessageLowercase.includes('not found')
  ) {
    return 'Wallet data not found'
  }
  return null
}

/** Maps decrypt / secrets failures to short user-facing unlock copy. */
export function toUserFriendlyWalletSecretsError(err: unknown): string {
  return (
    tryMapWalletSecretsError(err) ??
    (errorMessage(err).length > 0 ? errorMessage(err) : 'Could not unlock wallet')
  )
}
