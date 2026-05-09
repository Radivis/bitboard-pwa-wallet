import { createFileRoute } from '@tanstack/react-router'
import { SettingsAboutPage } from '@/pages/settings/SettingsAboutPage'

export { SettingsAboutPage } from '@/pages/settings/SettingsAboutPage'

export const Route = createFileRoute('/settings/about')({
  component: SettingsAboutPage,
})
