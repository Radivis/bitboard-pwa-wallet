import { Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
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
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Features</DesignCardTitle>
            <DesignCardDescription>
              Enable optional wallet capabilities.
            </DesignCardDescription>
          </DesignCardHeader>
          <DesignCardContent>
            <FeatureToggles />
          </DesignCardContent>
        </DesignCard>
      </InfomodeWrapper>
    </div>
  )
}
