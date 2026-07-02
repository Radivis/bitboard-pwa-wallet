import { useCallback, useEffect, useRef, useState } from 'react'
import type { WalletStatus } from '@/stores/walletStore'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

/**
 * Setup create/import pages need the app password before wallet encrypt flows.
 * Unlocked wallets use {@link walletUnlockedOrSyncing}; first-run uses the encryption-worker session.
 */
export function useSetupAppPasswordGateReady(walletStatus: WalletStatus) {
  const [secretsSessionActive, setSecretsSessionActive] = useState(false)
  const sessionCheckGenerationRef = useRef(0)

  const walletUnlockedOrSyncing = walletIsUnlockedOrSyncing(walletStatus)

  useEffect(() => {
    const generation = ++sessionCheckGenerationRef.current
    void isWalletSecretsSessionActive().then((active) => {
      if (sessionCheckGenerationRef.current === generation) {
        setSecretsSessionActive(active)
      }
    })
  }, [walletStatus])

  const onAppPasswordSessionStarted = useCallback(() => {
    sessionCheckGenerationRef.current += 1
    setSecretsSessionActive(true)
  }, [])

  const appPasswordReady = walletUnlockedOrSyncing || secretsSessionActive

  return { appPasswordReady, walletUnlockedOrSyncing, onAppPasswordSessionStarted }
}
