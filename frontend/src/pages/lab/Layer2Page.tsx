import { Zap } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'

export function Layer2Page() {
  return (
    <>
      <PageHeader title="Layer 2" icon={Zap} />
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>Lightning</DesignCardTitle>
          <DesignCardDescription>Lab layer two</DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent>
          <p className="text-sm text-muted-foreground">
            Lightning in the lab is under construction.
          </p>
        </DesignCardContent>
      </DesignCard>
    </>
  )
}
