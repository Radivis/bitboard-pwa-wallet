import { createFileRoute } from '@tanstack/react-router'
import { SettingsMainPage } from '@/pages/settings/SettingsMainPage'

export { SettingsMainPage } from '@/pages/settings/SettingsMainPage'

export const Route = createFileRoute('/settings/')({
  component: SettingsMainPage,
})
