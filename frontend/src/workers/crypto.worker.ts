import { expose, wrap, type Remote } from 'comlink';
import type {
  AddressType,
  BitcoinNetwork,
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  DescriptorWalletData,
  SyncResult,
  TransactionDetails,
  WalletSecrets,
} from './crypto-types';
import type { EncryptedBlobMessage, SecretsChannelService } from './secrets-channel-types';

let wasm: typeof import('@/wasm-pkg/bitboard_crypto') | null = null;
let wasmInitError: string | null = null;
let secretsProxy: Remote<SecretsChannelService> | null = null;

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

function findDescriptorWallet(
  secrets: WalletSecrets,
  network: BitcoinNetwork,
  addressType: AddressType,
  accountId: number
): DescriptorWalletData | undefined {
  return secrets.descriptorWallets.find(
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

  async deriveDescriptors(
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ): Promise<DescriptorPair> {
    const wasmModule = await getWasm();
    return wasmModule.derive_descriptors(mnemonic, network, addressType, accountId);
  },

  async createWallet(
    mnemonic: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ): Promise<CreateWalletResult> {
    const wasmModule = await getWasm();
    return wasmModule.create_wallet(mnemonic, network, addressType, accountId);
  },

  async loadWallet(
    externalDescriptor: string,
    internalDescriptor: string,
    network: BitcoinNetwork,
    changesetJson: string
  ): Promise<boolean> {
    const wasmModule = await getWasm();
    return wasmModule.load_wallet(
      externalDescriptor,
      internalDescriptor,
      network,
      changesetJson
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

  async buildAndSignLabTransaction(
    utxosJson: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    changeAddress: string,
  ): Promise<{ signedTxHex: string; feeSats: number; hasChange: boolean }> {
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

  async buildTransaction(
    recipientAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
    network: BitcoinNetwork
  ): Promise<string> {
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

  async resolveDescriptorWallet(
    password: string,
    encryptedBlob: EncryptedBlobMessage,
    targetNetwork: BitcoinNetwork,
    targetAddressType: AddressType,
    targetAccountId: number
  ) {
    const wasmModule = await getWasm();
    const plaintext = await requestDecrypt(password, encryptedBlob);
    const secrets: WalletSecrets = JSON.parse(plaintext);

    const existing = findDescriptorWallet(
      secrets,
      targetNetwork,
      targetAddressType,
      targetAccountId
    );
    if (existing) {
      return {
        descriptorWalletData: existing,
        encryptedBlobToStore: null,
      };
    }

    const walletResult = wasmModule.create_wallet(
      secrets.mnemonic,
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
    };
    secrets.descriptorWallets.push(descriptorWallet);
    const newPlaintext = JSON.stringify(secrets);
    const newBlob = await requestEncrypt(password, newPlaintext);
    return {
      descriptorWalletData: descriptorWallet,
      encryptedBlobToStore: {
        ciphertext: newBlob.ciphertext,
        iv: newBlob.iv,
        salt: newBlob.salt,
        kdfVersion: newBlob.kdfVersion,
      },
    };
  },

  async updateDescriptorWalletChangeset(
    password: string,
    encryptedBlob: EncryptedBlobMessage,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number,
    changesetJson: string
  ) {
    const plaintext = await requestDecrypt(password, encryptedBlob);
    const secrets: WalletSecrets = JSON.parse(plaintext);
    const descriptorWallet = findDescriptorWallet(
      secrets,
      network,
      addressType,
      accountId
    );
    if (!descriptorWallet) {
      throw new Error(
        `No descriptor wallet found for ${network}/${addressType}/${accountId}`
      );
    }
    descriptorWallet.changeSet = changesetJson;
    const newPlaintext = JSON.stringify(secrets);
    const newBlob = await requestEncrypt(password, newPlaintext);
    return {
      ciphertext: newBlob.ciphertext,
      iv: newBlob.iv,
      salt: newBlob.salt,
      kdfVersion: newBlob.kdfVersion,
    };
  },

  async createWalletAndEncryptSecrets(
    password: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number,
    wordCount: 12 | 24
  ) {
    const wasmModule = await getWasm();
    const mnemonic = wasmModule.generate_mnemonic(wordCount);
    const walletResult = wasmModule.create_wallet(
      mnemonic,
      network,
      addressType,
      accountId
    );
    const secrets: WalletSecrets = {
      mnemonic,
      descriptorWallets: [
        {
          network,
          addressType,
          accountId,
          externalDescriptor: walletResult.external_descriptor,
          internalDescriptor: walletResult.internal_descriptor,
          changeSet: walletResult.changeset_json,
        },
      ],
    };
    const plaintext = JSON.stringify(secrets);
    const encryptedBlob = await requestEncrypt(password, plaintext);
    return {
      encryptedBlob: {
        ciphertext: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
        salt: encryptedBlob.salt,
        kdfVersion: encryptedBlob.kdfVersion,
      },
      walletResult,
      mnemonicForBackup: mnemonic,
    };
  },

  async importWalletAndEncryptSecrets(
    mnemonic: string,
    password: string,
    network: BitcoinNetwork,
    addressType: AddressType,
    accountId: number
  ) {
    const wasmModule = await getWasm();
    const walletResult = wasmModule.create_wallet(
      mnemonic,
      network,
      addressType,
      accountId
    );
    const secrets: WalletSecrets = {
      mnemonic,
      descriptorWallets: [
        {
          network,
          addressType,
          accountId,
          externalDescriptor: walletResult.external_descriptor,
          internalDescriptor: walletResult.internal_descriptor,
          changeSet: walletResult.changeset_json,
        },
      ],
    };
    const plaintext = JSON.stringify(secrets);
    const encryptedBlob = await requestEncrypt(password, plaintext);
    return {
      encryptedBlob: {
        ciphertext: encryptedBlob.ciphertext,
        iv: encryptedBlob.iv,
        salt: encryptedBlob.salt,
        kdfVersion: encryptedBlob.kdfVersion,
      },
      walletResult,
    };
  },
};

expose(cryptoService);
