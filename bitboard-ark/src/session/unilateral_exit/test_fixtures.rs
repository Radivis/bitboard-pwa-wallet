//! Shared unilateral-exit unit fixtures (commitment → tree → ark leaf).

use std::collections::BTreeMap;

use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
use bitcoin::Txid;
use bitcoin::hashes::Hash;

use crate::persistence::{
    OffchainVtxoSnapshot, UnilateralExitMaterialsRecord, VirtualTxOutPointRecord,
};
use crate::unilateral_exit_materials::{store_materials_for_leaf_tx, vtxo_chains_to_json};

pub fn txid(byte: u8) -> Txid {
    Txid::from_byte_array([byte; 32])
}

pub fn chain(txid: Txid, tx_type: ChainedTxType, spends: Vec<Txid>) -> VtxoChain {
    VtxoChain {
        txid,
        tx_type,
        spends,
        expires_at: 0,
    }
}

pub fn vtxo_record(
    host: &Txid,
    vout: u32,
    amount_sats: u64,
    is_unrolled: bool,
) -> VirtualTxOutPointRecord {
    VirtualTxOutPointRecord {
        txid: host.to_string(),
        vout,
        created_at: 1,
        expires_at: 2,
        amount_sats,
        script_hex: String::new(),
        is_preconfirmed: false,
        is_swept: false,
        is_unrolled,
        is_spent: false,
        spent_by: None,
        commitment_txids: vec![],
        settled_by: None,
        ark_txid: None,
        assets: vec![],
        server_pk_hex: None,
    }
}

/// Commitment `0x01` → tree `0x02` (vouts 0 and 1) → ark leaf `0x03`.
pub fn snapshot_with_intermediate_tree_and_ark_leaf() -> (OffchainVtxoSnapshot, Txid, Txid, Txid) {
    let commitment = txid(0x01);
    let tree = txid(0x02);
    let leaf = txid(0x03);
    let chains = VtxoChains {
        inner: vec![
            chain(commitment, ChainedTxType::Commitment, vec![]),
            chain(tree, ChainedTxType::Tree, vec![commitment]),
            chain(leaf, ChainedTxType::Ark, vec![tree]),
        ],
    };
    let chain_json = vtxo_chains_to_json(&chains).expect("encode");
    let mut snapshot = OffchainVtxoSnapshot {
        synced_at: 1,
        dust_sats: 330,
        virtual_tx_outpoints: vec![
            vtxo_record(&tree, 0, 2_000, false),
            vtxo_record(&tree, 1, 3_000, false),
            vtxo_record(&leaf, 0, 1_000, false),
            vtxo_record(&commitment, 0, 9_000, false),
        ],
        unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
    };
    store_materials_for_leaf_tx(
        &mut snapshot,
        &leaf.to_string(),
        UnilateralExitMaterialsRecord {
            cached_at: 1,
            chain_json,
            virtual_psbts: vec![],
        },
    );
    (snapshot, tree, leaf, commitment)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_fixture_has_tree_leaf_and_commitment_hosts() {
        let (snapshot, tree, leaf, commitment) = snapshot_with_intermediate_tree_and_ark_leaf();
        assert_eq!(tree, txid(0x02));
        assert_eq!(leaf, txid(0x03));
        assert_eq!(commitment, txid(0x01));
        assert_eq!(snapshot.virtual_tx_outpoints.len(), 4);
        assert!(
            snapshot
                .unilateral_exit_materials_by_leaf_tx
                .contains_key(&leaf.to_string())
        );
    }
}
