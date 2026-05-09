import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SettingsSecurityCard } from '@/components/settings/SettingsSecurityCard'
import { CompleteDataWipeCard } from '@/components/settings/CompleteDataWipeCard'
import { DataBackupsCard } from '@/components/settings/DataBackupsCard'
import { ChangeAppPasswordModal } from '@/components/ChangeAppPasswordModal'
import { UpgradeFromNearZeroPasswordModal } from '@/components/UpgradeFromNearZeroPasswordModal'
import { useWallets } from '@/db'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'

export function SettingsSecurityPage() {
  const { section } = useSearch({ from: '/settings/security' })
  const navigate = useNavigate({ from: '/settings/security' })

  useEffect(() => {
    if (section !== 'data-backups') return
    document.getElementById('data-backups')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    void navigate({ search: {}, replace: true })
  }, [section, navigate])

  const { data: wallets } = useWallets()
  const hasWallets = (wallets?.length ?? 0) > 0
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [upgradeFromNearZeroOpen, setUpgradeFromNearZeroOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader title="Security" icon={Shield} />

      <SettingsSecurityCard
        hasWallets={hasWallets}
        nearZeroActive={nearZeroActive}
        onOpenChangePassword={() => setChangePasswordOpen(true)}
        onOpenUpgradeFromNearZero={() => setUpgradeFromNearZeroOpen(true)}
      />

      <ChangeAppPasswordModal
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />

      <UpgradeFromNearZeroPasswordModal
        open={upgradeFromNearZeroOpen}
        onOpenChange={setUpgradeFromNearZeroOpen}
      />

      <DataBackupsCard />

      <CompleteDataWipeCard />
    </div>
  )
}
