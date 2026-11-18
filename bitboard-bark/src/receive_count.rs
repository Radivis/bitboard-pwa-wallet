//! Receives on one Bark receive key.
//!
//! A coin counts when its amount differs from the coins this wallet spent in the
//! same movement. That spent amount is applied once, to the first output. A spent
//! incoming payment still counts, because it stays an output of the receive
//! movement. Change counts. A same-value renewal does not.

use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ReceiveCountVtxo {
    pub id: String,
    pub amount_sats: u64,
    pub user_pubkey: String,
}

/// Status of one Bark movement, reduced to what the payment count needs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ReceiveCountMovementStatus {
    Pending,
    Successful,
    Failed,
    /// Bark can cancel a movement. The wasm session maps that status here.
    /// Native builds do not compile that session.
    #[allow(dead_code)]
    Canceled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ReceiveCountMovement {
    pub status: ReceiveCountMovementStatus,
    pub input_vtxo_ids: Vec<String>,
    pub output_vtxo_ids: Vec<String>,
}

/// Receives whose user pubkey is `displayed_user_pubkey`.
///
/// Only successful movements count. An unknown input id is left out of the
/// spent amount. An unknown output id is not a receive, and when it is the
/// first output it still absorbs the inputs. Change counts. A same-value
/// renewal does not.
pub(crate) fn incoming_payment_count_on_pubkey(
    vtxos: &[ReceiveCountVtxo],
    movements: &[ReceiveCountMovement],
    displayed_user_pubkey: &str,
) -> u32 {
    let vtxos_by_id = index_vtxos_by_id(vtxos);
    movements
        .iter()
        .filter(|movement| movement.status == ReceiveCountMovementStatus::Successful)
        .map(|movement| payments_in_movement(movement, &vtxos_by_id, displayed_user_pubkey))
        .fold(0, u32::saturating_add)
}

fn index_vtxos_by_id(vtxos: &[ReceiveCountVtxo]) -> HashMap<&str, &ReceiveCountVtxo> {
    let mut vtxos_by_id = HashMap::with_capacity(vtxos.len());
    for vtxo in vtxos {
        vtxos_by_id.entry(vtxo.id.as_str()).or_insert(vtxo);
    }
    vtxos_by_id
}

fn payments_in_movement(
    movement: &ReceiveCountMovement,
    vtxos_by_id: &HashMap<&str, &ReceiveCountVtxo>,
    displayed_user_pubkey: &str,
) -> u32 {
    let input_amount_sats = spent_amount_sats(&movement.input_vtxo_ids, vtxos_by_id);
    movement
        .output_vtxo_ids
        .iter()
        .enumerate()
        .filter(|(index, output_id)| {
            output_counts_as_receive(
                vtxos_by_id.get(output_id.as_str()).copied(),
                absorbed_input_sats(*index, input_amount_sats),
                displayed_user_pubkey,
            )
        })
        .count()
        .try_into()
        .unwrap_or(u32::MAX)
}

fn spent_amount_sats(input_ids: &[String], vtxos_by_id: &HashMap<&str, &ReceiveCountVtxo>) -> u64 {
    input_ids
        .iter()
        .filter_map(|input_id| vtxos_by_id.get(input_id.as_str()))
        .map(|vtxo| vtxo.amount_sats)
        .fold(0, u64::saturating_add)
}

fn absorbed_input_sats(output_index: usize, input_amount_sats: u64) -> u64 {
    if output_index == 0 {
        input_amount_sats
    } else {
        0
    }
}

fn output_counts_as_receive(
    output: Option<&ReceiveCountVtxo>,
    absorbed_input_sats: u64,
    displayed_user_pubkey: &str,
) -> bool {
    let Some(output) = output else {
        return false;
    };
    output.amount_sats != absorbed_input_sats && output.user_pubkey == displayed_user_pubkey
}

#[cfg(test)]
mod tests {
    use super::{
        ReceiveCountMovement, ReceiveCountMovementStatus, ReceiveCountVtxo,
        incoming_payment_count_on_pubkey,
    };

    const DISPLAYED_PUBKEY: &str = "displayed";
    const OTHER_PUBKEY: &str = "other";

    fn vtxo(id: &str, amount_sats: u64, user_pubkey: &str) -> ReceiveCountVtxo {
        ReceiveCountVtxo {
            id: id.to_owned(),
            amount_sats,
            user_pubkey: user_pubkey.to_owned(),
        }
    }

    fn movement(
        status: ReceiveCountMovementStatus,
        input_ids: &[&str],
        output_ids: &[&str],
    ) -> ReceiveCountMovement {
        ReceiveCountMovement {
            status,
            input_vtxo_ids: input_ids.iter().map(|id| (*id).to_owned()).collect(),
            output_vtxo_ids: output_ids.iter().map(|id| (*id).to_owned()).collect(),
        }
    }

    fn count(vtxos: &[ReceiveCountVtxo], movements: &[ReceiveCountMovement]) -> u32 {
        incoming_payment_count_on_pubkey(vtxos, movements, DISPLAYED_PUBKEY)
    }

    #[test]
    fn incoming_payment_counts_a_positive_output_on_the_displayed_pubkey() {
        let vtxos = [vtxo("payment", 1_000, DISPLAYED_PUBKEY)];
        let movements = [movement(
            ReceiveCountMovementStatus::Successful,
            &[],
            &["payment"],
        )];

        assert_eq!(count(&vtxos, &movements), 1);
    }

    #[test]
    fn a_spent_incoming_payment_still_counts() {
        let vtxos = [
            vtxo("payment", 1_000, DISPLAYED_PUBKEY),
            vtxo("paid_out", 400, OTHER_PUBKEY),
        ];
        let movements = [
            movement(ReceiveCountMovementStatus::Successful, &[], &["payment"]),
            movement(
                ReceiveCountMovementStatus::Successful,
                &["payment"],
                &["paid_out"],
            ),
        ];

        assert_eq!(count(&vtxos, &movements), 1);
    }

    #[test]
    fn change_counts_and_an_equal_renewal_does_not() {
        let change_vtxos = [
            vtxo("payment", 1_000, DISPLAYED_PUBKEY),
            vtxo("change", 400, DISPLAYED_PUBKEY),
        ];
        let change_movements = [
            movement(ReceiveCountMovementStatus::Successful, &[], &["payment"]),
            movement(
                ReceiveCountMovementStatus::Successful,
                &["payment"],
                &["change"],
            ),
        ];
        assert_eq!(count(&change_vtxos, &change_movements), 2);

        let renewal_vtxos = [
            vtxo("payment", 2_000, DISPLAYED_PUBKEY),
            vtxo("renewed", 2_000, DISPLAYED_PUBKEY),
        ];
        let renewal_movements = [
            movement(ReceiveCountMovementStatus::Successful, &[], &["payment"]),
            movement(
                ReceiveCountMovementStatus::Successful,
                &["payment"],
                &["renewed"],
            ),
        ];
        assert_eq!(count(&renewal_vtxos, &renewal_movements), 1);
    }

    #[test]
    fn an_output_on_another_pubkey_does_not_count() {
        let vtxos = [
            vtxo("theirs", 1_000, OTHER_PUBKEY),
            vtxo("ours", 500, DISPLAYED_PUBKEY),
        ];
        let movements = [movement(
            ReceiveCountMovementStatus::Successful,
            &[],
            &["theirs", "ours"],
        )];

        assert_eq!(count(&vtxos, &movements), 1);
    }

    #[test]
    fn a_failed_movement_does_not_count() {
        let vtxos = [vtxo("payment", 1_000, DISPLAYED_PUBKEY)];
        let movements = [movement(
            ReceiveCountMovementStatus::Failed,
            &[],
            &["payment"],
        )];

        assert_eq!(count(&vtxos, &movements), 0);
    }

    #[test]
    fn a_canceled_movement_does_not_count() {
        let vtxos = [vtxo("payment", 1_000, DISPLAYED_PUBKEY)];
        let movements = [movement(
            ReceiveCountMovementStatus::Canceled,
            &[],
            &["payment"],
        )];

        assert_eq!(count(&vtxos, &movements), 0);
    }

    #[test]
    fn an_unfinished_board_does_not_count() {
        let vtxos = [vtxo("board", 50_000, DISPLAYED_PUBKEY)];
        let movements = [movement(
            ReceiveCountMovementStatus::Pending,
            &[],
            &["board"],
        )];

        assert_eq!(count(&vtxos, &movements), 0);
    }

    #[test]
    fn a_board_with_no_inputs_counts_once() {
        let vtxos = [vtxo("board", 50_000, DISPLAYED_PUBKEY)];
        let movements = [movement(
            ReceiveCountMovementStatus::Successful,
            &[],
            &["board"],
        )];

        assert_eq!(count(&vtxos, &movements), 1);
    }

    #[test]
    fn a_smaller_refresh_counts() {
        let vtxos = [
            vtxo("payment", 2_000, DISPLAYED_PUBKEY),
            vtxo("refreshed", 1_990, DISPLAYED_PUBKEY),
        ];
        let movements = [
            movement(ReceiveCountMovementStatus::Successful, &[], &["payment"]),
            movement(
                ReceiveCountMovementStatus::Successful,
                &["payment"],
                &["refreshed"],
            ),
        ];

        assert_eq!(count(&vtxos, &movements), 2);
    }

    #[test]
    fn the_first_output_absorbs_every_input() {
        let vtxos = [
            vtxo("spent", 1_000, DISPLAYED_PUBKEY),
            vtxo("change", 100, DISPLAYED_PUBKEY),
            vtxo("later", 1_000, DISPLAYED_PUBKEY),
        ];
        let movements = [
            movement(ReceiveCountMovementStatus::Successful, &[], &["spent"]),
            movement(
                ReceiveCountMovementStatus::Successful,
                &["spent"],
                &["change", "later"],
            ),
        ];

        assert_eq!(count(&vtxos, &movements), 3);
    }

    #[test]
    fn several_outputs_with_no_inputs_count_once_each() {
        let vtxos = [
            vtxo("first", 600, DISPLAYED_PUBKEY),
            vtxo("second", 400, DISPLAYED_PUBKEY),
        ];
        let movements = [movement(
            ReceiveCountMovementStatus::Successful,
            &[],
            &["first", "second"],
        )];

        assert_eq!(count(&vtxos, &movements), 2);
    }
}
