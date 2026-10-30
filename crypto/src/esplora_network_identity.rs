//! Checks that an Esplora update comes from the network the active wallet is labeled with.
//!
//! Public Signet and Mutinynet share the signet genesis block, so BDK cannot tell their
//! Esplora servers apart. Their block heights can: Mutinynet's blocks are about
//! ten times faster.

use bdk_wallet::Update;

use crate::error::CryptoError;
use crate::types::BitcoinNetwork;

/// A block height at or above this is Mutinynet; a height above zero and below it is
/// public Signet. Also defined in
/// `frontend/src/lib/wallet/signet-mutinynet-chain-classifier.ts`.
pub const SIGNET_MUTINYNET_HEIGHT_BOUNDARY: u32 = 1_000_000;

const PUBLIC_SIGNET_LABEL: &str = "Signet";
const MUTINYNET_LABEL: &str = "Mutinynet";

/// Rejects an update whose chain tip height belongs to the other signet-family network.
/// Networks outside that family, and updates without a chain, are not checked.
pub fn check_update_matches_network(
    app_network: Option<BitcoinNetwork>,
    update: &Update,
) -> Result<(), CryptoError> {
    let (Some(app_network), Some(update_chain)) = (app_network, update.chain.as_ref()) else {
        return Ok(());
    };
    let wallet_network_label = match app_network {
        BitcoinNetwork::Signet => PUBLIC_SIGNET_LABEL,
        BitcoinNetwork::Mutinynet => MUTINYNET_LABEL,
        _ => return Ok(()),
    };

    let esplora_tip_height = update_chain.height();
    let esplora_network_label = signet_family_label_for_height(esplora_tip_height);
    if esplora_network_label == wallet_network_label {
        return Ok(());
    }

    Err(CryptoError::EsploraNetworkMismatch(format!(
        "The Esplora server for {wallet_network_label} is on {esplora_network_label} \
         (tip height {esplora_tip_height}). Check the Esplora URL for \
         {wallet_network_label} in Settings."
    )))
}

fn signet_family_label_for_height(height: u32) -> &'static str {
    if height >= SIGNET_MUTINYNET_HEIGHT_BOUNDARY {
        MUTINYNET_LABEL
    } else {
        PUBLIC_SIGNET_LABEL
    }
}
