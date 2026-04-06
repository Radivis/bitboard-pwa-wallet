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
import { parseWalletPayloadJson } from '@/lib/wallet-domain-types';
import type { WalletSecretsPayload } from '@/lib/wallet-domain-types';

let wasm: typeof import('@/wasm-pkg/bitboard_crypto') | null = null;
let wasmInitError: string | null = null;
let secretsProxy: Remote<SecretsChannelService> | null = null;

let lightningWasm: typeof import('@/wasm-pkg/bitboard_lightning') | null = null;

async function getLightningWasm() {
  if (!lightningWasm) {
    lightningWasm = await import('@/wasm-pkg/bitboard_lightning');
  }
  return lightningWasm;
}

async function getWasm() {
  if (wasmInitError) {
    throw new Error(`WASM init failed: ${wasmInitError}`);
  }
  if (!wasm) {
    wasm = await import('@/wasm-pkg/bitboard_crypto');
  }
  return wasm;
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
  kdfVersion?: EncryptedBlobMessage['kdfVersion'];
};

function encryptedBlobMessageToStoreFields(
  blob: EncryptedBlobMessage
): EncryptedBlobStoreFields {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfVersion: blob.kdfVersion,
  };
}

async function encryptPlaintextToStoreFields(
  password: string,
  plaintext: string
): Promise<EncryptedBlobStoreFields> {
  const encryptedBlob = await requestEncrypt(password, plaintext);
  return encryptedBlobMessageToStoreFields(encryptedBlob);
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
    const wasmModule = await getWasm();
    return wasmModule.generate_mnemonic(wordCount);
  },

  async validateMnemonic(mnemonic: string): Promise<boolean> {
    const wasmModule = await getWasm();
    return wasmModule.validate_mnemonic(mnemonic);
  },

  async deriveDescriptors(params: {
    mnemonic: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }): Promise<DescriptorPair> {
    const { mnemonic, network, addressType, accountId } = params;
    const wasmModule = await getWasm();
    return wasmModule.derive_descriptors(mnemonic, network, addressType, accountId);
  },

  async createWallet(params: {
    mnemonic: string;
    network: BitcoinNetwork;
    addressType: AddressType;
    accountId: number;
  }): Promise<CreateWalletResult> {
    const { mnemonic, network, addressType, accountId } = params;
    const wasmModule = await getWasm();
    return wasmModule.create_wallet(mnemonic, network, addressType, accountId);
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
    const wasmModule = await getWasm();
    return wasmModule.load_wallet(
      externalDescriptor,
      internalDescriptor,
      network,
      changesetJson,
      useEmptyChain
    );
  },

  async getNewAddress(): Promise<string> {
    const wasmModule = await getWasm();
    return wasmModule.get_new_address();
  },

  async getCurrentAddress(): Promise<string> {
    const wasmModule = await getWasm();
    return wasmModule.get_current_address();
  },

  async buildAndSignLabTransaction(params: {
    utxosJson: string;
    toAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    changeAddress: string;
  }): Promise<{ signedTxHex: string; feeSats: number; hasChange: boolean }> {
    const { utxosJson, toAddress, amountSats, feeRateSatPerVb, changeAddress } = params;
    const wasmModule = await getWasm();
    const result = wasmModule.build_and_sign_lab_transaction(
      utxosJson,
      toAddress,
      BigInt(amountSats),
      feeRateSatPerVb,
      changeAddress,
    );
    const parsed =
      typeof result === 'string' ? JSON.parse(result) : result;
    return {
      signedTxHex: parsed.signed_tx_hex,
      feeSats: parsed.fee_sats,
      hasChange: parsed.has_change,
    };
  },

  async getLabChangeAddress(): Promise<string> {
    const wasmModule = await getWasm();
    return wasmModule.get_lab_change_address();
  },

  async getBalance(): Promise<BalanceInfo> {
    const wasmModule = await getWasm();
    return wasmModule.get_balance();
  },

  async exportChangeset(): Promise<string> {
    const wasmModule = await getWasm();
    return wasmModule.export_changeset();
  },

  async syncWallet(esploraUrl: string): Promise<SyncResult> {
    const wasmModule = await getWasm();
    return wasmModule.sync_wallet(esploraUrl);
  },

  async fullScanWallet(esploraUrl: string, stopGap: number): Promise<SyncResult> {
    const wasmModule = await getWasm();
    return wasmModule.full_scan_wallet(esploraUrl, stopGap);
  },

  async buildTransaction(params: {
    recipientAddress: string;
    amountSats: number;
    feeRateSatPerVb: number;
    network: BitcoinNetwork;
  }): Promise<string> {
    const { recipientAddress, amountSats, feeRateSatPerVb, network } = params;
    const wasmModule = await getWasm();
    return wasmModule.build_transaction(
      recipientAddress,
      BigInt(amountSats),
      feeRateSatPerVb,
      network
    );
  },

  async signAndExtractTransaction(psbtBase64: string): Promise<string> {
    const wasmModule = await getWasm();
    return wasmModule.sign_and_extract_transaction(psbtBase64);
  },

  async broadcastTransaction(
    rawTxHex: string,
    esploraUrl: string
  ): Promise<string> {
    const wasmModule = await getWasm();
    return wasmModule.broadcast_transaction(rawTxHex, esploraUrl);
  },

  async getTransactionList(): Promise<TransactionDetails[]> {
    const wasmModule = await getWasm();
    return wasmModule.get_transaction_list();
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
    const wasmModule = await getWasm();

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
      const walletResult = wasmModule.create_wallet(
        mnemonicPlain,
        targetNetwork,
        targetAddressType,
        targetAccountId
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
    const wasmModule = await getWasm();
    const mnemonic = wasmModule.generate_mnemonic(wordCount);
    const walletResult = wasmModule.create_wallet(
      mnemonic,
      network,
      addressType,
      accountId
    );
    const payload: WalletSecretsPayload = {
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
    const encryptedPayload = await encryptPlaintextToStoreFields(
      password,
      JSON.stringify(payload)
    );
    const encryptedMnemonic = await encryptPlaintextToStoreFields(password, mnemonic);
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
    const wasmModule = await getWasm();
    const walletResult = wasmModule.create_wallet(
      mnemonic,
      network,
      addressType,
      accountId
    );
    const payload: WalletSecretsPayload = {
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
    const encryptedPayload = await encryptPlaintextToStoreFields(
      password,
      JSON.stringify(payload)
    );
    const encryptedMnemonic = await encryptPlaintextToStoreFields(password, mnemonic);
    return {
      encryptedPayload,
      encryptedMnemonic,
      walletResult,
    };
  },

  async generateNodeId(seed: Uint8Array): Promise<NodeInfo> {
    const ldk = await getLightningWasm();
    const currentTimeSecs = BigInt(Math.floor(Date.now() / 1000));
    const currentTimeNanos = 0;
    const nodeId = ldk.generate_node_id(seed, currentTimeSecs, currentTimeNanos);
    return { nodeId };
  },
};

expose(cryptoService);
