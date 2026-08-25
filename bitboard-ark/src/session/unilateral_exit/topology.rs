use std::collections::{HashMap, HashSet};

use ark_core::server::VtxoChains;

use crate::api_types::{
    ExitCandidateRow, UnilateralExitHostOutpointDto, UnilateralExitTopologyNodeDto,
};
use crate::outpoint::VirtualOutPoint;
use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};
use crate::unilateral_exit_materials::{
    chained_tx_type_label, record_is_exit_eligible, snapshot_materials_for_leaf_tx,
    vtxo_chains_from_json,
};

/// Virtual tx types that may carry exit-eligible VTXO outpoints in indexer chains.
///
/// Batch-tree leaves are hosted on `tree` txs; offchain payments and change use `ark` txs.
/// `checkpoint` and `commitment` links appear in unroll branches but do not host spendable VTXOs.
pub(crate) fn virtual_tx_type_hosts_exit_outpoints(tx_type: &str) -> bool {
    matches!(tx_type, "ark" | "tree")
}

pub(crate) fn topology_nodes_from_chains(
    chains: &VtxoChains,
) -> Vec<UnilateralExitTopologyNodeDto> {
    chains
        .inner
        .iter()
        .map(|link| UnilateralExitTopologyNodeDto {
            txid: link.txid.to_string(),
            tx_type: chained_tx_type_label(&link.tx_type),
            spends: link.spends.iter().map(|txid| txid.to_string()).collect(),
        })
        .collect()
}

pub(crate) fn merge_topology_nodes_from_chains<'a>(
    chain_sets: impl IntoIterator<Item = &'a VtxoChains>,
) -> Vec<UnilateralExitTopologyNodeDto> {
    let mut seen = HashSet::new();
    let mut nodes = Vec::new();
    for chains in chain_sets {
        for node in topology_nodes_from_chains(chains) {
            if seen.insert(node.txid.clone()) {
                nodes.push(node);
            }
        }
    }
    nodes
}

/// Deepest virtual txs in a merged branch that can host exit outpoints.
///
/// Upstream `tree` or `ark` hosts are intermediate when a downstream host exists on the same path
/// (e.g. batch-tree leaf vtxo superseded by a later offchain `ark` tx in a self-send chain).
pub(crate) fn terminal_vtxo_host_txids_for_topology(
    nodes: &[UnilateralExitTopologyNodeDto],
) -> HashSet<String> {
    let host_txids: HashSet<String> = nodes
        .iter()
        .filter(|node| virtual_tx_type_hosts_exit_outpoints(&node.tx_type))
        .map(|node| node.txid.clone())
        .collect();
    if host_txids.is_empty() {
        return HashSet::new();
    }

    let mut children_by_parent: HashMap<String, Vec<String>> = HashMap::new();
    for node in nodes {
        for parent_txid in &node.spends {
            children_by_parent
                .entry(parent_txid.clone())
                .or_default()
                .push(node.txid.clone());
        }
    }

    let mut non_terminal_host_txids = HashSet::new();
    for host_txid in &host_txids {
        let mut stack = vec![host_txid.clone()];
        let mut visited = HashSet::new();
        while let Some(current_txid) = stack.pop() {
            if !visited.insert(current_txid.clone()) {
                continue;
            }
            for child_txid in children_by_parent.get(&current_txid).into_iter().flatten() {
                if host_txids.contains(child_txid) && child_txid != host_txid {
                    non_terminal_host_txids.insert(host_txid.clone());
                    break;
                }
                stack.push(child_txid.clone());
            }
            if non_terminal_host_txids.contains(host_txid) {
                break;
            }
        }
    }

    host_txids
        .into_iter()
        .filter(|txid| !non_terminal_host_txids.contains(txid))
        .collect()
}

pub(crate) fn topology_leaf_outpoints(
    all_outpoints: &[VirtualOutPoint],
    terminal_host_txids: &HashSet<String>,
) -> Vec<VirtualOutPoint> {
    all_outpoints
        .iter()
        .filter(|outpoint| terminal_host_txids.contains(&outpoint.txid.to_string()))
        .cloned()
        .collect()
}

/// Exit-eligible VTXO outpoints on any `tree`/`ark` host tx in the merged topology.
pub(crate) fn topology_host_outpoints(
    nodes: &[UnilateralExitTopologyNodeDto],
    records: &[VirtualTxOutPointRecord],
) -> Vec<UnilateralExitHostOutpointDto> {
    let host_txids: HashSet<String> = nodes
        .iter()
        .filter(|node| virtual_tx_type_hosts_exit_outpoints(&node.tx_type))
        .map(|node| node.txid.clone())
        .collect();
    if host_txids.is_empty() {
        return Vec::new();
    }

    let mut outpoints = records
        .iter()
        .filter(|record| record_is_exit_eligible(record) && host_txids.contains(&record.txid))
        .map(|record| UnilateralExitHostOutpointDto {
            txid: record.txid.clone(),
            vout: record.vout,
            amount_sats: record.amount_sats,
        })
        .collect::<Vec<_>>();
    outpoints.sort_by(|left, right| left.txid.cmp(&right.txid).then(left.vout.cmp(&right.vout)));
    outpoints.dedup_by(|left, right| left.txid == right.txid && left.vout == right.vout);
    outpoints
}

pub(crate) fn terminal_vtxo_host_txids_from_materials_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    candidate_txids: &[String],
) -> crate::error::ArkResult<HashSet<String>> {
    let unique_txids: HashSet<String> = candidate_txids.iter().cloned().collect();
    if unique_txids.is_empty() {
        return Ok(HashSet::new());
    }

    let mut chain_sets = Vec::new();
    for txid in &unique_txids {
        let Some(materials) = snapshot_materials_for_leaf_tx(snapshot, txid) else {
            continue;
        };
        chain_sets.push(vtxo_chains_from_json(&materials.chain_json)?);
    }

    if chain_sets.is_empty() {
        return Ok(unique_txids);
    }

    Ok(terminal_vtxo_host_txids_for_topology(
        &merge_topology_nodes_from_chains(chain_sets.iter()),
    ))
}

/// Only terminal branch leaves may start a unilateral exit; upstream hosts are excluded.
pub(crate) fn filter_exit_candidates_to_terminal_leaves(
    snapshot: Option<&OffchainVtxoSnapshot>,
    rows: Vec<ExitCandidateRow>,
) -> crate::error::ArkResult<Vec<ExitCandidateRow>> {
    let Some(snapshot) = snapshot else {
        return Ok(rows);
    };

    let startable_txids: Vec<String> = rows
        .iter()
        .filter(|row| row.can_start_unroll)
        .map(|row| row.txid.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    if startable_txids.is_empty() {
        return Ok(rows);
    }

    let terminal_txids =
        terminal_vtxo_host_txids_from_materials_snapshot(snapshot, &startable_txids)?;
    Ok(rows
        .into_iter()
        .filter(|row| !row.can_start_unroll || terminal_txids.contains(&row.txid))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api_types::VirtualStatusState;
    use crate::persistence::VirtualTxOutPointRecord;
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn txid(byte: u8) -> Txid {
        Txid::from_byte_array([byte; 32])
    }

    fn chain(txid: Txid, tx_type: ChainedTxType, spends: Vec<Txid>) -> VtxoChain {
        VtxoChain {
            txid,
            tx_type,
            spends,
            expires_at: 0,
        }
    }

    #[test]
    fn virtual_tx_type_hosts_exit_outpoints_includes_tree_and_ark_only() {
        assert!(virtual_tx_type_hosts_exit_outpoints("tree"));
        assert!(virtual_tx_type_hosts_exit_outpoints("ark"));
        assert!(!virtual_tx_type_hosts_exit_outpoints("checkpoint"));
        assert!(!virtual_tx_type_hosts_exit_outpoints("commitment"));
    }

    #[test]
    fn terminal_vtxo_host_txids_treats_tree_as_leaf_when_no_downstream_host() {
        let tree = txid(2);
        let nodes = vec![
            UnilateralExitTopologyNodeDto {
                txid: txid(1).to_string(),
                tx_type: "commitment".to_string(),
                spends: vec![],
            },
            UnilateralExitTopologyNodeDto {
                txid: tree.to_string(),
                tx_type: "tree".to_string(),
                spends: vec![txid(1).to_string()],
            },
        ];

        let terminal_txids = terminal_vtxo_host_txids_for_topology(&nodes);
        assert_eq!(terminal_txids.len(), 1);
        assert!(terminal_txids.contains(&tree.to_string()));
    }

    #[test]
    fn terminal_vtxo_host_txids_excludes_upstream_tree_when_ark_leaf_exists() {
        let tree = txid(2);
        let ark = txid(3);
        let nodes = vec![
            UnilateralExitTopologyNodeDto {
                txid: txid(1).to_string(),
                tx_type: "commitment".to_string(),
                spends: vec![],
            },
            UnilateralExitTopologyNodeDto {
                txid: tree.to_string(),
                tx_type: "tree".to_string(),
                spends: vec![txid(1).to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: ark.to_string(),
                tx_type: "ark".to_string(),
                spends: vec![tree.to_string()],
            },
        ];

        let terminal_txids = terminal_vtxo_host_txids_for_topology(&nodes);
        assert_eq!(terminal_txids.len(), 1);
        assert!(terminal_txids.contains(&ark.to_string()));
        assert!(!terminal_txids.contains(&tree.to_string()));
    }

    #[test]
    fn terminal_vtxo_host_txids_excludes_upstream_ark_on_shared_branch() {
        let intermediate = txid(4);
        let terminal = txid(6);
        let nodes = vec![
            UnilateralExitTopologyNodeDto {
                txid: txid(1).to_string(),
                tx_type: "commitment".to_string(),
                spends: vec![],
            },
            UnilateralExitTopologyNodeDto {
                txid: txid(2).to_string(),
                tx_type: "tree".to_string(),
                spends: vec![txid(1).to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: intermediate.to_string(),
                tx_type: "ark".to_string(),
                spends: vec![txid(2).to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: txid(5).to_string(),
                tx_type: "checkpoint".to_string(),
                spends: vec![intermediate.to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: terminal.to_string(),
                tx_type: "ark".to_string(),
                spends: vec![txid(5).to_string()],
            },
        ];

        let terminal_txids = terminal_vtxo_host_txids_for_topology(&nodes);
        assert_eq!(terminal_txids.len(), 1);
        assert!(terminal_txids.contains(&terminal.to_string()));
        assert!(!terminal_txids.contains(&intermediate.to_string()));
    }

    #[test]
    fn topology_host_outpoints_includes_intermediate_and_terminal_hosts() {
        use crate::unilateral_exit_materials::materials_record_from_prefetch;

        let intermediate = txid(4);
        let terminal = txid(6);
        let nodes = vec![
            UnilateralExitTopologyNodeDto {
                txid: txid(1).to_string(),
                tx_type: "commitment".to_string(),
                spends: vec![],
            },
            UnilateralExitTopologyNodeDto {
                txid: txid(2).to_string(),
                tx_type: "tree".to_string(),
                spends: vec![txid(1).to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: intermediate.to_string(),
                tx_type: "ark".to_string(),
                spends: vec![txid(2).to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: txid(5).to_string(),
                tx_type: "checkpoint".to_string(),
                spends: vec![intermediate.to_string()],
            },
            UnilateralExitTopologyNodeDto {
                txid: terminal.to_string(),
                tx_type: "ark".to_string(),
                spends: vec![txid(5).to_string()],
            },
        ];
        let chains = VtxoChains {
            inner: vec![
                chain(txid(1), ChainedTxType::Commitment, vec![]),
                chain(txid(2), ChainedTxType::Tree, vec![txid(1)]),
                chain(intermediate, ChainedTxType::Ark, vec![txid(2)]),
                chain(txid(5), ChainedTxType::Checkpoint, vec![intermediate]),
                chain(terminal, ChainedTxType::Ark, vec![txid(5)]),
            ],
        };
        let _materials = materials_record_from_prefetch(1, &chains, &[]).expect("materials record");
        let records = vec![
            VirtualTxOutPointRecord {
                txid: intermediate.to_string(),
                vout: 0,
                created_at: 0,
                expires_at: 0,
                amount_sats: 125_000,
                script_hex: "00".to_string(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            },
            VirtualTxOutPointRecord {
                txid: terminal.to_string(),
                vout: 0,
                created_at: 0,
                expires_at: 0,
                amount_sats: 25_000,
                script_hex: "00".to_string(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            },
        ];

        let host_outpoints = topology_host_outpoints(&nodes, &records);
        assert_eq!(host_outpoints.len(), 2);
        assert_eq!(host_outpoints[0].txid, intermediate.to_string());
        assert_eq!(host_outpoints[0].amount_sats, 125_000);
        assert_eq!(host_outpoints[1].txid, terminal.to_string());
        assert_eq!(host_outpoints[1].amount_sats, 25_000);

        let terminal_host_txids = terminal_vtxo_host_txids_for_topology(&nodes);
        let plan_outpoints = vec![
            VirtualOutPoint::new(intermediate, 0),
            VirtualOutPoint::new(terminal, 0),
        ];
        let leaf_outpoints = topology_leaf_outpoints(&plan_outpoints, &terminal_host_txids);
        assert_eq!(leaf_outpoints.len(), 1);
        assert_eq!(leaf_outpoints[0].txid, terminal);
    }

    #[test]
    fn filter_exit_candidates_to_terminal_leaves_drops_upstream_ark_vtxos() {
        use crate::persistence::OffchainVtxoSnapshot;
        use crate::unilateral_exit_materials::{
            materials_record_from_prefetch, store_materials_for_leaf_tx,
        };

        let intermediate = txid(4);
        let terminal = txid(6);
        let chains = VtxoChains {
            inner: vec![
                chain(txid(1), ChainedTxType::Commitment, vec![]),
                chain(txid(2), ChainedTxType::Tree, vec![txid(1)]),
                chain(intermediate, ChainedTxType::Ark, vec![txid(2)]),
                chain(txid(5), ChainedTxType::Checkpoint, vec![intermediate]),
                chain(terminal, ChainedTxType::Ark, vec![txid(5)]),
            ],
        };
        let materials = materials_record_from_prefetch(1, &chains, &[]).expect("materials record");
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
            unilateral_exit_materials_by_leaf_tx: Default::default(),
        };
        store_materials_for_leaf_tx(&mut snapshot, &intermediate.to_string(), materials.clone());
        store_materials_for_leaf_tx(&mut snapshot, &terminal.to_string(), materials);

        let rows = vec![
            ExitCandidateRow {
                id: "a".to_string(),
                txid: intermediate.to_string(),
                vout: 0,
                amount_sats: 125_000,
                virtual_status_state: VirtualStatusState::Settled,
                is_recoverable: false,
                is_unrolled: false,
                can_start_unroll: true,
                can_complete: false,
            },
            ExitCandidateRow {
                id: "b".to_string(),
                txid: terminal.to_string(),
                vout: 0,
                amount_sats: 25_000,
                virtual_status_state: VirtualStatusState::Settled,
                is_recoverable: false,
                is_unrolled: false,
                can_start_unroll: true,
                can_complete: false,
            },
        ];

        let filtered =
            filter_exit_candidates_to_terminal_leaves(Some(&snapshot), rows).expect("filter");
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].txid, terminal.to_string());
    }
}
