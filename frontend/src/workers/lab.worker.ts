import { expose } from 'comlink'
import type {
  LabAddress,
  LabBlockDetails,
  LabCurrentBlockTemplateParams,
  LabMineBlocksResult,
  LabState,
  LabTxDetails,
} from './lab-api'
import { mergeAddressesWithUtxos, WALLET_OWNER_PREFIX } from '@/lib/lab-utils'
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
import { executeMineBlocks } from './lab-mine-blocks'
import { getWasm } from './lab-wasm-loader'
import { utxosToJsonForLabWasm } from './lab-wasm-utxos'
import {
  assertLabReceiverNonNull,
  inferMissingLabOutputOwners,
  labAddressesEqual,
  lookupOwnerForLabAddress,
  parseWasmObject,
  rebuildTxidToChangeAddressFromState,
  replaceLabWorkerState,
  state,
} from './lab-worker-state'

const labService = {
  async loadState(newState: LabState): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(newState)) as LabState
    replaceLabWorkerState({
      blocks: cloned.blocks ?? [],
      utxos: cloned.utxos ?? [],
      addresses: cloned.addresses ?? [],
      entities: cloned.entities ?? [],
      addressToOwner: cloned.addressToOwner ?? {},
      mempool: cloned.mempool ?? [],
      transactions: cloned.transactions ?? [],
      txDetails: cloned.txDetails ?? [],
      mineOperations: cloned.mineOperations ?? [],
      txOperations: cloned.txOperations ?? [],
    })
    rebuildTxidToChangeAddressFromState()
  },

  async getTransaction(txid: string): Promise<LabTxDetails | null> {
    const mempoolEntry = state.mempool.find((entry) => entry.txid === txid)
    if (mempoolEntry) {
      return inferMissingLabOutputOwners({
        txid: mempoolEntry.txid,
        blockHeight: -1,
        blockTime: 0,
        confirmations: 0,
        isCoinbase: false,
        inputs: mempoolEntry.inputsDetail,
        outputs: mempoolEntry.outputsDetail,
      })
    }
    const details = state.txDetails.find((tx) => tx.txid === txid)
    if (!details) return null
    const blockCount = getTip() ? getTip()!.height + 1 : 0
    return inferMissingLabOutputOwners({
      ...details,
      confirmations: blockCount - details.blockHeight,
    })
  },

  async getBlockByHeight(height: number): Promise<LabBlockDetails | null> {
    const block = state.blocks.find((candidate) => candidate.height === height)
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
    return mergeAddressesWithUtxos(state.addresses, state.utxos)
  },

  async getStateSnapshot(): Promise<LabState> {
    return JSON.parse(JSON.stringify(state))
  },

  async mineBlocks(
    blockCountToMine: number,
    targetAddress: string,
    options?: {
      ownerName?: string
      ownerWalletId?: number
      labAddressType?: string
      labNetwork?: string
    },
  ): Promise<LabMineBlocksResult> {
    return executeMineBlocks(blockCountToMine, targetAddress, options, () =>
      labService.getStateSnapshot(),
    )
  },

  async prepareLabEntityTransaction(params: {
    entityName: string
    fromAddress: string
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
    knownRecipientOwner?: string | null
  }): Promise<{
    crypto: import('./lab-api').LabEntityTransactionCryptoParams
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
    const { entityName, fromAddress, toAddress, amountSats, feeRateSatPerVb } = params
    const addressToOwner = state.addressToOwner ?? {}
    const ownerAtFrom = addressToOwner[fromAddress] ?? null
    if (ownerAtFrom !== entityName) {
      throw new Error('From address does not belong to this lab entity')
    }
    if (ownerAtFrom != null && ownerAtFrom.startsWith(WALLET_OWNER_PREFIX)) {
      throw new Error('Use the wallet Send flow for user-wallet lab spends')
    }

    const entity = state.entities.find((e) => e.entityName === entityName)
    if (!entity) {
      throw new Error(`Unknown lab entity "${entityName}"`)
    }

    const fromUtxos = state.utxos.filter((u) => u.address === fromAddress)
    if (fromUtxos.length === 0) {
      throw new Error('No UTXOs for the selected from address')
    }

    const utxosJson = utxosToJsonForLabWasm(fromUtxos)

    const sender = entityName
    const knownRecipient = params.knownRecipientOwner?.trim() || null
    const receiver =
      lookupOwnerForLabAddress(toAddress, addressToOwner) ??
      (labAddressesEqual(fromAddress, toAddress) ? entityName : null) ??
      knownRecipient
    if (
      receiver != null &&
      receiver !== '' &&
      lookupOwnerForLabAddress(toAddress, addressToOwner) === undefined
    ) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[toAddress] = receiver
    }
    assertLabReceiverNonNull(
      receiver,
      `prepareLabEntityTransaction entity="${entityName}" toAddress="${toAddress}"`,
    )

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: addressToOwner[utxo.address] ?? null,
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
    const addressToOwner = state.addressToOwner ?? {}
    const sourceEntities = state.entities.filter((entity) => {
      return state.utxos.some((utxo) => addressToOwner[utxo.address] === entity.entityName)
    })
    if (sourceEntities.length === 0) return null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sourceEntity = sourceEntities[randomIntInclusive(0, sourceEntities.length - 1)]
      const targetEntity = state.entities[randomIntInclusive(0, state.entities.length - 1)]
      const sourceAddressCandidates = state.utxos
        .filter((utxo) => addressToOwner[utxo.address] === sourceEntity.entityName)
        .map((utxo) => utxo.address)
      const sourceAddresses = [...new Set(sourceAddressCandidates)]
      if (sourceAddresses.length === 0) continue

      const fromAddress = sourceAddresses[randomIntInclusive(0, sourceAddresses.length - 1)]
      const fromUtxos = state.utxos.filter((utxo) => utxo.address === fromAddress)
      if (fromUtxos.length === 0) continue

      const totalInput = fromUtxos.reduce((sum, utxo) => sum + utxo.amountSats, 0)
      const feeRateSatPerVb = feeRateSatPerVbFromRandomRoll(
        randomIntInclusive(LAB_RANDOM_FEE_RATE_TENTHS_MIN, LAB_RANDOM_FEE_RATE_TENTHS_MAX),
      )
      const requiredFeeSats = estimateRequiredFeeSats(fromUtxos.length, feeRateSatPerVb)
      const amountSats = sampleRandomLabAmountSats(totalInput, requiredFeeSats)
      if (amountSats === null) continue

      let toAddress = ''
      if (sourceEntity.entityName === targetEntity.entityName) {
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
        state.addressToOwner = state.addressToOwner ?? {}
        state.addressToOwner[toAddress] = sourceEntity.entityName
      } else {
        toAddress = wasmModule.lab_entity_get_current_external_address(
          targetEntity.mnemonic,
          targetEntity.changesetJson,
          targetEntity.network,
          targetEntity.addressType,
          targetEntity.accountId,
        )
        state.addressToOwner = state.addressToOwner ?? {}
        state.addressToOwner[toAddress] = targetEntity.entityName
      }
      if (!toAddress) continue

      const prepareParams = {
        entityName: sourceEntity.entityName,
        fromAddress,
        toAddress,
        amountSats,
        feeRateSatPerVb,
      }
      const prepared = await this.prepareLabEntityTransaction(prepareParams)
      const mempoolMetadata =
        sourceEntity.entityName === targetEntity.entityName
          ? { ...prepared.mempoolMetadata, receiver: sourceEntity.entityName }
          : prepared.mempoolMetadata
      return {
        prepareParams,
        entityName: sourceEntity.entityName,
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
    entityName: string
    newChangesetJson: string
  }): Promise<LabState> {
    const wasmModule = await getWasm()
    const { signedTxHex, mempoolMetadata, entityName, newChangesetJson } = params

    const entity = state.entities.find((e) => e.entityName === entityName)
    if (!entity) {
      throw new Error(`Unknown lab entity "${entityName}"`)
    }
    entity.changesetJson = newChangesetJson
    entity.updatedAt = new Date().toISOString()

    const txid = wasmModule.lab_txid(signedTxHex)
    assertLabReceiverNonNull(
      mempoolMetadata.receiver,
      `finalizeLabEntityMempoolTransaction txid=${txid}`,
    )
    const changeOut = mempoolMetadata.hasChange
      ? mempoolMetadata.outputsDetail.find((o) => o.isChange)
      : undefined
    const changeVout = mempoolMetadata.outputsDetail.findIndex((o) => o.isChange)

    appendLabTxOperationAndMempoolEntry({
      signedTxHex,
      txid,
      mempoolMetadata,
      senderKey: entityName,
      changeAddress: changeOut?.address ?? null,
      changeVout: changeVout >= 0 ? changeVout : null,
    })

    return this.getStateSnapshot()
  },

  async prepareLabWalletTransaction(params: {
    walletOwner: string
    toAddress: string
    amountSats: number
    feeRateSatPerVb: number
    walletChangeAddress: string
    knownRecipientOwner?: string | null
  }): Promise<{
    utxosJson: string
    mempoolMetadata: import('./lab-api').LabMempoolMetadata
    totalInput: number
  }> {
    const { walletOwner, toAddress, amountSats, walletChangeAddress } = params
    const addressToOwner = state.addressToOwner ?? {}

    const fromUtxos = state.utxos.filter(
      (utxo) => lookupOwnerForLabAddress(utxo.address, addressToOwner) === walletOwner,
    )
    if (fromUtxos.length === 0) {
      throw new Error(
        `No UTXOs available for the wallet. Owner="${walletOwner}". ` +
          `Ensure the wallet is loaded for lab (regtest) and you have mined to it.`,
      )
    }

    const utxosJson = utxosToJsonForLabWasm(fromUtxos)

    const sender = walletOwner
    const knownRecipient = params.knownRecipientOwner?.trim() || null
    let receiver = lookupOwnerForLabAddress(toAddress, addressToOwner) ?? null
    if (receiver === null && knownRecipient != null) {
      state.addressToOwner = state.addressToOwner ?? {}
      state.addressToOwner[toAddress] = knownRecipient
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
      `prepareLabWalletTransaction walletOwner="${walletOwner}" toAddress="${toAddress}"`,
    )

    const inputsDetail = fromUtxos.map((utxo) => ({
      address: utxo.address,
      amountSats: utxo.amountSats,
      owner: lookupOwnerForLabAddress(utxo.address, addressToOwner) ?? null,
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

    const changeVout = mempoolMetadata.outputsDetail.findIndex((o) => o.isChange)
    appendLabTxOperationAndMempoolEntry({
      signedTxHex,
      txid,
      mempoolMetadata,
      senderKey: mempoolMetadata.sender ?? '',
      changeAddress: mempoolMetadata.hasChange ? mempoolMetadata.walletChangeAddress : null,
      changeVout: changeVout >= 0 ? changeVout : null,
    })

    return this.getStateSnapshot()
  },
}

expose(labService)
