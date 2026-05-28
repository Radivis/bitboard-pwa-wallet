import { expose, wrap, type Remote } from 'comlink';
import type {
  AddressType,
  BitcoinNetwork,
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  DescriptorWalletData,
  NodeInfo,
  SyncResult,
  TransactionDetails,
} from './crypto-types';
import type { EncryptedBlobMessage, SecretsChannelService } from './secrets-channel-types';
import { parseWalletPayloadJson } from '@/lib/wallet/wallet-domain-types';
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types';
import { rethrowWasmCryptoErrorForComlink } from '@/lib/shared/wasm-crypto-error';

function mapReviewInputUtxos(
  wasmUtxoList: unknown,
): import('./crypto-api').ReviewInputUtxo[] {
  if (!Array.isArray(wasmUtxoList)) return [];
  return wasmUtxoList.map((untypedUtxoRecord) => {
    const utxoFields = untypedUtxoRecord as Record<string, unknown>;
    return {
      address: String(utxoFields.address ?? ''),
      amountSats: Number(utxoFields.amount_sats ?? 0),
      txid: String(utxoFields.txid ?? ''),
      vout: Number(utxoFields.vout ?? 0),
    };
  });
}

function mapPrepareOrDraftReviewFields(parsed: Record<string, unknown>) {
  return {
    changeSats: Number(parsed.change_sats ?? 0),
    totalInputSats: Number(parsed.total_input_sats ?? 0),
    inputUtxos: mapReviewInputUtxos(parsed.input_utxos),
  };
}

type BitboardCryptoModule = typeof import('@/wasm-pkg/bitboard_crypto');

let wasm: BitboardCryptoModule | null = null;
let wasmInitError: string | null = null;
let secretsProxy: Remote<SecretsChannelService> | null = null;

let lightningWasm: typeof import('@/wasm-pkg/bitboard_lightning') | null = null;

async function getLightningWasm() {
  if (!lightningWasm) {
    lightningWasm = await import('@/wasm-pkg/bitboard_lightning');
  }
  return lightningWasm;
}

async function getWasm(): Promise<BitboardCryptoModule> {
  if (wasmInitError) {
    throw new Error(`WASM init failed: ${wasmInitError}`);
  }
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_crypto');
  }
  return wasm;
}

/** Ensures structured `{ code, message }` WASM errors survive Comlink on the main thread. */
async function invokeWasmCrypto<T>(
  run: (wasmModule: BitboardCryptoModule) => T | Promise<T>,
): Promise<T> {
  try {
    const wasmModule = await getWasm();
    return await run(wasmModule);
  } catch (err) {
    return rethrowWasmCryptoErrorForComlink(err);
  }
}

async function initWasm() {
  try {
    wasm = await import('@/wasm-pkg/bitboard_crypto');
    console.info('[crypto.worker] WASM module loaded successfully');
  } catch (err) {
    wasmInitError = err instanceof Error ? err.message : String(err);
    console.error('[crypto.worker] WASM init failed:', wasmInitError);
  }
}

initWasm();

function requestDecrypt(password: string, encryptedBlob: EncryptedBlobMessage): Promise<string> {
  if (!secretsProxy) return Promise.reject(new Error('Secrets port not set'));
  return secretsProxy.decrypt(password, encryptedBlob);
}

function requestEncrypt(password: string, plaintext: string): Promise<EncryptedBlobMessage> {
  if (!secretsProxy) return Promise.reject(new Error('Secrets port not set'));
  return secretsProxy.encrypt(password, plaintext);
}

/** Shape stored in DB / returned to main (transferable fields only). */
type EncryptedBlobStoreFields = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  kdfPhc: EncryptedBlobMessage['kdfPhc'];
};

function encryptedBlobMessageToStoreFields(
  blob: EncryptedBlobMessage
): EncryptedBlobStoreFields {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  };
}

async function encryptPlaintextToStoreFields(
  password: string,
  plaintext: string
): Promise<EncryptedBlobStoreFields> {
  const encryptedBlob = await requestEncrypt(password, plaintext);
  return encryptedBlobMessageToStoreFields(encryptedBlob);
}

function buildInitialWalletSecretsPayload(params: {
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
  walletResult: CreateWalletResult;
}): WalletSecretsPayload {
  const { network, addressType, accountId, walletResult } = params;
  return {
    descriptorWallets: [
      {
        network,
        addressType,
        accountId,
        externalDescriptor: walletResult.external_descriptor,
        internalDescriptor: walletResult.internal_descriptor,
        changeSet: walletResult.changeset_json,
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [],
  };
}

async function encryptWalletSecretsPayloadAndMnemonic(params: {
  password: string;
  payload: WalletSecretsPayload;
  mnemonicPlaintext: string;
}): Promise<{
  encryptedPayload: EncryptedBlobStoreFields;
  encryptedMnemonic: EncryptedBlobStoreFields;
}> {
  const { password, payload, mnemonicPlaintext } = params;
  const encryptedPayload = await encryptPlaintextToStoreFields(
    password,
    JSON.stringify(payload)
  );
  const encryptedMnemonic = await encryptPlaintextToStoreFields(
    password,
    mnemonicPlaintext
  );
  return { encryptedPayload, encryptedMnemonic };
}

function findDescriptorWalletInPayload(params: {
  payload: WalletSecretsPayload;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
}): DescriptorWalletData | undefined {
  const { payload, network, addressType, accountId } = params;
  return payload.descriptorWallets.find(
    (dw) =>
      dw.network === network &&
      dw.addressType === addressType &&
      dw.accountId === accountId
  );
}

const cryptoService = {
  async setSecretsPort(port: MessagePort): Promise<void> {
    secretsProxy = wrap<SecretsChannelService>(port);
  },

  async ping(): Promise<boolean> {
    await getWasm();
    return true;
  },

  async generateMnemonic(wordCount: 12 | 24): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.generate_mnemonic(wordCount));
  },

  async validateMnemonic(mnemonic: string): Promise<boolean> {
    return invokeWasmCrypto((wasmModule) => wasmModule.validate_mnemonic(mnemonic));
  },

  async deriveDescriptors(params: {
    mnemonic: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }): Promise<DescriptorPair> {
    const { mnemonic, network, addressType, accountId } = params;
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.derive_descriptors(mnemonic, network, addressType, accountId),
    );
  },

  async createWallet(params: {
    mnemonic: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }): Promise<CreateWalletResult> {
    const { mnemonic, network, addressType, accountId } = params;
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.create_wallet(mnemonic, network, addressType, accountId),
    );
  },

  async loadWallet(params: {
    externalDescriptor: string;
    internalDescriptor: string;
    network: BitcoinNetwork;
    changesetJson: string;
    useEmptyChain: boolean;
  }): Promise<boolean> {
    const { externalDescriptor, internalDescriptor, network, changesetJson, useEmptyChain } =
      params;
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.load_wallet(
        externalDescriptor,
        internalDescriptor,
        network,
        changesetJson,
        useEmptyChain,
      ),
    );
  },

  async openWalletSession(params: {
    externalDescriptor: string;
    internalDescriptor: string;
    network: BitcoinNetwork;
    changesetJson: string;
    useEmptyChain: boolean;
  }): Promise<import('./crypto-api').WalletSessionHandle> {
    const {
      externalDescriptor,
      internalDescriptor,
      network,
      changesetJson,
      useEmptyChain,
    } = params;
    return invokeWasmCrypto((wasmModule) => {
      const session = new wasmModule.WalletSession(
        externalDescriptor,
        internalDescriptor,
        network,
        changesetJson,
        useEmptyChain,
      );
      return {
        getBalance: () => invokeWasmCrypto(() => session.get_balance()),
        exportChangeset: () => invokeWasmCrypto(() => session.export_changeset()),
        free: () => {
          session.free();
        },
      };
    });
  },

  async getNewAddress(): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.get_new_address());
  },

  async getCurrentAddress(): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.get_current_address());
  },

  async buildAndSignLabTransaction(params: {
    utxosJson: string;
    toAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    changeAddress: string;
    applyChangeFreeBump?: boolean;
  }): Promise<import('./crypto-api').BuildAndSignLabTransactionResult> {
    const {
      utxosJson,
      toAddress,
      amountSats,
      feeRateSatPerVb,
      changeAddress,
      applyChangeFreeBump = false,
    } = params;
    const wasmLabSignResponse = await invokeWasmCrypto((wasmModule) =>
      wasmModule.build_and_sign_lab_transaction(
        utxosJson,
        toAddress,
        BigInt(amountSats),
        feeRateSatPerVb,
        changeAddress,
        applyChangeFreeBump,
      ),
    );
    const labSignResponseFields =
      typeof wasmLabSignResponse === 'string'
        ? JSON.parse(wasmLabSignResponse)
        : wasmLabSignResponse;
    return {
      signedTxHex: labSignResponseFields.signed_tx_hex,
      feeSats: labSignResponseFields.fee_sats,
      hasChange: labSignResponseFields.has_change,
      finalAmountSats: labSignResponseFields.final_amount_sats,
      originalAmountSats: labSignResponseFields.original_amount_sats,
      raisedToMinDust: labSignResponseFields.raised_to_min_dust,
      bumpedChangeFree: labSignResponseFields.bumped_change_free,
      changeFreeBumpAvailable: Boolean(labSignResponseFields.change_free_bump_available),
      changeFreeMaxSats: Number(labSignResponseFields.change_free_max_sats),
    };
  },

  async draftLabPsbtTransaction(params: {
    utxosJson: string;
    toAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    changeAddress: string;
    applyChangeFreeBump?: boolean;
  }): Promise<import('./crypto-api').DraftLabPsbtTransactionResult> {
    const {
      utxosJson,
      toAddress,
      amountSats,
      feeRateSatPerVb,
      changeAddress,
      applyChangeFreeBump = false,
    } = params;
    const wasmDraftPsbtResponse = await invokeWasmCrypto((wasmModule) =>
      wasmModule.draft_lab_psbt_transaction(
        utxosJson,
        toAddress,
        BigInt(amountSats),
        feeRateSatPerVb,
        changeAddress,
        applyChangeFreeBump,
      ),
    );
    const draftPsbtResponseFields =
      typeof wasmDraftPsbtResponse === 'string'
        ? JSON.parse(wasmDraftPsbtResponse)
        : wasmDraftPsbtResponse;
    return {
      psbtBase64: draftPsbtResponseFields.psbt_base64,
      finalAmountSats: Number(draftPsbtResponseFields.final_amount_sats),
      originalAmountSats: Number(draftPsbtResponseFields.original_amount_sats),
      raisedToMinDust: Boolean(draftPsbtResponseFields.raised_to_min_dust),
      changeFreeBumpAvailable: Boolean(draftPsbtResponseFields.change_free_bump_available),
      changeFreeMaxSats: Number(draftPsbtResponseFields.change_free_max_sats),
      feeSats: Number(draftPsbtResponseFields.fee_sats),
      ...mapPrepareOrDraftReviewFields(draftPsbtResponseFields),
    };
  },

  async getLabChangeAddress(): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.get_lab_change_address());
  },

  async labEntityDraftLabPsbtTransaction(
    params: import('./crypto-api').LabEntityDraftLabPsbtTransactionParams,
  ): Promise<import('./crypto-api').DraftLabPsbtTransactionResult> {
    const wasmLabEntityDraftPsbtResponse = await invokeWasmCrypto((wasmModule) =>
      wasmModule.lab_entity_draft_lab_psbt_transaction(
        params.mnemonic,
        params.changesetJson,
        params.network,
        params.addressType,
        params.accountId,
        params.utxosJson,
        params.toAddress,
        BigInt(params.amountSats),
        params.feeRateSatPerVb,
      ),
    );
    const labEntityDraftPsbtResponseFields =
      typeof wasmLabEntityDraftPsbtResponse === 'string'
        ? JSON.parse(wasmLabEntityDraftPsbtResponse)
        : wasmLabEntityDraftPsbtResponse;
    return {
      psbtBase64: labEntityDraftPsbtResponseFields.psbt_base64,
      finalAmountSats: Number(labEntityDraftPsbtResponseFields.final_amount_sats),
      originalAmountSats: Number(labEntityDraftPsbtResponseFields.original_amount_sats),
      raisedToMinDust: Boolean(labEntityDraftPsbtResponseFields.raised_to_min_dust),
      changeFreeBumpAvailable: Boolean(
        labEntityDraftPsbtResponseFields.change_free_bump_available,
      ),
      changeFreeMaxSats: Number(labEntityDraftPsbtResponseFields.change_free_max_sats),
      feeSats: Number(labEntityDraftPsbtResponseFields.fee_sats),
      ...mapPrepareOrDraftReviewFields(labEntityDraftPsbtResponseFields),
    };
  },

  async labEntityBuildAndSignLabTransaction(
    params: import('./crypto-api').LabEntityBuildAndSignLabTransactionParams,
  ): Promise<unknown> {
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.lab_entity_build_and_sign_lab_transaction(
        params.mnemonic,
        params.changesetJson,
        params.network,
        params.addressType,
        params.accountId,
        params.utxosJson,
        params.toAddress,
        BigInt(params.amountSats),
        params.feeRateSatPerVb,
        params.applyChangeFreeBump ?? false,
      ),
    );
  },

  async getBalance(): Promise<BalanceInfo> {
    return invokeWasmCrypto((wasmModule) => wasmModule.get_balance());
  },

  async exportChangeset(): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.export_changeset());
  },

  async syncWallet(esploraUrl: string): Promise<SyncResult> {
    return invokeWasmCrypto((wasmModule) => wasmModule.sync_wallet(esploraUrl));
  },

  async fullScanWallet(esploraUrl: string, stopGap: number): Promise<SyncResult> {
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.full_scan_wallet(esploraUrl, stopGap),
    );
  },

  async buildTransaction(params: {
    recipientAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    network: BitcoinNetwork;
  }): Promise<string> {
    const { recipientAddress, amountSats, feeRateSatPerVb, network } = params;
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.build_transaction(
        recipientAddress,
        BigInt(amountSats),
        feeRateSatPerVb,
        network,
      ),
    );
  },

  async prepareOnchainSendTransaction(params: {
    recipientAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    network: BitcoinNetwork;
    applyChangeFreeBump?: boolean;
  }): Promise<import('./crypto-api').PrepareOnchainSendResult> {
    const {
      recipientAddress,
      amountSats,
      feeRateSatPerVb,
      network,
      applyChangeFreeBump = false,
    } = params;
    const wasmPrepareResult = await invokeWasmCrypto((wasmModule) =>
      wasmModule.prepare_onchain_send_transaction(
        recipientAddress,
        BigInt(amountSats),
        feeRateSatPerVb,
        network,
        applyChangeFreeBump,
      ),
    );
    const prepareSendResponseFields =
      typeof wasmPrepareResult === 'string'
        ? JSON.parse(wasmPrepareResult)
        : wasmPrepareResult;
    return {
      psbtBase64: prepareSendResponseFields.psbt_base64,
      finalAmountSats: Number(prepareSendResponseFields.final_amount_sats),
      originalAmountSats: Number(prepareSendResponseFields.original_amount_sats),
      raisedToMinDust: Boolean(prepareSendResponseFields.raised_to_min_dust),
      bumpedChangeFree: Boolean(prepareSendResponseFields.bumped_change_free),
      changeFreeBumpAvailable: Boolean(prepareSendResponseFields.change_free_bump_available),
      changeFreeMaxSats: Number(prepareSendResponseFields.change_free_max_sats),
      feeSats: Number(prepareSendResponseFields.fee_sats),
      ...mapPrepareOrDraftReviewFields(prepareSendResponseFields),
    };
  },

  async signAndExtractTransaction(psbtBase64: string): Promise<string> {
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.sign_and_extract_transaction(psbtBase64),
    );
  },

  async broadcastTransaction(
    rawTxHex: string,
    esploraUrl: string
  ): Promise<string> {
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.broadcast_transaction(rawTxHex, esploraUrl),
    );
  },

  async getTransactionList(): Promise<TransactionDetails[]> {
    return invokeWasmCrypto((wasmModule) => wasmModule.get_transaction_list());
  },

  async resolveDescriptorWallet(params: {
    password: string;
    encryptedPayload: EncryptedBlobMessage;
    encryptedMnemonic: EncryptedBlobMessage;
    targetNetwork: BitcoinNetwork;
    targetAddressType: AddressType;
    targetAccountId: number;
  }) {
    const {
      password,
      encryptedPayload,
      encryptedMnemonic,
      targetNetwork,
      targetAddressType,
      targetAccountId,
    } = params;
    const payloadPlain = await requestDecrypt(password, encryptedPayload);
    const payload = parseWalletPayloadJson(payloadPlain);
    const existing = findDescriptorWalletInPayload({
      payload,
      network: targetNetwork,
      addressType: targetAddressType,
      accountId: targetAccountId,
    });
    if (existing) {
      return {
        descriptorWalletData: existing,
        encryptedPayloadToStore: null,
        encryptedMnemonicToStore: null,
      };
    }

    let mnemonicPlain = await requestDecrypt(password, encryptedMnemonic);
    try {
      const walletResult = await invokeWasmCrypto((wasmModule) =>
        wasmModule.create_wallet(
          mnemonicPlain,
          targetNetwork,
          targetAddressType,
          targetAccountId,
        ),
      );
      const descriptorWallet: DescriptorWalletData = {
        network: targetNetwork,
        addressType: targetAddressType,
        accountId: targetAccountId,
        externalDescriptor: walletResult.external_descriptor,
        internalDescriptor: walletResult.internal_descriptor,
        changeSet: walletResult.changeset_json,
        fullScanDone: false,
      };
      payload.descriptorWallets.push(descriptorWallet);
      const payloadEnc = await encryptPlaintextToStoreFields(
        password,
        JSON.stringify(payload)
      );
      return {
        descriptorWalletData: descriptorWallet,
        encryptedPayloadToStore: payloadEnc,
        encryptedMnemonicToStore: null,
      };
    } finally {
      // Best-effort wipe; value is not read afterward by design.
      mnemonicPlain = '';
    }
  },

  async updateDescriptorWalletChangeset(params: {
    password: string;
    encryptedPayload: EncryptedBlobMessage;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
    changesetJson: string;
    markFullScanDone?: boolean;
  }) {
    const {
      password,
      encryptedPayload,
      network,
      addressType,
      accountId,
      changesetJson,
      markFullScanDone,
    } = params;
    const plaintext = await requestDecrypt(password, encryptedPayload);
    const payload = parseWalletPayloadJson(plaintext);
    const descriptorWallet = findDescriptorWalletInPayload({
      payload,
      network,
      addressType,
      accountId,
    });
    if (!descriptorWallet) {
      throw new Error(
        `No descriptor wallet found for ${network}/${addressType}/${accountId}`
      );
    }
    descriptorWallet.changeSet = changesetJson;
    if (markFullScanDone) {
      descriptorWallet.fullScanDone = true;
    }
    const newPlaintext = JSON.stringify(payload);
    const newBlob = await requestEncrypt(password, newPlaintext);
    return encryptedBlobMessageToStoreFields(newBlob);
  },

  async createWalletAndEncryptSecrets(params: {
    password: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
    wordCount: 12 | 24;
  }) {
    const { password, network, addressType, accountId, wordCount } = params;
    const { mnemonic, walletResult } = await invokeWasmCrypto(async (wasmModule) => {
      const generatedMnemonic = wasmModule.generate_mnemonic(wordCount);
      const createdWallet = wasmModule.create_wallet(
        generatedMnemonic,
        network,
        addressType,
        accountId,
      );
      return { mnemonic: generatedMnemonic, walletResult: createdWallet };
    });
    const payload = buildInitialWalletSecretsPayload({
      network,
      addressType,
      accountId,
      walletResult,
    });
    const { encryptedPayload, encryptedMnemonic } =
      await encryptWalletSecretsPayloadAndMnemonic({
        password,
        payload,
        mnemonicPlaintext: mnemonic,
      });
    return {
      encryptedPayload,
      encryptedMnemonic,
      walletResult,
      mnemonicForBackup: mnemonic,
    };
  },

  async importWalletAndEncryptSecrets(params: {
    mnemonic: string;
    password: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }) {
    const { mnemonic, password, network, addressType, accountId } = params;
    const walletResult = await invokeWasmCrypto((wasmModule) =>
      wasmModule.create_wallet(mnemonic, network, addressType, accountId),
    );
    const payload = buildInitialWalletSecretsPayload({
      network,
      addressType,
      accountId,
      walletResult,
    });
    const { encryptedPayload, encryptedMnemonic } =
      await encryptWalletSecretsPayloadAndMnemonic({
        password,
        payload,
        mnemonicPlaintext: mnemonic,
      });
    return {
      encryptedPayload,
      encryptedMnemonic,
      walletResult,
    };
  },

  async generateNodeId(seed: Uint8Array): Promise<NodeInfo> {
    const lightningWasm = await getLightningWasm();
    const currentTimeSecs = BigInt(Math.floor(Date.now() / 1000));
    const currentTimeNanos = 0;
    const nodeId = lightningWasm.generate_node_id(seed, currentTimeSecs, currentTimeNanos);
    return { nodeId };
  },
};

expose(cryptoService);
