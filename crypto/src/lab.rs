//! Minimal in-app lab implementation for Personal Lab network.
//!
//! Supports P2WPKH and P2TR (Taproot) addresses. Uses the bitcoin crate for block/transaction construction.

use std::str::FromStr;

use bitcoin::blockdata::block::Version as BlockVersion;
use bitcoin::blockdata::script::ScriptBuf;
use bitcoin::blockdata::transaction::{OutPoint, Sequence};
use bitcoin::blockdata::witness::Witness;
use bitcoin::consensus::encode::{deserialize_hex, serialize_hex};
use bitcoin::hashes::Hash;
use bitcoin::key::{Keypair, PrivateKey, TapTweak, TweakedKeypair};
use bitcoin::locktime::absolute;
use bitcoin::secp256k1::{Message, Secp256k1, SecretKey};
use bitcoin::sighash::{EcdsaSighashType, Prevouts, SighashCache, TapSighashType};
use bitcoin::{
    Address, Amount, Block, BlockHash, CompactTarget, CompressedPublicKey, FeeRate, Network,
    Transaction, TxIn, TxMerkleNode, TxOut, Txid, transaction,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const LAB_COINBASE_SUBSIDY: u64 = 50 * 100_000_000; // 50 BTC in sats
const LAB_BITS: u32 = 0x207fffff; // Max target for lab
const DUST_THRESHOLD_SATS: u64 = 546; // Min non-dust output for P2WPKH

// P2WPKH vsize estimates for fee calculation in lab_build_transaction_with_change
const LAB_ESTIMATE_TX_VSIZE_BASE: u64 = 10;
const LAB_ESTIMATE_P2WPKH_INPUT_VSIZE: u64 = 68;
const LAB_ESTIMATE_P2WPKH_OUTPUT_VSIZE: u64 = 34;
const LAB_ESTIMATE_P2WPKH_OUTPUT_COUNT: u64 = 2; // payment + change

/// Result of generating a new keypair for "random" mining.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabKeypairResult {
    pub address: String,
    pub wif: String,
}

/// Input UTXO for building a transaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabUtxoInput {
    pub txid: String,
    pub vout: u32, // INDEX of the output vector in the transaction - confusing legacy naming, but we stick to it for consistency
    pub amount_sats: u64,
    pub script_pubkey_hex: String,
    /// Address for multi-key signing. Optional; when absent, single-key signing is used.
    #[serde(default)]
    pub address: Option<String>,
}

/// Output for building a transaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabTxOutput {
    pub address: String,
    pub amount_sats: u64,
}

/// Returns the regtest genesis block as hex.
#[wasm_bindgen]
pub fn regtest_create_genesis() -> String {
    let block = bitcoin::blockdata::constants::genesis_block(Network::Regtest);
    serialize_hex(&block)
}

/// Mines a new block with coinbase to the given script_pubkey and optional transactions.
///
/// - `prev_block_hash_hex`: Previous block hash (empty for genesis)
/// - `height`: Block height (0 for genesis)
/// - `coinbase_script_pubkey_hex`: ScriptPubKey for coinbase output (hex)
/// - `txs_hex`: Optional transactions to include (array of hex strings)
/// - `total_fees_sats`: Sum of fees from included transactions (added to coinbase output)
#[wasm_bindgen]
pub fn lab_mine_block(
    prev_block_hash_hex: &str,
    height: u32,
    coinbase_script_pubkey_hex: &str,
    txs_hex: JsValue,
    total_fees_sats: u64,
) -> Result<String, JsValue> {
    let script_pubkey_bytes =
        hex::decode(coinbase_script_pubkey_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let script_pubkey = ScriptBuf::from_bytes(script_pubkey_bytes);

    let prev_hash = if prev_block_hash_hex.is_empty() {
        BlockHash::all_zeros()
    } else {
        BlockHash::from_str(prev_block_hash_hex).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let coinbase = create_coinbase_tx(height, script_pubkey, total_fees_sats);
    let mut txdata = vec![coinbase];

    if !txs_hex.is_undefined() && !txs_hex.is_null() {
        let arr: Vec<String> = serde_wasm_bindgen::from_value(txs_hex)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        for tx_hex in arr {
            let tx: Transaction =
                deserialize_hex(&tx_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
            txdata.push(tx);
        }
    }

    let merkle_root = compute_merkle_root(&txdata);
    let time = unix_time_lab();

    let header = bitcoin::blockdata::block::Header {
        version: BlockVersion::TWO,
        prev_blockhash: prev_hash,
        merkle_root,
        time,
        bits: CompactTarget::from_consensus(LAB_BITS),
        nonce: 0,
    };

    let block = Block { header, txdata };
    Ok(serialize_hex(&block))
}

/// Builds an unsigned P2WPKH transaction from UTXOs and outputs.
#[wasm_bindgen]
pub fn lab_build_transaction(
    utxos_json: &str,
    outputs_json: &str,
    fee_rate_sat_per_vb: f64,
) -> Result<String, JsValue> {
    let utxos: Vec<LabUtxoInput> =
        serde_json::from_str(utxos_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let outputs: Vec<LabTxOutput> =
        serde_json::from_str(outputs_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    if utxos.is_empty() {
        return Err(JsValue::from_str("At least one UTXO required"));
    }
    if outputs.is_empty() {
        return Err(JsValue::from_str("At least one output required"));
    }

    let total_in: u64 = utxos.iter().map(|u| u.amount_sats).sum();
    let total_out: u64 = outputs.iter().map(|o| o.amount_sats).sum();
    if total_out >= total_in {
        return Err(JsValue::from_str("Outputs exceed inputs"));
    }

    let fee = total_in - total_out;
    let fee_rate = FeeRate::from_sat_per_vb_unchecked(fee_rate_sat_per_vb.ceil() as u64);

    let mut input_vec = Vec::with_capacity(utxos.len());
    let mut prev_outputs: Vec<(TxOut, u32)> = Vec::with_capacity(utxos.len());

    for utxo in &utxos {
        let txid = Txid::from_str(&utxo.txid).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let script_bytes =
            hex::decode(&utxo.script_pubkey_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let script_pubkey = ScriptBuf::from_bytes(script_bytes);

        input_vec.push(TxIn {
            previous_output: OutPoint::new(txid, utxo.vout),
            script_sig: ScriptBuf::default(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::default(),
        });

        prev_outputs.push((
            TxOut {
                value: Amount::from_sat(utxo.amount_sats),
                script_pubkey,
            },
            input_vec.len() as u32 - 1,
        ));
    }

    let mut output_vec: Vec<TxOut> = Vec::with_capacity(outputs.len());
    for out in &outputs {
        let addr = Address::from_str(&out.address)
            .map_err(|e| JsValue::from_str(&e.to_string()))?
            .require_network(Network::Regtest)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        output_vec.push(TxOut {
            value: Amount::from_sat(out.amount_sats),
            script_pubkey: addr.script_pubkey(),
        });
    }

    let tx = Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: input_vec,
        output: output_vec,
    };

    let required_fee = fee_rate.fee_wu(tx.weight()).unwrap_or(Amount::ZERO);
    if fee < required_fee.to_sat() {
        return Err(JsValue::from_str(&format!(
            "Insufficient fee: have {} sats, need at least {} sats",
            fee,
            required_fee.to_sat()
        )));
    }

    Ok(serialize_hex(&tx))
}

/// Signs a P2WPKH transaction. Modifies the tx in place and returns the signed tx hex.
///
/// - `tx_hex`: Unsigned transaction hex
/// - `wif`: WIF of the key that controls the inputs (must match script_pubkey)
/// - `utxos_json`: Same format as lab_build_transaction
#[wasm_bindgen]
pub fn lab_sign_transaction(tx_hex: &str, wif: &str, utxos_json: &str) -> Result<String, JsValue> {
    let mut tx: Transaction =
        deserialize_hex(tx_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let utxos: Vec<LabUtxoInput> =
        serde_json::from_str(utxos_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let privkey = PrivateKey::from_wif(wif).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let secp = Secp256k1::new();
    let sk = privkey.inner;
    let pk = bitcoin::PublicKey::new(sk.public_key(&secp));
    if pk.wpubkey_hash().is_err() {
        return Err(JsValue::from_str("Key must be compressed for P2WPKH"));
    }

    let sighash_type = EcdsaSighashType::All;
    let input_len = tx.input.len();
    let mut sighasher = SighashCache::new(&mut tx);

    for (i, utxo) in utxos.iter().enumerate() {
        if i >= input_len {
            break;
        }
        let script_bytes =
            hex::decode(&utxo.script_pubkey_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let script_pubkey = ScriptBuf::from_bytes(script_bytes);

        let sighash = sighasher
            .p2wpkh_signature_hash(
                i,
                &script_pubkey,
                Amount::from_sat(utxo.amount_sats),
                sighash_type,
            )
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let msg = bitcoin::secp256k1::Message::from(sighash);
        let signature = secp.sign_ecdsa(&msg, &sk);
        let sig = bitcoin::ecdsa::Signature {
            signature,
            sighash_type,
        };
        *sighasher.witness_mut(i).unwrap() = Witness::p2wpkh(&sig, &pk.inner);
    }

    let signed_tx = sighasher.into_transaction();
    Ok(serialize_hex(&signed_tx))
}

/// Signs a transaction where each input may be P2WPKH or P2TR, controlled by different keys.
/// Uses `address_to_wif_json` (e.g. `{"addr1":"wif1","addr2":"wif2"}`) to look up the WIF
/// for each input based on the UTXO's `address` field.
#[wasm_bindgen]
pub fn lab_sign_transaction_multi(
    tx_hex: &str,
    utxos_json: &str,
    address_to_wif_json: &str,
) -> Result<String, JsValue> {
    let mut tx: Transaction =
        deserialize_hex(tx_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let utxos: Vec<LabUtxoInput> =
        serde_json::from_str(utxos_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let address_to_wif: std::collections::HashMap<String, String> =
        serde_json::from_str(address_to_wif_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let secp = Secp256k1::new();
    let ecdsa_sighash_type = EcdsaSighashType::All;
    let tap_sighash_type = TapSighashType::Default;
    let input_len = tx.input.len();

    let prevouts: Vec<TxOut> = utxos
        .iter()
        .map(|u| {
            let script_bytes =
                hex::decode(&u.script_pubkey_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(TxOut {
                value: Amount::from_sat(u.amount_sats),
                script_pubkey: ScriptBuf::from_bytes(script_bytes),
            })
        })
        .collect::<Result<Vec<_>, JsValue>>()?;
    let prevouts = Prevouts::All(&prevouts);

    let mut sighasher = SighashCache::new(&mut tx);

    for (i, utxo) in utxos.iter().enumerate() {
        if i >= input_len {
            break;
        }
        let wif = utxo
            .address
            .as_ref()
            .and_then(|addr| address_to_wif.get(addr).cloned())
            .ok_or_else(|| {
                JsValue::from_str(&format!(
                    "No WIF for input {} (address: {:?})",
                    i, utxo.address
                ))
            })?;

        let script_bytes =
            hex::decode(&utxo.script_pubkey_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let script_pubkey = ScriptBuf::from_bytes(script_bytes);

        if script_pubkey.is_p2tr() {
            let privkey =
                PrivateKey::from_wif(&wif).map_err(|e| JsValue::from_str(&e.to_string()))?;
            let keypair = Keypair::from_secret_key(&secp, &privkey.inner);
            let tweaked: TweakedKeypair = keypair.tap_tweak(&secp, None);

            let sighash = sighasher
                .taproot_key_spend_signature_hash(i, &prevouts, tap_sighash_type)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;

            let msg = Message::from(sighash);
            let signature = secp.sign_schnorr(&msg, tweaked.as_keypair());
            let sig = bitcoin::taproot::Signature {
                signature,
                sighash_type: tap_sighash_type,
            };
            *sighasher.witness_mut(i).unwrap() = Witness::p2tr_key_spend(&sig);
        } else {
            let privkey =
                PrivateKey::from_wif(&wif).map_err(|e| JsValue::from_str(&e.to_string()))?;
            let sk = privkey.inner;
            let pk = bitcoin::PublicKey::new(sk.public_key(&secp));
            if pk.wpubkey_hash().is_err() {
                return Err(JsValue::from_str("Key must be compressed for P2WPKH"));
            }

            let sighash = sighasher
                .p2wpkh_signature_hash(
                    i,
                    &script_pubkey,
                    Amount::from_sat(utxo.amount_sats),
                    ecdsa_sighash_type,
                )
                .map_err(|e| JsValue::from_str(&e.to_string()))?;

            let msg = Message::from(sighash);
            let signature = secp.sign_ecdsa(&msg, &sk);
            let sig = bitcoin::ecdsa::Signature {
                signature,
                sighash_type: ecdsa_sighash_type,
            };
            *sighasher.witness_mut(i).unwrap() = Witness::p2wpkh(&sig, &pk.inner);
        }
    }

    let signed_tx = sighasher.into_transaction();
    Ok(serialize_hex(&signed_tx))
}

/// Builds a P2WPKH transaction with payment and change outputs.
/// Ensures total inputs are fully spent: payment + change + fee, with change to a new address.
/// Returns (tx_hex, fee_sats) on success.
#[wasm_bindgen]
pub fn lab_build_transaction_with_change(
    utxos_json: &str,
    payment_address: &str,
    payment_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address: &str,
) -> Result<JsValue, JsValue> {
    let utxos: Vec<LabUtxoInput> =
        serde_json::from_str(utxos_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    if utxos.is_empty() {
        return Err(JsValue::from_str("At least one UTXO required"));
    }
    if payment_sats == 0 {
        return Err(JsValue::from_str("Payment amount must be positive"));
    }

    let total_in: u64 = utxos.iter().map(|u| u.amount_sats).sum();
    if payment_sats >= total_in {
        return Err(JsValue::from_str("Payment exceeds total inputs"));
    }

    let fee_rate = FeeRate::from_sat_per_vb_unchecked(fee_rate_sat_per_vb.ceil() as u64);
    let n_in = utxos.len() as u64;
    let estimated_vsize = LAB_ESTIMATE_TX_VSIZE_BASE
        + n_in * LAB_ESTIMATE_P2WPKH_INPUT_VSIZE
        + LAB_ESTIMATE_P2WPKH_OUTPUT_COUNT * LAB_ESTIMATE_P2WPKH_OUTPUT_VSIZE;
    let required_fee = fee_rate.fee_vb(estimated_vsize).unwrap_or(Amount::ZERO);
    let required_fee_sats = required_fee.to_sat().saturating_add(1); // small buffer for rounding

    let change_sats = total_in
        .saturating_sub(payment_sats)
        .saturating_sub(required_fee_sats);
    let (outputs, actual_fee_sats) = if change_sats >= DUST_THRESHOLD_SATS {
        let outputs = vec![
            LabTxOutput {
                address: payment_address.to_string(),
                amount_sats: payment_sats,
            },
            LabTxOutput {
                address: change_address.to_string(),
                amount_sats: change_sats,
            },
        ];
        let total_out = payment_sats + change_sats;
        let fee = total_in - total_out;
        (outputs, fee)
    } else {
        let outputs = vec![LabTxOutput {
            address: payment_address.to_string(),
            amount_sats: payment_sats,
        }];
        let fee = total_in - payment_sats;
        (outputs, fee)
    };

    let outputs_json =
        serde_json::to_string(&outputs).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let tx_hex = lab_build_transaction(utxos_json, &outputs_json, fee_rate_sat_per_vb)?;

    let result = serde_json::json!({
        "tx_hex": tx_hex,
        "fee_sats": actual_fee_sats,
        "has_change": change_sats >= DUST_THRESHOLD_SATS,
    });
    Ok(JsValue::from_str(&result.to_string()))
}

/// Generates a new keypair for "random" mining. Returns address (P2WPKH) and WIF.
#[wasm_bindgen]
pub fn lab_generate_keypair() -> Result<JsValue, JsValue> {
    let secp = Secp256k1::new();
    let sk = {
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
        SecretKey::from_slice(&bytes).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let pk = bitcoin::PublicKey::new(sk.public_key(&secp));
    let compressed_pk = CompressedPublicKey::try_from(pk)
        .map_err(|_| JsValue::from_str("Key must be compressed"))?;
    let addr = Address::p2wpkh(&compressed_pk, Network::Regtest);
    let privkey = PrivateKey::new(sk, Network::Regtest);

    let result = LabKeypairResult {
        address: addr.to_string(),
        wif: privkey.to_wif(),
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Validates that an address is a valid P2WPKH or P2TR regtest address.
#[wasm_bindgen]
pub fn lab_validate_address(addr: &str) -> Result<bool, JsValue> {
    let address = match Address::from_str(addr) {
        Ok(a) => a,
        Err(_) => return Ok(false),
    };
    let checked = match address.require_network(Network::Regtest) {
        Ok(a) => a,
        Err(_) => return Ok(false),
    };
    let spk = checked.script_pubkey();
    Ok(spk.is_p2wpkh() || spk.is_p2tr())
}

/// Returns the txid (hex) for a serialized transaction.
#[wasm_bindgen]
pub fn lab_txid(tx_hex: &str) -> String {
    let tx: Transaction = match deserialize_hex(tx_hex) {
        Ok(t) => t,
        Err(_) => return String::new(),
    };
    tx.compute_txid().to_string()
}

/// Returns the block hash (hex) for a serialized block.
#[wasm_bindgen]
pub fn lab_block_hash(block_hex: &str) -> String {
    let block: Block = match deserialize_hex(block_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    block.block_hash().to_string()
}

/// Returns the effects of applying a block: new UTXOs, spent outpoints, and per-tx input refs.
/// Used by the worker to update in-memory state and build transaction history.
#[wasm_bindgen]
pub fn lab_block_effects(block_hex: &str) -> Result<JsValue, JsValue> {
    let block: Block = deserialize_hex(block_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let mut new_utxos = Vec::new();
    let mut spent = Vec::new();
    let mut transactions = Vec::new();

    for (tx_idx, tx) in block.txdata.iter().enumerate() {
        let txid = tx.compute_txid().to_string();

        let mut inputs = Vec::new();
        for input in &tx.input {
            if !input.previous_output.is_null() {
                let prev = &input.previous_output;
                spent.push(serde_json::json!({
                    "txid": prev.txid.to_string(),
                    "vout": prev.vout,
                }));
                inputs.push(serde_json::json!({
                    "prev_txid": prev.txid.to_string(),
                    "prev_vout": prev.vout,
                }));
            }
        }

        let mut tx_outputs = Vec::new();
        for output in &tx.output {
            let script = &output.script_pubkey;
            if !script.is_p2wpkh() && !script.is_p2tr() {
                continue;
            }
            let addr = match Address::from_script(script, Network::Regtest) {
                Ok(a) => a.to_string(),
                Err(_) => continue,
            };
            tx_outputs.push(serde_json::json!({
                "address": addr,
                "amount_sats": output.value.to_sat(),
            }));
        }

        if tx_idx > 0 && !inputs.is_empty() {
            transactions.push(serde_json::json!({
                "txid": txid,
                "inputs": inputs,
                "outputs": tx_outputs,
            }));
        }

        for (vout, output) in tx.output.iter().enumerate() {
            let script = &output.script_pubkey;
            if !script.is_p2wpkh() && !script.is_p2tr() {
                continue;
            }
            let addr = match Address::from_script(script, Network::Regtest) {
                Ok(a) => a.to_string(),
                Err(_) => continue,
            };
            new_utxos.push(serde_json::json!({
                "txid": txid,
                "vout": vout as u32,
                "address": addr,
                "amount_sats": output.value.to_sat(),
                "script_pubkey_hex": hex::encode(script.as_bytes()),
            }));
        }
    }

    let block_time = block.header.time;
    let result = serde_json::json!({
        "new_utxos": new_utxos,
        "spent": spent,
        "transactions": transactions,
        "block_time": block_time,
    });
    Ok(JsValue::from_str(&result.to_string()))
}

/// Extracts script_pubkey hex from a P2WPKH or P2TR address.
#[wasm_bindgen]
pub fn lab_address_to_script_pubkey_hex(addr: &str) -> Result<String, JsValue> {
    let address = Address::from_str(addr)
        .map_err(|e| JsValue::from_str(&e.to_string()))?
        .require_network(Network::Regtest)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let spk = address.script_pubkey();
    if !spk.is_p2wpkh() && !spk.is_p2tr() {
        return Err(JsValue::from_str(
            "Address must be P2WPKH (bcrt1q...) or P2TR (bcrt1p...)",
        ));
    }
    Ok(hex::encode(spk.as_bytes()))
}

fn create_coinbase_tx(height: u32, script_pubkey: ScriptBuf, fees_sats: u64) -> Transaction {
    let script_sig = bitcoin::blockdata::script::Builder::new()
        .push_int(height as i64)
        .push_slice([0u8; 32]) // Extra nonce for uniqueness
        .into_script();

    let input = TxIn {
        previous_output: OutPoint::null(),
        script_sig,
        sequence: Sequence::MAX,
        witness: Witness::default(),
    };

    let total_value = LAB_COINBASE_SUBSIDY + fees_sats;
    let output = TxOut {
        value: Amount::from_sat(total_value),
        script_pubkey,
    };

    Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: vec![input],
        output: vec![output],
    }
}

fn compute_merkle_root(txdata: &[Transaction]) -> TxMerkleNode {
    let hashes = txdata.iter().map(|t| t.compute_txid().to_raw_hash());
    bitcoin::merkle_tree::calculate_root(hashes)
        .expect("non-empty txdata")
        .into()
}

fn unix_time_lab() -> u32 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as u32
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as u32
    }
}
