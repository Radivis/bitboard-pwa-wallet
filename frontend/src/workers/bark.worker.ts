import { expose, wrap, type Remote } from 'comlink'
import {
  readBarkLastRevealedKeyIndex,
  readBarkRevealedReceiveAddress,
  receiveKeyIndexForSessionOpen,
} from '@/lib/bark/bark-receive-cursor'
import { loadBitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import { isBarkReceiveKeyIndex } from '@/lib/wallet/wallet-domain-types'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import type {
  BarkRevealedReceiveAddress,
  BarkService,
  OpenBarkSessionParams,
  OpenBarkSessionResult,
} from '@/workers/bark-api'
import {
  persistBarkReceiveKeyIndex,
  persistOpenedBarkRail,
  readStoredBarkReceiveKeyIndex,
} from '@/workers/bark-worker-metadata'
import type { SecretsChannelService } from '@/workers/secrets-channel-types'

type BitboardBarkWasm = Awaited<ReturnType<typeof loadBitboardBarkWasm>>

let barkWasmModule: BitboardBarkWasm | null = null
let wasmInitError: string | null = null
let secretsProxy: Remote<SecretsChannelService> | null = null
let encryptedWalletSecretsHost:
  | Remote<EncryptedWalletSecretsHost>
  | EncryptedWalletSecretsHost
  | null = null
let openWalletId: number | null = null

function rethrowBarkError(err: unknown): never {
  if (err instanceof Error) {
    throw err
  }
  const message =
    typeof err === 'string'
      ? err
      : err != null && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)
  throw new Error(message)
}

async function getBarkWasm(): Promise<BitboardBarkWasm> {
  if (wasmInitError) {
    throw new Error(`WASM init failed: ${wasmInitError}`)
  }
  if (!barkWasmModule) {
    barkWasmModule = await loadBitboardBarkWasm()
  }
  return barkWasmModule
}

async function initWasm() {
  try {
    barkWasmModule = await loadBitboardBarkWasm()
    console.info('[bark.worker] WASM module loaded successfully')
  } catch (err) {
    wasmInitError = err instanceof Error ? err.message : String(err)
    console.error('[bark.worker] WASM init failed:', wasmInitError)
  }
}

void initWasm()

function requireSecretsProxy(): Remote<SecretsChannelService> {
  if (secretsProxy == null) {
    throw new Error('Secrets port not set')
  }
  return secretsProxy
}

function requireEncryptedHost():
  | Remote<EncryptedWalletSecretsHost>
  | EncryptedWalletSecretsHost {
  if (encryptedWalletSecretsHost == null) {
    throw new Error('Bark encrypted persistence is not configured')
  }
  return encryptedWalletSecretsHost
}

function encryptedPayloadDeps() {
  return {
    secretsProxy: requireSecretsProxy(),
    encryptedHost: requireEncryptedHost(),
  }
}

async function closeSessionImpl(): Promise<void> {
  openWalletId = null
  try {
    const wasmModule = await getBarkWasm()
    wasmModule.bark_close_session()
  } catch (err) {
    rethrowBarkError(err)
  }
}

async function openSessionImpl(
  params: OpenBarkSessionParams,
): Promise<OpenBarkSessionResult> {
  const mnemonic = await requireSecretsProxy().decrypt(params.encryptedMnemonic)
  let sessionOpened = false
  try {
    const wasmModule = await getBarkWasm()
    const fingerprint = await wasmModule.bark_open_session(mnemonic)
    sessionOpened = true
    const deps = encryptedPayloadDeps()
    const storedReceiveKeyIndex = await readStoredBarkReceiveKeyIndex(
      deps,
      params.walletId,
    )
    const receiveKeyIndex = await receiveKeyIndexForSessionOpen({
      storedReceiveKeyIndex,
      readLastRevealedKeyIndex: async () =>
        readBarkLastRevealedKeyIndex(await wasmModule.bark_last_revealed_key_index()),
      revealNextReceiveAddress: async () =>
        readBarkRevealedReceiveAddress(await wasmModule.bark_reveal_next_address()),
    })
    await persistOpenedBarkRail(deps, params.walletId, fingerprint, receiveKeyIndex)
    openWalletId = params.walletId
    return { fingerprint, receiveKeyIndex }
  } catch (err) {
    if (sessionOpened) {
      try {
        await closeSessionImpl()
      } catch {
        // The open error is the one the caller needs.
      }
    }
    rethrowBarkError(err)
  }
}

async function peekReceiveAddressImpl(index: number): Promise<string> {
  if (!isBarkReceiveKeyIndex(index)) {
    throw new Error('Bark receive key index is invalid')
  }
  const wasmModule = await getBarkWasm()
  const address = await wasmModule.bark_peek_receive_address(index)
  if (typeof address !== 'string' || address.length === 0) {
    throw new Error('Bark peek did not return an address')
  }
  return address
}

async function revealNextReceiveAddressImpl(): Promise<BarkRevealedReceiveAddress> {
  const walletId = openWalletId
  if (walletId == null) {
    throw new Error('Bark session is not open')
  }
  const wasmModule = await getBarkWasm()
  const revealed = readBarkRevealedReceiveAddress(
    await wasmModule.bark_reveal_next_address(),
  )
  // The new key is already in IndexedDB. If this write fails, the stored cursor
  // stays on the previous index and the next open keeps peeking that index.
  await persistBarkReceiveKeyIndex(encryptedPayloadDeps(), walletId, revealed.index)
  return revealed
}

const barkService: BarkService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    secretsProxy = wrap<SecretsChannelService>(port)
  },

  async setEncryptedWalletSecretsHost(host: EncryptedWalletSecretsHost): Promise<void> {
    encryptedWalletSecretsHost = host
  },

  async ping(): Promise<boolean> {
    await getBarkWasm()
    return true
  },

  async openSession(params: OpenBarkSessionParams): Promise<OpenBarkSessionResult> {
    return openSessionImpl(params)
  },

  async closeSession(): Promise<void> {
    await closeSessionImpl()
  },

  async peekReceiveAddress(index: number): Promise<string> {
    try {
      return await peekReceiveAddressImpl(index)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async revealNextReceiveAddress(): Promise<BarkRevealedReceiveAddress> {
    try {
      return await revealNextReceiveAddressImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },
}

expose(barkService)
