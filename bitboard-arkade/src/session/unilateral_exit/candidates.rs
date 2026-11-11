use std::collections::{BTreeMap, HashMap, HashSet};

use ark_client::Blockchain;
use ark_core::server::VirtualTxOutPoint;
use ark_core::{ExplorerUtxo, Vtxo};
use bitcoin::ScriptBuf;

use crate::api_types::{ExitCandidateDto, UnilateralExitInProgressDto, VirtualStatusState};
use crate::error::ArkResult;
use crate::exit_balance::{
    UnilateralExitOutpointKey, exit_outpoint_key, exit_outpoint_key_from_str,
};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::persistence::{VirtualTxOutPointRecord, VtxoExitPhase, VtxoExitRecord};
use crate::session::unilateral_exit::vtxo_exit::{
    mark_record_complete_ready, parse_vtxo_exit_record_key, unilateral_exit_pipeline_outpoints,
};

use super::snapshot_ops::{
    autonomous_exit_candidates_from_snapshot, autonomous_vtxo_list_and_script_map,
};
use super::topology::filter_exit_candidates_to_terminal_leaves;
use crate::session::ArkadeSession;
use crate::session::mappers::{map_exit_candidate, unilateral_exit_timelock_parts, wasm_safe_now};

/// Chain progress toward the operator CSV for the in-progress list.
///
/// A time lock uses the same comparison as `Vtxo::can_be_claimed_unilaterally_by_owner`
/// once a confirmation timestamp is known: claimable strictly after confirmation plus delay.
/// A time lock with no confirmation timestamp has not started, so the row stays waiting
/// and is not stamped `CompleteReady`. Completion coin-select still treats a missing
/// blocktime as `Duration::ZERO` (ARK-EXIT-04).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CsvTimelockProgress {
    pub can_complete: bool,
    pub ready_at_unix_seconds: Option<u64>,
    pub confirmations_remaining: Option<u64>,
}

impl CsvTimelockProgress {
    fn waiting_without_schedule() -> Self {
        Self {
            can_complete: false,
            ready_at_unix_seconds: None,
            confirmations_remaining: None,
        }
    }

    fn claimable() -> Self {
        Self {
            can_complete: true,
            ready_at_unix_seconds: None,
            confirmations_remaining: None,
        }
    }
}

pub(crate) fn csv_timelock_progress(
    now_seconds: u64,
    confirmation_blocktime_seconds: Option<u64>,
    confirmations: u64,
    exit_delay: bitcoin::Sequence,
) -> CsvTimelockProgress {
    let (timelock_blocks, timelock_seconds) = unilateral_exit_timelock_parts(exit_delay);
    if let Some(blocks) = timelock_blocks {
        return block_csv_timelock_progress(confirmations, u64::from(blocks));
    }
    if let Some(seconds) = timelock_seconds {
        return time_csv_timelock_progress(now_seconds, confirmation_blocktime_seconds, seconds);
    }
    CsvTimelockProgress::waiting_without_schedule()
}

fn block_csv_timelock_progress(confirmations: u64, required: u64) -> CsvTimelockProgress {
    if confirmations >= required {
        return CsvTimelockProgress::claimable();
    }
    CsvTimelockProgress {
        can_complete: false,
        ready_at_unix_seconds: None,
        confirmations_remaining: Some(required - confirmations),
    }
}

fn time_csv_timelock_progress(
    now_seconds: u64,
    confirmation_blocktime_seconds: Option<u64>,
    timelock_seconds: u64,
) -> CsvTimelockProgress {
    let Some(blocktime_seconds) = confirmation_blocktime_seconds else {
        return CsvTimelockProgress::waiting_without_schedule();
    };
    let ready_at_unix_seconds = blocktime_seconds.saturating_add(timelock_seconds);
    if now_seconds > ready_at_unix_seconds {
        return CsvTimelockProgress::claimable();
    }
    CsvTimelockProgress {
        can_complete: false,
        ready_at_unix_seconds: Some(ready_at_unix_seconds),
        confirmations_remaining: None,
    }
}

fn earlier_csv_wait(
    current: Option<CsvTimelockProgress>,
    candidate: CsvTimelockProgress,
) -> CsvTimelockProgress {
    let Some(current) = current else {
        return candidate;
    };
    if csv_wait_is_sooner(&candidate, &current) {
        candidate
    } else {
        current
    }
}

fn csv_wait_is_sooner(candidate: &CsvTimelockProgress, current: &CsvTimelockProgress) -> bool {
    match (
        candidate.ready_at_unix_seconds,
        current.ready_at_unix_seconds,
    ) {
        (Some(candidate_ready), Some(current_ready)) => candidate_ready < current_ready,
        (Some(_), None) => true,
        (None, Some(_)) => false,
        (None, None) => fewer_confirmations_remaining(candidate, current),
    }
}

fn fewer_confirmations_remaining(
    candidate: &CsvTimelockProgress,
    current: &CsvTimelockProgress,
) -> bool {
    match (
        candidate.confirmations_remaining,
        current.confirmations_remaining,
    ) {
        (Some(candidate_remaining), Some(current_remaining)) => {
            candidate_remaining < current_remaining
        }
        (Some(_), None) => true,
        _ => false,
    }
}

async fn vtxo_claimable_for_unilateral_completion(
    session: &ArkadeSession,
    vtxo: &Vtxo,
) -> ArkResult<CsvTimelockProgress> {
    let outpoints = session
        .client
        .blockchain()
        .find_outpoints(vtxo.address())
        .await?;
    let now_seconds = wasm_safe_now().as_secs();
    let mut earliest_wait: Option<CsvTimelockProgress> = None;
    for explorer_utxo in outpoints {
        let ExplorerUtxo {
            confirmation_blocktime,
            confirmations,
            is_spent: false,
            ..
        } = explorer_utxo
        else {
            continue;
        };
        let progress = csv_timelock_progress(
            now_seconds,
            confirmation_blocktime,
            confirmations,
            vtxo.exit_delay(),
        );
        if progress.can_complete {
            return Ok(CsvTimelockProgress::claimable());
        }
        earliest_wait = Some(earlier_csv_wait(earliest_wait, progress));
    }
    Ok(earliest_wait.unwrap_or_else(CsvTimelockProgress::waiting_without_schedule))
}

async fn resolve_vtxo_completion_claimable(
    session: &ArkadeSession,
    virtual_tx_outpoint: &VirtualTxOutPoint,
    operator_script_map: &HashMap<ScriptBuf, Vtxo>,
    offchain_script_map: &HashMap<ScriptBuf, Vtxo>,
) -> ArkResult<CsvTimelockProgress> {
    let vtxo = operator_script_map
        .get(&virtual_tx_outpoint.script)
        .or_else(|| offchain_script_map.get(&virtual_tx_outpoint.script));
    let Some(vtxo) = vtxo else {
        return Ok(CsvTimelockProgress::waiting_without_schedule());
    };
    vtxo_claimable_for_unilateral_completion(session, vtxo).await
}

fn snapshot_record_ready_for_completion(
    record: &crate::persistence::VirtualTxOutPointRecord,
) -> bool {
    record.is_unrolled && !record.is_spent
}

/// A claimed exit is `is_spent` on the snapshot but the exit record can still be `unrolled`.
/// Those rows are not waiting to be completed.
fn outpoint_is_spent_for_completion(
    operator_vtxo: Option<&VirtualTxOutPoint>,
    snapshot_record: Option<&VirtualTxOutPointRecord>,
) -> bool {
    operator_vtxo.is_some_and(|virtual_tx_outpoint| virtual_tx_outpoint.is_spent)
        || snapshot_record.is_some_and(|record| record.is_spent)
}

/// Move pipeline records to `exited` when the snapshot already shows the outpoint spent.
///
/// Returns whether any record changed, so the caller can persist.
pub(crate) fn note_spent_pipeline_records_exited(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    snapshot_records: &[VirtualTxOutPointRecord],
) -> bool {
    let mut changed = false;
    for (key, record) in records.iter_mut() {
        if !record.phase.is_pipeline() {
            continue;
        }
        let Some((txid, vout)) = parse_vtxo_exit_record_key(key) else {
            continue;
        };
        let spent = snapshot_records.iter().any(|snapshot_record| {
            snapshot_record.txid == txid && snapshot_record.vout == vout && snapshot_record.is_spent
        });
        if !spent {
            continue;
        }
        record.phase = VtxoExitPhase::Exited;
        changed = true;
    }
    changed
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ClaimabilityStatus {
    can_complete: bool,
    stamped_complete_ready: bool,
    csv_ready_at_unix_seconds: Option<u64>,
    csv_confirmations_remaining: Option<u64>,
}

impl ClaimabilityStatus {
    const ALREADY_COMPLETE_READY: Self = Self {
        can_complete: true,
        stamped_complete_ready: false,
        csv_ready_at_unix_seconds: None,
        csv_confirmations_remaining: None,
    };
    const NOT_ELIGIBLE: Self = Self {
        can_complete: false,
        stamped_complete_ready: false,
        csv_ready_at_unix_seconds: None,
        csv_confirmations_remaining: None,
    };
}

fn stamp_complete_ready_when_claimable(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    key: &str,
    progress: CsvTimelockProgress,
) -> ClaimabilityStatus {
    if progress.can_complete
        && let Some(record) = records.get_mut(key)
    {
        mark_record_complete_ready(record);
        return ClaimabilityStatus {
            can_complete: true,
            stamped_complete_ready: true,
            csv_ready_at_unix_seconds: None,
            csv_confirmations_remaining: None,
        };
    }
    ClaimabilityStatus {
        can_complete: progress.can_complete,
        stamped_complete_ready: false,
        csv_ready_at_unix_seconds: progress.ready_at_unix_seconds,
        csv_confirmations_remaining: progress.confirmations_remaining,
    }
}

fn phase_shown_for_in_progress_row(
    records: &BTreeMap<String, VtxoExitRecord>,
    key: &str,
    phase_before_overlay: VtxoExitPhase,
) -> VtxoExitPhase {
    records
        .get(key)
        .map(|record| record.phase)
        .unwrap_or(phase_before_overlay)
}

async fn overlay_complete_ready_if_claimable(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    key: &str,
    phase: VtxoExitPhase,
    eligible_for_probe: bool,
    claimable: impl std::future::Future<Output = ArkResult<CsvTimelockProgress>>,
) -> ArkResult<ClaimabilityStatus> {
    if phase == VtxoExitPhase::CompleteReady {
        return Ok(ClaimabilityStatus::ALREADY_COMPLETE_READY);
    }
    if !eligible_for_probe {
        return Ok(ClaimabilityStatus::NOT_ELIGIBLE);
    }
    let progress = claimable.await?;
    Ok(stamp_complete_ready_when_claimable(records, key, progress))
}

struct InProgressCoin {
    txid: String,
    vout: u32,
    amount_sats: u64,
    virtual_status_state: VirtualStatusState,
}

fn pipeline_in_progress_row(
    coin: InProgressCoin,
    phase: VtxoExitPhase,
    tagged_at: i64,
    claimability: ClaimabilityStatus,
) -> UnilateralExitInProgressDto {
    UnilateralExitInProgressDto {
        id: format!("{}:{}", coin.txid, coin.vout),
        txid: coin.txid,
        vout: coin.vout,
        amount_sats: coin.amount_sats,
        virtual_status_state: coin.virtual_status_state,
        can_complete: claimability.can_complete,
        started_at: Some(tagged_at),
        phase: Some(phase),
        csv_ready_at_unix_seconds: claimability.csv_ready_at_unix_seconds,
        csv_confirmations_remaining: claimability.csv_confirmations_remaining,
    }
}

struct InProgressRowLookups<'a> {
    session: &'a ArkadeSession,
    operator_by_outpoint: &'a HashMap<UnilateralExitOutpointKey, &'a VirtualTxOutPoint>,
    snapshot_records: &'a [VirtualTxOutPointRecord],
    operator_script_map: &'a HashMap<ScriptBuf, Vtxo>,
    offchain_script_map: &'a HashMap<ScriptBuf, Vtxo>,
    dust: bitcoin::Amount,
}

async fn overlay_in_progress_row_for_record(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    key: &str,
    record: &VtxoExitRecord,
    lookups: &InProgressRowLookups<'_>,
) -> ArkResult<Option<(UnilateralExitInProgressDto, bool)>> {
    let Some((txid, vout)) = parse_vtxo_exit_record_key(key) else {
        return Ok(None);
    };
    let Some(outpoint) = exit_outpoint_key_from_str(&txid, vout) else {
        return Ok(None);
    };
    let phase = record.phase;
    let operator_vtxo = lookups.operator_by_outpoint.get(&outpoint).copied();
    let snapshot_record = lookups
        .snapshot_records
        .iter()
        .find(|snapshot_record| snapshot_record.txid == txid && snapshot_record.vout == vout);
    if outpoint_is_spent_for_completion(operator_vtxo, snapshot_record) {
        return Ok(None);
    }
    if let Some(virtual_tx_outpoint) = operator_vtxo {
        let candidate = map_exit_candidate(virtual_tx_outpoint, lookups.dust);
        let claimability = overlay_complete_ready_if_claimable(
            records,
            key,
            phase,
            candidate.can_complete || phase == VtxoExitPhase::Unrolled,
            resolve_vtxo_completion_claimable(
                lookups.session,
                virtual_tx_outpoint,
                lookups.operator_script_map,
                lookups.offchain_script_map,
            ),
        )
        .await?;
        return Ok(Some((
            pipeline_in_progress_row(
                InProgressCoin {
                    txid: candidate.txid,
                    vout: candidate.vout,
                    amount_sats: candidate.amount_sats,
                    virtual_status_state: candidate.virtual_status_state,
                },
                phase_shown_for_in_progress_row(records, key, phase),
                record.tagged_at,
                claimability,
            ),
            claimability.stamped_complete_ready,
        )));
    }

    if let Some(snapshot_record) = snapshot_record {
        let virtual_status_state = VirtualStatusState::from_spent_and_unrolled(
            snapshot_record.is_spent,
            snapshot_record.is_unrolled,
        );
        let claimability = overlay_complete_ready_if_claimable(
            records,
            key,
            phase,
            snapshot_record_ready_for_completion(snapshot_record),
            async {
                match virtual_tx_outpoint_from_record(snapshot_record) {
                    Ok(virtual_tx_outpoint) => {
                        resolve_vtxo_completion_claimable(
                            lookups.session,
                            &virtual_tx_outpoint,
                            lookups.operator_script_map,
                            lookups.offchain_script_map,
                        )
                        .await
                    }
                    Err(_) => Ok(CsvTimelockProgress::waiting_without_schedule()),
                }
            },
        )
        .await?;
        return Ok(Some((
            pipeline_in_progress_row(
                InProgressCoin {
                    txid,
                    vout,
                    amount_sats: snapshot_record.amount_sats,
                    virtual_status_state,
                },
                phase_shown_for_in_progress_row(records, key, phase),
                record.tagged_at,
                claimability,
            ),
            claimability.stamped_complete_ready,
        )));
    }

    let claimability = if phase == VtxoExitPhase::CompleteReady {
        ClaimabilityStatus::ALREADY_COMPLETE_READY
    } else {
        ClaimabilityStatus::NOT_ELIGIBLE
    };
    Ok(Some((
        pipeline_in_progress_row(
            InProgressCoin {
                txid,
                vout,
                amount_sats: record.amount_sats,
                virtual_status_state: VirtualStatusState::Unrolled,
            },
            phase,
            record.tagged_at,
            claimability,
        ),
        claimability.stamped_complete_ready,
    )))
}

impl ArkadeSession {
    pub(crate) fn unilateral_exit_in_progress_outpoints(
        &self,
    ) -> ArkResult<HashSet<UnilateralExitOutpointKey>> {
        Ok(self.pipeline_outpoints())
    }

    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateDto>> {
        let start_excluded = self.start_list_excluded_outpoints();
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let rows = autonomous_exit_candidates_from_snapshot(self, &start_excluded)?;
        filter_exit_candidates_to_terminal_leaves(snapshot.as_ref(), rows)
    }

    pub async fn list_unilateral_exits_in_progress(
        &self,
    ) -> ArkResult<Vec<UnilateralExitInProgressDto>> {
        self.reconcile_host_tx_finality().await?;
        let mut records = self.wallet_db.vtxo_exit_records();
        let in_progress = unilateral_exit_pipeline_outpoints(&records);
        if in_progress.is_empty() {
            return Ok(Vec::new());
        }

        let (vtxo_list, script_pubkey_to_vtxo) = autonomous_vtxo_list_and_script_map(self)?;
        let offchain_script_map = self.offchain_script_map().unwrap_or_default();
        let dust = self.client.server_info_snapshot()?.dust;
        let operator_by_outpoint: HashMap<UnilateralExitOutpointKey, _> = vtxo_list
            .all()
            .map(|virtual_tx_outpoint| {
                (
                    exit_outpoint_key(
                        virtual_tx_outpoint.outpoint.txid,
                        virtual_tx_outpoint.outpoint.vout,
                    ),
                    virtual_tx_outpoint,
                )
            })
            .collect();

        let wallet_snapshot = self.wallet_db.snapshot();
        let snapshot_records = wallet_snapshot
            .offchain_vtxo_snapshot
            .as_ref()
            .map(|snapshot| snapshot.virtual_tx_outpoints.as_slice())
            .unwrap_or(&[]);
        if note_spent_pipeline_records_exited(&mut records, snapshot_records) {
            self.wallet_db.set_vtxo_exit_records(records.clone());
        }

        let lookups = InProgressRowLookups {
            session: self,
            operator_by_outpoint: &operator_by_outpoint,
            snapshot_records,
            operator_script_map: &script_pubkey_to_vtxo,
            offchain_script_map: &offchain_script_map,
            dust,
        };
        let mut rows = Vec::with_capacity(in_progress.len());
        let mut stamped_complete_ready = false;
        let pipeline_keys: Vec<String> = records
            .iter()
            .filter(|(_, record)| record.phase.is_pipeline())
            .map(|(key, _)| key.clone())
            .collect();
        for key in pipeline_keys {
            let Some(record) = records.get(&key).cloned() else {
                continue;
            };
            let Some((row, stamped)) =
                overlay_in_progress_row_for_record(&mut records, &key, &record, &lookups).await?
            else {
                continue;
            };
            stamped_complete_ready |= stamped;
            rows.push(row);
        }

        if stamped_complete_ready {
            self.wallet_db.set_vtxo_exit_records(records);
        }

        rows.sort_by(|left, right| {
            left.started_at
                .unwrap_or(i64::MAX)
                .cmp(&right.started_at.unwrap_or(i64::MAX))
                .then_with(|| left.txid.cmp(&right.txid))
                .then_with(|| left.vout.cmp(&right.vout))
        });
        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{VirtualTxOutPointRecord, VtxoExitRecord, vtxo_exit_record_key};

    fn unrolled_record() -> VtxoExitRecord {
        VtxoExitRecord {
            phase: VtxoExitPhase::Unrolled,
            tagged_at: 1,
            host_txid: "aa".repeat(32),
            amount_sats: 50_000,
        }
    }

    fn spent_snapshot_record(txid: &str, vout: u32) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: txid.to_string(),
            vout,
            created_at: 0,
            expires_at: 9_999_999_999,
            amount_sats: 50_000,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: true,
            is_spent: true,
            spent_by: Some("bb".repeat(32)),
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }
    }

    #[test]
    fn spent_pipeline_record_becomes_exited_and_leaves_the_complete_list() {
        let txid = "aa".repeat(32);
        let key = vtxo_exit_record_key(&txid, 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);

        assert!(note_spent_pipeline_records_exited(
            &mut records,
            &[spent_snapshot_record(&txid, 0)],
        ));
        assert_eq!(records[&key].phase, VtxoExitPhase::Exited);
        assert!(!records[&key].phase.is_pipeline());
        assert!(outpoint_is_spent_for_completion(
            None,
            Some(&spent_snapshot_record(&txid, 0)),
        ));
    }

    #[test]
    fn unspent_unrolled_record_stays_on_the_complete_list() {
        let txid = "aa".repeat(32);
        let key = vtxo_exit_record_key(&txid, 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);
        let mut snapshot_record = spent_snapshot_record(&txid, 0);
        snapshot_record.is_spent = false;
        snapshot_record.spent_by = None;

        assert!(!note_spent_pipeline_records_exited(
            &mut records,
            &[snapshot_record.clone()],
        ));
        assert_eq!(records[&key].phase, VtxoExitPhase::Unrolled);
        assert!(!outpoint_is_spent_for_completion(
            None,
            Some(&snapshot_record),
        ));
    }

    #[test]
    fn overlay_complete_ready_stamps_unrolled_when_claimable() {
        let key = vtxo_exit_record_key(&"aa".repeat(32), 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);

        let claimability = stamp_complete_ready_when_claimable(
            &mut records,
            &key,
            CsvTimelockProgress::claimable(),
        );

        assert!(claimability.can_complete);
        assert!(claimability.stamped_complete_ready);
        assert_eq!(records[&key].phase, VtxoExitPhase::CompleteReady);
    }

    #[test]
    fn overlay_complete_ready_leaves_unrolled_when_not_claimable() {
        let key = vtxo_exit_record_key(&"aa".repeat(32), 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);

        let claimability = stamp_complete_ready_when_claimable(
            &mut records,
            &key,
            CsvTimelockProgress::waiting_without_schedule(),
        );

        assert!(!claimability.can_complete);
        assert!(!claimability.stamped_complete_ready);
        assert_eq!(records[&key].phase, VtxoExitPhase::Unrolled);
    }

    #[test]
    fn pipeline_in_progress_row_uses_outpoint_id() {
        let row = pipeline_in_progress_row(
            InProgressCoin {
                txid: "aa".repeat(32),
                vout: 1,
                amount_sats: 50_000,
                virtual_status_state: VirtualStatusState::Unrolled,
            },
            VtxoExitPhase::CompleteReady,
            42,
            ClaimabilityStatus::ALREADY_COMPLETE_READY,
        );
        assert_eq!(row.id, format!("{}:1", "aa".repeat(32)));
        assert_eq!(row.vout, 1);
        assert!(row.can_complete);
        assert_eq!(row.started_at, Some(42));
        assert_eq!(row.phase, Some(VtxoExitPhase::CompleteReady));
        assert_eq!(row.csv_ready_at_unix_seconds, None);
    }

    #[test]
    fn time_csv_reports_ready_at_until_the_second_after_confirmation_plus_delay() {
        let delay = bitcoin::Sequence::from_seconds_ceil(2_040).unwrap();
        let (_, timelock_seconds) = crate::session::mappers::unilateral_exit_timelock_parts(delay);
        let timelock_seconds = timelock_seconds.expect("time lock");
        let confirmed_at = 1_700_000_000;

        let waiting = csv_timelock_progress(
            confirmed_at + timelock_seconds,
            Some(confirmed_at),
            40,
            delay,
        );
        assert!(!waiting.can_complete);
        assert_eq!(
            waiting.ready_at_unix_seconds,
            Some(confirmed_at + timelock_seconds),
        );

        let elapsed = csv_timelock_progress(
            confirmed_at + timelock_seconds + 1,
            Some(confirmed_at),
            40,
            delay,
        );
        assert!(elapsed.can_complete);
        assert_eq!(elapsed.ready_at_unix_seconds, None);
    }

    #[test]
    fn missing_blocktime_stays_waiting_and_does_not_stamp_complete_ready() {
        let delay = bitcoin::Sequence::from_seconds_ceil(2_040).unwrap();
        let progress = csv_timelock_progress(1_700_000_000, None, 40, delay);
        assert!(!progress.can_complete);
        assert_eq!(progress.ready_at_unix_seconds, None);
        assert_eq!(progress.confirmations_remaining, None);

        let key = vtxo_exit_record_key(&"aa".repeat(32), 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);
        let claimability = stamp_complete_ready_when_claimable(&mut records, &key, progress);
        assert!(!claimability.can_complete);
        assert!(!claimability.stamped_complete_ready);
        assert_eq!(records[&key].phase, VtxoExitPhase::Unrolled);
    }

    #[test]
    fn block_csv_reports_confirmations_still_required() {
        let delay = bitcoin::Sequence::from_height(34);
        let waiting = csv_timelock_progress(0, None, 10, delay);
        assert!(!waiting.can_complete);
        assert_eq!(waiting.confirmations_remaining, Some(24));

        let ready = csv_timelock_progress(0, None, 34, delay);
        assert!(ready.can_complete);
        assert_eq!(ready.confirmations_remaining, None);
    }

    #[test]
    fn stamped_complete_ready_is_the_phase_shown_on_the_complete_list() {
        let key = vtxo_exit_record_key(&"aa".repeat(32), 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);
        stamp_complete_ready_when_claimable(&mut records, &key, CsvTimelockProgress::claimable());

        assert_eq!(
            phase_shown_for_in_progress_row(&records, &key, VtxoExitPhase::Unrolled),
            VtxoExitPhase::CompleteReady,
        );
    }
}
