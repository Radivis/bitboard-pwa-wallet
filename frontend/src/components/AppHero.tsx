import { AppDescription } from '@/components/AppDescription'
import { DesignAppLogo } from '@/components/design/DesignAppLogo'

/** Shared Bitcoin Codex title used on Start and the Guides introduction. */
export function AppHero() {
  return (
    <div className="text-center">
      <h1 className="design-type-hero flex items-center justify-center gap-3">
        <DesignAppLogo className="h-9 w-[30px]" />
        Bitcoin Codex
      </h1>
      <AppDescription className="mt-3" />
    </div>
  )
}
