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
  WireSyncResult,
  WireTransactionDetails,
} from './crypto-wire-types';

export function mapWireDescriptorPairToDomain(wire: WireDescriptorPair): DescriptorPair {
  return {
    externalDescriptor: wire.external_descriptor,
    internalDescriptor: wire.internal_descriptor,
  };
}

export function mapWireBalanceToDomain(wire: WireBalanceInfo): BalanceInfo {
  return {
    confirmed: wire.confirmed,
    trustedPendingSats: wire.trusted_pending,
    untrustedPendingSats: wire.untrusted_pending,
    immatureSats: wire.immature,
    total: wire.total,
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
