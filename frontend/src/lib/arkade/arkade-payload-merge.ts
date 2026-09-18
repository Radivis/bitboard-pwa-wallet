import {
  ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES,
  parseArkadeSdkPersistenceJson,
} from '@/lib/arkade/arkade-sdk-persistence-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type {
  ArkadeSignerMigrationHint,
  ArkadeSignerMigrationDeprecatedStatus,
} from '@/workers/arkade-api'
import type {
  StoredArkadeAccount,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

export type { ArkadeSignerMigrationHint, ArkadeSignerMigrationDeprecatedStatus }

/** Account metadata safe to expose on the main thread (no SDK blob). */
export type ArkadeAccountSummary = Omit<
  StoredArkadeAccount,
  'sdkPersistenceJson'
>

export function toArkadeAccountSummary(
  account: StoredArkadeAccount,
): ArkadeAccountSummary {
  const { sdkPersistenceJson: _omittedSdkPersistenceJson, ...summary } = account
  void _omittedSdkPersistenceJson
  return summary
}

export function findArkadeAccount(
  payload: WalletSecretsPayload,
  arkadeAccountId: string,
): StoredArkadeAccount | undefined {
  return payload.arkadeAccounts.find((row) => row.id === arkadeAccountId)
}

export function findActiveArkadeAccount(
  payload: WalletSecretsPayload,
  networkMode: ArkadeSupportedNetworkMode,
): StoredArkadeAccount | undefined {
  const activeId = payload.activeArkadeAccountIdByNetwork[networkMode]
  if (activeId == null) return undefined
  return findArkadeAccount(payload, activeId)
}

export function assertOperatorSignerMatches(
  account: StoredArkadeAccount,
  operatorSignerPkHex: string,
): void {
  if (account.operatorSignerPkHex !== operatorSignerPkHex) {
    throw new Error(
      'Arkade persistence belongs to a different operator (signer public key mismatch)',
    )
  }
}

export function assertOperatorSignerMatchesOrMigration(
  account: StoredArkadeAccount,
  operatorSignerPkHex: string,
  signerMigrationHint?: ArkadeSignerMigrationHint | null,
): void {
  if (account.operatorSignerPkHex === operatorSignerPkHex) {
    return
  }
  if (
    signerMigrationHint != null &&
    account.operatorSignerPkHex === signerMigrationHint.previousSignerPkHex
  ) {
    return
  }
  assertOperatorSignerMatches(account, operatorSignerPkHex)
}

export function readOffchainNextDerivationIndex(sdkPersistenceJson: string | undefined): number {
  if (sdkPersistenceJson == null) {
    return 0
  }
  const parsed = parseArkadeSdkPersistenceJson(sdkPersistenceJson)
  return parsed.walletDb?.offchainNextDerivationIndex ?? 0
}

/** Keep the blob with the higher receive cursor when concurrent writes race. */
export function mergeSdkPersistenceJsonMonotonic(
  existingJson: string | undefined,
  incomingJson: string,
): string {
  if (existingJson == null) {
    return incomingJson
  }
  const existingIndex = readOffchainNextDerivationIndex(existingJson)
  const incomingIndex = readOffchainNextDerivationIndex(incomingJson)
  return incomingIndex >= existingIndex ? incomingJson : existingJson
}

export function assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson: string): void {
  const byteLength = new TextEncoder().encode(sdkPersistenceJson).byteLength
  if (byteLength > ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES) {
    throw new Error(
      `Arkade SDK persistence exceeds ${ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES} bytes`,
    )
  }
}

export function upsertArkadeAccountInPayload(
  payload: WalletSecretsPayload,
  account: StoredArkadeAccount,
  setActiveForNetwork = true,
): WalletSecretsPayload {
  const others = payload.arkadeAccounts.filter((row) => row.id !== account.id)
  const activeArkadeAccountIdByNetwork = {
    ...payload.activeArkadeAccountIdByNetwork,
  }
  if (setActiveForNetwork) {
    activeArkadeAccountIdByNetwork[account.networkMode] = account.id
  }
  return {
    ...payload,
    arkadeAccounts: [...others, account],
    activeArkadeAccountIdByNetwork,
  }
}

export function defaultArkadeOperatorLabel(operatorUrl: string): string {
  try {
    const url = new URL(operatorUrl)
    const pathSegment = url.pathname.split('/').filter(Boolean).pop()
    if (pathSegment != null && pathSegment.length > 0) {
      return pathSegment
    }
    return url.hostname
  } catch {
    return 'Arkade operator'
  }
}

export function buildDefaultArkadeAccount(params: {
  networkMode: ArkadeSupportedNetworkMode
  operatorUrl: string
  delegatorUrl: string
  operatorSignerPkHex: string
  sdkPersistenceJson?: string
}): StoredArkadeAccount {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    label: defaultArkadeOperatorLabel(params.operatorUrl),
    networkMode: params.networkMode,
    operatorUrl: params.operatorUrl,
    delegatorUrl: params.delegatorUrl || undefined,
    operatorSignerPkHex: params.operatorSignerPkHex,
    createdAt: now,
    sdkPersistenceJson: params.sdkPersistenceJson,
  }
}

export function ensureArkadeAccountInPayload(
  payload: WalletSecretsPayload,
  params: {
    networkMode: ArkadeSupportedNetworkMode
    operatorSignerPkHex: string
    operatorUrl: string
    delegatorUrl: string
    sdkPersistenceJson?: string
    arkadeAccountId?: string
    signerMigrationHint?: ArkadeSignerMigrationHint | null
  },
): { payload: WalletSecretsPayload; account: StoredArkadeAccount } {
  const existingActive = findActiveArkadeAccount(payload, params.networkMode)
  if (existingActive != null) {
    assertOperatorSignerMatchesOrMigration(
      existingActive,
      params.operatorSignerPkHex,
      params.signerMigrationHint,
    )
    const account: StoredArkadeAccount = {
      ...existingActive,
      operatorUrl: params.operatorUrl,
      delegatorUrl: params.delegatorUrl || undefined,
      operatorSignerPkHex: params.operatorSignerPkHex,
      sdkPersistenceJson: existingActive.sdkPersistenceJson ?? params.sdkPersistenceJson,
      lastSessionOpenedAt: new Date().toISOString(),
    }
    return {
      payload: upsertArkadeAccountInPayload(payload, account),
      account,
    }
  }

  const matchingAccount = payload.arkadeAccounts.find((row) => {
    if (row.networkMode !== params.networkMode) {
      return false
    }
    if (row.operatorSignerPkHex === params.operatorSignerPkHex) {
      return true
    }
    return (
      params.signerMigrationHint != null &&
      row.operatorSignerPkHex === params.signerMigrationHint.previousSignerPkHex
    )
  })
  if (matchingAccount != null) {
    const account: StoredArkadeAccount = {
      ...matchingAccount,
      operatorSignerPkHex: params.operatorSignerPkHex,
      sdkPersistenceJson: matchingAccount.sdkPersistenceJson ?? params.sdkPersistenceJson,
      lastSessionOpenedAt: new Date().toISOString(),
    }
    return {
      payload: upsertArkadeAccountInPayload(payload, account),
      account,
    }
  }

  const account = buildDefaultArkadeAccount({
    networkMode: params.networkMode,
    operatorUrl: params.operatorUrl,
    delegatorUrl: params.delegatorUrl,
    operatorSignerPkHex: params.operatorSignerPkHex,
    sdkPersistenceJson: params.sdkPersistenceJson,
  })
  if (params.arkadeAccountId != null) {
    account.id = params.arkadeAccountId
  }

  return {
    payload: upsertArkadeAccountInPayload(payload, account),
    account,
  }
}

export function mergeSdkPersistenceIntoPayload(
  payload: WalletSecretsPayload,
  arkadeAccountId: string,
  sdkPersistenceJson: string,
  lastSuccessfulOperatorSyncAt?: string,
): WalletSecretsPayload {
  assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson)
  const existing = findArkadeAccount(payload, arkadeAccountId)
  if (existing == null) {
    throw new Error(`Unknown Arkade account: ${arkadeAccountId}`)
  }

  const account: StoredArkadeAccount = {
    ...existing,
    sdkPersistenceJson: mergeSdkPersistenceJsonMonotonic(
      existing.sdkPersistenceJson,
      sdkPersistenceJson,
    ),
    lastSuccessfulOperatorSyncAt:
      lastSuccessfulOperatorSyncAt ?? existing.lastSuccessfulOperatorSyncAt,
  }

  return upsertArkadeAccountInPayload(payload, account, false)
}

export function updateOperatorSyncAtInPayload(
  payload: WalletSecretsPayload,
  arkadeAccountId: string,
  lastSuccessfulOperatorSyncAt: string,
): WalletSecretsPayload {
  const existing = findArkadeAccount(payload, arkadeAccountId)
  if (existing == null) {
    throw new Error(`Unknown Arkade account: ${arkadeAccountId}`)
  }

  const account: StoredArkadeAccount = {
    ...existing,
    lastSuccessfulOperatorSyncAt,
  }

  return upsertArkadeAccountInPayload(payload, account, false)
}
