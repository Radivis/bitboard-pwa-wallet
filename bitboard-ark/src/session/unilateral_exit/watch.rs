use std::collections::HashSet;
use std::str::FromStr;

use bitcoin::Txid;

use crate::persistence::{JsonPersistenceDb, UnilateralExitWatchRecord};

pub(crate) fn remove_unilateral_exit_watches_for_outpoints_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    outpoints: &HashSet<bitcoin::OutPoint>,
) {
    wallet_db.remove_unilateral_exit_watches_for_outpoints(outpoints);
}

pub(crate) fn parse_branch_txids(watch: &UnilateralExitWatchRecord) -> Vec<Txid> {
    watch
        .branch_txids
        .iter()
        .filter_map(|txid| Txid::from_str(txid).ok())
        .collect()
}
