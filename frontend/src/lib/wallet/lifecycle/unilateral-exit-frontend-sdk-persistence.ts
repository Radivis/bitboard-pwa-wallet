import { sqliteStorage } from '@/db/storage-adapter'
import {
  defaultUnilateralExitAutomationPrefs,
  type UnilateralExitAutomationPrefs,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import { useUnilateralExitFailurePersistenceStore } from '@/lib/wallet/lifecycle/unilateral-exit-failure-persistence'
import {
  migratePersistedUnilateralExitJob,
  useUnilateralExitLifecyclePersistenceStore,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import { arkadeWalletScopeKey, type ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import type {
  PersistedUnilateralExitFailure,
  PersistedUnilateralExitJob,
  UnilateralExitFailureReasonCode,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import { getArkadeWorker } from '@/workers/arkade-factory'
import type {
  ArkadeUnilateralExitAutomationPrefsPersistence,
  ArkadeUnilateralExitFailurePersistence,
  ArkadeUnilateralExitFrontendPersistence,
  ArkadeUnilateralExitJobPersistence,
} from '@/workers/arkade-api'

/** Settings-table keys are a one-shot overlay for migrating older wallets. Primary store is encrypted `sdkPersistenceJson`. */
export const UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY = 'unilateral-exit-lifecycle-storage'
export const UNILATERAL_EXIT_AUTOMATION_PREFS_SETTINGS_KEY = 'unilateral-exit-automation-prefs'
export const UNILATERAL_EXIT_FAILURE_SETTINGS_KEY = 'unilateral-exit-failure-storage'

const JOBS_BY_KEY = 'jobsByKey'
const PREFS_BY_KEY = 'prefsByKey'
const FAILURES_BY_KEY = 'failuresByKey'

type ZustandPersistEnvelope = {
  state?: Record<string, unknown>
  version?: number
}

export function readZustandPersistedMap<T>(
  raw: string | null,
  mapField: string,
): Record<string, T> {
  if (raw == null || raw === '') {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as ZustandPersistEnvelope
    const map = parsed.state?.[mapField]
    if (map != null && typeof map === 'object' && !Array.isArray(map)) {
      return map as Record<string, T>
    }
  } catch {
    return {}
  }
  return {}
}

export function removeScopeKeyFromZustandSettingsJson(
  raw: string | null,
  mapField: string,
  scopeKey: string,
): { nextJson: string | null; mapEmpty: boolean } {
  if (raw == null || raw === '') {
    return { nextJson: null, mapEmpty: true }
  }
  let parsed: ZustandPersistEnvelope
  try {
    parsed = JSON.parse(raw) as ZustandPersistEnvelope
  } catch {
    return { nextJson: raw, mapEmpty: false }
  }
  const map = parsed.state?.[mapField]
  if (map == null || typeof map !== 'object' || Array.isArray(map)) {
    return { nextJson: raw, mapEmpty: false }
  }
  const nextMap = { ...(map as Record<string, unknown>) }
  delete nextMap[scopeKey]
  const mapEmpty = Object.keys(nextMap).length === 0
  if (mapEmpty) {
    return { nextJson: null, mapEmpty: true }
  }
  return {
    nextJson: JSON.stringify({
      ...parsed,
      state: { ...parsed.state, [mapField]: nextMap },
    }),
    mapEmpty: false,
  }
}

function isSendFeePresetLabel(value: string): value is SendFeePresetLabel {
  return value === 'Low' || value === 'Medium' || value === 'High'
}

export function parseUnilateralExitFeePresetLabel(value: string): SendFeePresetLabel {
  return isSendFeePresetLabel(value) ? value : defaultUnilateralExitAutomationPrefs().feePresetLabel
}

function isFailureReasonCode(value: string): value is UnilateralExitFailureReasonCode {
  return (
    value === 'asp_swept_targets' ||
    value === 'branch_funding_lost' ||
    value === 'user_aborted'
  )
}

export function jobFromSdkPersistence(
  job: ArkadeUnilateralExitJobPersistence,
): PersistedUnilateralExitJob {
  return {
    selectedLeafOutpoints: job.selectedLeafOutpoints ?? [],
    currentStepRelayedSinceUnix: job.currentStepRelayedSinceUnix ?? null,
    jobStartedAtUnix: job.jobStartedAtUnix ?? null,
  }
}

export function jobToSdkPersistence(
  job: PersistedUnilateralExitJob,
): ArkadeUnilateralExitJobPersistence {
  return {
    selectedLeafOutpoints: job.selectedLeafOutpoints,
    currentStepRelayedSinceUnix: job.currentStepRelayedSinceUnix,
    jobStartedAtUnix: job.jobStartedAtUnix,
  }
}

export function prefsFromSdkPersistence(
  prefs: ArkadeUnilateralExitAutomationPrefsPersistence,
): UnilateralExitAutomationPrefs {
  const defaults = defaultUnilateralExitAutomationPrefs()
  return {
    enabled: prefs.enabled,
    feePresetLabel: parseUnilateralExitFeePresetLabel(prefs.feePresetLabel),
    maxFeeRateSatPerVb:
      Number.isFinite(prefs.maxFeeRateSatPerVb) && prefs.maxFeeRateSatPerVb > 0
        ? prefs.maxFeeRateSatPerVb
        : defaults.maxFeeRateSatPerVb,
  }
}

export function prefsToSdkPersistence(
  prefs: UnilateralExitAutomationPrefs,
): ArkadeUnilateralExitAutomationPrefsPersistence {
  return {
    enabled: prefs.enabled,
    feePresetLabel: prefs.feePresetLabel,
    maxFeeRateSatPerVb: prefs.maxFeeRateSatPerVb,
  }
}

export function failureFromSdkPersistence(
  failure: ArkadeUnilateralExitFailurePersistence | null | undefined,
): PersistedUnilateralExitFailure | null {
  if (failure == null) {
    return null
  }
  if (!isFailureReasonCode(failure.reasonCode)) {
    return null
  }
  return {
    selectedLeafOutpoints: failure.selectedLeafOutpoints ?? [],
    jobStartedAtUnix: failure.jobStartedAtUnix,
    detectedAtUnix: failure.detectedAtUnix,
    reasonCode: failure.reasonCode,
    detailMessage: failure.detailMessage,
    vtxoIds: failure.vtxoIds ?? [],
  }
}

export function failureToSdkPersistence(
  failure: PersistedUnilateralExitFailure | null,
): ArkadeUnilateralExitFailurePersistence | null {
  if (failure == null) {
    return null
  }
  return {
    selectedLeafOutpoints: failure.selectedLeafOutpoints,
    jobStartedAtUnix: failure.jobStartedAtUnix,
    detectedAtUnix: failure.detectedAtUnix,
    reasonCode: failure.reasonCode,
    detailMessage: failure.detailMessage,
    vtxoIds: failure.vtxoIds,
  }
}

export function resolveUnilateralExitFrontendBundle(params: {
  wasmBundle: ArkadeUnilateralExitFrontendPersistence | null
  settingsJob?: Parameters<typeof migratePersistedUnilateralExitJob>[0]
  settingsPrefs?: Partial<UnilateralExitAutomationPrefs>
  settingsFailure?: PersistedUnilateralExitFailure | null
}): { bundle: ArkadeUnilateralExitFrontendPersistence; didOverlay: boolean } {
  if (params.wasmBundle != null) {
    return { bundle: params.wasmBundle, didOverlay: false }
  }
  const defaults = defaultUnilateralExitAutomationPrefs()
  const job = migratePersistedUnilateralExitJob(params.settingsJob ?? {})
  const prefs = {
    ...defaults,
    ...params.settingsPrefs,
    feePresetLabel: parseUnilateralExitFeePresetLabel(
      params.settingsPrefs?.feePresetLabel ?? defaults.feePresetLabel,
    ),
  }
  return {
    bundle: {
      job: jobToSdkPersistence(job),
      automationPrefs: prefsToSdkPersistence(prefs),
      lastFailure: failureToSdkPersistence(params.settingsFailure ?? null),
    },
    didOverlay: true,
  }
}

async function rewriteOrRemoveSettingsMap(
  settingsKey: string,
  mapField: string,
  scopeKey: string,
): Promise<void> {
  const raw = await sqliteStorage.getItem(settingsKey)
  const { nextJson, mapEmpty } = removeScopeKeyFromZustandSettingsJson(raw, mapField, scopeKey)
  if (mapEmpty) {
    await sqliteStorage.removeItem(settingsKey)
    return
  }
  if (nextJson != null && nextJson !== raw) {
    await sqliteStorage.setItem(settingsKey, nextJson)
  }
}

export async function removeUnilateralExitSettingsScope(
  scope: ArkadeWalletScope,
): Promise<void> {
  const scopeKey = arkadeWalletScopeKey(scope)
  await rewriteOrRemoveSettingsMap(
    UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY,
    JOBS_BY_KEY,
    scopeKey,
  )
  await rewriteOrRemoveSettingsMap(
    UNILATERAL_EXIT_AUTOMATION_PREFS_SETTINGS_KEY,
    PREFS_BY_KEY,
    scopeKey,
  )
  await rewriteOrRemoveSettingsMap(UNILATERAL_EXIT_FAILURE_SETTINGS_KEY, FAILURES_BY_KEY, scopeKey)
}

async function readSettingsOverlay(scope: ArkadeWalletScope): Promise<{
  settingsJob?: Parameters<typeof migratePersistedUnilateralExitJob>[0]
  settingsPrefs?: Partial<UnilateralExitAutomationPrefs>
  settingsFailure?: PersistedUnilateralExitFailure | null
}> {
  const scopeKey = arkadeWalletScopeKey(scope)
  const [jobRaw, prefsRaw, failureRaw] = await Promise.all([
    sqliteStorage.getItem(UNILATERAL_EXIT_LIFECYCLE_SETTINGS_KEY),
    sqliteStorage.getItem(UNILATERAL_EXIT_AUTOMATION_PREFS_SETTINGS_KEY),
    sqliteStorage.getItem(UNILATERAL_EXIT_FAILURE_SETTINGS_KEY),
  ])
  const jobsByKey = readZustandPersistedMap<
    Parameters<typeof migratePersistedUnilateralExitJob>[0]
  >(jobRaw, JOBS_BY_KEY)
  const prefsByKey = readZustandPersistedMap<Partial<UnilateralExitAutomationPrefs>>(
    prefsRaw,
    PREFS_BY_KEY,
  )
  const failuresByKey = readZustandPersistedMap<PersistedUnilateralExitFailure>(
    failureRaw,
    FAILURES_BY_KEY,
  )
  return {
    settingsJob: jobsByKey[scopeKey],
    settingsPrefs: prefsByKey[scopeKey],
    settingsFailure: failuresByKey[scopeKey] ?? null,
  }
}

function applyFrontendBundleToMemory(
  scope: ArkadeWalletScope,
  bundle: ArkadeUnilateralExitFrontendPersistence,
): void {
  useUnilateralExitLifecyclePersistenceStore
    .getState()
    .hydrateJob(scope, jobFromSdkPersistence(bundle.job))
  useUnilateralExitAutomationPrefsStore
    .getState()
    .hydratePrefs(scope, prefsFromSdkPersistence(bundle.automationPrefs))
  useUnilateralExitFailurePersistenceStore
    .getState()
    .hydrateFailure(scope, failureFromSdkPersistence(bundle.lastFailure))
}

export function clearUnilateralExitFrontendMemoryForScope(
  scope: ArkadeWalletScope,
): void {
  useUnilateralExitLifecyclePersistenceStore.getState().clearScope(scope)
  useUnilateralExitAutomationPrefsStore.getState().clearScope(scope)
  useUnilateralExitFailurePersistenceStore.getState().clearScope(scope)
}

async function writeJobToSdk(scope: ArkadeWalletScope): Promise<void> {
  const job = useUnilateralExitLifecyclePersistenceStore
    .getState()
    .getJob(scope.walletId, scope.networkMode, scope.connectionId)
  await getArkadeWorker().setUnilateralExitJob(scope, jobToSdkPersistence(job))
}

async function writePrefsToSdk(scope: ArkadeWalletScope): Promise<void> {
  const prefs = useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(scope.walletId, scope.networkMode, scope.connectionId)
  await getArkadeWorker().setUnilateralExitAutomationPrefs(scope, prefsToSdkPersistence(prefs))
}

async function writeFailureToSdk(scope: ArkadeWalletScope): Promise<void> {
  const failure = useUnilateralExitFailurePersistenceStore
    .getState()
    .getFailure(scope.walletId, scope.networkMode, scope.connectionId)
  await getArkadeWorker().setUnilateralExitFailure(scope, failureToSdkPersistence(failure))
}

function scheduleSdkWrite(run: () => Promise<void>): void {
  void run().catch((error: unknown) => {
    console.error('[unilateral-exit] Failed to persist frontend state to sdkPersistenceJson', error)
  })
}

const jobSdkWriteByScope = new Map<string, Promise<void>>()

export function scheduleUnilateralExitJobSdkWrite(scope: ArkadeWalletScope): void {
  const key = arkadeWalletScopeKey(scope)
  const previous = jobSdkWriteByScope.get(key) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => writeJobToSdk(scope))
    .catch((error: unknown) => {
      console.error('[unilateral-exit] Failed to persist frontend state to sdkPersistenceJson', error)
    })
  jobSdkWriteByScope.set(key, next)
}

export function scheduleUnilateralExitPrefsSdkWrite(scope: ArkadeWalletScope): void {
  scheduleSdkWrite(() => writePrefsToSdk(scope))
}

export function scheduleUnilateralExitFailureSdkWrite(scope: ArkadeWalletScope): void {
  scheduleSdkWrite(() => writeFailureToSdk(scope))
}

export async function hydrateUnilateralExitFrontendPersistenceFromSdk(
  scope: ArkadeWalletScope,
): Promise<PersistedUnilateralExitJob> {
  const wasmBundle = await getArkadeWorker().getUnilateralExitFrontendPersistence(scope)
  const settingsOverlay = wasmBundle == null ? await readSettingsOverlay(scope) : {}
  const { bundle, didOverlay } = resolveUnilateralExitFrontendBundle({
    wasmBundle,
    ...settingsOverlay,
  })
  if (didOverlay || wasmBundle == null) {
    await getArkadeWorker().setUnilateralExitFrontendPersistence(scope, bundle)
  }
  applyFrontendBundleToMemory(scope, bundle)
  await removeUnilateralExitSettingsScope(scope)
  return jobFromSdkPersistence(bundle.job)
}

export function isUnilateralExitFrontendPersistenceHydrated(
  scope: ArkadeWalletScope,
): boolean {
  return useUnilateralExitLifecyclePersistenceStore.getState().isHydrated(scope)
}
