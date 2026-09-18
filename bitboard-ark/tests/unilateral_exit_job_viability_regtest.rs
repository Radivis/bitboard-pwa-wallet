//! Session-level viability checks on live arkade-regtest.
//!
//! Prefer an E2E-exported boarded fixture (avoids flaky native cooperative boarding):
//! `ARKADE_REGTEST_EXPORT_BOARDED_FIXTURE=1` from `frontend/` after `npm run regtest:clean-start`,
//! then from repo root:
//! `ARKADE_REGTEST_BOARDED_FIXTURE=frontend/test-results/arkade-boarded-fixture.json ARKADE_REGTEST_RUN=1 \
//!   cargo test -p bitboard-ark --test unilateral_exit_job_viability_regtest -- --ignored --nocapture --test-threads=1`
//!
//! Without a fixture, native boarding needs a clean stack:
//! `ARKD_VTXO_TREE_EXPIRY=200 npm run regtest:clean-start` from `frontend/`.

#![cfg(not(target_arch = "wasm32"))]

use bitboard_ark::{UnilateralExitJobViabilityKind, UnilateralExitProgressParams, VirtualOutPoint};

mod support;

use support::regtest_integration::{
    DEFAULT_BOARD_SATS, open_boarded_session_or_fixture, regtest_enabled, regtest_endpoints,
};

#[tokio::test]
#[ignore = "boarded session viability OK path — see file header for fixture vs clean-start setup"]
async fn evaluate_job_viability_ok_for_boarded_exit_candidate() {
    if !regtest_enabled() {
        return;
    }

    let endpoints = regtest_endpoints();
    let session = open_boarded_session_or_fixture(&endpoints, DEFAULT_BOARD_SATS).await;

    let candidates = session
        .list_exit_candidates()
        .await
        .expect("exit candidates");
    let candidate = candidates
        .iter()
        .find(|row| row.can_start_unroll)
        .expect("at least one unroll-eligible VTXO");

    let outpoint =
        VirtualOutPoint::parse(&candidate.txid, candidate.vout).expect("candidate outpoint");
    let viability = session
        .evaluate_unilateral_exit_job_viability(UnilateralExitProgressParams {
            vtxo_outpoints: vec![outpoint],
        })
        .await
        .expect("evaluate job viability");

    assert_eq!(viability.status, UnilateralExitJobViabilityKind::Ok);
    assert_eq!(viability.reason_code, "ok");
    assert!(viability.offending_outpoints.is_empty());
}

#[tokio::test]
#[ignore = "ASP swept snapshot injection — see file header for fixture vs clean-start setup"]
async fn evaluate_job_viability_reports_asp_swept_targets() {
    if !regtest_enabled() {
        return;
    }

    let endpoints = regtest_endpoints();
    let session = open_boarded_session_or_fixture(&endpoints, DEFAULT_BOARD_SATS).await;

    let candidates = session
        .list_exit_candidates()
        .await
        .expect("exit candidates");
    let candidate = candidates
        .iter()
        .find(|row| row.can_start_unroll)
        .expect("at least one unroll-eligible VTXO");

    session
        .mark_job_target_asp_swept_in_offchain_snapshot_for_tests(&candidate.txid, candidate.vout)
        .expect("inject ASP swept snapshot");

    let outpoint =
        VirtualOutPoint::parse(&candidate.txid, candidate.vout).expect("candidate outpoint");
    let viability = session
        .evaluate_unilateral_exit_job_viability(UnilateralExitProgressParams {
            vtxo_outpoints: vec![outpoint.clone()],
        })
        .await
        .expect("evaluate job viability after ASP sweep injection");

    assert_eq!(
        viability.status,
        UnilateralExitJobViabilityKind::AspSweptTargets
    );
    assert_eq!(viability.reason_code, "asp_swept_targets");
    assert_eq!(viability.offending_outpoints, vec![outpoint]);
}
