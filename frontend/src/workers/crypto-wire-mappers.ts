import type {
  BuildAndSignLabTransactionResult,
  DraftLabPsbtTransactionResult,
  PrepareOnchainSendResult,
  ReviewInputUtxo,
} from './crypto-api';
import type {
  BalanceInfo,
  CreateWalletResult,
  DescriptorPair,
  SyncResult,
  TransactionDetails,
} from './crypto-types';
import type {
  WireBalanceInfo,
  WireCreateWalletResult,
  WireDescriptorPair,
  WireDraftPsbtResult,
  WireLabEntitySignResult,
  WireLabSignResult,
  WirePrepareOnchainSendResult,
  WireReviewInputUtxo,
  WireSyncResult,
  WireTransactionDetails,
} from './crypto-wire-types';

export function parseWasmJsonWire<T>(raw: unknown): T {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as T;
  }
  return raw as T;
}

export function mapWireDescriptorPairToDomain(wire: WireDescriptorPair): DescriptorPair {
  return {
    externalDescriptor: wire.external_descriptor,
    internalDescriptor: wire.internal_descriptor,
  };
}

export function mapWireBalanceToDomain(wire: WireBalanceInfo): BalanceInfo {
  return {
    confirmedSats: wire.confirmed_sats,
    trustedPendingSats: wire.trusted_pending_sats,
    untrustedPendingSats: wire.untrusted_pending_sats,
    immatureSats: wire.immature_sats,
    totalSats: wire.total_sats,
  };
}

export function mapWireCreateWalletResultToDomain(wire: WireCreateWalletResult): CreateWalletResult {
  return {
    externalDescriptor: wire.external_descriptor,
    internalDescriptor: wire.internal_descriptor,
    firstAddress: wire.first_address,
    changesetJson: wire.changeset_json,
  };
}

export function mapWireSyncResultToDomain(wire: WireSyncResult): SyncResult {
  return {
    balance: mapWireBalanceToDomain(wire.balance),
    changesetJson: wire.changeset_json,
  };
}

export function mapWireTransactionToDomain(wire: WireTransactionDetails): TransactionDetails {
  return {
    txid: wire.txid,
    sentSats: wire.sent_sats,
    receivedSats: wire.received_sats,
    feeSats: wire.fee_sats,
    confirmationBlockHeight: wire.confirmation_block_height,
    confirmationTime: wire.confirmation_time,
    isConfirmed: wire.is_confirmed,
    isLabTx: wire.is_lab_tx,
  };
}

export function mapWireTransactionListToDomain(
  wireList: WireTransactionDetails[],
): TransactionDetails[] {
  return wireList.map(mapWireTransactionToDomain);
}

function mapWireReviewInputUtxoToDomain(wire: WireReviewInputUtxo): ReviewInputUtxo {
  return {
    address: wire.address,
    amountSats: wire.amount_sats,
    txid: wire.txid,
    vout: wire.vout,
  };
}

function mapWireDraftReviewFieldsToDomain(wire: WireDraftPsbtResult): Pick<
  DraftLabPsbtTransactionResult,
  'changeSats' | 'totalInputSats' | 'inputUtxos'
> {
  return {
    changeSats: wire.change_sats,
    totalInputSats: wire.total_input_sats,
    inputUtxos: (wire.input_utxos ?? []).map(mapWireReviewInputUtxoToDomain),
  };
}

export function mapWireDraftPsbtResultToDomain(
  wire: WireDraftPsbtResult,
): DraftLabPsbtTransactionResult {
  return {
    psbtBase64: wire.psbt_base64,
    finalAmountSats: wire.final_amount_sats,
    originalAmountSats: wire.original_amount_sats,
    isRaisedToMinDust: wire.raised_to_min_dust,
    isChangeFreeBumpAvailable: wire.change_free_bump_available,
    changeFreeMaxSats: wire.change_free_max_sats,
    feeSats: wire.fee_sats,
    ...mapWireDraftReviewFieldsToDomain(wire),
  };
}

export function mapWirePrepareOnchainSendResultToDomain(
  wire: WirePrepareOnchainSendResult,
): PrepareOnchainSendResult {
  return {
    ...mapWireDraftPsbtResultToDomain(wire),
    isBumpedChangeFree: wire.bumped_change_free,
  };
}

export function mapWireLabSignResultToDomain(
  wire: WireLabSignResult,
): BuildAndSignLabTransactionResult {
  return {
    signedTxHex: wire.signed_tx_hex,
    feeSats: wire.fee_sats,
    hasChange: wire.has_change,
    finalAmountSats: wire.final_amount_sats,
    originalAmountSats: wire.original_amount_sats,
    isRaisedToMinDust: wire.raised_to_min_dust,
    isBumpedChangeFree: wire.bumped_change_free,
    isChangeFreeBumpAvailable: wire.change_free_bump_available,
    changeFreeMaxSats: wire.change_free_max_sats,
  };
}

export interface LabEntitySignDomainResult extends BuildAndSignLabTransactionResult {
  changesetJson: string;
  changeAddress: string | null;
}

export function mapWireLabEntitySignResultToDomain(
  wire: WireLabEntitySignResult,
): LabEntitySignDomainResult {
  const changeRaw = wire.change_address;
  return {
    ...mapWireLabSignResultToDomain(wire),
    changesetJson: wire.changeset_json,
    changeAddress:
      typeof changeRaw === 'string' && changeRaw.length > 0 ? changeRaw : null,
  };
}
