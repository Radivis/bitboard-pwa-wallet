import { createFileRoute } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { GITHUB_CHANGELOG_URL } from '@common/public-links'
import { PageHeader } from '@/components/PageHeader'
import { AppDescription } from '@/components/AppDescription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DeveloperContactCard } from '@/components/DeveloperContactCard'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'

const aboutExternalLinkClass =
  'text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export const Route = createFileRoute('/settings/about')({
  component: SettingsAboutPage,
})

export function SettingsAboutPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="About" icon={Info} />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Bitboard Wallet &mdash; from zero to clarity.</p>
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
        </CardContent>
      </Card>

      <DeveloperContactCard />

      <LegalNoticeCard />
    </div>
  )
}
