import { barkEmergencyExitProgressDeps } from '@/lib/bark/bark-emergency-exit-progress-deps'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { progressBarkEmergencyExits } from '@/lib/bark/perform-bark-emergency-exit'
import { presetRatesForNetwork } from '@/hooks/useEsploraFeePresets'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { fetchEsploraChainTip, getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { getBarkLoadLifecycleSnapshot, subscribeBarkLoadLifecycle } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import type { BarkRailNetwork } from '@/lib/wallet/wallet-domain-types'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

/** Production poll. Signet and mainnet blocks are minutes apart. */
export const BARK_EMERGENCY_EXIT_TIP_POLL_MS = 15_000

/** Regtest blocks arrive when a test mines them. */
export const BARK_EMERGENCY_EXIT_TIP_POLL_MS_REGTEST = 2_000

export function barkEmergencyExitTipPollMs(networkMode: string): number {
  return networkMode === 'regtest'
    ? BARK_EMERGENCY_EXIT_TIP_POLL_MS_REGTEST
    : BARK_EMERGENCY_EXIT_TIP_POLL_MS
}

export type BarkEmergencyExitTip = {
  height: number
  hash: string
}

export type BarkEmergencyExitAutomationSessionGate = {
  proceedAutomatically: boolean
  walletUnlocked: boolean
  sameWallet: boolean
  sameNetwork: boolean
  sessionLoaded: boolean
}

export type BarkEmergencyExitAutomationGate = BarkEmergencyExitAutomationSessionGate & {
  exitCount: number
  previousTip: BarkEmergencyExitTip | null
  nextTip: BarkEmergencyExitTip
  justBecameActive: boolean
}

export type BarkEmergencyExitAutomationScope = {
  walletId: number
  networkMode: BarkRailNetwork
}

/** A missing previous tip counts as a change. A reorg at the same height changes the hash. */
export function barkEmergencyExitTipChanged(
  previousTip: BarkEmergencyExitTip | null,
  nextTip: BarkEmergencyExitTip,
): boolean {
  if (previousTip == null) return true
  return previousTip.height !== nextTip.height || previousTip.hash !== nextTip.hash
}

/**
 * Automatic progress runs only for this wallet, on this network, while unlocked,
 * with at least one exit, and only when the tip moved or automation just turned on.
 */
export function shouldProgressBarkEmergencyExitOnTip(
  gate: BarkEmergencyExitAutomationGate,
): boolean {
  if (!gate.proceedAutomatically) return false
  if (!gate.walletUnlocked) return false
  if (!gate.sameWallet) return false
  if (!gate.sameNetwork) return false
  if (!gate.sessionLoaded) return false
  if (gate.exitCount < 1) return false
  return gate.justBecameActive || barkEmergencyExitTipChanged(gate.previousTip, gate.nextTip)
}

export async function watchBarkEmergencyExitTips(deps: {
  signal: AbortSignal
  readGate: () => Promise<BarkEmergencyExitAutomationSessionGate>
  fetchTip: () => Promise<BarkEmergencyExitTip>
  listExitCount: () => Promise<number>
  progress: () => Promise<void>
  wait: (signal: AbortSignal) => Promise<void>
  afterProgress?: () => Promise<void>
}): Promise<void> {
  let previousTip: BarkEmergencyExitTip | null = null
  let justBecameActive = true
  while (!deps.signal.aborted) {
    let session: BarkEmergencyExitAutomationSessionGate
    try {
      session = await deps.readGate()
    } catch {
      if (deps.signal.aborted) return
      await deps.wait(deps.signal)
      continue
    }
    if (deps.signal.aborted) return
    if (!sessionStillAllowsAutomation(session)) return

    let nextTip: BarkEmergencyExitTip
    try {
      nextTip = await deps.fetchTip()
    } catch {
      if (deps.signal.aborted) return
      await deps.wait(deps.signal)
      continue
    }
    if (deps.signal.aborted) return

    let exitCount: number
    try {
      exitCount = await deps.listExitCount()
    } catch {
      if (deps.signal.aborted) return
      await deps.wait(deps.signal)
      continue
    }
    if (deps.signal.aborted) return

    if (
      shouldProgressBarkEmergencyExitOnTip({
        ...session,
        exitCount,
        previousTip,
        nextTip,
        justBecameActive,
      })
    ) {
      try {
        await deps.progress()
        previousTip = nextTip
        justBecameActive = false
        if (deps.afterProgress != null) {
          await deps.afterProgress()
        }
      } catch {
        // The next poll retries this tip. A failed broadcast must not look finished.
      }
    }
    if (deps.signal.aborted) return
    await deps.wait(deps.signal)
  }
}

function sessionStillAllowsAutomation(session: BarkEmergencyExitAutomationSessionGate): boolean {
  return (
    session.proceedAutomatically &&
    session.walletUnlocked &&
    session.sameWallet &&
    session.sameNetwork &&
    session.sessionLoaded
  )
}

type ActiveAutomationRun = {
  generation: number
  abort: AbortController
  unsubscribe: () => void
}

let automationGeneration = 0
let activeAutomationRun: ActiveAutomationRun | null = null

/** Stops the tip loop. Unlocking on the same network starts it again when the switch is on. */
export function stopBarkEmergencyExitAutomation(): void {
  automationGeneration += 1
  const running = activeAutomationRun
  activeAutomationRun = null
  running?.abort.abort()
  running?.unsubscribe()
}

/**
 * Starts the tip loop when this wallet's rail has automatic proceeding on and the
 * Bark session is loaded for that same wallet and network. A no-op otherwise.
 */
export async function syncBarkEmergencyExitAutomation(
  scope: BarkEmergencyExitAutomationScope,
): Promise<void> {
  const token = ++automationGeneration
  const previous = activeAutomationRun
  activeAutomationRun = null
  previous?.abort.abort()
  previous?.unsubscribe()

  const session = readLiveSessionGate(scope)
  if (!session.walletUnlocked || !session.sameWallet || !session.sameNetwork || !session.sessionLoaded) {
    return
  }
  const proceedAutomatically = await getBarkWorker().readProceedAutomatically()
  if (token !== automationGeneration || !proceedAutomatically) return
  if (!readLiveSessionGate(scope).sessionLoaded) return

  const abort = new AbortController()
  const unsubscribeWallet = useWalletStore.subscribe(() => {
    if (!liveSessionStillMatches(scope)) {
      stopBarkEmergencyExitAutomation()
    }
  })
  const unsubscribeLoad = subscribeBarkLoadLifecycle(() => {
    if (!liveSessionStillMatches(scope)) {
      stopBarkEmergencyExitAutomation()
    }
  })
  const unsubscribe = () => {
    unsubscribeWallet()
    unsubscribeLoad()
  }
  if (token !== automationGeneration) {
    unsubscribe()
    return
  }
  activeAutomationRun = { generation: token, abort, unsubscribe }
  try {
    await watchBarkEmergencyExitTips({
      signal: abort.signal,
      readGate: () => readPersistedSessionGate(scope),
      fetchTip: () => fetchTipForNetwork(scope.networkMode),
      listExitCount: async () => (await getBarkWorker().listEmergencyExits()).length,
      progress: () => progressOpenEmergencyExits(scope),
      wait: (signal) => waitForBarkEmergencyExitTipPoll(scope.networkMode, signal),
      afterProgress: () => invalidateBarkEmergencyExitQueries(scope),
    })
  } finally {
    if (activeAutomationRun?.generation === token) {
      activeAutomationRun.unsubscribe()
      activeAutomationRun = null
    }
  }
}

function liveSessionStillMatches(scope: BarkEmergencyExitAutomationScope): boolean {
  const session = readLiveSessionGate(scope)
  return session.walletUnlocked && session.sameWallet && session.sameNetwork && session.sessionLoaded
}

function readLiveSessionGate(
  scope: BarkEmergencyExitAutomationScope,
): Omit<BarkEmergencyExitAutomationSessionGate, 'proceedAutomatically'> {
  const wallet = useWalletStore.getState()
  const load = getBarkLoadLifecycleSnapshot()
  const committedNetwork = selectCommittedNetworkMode(wallet)
  return {
    walletUnlocked: walletIsUnlockedOrSyncing(wallet.walletStatus),
    sameWallet: wallet.activeWalletId === scope.walletId,
    sameNetwork:
      committedNetwork === scope.networkMode && load.networkMode === scope.networkMode,
    sessionLoaded:
      load.loadPhase === 'loaded' &&
      load.networkMode === scope.networkMode &&
      isBarkActiveForNetworkMode(scope.networkMode),
  }
}

async function readPersistedSessionGate(
  scope: BarkEmergencyExitAutomationScope,
): Promise<BarkEmergencyExitAutomationSessionGate> {
  const proceedAutomatically = await getBarkWorker().readProceedAutomatically()
  return { ...readLiveSessionGate(scope), proceedAutomatically }
}

async function fetchTipForNetwork(networkMode: BarkRailNetwork): Promise<BarkEmergencyExitTip> {
  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)
  if (esploraUrl.length === 0) {
    throw new Error('Esplora URL is missing')
  }
  return fetchEsploraChainTip(esploraUrl)
}

async function progressOpenEmergencyExits(
  scope: BarkEmergencyExitAutomationScope,
): Promise<void> {
  const feeRates = await presetRatesForNetwork(scope.networkMode)
  await progressBarkEmergencyExits(barkEmergencyExitProgressDeps(), feeRates.High)
}

async function invalidateBarkEmergencyExitQueries(
  scope: BarkEmergencyExitAutomationScope,
): Promise<void> {
  await appQueryClient.invalidateQueries({
    queryKey: ['bark', 'emergency-exits', scope.walletId, scope.networkMode],
  })
  await appQueryClient.invalidateQueries({
    queryKey: ['bark', 'exit-topology', scope.walletId, scope.networkMode],
  })
  await appQueryClient.invalidateQueries({
    queryKey: ['bark', 'vtxos', scope.walletId, scope.networkMode],
  })
}

function waitForBarkEmergencyExitTipPoll(
  networkMode: BarkRailNetwork,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', finish)
      resolve()
    }, barkEmergencyExitTipPollMs(networkMode))
    function finish() {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}
