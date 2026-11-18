use std::collections::{HashMap, HashSet};

use ark_client::DEFAULT_GAP_LIMIT;
use bitcoin::ScriptBuf;
use bitcoin::hex::DisplayHex;

use crate::error::ArkResult;
use crate::error::ArkWasmError;
use crate::receive_gap::{
    OffchainReceiveGapReading, describe_offchain_receive_gap, used_key_indices,
};

use super::ArkadeSession;

fn script_hex(script: &ScriptBuf) -> String {
    script.as_bytes().to_lower_hex_string()
}

impl ArkadeSession {
    pub fn peek_offchain_address(&self) -> ArkResult<String> {
        let (address, _) = self.client.peek_offchain_receive_address()?;
        Ok(address.to_string())
    }

    /// Payment count, index gap, and batch gap for the current receive cursor.
    ///
    /// Boarding counts only when the bumper wallet or the fresh Esplora address cache already
    /// holds an unspent output. This does not start a scan.
    pub fn offchain_receive_gap(&self) -> ArkResult<OffchainReceiveGapReading> {
        let next_index = self.client.peek_next_offchain_derivation_index();
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let snapshot_present = snapshot.is_some();
        let Some(snapshot) = snapshot else {
            return Ok(describe_offchain_receive_gap(
                next_index,
                &HashSet::new(),
                0,
                DEFAULT_GAP_LIMIT,
                false,
            ));
        };

        let candidates = self
            .client
            .discovery_candidates_before(next_index)
            .map_err(ArkWasmError::Client)?;
        let mut offchain_script_to_index = HashMap::new();
        let mut boarding_script_to_index = HashMap::new();
        let mut boarding_address_to_index = HashMap::new();
        for row in candidates {
            for script in row.offchain_scripts {
                offchain_script_to_index.insert(script_hex(&script), row.index);
            }
            for script in row.boarding_scripts {
                boarding_script_to_index.insert(script_hex(&script), row.index);
            }
            for address in row.boarding_addresses {
                boarding_address_to_index.insert(address.to_string(), row.index);
            }
        }

        let displayed_script = self
            .client
            .peek_offchain_receive_address()
            .ok()
            .map(|(_address, vtxo)| script_hex(&vtxo.script_pubkey()));
        let mut receive_count = 0u32;
        let mut vtxo_scripts = Vec::with_capacity(snapshot.virtual_tx_outpoints.len());
        for record in &snapshot.virtual_tx_outpoints {
            vtxo_scripts.push(record.script_hex.clone());
            if displayed_script.as_ref() == Some(&record.script_hex) {
                receive_count = receive_count.saturating_add(1);
            }
        }

        let unspent_boarding_scripts = self
            .bumper_wallet
            .unspent_script_hexes()
            .unwrap_or_default();
        let unspent_boarding_addresses = self
            .client
            .blockchain()
            .fresh_cached_addresses_with_unspent();
        let used = used_key_indices(
            &offchain_script_to_index,
            &vtxo_scripts,
            &boarding_script_to_index,
            &unspent_boarding_scripts,
            &boarding_address_to_index,
            &unspent_boarding_addresses,
        );
        Ok(describe_offchain_receive_gap(
            next_index,
            &used,
            receive_count,
            DEFAULT_GAP_LIMIT,
            snapshot_present,
        ))
    }

    pub fn reveal_next_offchain_address(&self) -> ArkResult<String> {
        self.ensure_operator_rpc_allowed()?;
        let (address, _) = self.client.reveal_next_offchain_receive_address()?;
        Ok(address.to_string())
    }
}
