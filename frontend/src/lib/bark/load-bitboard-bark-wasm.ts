type BitboardBarkWasm = typeof import('@/wasm-pkg/bitboard_bark/bitboard_bark')

let cachedBitboardBarkWasm: BitboardBarkWasm | null = null

/**
 * Loads the bitboard_bark WASM bindings.
 *
 * `wasm-pack --target bundler` auto-initializes on import.
 * Legacy `web` builds require calling the default export once before invoking APIs.
 */
export async function loadBitboardBarkWasm(): Promise<BitboardBarkWasm> {
  if (!cachedBitboardBarkWasm) {
    const wasmModule = await import('@/wasm-pkg/bitboard_bark/bitboard_bark')
    const init = (wasmModule as unknown as { default?: () => Promise<unknown> }).default
    if (init != null) {
      await init()
    }
    cachedBitboardBarkWasm = wasmModule
  }
  return cachedBitboardBarkWasm
}
