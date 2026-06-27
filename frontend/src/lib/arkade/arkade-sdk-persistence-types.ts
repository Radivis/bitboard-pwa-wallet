/** Max UTF-8 byte length for `sdkPersistenceJson` (VTXO-heavy wallets). */
export const ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES = 10 * 1024 * 1024

/** Subset of the Bitboard Ark persistence envelope read on the main thread. */
export type ArkadeSdkPersistenceWalletDb = {
  offchain_next_derivation_index?: number
}

export type ArkadeSdkPersistenceEnvelope = {
  version?: number
  wallet_db?: ArkadeSdkPersistenceWalletDb
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNonNegativeIntegerField(value: unknown, fieldLabel: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldLabel} must be a non-negative integer`)
  }
  return value
}

function parseOptionalIntegerField(
  value: unknown,
  fieldLabel: string,
): number | undefined {
  if (value === undefined) {
    return undefined
  }
  return parseNonNegativeIntegerField(value, fieldLabel)
}

export function parseArkadeSdkPersistenceJson(
  sdkPersistenceJson: string,
): ArkadeSdkPersistenceEnvelope {
  let root: unknown
  try {
    root = JSON.parse(sdkPersistenceJson)
  } catch (cause) {
    throw new Error('Arkade SDK persistence is not valid JSON', { cause })
  }

  if (!isPlainObject(root)) {
    throw new Error('Arkade SDK persistence must be a JSON object')
  }

  const version = parseOptionalIntegerField(root.version, 'Arkade SDK persistence version')

  const walletDbRaw = root.wallet_db
  if (walletDbRaw === undefined) {
    return { version, wallet_db: undefined }
  }

  if (!isPlainObject(walletDbRaw)) {
    throw new Error('Arkade SDK persistence wallet_db must be an object')
  }

  const offchainNextDerivationIndex = parseOptionalIntegerField(
    walletDbRaw.offchain_next_derivation_index,
    'Arkade SDK persistence wallet_db.offchain_next_derivation_index',
  )

  const wallet_db =
    offchainNextDerivationIndex === undefined
      ? {}
      : { offchain_next_derivation_index: offchainNextDerivationIndex }

  return { version, wallet_db }
}
