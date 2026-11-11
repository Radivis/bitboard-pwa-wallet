#![cfg(not(target_arch = "wasm32"))]

//! Sync guards that stop an Esplora server of the other signet-family chain
//! (public Signet vs Mutinynet) from rewriting a wallet's local chain.
//! Both chains share the signet genesis block, so BDK alone accepts either.

mod common;

use std::sync::Arc;

use async_trait::async_trait;
use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{KeychainKind, Update, Wallet};
use bitcoin::hashes::Hash;
use bitcoin::{Amount, BlockHash, OutPoint, Transaction, TxIn, TxOut, Txid, transaction};
use mockall::mock;

use bitboard_crypto::blockchain::BlockchainClient;
use bitboard_crypto::error::{
    CODE_ESPLORA_CHAIN_MISMATCH, CODE_ESPLORA_NETWORK_MISMATCH, CryptoError,
};
use bitboard_crypto::esplora_network_identity::SIGNET_MUTINYNET_HEIGHT_BOUNDARY;
use bitboard_crypto::sync;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use common::wallet_fixtures::create_test_wallet;

mock! {
    pub BC {}

    #[async_trait]
    impl BlockchainClient for BC {
        async fn full_scan(
            &self,
            wallet: &Wallet,
            stop_gap: usize,
            now: u64,
            parallel_requests: usize,
        ) -> Result<Update, CryptoError>;

        async fn sync(
            &self,
            wallet: &Wallet,
            now: u64,
            parallel_requests: usize,
        ) -> Result<Update, CryptoError>;

        async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError>;
    }
}

const FUNDING_SATS: u64 = 75_000;
const CONFIRMATION_TIME: u64 = 1_700_000_000;
const PUBLIC_SIGNET_TIP_HEIGHT: u32 = 328_647;
const MUTINYNET_TIP_HEIGHT: u32 = 3_547_496;

fn block_hash(marker: u8) -> BlockHash {
    BlockHash::from_byte_array([marker; 32])
}

fn genesis_block_id(wallet: &Wallet) -> BlockId {
    BlockId {
        height: 0,
        hash: wallet.local_chain().genesis_hash(),
    }
}

/// Genesis followed by the given `(height, hash)` blocks in ascending height order.
fn chain_from_genesis(wallet: &Wallet, blocks: &[(u32, BlockHash)]) -> CheckPoint {
    let mut checkpoint = CheckPoint::new(genesis_block_id(wallet));
    for &(height, hash) in blocks {
        checkpoint = checkpoint.insert(BlockId { height, hash });
    }
    checkpoint
}

fn chain_only_update(chain: CheckPoint) -> Update {
    Update {
        chain: Some(chain),
        ..Default::default()
    }
}

fn funding_tx(wallet: &Wallet) -> Transaction {
    let receive_address = wallet.peek_address(KeychainKind::External, 0).address;
    Transaction {
        version: transaction::Version(2),
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::new(Txid::from_byte_array([7u8; 32]), 0),
            ..Default::default()
        }],
        output: vec![TxOut {
            value: Amount::from_sat(FUNDING_SATS),
            script_pubkey: receive_address.script_pubkey(),
        }],
    }
}

/// Applies `blocks` as the local chain and confirms one funding tx in the block at `anchor_height`.
fn wallet_with_confirmed_funding(
    network: BitcoinNetwork,
    blocks: &[(u32, BlockHash)],
    anchor_height: u32,
) -> Wallet {
    let mut wallet = create_test_wallet(network, AddressType::Taproot);
    let anchor_hash = blocks
        .iter()
        .find(|(height, _)| *height == anchor_height)
        .map(|(_, hash)| *hash)
        .expect("anchor height must be one of the chain blocks");
    let funding = funding_tx(&wallet);
    let txid = funding.compute_txid();
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();
    tx_update.txs.push(Arc::new(funding));
    tx_update.anchors.insert((
        ConfirmationBlockTime {
            block_id: BlockId {
                height: anchor_height,
                hash: anchor_hash,
            },
            confirmation_time: CONFIRMATION_TIME,
        },
        txid,
    ));
    let chain = chain_from_genesis(&wallet, blocks);
    wallet
        .apply_update(Update {
            tx_update,
            chain: Some(chain),
            ..Default::default()
        })
        .expect("funding update must apply to a fresh wallet");
    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
    wallet
}

fn local_chain_blocks(wallet: &Wallet) -> Vec<(u32, BlockHash)> {
    wallet
        .local_chain()
        .iter_checkpoints()
        .map(|checkpoint| (checkpoint.height(), checkpoint.hash()))
        .collect()
}

fn mock_sync_returning(update: Update) -> MockBC {
    let mut mock_client = MockBC::new();
    mock_client
        .expect_sync()
        .return_once(move |_wallet, _now, _parallel| Ok(update));
    mock_client
}

fn mock_full_scan_returning(update: Update) -> MockBC {
    let mut mock_client = MockBC::new();
    mock_client
        .expect_full_scan()
        .return_once(move |_wallet, _stop_gap, _now, _parallel| Ok(update));
    mock_client
}

// --- Fork-at-genesis guard ---

#[tokio::test]
async fn sync_rejects_update_that_replaces_the_local_chain_down_to_genesis() {
    let local_blocks = [(324_613, block_hash(0x11)), (324_700, block_hash(0x12))];
    let mut wallet = wallet_with_confirmed_funding(BitcoinNetwork::Signet, &local_blocks, 324_613);
    let blocks_before = local_chain_blocks(&wallet);
    let txs_before = wallet.transactions().count();

    let foreign_chain = chain_from_genesis(
        &wallet,
        &[
            (324_613, block_hash(0xa1)),
            (324_700, block_hash(0xa2)),
            (MUTINYNET_TIP_HEIGHT, block_hash(0xa3)),
        ],
    );
    let mock_client = mock_sync_returning(chain_only_update(foreign_chain));

    let error = sync::sync_wallet(&mut wallet, &mock_client, 1)
        .await
        .expect_err("a fork at genesis must be rejected");

    assert_eq!(error.code(), CODE_ESPLORA_CHAIN_MISMATCH);
    assert_eq!(local_chain_blocks(&wallet), blocks_before);
    assert_eq!(wallet.transactions().count(), txs_before);
    assert_eq!(wallet.balance().confirmed.to_sat(), FUNDING_SATS);
}

#[tokio::test]
async fn full_scan_rejects_update_that_replaces_the_local_chain_down_to_genesis() {
    let local_blocks = [(324_613, block_hash(0x11)), (324_700, block_hash(0x12))];
    let mut wallet = wallet_with_confirmed_funding(BitcoinNetwork::Signet, &local_blocks, 324_613);
    let blocks_before = local_chain_blocks(&wallet);

    let foreign_chain = chain_from_genesis(
        &wallet,
        &[
            (324_613, block_hash(0xa1)),
            (324_700, block_hash(0xa2)),
            (MUTINYNET_TIP_HEIGHT, block_hash(0xa3)),
        ],
    );
    let mock_client = mock_full_scan_returning(chain_only_update(foreign_chain));

    let error = sync::full_scan_wallet(&mut wallet, &mock_client, 20, 1)
        .await
        .expect_err("a fork at genesis must be rejected");

    assert_eq!(error.code(), CODE_ESPLORA_CHAIN_MISMATCH);
    assert_eq!(local_chain_blocks(&wallet), blocks_before);
}

#[tokio::test]
async fn sync_accepts_one_block_reorg_that_invalidates_the_only_anchor() {
    let local_blocks = [(99, block_hash(0x21)), (100, block_hash(0x22))];
    let mut wallet = wallet_with_confirmed_funding(BitcoinNetwork::Regtest, &local_blocks, 100);

    let reorged_chain = chain_from_genesis(
        &wallet,
        &[
            (99, block_hash(0x21)),
            (100, block_hash(0xb2)),
            (101, block_hash(0xb3)),
        ],
    );
    let mock_client = mock_sync_returning(chain_only_update(reorged_chain));

    sync::sync_wallet(&mut wallet, &mock_client, 1)
        .await
        .expect("a shallow reorg must apply");

    assert_eq!(wallet.local_chain().tip().height(), 101);
    assert_eq!(
        wallet.balance().confirmed.to_sat(),
        0,
        "the reorged-out anchor no longer confirms the funding tx"
    );
}

#[tokio::test]
async fn sync_never_rejects_a_wallet_without_anchored_transactions() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Signet, AddressType::Taproot);
    wallet
        .apply_update(chain_only_update(chain_from_genesis(
            &wallet,
            &[(324_700, block_hash(0x31))],
        )))
        .expect("initial chain must apply");

    let foreign_chain = chain_from_genesis(
        &wallet,
        &[
            (324_700, block_hash(0xc1)),
            (MUTINYNET_TIP_HEIGHT, block_hash(0xc2)),
        ],
    );
    let mock_client = mock_sync_returning(chain_only_update(foreign_chain));

    sync::sync_wallet(&mut wallet, &mock_client, 1)
        .await
        .expect("a wallet without anchors has nothing to protect");

    assert_eq!(wallet.local_chain().tip().height(), MUTINYNET_TIP_HEIGHT);
}

#[test]
fn update_that_cannot_connect_maps_to_esplora_chain_mismatch() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Mutinynet, AddressType::Taproot);
    wallet
        .apply_update(chain_only_update(chain_from_genesis(
            &wallet,
            &[
                (3_547_000, block_hash(0x41)),
                (MUTINYNET_TIP_HEIGHT, block_hash(0x42)),
            ],
        )))
        .expect("initial chain must apply");

    let public_signet_chain =
        chain_from_genesis(&wallet, &[(PUBLIC_SIGNET_TIP_HEIGHT, block_hash(0xd1))]);

    let error = sync::apply_update(&mut wallet, chain_only_update(public_signet_chain))
        .expect_err("an update below every local checkpoint cannot connect");

    assert_eq!(error.code(), CODE_ESPLORA_CHAIN_MISMATCH);
}

// --- Esplora network identity check ---

fn tip_only_update(wallet: &Wallet, tip_height: u32) -> Update {
    chain_only_update(chain_from_genesis(
        wallet,
        &[(tip_height, block_hash(0xe1))],
    ))
}

#[test]
fn identity_check_rejects_mutinynet_tip_for_a_signet_wallet_before_apply() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Signet, AddressType::Taproot);
    let blocks_before = local_chain_blocks(&wallet);
    let update = tip_only_update(&wallet, MUTINYNET_TIP_HEIGHT);

    let error = sync::apply_esplora_update(&mut wallet, Some(BitcoinNetwork::Signet), update)
        .expect_err("a Mutinynet tip must not be applied to a Signet wallet");

    assert_eq!(error.code(), CODE_ESPLORA_NETWORK_MISMATCH);
    assert!(
        error
            .to_string()
            .contains(&MUTINYNET_TIP_HEIGHT.to_string())
    );
    assert!(error.to_string().contains("Settings"));
    assert_eq!(local_chain_blocks(&wallet), blocks_before);
}

#[test]
fn identity_check_rejects_public_signet_tip_for_a_mutinynet_wallet_before_apply() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Mutinynet, AddressType::Taproot);
    let blocks_before = local_chain_blocks(&wallet);
    let update = tip_only_update(&wallet, PUBLIC_SIGNET_TIP_HEIGHT);

    let error = sync::apply_esplora_update(&mut wallet, Some(BitcoinNetwork::Mutinynet), update)
        .expect_err("a public Signet tip must not be applied to a Mutinynet wallet");

    assert_eq!(error.code(), CODE_ESPLORA_NETWORK_MISMATCH);
    assert_eq!(local_chain_blocks(&wallet), blocks_before);
}

#[test]
fn identity_check_accepts_tips_on_the_matching_side_of_the_boundary() {
    let mut signet_wallet = create_test_wallet(BitcoinNetwork::Signet, AddressType::Taproot);
    let signet_update = tip_only_update(&signet_wallet, SIGNET_MUTINYNET_HEIGHT_BOUNDARY - 1);
    sync::apply_esplora_update(
        &mut signet_wallet,
        Some(BitcoinNetwork::Signet),
        signet_update,
    )
    .expect("a tip below the boundary is public Signet");

    let mut mutinynet_wallet = create_test_wallet(BitcoinNetwork::Mutinynet, AddressType::Taproot);
    let mutinynet_update = tip_only_update(&mutinynet_wallet, SIGNET_MUTINYNET_HEIGHT_BOUNDARY);
    sync::apply_esplora_update(
        &mut mutinynet_wallet,
        Some(BitcoinNetwork::Mutinynet),
        mutinynet_update,
    )
    .expect("a tip at the boundary is Mutinynet");
}

#[test]
fn identity_check_skips_networks_outside_the_signet_family() {
    let mut wallet = create_test_wallet(BitcoinNetwork::Testnet, AddressType::Taproot);
    let update = tip_only_update(&wallet, MUTINYNET_TIP_HEIGHT);

    sync::apply_esplora_update(&mut wallet, Some(BitcoinNetwork::Testnet), update)
        .expect("testnet heights are not checked");
}
