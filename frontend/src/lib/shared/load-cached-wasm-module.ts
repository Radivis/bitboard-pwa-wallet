/**
 * Loads a wasm-pack bundler module once and caches it.
 *
 * `wasm-pack --target bundler` auto-initializes on import.
 * Legacy `web` builds require calling the default export once before invoking APIs.
 */
export function createCachedWasmLoader<TModule extends object>(
  importModule: () => Promise<TModule>,
): () => Promise<TModule> {
  let cachedWasmModule: TModule | null = null

  return async () => {
    if (cachedWasmModule == null) {
      const wasmModule = await importModule()
      await initLegacyWasmDefault(wasmModule)
      cachedWasmModule = wasmModule
    }
    return cachedWasmModule
  }
}

async function initLegacyWasmDefault(wasmModule: object): Promise<void> {
  if (!('default' in wasmModule)) return
  const init = wasmModule.default
  if (typeof init !== 'function') return
  await init()
}
