mod support;

use bitboard_bark::regtest_session::{RegtestBarkWallet, regtest_receive_address};
use support::regtest_integration::{
    load_boarded_fixture, open_boarded_fixture, regtest_enabled, regtest_endpoints,
};

static REGTEST_INTEGRATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Spend one fixture VTXO, then offboard that same id from the pre-spend dump.
/// The server names it once, the wallet records it spent once, and the new checkpoint is gone.
#[tokio::test]
#[ignore = "requires the bark-regtest stack and BARK_REGTEST_BOARDED_FIXTURE; BARK_REGTEST_RUN=1"]
async fn exit_input_already_spent() {
    if !regtest_enabled() {
        return;
    }
    let _regtest_lock = REGTEST_INTEGRATION_LOCK.lock().await;
    let endpoints = regtest_endpoints();
    let wallet = open_boarded_fixture(&endpoints).await;
    wallet.sync().await;
    let mut spendable = wallet.spendable_vtxo_ids().await.expect("spendable");
    spendable.sort();
    assert!(
        spendable.len() >= 2,
        "fixture needs two spendable VTXOs so the claim test can keep the other, got {spendable:?}"
    );
    let spent_id = spendable[0].clone();
    let dump_before_spend = wallet.export_encoded_dump().expect("dump before spend");
    let destination = regtest_receive_address();
    wallet
        .offboard_vtxos(std::slice::from_ref(&spent_id), destination.clone())
        .await
        .expect("server spends the VTXO");
    drop(wallet);

    let (mnemonic, _) = load_boarded_fixture();
    let stale = RegtestBarkWallet::open_from_encoded_dump(
        &mnemonic,
        &dump_before_spend,
        &endpoints.captaind_url,
        &endpoints.esplora_url,
    )
    .await
    .expect("reopen pre-spend dump");
    let rejection = stale
        .offboard_vtxos(std::slice::from_ref(&spent_id), destination)
        .await
        .expect_err("server should reject the already-spent VTXO");
    let named = stale
        .retire_server_spent_offboard(&rejection)
        .await
        .expect("retire spent input");
    assert_eq!(named, vec![spent_id.clone()]);
    assert_eq!(
        stale
            .spent_vtxo_count(&spent_id)
            .await
            .expect("spent count"),
        1
    );
    let pending_after_retire = stale.pending_offboard_ids().await.expect("pending");
    assert!(
        pending_after_retire.is_empty(),
        "offboard checkpoint still present: {pending_after_retire:?}"
    );
    let spendable_after = stale.spendable_vtxo_ids().await.expect("spendable after");
    assert!(
        !spendable_after.iter().any(|vtxo_id| vtxo_id == &spent_id),
        "spent VTXO is still selectable: {spendable_after:?}"
    );
}
