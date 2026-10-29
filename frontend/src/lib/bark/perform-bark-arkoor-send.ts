import { readBarkSpendableSats } from '@/lib/bark/bark-balance'
import {
  BARK_EMERGENCY_EXIT_BLOCKS_ACTION,
  barkEmergencyExitBlocksAmount,
} from '@/lib/bark/emergency-exit-blocks-action'
import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type { BarkArkoorSendResult, BarkBalanceParts, BarkSyncResult } from '@/workers/bark-api'

export type BarkArkoorWasm = Pick<
  BitboardBarkWasm,
  'bark_validate_arkoor_address' | 'bark_estimate_arkoor_payment_fee' | 'bark_send_arkoor'
>

export type BarkArkoorSendDeps = {
  validateArkoorAddress: (address: string) => Promise<void>
  estimateArkoorFeeSats: (amountSats: number) => Promise<number>
  readBalance: () => Promise<Pick<BarkBalanceParts, 'spendableSats' | 'exitingSats'>>
  sendArkoor: (address: string, amountSats: number) => Promise<void>
  sync: () => Promise<BarkSyncResult>
}

export function barkArkoorSendDepsFromWasm(
  wasm: BarkArkoorWasm,
  readBalance: () => Promise<Pick<BarkBalanceParts, 'spendableSats' | 'exitingSats'>>,
  sync: () => Promise<BarkSyncResult>,
): BarkArkoorSendDeps {
  return {
    validateArkoorAddress: (address) => wasm.bark_validate_arkoor_address(address),
    estimateArkoorFeeSats: async (amountSats) =>
      readBarkSpendableSats(await wasm.bark_estimate_arkoor_payment_fee(BigInt(amountSats))),
    readBalance,
    sendArkoor: (address, amountSats) => wasm.bark_send_arkoor(address, BigInt(amountSats)),
    sync,
  }
}

export async function performBarkArkoorSend(
  deps: BarkArkoorSendDeps,
  params: { address: string; amountSats: number },
): Promise<BarkArkoorSendResult> {
  await deps.validateArkoorAddress(params.address)
  const balanceBeforeSend = await deps.readBalance()
  if (
    barkEmergencyExitBlocksAmount({
      amountSats: params.amountSats,
      spendableSats: balanceBeforeSend.spendableSats,
      exitingSats: balanceBeforeSend.exitingSats,
    })
  ) {
    throw new Error(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)
  }
  const feeSats = await deps.estimateArkoorFeeSats(params.amountSats)
  if (params.amountSats + feeSats > balanceBeforeSend.spendableSats) {
    throw new Error(
      balanceBeforeSend.exitingSats > 0
        ? BARK_EMERGENCY_EXIT_BLOCKS_ACTION
        : 'Bark spendable balance is too low for this payment',
    )
  }
  await deps.sendArkoor(params.address, params.amountSats)
  const synced = await deps.sync()
  const spendableSats = (await deps.readBalance()).spendableSats
  return {
    feeSats,
    spendableSats,
    lastSuccessfulSyncAt: synced.lastSuccessfulSyncAt,
  }
}
