import { SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabRulesCard } from '@/components/lab/Rules'
import { LabEntitiesCard } from '@/components/lab/LabEntitiesCard'
import { LabResetCard } from '@/components/lab/Reset'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'

export function ControlPage() {
  const labPageData = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Control" icon={SlidersHorizontal} />

      <LabEntitiesCard />

      <LabRulesCard />

      <LabResetCard
        onResetClick={() => labPageData.setShowResetConfirm(true)}
        resetting={labPageData.resetting}
        onConfirmReset={labPageData.onConfirmReset}
        showConfirm={labPageData.showResetConfirm}
        onCancelConfirm={() => labPageData.setShowResetConfirm(false)}
      />
    </>
  )
}
