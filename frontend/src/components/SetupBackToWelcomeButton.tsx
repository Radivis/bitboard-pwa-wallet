import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ensureMigrated, getDatabase } from '@/db'
import { userFacingErrorMessage } from '@/lib/shared/utils'
import { abandonFirstRunAppPasswordChoiceIfNoWallets } from '@/lib/wallet/abandon-first-run-app-password-choice'

/** Returns to /setup and unlocks the first-run password / near-zero choice when no wallet exists yet. */
export function SetupBackToWelcomeButton() {
  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)

  const leaveSetupForWelcome = async () => {
    try {
      await ensureMigrated()
      await abandonFirstRunAppPasswordChoiceIfNoWallets(getDatabase())
      await navigate({ to: '/setup' })
    } catch (err) {
      toast.error(userFacingErrorMessage(err))
      setIsLeaving(false)
    }
  }

  const handleBackToSetup = () => {
    if (isLeaving) return
    setIsLeaving(true)
    void leaveSetupForWelcome()
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
