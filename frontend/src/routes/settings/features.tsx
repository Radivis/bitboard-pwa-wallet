import { createFileRoute } from '@tanstack/react-router'
import { SettingsFeaturesPage } from '@/pages/settings/SettingsFeaturesPage'

export { SettingsFeaturesPage } from '@/pages/settings/SettingsFeaturesPage'

export const Route = createFileRoute('/settings/features')({
  component: SettingsFeaturesPage,
})
