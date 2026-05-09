import { Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FeatureToggles } from '@/components/settings/FeatureToggles'

export function SettingsFeaturesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Features" icon={Sparkles} />

      <InfomodeWrapper
        infoId="settings-features-card"
        infoTitle="Features"
        infoText="Enable or disable optional wallet features. These are advanced capabilities that go beyond basic Bitcoin on-chain operations. Mainnet access must be turned on here before you can select Mainnet under Network. Each feature can be turned on independently when you are ready to explore it."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>
              Enable optional wallet capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureToggles />
          </CardContent>
        </Card>
      </InfomodeWrapper>
    </div>
  )
}
