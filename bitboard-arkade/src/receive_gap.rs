use std::collections::{HashMap, HashSet};

use serde::Serialize;

/// Numbers for the Arkade receive card. `batch_gap` is for the index Generate would reveal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OffchainReceiveGapReading {
    pub revealed: bool,
    pub index: u32,
    pub receive_count: u32,
    pub gap: u32,
    /// Batch gap of the index Generate would reveal.
    pub batch_gap: u32,
    /// Batch gap of the address on screen. 2 or more means a seed restore will not ask about it.
    pub displayed_batch_gap: u32,
    pub snapshot_present: bool,
}

/// Index gap and batch gap from the keys already known to be used.
///
/// `next_index` is the index `KeypairIndex::New` would assign. `0` means the page is only
/// peeking index 0. `batch_size` is the discovery batch, 20 in production.
pub fn describe_offchain_receive_gap(
    next_index: u32,
    used_indices: &HashSet<u32>,
    receive_count: u32,
    batch_size: u32,
    snapshot_present: bool,
) -> OffchainReceiveGapReading {
    let last_hit = last_hit_batch(used_indices, batch_size);
    if next_index == 0 {
        return OffchainReceiveGapReading {
            revealed: false,
            index: 0,
            receive_count,
            gap: 0,
            batch_gap: batch_gap_for_index(0, last_hit, batch_size),
            displayed_batch_gap: batch_gap_for_index(0, last_hit, batch_size),
            snapshot_present,
        };
    }
    let index = next_index - 1;
    let gap = match used_indices.iter().copied().max() {
        Some(last_used) => index.saturating_sub(last_used),
        None => index.saturating_add(1),
    };
    OffchainReceiveGapReading {
        revealed: true,
        index,
        receive_count,
        gap,
        batch_gap: batch_gap_for_index(next_index, last_hit, batch_size),
        displayed_batch_gap: batch_gap_for_index(index, last_hit, batch_size),
        snapshot_present,
    }
}

/// Highest batch that contains a used key before the first empty batch, or -1 when batch 0 is empty.
///
/// A later used key that sits behind that empty batch is ignored. `discover_keys` stops there.
fn last_hit_batch(used_indices: &HashSet<u32>, batch_size: u32) -> i64 {
    if batch_size == 0 {
        return -1;
    }
    let mut batch: u32 = 0;
    let mut last_hit: i64 = -1;
    loop {
        let start = batch.saturating_mul(batch_size);
        let end = start.saturating_add(batch_size);
        let hit = used_indices
            .iter()
            .any(|index| *index >= start && *index < end);
        if !hit {
            return last_hit;
        }
        last_hit = i64::from(batch);
        let Some(next_batch) = batch.checked_add(1) else {
            return last_hit;
        };
        batch = next_batch;
    }
}

fn batch_gap_for_index(index: u32, last_hit_batch: i64, batch_size: u32) -> u32 {
    if batch_size == 0 {
        return 0;
    }
    let index_batch = i64::from(index / batch_size);
    let distance = index_batch - last_hit_batch;
    if distance <= 0 {
        0
    } else {
        u32::try_from(distance).unwrap_or(u32::MAX)
    }
}

/// Keys whose candidate script appears in the snapshot or in an already loaded unspent boarding output.
///
/// `vtxo_script_hexes` includes spent rows. The caller does not filter them out.
pub fn used_key_indices(
    offchain_script_to_index: &HashMap<String, u32>,
    vtxo_script_hexes: &[String],
    boarding_script_to_index: &HashMap<String, u32>,
    unspent_boarding_script_hexes: &[String],
    boarding_address_to_index: &HashMap<String, u32>,
    unspent_boarding_addresses: &[String],
) -> HashSet<u32> {
    let mut used = HashSet::new();
    for script in vtxo_script_hexes {
        if let Some(index) = offchain_script_to_index.get(script) {
            used.insert(*index);
        }
    }
    for script in unspent_boarding_script_hexes {
        if let Some(index) = boarding_script_to_index.get(script) {
            used.insert(*index);
        }
    }
    for address in unspent_boarding_addresses {
        if let Some(index) = boarding_address_to_index.get(address) {
            used.insert(*index);
        }
    }
    used
}

#[cfg(test)]
mod tests {
    use super::{describe_offchain_receive_gap, used_key_indices};
    use std::collections::{HashMap, HashSet};

    const BATCH: u32 = 20;

    fn used(indices: &[u32]) -> HashSet<u32> {
        indices.iter().copied().collect()
    }

    #[test]
    fn unrevealed_cursor_has_no_gap() {
        let reading = describe_offchain_receive_gap(0, &HashSet::new(), 0, BATCH, false);
        assert!(!reading.revealed);
        assert_eq!(reading.gap, 0);
        assert_eq!(reading.index, 0);
    }

    #[test]
    fn nothing_used_makes_index_20_hard_and_index_19_soft() {
        let at_20 = describe_offchain_receive_gap(20, &HashSet::new(), 0, BATCH, true);
        assert!(at_20.revealed);
        assert_eq!(at_20.index, 19);
        assert_eq!(at_20.gap, 20);
        assert_eq!(at_20.batch_gap, 2);

        let at_19 = describe_offchain_receive_gap(19, &HashSet::new(), 0, BATCH, true);
        assert_eq!(at_19.index, 18);
        assert_eq!(at_19.gap, 19);
        assert_eq!(at_19.batch_gap, 1);
    }

    #[test]
    fn hit_in_batch_zero_keeps_index_20_inside_the_lookahead() {
        let at_20 = describe_offchain_receive_gap(20, &used(&[4]), 1, BATCH, true);
        assert_eq!(at_20.batch_gap, 1);
        assert_eq!(at_20.gap, 19 - 4);

        let at_40 = describe_offchain_receive_gap(40, &used(&[4]), 1, BATCH, true);
        assert_eq!(at_40.index, 39);
        assert_eq!(at_40.batch_gap, 2);
    }

    #[test]
    fn empty_batch_hides_a_later_used_key() {
        let reading = describe_offchain_receive_gap(41, &used(&[0, 40]), 2, BATCH, true);
        assert_eq!(reading.index, 40);
        assert_eq!(reading.gap, 0);
        assert_eq!(reading.batch_gap, 2);
    }

    #[test]
    fn displayed_index_can_still_be_scanned_when_the_next_one_is_not() {
        let reading = describe_offchain_receive_gap(20, &HashSet::new(), 0, BATCH, true);
        assert_eq!(reading.index, 19);
        assert_eq!(reading.displayed_batch_gap, 1);
        assert_eq!(reading.batch_gap, 2);
    }

    #[test]
    fn displayed_index_past_the_empty_batch_is_unscanned() {
        let nothing_used = describe_offchain_receive_gap(21, &HashSet::new(), 0, BATCH, true);
        assert_eq!(nothing_used.index, 20);
        assert_eq!(nothing_used.displayed_batch_gap, 2);

        let paid_first_batch = describe_offchain_receive_gap(41, &used(&[0]), 1, BATCH, true);
        assert_eq!(paid_first_batch.index, 40);
        assert_eq!(paid_first_batch.displayed_batch_gap, 2);

        let still_inside_lookahead = describe_offchain_receive_gap(21, &used(&[0]), 1, BATCH, true);
        assert_eq!(still_inside_lookahead.displayed_batch_gap, 1);
    }

    #[test]
    fn confirm_reread_drops_below_the_hard_band_when_the_lookahead_batch_is_paid() {
        let before = describe_offchain_receive_gap(40, &used(&[0]), 1, BATCH, true);
        assert_eq!(before.batch_gap, 2);
        let after = describe_offchain_receive_gap(40, &used(&[0, 20]), 1, BATCH, true);
        assert_eq!(after.batch_gap, 1);
        assert!(after.gap >= 1);
    }

    #[test]
    fn spent_vtxo_script_still_marks_the_key() {
        let mut offchain = HashMap::new();
        offchain.insert("aa".to_string(), 3);
        let vtxo_scripts = vec!["aa".to_string()];
        let used = used_key_indices(
            &offchain,
            &vtxo_scripts,
            &HashMap::new(),
            &[],
            &HashMap::new(),
            &[],
        );
        assert_eq!(used, HashSet::from([3]));
    }

    #[test]
    fn boarding_output_marks_the_key_without_a_vtxo_on_the_receive_script() {
        let mut boarding_scripts = HashMap::new();
        boarding_scripts.insert("board".to_string(), 0);
        let used = used_key_indices(
            &HashMap::new(),
            &[],
            &boarding_scripts,
            &["board".to_string()],
            &HashMap::new(),
            &[],
        );
        assert_eq!(used, HashSet::from([0]));
        let reading = describe_offchain_receive_gap(1, &used, 0, BATCH, true);
        assert_eq!(reading.receive_count, 0);
        assert_eq!(reading.gap, 0);
        assert_eq!(reading.batch_gap, 0);
    }
}
