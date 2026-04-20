import { createFileRoute } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { AppDescription } from '@/components/AppDescription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DeveloperContactCard } from '@/components/DeveloperContactCard'
import { LegalNoticeCard } from '@/components/LegalNoticeCard'

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
        </CardContent>
      </Card>

      <DeveloperContactCard />

      <LegalNoticeCard />
    </div>
  )
}
