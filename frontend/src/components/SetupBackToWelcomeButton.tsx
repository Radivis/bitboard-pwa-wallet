import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ensureMigrated, getDatabase } from '@/db'
import { abandonFirstRunAppPasswordChoiceIfNoWallets } from '@/lib/wallet/abandon-first-run-app-password-choice'

/** Returns to /setup and unlocks the first-run password / near-zero choice when no wallet exists yet. */
export function SetupBackToWelcomeButton() {
  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)

  const handleBackToSetup = () => {
    if (isLeaving) return
    setIsLeaving(true)
    void (async () => {
      try {
        await ensureMigrated()
        await abandonFirstRunAppPasswordChoiceIfNoWallets(getDatabase())
        navigate({ to: '/setup' })
      } catch {
        setIsLeaving(false)
      }
    })()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Back to setup"
      disabled={isLeaving}
      onClick={handleBackToSetup}
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  )
}
