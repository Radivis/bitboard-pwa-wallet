import { expose, wrap, type Remote } from 'comlink'
import { readBarkSpendableSats } from '@/lib/bark/bark-balance'
import {
  boardPsbtFromWasm,
  estimateBoardOffchainFeeFromWasm,
  historyFromWasm,
  prepareBoardFundingFromWasm,
  type BarkBoardWasm,
} from '@/lib/bark/bark-board-session'
import {
  estimateOffboardAllFromWasm,
  estimateSendOnchainFromWasm,
  offboardAllFromWasm,
  sendOnchainFromWasm,
  type BarkExitWasm,
} from '@/lib/bark/bark-exit-session'
import {
  readBarkLastRevealedKeyIndex,
  readBarkRevealedReceiveAddress,
  receiveKeyIndexForSessionOpen,
} from '@/lib/bark/bark-receive-cursor'
import { loadBitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import { isBarkReceiveKeyIndex } from '@/lib/wallet/wallet-domain-types'
import {
  setConfiguredHistoricalSignetOnchainChain,
  type HistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import type {
  BarkBoardAccepted,
  BarkBoardFeeEstimate,
  BarkExitFeeEstimate,
  BarkMovementRow,
  BarkPreparedBoardFunding,
  BarkRevealedReceiveAddress,
  BarkService,
  BarkSyncResult,
  OpenBarkSessionParams,
  OpenBarkSessionResult,
} from '@/workers/bark-api'
import {
  persistBarkReceiveKeyIndex,
  persistBarkSuccessfulSync,
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
    const barkRail = await persistOpenedBarkRail(
      deps,
      params.walletId,
      fingerprint,
      receiveKeyIndex,
    )
    openWalletId = params.walletId
    return {
      fingerprint,
      receiveKeyIndex,
      lastSuccessfulSyncAt: barkRail.lastSuccessfulSyncAt,
    }
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

async function syncImpl(): Promise<BarkSyncResult> {
  const walletId = openWalletId
  if (walletId == null) {
    throw new Error('Bark session is not open')
  }
  const wasmModule = await getBarkWasm()
  await wasmModule.bark_sync()
  const lastSuccessfulSyncAt = new Date().toISOString()
  await persistBarkSuccessfulSync(encryptedPayloadDeps(), walletId, lastSuccessfulSyncAt)
  return { lastSuccessfulSyncAt }
}

async function readSpendableBalanceImpl(): Promise<number> {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  const wasmModule = await getBarkWasm()
  return readBarkSpendableSats(await wasmModule.bark_balance())
}

function boardWasm(wasmModule: BitboardBarkWasm): BarkBoardWasm {
  return wasmModule as unknown as BarkBoardWasm
}

function exitWasm(wasmModule: BitboardBarkWasm): BarkExitWasm {
  return wasmModule as unknown as BarkExitWasm
}

function requireOpenSession(): void {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
}

async function estimateBoardOffchainFeeImpl(amountSats: number): Promise<BarkBoardFeeEstimate> {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  return estimateBoardOffchainFeeFromWasm(boardWasm(await getBarkWasm()), amountSats)
}

async function prepareBoardFundingImpl(): Promise<BarkPreparedBoardFunding> {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  return prepareBoardFundingFromWasm(boardWasm(await getBarkWasm()))
}

async function boardPsbtImpl(psbtBase64: string): Promise<BarkBoardAccepted> {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  return boardPsbtFromWasm(boardWasm(await getBarkWasm()), psbtBase64)
}

async function historyImpl(): Promise<BarkMovementRow[]> {
  requireOpenSession()
  return historyFromWasm(boardWasm(await getBarkWasm()))
}

async function estimateSendOnchainImpl(
  address: string,
  amountSats: number,
): Promise<BarkExitFeeEstimate> {
  requireOpenSession()
  return estimateSendOnchainFromWasm(exitWasm(await getBarkWasm()), address, amountSats)
}

async function sendOnchainImpl(address: string, amountSats: number): Promise<string> {
  requireOpenSession()
  return sendOnchainFromWasm(exitWasm(await getBarkWasm()), address, amountSats)
}

async function estimateOffboardAllImpl(address: string): Promise<BarkExitFeeEstimate> {
  requireOpenSession()
  return estimateOffboardAllFromWasm(exitWasm(await getBarkWasm()), address)
}

async function offboardAllImpl(address: string): Promise<string> {
  requireOpenSession()
  return offboardAllFromWasm(exitWasm(await getBarkWasm()), address)
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

  async configureHistoricalSignetOnchainChain(
    chain: HistoricalSignetOnchainChain | null,
  ): Promise<void> {
    setConfiguredHistoricalSignetOnchainChain(chain)
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

  async sync(): Promise<BarkSyncResult> {
    try {
      return await syncImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async readSpendableBalance(): Promise<number> {
    try {
      return await readSpendableBalanceImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async estimateBoardOffchainFee(amountSats: number): Promise<BarkBoardFeeEstimate> {
    try {
      return await estimateBoardOffchainFeeImpl(amountSats)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async prepareBoardFunding(): Promise<BarkPreparedBoardFunding> {
    try {
      return await prepareBoardFundingImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async boardPsbt(psbtBase64: string): Promise<BarkBoardAccepted> {
    try {
      return await boardPsbtImpl(psbtBase64)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async history(): Promise<BarkMovementRow[]> {
    try {
      return await historyImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async estimateSendOnchain(address: string, amountSats: number): Promise<BarkExitFeeEstimate> {
    try {
      return await estimateSendOnchainImpl(address, amountSats)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async sendOnchain(address: string, amountSats: number): Promise<string> {
    try {
      return await sendOnchainImpl(address, amountSats)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async estimateOffboardAll(address: string): Promise<BarkExitFeeEstimate> {
    try {
      return await estimateOffboardAllImpl(address)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async offboardAll(address: string): Promise<string> {
    try {
      return await offboardAllImpl(address)
    } catch (err) {
      rethrowBarkError(err)
    }
  },
}

expose(barkService)
