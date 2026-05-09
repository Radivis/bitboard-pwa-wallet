import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPage } from '@/pages/privacy/PrivacyPage'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})
