#![cfg_attr(not(any(test, target_arch = "wasm32")), allow(dead_code))]

use std::collections::HashSet;

use bitcoin::Address;
use bitcoin::Network;
use bitcoin::address::NetworkUnchecked;

/// Prefix the UI matches when an offboard parked before broadcast.
pub const BARK_OFFBOARD_PARKED_PREFIX: &str = "bark_offboard_parked";

/// On-chain receive address for a collaborative or emergency exit on the open network.
pub fn parse_receive_address(address: &str, network: Network) -> Result<Address, String> {
    let unchecked = address
        .trim()
        .parse::<Address<NetworkUnchecked>>()
        .map_err(|_| "Bark exit address is invalid".to_owned())?;
    unchecked
        .require_network(network)
        .map_err(|_| match network {
            Network::Signet => "Bark exit address is not a Signet address".to_owned(),
            Network::Bitcoin => "Bark exit address is not a Mainnet address".to_owned(),
            _ => "Bark exit address is not for this network".to_owned(),
        })
}

/// Signet receive address for a collaborative exit.
#[cfg_attr(target_arch = "wasm32", allow(dead_code))]
pub fn parse_signet_receive_address(address: &str) -> Result<Address, String> {
    parse_receive_address(address, Network::Signet)
}

/// Local state that decides whether a new exit may select a VTXO.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExitInputState {
    Spendable,
    Locked,
    Spent,
    Exited,
}

/// A new exit selects spendable coins only. Spent and exited coins stay out.
/// Bark applies the same cut through `spendable_vtxos` when an exit starts.
#[cfg_attr(target_arch = "wasm32", allow(dead_code))]
pub fn selectable_exit_vtxo_ids<'a>(
    vtxos: impl IntoIterator<Item = (&'a str, ExitInputState)>,
) -> Vec<&'a str> {
    vtxos
        .into_iter()
        .filter_map(|(id, state)| match state {
            ExitInputState::Spendable => Some(id),
            ExitInputState::Locked | ExitInputState::Spent | ExitInputState::Exited => None,
        })
        .collect()
}

const SPENT_VTXO_REJECTION_TAILS: &[&str] =
    &[" is not spendable (state: spent)", " is already spent"];
const VTXO_REJECTION_MARK: &str = "vtxo ";

/// VTXO ids the server named as already spent. Repeated sentences count once.
pub fn spent_vtxo_ids_named_by_server(message: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut rest = message;
    while let Some(mark_at) = rest.find(VTXO_REJECTION_MARK) {
        let after_mark = &rest[mark_at + VTXO_REJECTION_MARK.len()..];
        let id_end = after_mark
            .find(char::is_whitespace)
            .unwrap_or(after_mark.len());
        let id = after_mark[..id_end].trim();
        let after_id = &after_mark[id_end..];
        if is_vtxo_id(id)
            && spent_rejection_follows(after_id)
            && !ids.iter().any(|existing| existing == id)
        {
            ids.push(id.to_owned());
        }
        rest = after_id;
    }
    ids
}

fn spent_rejection_follows(after_id: &str) -> bool {
    SPENT_VTXO_REJECTION_TAILS
        .iter()
        .any(|tail| after_id.starts_with(tail))
}

fn is_vtxo_id(id: &str) -> bool {
    let Some((txid, vout)) = id.split_once(':') else {
        return false;
    };
    txid.len() == 64
        && txid.bytes().all(|byte| byte.is_ascii_hexdigit())
        && !vout.is_empty()
        && vout.bytes().all(|byte| byte.is_ascii_digit())
}

/// A checkpoint created by this attempt is parked. Checkpoints that already existed are not.
pub fn classify_offboard_failure(
    ids_before: &HashSet<String>,
    ids_after: &HashSet<String>,
    error_message: &str,
) -> String {
    let created_new_checkpoint = ids_after.iter().any(|id| !ids_before.contains(id));
    if created_new_checkpoint {
        format!("{BARK_OFFBOARD_PARKED_PREFIX}: {error_message}")
    } else {
        error_message.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use bitcoin::Network;

    use super::{
        BARK_OFFBOARD_PARKED_PREFIX, ExitInputState, classify_offboard_failure,
        parse_receive_address, parse_signet_receive_address, selectable_exit_vtxo_ids,
        spent_vtxo_ids_named_by_server,
    };

    const SIGNET_ADDRESS: &str = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
    const MAINNET_ADDRESS: &str = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

    #[test]
    fn signet_address_is_accepted() {
        let address =
            parse_signet_receive_address(&format!("  {SIGNET_ADDRESS}  ")).expect("signet address");
        assert_eq!(address.to_string(), SIGNET_ADDRESS);
    }

    #[test]
    fn mainnet_address_is_rejected_on_signet() {
        let error = parse_signet_receive_address(MAINNET_ADDRESS).expect_err("mainnet");
        assert_eq!(error, "Bark exit address is not a Signet address");
    }

    #[test]
    fn mainnet_address_is_accepted_on_mainnet() {
        let address = parse_receive_address(MAINNET_ADDRESS, Network::Bitcoin).expect("mainnet");
        assert_eq!(address.to_string(), MAINNET_ADDRESS);
    }

    #[test]
    fn signet_address_is_rejected_on_mainnet() {
        let error =
            parse_receive_address(SIGNET_ADDRESS, Network::Bitcoin).expect_err("signet on mainnet");
        assert_eq!(error, "Bark exit address is not a Mainnet address");
    }

    #[test]
    fn empty_address_is_rejected() {
        let error = parse_signet_receive_address("   ").expect_err("blank");
        assert_eq!(error, "Bark exit address is invalid");
    }

    #[test]
    fn a_new_checkpoint_is_parked_and_an_older_one_is_not() {
        let older = HashSet::from(["existing".to_owned()]);
        let with_new = HashSet::from(["existing".to_owned(), "fresh".to_owned()]);
        let parked = classify_offboard_failure(&older, &with_new, "could not complete yet");
        assert!(parked.starts_with(BARK_OFFBOARD_PARKED_PREFIX));
        assert!(parked.contains("could not complete yet"));

        let same = classify_offboard_failure(&older, &older, "insufficient funds");
        assert_eq!(same, "insufficient funds");
    }

    #[test]
    fn a_new_exit_selects_spendable_vtxos_and_leaves_spent_ones_out() {
        let selected = selectable_exit_vtxo_ids([
            ("spend:0", ExitInputState::Spendable),
            (
                "33e7166f18ea847b5c2a20130d6eeb0504fd690bbe7c1015cdd08fa41db45e25:0",
                ExitInputState::Spent,
            ),
            ("locked:1", ExitInputState::Locked),
            ("exited:2", ExitInputState::Exited),
        ]);

        assert_eq!(selected, ["spend:0"]);
    }

    #[test]
    fn a_spent_server_rejection_names_each_vtxo_once() {
        let message = "error preparing offboard vtxos with arkoor: server failed to cosign arkoor: \
            code: 'Client specified an invalid argument', message: \"bad user input: vtxo \
            33e7166f18ea847b5c2a20130d6eeb0504fd690bbe7c1015cdd08fa41db45e25:0 is not spendable \
            (state: spent)\": code: 'Client specified an invalid argument', message: \"bad user \
            input: vtxo 33e7166f18ea847b5c2a20130d6eeb0504fd690bbe7c1015cdd08fa41db45e25:0 is not \
            spendable (state: spent)\"";

        let ids = spent_vtxo_ids_named_by_server(message);

        assert_eq!(
            ids,
            ["33e7166f18ea847b5c2a20130d6eeb0504fd690bbe7c1015cdd08fa41db45e25:0"]
        );
        assert!(spent_vtxo_ids_named_by_server("fee rate too low").is_empty());
    }

    #[test]
    fn an_already_spent_server_rejection_names_the_vtxo_once() {
        let message = "Splitting coins for the on-chain amount failed: An error occurred while \
            processing the action: error preparing offboard vtxos with arkoor: error preparing \
            offboard vtxos with arkoor: server failed to cosign arkoor: code: 'Internal error', \
            message: \"tx body error: vtxo \
            e2b5b75b048f731a2075301fc827db929917eb16dff134a180db276b435b7a8f:0 is already spent\": \
            code: 'Internal error', message: \"tx body error: vtxo \
            e2b5b75b048f731a2075301fc827db929917eb16dff134a180db276b435b7a8f:0 is already spent\"";

        let ids = spent_vtxo_ids_named_by_server(message);

        assert_eq!(
            ids,
            ["e2b5b75b048f731a2075301fc827db929917eb16dff134a180db276b435b7a8f:0"]
        );
    }
}
