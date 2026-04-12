import { nextLabEntityId } from '@/lib/lab-entity-keys'
import { isCoinbase } from '@/lib/lab-operations'
import { discardedMempoolConflictTxCount } from '@/lib/lab-mempool-mine-stats'
import { labEntityLabOwner, walletLabOwner } from '@/lib/lab-owner'
import type { LabOwner } from '@/lib/lab-owner'
import type { LabAddress, LabMineBlocksResult, LabState } from './lab-api'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
  LAB_MAX_BLOCKS_PER_MINE,
  LAB_MIN_BLOCKS_PER_MINE,
} from './lab-api'
import { applyBlockEffects } from './lab-block-effects'
import { createAndRegisterLabEntityFromWasm } from './lab-entity-creation'
import { getTip, selectMempoolTxsForBlock } from './lab-mining-template'
import { getWasm } from './lab-wasm-loader'
import { state } from './lab-worker-state'

export async function executeMineBlocks(
  blockCountToMine: number,
  targetAddress: string,
  options:
    | {
        ownerName?: string
        ownerLabEntityId?: number
        ownerWalletId?: number
        labAddressType?: string
        labNetwork?: string
      }
    | undefined,
  getStateSnapshot: () => Promise<LabState>,
): Promise<LabMineBlocksResult> {
  if (
    !Number.isInteger(blockCountToMine) ||
    blockCountToMine < LAB_MIN_BLOCKS_PER_MINE ||
    blockCountToMine > LAB_MAX_BLOCKS_PER_MINE
  ) {
    throw new Error(
      `Block count must be an integer from ${LAB_MIN_BLOCKS_PER_MINE} to ${LAB_MAX_BLOCKS_PER_MINE} (inclusive)`,
    )
  }

  const wasmModule = await getWasm()
  const tip = getTip()

  let prevHash = ''
  let height = 0
  if (tip) {
    prevHash = tip.blockHash
    height = tip.height + 1
  }

  const labNetwork = options?.labNetwork ?? 'regtest'
  const labAddressType = options?.labAddressType ?? 'segwit'
  const entityNameOpt = options?.ownerName?.trim()

  let coinbaseScriptPubkeyHex: string
  let newAddress: LabAddress | null = null
  let coinbaseAddress: string
  /** Lab entity id for coinbase ownership (not used for wallet or bare target). */
  let ownerForCoinbase: LabOwner | undefined

  if (
    options?.ownerLabEntityId != null &&
    options.ownerWalletId == null &&
    Number.isInteger(options.ownerLabEntityId)
  ) {
    const entity = state.entities.find((e) => e.labEntityId === options.ownerLabEntityId)
    if (!entity) {
      throw new Error(`Unknown lab entity id ${options.ownerLabEntityId}`)
    }
    if (entity.isDead) {
      throw new Error('Cannot mine to a dead lab entity')
    }
    coinbaseAddress = wasmModule.lab_entity_get_current_external_address(
      entity.mnemonic,
      entity.changesetJson,
      entity.network,
      entity.addressType,
      entity.accountId,
    )
    coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
    newAddress = null
    ownerForCoinbase = labEntityLabOwner(entity.labEntityId)
  } else if (entityNameOpt != null && entityNameOpt !== '' && options?.ownerWalletId == null) {
    let entity = state.entities.find((e) => e.entityName === entityNameOpt)
    const now = new Date().toISOString()
    if (!entity) {
      coinbaseAddress = createAndRegisterLabEntityFromWasm(wasmModule, {
        labEntityId: nextLabEntityId(state.entities),
        entityName: entityNameOpt,
        labNetwork,
        labAddressType,
        nowIso: now,
        noAddressErrorMessage: 'Lab entity wallet creation failed (no first address)',
      })
      entity = state.entities.find((e) => e.entityName === entityNameOpt)
      if (!entity) {
        throw new Error('Lab entity registration failed after wallet creation')
      }
    } else {
      coinbaseAddress = wasmModule.lab_entity_get_current_external_address(
        entity.mnemonic,
        entity.changesetJson,
        entity.network,
        entity.addressType,
        entity.accountId,
      )
    }
    coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
    newAddress = null
    ownerForCoinbase = labEntityLabOwner(entity!.labEntityId)
  } else if (targetAddress.trim()) {
    coinbaseAddress = targetAddress.trim()
    coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
    newAddress = null
  } else {
    const labEntityId = nextLabEntityId(state.entities)
    const now = new Date().toISOString()
    coinbaseAddress = createAndRegisterLabEntityFromWasm(wasmModule, {
      labEntityId,
      entityName: null,
      labNetwork,
      labAddressType,
      nowIso: now,
      noAddressErrorMessage: 'Anonymous lab entity wallet creation failed (no first address)',
    })
    coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(coinbaseAddress)
    newAddress = null
    ownerForCoinbase = labEntityLabOwner(labEntityId)
  }

  if (options?.ownerWalletId != null) {
    state.addressToOwner = state.addressToOwner ?? {}
    state.addressToOwner[coinbaseAddress] = walletLabOwner(options.ownerWalletId)
  } else if (ownerForCoinbase != null) {
    state.addressToOwner = state.addressToOwner ?? {}
    state.addressToOwner[coinbaseAddress] = ownerForCoinbase
  }

  const minedBy: LabOwner | null =
    options?.ownerWalletId != null
      ? walletLabOwner(options.ownerWalletId)
      : ownerForCoinbase ?? null

  const mempoolCopy = [...(state.mempool ?? [])]
  const blockLimit = state.blockWeightLimit ?? LAB_DEFAULT_BLOCK_WEIGHT_UNITS
  const selectedEntries = selectMempoolTxsForBlock(mempoolCopy, blockLimit)
  const nonCoinbaseWeightFirstBlock = selectedEntries.reduce((sum, entry) => sum + entry.weight, 0)
  const mempoolTxHexes = selectedEntries.map((entry) => entry.signedTxHex)
  const totalFeesSats = selectedEntries.reduce((sum, entry) => sum + entry.feeSats, 0)
  const spentByIncluded = new Set(
    selectedEntries.flatMap((entry) => entry.inputs.map((input) => `${input.txid}:${input.vout}`)),
  )

  const minerSubsidySats = state.minerSubsidySats ?? LAB_DEFAULT_MINER_SUBSIDY_SATS
  const subsidyForBlock = BigInt(minerSubsidySats)

  for (let i = 0; i < blockCountToMine; i++) {
    const txsForBlock = i === 0 ? mempoolTxHexes : []
    const feesForBlock = BigInt(i === 0 ? totalFeesSats : 0)
    const blockHex = wasmModule.lab_mine_block(
      prevHash,
      height,
      coinbaseScriptPubkeyHex,
      txsForBlock,
      subsidyForBlock,
      feesForBlock,
    )
    applyBlockEffects(wasmModule, blockHex, height, i === 0 ? newAddress ?? undefined : undefined)
    const minedAtHeight = height
    const tipAfter = getTip()!
    const coinbaseDetail = state.txDetails.find(
      (d) => d.blockHeight === minedAtHeight && isCoinbase(d),
    )
    state.mineOperations = state.mineOperations ?? []
    state.mineOperations.push({
      height: minedAtHeight,
      blockHash: tipAfter.blockHash,
      minedBy,
      coinbaseTxid: coinbaseDetail?.txid ?? null,
      createdAt: new Date().toISOString(),
      blockWeightLimitWu: blockLimit,
      nonCoinbaseWeightUsedWu: i === 0 ? nonCoinbaseWeightFirstBlock : 0,
    })
    if (i === 0) {
      state.mempool = (state.mempool ?? []).filter(
        (entry) =>
          !selectedEntries.some((selectedEntry) => selectedEntry.txid === entry.txid) &&
          !entry.inputs.some((input) => spentByIncluded.has(`${input.txid}:${input.vout}`)),
      )
    }
    if (i > 0) newAddress = null
    const newTip = getTip()!
    prevHash = newTip.blockHash
    height = newTip.height + 1
  }

  const includedMempoolTxCount = selectedEntries.length
  const mempoolSizeAfterFirstBlock = (state.mempool ?? []).length
  const discardedConflictTxCount = discardedMempoolConflictTxCount({
    mempoolSizeBefore: mempoolCopy.length,
    mempoolSizeAfterFirstBlock,
    includedMempoolTxCount,
  })

  return {
    state: await getStateSnapshot(),
    includedMempoolTxCount,
    discardedConflictTxCount,
  }
}
