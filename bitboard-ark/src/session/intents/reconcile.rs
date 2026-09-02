use ark_client::Blockchain;
use bitcoin::OutPoint;

use crate::api_types::PendingBatchIntentActionParams;
use crate::error::ArkResult;
use crate::persistence::{
    PendingBatchIntentKind, PendingBatchIntentRecord, PendingBatchOutpointRecord,
    pending_batch_record_overlaps_outpoints,
};
use crate::session::ArkSession;

use super::mapping::{latest_pending_record_of_kind, outpoint_record, parse_outpoint_record};

#[derive(Debug)]
pub(super) enum PendingBatchIntentResolution {
    StillPending,
    Spent { spend_txid: String },
    BoardingWindowExpired,
}

struct OnchainOutpointResolution {
    spend_txid: Option<String>,
    boarding_window_expired: bool,
}

impl ArkSession {
    pub(super) fn promote_stranded_processing_intents_if_idle(&self) {
        if !ark_client::is_batch_join_in_flight() {
            let _ = self.wallet_db.promote_stranded_processing_intents();
        }
    }

    /// Drop pending intents whose inputs are spent or whose boarding window has closed.
    /// Returns the spend txid when an intent was finalized this pass.
    pub(crate) async fn reconcile_pending_batch_intents(&self) -> ArkResult<Option<String>> {
        self.promote_stranded_processing_intents_if_idle();
        let pending = self.wallet_db.pending_batch_intents();
        if pending.is_empty() {
            return Ok(None);
        }

        let mut remaining = Vec::new();
        let mut finalized_txid = None;
        for record in pending {
            match self.pending_batch_intent_resolution(&record).await? {
                PendingBatchIntentResolution::StillPending => remaining.push(record),
                PendingBatchIntentResolution::Spent { spend_txid } => {
                    finalized_txid = Some(spend_txid);
                }
                PendingBatchIntentResolution::BoardingWindowExpired => {}
            }
        }
        self.wallet_db.set_pending_batch_intents(remaining);
        Ok(finalized_txid)
    }

    pub(super) async fn pending_batch_intent_resolution(
        &self,
        record: &PendingBatchIntentRecord,
    ) -> ArkResult<PendingBatchIntentResolution> {
        if !record.onchain_outpoints.is_empty() {
            return self.resolve_onchain_pending_intent(record).await;
        }
        if !record.vtxo_outpoints.is_empty() {
            return Ok(resolve_vtxo_pending_intent(
                record,
                self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            ));
        }
        Ok(PendingBatchIntentResolution::StillPending)
    }

    async fn resolve_onchain_pending_intent(
        &self,
        record: &PendingBatchIntentRecord,
    ) -> ArkResult<PendingBatchIntentResolution> {
        let mut per_outpoint = Vec::new();
        for outpoint_record_item in &record.onchain_outpoints {
            let Some(outpoint) = parse_outpoint_record(outpoint_record_item) else {
                continue;
            };
            let spend_status = self
                .client
                .blockchain()
                .get_output_status(&outpoint.txid, outpoint.vout)
                .await?;
            let boarding_window_expired = record.kind == PendingBatchIntentKind::Board
                && spend_status.spend_txid.is_none()
                && self
                    .boarding_outpoint_past_cooperative_window(outpoint)
                    .await?;
            per_outpoint.push(OnchainOutpointResolution {
                spend_txid: spend_status.spend_txid.map(|txid| txid.to_string()),
                boarding_window_expired,
            });
        }
        Ok(resolve_onchain_outputs_status(&per_outpoint, record.kind))
    }

    pub(super) fn find_overlapping_pending_intent(
        &self,
        onchain_outpoints: &[OutPoint],
        vtxo_outpoints: &[OutPoint],
    ) -> Option<PendingBatchIntentRecord> {
        let onchain_records = onchain_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect::<Vec<_>>();
        let vtxo_records = vtxo_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect::<Vec<_>>();
        self.wallet_db
            .pending_batch_intents()
            .into_iter()
            .find(|record| {
                pending_batch_record_overlaps_outpoints(record, &onchain_records, &vtxo_records)
            })
    }

    pub(super) fn find_exact_pending_intent(
        &self,
        params: &PendingBatchIntentActionParams,
    ) -> Option<PendingBatchIntentRecord> {
        self.wallet_db
            .pending_batch_intents()
            .into_iter()
            .find(|record| {
                outpoint_records_equal(&record.onchain_outpoints, &params.onchain_outpoints)
                    && outpoint_records_equal(&record.vtxo_outpoints, &params.vtxo_outpoints)
            })
    }

    pub(crate) fn latest_pending_outpoints_for_kind(
        &self,
        kind: PendingBatchIntentKind,
    ) -> (Vec<OutPoint>, Vec<OutPoint>) {
        let Some(record) = latest_pending_record_of_kind(&self.wallet_db, kind) else {
            return (Vec::new(), Vec::new());
        };
        (
            record
                .onchain_outpoints
                .iter()
                .filter_map(parse_outpoint_record)
                .collect(),
            record
                .vtxo_outpoints
                .iter()
                .filter_map(parse_outpoint_record)
                .collect(),
        )
    }
}

/// Spent only when every probed input is spent (same as VTXO reconcile). Boarding window
/// expires only when none are spent and every input's cooperative window has closed.
fn resolve_onchain_outputs_status(
    per_outpoint: &[OnchainOutpointResolution],
    kind: PendingBatchIntentKind,
) -> PendingBatchIntentResolution {
    if per_outpoint.is_empty() {
        return PendingBatchIntentResolution::StillPending;
    }
    if per_outpoint.iter().all(|item| item.spend_txid.is_some()) {
        return PendingBatchIntentResolution::Spent {
            spend_txid: per_outpoint
                .iter()
                .find_map(|item| item.spend_txid.clone())
                .unwrap_or_default(),
        };
    }
    if kind == PendingBatchIntentKind::Board
        && per_outpoint
            .iter()
            .all(|item| item.spend_txid.is_none() && item.boarding_window_expired)
    {
        return PendingBatchIntentResolution::BoardingWindowExpired;
    }
    PendingBatchIntentResolution::StillPending
}

fn resolve_vtxo_pending_intent(
    record: &PendingBatchIntentRecord,
    snapshot: Option<&crate::persistence::OffchainVtxoSnapshot>,
) -> PendingBatchIntentResolution {
    let Some(snapshot) = snapshot else {
        return PendingBatchIntentResolution::StillPending;
    };

    let mut saw_any = false;
    let mut all_spent = true;
    let mut spend_txid = None;
    for pending_outpoint in &record.vtxo_outpoints {
        let Some(row) = snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|row| row.txid == pending_outpoint.txid && row.vout == pending_outpoint.vout)
        else {
            continue;
        };
        saw_any = true;
        if row.is_spent || row.settled_by.is_some() {
            spend_txid = row
                .settled_by
                .clone()
                .or_else(|| row.spent_by.clone())
                .or(spend_txid);
            continue;
        }
        all_spent = false;
    }

    if saw_any && all_spent {
        PendingBatchIntentResolution::Spent {
            spend_txid: spend_txid.unwrap_or_default(),
        }
    } else {
        PendingBatchIntentResolution::StillPending
    }
}

fn outpoint_records_equal(
    left: &[PendingBatchOutpointRecord],
    right: &[crate::api_types::PendingBatchOutpointDto],
) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter().all(|left_item| {
        right.iter().any(|right_item| {
            left_item.txid == right_item.txid && left_item.vout == right_item.vout
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::PendingBatchIntentLifecyclePhase;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn sample_outpoint(byte: u8, vout: u32) -> OutPoint {
        OutPoint {
            txid: Txid::from_byte_array([byte; 32]),
            vout,
        }
    }

    #[test]
    fn reconcile_clears_pending_boarding_intent_when_outpoint_spent() {
        match resolve_onchain_outputs_status(
            &[OnchainOutpointResolution {
                spend_txid: Some("commitment-txid".into()),
                boarding_window_expired: false,
            }],
            PendingBatchIntentKind::Board,
        ) {
            PendingBatchIntentResolution::Spent { spend_txid } => {
                assert_eq!(spend_txid, "commitment-txid");
            }
            other => panic!("expected spent, got {other:?}"),
        }
    }

    #[test]
    fn resolve_onchain_outputs_spent_only_when_all_inputs_spent() {
        match resolve_onchain_outputs_status(
            &[
                OnchainOutpointResolution {
                    spend_txid: Some("commitment-a".into()),
                    boarding_window_expired: false,
                },
                OnchainOutpointResolution {
                    spend_txid: Some("commitment-a".into()),
                    boarding_window_expired: false,
                },
            ],
            PendingBatchIntentKind::Board,
        ) {
            PendingBatchIntentResolution::Spent { spend_txid } => {
                assert_eq!(spend_txid, "commitment-a");
            }
            other => panic!("expected spent, got {other:?}"),
        }
    }

    #[test]
    fn resolve_onchain_outputs_still_pending_when_mixed_spent() {
        assert!(matches!(
            resolve_onchain_outputs_status(
                &[
                    OnchainOutpointResolution {
                        spend_txid: Some("commitment-a".into()),
                        boarding_window_expired: false,
                    },
                    OnchainOutpointResolution {
                        spend_txid: None,
                        boarding_window_expired: false,
                    },
                ],
                PendingBatchIntentKind::Board,
            ),
            PendingBatchIntentResolution::StillPending
        ));
    }

    #[test]
    fn resolve_onchain_outputs_boarding_expired_only_when_all_windows_expired() {
        assert!(matches!(
            resolve_onchain_outputs_status(
                &[
                    OnchainOutpointResolution {
                        spend_txid: None,
                        boarding_window_expired: true,
                    },
                    OnchainOutpointResolution {
                        spend_txid: None,
                        boarding_window_expired: true,
                    },
                ],
                PendingBatchIntentKind::Board,
            ),
            PendingBatchIntentResolution::BoardingWindowExpired
        ));
        assert!(matches!(
            resolve_onchain_outputs_status(
                &[
                    OnchainOutpointResolution {
                        spend_txid: None,
                        boarding_window_expired: true,
                    },
                    OnchainOutpointResolution {
                        spend_txid: None,
                        boarding_window_expired: false,
                    },
                ],
                PendingBatchIntentKind::Board,
            ),
            PendingBatchIntentResolution::StillPending
        ));
    }

    #[test]
    fn vtxo_pending_intent_clears_when_snapshot_marks_spent() {
        let outpoint = sample_outpoint(0xaa, 0);
        let record = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Recover,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: Vec::new(),
            vtxo_outpoints: vec![outpoint_record(outpoint)],
            amount_sats: 12_000,
            registered_at: 1,
            destination_address: None,
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
        };
        let snapshot = crate::persistence::OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![crate::persistence::VirtualTxOutPointRecord {
                txid: outpoint.txid.to_string(),
                vout: 0,
                created_at: 1,
                expires_at: 2,
                amount_sats: 12_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: true,
                spent_by: Some("commitment".into()),
                commitment_txids: Vec::new(),
                settled_by: None,
                ark_txid: None,
                assets: Vec::new(),
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_leaf_tx: Default::default(),
        };
        match resolve_vtxo_pending_intent(&record, Some(&snapshot)) {
            PendingBatchIntentResolution::Spent { spend_txid } => {
                assert_eq!(spend_txid, "commitment");
            }
            other => panic!("expected spent, got {other:?}"),
        }
    }
}
