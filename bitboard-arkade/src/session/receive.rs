use std::collections::{HashMap, HashSet};

use ark_client::DEFAULT_GAP_LIMIT;
use bitcoin::ScriptBuf;
use bitcoin::hex::DisplayHex;

use crate::error::ArkResult;
use crate::error::ArkWasmError;
use crate::offchain_snapshot::incoming_payment_count_on_script;
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

    /// Incoming-payment count, index gap, and batch gap for the current receive cursor.
    ///
    /// The count follows the history net rule: change on this script counts, a same-value
    /// renewal does not, and a spent incoming payment still counts. Boarding counts as a used
    /// key only when the bumper wallet or the fresh Esplora address cache already holds an
    /// unspent output. This does not start a scan.
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
            .map(|(_address, vtxo)| vtxo.script_pubkey());
        let receive_count = match &displayed_script {
            Some(script) => incoming_payment_count_on_script(&snapshot, script)?,
            None => 0,
        };
        let vtxo_scripts = snapshot
            .virtual_tx_outpoints
            .iter()
            .map(|record| record.script_hex.clone())
            .collect::<Vec<_>>();

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

#[cfg(test)]
impl ArkadeSession {
    fn displayed_offchain_script(&self) -> ScriptBuf {
        let (_address, vtxo) = self
            .client
            .peek_offchain_receive_address()
            .expect("peek displayed receive script");
        vtxo.script_pubkey()
    }

    fn displayed_boarding_address(&self) -> String {
        let next_index = self.client.peek_next_offchain_derivation_index();
        let displayed_index = next_index.saturating_sub(1);
        let rows = self
            .client
            .discovery_candidates_before(next_index)
            .expect("discovery candidates");
        let row = rows
            .iter()
            .find(|row| row.index == displayed_index)
            .expect("displayed index has candidates");
        row.boarding_addresses
            .first()
            .expect("displayed index has a boarding address")
            .to_string()
    }

    fn set_offchain_snapshot_for_test(&self, snapshot: crate::persistence::OffchainVtxoSnapshot) {
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
    }

    fn insert_boarding_address_cache_for_test(
        &self,
        address: String,
        fetched_at_ms: u64,
        unspent: bool,
    ) {
        self.client.blockchain().insert_address_utxos_for_test(
            address,
            fetched_at_ms,
            vec![sample_explorer_utxo(unspent)],
        );
    }

    fn address_cache_now_ms_for_test(&self) -> u64 {
        self.client.blockchain().address_cache_now_ms_for_test()
    }
}

#[cfg(test)]
fn sample_explorer_utxo(unspent: bool) -> ark_core::ExplorerUtxo {
    use std::str::FromStr;

    use bitcoin::{Amount, OutPoint, Txid};

    ark_core::ExplorerUtxo {
        outpoint: OutPoint {
            txid: Txid::from_str(&"ab".repeat(32)).expect("txid"),
            vout: 0,
        },
        amount: Amount::from_sat(50_000),
        confirmation_blocktime: Some(1_700_000_000),
        confirmations: 1,
        is_spent: !unspent,
    }
}

#[cfg(test)]
mod session_receive_gap_tests {
    use std::collections::BTreeMap;

    use ark_core::server::Info;
    use bitcoin::hex::DisplayHex;
    use bitcoin::key::Secp256k1;
    use bitcoin::secp256k1::{PublicKey, SecretKey};
    use bitcoin::{Address, Amount, Network, ScriptBuf, Sequence};
    use std::str::FromStr;

    use crate::cached_operator_info::CachedOperatorInfoRecord;
    use crate::network::NetworkMode;
    use crate::persistence::{
        ARK_RS_ENGINE, ARK_RS_SDK_VERSION, BITBOARD_ARKADE_PERSISTENCE_VERSION,
        BitboardArkadePersistence, OffchainVtxoSnapshot, VirtualTxOutPointRecord, WalletDbSnapshot,
        operator_identity_for_connected_signer,
    };
    use crate::session::{ArkadeSession, OpenArkadeSessionParams};

    const MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const SIGNER_PK_HEX: &str =
        "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const OFFLINE_URL: &str = "http://127.0.0.1:1";

    fn signer_public_key() -> PublicKey {
        PublicKey::from_str(SIGNER_PK_HEX).expect("signer key")
    }

    fn signet_forfeit_address() -> Address {
        let secp = Secp256k1::new();
        let secret = SecretKey::from_slice(&[2u8; 32]).expect("forfeit key");
        let (xonly, _parity) = secret.x_only_public_key(&secp);
        Address::p2tr(&secp, xonly, None, Network::Signet)
    }

    fn offline_server_info() -> Info {
        Info {
            version: "1".into(),
            signer_pk: signer_public_key(),
            forfeit_pk: signer_public_key(),
            forfeit_address: signet_forfeit_address(),
            checkpoint_tapscript: ScriptBuf::from_hex("51").expect("checkpoint"),
            network: Network::Signet,
            session_duration: 0,
            unilateral_exit_delay: Sequence::from_consensus(144),
            boarding_exit_delay: Sequence::from_consensus(144),
            utxo_min_amount: None,
            utxo_max_amount: None,
            vtxo_min_amount: None,
            vtxo_max_amount: None,
            dust: Amount::from_sat(330),
            fees: None,
            scheduled_session: None,
            deprecated_signers: Vec::new(),
            service_status: std::collections::HashMap::new(),
            digest: String::new(),
            max_tx_weight: 0,
            max_op_return_outputs: 0,
        }
    }

    fn persistence_json(next_index: u32) -> String {
        let info = offline_server_info();
        let signer = info.signer_pk.x_only_public_key().0;
        let mut wallet_db = WalletDbSnapshot::default();
        wallet_db.offchain_next_derivation_index = next_index;
        wallet_db.cached_operator_info = Some(CachedOperatorInfoRecord::from_server_info(&info));
        let envelope = BitboardArkadePersistence {
            version: BITBOARD_ARKADE_PERSISTENCE_VERSION,
            engine: ARK_RS_ENGINE.to_string(),
            ark_sdk_version: ARK_RS_SDK_VERSION.to_string(),
            operator_identity: operator_identity_for_connected_signer(signer, Network::Signet),
            wallet_db,
            autonomous_mode: true,
        };
        serde_json::to_string(&envelope).expect("persistence json")
    }

    async fn open_offline_session(next_index: u32) -> ArkadeSession {
        let json = persistence_json(next_index);
        let (session, migration_hint) = ArkadeSession::open(OpenArkadeSessionParams {
            mnemonic_words: MNEMONIC,
            network_mode: NetworkMode::Signet,
            arkade_server_url: OFFLINE_URL.to_string(),
            delegator_url: String::new(),
            esplora_url: OFFLINE_URL.to_string(),
            sdk_persistence_json: Some(&json),
            bumper_changeset_json: None,
            bumper_full_scan_done: false,
        })
        .await
        .expect("offline session");
        assert!(migration_hint.is_none());
        session
    }

    fn empty_snapshot() -> OffchainVtxoSnapshot {
        OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: Vec::new(),
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at: 0,
        }
    }

    fn snapshot_with_script(script_hex: String) -> OffchainVtxoSnapshot {
        let mut snapshot = empty_snapshot();
        snapshot.virtual_tx_outpoints.push(VirtualTxOutPointRecord {
            txid: "11".repeat(32),
            vout: 0,
            created_at: 1_700_000_000,
            expires_at: 1_800_000_000,
            amount_sats: 50_000,
            script_hex,
            is_preconfirmed: true,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: Vec::new(),
            settled_by: None,
            ark_txid: None,
            assets: Vec::new(),
            server_pk_hex: None,
        });
        snapshot
    }

    fn persisted_script_hex(script: &ScriptBuf) -> String {
        script.to_bytes().to_lower_hex_string()
    }

    #[tokio::test]
    async fn session_receive_gap_without_snapshot_keeps_the_cursor_batch_gap() {
        let session = open_offline_session(21).await;

        let reading = session.offchain_receive_gap().expect("gap reading");

        assert!(!reading.snapshot_present);
        assert!(reading.revealed);
        assert_eq!(reading.index, 20);
        assert_eq!(reading.receive_count, 0);
        assert_eq!(reading.gap, 21);
        assert_eq!(reading.batch_gap, 2);
        assert_eq!(reading.displayed_batch_gap, 2);
    }

    #[tokio::test]
    async fn session_receive_gap_matches_persisted_script_hex_and_ignores_a_mismatch() {
        let session = open_offline_session(1).await;
        let displayed = session.displayed_offchain_script();

        session.set_offchain_snapshot_for_test(snapshot_with_script("00".to_string()));
        let mismatched = session.offchain_receive_gap().expect("mismatched reading");
        assert!(mismatched.snapshot_present);
        assert_eq!(mismatched.receive_count, 0);
        assert_eq!(mismatched.gap, 1);
        assert_eq!(mismatched.index, 0);

        session
            .set_offchain_snapshot_for_test(snapshot_with_script(persisted_script_hex(&displayed)));
        let matched = session.offchain_receive_gap().expect("matched reading");
        assert_eq!(matched.receive_count, 1);
        assert_eq!(matched.gap, 0);
        assert_eq!(matched.index, 0);
        assert!(matched.snapshot_present);
    }

    #[tokio::test]
    async fn session_receive_gap_ignores_a_stale_boarding_address_cache_entry() {
        let session = open_offline_session(1).await;
        session.set_offchain_snapshot_for_test(empty_snapshot());
        let boarding_address = session.displayed_boarding_address();

        session.insert_boarding_address_cache_for_test(boarding_address.clone(), 1, true);
        let stale = session.offchain_receive_gap().expect("stale cache reading");
        assert_eq!(stale.receive_count, 0);
        assert_eq!(stale.gap, 1);
        assert!(stale.snapshot_present);

        let now_ms = session.address_cache_now_ms_for_test();
        session.insert_boarding_address_cache_for_test(boarding_address.clone(), now_ms, true);
        let fresh = session.offchain_receive_gap().expect("fresh cache reading");
        assert_eq!(fresh.receive_count, 0);
        assert_eq!(fresh.gap, 0);

        session.insert_boarding_address_cache_for_test(boarding_address, now_ms, false);
        let spent = session.offchain_receive_gap().expect("spent cache reading");
        assert_eq!(spent.gap, 1);
        assert_eq!(spent.receive_count, 0);
    }
}
