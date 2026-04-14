import { toast } from 'sonner'
import { errorMessage } from '@/lib/utils'

/**
 * Runs async “turn feature off” work with loading state and consistent error toasts.
 */
export async function runFeatureToggleOffWork(
  setBusy: (busy: boolean) => void,
  work: () => Promise<void>,
  fallbackMessage: string,
): Promise<void> {
  setBusy(true)
  try {
    await work()
  } catch (err) {
    toast.error(errorMessage(err) ?? fallbackMessage)
  } finally {
    setBusy(false)
  }
}
