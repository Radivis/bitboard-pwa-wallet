import {
  ChainTxType,
  Estimator,
  Transaction,
  TxWeightEstimator,
  networks,
  type ChainTx,
  type FeeInfo,
  type IntentFeeConfig,
  type NetworkName,
  type OnchainProvider,
  type VirtualCoin,
} from '@arkade-os/sdk'
import { Address, OutScript } from '@scure/btc-signer'
import { base64, hex } from '@scure/base'

/** Minimum feerate (sat/vB) used by SDK {@link OnchainWallet}. */
export const ARKADE_MIN_FEE_RATE_SAT_PER_VB = 1

/** Network names tried when decoding an on-chain destination (matches SDK `Ramps.offboard`). */
export const ARKADE_DESTINATION_DECODE_NETWORK_NAMES: NetworkName[] = [
  'bitcoin',
  'regtest',
  'testnet',
  'signet',
  'mutinynet',
]

export type TxOnchainStatus = 'confirmed' | 'unconfirmed' | 'missing'

export interface IntentFeeConfiguredFlags {
  offchainInput: boolean
  onchainInput: boolean
  offchainOutput: boolean
  onchainOutput: boolean
}

export interface CollaborativeOffboardFeeEstimateResult {
  estimatedTotalFeeSats: number | null
  estimatedReceiveSats: number | null
  estimateError?: string
}

export interface UnrollPlanSimulationResult {
  chainTxCount: number
  projectedUnrollSteps: number
  projectedWaitSteps: number
  unrollTxids: string[]
}

export function mapIntentFeeConfigured(feeInfo: FeeInfo): IntentFeeConfiguredFlags {
  const intentFee: IntentFeeConfig = feeInfo.intentFee ?? {}
  return {
    offchainInput: Boolean(intentFee.offchainInput),
    onchainInput: Boolean(intentFee.onchainInput),
    offchainOutput: Boolean(intentFee.offchainOutput),
    onchainOutput: Boolean(intentFee.onchainOutput),
  }
}

export function resolveFeeRateSatPerVb(feeRate: number | undefined): number {
  if (feeRate == null || feeRate < ARKADE_MIN_FEE_RATE_SAT_PER_VB) {
    return ARKADE_MIN_FEE_RATE_SAT_PER_VB
  }
  return feeRate
}

export function estimateP2APackageFeeSats(params: {
  parentVsize: number
  childVsize: number
  feeRateSatPerVb: number
}): number {
  const packageVsize = params.parentVsize + params.childVsize
  return Math.ceil(params.feeRateSatPerVb * packageVsize)
}

export function estimateChildBumpVsize(params: {
  bumperAddress: string
  networkName: NetworkName
}): number {
  const network = networks[params.networkName]
  return Number(
    TxWeightEstimator.create()
      .addKeySpendInput(true)
      .addP2AInput()
      .addOutputAddress(params.bumperAddress, network)
      .vsize().value,
  )
}

function decodeDestinationScript(
  destinationAddress: string,
  networkNames: NetworkName[],
): Uint8Array | null {
  for (const networkName of networkNames) {
    try {
      const network = networks[networkName]
      const addr = Address(network).decode(destinationAddress)
      return OutScript.encode(addr)
    } catch {
      continue
    }
  }
  return null
}

function offchainInputTypeForVtxo(vtxo: VirtualCoin): 'recoverable' | 'vtxo' {
  return vtxo.virtualStatus?.state === 'swept' ? 'recoverable' : 'vtxo'
}

export async function estimateCollaborativeOffboardFees(params: {
  feeInfo: FeeInfo
  vtxos: VirtualCoin[]
  destinationAddress: string
  amountSats?: number
  networkNames: NetworkName[]
}): Promise<CollaborativeOffboardFeeEstimateResult> {
  const destinationScript = decodeDestinationScript(
    params.destinationAddress,
    params.networkNames,
  )
  if (destinationScript == null) {
    return {
      estimatedTotalFeeSats: null,
      estimatedReceiveSats: null,
      estimateError: `Failed to decode destination address: ${params.destinationAddress}`,
    }
  }

  const estimator = new Estimator(params.feeInfo.intentFee ?? {})
  const filteredVtxos: VirtualCoin[] = []
  let totalInputFeesSats = 0
  let totalAmountAfterInputFees = 0n

  for (const vtxo of params.vtxos) {
    const inputFee = estimator.evalOffchainInput({
      amount: BigInt(vtxo.value),
      type: offchainInputTypeForVtxo(vtxo),
      weight: 0,
      birth: vtxo.createdAt,
      expiry: vtxo.virtualStatus?.batchExpiry
        ? new Date(vtxo.virtualStatus.batchExpiry)
        : undefined,
    })
    if (inputFee.satoshis >= vtxo.value) {
      continue
    }
    filteredVtxos.push(vtxo)
    totalInputFeesSats += inputFee.satoshis
    totalAmountAfterInputFees += BigInt(vtxo.value) - BigInt(inputFee.satoshis)
  }

  if (filteredVtxos.length === 0) {
    return {
      estimatedTotalFeeSats: null,
      estimatedReceiveSats: null,
      estimateError: 'No VTXOs available after deducting fees',
    }
  }

  let offboardAmount = params.amountSats ?? Number(totalAmountAfterInputFees)
  if (params.amountSats != null && BigInt(params.amountSats) > totalAmountAfterInputFees) {
    return {
      estimatedTotalFeeSats: null,
      estimatedReceiveSats: null,
      estimateError: 'Amount is greater than total VTXO value after input fees',
    }
  }

  const outputFee = estimator.evalOnchainOutput({
    amount: BigInt(offboardAmount),
    script: hex.encode(destinationScript),
  })

  if (BigInt(outputFee.satoshis) > BigInt(offboardAmount)) {
    return {
      estimatedTotalFeeSats: null,
      estimatedReceiveSats: null,
      estimateError: `Output fee (${outputFee.satoshis} sats) exceeds offboard amount`,
    }
  }

  const estimatedReceiveSats = offboardAmount - outputFee.satoshis
  const estimatedTotalFeeSats = totalInputFeesSats + outputFee.satoshis

  return {
    estimatedTotalFeeSats,
    estimatedReceiveSats,
  }
}

function isSkippableChainTx(chainTx: ChainTx): boolean {
  return (
    chainTx.type === ChainTxType.COMMITMENT ||
    chainTx.type === ChainTxType.UNSPECIFIED
  )
}

async function resolveTxOnchainStatus(
  txid: string,
  getTxStatus: (txid: string) => Promise<TxOnchainStatus>,
  simulatedState: Map<string, TxOnchainStatus>,
): Promise<TxOnchainStatus> {
  const simulated = simulatedState.get(txid)
  if (simulated != null) {
    return simulated
  }
  return getTxStatus(txid)
}

async function findNextUnrollStep(
  chain: ChainTx[],
  getTxStatus: (txid: string) => Promise<TxOnchainStatus>,
  simulatedState: Map<string, TxOnchainStatus>,
): Promise<
  | { kind: 'done' }
  | { kind: 'wait'; txid: string }
  | { kind: 'unroll'; chainTx: ChainTx }
> {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const chainTx = chain[index]
    if (isSkippableChainTx(chainTx)) {
      continue
    }

    let status: TxOnchainStatus
    try {
      status = await resolveTxOnchainStatus(chainTx.txid, getTxStatus, simulatedState)
    } catch {
      return { kind: 'unroll', chainTx }
    }

    if (status === 'confirmed') {
      continue
    }
    if (status === 'unconfirmed') {
      return { kind: 'wait', txid: chainTx.txid }
    }
    return { kind: 'unroll', chainTx }
  }

  return { kind: 'done' }
}

export async function simulateUnrollPlan(
  chain: ChainTx[],
  getTxStatus: (txid: string) => Promise<TxOnchainStatus>,
): Promise<UnrollPlanSimulationResult> {
  const simulatedState = new Map<string, TxOnchainStatus>()
  let projectedUnrollSteps = 0
  let projectedWaitSteps = 0
  const unrollTxids: string[] = []

  const relevantChain = chain.filter((chainTx) => !isSkippableChainTx(chainTx))

  while (true) {
    const nextStep = await findNextUnrollStep(chain, getTxStatus, simulatedState)
    if (nextStep.kind === 'done') {
      break
    }
    if (nextStep.kind === 'wait') {
      projectedWaitSteps += 1
      simulatedState.set(nextStep.txid, 'confirmed')
      continue
    }
    projectedUnrollSteps += 1
    unrollTxids.push(nextStep.chainTx.txid)
    simulatedState.set(nextStep.chainTx.txid, 'unconfirmed')
  }

  return {
    chainTxCount: relevantChain.length,
    projectedUnrollSteps,
    projectedWaitSteps,
    unrollTxids,
  }
}

export function parentVsizeFromVirtualTxPsbtBase64(psbtBase64: string): number {
  return Transaction.fromPSBT(base64.decode(psbtBase64)).vsize
}

export async function txOnchainStatusFromExplorer(
  explorer: OnchainProvider,
  txid: string,
): Promise<TxOnchainStatus> {
  try {
    const txInfo = await explorer.getTxStatus(txid)
    return txInfo.confirmed ? 'confirmed' : 'unconfirmed'
  } catch {
    return 'missing'
  }
}

export async function sumUnilateralPackageFees(params: {
  unrollTxids: string[]
  feeRateSatPerVb: number
  loadParentVsize: (txid: string) => Promise<number>
  childVsize: number
}): Promise<number> {
  let total = 0
  for (const txid of params.unrollTxids) {
    const parentVsize = await params.loadParentVsize(txid)
    total += estimateP2APackageFeeSats({
      parentVsize,
      childVsize: params.childVsize,
      feeRateSatPerVb: params.feeRateSatPerVb,
    })
  }
  return total
}
