import { expose, proxy, wrap, type Remote } from 'comlink';
import { serializeSelectedOutpointsForWasm } from '@/lib/wallet/manual-utxo-selection';
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
import {
  mapWireBalanceToDomain,
  mapWireCreateWalletResultToDomain,
  mapWireDescriptorPairToDomain,
  mapWireDraftPsbtResultToDomain,
  mapWireLabSignResultToDomain,
  mapWirePrepareOnchainSendResultToDomain,
  mapWireSyncResultToDomain,
  mapWireTransactionListToDomain,
  mapWireWalletUtxoListToDomain,
  parseWasmJsonWire,
} from './crypto-wire-mappers';
import type { WalletUtxoRow } from './crypto-api';
import type {
  WireBalanceInfo,
  WireCreateWalletResult,
  WireDescriptorPair,
  WireDraftPsbtResult,
  WireLabSignResult,
  WirePrepareOnchainSendResult,
  WireSyncResult,
  WireTransactionDetails,
  WireWalletUtxoRow,
} from './crypto-wire-types';
import type { EncryptedBlobMessage, SecretsChannelService } from './secrets-channel-types';
import {
  assertIso8601LastSuccessfulEsploraSyncAt,
  parseWalletPayloadJson,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types';
import { rethrowWasmCryptoErrorForComlink } from '@/lib/shared/wasm-crypto-error';

type BitboardCryptoModule = typeof import('@/wasm-pkg/bitboard_crypto');

let cryptoWasmModule: BitboardCryptoModule | null = null;
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
  if (!cryptoWasmModule) {
    cryptoWasmModule = await import('@/wasm-pkg/bitboard_crypto');
  }
  return cryptoWasmModule;
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
    cryptoWasmModule = await import('@/wasm-pkg/bitboard_crypto');
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

function buildInitialWalletSecretsPayload({
  network,
  addressType,
  accountId,
  walletResult,
}: {
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
  walletResult: CreateWalletResult;
}): WalletSecretsPayload {
  return {
    descriptorWallets: [
      {
        network,
        addressType,
        accountId,
        externalDescriptor: walletResult.externalDescriptor,
        internalDescriptor: walletResult.internalDescriptor,
        changeSet: walletResult.changesetJson,
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [],
    arkadeOperatorConnections: [],
    activeArkadeConnectionIdByNetwork: {},
  };
}

async function encryptWalletSecretsPayloadAndMnemonic({
  password,
  payload,
  mnemonicPlaintext,
}: {
  password: string;
  payload: WalletSecretsPayload;
  mnemonicPlaintext: string;
}): Promise<{
  encryptedPayload: EncryptedBlobStoreFields;
  encryptedMnemonic: EncryptedBlobStoreFields;
}> {
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

function findDescriptorWalletInPayload({
  payload,
  network,
  addressType,
  accountId,
}: {
  payload: WalletSecretsPayload;
  network: BitcoinNetwork;
  addressType: AddressType;
  accountId: number;
}): DescriptorWalletData | undefined {
  return payload.descriptorWallets.find(
    (descriptorWallet) =>
      descriptorWallet.network === network &&
      descriptorWallet.addressType === addressType &&
      descriptorWallet.accountId === accountId
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
    const wire = await invokeWasmCrypto((wasmModule) =>
      wasmModule.derive_descriptors(mnemonic, network, addressType, accountId),
    );
    return mapWireDescriptorPairToDomain(wire as WireDescriptorPair);
  },

  async createWallet(params: {
    mnemonic: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }): Promise<CreateWalletResult> {
    const { mnemonic, network, addressType, accountId } = params;
    const wire = await invokeWasmCrypto((wasmModule) =>
      wasmModule.create_wallet(mnemonic, network, addressType, accountId),
    );
    return mapWireCreateWalletResultToDomain(wire as WireCreateWalletResult);
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
      // Comlink cannot structured-clone function objects; proxy keeps the handle on the worker.
      return proxy({
        getBalance: async () => {
          const wire = await invokeWasmCrypto(() => session.get_balance());
          return mapWireBalanceToDomain(wire as WireBalanceInfo);
        },
        exportChangeset: async () =>
          invokeWasmCrypto(() => session.export_changeset()),
        free: () => {
          session.free();
        },
      });
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
    return mapWireLabSignResultToDomain(
      parseWasmJsonWire<WireLabSignResult>(wasmLabSignResponse),
    );
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
    return mapWireDraftPsbtResultToDomain(
      parseWasmJsonWire<WireDraftPsbtResult>(wasmDraftPsbtResponse),
    );
  },

  async getLabChangeAddress(): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.get_lab_change_address());
  },

  async labEntityDraftPsbtTransaction(
    params: import('./crypto-api').LabEntityDraftPsbtTransactionParams,
  ): Promise<import('./crypto-api').DraftLabPsbtTransactionResult> {
    const wasmLabEntityDraftPsbtResponse = await invokeWasmCrypto((wasmModule) =>
      wasmModule.lab_entity_draft_psbt_transaction(
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
    return mapWireDraftPsbtResultToDomain(
      parseWasmJsonWire<WireDraftPsbtResult>(wasmLabEntityDraftPsbtResponse),
    );
  },

  async labEntityBuildAndSignTransaction(
    params: import('./crypto-api').LabEntityBuildAndSignTransactionParams,
  ): Promise<unknown> {
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.lab_entity_build_and_sign_transaction(
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
    const wire = await invokeWasmCrypto((wasmModule) => wasmModule.get_balance());
    return mapWireBalanceToDomain(wire as WireBalanceInfo);
  },

  async exportChangeset(): Promise<string> {
    return invokeWasmCrypto((wasmModule) => wasmModule.export_changeset());
  },

  async syncWallet(esploraUrl: string): Promise<SyncResult> {
    const wire = await invokeWasmCrypto((wasmModule) => wasmModule.sync_wallet(esploraUrl));
    return mapWireSyncResultToDomain(wire as WireSyncResult);
  },

  async fullScanWallet(esploraUrl: string, stopGap: number): Promise<SyncResult> {
    const wire = await invokeWasmCrypto((wasmModule) =>
      wasmModule.full_scan_wallet(esploraUrl, stopGap),
    );
    return mapWireSyncResultToDomain(wire as WireSyncResult);
  },

  async buildTransaction(params: {
    toAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    network: BitcoinNetwork;
  }): Promise<string> {
    const { toAddress, amountSats, feeRateSatPerVb, network } = params;
    return invokeWasmCrypto((wasmModule) =>
      wasmModule.build_transaction(
        toAddress,
        BigInt(amountSats),
        feeRateSatPerVb,
        network,
      ),
    );
  },

  async prepareOnchainSendTransaction(params: {
    toAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    network: BitcoinNetwork;
    applyChangeFreeBump?: boolean;
    selectedOutpoints?: import('./crypto-api').UtxoOutpoint[];
  }): Promise<import('./crypto-api').PrepareOnchainSendResult> {
    const {
      toAddress,
      amountSats,
      feeRateSatPerVb,
      network,
      applyChangeFreeBump = false,
      selectedOutpoints,
    } = params;
    const selectedOutpointsJson = serializeSelectedOutpointsForWasm(selectedOutpoints);
    const wasmPrepareResult = await invokeWasmCrypto((wasmModule) =>
      wasmModule.prepare_onchain_send_transaction(
        toAddress,
        BigInt(amountSats),
        feeRateSatPerVb,
        network,
        applyChangeFreeBump,
        selectedOutpointsJson,
      ),
    );
    return mapWirePrepareOnchainSendResultToDomain(
      parseWasmJsonWire<WirePrepareOnchainSendResult>(wasmPrepareResult),
    );
  },

  async listWalletUtxos(): Promise<WalletUtxoRow[]> {
    const wasmListResult = await invokeWasmCrypto((wasmModule) =>
      wasmModule.list_wallet_utxos(),
    );
    return mapWireWalletUtxoListToDomain(
      parseWasmJsonWire<WireWalletUtxoRow[]>(wasmListResult),
    );
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
    const wireList = await invokeWasmCrypto((wasmModule) =>
      wasmModule.get_transaction_list(),
    );
    return mapWireTransactionListToDomain(wireList as WireTransactionDetails[]);
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
      const walletResultWire = await invokeWasmCrypto((wasmModule) =>
        wasmModule.create_wallet(
          mnemonicPlain,
          targetNetwork,
          targetAddressType,
          targetAccountId,
        ),
      );
      const walletResult = mapWireCreateWalletResultToDomain(
        walletResultWire as WireCreateWalletResult,
      );
      const descriptorWallet: DescriptorWalletData = {
        network: targetNetwork,
        addressType: targetAddressType,
        accountId: targetAccountId,
        externalDescriptor: walletResult.externalDescriptor,
        internalDescriptor: walletResult.internalDescriptor,
        changeSet: walletResult.changesetJson,
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
    lastSuccessfulEsploraSyncAt?: string;
  }) {
    const {
      password,
      encryptedPayload,
      network,
      addressType,
      accountId,
      changesetJson,
      markFullScanDone,
      lastSuccessfulEsploraSyncAt,
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
    if (lastSuccessfulEsploraSyncAt != null) {
      assertIso8601LastSuccessfulEsploraSyncAt(lastSuccessfulEsploraSyncAt);
      descriptorWallet.lastSuccessfulEsploraSyncAt = lastSuccessfulEsploraSyncAt;
    }
    const newPlaintext = JSON.stringify(payload);
    const newBlob = await requestEncrypt(password, newPlaintext);
    return encryptedBlobMessageToStoreFields(newBlob);
  },

  async readLastSuccessfulEsploraSyncAtForDescriptorWallet(params: {
    password: string;
    encryptedPayload: EncryptedBlobMessage;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }): Promise<string | undefined> {
    const { password, encryptedPayload, network, addressType, accountId } = params;
    const plaintext = await requestDecrypt(password, encryptedPayload);
    const payload = parseWalletPayloadJson(plaintext);
    const descriptorWallet = findDescriptorWalletInPayload({
      payload,
      network,
      addressType,
      accountId,
    });
    return descriptorWallet?.lastSuccessfulEsploraSyncAt;
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
      const createdWalletWire = wasmModule.create_wallet(
        generatedMnemonic,
        network,
        addressType,
        accountId,
      );
      return {
        mnemonic: generatedMnemonic,
        walletResult: mapWireCreateWalletResultToDomain(
          createdWalletWire as WireCreateWalletResult,
        ),
      };
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
    const walletResultWire = await invokeWasmCrypto((wasmModule) =>
      wasmModule.create_wallet(mnemonic, network, addressType, accountId),
    );
    const walletResult = mapWireCreateWalletResultToDomain(
      walletResultWire as WireCreateWalletResult,
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
