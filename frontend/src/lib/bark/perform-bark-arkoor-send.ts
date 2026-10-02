import { readBarkSpendableSats } from '@/lib/bark/bark-balance'
import type { BitboardBarkWasm } from '@/lib/bark/load-bitboard-bark-wasm'
import type { BarkArkoorSendResult, BarkSyncResult } from '@/workers/bark-api'

export type BarkArkoorWasm = Pick<
  BitboardBarkWasm,
  'bark_validate_arkoor_address' | 'bark_estimate_arkoor_payment_fee' | 'bark_send_arkoor'
>

export type BarkArkoorSendDeps = {
  validateArkoorAddress: (address: string) => Promise<void>
  estimateArkoorFeeSats: (amountSats: number) => Promise<number>
  readSpendableSats: () => Promise<number>
  sendArkoor: (address: string, amountSats: number) => Promise<void>
  sync: () => Promise<BarkSyncResult>
}

export function barkArkoorSendDepsFromWasm(
  wasm: BarkArkoorWasm,
  readSpendableSats: () => Promise<number>,
  sync: () => Promise<BarkSyncResult>,
): BarkArkoorSendDeps {
  return {
    validateArkoorAddress: (address) => wasm.bark_validate_arkoor_address(address),
    estimateArkoorFeeSats: async (amountSats) =>
      readBarkSpendableSats(await wasm.bark_estimate_arkoor_payment_fee(BigInt(amountSats))),
    readSpendableSats,
    sendArkoor: (address, amountSats) => wasm.bark_send_arkoor(address, BigInt(amountSats)),
    sync,
  }
}

export async function performBarkArkoorSend(
  deps: BarkArkoorSendDeps,
  params: { address: string; amountSats: number },
): Promise<BarkArkoorSendResult> {
  await deps.validateArkoorAddress(params.address)
  const feeSats = await deps.estimateArkoorFeeSats(params.amountSats)
  const spendableBeforeSend = await deps.readSpendableSats()
  if (params.amountSats + feeSats > spendableBeforeSend) {
    throw new Error('Bark spendable balance is too low for this payment')
  }
  await deps.sendArkoor(params.address, params.amountSats)
  const synced = await deps.sync()
  const spendableSats = await deps.readSpendableSats()
  return {
    feeSats,
    spendableSats,
    lastSuccessfulSyncAt: synced.lastSuccessfulSyncAt,
  }
}
