import { expose } from 'comlink';
import type { AddressType, BitcoinNetwork, BalanceInfo, CreateWalletResult, DescriptorPair, SyncResult, TransactionDetails } from './crypto-types';

let wasm: typeof import('@/wasm-pkg/bitboard_crypto') | null = null;
let wasmInitError: string | null = null;

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

const cryptoService = {
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
};

expose(cryptoService);
