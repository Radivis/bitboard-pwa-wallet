use std::collections::HashSet;

use bitcoin::Address;
use bitcoin::Network;
use bitcoin::address::NetworkUnchecked;

/// Prefix the UI matches when an offboard parked before broadcast.
pub const BARK_OFFBOARD_PARKED_PREFIX: &str = "bark_offboard_parked";

/// Signet receive address for a collaborative exit. Mainnet and other networks are refused.
pub fn parse_signet_receive_address(address: &str) -> Result<Address, String> {
    let unchecked = address
        .trim()
        .parse::<Address<NetworkUnchecked>>()
        .map_err(|_| "Bark exit address is invalid".to_owned())?;
    unchecked
        .require_network(Network::Signet)
        .map_err(|_| "Bark exit address is not a Signet address".to_owned())
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

    use super::{
        BARK_OFFBOARD_PARKED_PREFIX, classify_offboard_failure, parse_signet_receive_address,
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
    fn mainnet_address_is_rejected() {
        let error = parse_signet_receive_address(MAINNET_ADDRESS).expect_err("mainnet");
        assert_eq!(error, "Bark exit address is not a Signet address");
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
}
