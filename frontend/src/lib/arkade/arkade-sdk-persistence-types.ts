/** Wire format version for Rust ark-rs persistence (v2). */
export const BITBOARD_ARK_PERSISTENCE_VERSION = 2 as const

/** Legacy TypeScript SDK snapshot (v1); ignored on import with a console notice. */
export const BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION = 1 as const

export interface BitboardArkPersistenceV2 {
  version: typeof BITBOARD_ARK_PERSISTENCE_VERSION
  engine: 'ark-rs'
  arkSdkVersion: string
  walletDb: unknown
  swapStorage: unknown
}

/** @deprecated v1 TS SDK envelope — no longer written. */
export interface BitboardArkadeSdkPersistenceV1 {
  version: typeof BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION
  wallet: unknown
  contract: unknown
}

export type BitboardArkadeSdkPersistence =
  | BitboardArkPersistenceV2
  | BitboardArkadeSdkPersistenceV1

/** Max UTF-8 byte length for `sdkPersistenceJson` (VTXO-heavy wallets). */
export const ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES = 10 * 1024 * 1024

export function parseSdkPersistenceJson(json: string): BitboardArkadeSdkPersistence | null {
  try {
    const parsed = JSON.parse(json) as { version?: number }
    if (parsed.version === BITBOARD_ARK_PERSISTENCE_VERSION) {
      return parsed as BitboardArkPersistenceV2
    }
    if (parsed.version === BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION) {
      return parsed as BitboardArkadeSdkPersistenceV1
    }
    return null
  } catch {
    return null
  }
}
