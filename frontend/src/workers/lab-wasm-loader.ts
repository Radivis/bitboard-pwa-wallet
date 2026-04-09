let labWasmModule: typeof import('@/wasm-pkg/bitboard_crypto') | null = null

export async function getWasm(): Promise<typeof import('@/wasm-pkg/bitboard_crypto')> {
  if (!labWasmModule) {
    labWasmModule = await import('@/wasm-pkg/bitboard_crypto')
  }
  return labWasmModule
}
