import { expose, wrap, type Remote } from 'comlink'
import { readBarkSpendableSats } from '@/lib/bark/bark-balance'
import {
  barkArkoorSendDepsFromWasm,
  performBarkArkoorSend,
  type BarkArkoorWasm,
} from '@/lib/bark/perform-bark-arkoor-send'
import { listVtxosFromWasm } from '@/lib/bark/bark-vtxo-list'
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
  cancelEmergencyExitFromWasm,
  drainEmergencyExitsFromWasm,
  estimateEmergencyExitFromWasm,
  listEmergencyExitsFromWasm,
  progressEmergencyExitsFromWasm,
  provideEmergencyExitCpfpFromWasm,
  startEmergencyExitFromWasm,
  exitTopologyFromWasm,
  type BarkEmergencyExitWasm,
} from '@/lib/bark/bark-emergency-exit-session'
import {
  readBarkLastRevealedKeyIndex,
  readBarkRevealedReceiveAddress,
  receiveKeyIndexForSessionOpen,
} from '@/lib/bark/bark-receive-cursor'
import { loadBitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import {
  assertBarkRecordDumpWithinSizeLimit,
  isBarkReceiveKeyIndex,
} from '@/lib/wallet/wallet-domain-types'
import {
  setConfiguredHistoricalSignetOnchainChain,
  type HistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import type {
  BarkArkoorSendParams,
  BarkArkoorSendResult,
  BarkBoardAccepted,
  BarkBoardFeeEstimate,
  BarkEmergencyExitDrain,
  BarkEmergencyExitEstimate,
  BarkEmergencyExitProgress,
  BarkEmergencyExitRow,
  BarkExitFeeEstimate,
  BarkExitGraph,
  BarkMovementRow,
  BarkVtxoRow,
  BarkPreparedBoardFunding,
  BarkRevealedReceiveAddress,
  BarkService,
  BarkSyncResult,
  OpenBarkSessionParams,
  OpenBarkSessionResult,
} from '@/workers/bark-api'
import type { BarkRailNetwork } from '@/lib/wallet/wallet-domain-types'
import {
  persistBarkProtocolState,
  persistOpenedBarkRail,
  readRecordDumpForOpen,
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
let openNetwork: BarkRailNetwork | null = null

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

function barkErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

async function exportRecordDump(): Promise<string> {
  const wasmModule = await getBarkWasm()
  const recordDump = wasmModule.bark_export_record_dump()
  if (typeof recordDump !== 'string' || recordDump.length === 0) {
    throw new Error('Bark record dump is empty')
  }
  assertBarkRecordDumpWithinSizeLimit(recordDump)
  return recordDump
}

async function flushBarkProtocolState(
  walletId: number,
  update: { receiveKeyIndex?: number; lastSuccessfulSyncAt?: string } = {},
): Promise<void> {
  const recordDump = await exportRecordDump()
  const network = openNetwork
  if (network == null) {
    throw new Error('Bark session is not open')
  }
  await persistBarkProtocolState(encryptedPayloadDeps(), walletId, network, {
    recordDump,
    receiveKeyIndex: update.receiveKeyIndex,
    lastSuccessfulSyncAt: update.lastSuccessfulSyncAt,
  })
}

type BarkRailFlushMetadata = {
  receiveKeyIndex?: number
  lastSuccessfulSyncAt?: string
}

async function mutateBark<T>(
  walletId: number,
  operation: () => Promise<T>,
  metadata: (result: T) => BarkRailFlushMetadata,
): Promise<T> {
  let operationError: unknown
  let result: T | undefined
  try {
    result = await operation()
  } catch (err) {
    operationError = err
  }

  let flushError: unknown
  if (openWalletId != null) {
    try {
      const flushMetadata =
        operationError == null && result !== undefined ? metadata(result) : {}
      await flushBarkProtocolState(walletId, flushMetadata)
    } catch (err) {
      flushError = err
    }
  }

  if (operationError != null && flushError != null) {
    throw new Error(
      `${barkErrorMessage(operationError)} (Bark record dump was not saved: ${barkErrorMessage(flushError)})`,
    )
  }
  if (flushError != null) {
    throw flushError
  }
  if (operationError != null) {
    throw operationError
  }
  return result as T
}

function requireOpenWalletId(): number {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  return openWalletId
}

async function closeSessionImpl(): Promise<void> {
  openWalletId = null
  openNetwork = null
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
  const network = params.networkMode
  const mnemonic = await requireSecretsProxy().decrypt(params.encryptedMnemonic)
  const deps = encryptedPayloadDeps()
  const recordDump = await readRecordDumpForOpen(deps, params.walletId, network)
  let sessionOpened = false
  try {
    const wasmModule = await getBarkWasm()
    const fingerprint = await wasmModule.bark_open_session(mnemonic, network, recordDump)
    if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
      throw new Error('Bark open did not return a fingerprint')
    }
    sessionOpened = true
    openWalletId = params.walletId
    openNetwork = network
    const storedReceiveKeyIndex = await readStoredBarkReceiveKeyIndex(
      deps,
      params.walletId,
      network,
    )
    const receiveKeyIndex = await receiveKeyIndexForSessionOpen({
      storedReceiveKeyIndex,
      readLastRevealedKeyIndex: async () =>
        readBarkLastRevealedKeyIndex(await wasmModule.bark_last_revealed_key_index()),
      revealNextReceiveAddress: async () =>
        readBarkRevealedReceiveAddress(await wasmModule.bark_reveal_next_address()),
    })
    const exportedDump = await exportRecordDump()
    const barkRail = await persistOpenedBarkRail(
      deps,
      params.walletId,
      network,
      fingerprint,
      receiveKeyIndex,
      exportedDump,
    )
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
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => {
      const wasmModule = await getBarkWasm()
      return readBarkRevealedReceiveAddress(await wasmModule.bark_reveal_next_address())
    },
    (revealed) => ({ receiveKeyIndex: revealed.index }),
  )
}

async function syncImpl(): Promise<BarkSyncResult> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => {
      const wasmModule = await getBarkWasm()
      await wasmModule.bark_sync()
      return { lastSuccessfulSyncAt: new Date().toISOString() }
    },
    (result) => ({ lastSuccessfulSyncAt: result.lastSuccessfulSyncAt }),
  )
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

function emergencyExitWasm(wasmModule: BitboardBarkWasm): BarkEmergencyExitWasm {
  return wasmModule as unknown as BarkEmergencyExitWasm
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
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => prepareBoardFundingFromWasm(boardWasm(await getBarkWasm())),
    () => ({}),
  )
}

async function boardPsbtImpl(psbtBase64: string): Promise<BarkBoardAccepted> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => boardPsbtFromWasm(boardWasm(await getBarkWasm()), psbtBase64),
    () => ({}),
  )
}

async function historyImpl(): Promise<BarkMovementRow[]> {
  requireOpenSession()
  return historyFromWasm(boardWasm(await getBarkWasm()))
}

async function listVtxosImpl(): Promise<BarkVtxoRow[]> {
  requireOpenSession()
  const wasmModule = await getBarkWasm()
  return listVtxosFromWasm(wasmModule as unknown as { bark_list_vtxos(): Promise<string> })
}

async function estimateSendOnchainImpl(
  address: string,
  amountSats: number,
  feeRateSatPerVb: number,
): Promise<BarkExitFeeEstimate> {
  requireOpenSession()
  return estimateSendOnchainFromWasm(
    exitWasm(await getBarkWasm()),
    address,
    amountSats,
    feeRateSatPerVb,
  )
}

async function sendOnchainImpl(
  address: string,
  amountSats: number,
  feeRateSatPerVb: number,
): Promise<string> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () =>
      sendOnchainFromWasm(exitWasm(await getBarkWasm()), address, amountSats, feeRateSatPerVb),
    () => ({}),
  )
}

async function estimateOffboardAllImpl(
  address: string,
  feeRateSatPerVb: number,
): Promise<BarkExitFeeEstimate> {
  requireOpenSession()
  return estimateOffboardAllFromWasm(exitWasm(await getBarkWasm()), address, feeRateSatPerVb)
}

async function offboardAllImpl(address: string, feeRateSatPerVb: number): Promise<string> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => offboardAllFromWasm(exitWasm(await getBarkWasm()), address, feeRateSatPerVb),
    () => ({}),
  )
}

async function sendArkoorPaymentImpl(
  params: BarkArkoorSendParams,
): Promise<BarkArkoorSendResult> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => {
      const wasmModule = await getBarkWasm()
      return performBarkArkoorSend(
        barkArkoorSendDepsFromWasm(
          wasmModule as unknown as BarkArkoorWasm,
          () => readSpendableBalanceImpl(),
          () => syncImpl(),
        ),
        params,
      )
    },
    () => ({}),
  )
}

async function estimateEmergencyExitImpl(
  vtxoIds: string[],
  feeRateSatPerVb: number,
): Promise<BarkEmergencyExitEstimate> {
  requireOpenSession()
  return estimateEmergencyExitFromWasm(
    emergencyExitWasm(await getBarkWasm()),
    vtxoIds,
    feeRateSatPerVb,
  )
}

async function startEmergencyExitImpl(vtxoIds: string[]): Promise<void> {
  const walletId = requireOpenWalletId()
  await mutateBark(
    walletId,
    async () => startEmergencyExitFromWasm(emergencyExitWasm(await getBarkWasm()), vtxoIds),
    () => ({}),
  )
}

async function listEmergencyExitsImpl(): Promise<BarkEmergencyExitRow[]> {
  requireOpenSession()
  return listEmergencyExitsFromWasm(emergencyExitWasm(await getBarkWasm()))
}

async function exitTopologyImpl(vtxoIds: string[]): Promise<BarkExitGraph> {
  requireOpenSession()
  return exitTopologyFromWasm(emergencyExitWasm(await getBarkWasm()), vtxoIds)
}

async function progressEmergencyExitsImpl(): Promise<BarkEmergencyExitProgress> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => progressEmergencyExitsFromWasm(emergencyExitWasm(await getBarkWasm())),
    () => ({}),
  )
}

async function provideEmergencyExitCpfpImpl(
  exitTxid: string,
  childTxHex: string,
): Promise<void> {
  const walletId = requireOpenWalletId()
  await mutateBark(
    walletId,
    async () =>
      provideEmergencyExitCpfpFromWasm(
        emergencyExitWasm(await getBarkWasm()),
        exitTxid,
        childTxHex,
      ),
    () => ({}),
  )
}

async function cancelEmergencyExitImpl(vtxoId: string): Promise<void> {
  const walletId = requireOpenWalletId()
  await mutateBark(
    walletId,
    async () => cancelEmergencyExitFromWasm(emergencyExitWasm(await getBarkWasm()), vtxoId),
    () => ({}),
  )
}

async function drainEmergencyExitsImpl(
  address: string,
  feeRateSatPerVb: number,
): Promise<BarkEmergencyExitDrain> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () =>
      drainEmergencyExitsFromWasm(
        emergencyExitWasm(await getBarkWasm()),
        address,
        feeRateSatPerVb,
      ),
    () => ({}),
  )
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

  async listVtxos(): Promise<BarkVtxoRow[]> {
    try {
      return await listVtxosImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async estimateSendOnchain(
    address: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ): Promise<BarkExitFeeEstimate> {
    try {
      return await estimateSendOnchainImpl(address, amountSats, feeRateSatPerVb)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async sendOnchain(
    address: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ): Promise<string> {
    try {
      return await sendOnchainImpl(address, amountSats, feeRateSatPerVb)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async estimateOffboardAll(
    address: string,
    feeRateSatPerVb: number,
  ): Promise<BarkExitFeeEstimate> {
    try {
      return await estimateOffboardAllImpl(address, feeRateSatPerVb)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async offboardAll(address: string, feeRateSatPerVb: number): Promise<string> {
    try {
      return await offboardAllImpl(address, feeRateSatPerVb)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async sendArkoorPayment(params: BarkArkoorSendParams): Promise<BarkArkoorSendResult> {
    try {
      return await sendArkoorPaymentImpl(params)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async estimateEmergencyExit(
    vtxoIds: string[],
    feeRateSatPerVb: number,
  ): Promise<BarkEmergencyExitEstimate> {
    try {
      return await estimateEmergencyExitImpl(vtxoIds, feeRateSatPerVb)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async startEmergencyExit(vtxoIds: string[]): Promise<void> {
    try {
      await startEmergencyExitImpl(vtxoIds)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async listEmergencyExits(): Promise<BarkEmergencyExitRow[]> {
    try {
      return await listEmergencyExitsImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async exitTopology(vtxoIds: string[]): Promise<BarkExitGraph> {
    try {
      return await exitTopologyImpl(vtxoIds)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async progressEmergencyExits(): Promise<BarkEmergencyExitProgress> {
    try {
      return await progressEmergencyExitsImpl()
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async provideEmergencyExitCpfp(exitTxid: string, childTxHex: string): Promise<void> {
    try {
      await provideEmergencyExitCpfpImpl(exitTxid, childTxHex)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async cancelEmergencyExit(vtxoId: string): Promise<void> {
    try {
      await cancelEmergencyExitImpl(vtxoId)
    } catch (err) {
      rethrowBarkError(err)
    }
  },

  async drainEmergencyExits(
    address: string,
    feeRateSatPerVb: number,
  ): Promise<BarkEmergencyExitDrain> {
    try {
      return await drainEmergencyExitsImpl(address, feeRateSatPerVb)
    } catch (err) {
      rethrowBarkError(err)
    }
  },
}

expose(barkService)
