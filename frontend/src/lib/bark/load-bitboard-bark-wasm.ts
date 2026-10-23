import { createCachedWasmLoader } from '@/lib/shared/load-cached-wasm-module'

export type BitboardBarkWasm = typeof import('@/wasm-pkg/bitboard_bark/bitboard_bark')

export const loadBitboardBarkWasm: () => Promise<BitboardBarkWasm> = createCachedWasmLoader(
  () => import('@/wasm-pkg/bitboard_bark/bitboard_bark'),
)
