use std::collections::HashSet;
use std::str::FromStr;

use bitcoin::Txid;

use crate::persistence::{JsonPersistenceDb, PendingExitKind, UnilateralExitWatchRecord};

use super::mappers::current_unix_timestamp;

pub(crate) fn register_unilateral_exit_watch(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    vout: u32,
    amount_sats: u64,
) {
    wallet_db.upsert_unilateral_exit_watch(UnilateralExitWatchRecord {
        vtxo_txid: txid.to_string(),
        vout,
        amount_sats,
        registered_at: current_unix_timestamp(),
        published_vtxo_txid: None,
        branch_txids: Vec::new(),
    });
}

pub(crate) fn enrich_unilateral_exit_watch_after_unroll(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    vout: u32,
    published_vtxo_txid: &str,
    branch_txids: &[Txid],
) {
    let amount_sats = wallet_db
        .unilateral_exit_watches()
        .into_iter()
        .find(|watch| watch.vtxo_txid == txid && watch.vout == vout)
        .map(|watch| watch.amount_sats)
        .unwrap_or(0);
    wallet_db.upsert_unilateral_exit_watch(UnilateralExitWatchRecord {
        vtxo_txid: txid.to_string(),
        vout,
        amount_sats,
        registered_at: current_unix_timestamp(),
        published_vtxo_txid: Some(published_vtxo_txid.to_string()),
        branch_txids: branch_txids
            .iter()
            .map(|branch_txid| branch_txid.to_string())
            .collect(),
    });
}

pub(crate) fn remove_unilateral_exit_watch_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    vout: u32,
) {
    wallet_db.remove_unilateral_exit_watch(txid, vout);
}

pub(crate) fn remove_unilateral_exit_watches_for_outpoints_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    outpoints: &HashSet<bitcoin::OutPoint>,
) {
    wallet_db.remove_unilateral_exit_watches_for_outpoints(outpoints);
}

/// Seed watches from snapshot exiting rows and pending unilateral records when upgrading mid-exit.
pub(crate) fn backfill_unilateral_exit_watches_if_empty(wallet_db: &JsonPersistenceDb) {
    if !wallet_db.unilateral_exit_watches().is_empty() {
        return;
    }

    let wallet_snapshot = wallet_db.snapshot();
    let mut seeded: Vec<UnilateralExitWatchRecord> = Vec::new();
    let mut seen = HashSet::new();

    if let Some(snapshot) = wallet_snapshot.offchain_vtxo_snapshot.as_ref() {
        for record in &snapshot.virtual_tx_outpoints {
            if !record.is_unrolled || record.is_spent {
                continue;
            }
            let key = (record.txid.clone(), record.vout);
            if seen.insert(key) {
                seeded.push(UnilateralExitWatchRecord {
                    vtxo_txid: record.txid.clone(),
                    vout: record.vout,
                    amount_sats: record.amount_sats,
                    registered_at: current_unix_timestamp(),
                    published_vtxo_txid: None,
                    branch_txids: Vec::new(),
                });
            }
        }
    }

    for pending in &wallet_snapshot.pending_exit_deductions {
        if pending.kind != PendingExitKind::Unilateral {
            continue;
        }
        let Some(txid) = pending.vtxo_txid.as_deref() else {
            continue;
        };
        let vout = pending.vout.unwrap_or(0);
        if seen.insert((txid.to_string(), vout)) {
            seeded.push(UnilateralExitWatchRecord {
                vtxo_txid: txid.to_string(),
                vout,
                amount_sats: pending.amount_sats,
                registered_at: pending.started_at,
                published_vtxo_txid: None,
                branch_txids: Vec::new(),
            });
        }
    }

    if !seeded.is_empty() {
        wallet_db.set_unilateral_exit_watches(seeded);
    }
}

pub(crate) fn parse_branch_txids(watch: &UnilateralExitWatchRecord) -> Vec<Txid> {
    watch
        .branch_txids
        .iter()
        .filter_map(|txid| Txid::from_str(txid).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{
        OffchainVtxoSnapshot, PendingExitDeductionRecord, VirtualTxOutPointRecord,
    };
    use bitcoin::hashes::Hash;

    #[test]
    fn backfill_seeds_watch_from_snapshot_exiting() {
        let wallet_db = JsonPersistenceDb::default();
        let txid = Txid::from_byte_array([0x77; 32]).to_string();
        wallet_db.set_offchain_vtxo_snapshot(OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
                unilateral_exit_materials: None,
            }],
        });

        backfill_unilateral_exit_watches_if_empty(&wallet_db);
        let watches = wallet_db.unilateral_exit_watches();
        assert_eq!(watches.len(), 1);
        assert_eq!(watches[0].vtxo_txid, txid);
        assert_eq!(watches[0].amount_sats, 50_000);
    }

    #[test]
    fn backfill_seeds_watch_from_pending_unilateral() {
        let wallet_db = JsonPersistenceDb::default();
        let txid = "aa".repeat(32);
        wallet_db.upsert_pending_exit_deduction(PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some(txid.clone()),
            vout: Some(1),
            amount_sats: 25_000,
            started_at: 42,
            baseline_offchain_spendable_sats: None,
        });

        backfill_unilateral_exit_watches_if_empty(&wallet_db);
        let watches = wallet_db.unilateral_exit_watches();
        assert_eq!(watches.len(), 1);
        assert_eq!(watches[0].vout, 1);
        assert_eq!(watches[0].registered_at, 42);
    }
}
