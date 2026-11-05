mod support;

use bitboard_bark::regtest_session::{RegtestBarkWallet, fresh_regtest_mnemonic};

use support::regtest_integration::{
    fund_regtest_address, mine_regtest_blocks, regtest_enabled, regtest_endpoints,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const UNUSED_KEYS_BEFORE_PAYMENT: u32 = 3;
const PAYMENT_KEY_INDEX: u32 = 3;
const MAILBOX_GAP_LIMIT: u32 = 1;
const BOARD_AMOUNT_SATS: u64 = 50_000;
const REQUIRED_BOARD_CONFIRMATIONS: u32 = 3;

/// An empty envelope with a mailbox gap of 1 still spends a VTXO boarded at key index 3.
///
/// Indices 0–2 stay unused, so the mailbox scan stops before that key. Captaind 0.8.0
/// returns the key from the seed's VTXO xpub before that scan.
#[tokio::test]
#[ignore = "requires captaind 0.8.0; BARK_REGTEST_RUN=1 --features regtest-support"]
async fn seed_recovery_past_gap_regtest() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let mnemonic = fresh_regtest_mnemonic();

    let wallet = RegtestBarkWallet::open_empty_with_exit_bumper(
        &mnemonic,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("open wallet");
    let bumper_address = wallet
        .exit_bumper_address()
        .await
        .expect("exit bumper address");
    fund_regtest_address(&bumper_address, "0.01");
    mine_regtest_blocks(1);
    wallet.sync_exit_bumper().await.expect("sync exit bumper");

    let unused_indices = wallet
        .reveal_unused_vtxo_keys(UNUSED_KEYS_BEFORE_PAYMENT)
        .await
        .expect("reveal unused keys");
    assert_eq!(
        unused_indices,
        vec![0, 1, 2],
        "the first three VTXO keys must stay unused"
    );
    let (vtxo_id, boarded_index) = wallet
        .board_next_vtxo(BOARD_AMOUNT_SATS)
        .await
        .expect("board key index 3");
    assert_eq!(boarded_index, PAYMENT_KEY_INDEX);

    mine_regtest_blocks(REQUIRED_BOARD_CONFIRMATIONS);
    let mut spendable = Vec::new();
    for _attempt in 0..8 {
        wallet.sync().await;
        spendable = wallet.spendable_vtxo_ids().await.expect("spendable vtxos");
        if spendable.iter().any(|id| id == &vtxo_id) {
            break;
        }
        mine_regtest_blocks(1);
    }
    assert!(
        spendable.iter().any(|id| id == &vtxo_id),
        "boarded VTXO {vtxo_id} never became spendable: {spendable:?}"
    );
    drop(wallet);

    let restored = RegtestBarkWallet::open_empty_with_vtxo_key_gap_limit(
        &mnemonic,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
        MAILBOX_GAP_LIMIT,
    )
    .await
    .expect("empty-envelope restore");
    restored.sync().await;
    let recovered = restored
        .spendable_vtxo_ids()
        .await
        .expect("recovered spendable vtxos");
    assert!(
        recovered.iter().any(|id| id == &vtxo_id),
        "gap {MAILBOX_GAP_LIMIT} did not recover VTXO {vtxo_id} at key index {PAYMENT_KEY_INDEX}; spendable={recovered:?}"
    );
}
