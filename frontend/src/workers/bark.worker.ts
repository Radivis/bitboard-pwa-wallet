import { expose, wrap, type Remote } from 'comlink'
import { readBarkBalance } from '@/lib/bark/bark-balance'
import { pendingActionsFromWasm } from '@/lib/bark/bark-pending-actions'
import { readBarkRefreshStatus } from '@/lib/bark/bark-refresh-status'
import {
  barkArkoorSendDepsFromWasm,
  performBarkArkoorSend,
} from '@/lib/bark/perform-bark-arkoor-send'
import { listVtxosFromWasm } from '@/lib/bark/bark-vtxo-list'
import {
  boardPsbtFromWasm,
  estimateBoardOffchainFeeFromWasm,
  historyFromWasm,
  prepareBoardFundingFromWasm,
} from '@/lib/bark/bark-board-session'
import {
  estimateOffboardAllFromWasm,
  estimateSendOnchainFromWasm,
  offboardAllFromWasm,
  sendOnchainFromWasm,
} from '@/lib/bark/bark-exit-session'
import {
  broadcastEmergencyExitClaimFromWasm,
  cancelEmergencyExitFromWasm,
  drainEmergencyExitsFromWasm,
  estimateEmergencyExitFromWasm,
  listEmergencyExitsFromWasm,
  progressEmergencyExitsFromWasm,
  provideEmergencyExitCpfpFromWasm,
  startEmergencyExitFromWasm,
  syncEmergencyExitsFromWasm,
  exitTopologyFromWasm,
} from '@/lib/bark/bark-emergency-exit-session'
import {
  readBarkLastRevealedKeyIndex,
  readBarkRevealedReceiveAddress,
  receiveKeyIndexForSessionOpen,
} from '@/lib/bark/bark-receive-cursor'
import { loadBitboardBarkWasm, type BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
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
  BarkBalanceParts,
  BarkBoardAccepted,
  BarkBoardFeeEstimate,
  BarkEmergencyExitDrain,
  BarkEmergencyExitEstimate,
  BarkEmergencyExitProgress,
  BarkEmergencyExitRow,
  BarkExitFeeEstimate,
  BarkExitGraph,
  BarkMovementRow,
  BarkPendingAction,
  BarkVtxoList,
  PendingEmergencyClaim,
  BarkPreparedBoardFunding,
  BarkRevealedReceiveAddress,
  BarkService,
  BarkSyncResult,
  OpenBarkSessionParams,
  OpenBarkSessionResult,
} from '@/workers/bark-api'
import type { BarkRailNetwork } from '@/lib/wallet/wallet-domain-types'
import {
  createBarkCallQueue,
  durableCheckpointFlush,
  finishBarkMutation,
  type BarkRailFlushMetadata,
} from '@/workers/bark-durable-flush'
import {
  persistBarkProtocolState,
  persistOpenedBarkRail,
  readPendingEmergencyClaim as readPendingEmergencyClaimFromPayload,
  readRecordDumpForOpen,
  readStoredBarkReceiveKeyIndex,
  writePendingEmergencyClaim as writePendingEmergencyClaimToPayload,
} from '@/workers/bark-worker-metadata'
import type { SecretsChannelService } from '@/workers/secrets-channel-types'

let barkWasmModule: BitboardBarkWasm | null = null
let wasmInitError: string | null = null
let secretsProxy: Remote<SecretsChannelService> | null = null
let encryptedWalletSecretsHost:
  | Remote<EncryptedWalletSecretsHost>
  | EncryptedWalletSecretsHost
  | null = null
let openWalletId: number | null = null
let openNetwork: BarkRailNetwork | null = null
const enqueueBarkCall = createBarkCallQueue()

function callBark<T>(operation: () => Promise<T>): Promise<T> {
  return enqueueBarkCall(operation).catch((err: unknown) => rethrowBarkError(err))
}

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

function useLoadedBarkWasm(wasm: BitboardBarkWasm): BitboardBarkWasm {
  barkWasmModule = wasm
  wasm.bark_set_durable_record_flush_hook(
    durableCheckpointFlush((recordDump) => flushDurableCheckpoint(recordDump)),
  )
  return wasm
}

async function getBarkWasm(): Promise<BitboardBarkWasm> {
  if (wasmInitError) {
    throw new Error(`WASM init failed: ${wasmInitError}`)
  }
  if (!barkWasmModule) {
    useLoadedBarkWasm(await loadBitboardBarkWasm())
  }
  return barkWasmModule as BitboardBarkWasm
}

async function initWasm() {
  try {
    useLoadedBarkWasm(await loadBitboardBarkWasm())
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

async function flushDurableCheckpoint(recordDump: string): Promise<void> {
  if (typeof recordDump !== 'string' || recordDump.length === 0) {
    throw new Error('Bark record dump is empty')
  }
  assertBarkRecordDumpWithinSizeLimit(recordDump)
  const walletId = openWalletId
  const network = openNetwork
  if (walletId == null || network == null) {
    throw new Error('Bark session is not open')
  }
  await persistBarkProtocolState(encryptedPayloadDeps(), walletId, network, { recordDump })
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

async function mutateBark<T>(
  walletId: number,
  operation: () => Promise<T>,
  metadata: (result: T) => BarkRailFlushMetadata,
): Promise<T> {
  return finishBarkMutation({
    sessionOpen: openWalletId != null,
    operation,
    flushProtocolState: (flushMetadata) => flushBarkProtocolState(walletId, flushMetadata),
    metadata,
  })
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
  const previousWalletId = openWalletId
  const previousNetwork = openNetwork
  // Exit load can write a durable row inside open. The flush hook reads these.
  openWalletId = params.walletId
  openNetwork = network
  try {
    const wasmModule = await getBarkWasm()
    const fingerprint = await wasmModule.bark_open_session(mnemonic, network, recordDump)
    if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
      throw new Error('Bark open did not return a fingerprint')
    }
    sessionOpened = true
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
    } else {
      openWalletId = previousWalletId
      openNetwork = previousNetwork
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
      const refreshStatus = readBarkRefreshStatus(await wasmModule.bark_sync())
      return {
        lastSuccessfulSyncAt: new Date().toISOString(),
        refreshStatus,
      }
    },
    (result) => ({ lastSuccessfulSyncAt: result.lastSuccessfulSyncAt }),
  )
}

async function readSpendableBalanceImpl(): Promise<BarkBalanceParts> {
  if (openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  const wasmModule = await getBarkWasm()
  return readBarkBalance(await wasmModule.bark_balance())
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
  return estimateBoardOffchainFeeFromWasm(await getBarkWasm(), amountSats)
}

async function prepareBoardFundingImpl(): Promise<BarkPreparedBoardFunding> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => prepareBoardFundingFromWasm(await getBarkWasm()),
    () => ({}),
  )
}

async function boardPsbtImpl(psbtBase64: string): Promise<BarkBoardAccepted> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => boardPsbtFromWasm(await getBarkWasm(), psbtBase64),
    () => ({}),
  )
}

async function historyImpl(): Promise<BarkMovementRow[]> {
  requireOpenSession()
  return historyFromWasm(await getBarkWasm())
}

async function listVtxosImpl(): Promise<BarkVtxoList> {
  requireOpenSession()
  return listVtxosFromWasm(await getBarkWasm())
}

async function listPendingActionsImpl(): Promise<BarkPendingAction[]> {
  requireOpenSession()
  return pendingActionsFromWasm(await getBarkWasm())
}

async function estimateSendOnchainImpl(
  address: string,
  amountSats: number,
): Promise<BarkExitFeeEstimate> {
  requireOpenSession()
  return estimateSendOnchainFromWasm(await getBarkWasm(), address, amountSats)
}

async function sendOnchainImpl(address: string, amountSats: number): Promise<string> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => sendOnchainFromWasm(await getBarkWasm(), address, amountSats),
    () => ({}),
  )
}

async function estimateOffboardAllImpl(address: string): Promise<BarkExitFeeEstimate> {
  requireOpenSession()
  return estimateOffboardAllFromWasm(await getBarkWasm(), address)
}

async function offboardAllImpl(address: string): Promise<string> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => offboardAllFromWasm(await getBarkWasm(), address),
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
          wasmModule,
          async () => (await readSpendableBalanceImpl()).spendableSats,
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
    await getBarkWasm(),
    vtxoIds,
    feeRateSatPerVb,
  )
}

async function startEmergencyExitImpl(vtxoIds: string[]): Promise<void> {
  const walletId = requireOpenWalletId()
  await mutateBark(
    walletId,
    async () => startEmergencyExitFromWasm(await getBarkWasm(), vtxoIds),
    () => ({}),
  )
}

async function listEmergencyExitsImpl(): Promise<BarkEmergencyExitRow[]> {
  requireOpenSession()
  return listEmergencyExitsFromWasm(await getBarkWasm())
}

async function exitTopologyImpl(vtxoIds: string[]): Promise<BarkExitGraph> {
  requireOpenSession()
  return exitTopologyFromWasm(await getBarkWasm(), vtxoIds)
}

async function progressEmergencyExitsImpl(): Promise<BarkEmergencyExitProgress> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => progressEmergencyExitsFromWasm(await getBarkWasm()),
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
        await getBarkWasm(),
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
    async () => cancelEmergencyExitFromWasm(await getBarkWasm(), vtxoId),
    () => ({}),
  )
}

async function drainEmergencyExitsImpl(
  address: string,
  feeRateSatPerVb: number,
  excludeVtxoIds: string[],
): Promise<BarkEmergencyExitDrain> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () =>
      drainEmergencyExitsFromWasm(
        await getBarkWasm(),
        address,
        feeRateSatPerVb,
        excludeVtxoIds,
      ),
    () => ({}),
  )
}

function requireOpenNetwork(): BarkRailNetwork {
  if (openNetwork == null || openWalletId == null) {
    throw new Error('Bark session is not open')
  }
  return openNetwork
}

async function readPendingEmergencyClaimImpl(): Promise<PendingEmergencyClaim | null> {
  const walletId = requireOpenWalletId()
  const network = requireOpenNetwork()
  return readPendingEmergencyClaimFromPayload(encryptedPayloadDeps(), walletId, network)
}

async function writePendingEmergencyClaimImpl(
  pending: PendingEmergencyClaim | null,
): Promise<void> {
  const walletId = requireOpenWalletId()
  const network = requireOpenNetwork()
  await writePendingEmergencyClaimToPayload(
    encryptedPayloadDeps(),
    walletId,
    network,
    pending,
  )
}

async function syncEmergencyExitsImpl(): Promise<BarkEmergencyExitRow[]> {
  const walletId = requireOpenWalletId()
  return mutateBark(
    walletId,
    async () => syncEmergencyExitsFromWasm(await getBarkWasm()),
    () => ({}),
  )
}

async function broadcastEmergencyExitClaimImpl(rawTxHex: string): Promise<void> {
  requireOpenSession()
  await broadcastEmergencyExitClaimFromWasm(await getBarkWasm(), rawTxHex)
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

  peekReceiveAddress(index: number): Promise<string> {
    return callBark(() => peekReceiveAddressImpl(index))
  },

  revealNextReceiveAddress(): Promise<BarkRevealedReceiveAddress> {
    return callBark(() => revealNextReceiveAddressImpl())
  },

  sync(): Promise<BarkSyncResult> {
    return callBark(() => syncImpl())
  },

  readSpendableBalance(): Promise<BarkBalanceParts> {
    return callBark(() => readSpendableBalanceImpl())
  },

  listPendingActions(): Promise<BarkPendingAction[]> {
    return callBark(() => listPendingActionsImpl())
  },

  estimateBoardOffchainFee(amountSats: number): Promise<BarkBoardFeeEstimate> {
    return callBark(() => estimateBoardOffchainFeeImpl(amountSats))
  },

  prepareBoardFunding(): Promise<BarkPreparedBoardFunding> {
    return callBark(() => prepareBoardFundingImpl())
  },

  boardPsbt(psbtBase64: string): Promise<BarkBoardAccepted> {
    return callBark(() => boardPsbtImpl(psbtBase64))
  },

  history(): Promise<BarkMovementRow[]> {
    return callBark(() => historyImpl())
  },

  listVtxos(): Promise<BarkVtxoList> {
    return callBark(() => listVtxosImpl())
  },

  estimateSendOnchain(address: string, amountSats: number): Promise<BarkExitFeeEstimate> {
    return callBark(() => estimateSendOnchainImpl(address, amountSats))
  },

  sendOnchain(address: string, amountSats: number): Promise<string> {
    return callBark(() => sendOnchainImpl(address, amountSats))
  },

  estimateOffboardAll(address: string): Promise<BarkExitFeeEstimate> {
    return callBark(() => estimateOffboardAllImpl(address))
  },

  offboardAll(address: string): Promise<string> {
    return callBark(() => offboardAllImpl(address))
  },

  sendArkoorPayment(params: BarkArkoorSendParams): Promise<BarkArkoorSendResult> {
    return callBark(() => sendArkoorPaymentImpl(params))
  },

  estimateEmergencyExit(
    vtxoIds: string[],
    feeRateSatPerVb: number,
  ): Promise<BarkEmergencyExitEstimate> {
    return callBark(() => estimateEmergencyExitImpl(vtxoIds, feeRateSatPerVb))
  },

  startEmergencyExit(vtxoIds: string[]): Promise<void> {
    return callBark(() => startEmergencyExitImpl(vtxoIds))
  },

  listEmergencyExits(): Promise<BarkEmergencyExitRow[]> {
    return callBark(() => listEmergencyExitsImpl())
  },

  exitTopology(vtxoIds: string[]): Promise<BarkExitGraph> {
    return callBark(() => exitTopologyImpl(vtxoIds))
  },

  progressEmergencyExits(): Promise<BarkEmergencyExitProgress> {
    return callBark(() => progressEmergencyExitsImpl())
  },

  provideEmergencyExitCpfp(exitTxid: string, childTxHex: string): Promise<void> {
    return callBark(() => provideEmergencyExitCpfpImpl(exitTxid, childTxHex))
  },

  cancelEmergencyExit(vtxoId: string): Promise<void> {
    return callBark(() => cancelEmergencyExitImpl(vtxoId))
  },

  drainEmergencyExits(
    address: string,
    feeRateSatPerVb: number,
    excludeVtxoIds: string[],
  ): Promise<BarkEmergencyExitDrain> {
    return callBark(() => drainEmergencyExitsImpl(address, feeRateSatPerVb, excludeVtxoIds))
  },

  readPendingEmergencyClaim(): Promise<PendingEmergencyClaim | null> {
    return callBark(() => readPendingEmergencyClaimImpl())
  },

  writePendingEmergencyClaim(pending: PendingEmergencyClaim | null): Promise<void> {
    return callBark(() => writePendingEmergencyClaimImpl(pending))
  },

  syncEmergencyExits(): Promise<BarkEmergencyExitRow[]> {
    return callBark(() => syncEmergencyExitsImpl())
  },

  broadcastEmergencyExitClaim(rawTxHex: string): Promise<void> {
    return callBark(() => broadcastEmergencyExitClaimImpl(rawTxHex))
  },
}

expose(barkService)
