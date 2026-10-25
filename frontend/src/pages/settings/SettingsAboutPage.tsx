import { Info } from 'lucide-react'
import { GITHUB_CHANGELOG_URL } from '@common/public-links'
import { PageHeader } from '@/components/PageHeader'
import { AppDescription } from '@/components/AppDescription'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DeveloperContactCard } from '@/components/DeveloperContactCard'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'

const aboutExternalLinkClass =
  'text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function SettingsAboutPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="About" icon={Info} />

      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>About</DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent className="design-type-regular gap-2 text-[var(--design-text-card-description)]">
          <p>Bitcoin Codex &mdash; from zero to clarity.</p>
          <AppDescription />
          <p>Version {import.meta.env.VITE_APP_VERSION}</p>
          <p>
            <a
              className={aboutExternalLinkClass}
              href={GITHUB_CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Changelog
            </a>
          </p>
        </DesignCardContent>
      </DesignCard>

      <DeveloperContactCard />

      <LegalNoticeCard />
    </div>
  )
}
