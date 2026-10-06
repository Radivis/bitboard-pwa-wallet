import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import {
  getBarkEmergencyExitAutomationActivity,
  stopBarkEmergencyExitAutomation,
  syncBarkEmergencyExitAutomation,
} from '@/lib/bark/bark-emergency-exit-automation'
import { replaceBarkLoadLifecycleSnapshotForTests, resetBarkLoadLifecycleStateForTests } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'

const readProceedAutomatically = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({
    readProceedAutomatically,
  }),
}))

describe('Bark emergency exit automation errors', () => {
  afterEach(() => {
    stopBarkEmergencyExitAutomation()
    resetBarkLoadLifecycleStateForTests()
    useFeatureStore.setState({ isBarkEnabled: false })
    useWalletStore.setState({
      walletStatus: 'none',
      activeWalletId: null,
      networkMode: 'regtest',
      loadedDescriptorWallet: null,
    })
    vi.mocked(toast.error).mockReset()
  })

  it('keeps the full progress error and leaves the error toast until it is dismissed', async () => {
    const childRejectReason = 'version=3 child would have too many ancestors'
    useFeatureStore.setState({ isBarkEnabled: true })
    useWalletStore.setState({
      walletStatus: 'unlocked',
      activeWalletId: 1,
      networkMode: 'signet',
      loadedDescriptorWallet: null,
    })
    replaceBarkLoadLifecycleSnapshotForTests({
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: null,
    })
    readProceedAutomatically.mockRejectedValue(
      new Error(`${'p'.repeat(400)} https://explorer.example/tx/abc ${childRejectReason}`),
    )

    await syncBarkEmergencyExitAutomation({ walletId: 1, networkMode: 'signet' })

    const shown = getBarkEmergencyExitAutomationActivity().errorMessage
    expect(shown).toContain(childRejectReason)
    expect(shown).toContain('[url]')
    expect(shown).not.toContain('https://')
    expect(toast.error).toHaveBeenCalledWith(shown, { duration: Number.POSITIVE_INFINITY })
  })
})
