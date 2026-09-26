import { toast } from 'sonner'

export const BUMPER_HYDRATE_FALLBACK_WARNING =
  'Saved bumper wallet data could not be restored. The bumper balance may be empty until the next scan.'

export function reportBumperHydrateFallbackWarning(): void {
  toast.warning(BUMPER_HYDRATE_FALLBACK_WARNING)
}
