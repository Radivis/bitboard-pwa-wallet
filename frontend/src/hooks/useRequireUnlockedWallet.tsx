import { useCallback, useRef, useState, type ReactNode } from 'react'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import {
  ensureWalletUnlockedForAction,
  isWalletReadyForSecretsAccess,
  WalletUnlockRequiredError,
} from '@/lib/wallet/require-unlocked-wallet'

type PendingUnlockAction = () => void | Promise<void>

export function useRequireUnlockedWallet(): {
  runWhenUnlocked: (action: PendingUnlockAction) => void
  unlockDialog: ReactNode
} {
  const nearZeroActive = useNearZeroSecurityStore((nearZeroSecurityState) => nearZeroSecurityState.active)
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)
  const pendingActionRef = useRef<PendingUnlockAction | null>(null)

  const runPendingAction = useCallback(() => {
    const pendingAction = pendingActionRef.current
    pendingActionRef.current = null
    if (pendingAction != null) {
      void Promise.resolve(pendingAction())
    }
  }, [])

  const runWhenUnlocked = useCallback(
    (action: PendingUnlockAction) => {
      if (isWalletReadyForSecretsAccess()) {
        void Promise.resolve(action())
        return
      }

      if (nearZeroActive) {
        void ensureWalletUnlockedForAction()
          .then(() => action())
          .catch((error) => {
            if (error instanceof WalletUnlockRequiredError) {
              pendingActionRef.current = action
              setShowUnlockDialog(true)
              return
            }
            throw error
          })
        return
      }

      pendingActionRef.current = action
      setShowUnlockDialog(true)
    },
    [nearZeroActive],
  )

  const unlockDialog = showUnlockDialog ? (
    <WalletUnlock
      onDismiss={() => {
        pendingActionRef.current = null
        setShowUnlockDialog(false)
      }}
      onUnlockSuccess={() => {
        setShowUnlockDialog(false)
        runPendingAction()
      }}
    />
  ) : null

  return { runWhenUnlocked, unlockDialog }
}
