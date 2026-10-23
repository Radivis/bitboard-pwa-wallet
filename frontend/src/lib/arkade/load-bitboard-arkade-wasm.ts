import { createCachedWasmLoader } from '@/lib/shared/load-cached-wasm-module'

export type BitboardArkadeWasm = typeof import('@/wasm-pkg/bitboard_arkade/bitboard_arkade')

export const loadBitboardArkadeWasm: () => Promise<BitboardArkadeWasm> = createCachedWasmLoader(
  () => import('@/wasm-pkg/bitboard_arkade/bitboard_arkade'),
)
