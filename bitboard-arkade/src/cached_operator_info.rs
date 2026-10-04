use std::collections::HashMap;

use ark_core::server::{DeprecatedSigner, FeeInfo, Info, IntentFeeInfo, ScheduledSession};
use bitcoin::address::NetworkUnchecked;
use bitcoin::hex::DisplayHex;
use bitcoin::secp256k1::PublicKey;
use bitcoin::{Address, Amount, Network, ScriptBuf, Sequence};
use serde::{Deserialize, Serialize};

use crate::error::{ArkResult, ArkWasmError};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CachedDeprecatedSignerRecord {
    pub signer_pk_hex: String,
    pub cutoff_date: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CachedIntentFeeInfoRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offchain_input: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offchain_output: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onchain_input: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onchain_output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CachedFeeInfoRecord {
    pub intent_fee: CachedIntentFeeInfoRecord,
    /// getInfo `txFeeRate` echo for persistence; unused for offline fee calculations.
    pub tx_fee_rate: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CachedScheduledSessionRecord {
    pub next_start_time: i64,
    pub next_end_time: i64,
    pub period: i64,
    pub duration: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fees: Option<CachedFeeInfoRecord>,
}

/// Serializable subset of [`Info`] for offline autonomous mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CachedOperatorInfoRecord {
    pub version: String,
    pub signer_pk_hex: String,
    pub forfeit_pk_hex: String,
    pub forfeit_address: String,
    pub checkpoint_tapscript_hex: String,
    pub network: String,
    pub session_duration: u64,
    pub unilateral_exit_delay_consensus: u32,
    pub boarding_exit_delay_consensus: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub utxo_min_amount_sats: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub utxo_max_amount_sats: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vtxo_min_amount_sats: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vtxo_max_amount_sats: Option<u64>,
    pub dust_sats: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fees: Option<CachedFeeInfoRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheduled_session: Option<CachedScheduledSessionRecord>,
    #[serde(default)]
    pub deprecated_signers: Vec<CachedDeprecatedSignerRecord>,
    #[serde(default)]
    pub service_status: HashMap<String, String>,
    pub digest: String,
    pub max_tx_weight: i64,
    pub max_op_return_outputs: i64,
}

impl CachedOperatorInfoRecord {
    pub fn from_server_info(info: &Info) -> Self {
        Self {
            version: info.version.clone(),
            signer_pk_hex: info.signer_pk.to_string(),
            forfeit_pk_hex: info.forfeit_pk.to_string(),
            forfeit_address: info.forfeit_address.to_string(),
            checkpoint_tapscript_hex: info.checkpoint_tapscript.to_bytes().to_lower_hex_string(),
            network: network_label(info.network),
            session_duration: info.session_duration,
            unilateral_exit_delay_consensus: info.unilateral_exit_delay.to_consensus_u32(),
            boarding_exit_delay_consensus: info.boarding_exit_delay.to_consensus_u32(),
            utxo_min_amount_sats: info.utxo_min_amount.map(Amount::to_sat),
            utxo_max_amount_sats: info.utxo_max_amount.map(Amount::to_sat),
            vtxo_min_amount_sats: info.vtxo_min_amount.map(Amount::to_sat),
            vtxo_max_amount_sats: info.vtxo_max_amount.map(Amount::to_sat),
            dust_sats: info.dust.to_sat(),
            fees: info.fees.as_ref().map(CachedFeeInfoRecord::from_fee_info),
            scheduled_session: info
                .scheduled_session
                .as_ref()
                .map(CachedScheduledSessionRecord::from_scheduled_session),
            deprecated_signers: info
                .deprecated_signers
                .iter()
                .map(|deprecated| CachedDeprecatedSignerRecord {
                    signer_pk_hex: deprecated.pk.to_string(),
                    cutoff_date: deprecated.cutoff_date,
                })
                .collect(),
            service_status: info.service_status.clone(),
            digest: info.digest.clone(),
            max_tx_weight: info.max_tx_weight,
            max_op_return_outputs: info.max_op_return_outputs,
        }
    }

    pub fn to_server_info(&self) -> ArkResult<Info> {
        let network = parse_bitcoin_network(&self.network)?;
        let signer_pk = parse_public_key(&self.signer_pk_hex, "signer_pk")?;
        let forfeit_pk = parse_public_key(&self.forfeit_pk_hex, "forfeit_pk")?;
        let checkpoint_tapscript =
            ScriptBuf::from_hex(&self.checkpoint_tapscript_hex).map_err(|error| {
                ArkWasmError::Snapshot(format!("invalid checkpoint tapscript: {error}"))
            })?;
        let forfeit_address = self
            .forfeit_address
            .parse::<Address<NetworkUnchecked>>()
            .map_err(|error| ArkWasmError::Snapshot(format!("invalid forfeit address: {error}")))?
            .require_network(network)
            .map_err(|error| ArkWasmError::Snapshot(format!("forfeit address network: {error}")))?;
        let unilateral_exit_delay = Sequence::from_consensus(self.unilateral_exit_delay_consensus);
        let boarding_exit_delay = Sequence::from_consensus(self.boarding_exit_delay_consensus);

        Ok(Info {
            version: self.version.clone(),
            signer_pk,
            forfeit_pk,
            forfeit_address,
            checkpoint_tapscript,
            network,
            session_duration: self.session_duration,
            unilateral_exit_delay,
            boarding_exit_delay,
            utxo_min_amount: self.utxo_min_amount_sats.map(Amount::from_sat),
            utxo_max_amount: self.utxo_max_amount_sats.map(Amount::from_sat),
            vtxo_min_amount: self.vtxo_min_amount_sats.map(Amount::from_sat),
            vtxo_max_amount: self.vtxo_max_amount_sats.map(Amount::from_sat),
            dust: Amount::from_sat(self.dust_sats),
            fees: self.fees.as_ref().map(|fees| fees.to_fee_info()),
            scheduled_session: self
                .scheduled_session
                .as_ref()
                .map(ScheduledSessionRecordExt::to_scheduled_session),
            deprecated_signers: self
                .deprecated_signers
                .iter()
                .map(|deprecated| {
                    Ok(DeprecatedSigner {
                        pk: parse_public_key(&deprecated.signer_pk_hex, "deprecated signer")?,
                        cutoff_date: deprecated.cutoff_date,
                    })
                })
                .collect::<ArkResult<Vec<_>>>()?,
            service_status: self.service_status.clone(),
            digest: self.digest.clone(),
            max_tx_weight: self.max_tx_weight,
            max_op_return_outputs: self.max_op_return_outputs,
        })
    }
}

impl CachedFeeInfoRecord {
    fn from_fee_info(fees: &FeeInfo) -> Self {
        Self {
            intent_fee: CachedIntentFeeInfoRecord {
                offchain_input: fees.intent_fee.offchain_input.clone(),
                offchain_output: fees.intent_fee.offchain_output.clone(),
                onchain_input: fees.intent_fee.onchain_input.clone(),
                onchain_output: fees.intent_fee.onchain_output.clone(),
            },
            tx_fee_rate: fees.tx_fee_rate.clone(),
        }
    }

    fn to_fee_info(&self) -> FeeInfo {
        FeeInfo {
            intent_fee: IntentFeeInfo {
                offchain_input: self.intent_fee.offchain_input.clone(),
                offchain_output: self.intent_fee.offchain_output.clone(),
                onchain_input: self.intent_fee.onchain_input.clone(),
                onchain_output: self.intent_fee.onchain_output.clone(),
            },
            tx_fee_rate: self.tx_fee_rate.clone(),
        }
    }
}

impl CachedScheduledSessionRecord {
    pub(crate) fn from_scheduled_session(session: &ScheduledSession) -> Self {
        Self {
            next_start_time: session.next_start_time,
            next_end_time: session.next_end_time,
            period: session.period,
            duration: session.duration,
            fees: session
                .fees
                .as_ref()
                .map(CachedFeeInfoRecord::from_fee_info),
        }
    }
}

trait ScheduledSessionRecordExt {
    fn to_scheduled_session(&self) -> ScheduledSession;
}

impl ScheduledSessionRecordExt for CachedScheduledSessionRecord {
    fn to_scheduled_session(&self) -> ScheduledSession {
        ScheduledSession {
            next_start_time: self.next_start_time,
            next_end_time: self.next_end_time,
            period: self.period,
            duration: self.duration,
            fees: self.fees.as_ref().map(|fees| fees.to_fee_info()),
        }
    }
}

fn parse_public_key(hex: &str, field: &str) -> ArkResult<PublicKey> {
    hex.parse::<PublicKey>()
        .map_err(|error| ArkWasmError::Snapshot(format!("invalid {field}: {error}")))
}

fn parse_bitcoin_network(label: &str) -> ArkResult<Network> {
    match label {
        "bitcoin" => Ok(Network::Bitcoin),
        "testnet" => Ok(Network::Testnet),
        "signet" => Ok(Network::Signet),
        "regtest" => Ok(Network::Regtest),
        other => Err(ArkWasmError::Snapshot(format!(
            "unsupported network: {other}"
        ))),
    }
}

pub fn network_label(network: Network) -> String {
    match network {
        Network::Bitcoin => "bitcoin".to_string(),
        Network::Testnet => "testnet".to_string(),
        Network::Signet => "signet".to_string(),
        Network::Regtest => "regtest".to_string(),
        _ => "unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::secp256k1::Secp256k1;

    fn sample_info() -> Info {
        let secp = Secp256k1::new();
        let signer_sk = bitcoin::secp256k1::SecretKey::from_slice(&[0x11; 32]).unwrap();
        let forfeit_sk = bitcoin::secp256k1::SecretKey::from_slice(&[0x22; 32]).unwrap();
        let signer_pk = PublicKey::from_secret_key(&secp, &signer_sk);
        let forfeit_pk = PublicKey::from_secret_key(&secp, &forfeit_sk);
        let forfeit_address = bitcoin::Address::p2tr(
            &secp,
            bitcoin::key::XOnlyPublicKey::from_slice(&[0x44; 32]).unwrap(),
            None,
            Network::Signet,
        );
        Info {
            version: "test".to_string(),
            signer_pk,
            forfeit_pk,
            forfeit_address,
            checkpoint_tapscript: ScriptBuf::new(),
            network: Network::Signet,
            session_duration: 600,
            unilateral_exit_delay: Sequence::from_consensus(144),
            boarding_exit_delay: Sequence::from_consensus(144),
            utxo_min_amount: None,
            utxo_max_amount: None,
            vtxo_min_amount: None,
            vtxo_max_amount: None,
            dust: Amount::from_sat(330),
            fees: None,
            scheduled_session: None,
            deprecated_signers: vec![],
            service_status: HashMap::new(),
            digest: "digest-abc".to_string(),
            max_tx_weight: 400_000,
            max_op_return_outputs: 1,
        }
    }

    #[test]
    fn cached_operator_info_round_trips_server_info() {
        let original = sample_info();
        let cached = CachedOperatorInfoRecord::from_server_info(&original);
        let restored = cached.to_server_info().expect("restore");
        assert_eq!(restored.version, original.version);
        assert_eq!(restored.signer_pk, original.signer_pk);
        assert_eq!(restored.dust, original.dust);
        assert_eq!(restored.digest, original.digest);
        assert_eq!(
            restored.unilateral_exit_delay.to_consensus_u32(),
            original.unilateral_exit_delay.to_consensus_u32()
        );
    }
}
