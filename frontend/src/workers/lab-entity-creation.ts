import type { AddressType } from '@/lib/wallet/wallet-domain-types'
import { parseWasmObject, labWorkerState } from './lab-worker-state'
import type { LabEntityRecord } from './lab-api'
import { mapWireCreateWalletResultToDomain } from './crypto-wire-mappers'
import type { WireCreateWalletResult } from './crypto-wire-types'

type WasmModule = Awaited<ReturnType<typeof import('./lab-wasm-loader').getWasm>>

export function createAndRegisterLabEntityFromWasm(
  wasmModule: WasmModule,
  params: {
    labEntityId: number
    entityName: string | null
    labNetwork: string
    labAddressType: AddressType
    nowIso: string
    noAddressErrorMessage: string
  },
): string {
  const { labEntityId, entityName, labNetwork, labAddressType, nowIso, noAddressErrorMessage } =
    params
  const mnemonic = wasmModule.generate_mnemonic(12)
  const createdRaw = wasmModule.create_lab_entity_wallet(
    mnemonic,
    labNetwork,
    labAddressType,
    0,
  )
  const walletCreationResult = mapWireCreateWalletResultToDomain(
    parseWasmObject(createdRaw) as WireCreateWalletResult,
  )
  const entity: LabEntityRecord = {
    labEntityId,
    entityName,
    mnemonic,
    changesetJson: walletCreationResult.changesetJson,
    externalDescriptor: walletCreationResult.externalDescriptor,
    internalDescriptor: walletCreationResult.internalDescriptor,
    network: labNetwork,
    addressType: labAddressType,
    accountId: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDead: false,
  }
  labWorkerState.entities.push(entity)
  const coinbaseAddress = walletCreationResult.firstAddress
  if (!coinbaseAddress) {
    throw new Error(noAddressErrorMessage)
  }
  return coinbaseAddress
}
