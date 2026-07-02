#![cfg(not(target_arch = "wasm32"))]

mod common;

use std::sync::Arc;

use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{KeychainKind, Update, Wallet};
use bitboard_crypto::esplora::EsploraClient;
use bitboard_crypto::esplora_tx_anchor_reconcile::{
    build_anchor_and_chain_reconcile_update, build_anchor_reconcile_update_for_txids,
    list_txids_for_anchor_reconcile, list_unconfirmed_canonical_txids,
};
use bitboard_crypto::sync;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use bitboard_crypto::wallet;
use bitcoin::hashes::Hash;
use bitcoin::{Amount, BlockHash, OutPoint, Transaction, TxIn, TxOut, Txid, transaction};
use common::wallet_fixtures::TEST_MNEMONIC_12;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const FUNDING_SATS: u64 = 100_000;
const FUNDING_BLOCK_HEIGHT: u32 = 177;
const FUNDING_BLOCK_TIME: u64 = 1_782_927_221;

fn regtest_segwit_wallet_with_revealed_receive() -> Wallet {
    let pair = bitboard_crypto::descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Regtest,
        AddressType::Segwit,
        0,
    )
    .unwrap();
    let mut wallet = wallet::create_wallet(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        BitcoinNetwork::Regtest,
    )
    .unwrap();
    wallet.reveal_next_address(KeychainKind::External);
    wallet
}

fn funding_tx_and_id(wallet: &Wallet) -> (Transaction, Txid) {
    let receive_address = wallet.peek_address(KeychainKind::External, 0).address;
    let funding_tx = Transaction {
        version: transaction::Version(2),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([1u8; 32]), 0),
            ..Default::default()
        }],
        output: vec![TxOut {
            value: Amount::from_sat(FUNDING_SATS),
            script_pubkey: receive_address.script_pubkey(),
        }],
    };
    let txid = funding_tx.compute_txid();
    (funding_tx, txid)
}

fn regtest_chain_through_height(tip_height: u32, block_hash: BlockHash) -> CheckPoint {
    let genesis = BlockId {
        height: 0,
        hash: BlockHash::from_byte_array([0u8; 32]),
    };
    let mut checkpoint = CheckPoint::new(genesis);
    for height in 1..=tip_height {
        checkpoint = checkpoint.insert(BlockId {
            height,
            hash: block_hash,
        });
    }
    checkpoint
}

fn apply_seen_at_funding_with_chain(wallet: &mut Wallet, start_time: u64) -> Txid {
    let (funding_tx, txid) = funding_tx_and_id(wallet);
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.seen_ats.insert((txid, start_time));

    let update = Update {
        tx_update,
        chain: Some(regtest_chain_through_height(178, block_hash)),
        ..Default::default()
    };
    wallet
        .apply_update(update)
        .expect("seen_at funding update must apply");
    txid
}

#[test]
fn applying_anchor_after_seen_at_promotes_receive_to_confirmed_when_chain_has_block() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let txid = apply_seen_at_funding_with_chain(&mut wallet, FUNDING_BLOCK_TIME);

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);

    let anchor = ConfirmationBlockTime {
        block_id: BlockId {
            height: FUNDING_BLOCK_HEIGHT,
            hash: block_hash,
        },
        confirmation_time: FUNDING_BLOCK_TIME,
    };
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.anchors.insert((anchor, txid));

    wallet
        .apply_update(Update {
            tx_update,
            ..Default::default()
        })
        .expect("anchor update must apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[test]
fn list_unconfirmed_canonical_txids_includes_seen_at_receive() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let txid = apply_seen_at_funding_with_chain(&mut wallet, FUNDING_BLOCK_TIME);

    let unconfirmed = list_unconfirmed_canonical_txids(&wallet);
    assert!(
        unconfirmed.contains(&txid),
        "seen_at receive must be listed for anchor reconcile, got {unconfirmed:?}",
    );
}

#[test]
fn list_txids_for_anchor_reconcile_includes_unconfirmed_unspent() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let txid = apply_seen_at_funding_with_chain(&mut wallet, FUNDING_BLOCK_TIME);

    let txids = list_txids_for_anchor_reconcile(&wallet);
    assert!(
        txids.contains(&txid),
        "unconfirmed unspent must be listed for anchor reconcile, got {txids:?}",
    );
}

#[tokio::test]
async fn build_anchor_reconcile_update_promotes_seen_at_receive_via_tx_endpoint() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let txid = apply_seen_at_funding_with_chain(&mut wallet, FUNDING_BLOCK_TIME);
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);

    let server = MockServer::start().await;
    let txid_hex = txid.to_string();
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid_hex}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "txid": txid_hex,
            "version": 2,
            "locktime": 0,
            "vin": [{
                "txid": "0101010101010101010101010101010101010101010101010101010101010101",
                "vout": 0,
                "prevout": null,
                "scriptsig": "",
                "scriptsig_asm": "",
                "is_coinbase": false,
                "sequence": 0
            }],
            "vout": [{
                "scriptpubkey": "0014c692ecf13534982a9a2834565cbd37add8027140",
                "scriptpubkey_asm": "",
                "scriptpubkey_type": "v0_p2wpkh",
                "value": FUNDING_SATS
            }],
            "size": 100,
            "weight": 400,
            "fee": 0,
            "status": {
                "confirmed": true,
                "block_height": FUNDING_BLOCK_HEIGHT,
                "block_hash": block_hash.to_string(),
                "block_time": FUNDING_BLOCK_TIME
            }
        })))
        .mount(&server)
        .await;

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");

    let reconcile_update = build_anchor_reconcile_update_for_txids(esplora_client.inner(), &[txid])
        .await
        .expect("reconcile update build")
        .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_and_chain_reconcile_promotes_seen_at_without_prior_local_chain() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let (funding_tx, txid) = funding_tx_and_id(&wallet);
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.seen_ats.insert((txid, FUNDING_BLOCK_TIME));
    wallet
        .apply_update(Update {
            tx_update,
            ..Default::default()
        })
        .expect("seen_at without chain");

    let server = MockServer::start().await;
    let txid_hex = txid.to_string();
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid_hex}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "txid": txid_hex,
            "version": 2,
            "locktime": 0,
            "vin": [],
            "vout": [],
            "size": 100,
            "weight": 400,
            "fee": 0,
            "status": {
                "confirmed": true,
                "block_height": FUNDING_BLOCK_HEIGHT,
                "block_hash": block_hash.to_string(),
                "block_time": FUNDING_BLOCK_TIME
            }
        })))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(vec![
            serde_json::json!({
                "id": block_hash.to_string(),
                "height": FUNDING_BLOCK_HEIGHT,
                "version": 536870912,
                "timestamp": FUNDING_BLOCK_TIME,
                "tx_count": 1,
                "size": 1000,
                "weight": 4000,
                "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
                "previousblockhash": "0000000000000000000000000000000000000000000000000000000000000000",
                "mediantime": FUNDING_BLOCK_TIME,
                "nonce": 0,
                "bits": 545259519,
                "difficulty": 1.0
            }),
            serde_json::json!({
                "id": block_hash.to_string(),
                "height": 178,
                "version": 536870912,
                "timestamp": FUNDING_BLOCK_TIME,
                "tx_count": 1,
                "size": 1000,
                "weight": 4000,
                "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
                "previousblockhash": block_hash.to_string(),
                "mediantime": FUNDING_BLOCK_TIME,
                "nonce": 0,
                "bits": 545259519,
                "difficulty": 1.0
            }),
        ]))
        .mount(&server)
        .await;

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");
    let genesis_hash = BlockHash::from_byte_array([0u8; 32]);
    for height in 0..=178u32 {
        let hash = if height >= FUNDING_BLOCK_HEIGHT {
            block_hash
        } else {
            genesis_hash
        };
        Mock::given(method("GET"))
            .and(path(format!("/block-height/{height}")))
            .respond_with(ResponseTemplate::new(200).set_body_string(hash.to_string()))
            .mount(&server)
            .await;
    }

    let local_chain_tip = wallet.local_chain().tip().clone();
    let reconcile_update =
        build_anchor_and_chain_reconcile_update(&local_chain_tip, esplora_client.inner(), &[txid])
            .await
            .expect("reconcile update build")
            .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_and_chain_reconcile_promotes_seen_at_with_existing_chain_tip() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let chain_before_funding = FUNDING_BLOCK_HEIGHT - 1;
    let (funding_tx, txid) = funding_tx_and_id(&wallet);

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.seen_ats.insert((txid, FUNDING_BLOCK_TIME));
    wallet
        .apply_update(Update {
            tx_update,
            chain: Some(regtest_chain_through_height(
                chain_before_funding,
                block_hash,
            )),
            ..Default::default()
        })
        .expect("seen_at with chain before funding block");

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);

    let server = MockServer::start().await;
    let txid_hex = txid.to_string();
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid_hex}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "txid": txid_hex,
            "version": 2,
            "locktime": 0,
            "vin": [],
            "vout": [],
            "size": 100,
            "weight": 400,
            "fee": 0,
            "status": {
                "confirmed": true,
                "block_height": FUNDING_BLOCK_HEIGHT,
                "block_hash": block_hash.to_string(),
                "block_time": FUNDING_BLOCK_TIME
            }
        })))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(vec![
            serde_json::json!({
                "id": block_hash.to_string(),
                "height": FUNDING_BLOCK_HEIGHT,
                "version": 536870912,
                "timestamp": FUNDING_BLOCK_TIME,
                "tx_count": 1,
                "size": 1000,
                "weight": 4000,
                "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
                "previousblockhash": "0000000000000000000000000000000000000000000000000000000000000000",
                "mediantime": FUNDING_BLOCK_TIME,
                "nonce": 0,
                "bits": 545259519,
                "difficulty": 1.0
            }),
            serde_json::json!({
                "id": block_hash.to_string(),
                "height": 178,
                "version": 536870912,
                "timestamp": FUNDING_BLOCK_TIME,
                "tx_count": 1,
                "size": 1000,
                "weight": 4000,
                "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
                "previousblockhash": block_hash.to_string(),
                "mediantime": FUNDING_BLOCK_TIME,
                "nonce": 0,
                "bits": 545259519,
                "difficulty": 1.0
            }),
        ]))
        .mount(&server)
        .await;

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");
    let genesis_hash = BlockHash::from_byte_array([0u8; 32]);
    for height in 0..=178u32 {
        let hash = if height >= FUNDING_BLOCK_HEIGHT {
            block_hash
        } else {
            genesis_hash
        };
        Mock::given(method("GET"))
            .and(path(format!("/block-height/{height}")))
            .respond_with(ResponseTemplate::new(200).set_body_string(hash.to_string()))
            .mount(&server)
            .await;
    }

    let local_chain_tip = wallet.local_chain().tip().clone();
    let reconcile_update =
        build_anchor_and_chain_reconcile_update(&local_chain_tip, esplora_client.inner(), &[txid])
            .await
            .expect("reconcile update build")
            .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_and_chain_reconcile_uses_tip_fallback_when_blocks_list_empty() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let (funding_tx, txid) = funding_tx_and_id(&wallet);
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.seen_ats.insert((txid, FUNDING_BLOCK_TIME));
    wallet
        .apply_update(Update {
            tx_update,
            ..Default::default()
        })
        .expect("seen_at without chain");

    let server = MockServer::start().await;
    let txid_hex = txid.to_string();
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid_hex}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "txid": txid_hex,
            "version": 2,
            "locktime": 0,
            "vin": [],
            "vout": [],
            "size": 100,
            "weight": 400,
            "fee": 0,
            "status": {
                "confirmed": true,
                "block_height": FUNDING_BLOCK_HEIGHT,
                "block_hash": block_hash.to_string(),
                "block_time": FUNDING_BLOCK_TIME
            }
        })))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([])))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks/tip/height"))
        .respond_with(ResponseTemplate::new(200).set_body_string("178"))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks/tip/hash"))
        .respond_with(ResponseTemplate::new(200).set_body_string(block_hash.to_string()))
        .mount(&server)
        .await;

    for height in 0..=178u32 {
        let hash = if height >= FUNDING_BLOCK_HEIGHT {
            block_hash
        } else {
            BlockHash::from_byte_array([0u8; 32])
        };
        Mock::given(method("GET"))
            .and(path(format!("/block-height/{height}")))
            .respond_with(ResponseTemplate::new(200).set_body_string(hash.to_string()))
            .mount(&server)
            .await;
    }

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");
    let local_chain_tip = wallet.local_chain().tip().clone();
    let reconcile_update =
        build_anchor_and_chain_reconcile_update(&local_chain_tip, esplora_client.inner(), &[txid])
            .await
            .expect("reconcile update build")
            .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_and_chain_reconcile_fixes_wrong_hash_at_anchor_height_when_tip_agrees() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let correct_block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let wrong_block_hash = BlockHash::from_byte_array([0xab; 32]);
    let (funding_tx, txid) = funding_tx_and_id(&wallet);

    let genesis = BlockId {
        height: 0,
        hash: BlockHash::from_byte_array([0u8; 32]),
    };
    let mut chain_tip = CheckPoint::new(genesis);
    for height in 1..FUNDING_BLOCK_HEIGHT {
        chain_tip = chain_tip.insert(BlockId {
            height,
            hash: BlockHash::from_byte_array([0u8; 32]),
        });
    }
    chain_tip = chain_tip.insert(BlockId {
        height: FUNDING_BLOCK_HEIGHT,
        hash: wrong_block_hash,
    });
    chain_tip = chain_tip.insert(BlockId {
        height: 178,
        hash: correct_block_hash,
    });

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.seen_ats.insert((txid, FUNDING_BLOCK_TIME));
    wallet
        .apply_update(Update {
            tx_update,
            chain: Some(chain_tip),
            ..Default::default()
        })
        .expect("seen_at with wrong anchor-height hash");

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);

    let server = MockServer::start().await;
    let txid_hex = txid.to_string();
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid_hex}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "txid": txid_hex,
            "version": 2,
            "locktime": 0,
            "vin": [],
            "vout": [],
            "size": 100,
            "weight": 400,
            "fee": 0,
            "status": {
                "confirmed": true,
                "block_height": FUNDING_BLOCK_HEIGHT,
                "block_hash": correct_block_hash.to_string(),
                "block_time": FUNDING_BLOCK_TIME
            }
        })))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(vec![serde_json::json!({
                "id": correct_block_hash.to_string(),
                "height": 178,
                "version": 536870912,
                "timestamp": FUNDING_BLOCK_TIME,
                "tx_count": 1,
                "size": 1000,
                "weight": 4000,
                "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
                "previousblockhash": correct_block_hash.to_string(),
                "mediantime": FUNDING_BLOCK_TIME,
                "nonce": 0,
                "bits": 545259519,
                "difficulty": 1.0
            })]),
        )
        .mount(&server)
        .await;

    for height in 0..=178u32 {
        let hash = if height >= FUNDING_BLOCK_HEIGHT {
            correct_block_hash
        } else {
            BlockHash::from_byte_array([0u8; 32])
        };
        Mock::given(method("GET"))
            .and(path(format!("/block-height/{height}")))
            .respond_with(ResponseTemplate::new(200).set_body_string(hash.to_string()))
            .mount(&server)
            .await;
    }

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");
    let local_chain_tip = wallet.local_chain().tip().clone();
    let reconcile_update =
        build_anchor_and_chain_reconcile_update(&local_chain_tip, esplora_client.inner(), &[txid])
            .await
            .expect("reconcile update build")
            .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_reconcile_without_chain_blocks_stays_pending() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let (funding_tx, txid) = funding_tx_and_id(&wallet);
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.seen_ats.insert((txid, FUNDING_BLOCK_TIME));
    wallet
        .apply_update(Update {
            tx_update,
            ..Default::default()
        })
        .expect("seen_at without chain");

    let server = MockServer::start().await;
    let txid_hex = txid.to_string();
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid_hex}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "txid": txid_hex,
            "version": 2,
            "locktime": 0,
            "vin": [],
            "vout": [],
            "size": 100,
            "weight": 400,
            "fee": 0,
            "status": {
                "confirmed": true,
                "block_height": FUNDING_BLOCK_HEIGHT,
                "block_hash": block_hash.to_string(),
                "block_time": FUNDING_BLOCK_TIME
            }
        })))
        .mount(&server)
        .await;

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");

    let reconcile_update = build_anchor_reconcile_update_for_txids(esplora_client.inner(), &[txid])
        .await
        .expect("reconcile update build")
        .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);
}
