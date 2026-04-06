import { AlertTriangle } from 'lucide-react'

/**
 * Prominent warning shown on app password flows: there is no password recovery;
 * losing the password can mean permanent loss of access to funds without a safe mnemonic backup.
 */
export function AppPasswordFundsLossWarning() {
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-sm text-red-950 shadow-sm dark:border-red-500 dark:bg-red-950/45 dark:text-red-50"
    >
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 h-6 w-6 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden
        />
        <div className="min-w-0 space-y-2 leading-snug">
          <p className="text-base font-semibold tracking-tight">
            Bitboard cannot recover your app password.
          </p>
          <p className="leading-relaxed">
            There is no “forgot password” or reset. If you lose this password, you may{' '}
            <span className="font-semibold">permanently lose access to your funds</span>
            — especially if your recovery phrase (mnemonic) was not backed up safely somewhere
            else.
          </p>
        </div>
      </div>
    </div>
  )
}
