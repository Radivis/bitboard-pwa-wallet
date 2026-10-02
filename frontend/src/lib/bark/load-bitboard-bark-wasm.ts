export type BitboardBarkWasm = typeof import('@/wasm-pkg/bitboard_bark/bitboard_bark')

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
    await initLegacyWasmDefault(wasmModule)
    cachedBitboardBarkWasm = wasmModule
  }
  return cachedBitboardBarkWasm
}

async function initLegacyWasmDefault(wasmModule: object): Promise<void> {
  if (!('default' in wasmModule)) return
  const init = wasmModule.default
  if (typeof init !== 'function') return
  await init()
}
