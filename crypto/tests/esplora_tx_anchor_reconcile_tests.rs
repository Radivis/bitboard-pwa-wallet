#![cfg(not(target_arch = "wasm32"))]

mod common;

use std::sync::Arc;

use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{KeychainKind, Update, Wallet};
use bitboard_crypto::esplora::EsploraClient;
use bitboard_crypto::esplora_tx_anchor_reconcile::{
    build_anchor_and_chain_reconcile_update, build_anchor_reconcile_update_for_txids,
    filter_esplora_confirmed_txids, list_txids_for_anchor_reconcile,
    list_unconfirmed_canonical_txids, unconfirmed_unspent_txids,
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

/// Genesis + tip only — the shape `bdk_esplora` often persists after a long full scan.
fn sparse_genesis_and_tip(tip_height: u32, tip_hash: BlockHash) -> CheckPoint {
    let genesis = BlockId {
        height: 0,
        hash: BlockHash::from_byte_array([0u8; 32]),
    };
    CheckPoint::new(genesis).insert(BlockId {
        height: tip_height,
        hash: tip_hash,
    })
}

fn unique_block_hash(marker: u8) -> BlockHash {
    BlockHash::from_byte_array([marker; 32])
}

fn esplora_block_summary_json(
    block_hash: BlockHash,
    height: u32,
    previousblockhash: BlockHash,
) -> serde_json::Value {
    serde_json::json!({
        "id": block_hash.to_string(),
        "height": height,
        "version": 536870912,
        "timestamp": FUNDING_BLOCK_TIME,
        "tx_count": 1,
        "size": 1000,
        "weight": 4000,
        "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
        "previousblockhash": previousblockhash.to_string(),
        "mediantime": FUNDING_BLOCK_TIME,
        "nonce": 0,
        "bits": 545259519,
        "difficulty": 1.0
    })
}

fn esplora_confirmed_tx_json(
    txid: Txid,
    block_hash: BlockHash,
    block_height: u32,
) -> serde_json::Value {
    serde_json::json!({
        "txid": txid.to_string(),
        "version": 2,
        "locktime": 0,
        "vin": [],
        "vout": [],
        "size": 100,
        "weight": 400,
        "fee": 0,
        "status": {
            "confirmed": true,
            "block_height": block_height,
            "block_hash": block_hash.to_string(),
            "block_time": FUNDING_BLOCK_TIME
        }
    })
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
async fn anchor_and_chain_reconcile_inserts_missing_anchor_height_on_sparse_tip() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let block_hash = BlockHash::from_byte_array([0x3c; 32]);
    let (funding_tx, txid) = funding_tx_and_id(&wallet);
    let tip_height = 178;
    let funding_anchor = ConfirmationBlockTime {
        block_id: BlockId {
            height: FUNDING_BLOCK_HEIGHT,
            hash: block_hash,
        },
        confirmation_time: FUNDING_BLOCK_TIME,
    };

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.anchors.insert((funding_anchor, txid));
    wallet
        .apply_update(Update {
            tx_update,
            chain: Some(sparse_genesis_and_tip(tip_height, block_hash)),
            ..Default::default()
        })
        .expect("anchor with sparse chain missing funding height");

    assert_eq!(
        wallet.balance().confirmed.to_sat(),
        0,
        "anchor height absent from sparse local chain must stay untrusted pending"
    );
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);
    assert!(
        wallet
            .local_chain()
            .tip()
            .get(FUNDING_BLOCK_HEIGHT)
            .is_none(),
        "precondition: funding height must be missing from local checkpoints"
    );

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
                "height": tip_height,
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

    let genesis_hash = BlockHash::from_byte_array([0u8; 32]);
    for height in 0..=tip_height {
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

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");
    let local_chain_tip = wallet.local_chain().tip().clone();
    let reconcile_update =
        build_anchor_and_chain_reconcile_update(&local_chain_tip, esplora_client.inner(), &[txid])
            .await
            .expect("reconcile update build")
            .expect("expected reconcile update");

    sync::apply_update(&mut wallet, reconcile_update).expect("reconcile apply");

    assert!(
        wallet
            .local_chain()
            .tip()
            .get(FUNDING_BLOCK_HEIGHT)
            .is_some_and(|checkpoint| checkpoint.hash() == block_hash),
        "reconcile must insert the missing funding-height checkpoint"
    );
    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_and_chain_reconcile_inserts_missing_height_when_tip_hash_differs_from_funding() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let funding_block_hash = unique_block_hash(0x3c);
    let tip_block_hash = unique_block_hash(0x4d);
    let genesis_hash = BlockHash::from_byte_array([0u8; 32]);
    let (funding_tx, txid) = funding_tx_and_id(&wallet);
    let tip_height = 178;
    let funding_anchor = ConfirmationBlockTime {
        block_id: BlockId {
            height: FUNDING_BLOCK_HEIGHT,
            hash: funding_block_hash,
        },
        confirmation_time: FUNDING_BLOCK_TIME,
    };

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding_tx));
    tx_update.anchors.insert((funding_anchor, txid));
    wallet
        .apply_update(Update {
            tx_update,
            chain: Some(sparse_genesis_and_tip(tip_height, tip_block_hash)),
            ..Default::default()
        })
        .expect("anchor with sparse unique-hash chain missing funding height");

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);

    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid}")))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(esplora_confirmed_tx_json(
                txid,
                funding_block_hash,
                FUNDING_BLOCK_HEIGHT,
            )),
        )
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(vec![
            esplora_block_summary_json(funding_block_hash, FUNDING_BLOCK_HEIGHT, genesis_hash),
            esplora_block_summary_json(tip_block_hash, tip_height, funding_block_hash),
        ]))
        .mount(&server)
        .await;

    for height in 0..=tip_height {
        let hash = if height == tip_height {
            tip_block_hash
        } else if height >= FUNDING_BLOCK_HEIGHT {
            funding_block_hash
        } else {
            genesis_hash
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

    assert!(
        wallet
            .local_chain()
            .tip()
            .get(FUNDING_BLOCK_HEIGHT)
            .is_some_and(|checkpoint| checkpoint.hash() == funding_block_hash),
        "reconcile must keep the /tx funding-height hash when tip hash differs"
    );
    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), 0);
}

#[tokio::test]
async fn anchor_and_chain_reconcile_keeps_tx_hash_when_blocks_list_disagrees_at_funding_height() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let funding_block_hash = unique_block_hash(0x3c);
    let stale_blocks_hash = unique_block_hash(0xab);
    let tip_block_hash = unique_block_hash(0x4d);
    let genesis_hash = BlockHash::from_byte_array([0u8; 32]);
    let (funding_tx, txid) = funding_tx_and_id(&wallet);
    let tip_height = 178;

    let genesis = BlockId {
        height: 0,
        hash: genesis_hash,
    };
    let mut chain_tip = CheckPoint::new(genesis);
    for height in 1..FUNDING_BLOCK_HEIGHT {
        chain_tip = chain_tip.insert(BlockId {
            height,
            hash: genesis_hash,
        });
    }
    chain_tip = chain_tip.insert(BlockId {
        height: FUNDING_BLOCK_HEIGHT,
        hash: stale_blocks_hash,
    });
    chain_tip = chain_tip.insert(BlockId {
        height: tip_height,
        hash: tip_block_hash,
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
        .expect("seen_at with stale /blocks hash at funding height");

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);

    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/tx/{txid}")))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(esplora_confirmed_tx_json(
                txid,
                funding_block_hash,
                FUNDING_BLOCK_HEIGHT,
            )),
        )
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path("/blocks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(vec![
            esplora_block_summary_json(stale_blocks_hash, FUNDING_BLOCK_HEIGHT, genesis_hash),
            esplora_block_summary_json(tip_block_hash, tip_height, stale_blocks_hash),
        ]))
        .mount(&server)
        .await;

    for height in 0..=tip_height {
        let hash = if height == tip_height {
            tip_block_hash
        } else if height == FUNDING_BLOCK_HEIGHT {
            stale_blocks_hash
        } else {
            genesis_hash
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

    assert!(
        wallet
            .local_chain()
            .tip()
            .get(FUNDING_BLOCK_HEIGHT)
            .is_some_and(|checkpoint| checkpoint.hash() == funding_block_hash),
        "reconcile must keep the /tx funding hash when /blocks still has a stale hash at that height"
    );
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

#[tokio::test]
async fn mempool_only_unconfirmed_esplora_tx_is_not_stuck_untrusted_pending() {
    let mut wallet = regtest_segwit_wallet_with_revealed_receive();
    let txid = apply_seen_at_funding_with_chain(&mut wallet, FUNDING_BLOCK_TIME);

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
                "confirmed": false
            }
        })))
        .mount(&server)
        .await;

    let esplora_client = EsploraClient::new(&server.uri()).expect("mock esplora client");

    assert!(
        unconfirmed_unspent_txids(&wallet).contains(&txid),
        "wallet must still have unconfirmed unspent before stuck check"
    );

    let esplora_confirmed = filter_esplora_confirmed_txids(esplora_client.inner(), &[txid])
        .await
        .expect("filter esplora confirmed");
    assert!(
        esplora_confirmed.is_empty(),
        "mempool-only /tx must not count as Esplora-confirmed stuck, got {esplora_confirmed:?}",
    );

    let local_chain_tip = wallet.local_chain().tip().clone();
    let reconcile_update =
        build_anchor_and_chain_reconcile_update(&local_chain_tip, esplora_client.inner(), &[txid])
            .await
            .expect("mempool reconcile must not fail sync");
    assert!(
        reconcile_update.is_none(),
        "mempool-only /tx must skip anchor reconcile, got {reconcile_update:?}",
    );

    assert_eq!(wallet.balance().confirmed.to_sat(), 0);
    assert_eq!(wallet.balance().untrusted_pending.to_sat(), FUNDING_SATS);
}
