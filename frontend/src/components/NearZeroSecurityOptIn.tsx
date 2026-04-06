import { AlertTriangle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ensureMigrated, getDatabase, generateAndPersistNearZeroSession } from '@/db'
import { errorMessage } from '@/lib/utils'

/**
 * First-run optional path: "quick start" with cryptographically weak storage (see plan).
 */
export function NearZeroSecurityOptIn() {
  const mutation = useMutation({
    mutationFn: async () => {
      await ensureMigrated()
      await generateAndPersistNearZeroSession(getDatabase())
    },
    onError: (err) => {
      toast.error(
        errorMessage(err) || 'Could not enable near-zero security mode. Try again.',
      )
    },
  })

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-center text-xs text-muted-foreground">or</p>
      <div
        role="region"
        aria-label="Near-zero security mode"
        className="rounded-lg border-2 border-red-700 bg-red-50 p-4 text-sm text-red-950 shadow-sm dark:border-red-600 dark:bg-red-950/50 dark:text-red-50"
      >
        <div className="flex gap-3">
          <AlertTriangle
            className="mt-0.5 h-6 w-6 shrink-0 text-red-700 dark:text-red-400"
            aria-hidden
          />
          <div className="min-w-0 space-y-2">
            <p className="text-base font-semibold leading-snug">Near-zero security mode</p>
            <p className="leading-relaxed">
              Bitboard will generate a random secret and store it in this browser&apos;s database
              wrapped with a <span className="font-medium">fixed passphrase that is published in the
              source code</span>. Anyone who can read your stored data can decrypt your wallets—this
              is only slightly better than plaintext. Use this only to try the app; set a real
              password as soon as you can.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="mt-1 w-full"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Enabling…' : 'Use near-zero security mode'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
