import { expose } from 'comlink'
import { AddressType } from '@/lib/wallet/wallet-domain-types'
import type { LabOwner } from '@/lib/lab/lab-owner'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
  LAB_MIN_BLOCK_WEIGHT_UNITS,
  mergeMempoolInputsDetailWithOutpoints,
  normalizeBlockWeightLimit,
  normalizeMinerSubsidySats,
  type LabAddress,
  type LabBlockDetails,
  type LabCurrentBlockTemplateParams,
  type LabMineBlocksResult,
  type LabState,
  type LabTxDetails,
} from './lab-api'
import { findLabEntityById, nextLabEntityId } from '@/lib/lab/lab-entity-keys'
import { labVsizeFromWeight } from '@/lib/lab/lab-tx-weight'
import {
  labEntityLabOwner,
  labEntityMustBeAliveToSend,
  labOwnersEqual,
  validateLabEntityRenameName,
  walletLabOwner,
} from '@/lib/lab/lab-owner'
import { mergeAddressesWithUtxos } from '@/lib/lab/lab-utils'
import {
  estimateRequiredFeeSats,
  feeRateSatPerVbFromRandomRoll,
  LAB_RANDOM_FEE_RATE_TENTHS_MAX,
  LAB_RANDOM_FEE_RATE_TENTHS_MIN,
  LAB_RANDOM_TX_MAX_ATTEMPTS_DEFAULT,
  sampleRandomLabAmountSats,
} from './lab-random-transactions'
import { appendLabTxOperationAndMempoolEntry } from './lab-append-mempool'
import {
  buildCurrentBlockTemplate,
  buildMinedBlockDetails,
  getTip,
  randomIntInclusive,
} from './lab-mining-template'
import { createAndRegisterLabEntityFromWasm } from './lab-entity-creation'
import { executeMineBlocks } from './lab-mine-blocks'
import { getWasm } from './lab-wasm-loader'
import { utxosToJsonForLabWasm } from './lab-wasm-utxos'
import {
  assertLabReceiverNonNull,
  labAddressesEqual,
  lookupOwnerForLabAddress,
  parseWasmObject,
  rebuildTxidToChangeAddressFromState,
  replaceLabWorkerState,
  labWorkerState,
} from './lab-worker-state'

function wasmU64ToNumber(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return 0
}

const labService = {
  async loadState(newState: LabState): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(newState)) as LabState
    const wasmModule = await getWasm()
    const legacy = cloned as LabState & { blockSizeLimitVbytes?: number }
    const blockWeightLimit = normalizeBlockWeightLimit(
      cloned.blockWeightLimit ??
        legacy.blockSizeLimitVbytes ??
        LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
    )
    const minerSubsidySats = normalizeMinerSubsidySats(
      cloned.minerSubsidySats ?? LAB_DEFAULT_MINER_SUBSIDY_SATS,
    )
    const mempool = (cloned.mempool ?? []).map((entry) => {
      let next = { ...entry }
      if (next.weight <= 0) {
        const txWeight = wasmU64ToNumber(wasmModule.lab_tx_weight(entry.signedTxHex))
        next = { ...next, weight: txWeight > 0 ? txWeight : 1 }
      }
      next = { ...next, vsize: labVsizeFromWeight(next.weight) }
      return next
    })
    replaceLabWorkerState({
      blocks: cloned.blocks ?? [],
      utxos: cloned.utxos ?? [],
      addresses: cloned.addresses ?? [],
      entities: (cloned.entities ?? []).map((entity) => ({
        ...entity,
        isDead: entity.isDead ?? false,
      })),
      addressToOwner: cloned.addressToOwner ?? {},
      mempool,
      transactions: cloned.transactions ?? [],
      txDetails: cloned.txDetails ?? [],
      mineOperations: cloned.mineOperations ?? [],
      txOperations: cloned.txOperations ?? [],
      blockWeightLimit,
      minerSubsidySats,
    })
    rebuildTxidToChangeAddressFromState()
  },

  async setBlockWeightLimit(blockWeightLimit: number): Promise<LabState> {
    if (!Number.isFinite(blockWeightLimit)) {
      throw new Error('blockWeightLimit must be a finite number')
    }
    const floored = Math.floor(blockWeightLimit)
    if (floored < LAB_MIN_BLOCK_WEIGHT_UNITS) {
      throw new Error(
        `blockWeightLimit must be at least ${LAB_MIN_BLOCK_WEIGHT_UNITS} weight units`,
      )
    }
    labWorkerState.blockWeightLimit = floored
    return JSON.parse(JSON.stringify(labWorkerState)) as LabState
  },

  async setMinerSubsidySats(minerSubsidySats: number): Promise<LabState> {
    if (!Number.isFinite(minerSubsidySats)) {
      throw new Error('minerSubsidySats must be a finite number')
    }
    labWorkerState.minerSubsidySats = normalizeMinerSubsidySats(minerSubsidySats)
    return JSON.parse(JSON.stringify(labWorkerState)) as LabState
  },

  async getTransaction(txid: string): Promise<LabTxDetails | null> {
    const key = txid.trim().toLowerCase()
    const mempoolEntry = labWorkerState.mempool.find(
      (entry) => entry.txid.toLowerCase() === key,
    )
    if (mempoolEntry) {
      return {
        txid: mempoolEntry.txid,
        blockHeight: -1,
        blockTime: 0,
        confirmations: 0,
        inputs: mergeMempoolInputsDetailWithOutpoints(
          mempoolEntry.inputs,
          mempoolEntry.inputsDetail,
        ),
        outputs: mempoolEntry.outputsDetail,
      }
    }
    const details = labWorkerState.txDetails.find((tx) => tx.txid.toLowerCase() === key)
    if (!details) return null
    const blockCount = getTip() ? getTip()!.height + 1 : 0
    return {
      ...details,
      confirmations: blockCount - details.blockHeight,
    }
  },

  async getBlockByHeight(height: number): Promise<LabBlockDetails | null> {
    const block = labWorkerState.blocks.find((candidate) => candidate.height === height)
    if (!block) return null
    return buildMinedBlockDetails(block)
  },

  async getCurrentBlockTemplate(
    params: LabCurrentBlockTemplateParams,
  ): Promise<LabBlockDetails> {
    return buildCurrentBlockTemplate(params)
  },

  async getBlockCount(): Promise<number> {
    const tip = getTip()
    return tip ? tip.height + 1 : 0
  },

  async getAddresses(): Promise<LabAddress[]> {
    return mergeAddressesWithUtxos(labWorkerState.addresses, labWorkerState.utxos)
  },

  async getStateSnapshot(): Promise<LabState> {
    return JSON.parse(JSON.stringify(labWorkerState))
  },

  async mineBlocks(
    blockCountToMine: number,
    targetAddress: string,
    options?: {
      ownerName?: string
      ownerLabEntityId?: number
      ownerWalletId?: number
      labAddressType?: AddressType
      labNetwork?: string
    },
  ): Promise<LabMineBlocksResult> {
    return executeMineBlocks(blockCountToMine, targetAddress, options, () =>
      labService.getStateSnapshot(),
    )
  },

  async prepareLabEntityTransaction(params: {
    labEntityId: number
    fromAddress: string
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
    knownRecipientOwner?: LabOwner | null
  }): Promise<{
    crypto: import('./lab-api').LabEntityTransactionCryptoParams
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
    const { labEntityId, fromAddress, toAddress, amountSats, feeRateSatPerVb } = params
    const addressToOwner = labWorkerState.addressToOwner ?? {}
    const ownerAtFrom = lookupOwnerForLabAddress(fromAddress, addressToOwner) ?? null
    const expectedOwner = labEntityLabOwner(labEntityId)
    if (!labOwnersEqual(ownerAtFrom, expectedOwner)) {
      throw new Error('From address does not belong to this lab entity')
    }
    if (ownerAtFrom != null && ownerAtFrom.kind === 'wallet') {
      throw new Error('Use the wallet Send flow for user-wallet lab spends')
    }

    const entity = findLabEntityById(labWorkerState.entities, labEntityId)
    if (!entity) {
      throw new Error(`Unknown lab entity id ${labEntityId}`)
    }
    labEntityMustBeAliveToSend(entity)

    const fromUtxos = labWorkerState.utxos.filter((utxo) => labAddressesEqual(utxo.address, fromAddress))
    if (fromUtxos.length === 0) {
      throw new Error('No UTXOs for the selected from address')
    }

    const utxosJson = utxosToJsonForLabWasm(fromUtxos)

    const sender = expectedOwner
    const knownRecipient = params.knownRecipientOwner ?? null
    const receiver =
      lookupOwnerForLabAddress(toAddress, addressToOwner) ??
      (labAddressesEqual(fromAddress, toAddress) ? expectedOwner : null) ??
      knownRecipient
    if (receiver != null && lookupOwnerForLabAddress(toAddress, addressToOwner) === undefined) {
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[toAddress] = receiver
    }
    assertLabReceiverNonNull(
      receiver,
      `prepareLabEntityTransaction labEntityId=${labEntityId} toAddress="${toAddress}"`,
    )

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: lookupOwnerForLabAddress(utxo.address, addressToOwner) ?? null,
      prevTxid: utxo.txid,
      prevVout: utxo.vout,
    }))

    const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
    const inputs = fromUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))

    return {
      crypto: {
        mnemonic: entity.mnemonic,
        changesetJson: entity.changesetJson,
        network: entity.network,
        addressType: entity.addressType,
        accountId: entity.accountId,
        utxosJson,
        toAddress,
        amountSats,
        feeRateSatPerVb,
      },
      mempoolMetadata: {
        sender,
        receiver,
        feeSats: 0,
        inputs,
        inputsDetail,
        outputsDetail: [{ address: toAddress, amountSats, owner: receiver }],
        hasChange: false,
        walletChangeAddress: '',
      },
      totalInput,
    }
  },

  async prepareRandomLabEntityTransaction(
    params?: import('./lab-api').PrepareRandomLabEntityTransactionParams,
  ): Promise<import('./lab-api').PrepareRandomLabEntityTransactionResult | null> {
    const wasmModule = await getWasm()
    const maxAttempts = Math.max(1, params?.maxAttempts ?? LAB_RANDOM_TX_MAX_ATTEMPTS_DEFAULT)
    const addressToOwner = labWorkerState.addressToOwner ?? {}
    const sourceEntities = labWorkerState.entities.filter((entity) => {
      if (entity.isDead) return false
      return labWorkerState.utxos.some((utxo) =>
        labOwnersEqual(
          lookupOwnerForLabAddress(utxo.address, addressToOwner),
          labEntityLabOwner(entity.labEntityId),
        ),
      )
    })
    if (sourceEntities.length === 0) return null

    const aliveEntities = labWorkerState.entities.filter((entity) => !entity.isDead)
    if (aliveEntities.length === 0) return null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sourceEntity = sourceEntities[randomIntInclusive(0, sourceEntities.length - 1)]
      const targetEntity = aliveEntities[randomIntInclusive(0, aliveEntities.length - 1)]
      const sourceAddressCandidates = labWorkerState.utxos
        .filter((utxo) =>
          labOwnersEqual(
            lookupOwnerForLabAddress(utxo.address, addressToOwner),
            labEntityLabOwner(sourceEntity.labEntityId),
          ),
        )
        .map((utxo) => utxo.address)
      const sourceAddresses = [...new Set(sourceAddressCandidates)]
      if (sourceAddresses.length === 0) continue

      const fromAddress = sourceAddresses[randomIntInclusive(0, sourceAddresses.length - 1)]
      const fromUtxos = labWorkerState.utxos.filter((utxo) =>
        labAddressesEqual(utxo.address, fromAddress),
      )
      if (fromUtxos.length === 0) continue

      const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
      const feeRateSatPerVb = feeRateSatPerVbFromRandomRoll(
        randomIntInclusive(LAB_RANDOM_FEE_RATE_TENTHS_MIN, LAB_RANDOM_FEE_RATE_TENTHS_MAX),
      )
      const requiredFeeSats = estimateRequiredFeeSats(fromUtxos.length, feeRateSatPerVb)
      const amountSats = sampleRandomLabAmountSats(totalInput, requiredFeeSats)
      if (amountSats === null) continue

      let toAddress: string
      if (sourceEntity.labEntityId === targetEntity.labEntityId) {
        const revealedRaw = wasmModule.lab_entity_reveal_next_external_address(
          sourceEntity.mnemonic,
          sourceEntity.changesetJson,
          sourceEntity.network,
          sourceEntity.addressType,
          sourceEntity.accountId,
        )
        const revealedObj = parseWasmObject(revealedRaw)
        toAddress = String(revealedObj.address ?? '')
        const nextChangesetJson = String(revealedObj.changeset_json ?? '')
        if (!toAddress || !nextChangesetJson) continue
        sourceEntity.changesetJson = nextChangesetJson
        sourceEntity.updatedAt = new Date().toISOString()
        labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
        labWorkerState.addressToOwner[toAddress] = labEntityLabOwner(sourceEntity.labEntityId)
      } else {
        toAddress = wasmModule.lab_entity_get_current_external_address(
          targetEntity.mnemonic,
          targetEntity.changesetJson,
          targetEntity.network,
          targetEntity.addressType,
          targetEntity.accountId,
        )
        labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
        labWorkerState.addressToOwner[toAddress] = labEntityLabOwner(targetEntity.labEntityId)
      }
      if (!toAddress) continue

      const prepareParams = {
        labEntityId: sourceEntity.labEntityId,
        fromAddress,
        toAddress,
        amountSats,
        feeRateSatPerVb,
      }
      const prepared = await this.prepareLabEntityTransaction(prepareParams)
      const mempoolMetadata =
        sourceEntity.labEntityId === targetEntity.labEntityId
          ? {
              ...prepared.mempoolMetadata,
              receiver: labEntityLabOwner(sourceEntity.labEntityId),
            }
          : prepared.mempoolMetadata
      return {
        prepareParams,
        labEntityId: sourceEntity.labEntityId,
        crypto: prepared.crypto,
        mempoolMetadata,
        totalInput: prepared.totalInput,
      }
    }
    return null
  },

  async finalizeLabEntityMempoolTransaction(params: {
    signedTxHex: string
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    labEntityId: number
    newChangesetJson: string
  }): Promise<LabState> {
    const wasmModule = await getWasm()
    const { signedTxHex, mempoolMetadata, labEntityId, newChangesetJson } = params

    const entity = findLabEntityById(labWorkerState.entities, labEntityId)
    if (!entity) {
      throw new Error(`Unknown lab entity id ${labEntityId}`)
    }
    entity.changesetJson = newChangesetJson
    entity.updatedAt = new Date().toISOString()

    const txid = wasmModule.lab_txid(signedTxHex)
    assertLabReceiverNonNull(
      mempoolMetadata.receiver,
      `finalizeLabEntityMempoolTransaction txid=${txid}`,
    )
    const changeOut = mempoolMetadata.hasChange
      ? mempoolMetadata.outputsDetail.find((outputDetail) => outputDetail.isChange)
      : undefined
    const changeVout = mempoolMetadata.outputsDetail.findIndex((outputDetail) => outputDetail.isChange)

    const weight = wasmU64ToNumber(wasmModule.lab_tx_weight(signedTxHex))
    appendLabTxOperationAndMempoolEntry({
      signedTxHex,
      txid,
      weight: weight > 0 ? weight : 1,
      mempoolMetadata,
      sender: labEntityLabOwner(entity.labEntityId),
      changeAddress: changeOut?.address ?? null,
      changeVout: changeVout >= 0 ? changeVout : null,
    })

    return this.getStateSnapshot()
  },

  async prepareLabWalletTransaction(params: {
    walletId: number
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
    walletChangeAddress: string
    knownRecipientOwner?: LabOwner | null
  }): Promise<{
    utxosJson: string
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
    const { walletId, toAddress, amountSats, walletChangeAddress } = params
    const addressToOwner = labWorkerState.addressToOwner ?? {}
    const walletOwner = walletLabOwner(walletId)

    const fromUtxos = labWorkerState.utxos.filter((utxo) =>
      labOwnersEqual(lookupOwnerForLabAddress(utxo.address, addressToOwner), walletOwner),
    )
    if (fromUtxos.length === 0) {
      throw new Error(
        `No UTXOs available for the wallet. walletId=${walletId}. ` +
          `Ensure the wallet is loaded for lab (regtest) and you have mined to it.`,
      )
    }

    const utxosJson = utxosToJsonForLabWasm(fromUtxos)

    const sender = walletOwner
    const knownRecipient = params.knownRecipientOwner ?? null
    let receiver = lookupOwnerForLabAddress(toAddress, addressToOwner) ?? null
    if (receiver === null && knownRecipient != null) {
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[toAddress] = knownRecipient
      receiver = knownRecipient
    }
    if (receiver === null) {
      throw new Error(
        `prepareLabWalletTransaction: cannot resolve payee owner for toAddress="${toAddress}". ` +
          `Send to a lab-mapped address, or pay your active receive address (shown on Receive) so the app can set knownRecipientOwner.`,
      )
    }
    assertLabReceiverNonNull(
      receiver,
      `prepareLabWalletTransaction walletId=${walletId} toAddress="${toAddress}"`,
    )

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: lookupOwnerForLabAddress(utxo.address, addressToOwner) ?? null,
      prevTxid: utxo.txid,
      prevVout: utxo.vout,
    }))

    const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
    const inputs = fromUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))

    return {
      utxosJson,
      mempoolMetadata: {
        sender,
        receiver,
        feeSats: 0,
        inputs,
        inputsDetail,
        outputsDetail: [{ address: toAddress, amountSats, owner: receiver }],
        hasChange: false,
        walletChangeAddress,
      },
      totalInput,
    }
  },

  async addSignedTransactionToMempool(
    signedTxHex: string,
    mempoolMetadata: import('./lab-api').LabMempoolMetadata,
  ): Promise<LabState> {
    const wasmModule = await getWasm()

    const txid = wasmModule.lab_txid(signedTxHex)
    assertLabReceiverNonNull(
      mempoolMetadata.receiver,
      `addSignedTransactionToMempool txid=${txid}`,
    )

    const changeVout = mempoolMetadata.outputsDetail.findIndex((outputDetail) => outputDetail.isChange)
    const sender = mempoolMetadata.sender
    if (sender == null) {
      throw new Error(`addSignedTransactionToMempool: missing sender for txid=${txid}`)
    }

    const weight = wasmU64ToNumber(wasmModule.lab_tx_weight(signedTxHex))
    appendLabTxOperationAndMempoolEntry({
      signedTxHex,
      txid,
      weight: weight > 0 ? weight : 1,
      mempoolMetadata,
      sender,
      changeAddress: mempoolMetadata.hasChange ? mempoolMetadata.walletChangeAddress : null,
      changeVout: changeVout >= 0 ? changeVout : null,
    })

    return this.getStateSnapshot()
  },

  async createLabEntity(options?: {
    ownerName?: string
    labAddressType?: AddressType
    labNetwork?: string
  }): Promise<LabState> {
    const wasmModule = await getWasm()
    const labNetwork = options?.labNetwork ?? 'regtest'
    const labAddressType = options?.labAddressType ?? AddressType.SegWit
    const entityNameOpt = options?.ownerName?.trim()
    const now = new Date().toISOString()

    if (entityNameOpt != null && entityNameOpt !== '') {
      const nameCheck = validateLabEntityRenameName(entityNameOpt, labWorkerState.entities, -1)
      if (!nameCheck.ok) throw new Error(nameCheck.error)
      let entity = labWorkerState.entities.find((entityRecord) => entityRecord.entityName === entityNameOpt)
      if (!entity) {
        createAndRegisterLabEntityFromWasm(wasmModule, {
          labEntityId: nextLabEntityId(labWorkerState.entities),
          entityName: entityNameOpt,
          labNetwork,
          labAddressType,
          nowIso: now,
          noAddressErrorMessage: 'Lab entity wallet creation failed (no first address)',
        })
        entity = labWorkerState.entities.find((entityRecord) => entityRecord.entityName === entityNameOpt)
        if (!entity) throw new Error('Lab entity registration failed after wallet creation')
      }
      const addr = wasmModule.lab_entity_get_current_external_address(
        entity.mnemonic,
        entity.changesetJson,
        entity.network,
        entity.addressType,
        entity.accountId,
      )
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[addr] = labEntityLabOwner(entity.labEntityId)
    } else {
      const labEntityId = nextLabEntityId(labWorkerState.entities)
      const addr = createAndRegisterLabEntityFromWasm(wasmModule, {
        labEntityId,
        entityName: null,
        labNetwork,
        labAddressType,
        nowIso: now,
        noAddressErrorMessage: 'Anonymous lab entity wallet creation failed (no first address)',
      })
      labWorkerState.addressToOwner = labWorkerState.addressToOwner ?? {}
      labWorkerState.addressToOwner[addr] = labEntityLabOwner(labEntityId)
    }
    return this.getStateSnapshot()
  },

  async renameLabEntity(labEntityId: number, newName: string): Promise<LabState> {
    const trimmed = newName.trim()
    const validationOutcome = validateLabEntityRenameName(trimmed, labWorkerState.entities, labEntityId)
    if (!validationOutcome.ok) throw new Error(validationOutcome.error)
    const entity = findLabEntityById(labWorkerState.entities, labEntityId)
    if (!entity) throw new Error(`Unknown lab entity id ${labEntityId}`)
    entity.entityName = trimmed
    entity.updatedAt = new Date().toISOString()
    return this.getStateSnapshot()
  },

  async deleteLabEntity(labEntityId: number): Promise<LabState> {
    const entity = findLabEntityById(labWorkerState.entities, labEntityId)
    if (!entity) throw new Error(`Unknown lab entity id ${labEntityId}`)

    const owner = labEntityLabOwner(labEntityId)
    const touchesTx = (sender: LabOwner | null, receiver: LabOwner | null) =>
      labOwnersEqual(sender, owner) || labOwnersEqual(receiver, owner)

    const hasTx =
      (labWorkerState.transactions ?? []).some((transactionSummary) =>
        touchesTx(transactionSummary.sender, transactionSummary.receiver),
      ) ||
      (labWorkerState.mempool ?? []).some((mempoolEntry) =>
        touchesTx(mempoolEntry.sender, mempoolEntry.receiver),
      )

    if (hasTx) {
      throw new Error(
        'Cannot delete: this entity has transactions. Use kill instead, or remove transactions from the lab chain first.',
      )
    }

    labWorkerState.entities = labWorkerState.entities.filter(
      (entity) => entity.labEntityId !== labEntityId,
    )
    const addrMap = labWorkerState.addressToOwner ?? {}
    for (const [addr, addressOwner] of Object.entries(addrMap)) {
      if (labOwnersEqual(addressOwner, owner)) {
        delete addrMap[addr]
      }
    }
    labWorkerState.addressToOwner = addrMap
    return this.getStateSnapshot()
  },

  async setLabEntityDead(labEntityId: number, dead: boolean): Promise<LabState> {
    const entity = findLabEntityById(labWorkerState.entities, labEntityId)
    if (!entity) throw new Error(`Unknown lab entity id ${labEntityId}`)
    entity.isDead = dead
    entity.updatedAt = new Date().toISOString()
    return this.getStateSnapshot()
  },
}

expose(labService)
