type BitboardArkWasm = typeof import('@/wasm-pkg/bitboard_ark/bitboard_ark')

let cachedBitboardArkWasm: BitboardArkWasm | null = null

/**
 * Loads the bitboard_ark WASM bindings.
 *
 * `wasm-pack --target bundler` (used by `npm run build:wasm`) auto-initializes on import.
 * Legacy `web` builds require calling the default export once before invoking APIs.
 */
export async function loadBitboardArkWasm(): Promise<BitboardArkWasm> {
  if (!cachedBitboardArkWasm) {
    const wasmModule = await import('@/wasm-pkg/bitboard_ark/bitboard_ark')
    const init = (wasmModule as unknown as { default?: () => Promise<unknown> }).default
    if (init != null) {
      await init()
    }
    cachedBitboardArkWasm = wasmModule
  }
  return cachedBitboardArkWasm
}
