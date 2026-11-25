#![cfg(not(target_arch = "wasm32"))]

mod common;

use std::sync::Arc;

use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{KeychainKind, Update, Wallet};
use bitcoin::hashes::Hash;
use bitcoin::opcodes::all::OP_RETURN;
use bitcoin::script::Builder;
use bitcoin::{
    Amount, BlockHash, OutPoint, ScriptBuf, Transaction, TxIn, TxOut, Txid, transaction,
};

use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use bitboard_crypto::wallet;
use common::wallet_fixtures::create_test_wallet;

const FUNDING_BLOCK_HEIGHT: u32 = 1_000;
const FUNDING_CONFIRMATION_TIME: u64 = 1_700_000_000;

fn reveal_external_through(wallet: &mut Wallet, through_index: u32) {
    loop {
        let revealed = wallet.derivation_index(KeychainKind::External);
        if revealed.is_some_and(|index| index >= through_index) {
            break;
        }
        wallet.reveal_next_address(KeychainKind::External);
    }
}

fn external_script(wallet: &Wallet, index: u32) -> ScriptBuf {
    wallet
        .peek_address(KeychainKind::External, index)
        .address
        .script_pubkey()
}

fn payment_tx(input_marker: u8, outputs: Vec<TxOut>) -> Transaction {
    Transaction {
        version: transaction::Version(2),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([input_marker; 32]), 0),
            ..Default::default()
        }],
        output: outputs,
    }
}

fn output_to(script_pubkey: ScriptBuf, amount_sats: u64) -> TxOut {
    TxOut {
        value: Amount::from_sat(amount_sats),
        script_pubkey,
    }
}

fn apply_confirmed_transactions(wallet: &mut Wallet, transactions: Vec<Transaction>) {
    let block_id = BlockId {
        height: FUNDING_BLOCK_HEIGHT,
        hash: BlockHash::all_zeros(),
    };
    let anchor = ConfirmationBlockTime {
        block_id,
        confirmation_time: FUNDING_CONFIRMATION_TIME,
    };
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.anchors = transactions
        .iter()
        .map(|tx| (anchor, tx.compute_txid()))
        .collect();
    tx_update.txs = transactions.into_iter().map(Arc::new).collect();

    let checkpoint = CheckPoint::new(BlockId {
        height: 0,
        hash: BlockHash::all_zeros(),
    })
    .push(block_id)
    .expect("block heights must be ascending");

    wallet
        .apply_update(Update {
            tx_update,
            chain: Some(checkpoint),
            ..Default::default()
        })
        .expect("confirmed payments must apply");
}

#[test]
fn external_receive_gap_is_unrevealed_before_the_first_reveal() {
    let wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    let gap = wallet::external_receive_gap(&wallet);

    assert!(!gap.revealed);
    assert_eq!(gap.index, 0);
    assert_eq!(gap.receive_count, 0);
    assert_eq!(gap.gap, 0);
}

#[test]
fn revealed_unpaid_address_has_gap_one_and_no_receives() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);

    let gap = wallet::external_receive_gap(&wallet);

    assert!(gap.revealed);
    assert_eq!(gap.index, 0);
    assert_eq!(gap.receive_count, 0);
    assert_eq!(gap.gap, 1);
}

#[test]
fn payment_to_the_current_address_collapses_the_gap() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);
    let script = external_script(&wallet, 0);
    apply_confirmed_transactions(
        &mut wallet,
        vec![payment_tx(1, vec![output_to(script, 50_000)])],
    );

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.index, 0);
    assert_eq!(gap.receive_count, 1);
    assert_eq!(gap.gap, 0);
}

#[test]
fn revealing_past_a_paid_address_reopens_a_gap_of_one() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);
    let script = external_script(&wallet, 0);
    apply_confirmed_transactions(
        &mut wallet,
        vec![payment_tx(1, vec![output_to(script, 50_000)])],
    );
    reveal_external_through(&mut wallet, 1);

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.index, 1);
    assert_eq!(gap.receive_count, 0);
    assert_eq!(gap.gap, 1);
}

#[test]
fn two_reveals_past_a_payment_leave_a_gap_of_two() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);
    let script = external_script(&wallet, 0);
    apply_confirmed_transactions(
        &mut wallet,
        vec![payment_tx(1, vec![output_to(script, 50_000)])],
    );
    reveal_external_through(&mut wallet, 2);

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.index, 2);
    assert_eq!(gap.receive_count, 0);
    assert_eq!(gap.gap, 2);
}

#[test]
fn two_outputs_of_one_transaction_count_as_one_receive() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);
    let script = external_script(&wallet, 0);
    apply_confirmed_transactions(
        &mut wallet,
        vec![payment_tx(
            2,
            vec![output_to(script.clone(), 10_000), output_to(script, 20_000)],
        )],
    );

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.receive_count, 1);
    assert_eq!(gap.gap, 0);
}

#[test]
fn a_spent_payment_still_counts() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);
    let script = external_script(&wallet, 0);
    let funding = payment_tx(3, vec![output_to(script, 50_000)]);
    let funding_txid = funding.compute_txid();
    let spend = Transaction {
        version: transaction::Version(2),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(funding_txid, 0),
            ..Default::default()
        }],
        output: vec![output_to(
            Builder::new().push_opcode(OP_RETURN).into_script(),
            0,
        )],
    };
    apply_confirmed_transactions(&mut wallet, vec![funding, spend]);

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.receive_count, 1);
    assert_eq!(gap.gap, 0);
}

#[test]
fn an_internal_payment_does_not_move_the_external_gap() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 0);
    let internal = wallet.reveal_next_address(KeychainKind::Internal);
    apply_confirmed_transactions(
        &mut wallet,
        vec![payment_tx(
            4,
            vec![output_to(internal.address.script_pubkey(), 40_000)],
        )],
    );

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.index, 0);
    assert_eq!(gap.receive_count, 0);
    assert_eq!(gap.gap, 1);
}

#[test]
fn a_hole_behind_the_latest_payment_does_not_add_to_the_gap() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    reveal_external_through(&mut wallet, 2);
    let index_zero = external_script(&wallet, 0);
    let index_two = external_script(&wallet, 2);
    apply_confirmed_transactions(
        &mut wallet,
        vec![
            payment_tx(5, vec![output_to(index_zero, 10_000)]),
            payment_tx(6, vec![output_to(index_two, 15_000)]),
        ],
    );

    let gap = wallet::external_receive_gap(&wallet);

    assert_eq!(gap.index, 2);
    assert_eq!(gap.receive_count, 1);
    assert_eq!(gap.gap, 0);
}
