mod support;

use bitboard_bark::regtest_session::{RegtestBarkWallet, regtest_receive_address};
use support::regtest_integration::{
    broadcast_raw_tx, load_boarded_fixture, mine_regtest_blocks,
    open_boarded_fixture_with_exit_bumper, regtest_enabled, regtest_endpoints,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn progress_exit_once(wallet: &RegtestBarkWallet, exit_id: &str) -> String {
    wallet.sync_exit_bumper().await.expect("sync exit bumper");
    wallet.progress_exits().await.expect("progress exit");
    wallet.exit_progress_label(exit_id).await.expect("exit label")
}

/// Default captaind `vtxo_exit_delta`. One mine per `awaiting` step.
const VTXO_EXIT_DELTA_BLOCKS: u32 = 144;

/// Broadcast a claim, drop the wallet before exit sync, and do not select those VTXOs again.
#[tokio::test]
#[ignore = "requires the bark-regtest stack and BARK_REGTEST_BOARDED_FIXTURE; BARK_REGTEST_RUN=1"]
async fn emergency_exit_claim_before_observation() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let wallet = open_boarded_fixture_with_exit_bumper(&endpoints).await;
    wallet.sync().await;
    let mut spendable = wallet.spendable_vtxo_ids().await.expect("spendable");
    spendable.sort();
    assert!(
        !spendable.is_empty(),
        "fixture has no spendable VTXO to exit, got {spendable:?}"
    );
    let exit_id = spendable[spendable.len() - 1].clone();
    wallet
        .start_exit_for_vtxos(std::slice::from_ref(&exit_id))
        .await
        .expect("start exit");

    let mut last_label = String::new();
    for _step in 0..24 {
        last_label = progress_exit_once(&wallet, &exit_id).await;
        if last_label == "claimable" {
            break;
        }
        if last_label == "awaiting" {
            mine_regtest_blocks(VTXO_EXIT_DELTA_BLOCKS);
        } else {
            mine_regtest_blocks(1);
        }
    }
    if last_label != "claimable" {
        last_label = progress_exit_once(&wallet, &exit_id).await;
    }
    if last_label == "awaiting" {
        mine_regtest_blocks(VTXO_EXIT_DELTA_BLOCKS);
        last_label = progress_exit_once(&wallet, &exit_id).await;
    }
    assert_eq!(last_label, "claimable", "exit stayed {last_label}");

    let (raw_tx_hex, claimed_ids) = wallet
        .drain_claim_raw_tx(regtest_receive_address(), &exit_id)
        .await
        .expect("drain claim");
    assert_eq!(claimed_ids, vec![exit_id.clone()]);
    broadcast_raw_tx(&endpoints.esplora_url, &raw_tx_hex).await;
    let dump_before_exit_sync = wallet.export_encoded_dump().expect("dump before exit sync");
    drop(wallet);

    let (mnemonic, _) = load_boarded_fixture();
    let reopened = RegtestBarkWallet::open_from_encoded_dump(
        &mnemonic,
        &dump_before_exit_sync,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("reopen dump");
    let selected = reopened.claimable_ids_excluding(&claimed_ids).await;
    assert!(
        !selected.iter().any(|vtxo_id| claimed_ids.contains(vtxo_id)),
        "second claim selection included {claimed_ids:?}: {selected:?}"
    );
}
