#![cfg(not(target_arch = "wasm32"))]

//! The frontend reads persisted BDK changeset JSON directly to classify
//! Signet / Mutinynet descriptor rows (`signet-mutinynet-chain-classifier.ts`).
//! If a BDK upgrade changes these paths, this test fails before that reader
//! silently classifies every row as unknown.

mod common;

use bdk_wallet::chain::Merge;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use bitboard_crypto::wallet;
use common::wallet_fixtures::{create_test_wallet, fund_test_wallet};
use serde_json::Value;

fn funded_wallet_changeset_json() -> Value {
    let mut wallet = create_test_wallet(BitcoinNetwork::Signet, AddressType::Taproot);
    let mut changeset = wallet
        .take_staged()
        .expect("new wallet has a staged changeset");
    fund_test_wallet(&mut wallet, 50_000);
    changeset.merge(wallet.take_staged().expect("funding stages a changeset"));
    let json = wallet::serialize_changeset(&changeset).expect("changeset serializes");
    serde_json::from_str(&json).expect("changeset JSON parses")
}

#[test]
fn local_chain_blocks_is_an_object_from_height_string_to_hash_or_null() {
    let changeset = funded_wallet_changeset_json();

    let blocks = changeset["local_chain"]["blocks"]
        .as_object()
        .expect("local_chain.blocks must be an object");
    assert!(!blocks.is_empty(), "funded wallet must have checkpoints");
    for (height_key, block_hash) in blocks {
        height_key
            .parse::<u32>()
            .expect("local_chain.blocks keys must be decimal heights");
        assert!(
            block_hash.is_string() || block_hash.is_null(),
            "local_chain.blocks values must be a hash string or null, got {block_hash}"
        );
    }
}

#[test]
fn tx_graph_anchors_are_pairs_of_confirmation_block_time_and_txid() {
    let changeset = funded_wallet_changeset_json();

    let anchors = changeset["tx_graph"]["anchors"]
        .as_array()
        .expect("tx_graph.anchors must be an array");
    assert_eq!(anchors.len(), 1, "funded wallet must have one anchor");

    let anchor_pair = anchors[0]
        .as_array()
        .expect("each anchor must be a [anchor, txid] pair");
    assert_eq!(anchor_pair.len(), 2);
    let block_id = &anchor_pair[0]["block_id"];
    assert!(
        block_id["height"].is_u64(),
        "block_id.height must be a number"
    );
    assert!(
        block_id["hash"].is_string(),
        "block_id.hash must be a string"
    );
    assert!(anchor_pair[0]["confirmation_time"].is_u64());
    assert!(anchor_pair[1].is_string(), "anchor txid must be a string");
}
