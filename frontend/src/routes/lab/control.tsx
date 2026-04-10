import { createFileRoute } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LabRulesCard } from '@/components/lab/Rules'
import { LabResetCard } from '@/components/lab/Reset'
import { useLabIndexPageData } from '@/hooks/useLabIndexPageData'

export const Route = createFileRoute('/lab/control')({
  component: LabControlPage,
})

function LabControlPage() {
  const lab = useLabIndexPageData()

  return (
    <>
      <PageHeader title="Control" icon={SlidersHorizontal} />

      <LabRulesCard />

      <LabResetCard
        onResetClick={() => lab.setShowResetConfirm(true)}
        resetting={lab.resetting}
        onConfirmReset={lab.onConfirmReset}
        showConfirm={lab.showResetConfirm}
        onCancelConfirm={() => lab.setShowResetConfirm(false)}
      />
    </>
  )
}
