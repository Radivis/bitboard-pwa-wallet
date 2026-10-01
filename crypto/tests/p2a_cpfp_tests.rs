#![cfg(not(target_arch = "wasm32"))]

mod common;

use bitboard_crypto::p2a_cpfp::{BARK_CPFP_INSUFFICIENT_FUNDS, sign_p2a_cpfp_child};
use bitcoin::consensus::encode::{deserialize_hex, serialize_hex};
use bitcoin::hashes::Hash;
use bitcoin::transaction::Version;
use bitcoin::{Amount, OutPoint, ScriptBuf, Transaction, TxIn, TxOut, Txid};
use common::wallet_fixtures::{
    DEFAULT_ADDRESS_TYPE, DEFAULT_NETWORK, create_test_wallet, fund_test_wallet,
};

const FUNDING_AMOUNT: u64 = 100_000;

fn parent_with_anchor() -> Transaction {
    Transaction {
        version: Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([2u8; 32]), 0),
            ..Default::default()
        }],
        output: vec![TxOut {
            value: Amount::ZERO,
            script_pubkey: ScriptBuf::new_p2a(),
        }],
    }
}

#[test]
fn parent_without_anchor_is_rejected() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, FUNDING_AMOUNT);
    let parent = Transaction {
        version: Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn::default()],
        output: vec![TxOut {
            value: Amount::from_sat(1_000),
            script_pubkey: ScriptBuf::new(),
        }],
    };
    let error = sign_p2a_cpfp_child(&mut wallet, &serialize_hex(&parent), 2.0, None, None)
        .expect_err("no anchor");
    let message = error.to_string();
    assert!(message.contains("no Pay-to-Anchor"));
    assert!(!message.contains(BARK_CPFP_INSUFFICIENT_FUNDS));
}

#[test]
fn unfunded_wallet_reports_insufficient_confirmed_funds() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let parent = parent_with_anchor();
    let error = sign_p2a_cpfp_child(&mut wallet, &serialize_hex(&parent), 2.0, None, None)
        .expect_err("no coins");
    assert!(error.to_string().contains(BARK_CPFP_INSUFFICIENT_FUNDS));
}

#[test]
fn funded_wallet_signs_a_version_3_child_that_spends_the_anchor() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, FUNDING_AMOUNT);
    let parent = parent_with_anchor();
    let child_hex = sign_p2a_cpfp_child(&mut wallet, &serialize_hex(&parent), 2.0, None, None)
        .expect("signed child");
    let child: Transaction = deserialize_hex(&child_hex).expect("child hex");
    assert_eq!(child.version, Version(3));
    assert!(
        child
            .input
            .iter()
            .any(|input| input.previous_output.txid == parent.compute_txid()),
        "child must spend the parent anchor"
    );
    assert!(child.input.len() >= 2, "child also spends a wallet coin");
}
