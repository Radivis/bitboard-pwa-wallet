use std::collections::BTreeSet;
use std::sync::Arc;

use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{KeychainKind, Update, Wallet};
use bitcoin::hashes::Hash;
use bitcoin::{Amount, BlockHash, OutPoint, Transaction, TxIn, TxOut, transaction};

use bitboard_crypto::descriptors;
use bitboard_crypto::types::{AddressType, BitcoinNetwork, DescriptorPair};
use bitboard_crypto::wallet;

/// Well-known BIP39 12-word test vector (all "abandon" + "about").
/// Derived keys are publicly documented and deterministic.
pub const TEST_MNEMONIC_12: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/// Well-known BIP39 24-word test vector (all "abandon" + "art").
pub const TEST_MNEMONIC_24: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

pub const DEFAULT_ADDRESS_TYPE: AddressType = AddressType::Taproot;
pub const DEFAULT_NETWORK: BitcoinNetwork = BitcoinNetwork::Testnet;

const FUNDING_BLOCK_HEIGHT: u32 = 1_000;
const FUNDING_CONFIRMATION_TIME: u64 = 1_700_000_000;

pub const DEFAULT_ACCOUNT_ID: u32 = 0;

pub fn descriptors_for_test(network: BitcoinNetwork, address_type: AddressType) -> DescriptorPair {
    descriptors::derive_descriptors(TEST_MNEMONIC_12, network, address_type, DEFAULT_ACCOUNT_ID)
        .unwrap()
}

pub fn create_test_wallet(network: BitcoinNetwork, address_type: AddressType) -> Wallet {
    let pair = descriptors_for_test(network, address_type);
    wallet::create_wallet(&pair.external, &pair.internal, network).unwrap()
}

/// Inject a confirmed funding transaction into the wallet so it has spendable UTXOs.
///
/// Creates a synthetic transaction paying `amount_sats` to the wallet's
/// first external address, anchors it at a fixed block height, and applies
/// the resulting `Update` to the wallet. Uses a non-null input outpoint
/// so the transaction is not treated as coinbase (avoiding maturity rules).
pub fn fund_test_wallet(wallet: &mut Wallet, amount_sats: u64) {
    let receive_address = wallet.peek_address(KeychainKind::External, 0).address;

    let funding_tx = Transaction {
        version: transaction::Version(2),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(bitcoin::Txid::from_byte_array([1u8; 32]), 0),
            ..Default::default()
        }],
        output: vec![TxOut {
            value: Amount::from_sat(amount_sats),
            script_pubkey: receive_address.script_pubkey(),
        }],
    };

    let txid = funding_tx.compute_txid();

    let block_id = BlockId {
        height: FUNDING_BLOCK_HEIGHT,
        hash: BlockHash::all_zeros(),
    };
    let anchor = ConfirmationBlockTime {
        block_id,
        confirmation_time: FUNDING_CONFIRMATION_TIME,
    };

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.anchors = BTreeSet::from([(anchor, txid)]);

    let genesis_block_id = BlockId {
        height: 0,
        hash: BlockHash::all_zeros(),
    };
    let checkpoint = CheckPoint::new(genesis_block_id)
        .push(block_id)
        .expect("block heights must be ascending");

    let update = Update {
        tx_update,
        chain: Some(checkpoint),
        ..Default::default()
    };

    wallet
        .apply_update(update)
        .expect("update must apply cleanly to a fresh wallet");
}
