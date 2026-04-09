import { parseWasmObject, state } from './lab-worker-state'
import type { LabEntityRecord } from './lab-api'

type WasmModule = Awaited<ReturnType<typeof import('./lab-wasm-loader').getWasm>>

export function createAndRegisterLabEntityFromWasm(
  wasmModule: WasmModule,
  params: {
    entityName: string
    labNetwork: string
    labAddressType: string
    nowIso: string
    noAddressErrorMessage: string
  },
): string {
  const { entityName, labNetwork, labAddressType, nowIso, noAddressErrorMessage } = params
  const mnemonic = wasmModule.generate_mnemonic(12)
  const createdRaw = wasmModule.create_lab_entity_wallet(
    mnemonic,
    labNetwork,
    labAddressType,
    0,
  )
  const cr = parseWasmObject(createdRaw)
  const entity: LabEntityRecord = {
    entityName,
    mnemonic,
    changesetJson: String(cr.changeset_json ?? ''),
    externalDescriptor: String(cr.external_descriptor ?? ''),
    internalDescriptor: String(cr.internal_descriptor ?? ''),
    network: labNetwork,
    addressType: labAddressType,
    accountId: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  state.entities.push(entity)
  const coinbaseAddress = String(cr.first_address ?? '')
  if (!coinbaseAddress) {
    throw new Error(noAddressErrorMessage)
  }
  return coinbaseAddress
}
