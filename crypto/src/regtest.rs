//! Minimal in-app regtest implementation for Personal Regtest network.
//!
//! P2WPKH only. Uses the bitcoin crate for block/transaction construction.

use std::str::FromStr;

use bitcoin::blockdata::block::Version as BlockVersion;
use bitcoin::blockdata::script::ScriptBuf;
use bitcoin::blockdata::transaction::{OutPoint, Sequence};
use bitcoin::blockdata::witness::Witness;
use bitcoin::consensus::encode::{deserialize_hex, serialize_hex};
use bitcoin::hashes::Hash;
use bitcoin::key::PrivateKey;
use bitcoin::locktime::absolute;
use bitcoin::secp256k1::{Secp256k1, SecretKey};
use bitcoin::sighash::{EcdsaSighashType, SighashCache};
use bitcoin::{
    Address, Amount, Block, BlockHash, CompactTarget, CompressedPublicKey, FeeRate, Network,
    Transaction, TxIn, TxMerkleNode, TxOut, Txid, transaction,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const REGTEST_COINBASE_SUBSIDY: u64 = 50 * 100_000_000; // 50 BTC in sats
const REGTEST_BITS: u32 = 0x207fffff; // Max target for regtest

/// Result of generating a new keypair for "random" mining.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegtestKeypairResult {
    pub address: String,
    pub wif: String,
}

/// Input UTXO for building a transaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegtestUtxoInput {
    pub txid: String,
    pub vout: u32,
    pub amount_sats: u64,
    pub script_pubkey_hex: String,
}

/// Output for building a transaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegtestTxOutput {
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
#[wasm_bindgen]
pub fn regtest_mine_block(
    prev_block_hash_hex: &str,
    height: u32,
    coinbase_script_pubkey_hex: &str,
    txs_hex: JsValue,
) -> Result<String, JsValue> {
    let script_pubkey_bytes =
        hex::decode(coinbase_script_pubkey_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let script_pubkey = ScriptBuf::from_bytes(script_pubkey_bytes);

    let prev_hash = if prev_block_hash_hex.is_empty() {
        BlockHash::all_zeros()
    } else {
        BlockHash::from_str(prev_block_hash_hex).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let coinbase = create_coinbase_tx(height, script_pubkey);
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
    let time = unix_time_regtest();

    let header = bitcoin::blockdata::block::Header {
        version: BlockVersion::TWO,
        prev_blockhash: prev_hash,
        merkle_root,
        time,
        bits: CompactTarget::from_consensus(REGTEST_BITS),
        nonce: 0,
    };

    let block = Block { header, txdata };
    Ok(serialize_hex(&block))
}

/// Builds an unsigned P2WPKH transaction from UTXOs and outputs.
#[wasm_bindgen]
pub fn regtest_build_transaction(
    utxos_json: &str,
    outputs_json: &str,
    fee_rate_sat_per_vb: f64,
) -> Result<String, JsValue> {
    let utxos: Vec<RegtestUtxoInput> =
        serde_json::from_str(utxos_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let outputs: Vec<RegtestTxOutput> =
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
/// - `utxos_json`: Same format as regtest_build_transaction
#[wasm_bindgen]
pub fn regtest_sign_transaction(
    tx_hex: &str,
    wif: &str,
    utxos_json: &str,
) -> Result<String, JsValue> {
    let mut tx: Transaction =
        deserialize_hex(tx_hex).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let utxos: Vec<RegtestUtxoInput> =
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

/// Generates a new keypair for "random" mining. Returns address (P2WPKH) and WIF.
#[wasm_bindgen]
pub fn regtest_generate_keypair() -> Result<JsValue, JsValue> {
    let secp = Secp256k1::new();
    #[cfg(target_arch = "wasm32")]
    let sk = {
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
        SecretKey::from_slice(&bytes).map_err(|e| JsValue::from_str(&e.to_string()))?
    };
    #[cfg(not(target_arch = "wasm32"))]
    let sk = {
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
        SecretKey::from_slice(&bytes).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let pk = bitcoin::PublicKey::new(sk.public_key(&secp));
    let compressed_pk = CompressedPublicKey::try_from(pk.clone())
        .map_err(|_| JsValue::from_str("Key must be compressed"))?;
    let addr = Address::p2wpkh(&compressed_pk, Network::Regtest);
    let privkey = PrivateKey::new(sk, Network::Regtest);

    let result = RegtestKeypairResult {
        address: addr.to_string(),
        wif: privkey.to_wif(),
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Validates that an address is a valid P2WPKH regtest address.
#[wasm_bindgen]
pub fn regtest_validate_address(addr: &str) -> Result<bool, JsValue> {
    let address = match Address::from_str(addr) {
        Ok(a) => a,
        Err(_) => return Ok(false),
    };
    let checked = match address.require_network(Network::Regtest) {
        Ok(a) => a,
        Err(_) => return Ok(false),
    };
    Ok(checked.script_pubkey().is_p2wpkh())
}

/// Returns the block hash (hex) for a serialized block.
#[wasm_bindgen]
pub fn regtest_block_hash(block_hex: &str) -> String {
    let block: Block = match deserialize_hex(block_hex) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    block.block_hash().to_string()
}

/// Returns the effects of applying a block: new UTXOs, spent outpoints, and per-tx input refs.
/// Used by the worker to update in-memory state and build transaction history.
#[wasm_bindgen]
pub fn regtest_block_effects(block_hex: &str) -> Result<JsValue, JsValue> {
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
            if !script.is_p2wpkh() {
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
            if !script.is_p2wpkh() {
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

/// Extracts script_pubkey hex from a P2WPKH address.
#[wasm_bindgen]
pub fn regtest_address_to_script_pubkey_hex(addr: &str) -> Result<String, JsValue> {
    let address = Address::from_str(addr)
        .map_err(|e| JsValue::from_str(&e.to_string()))?
        .require_network(Network::Regtest)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    if !address.script_pubkey().is_p2wpkh() {
        return Err(JsValue::from_str("Address must be P2WPKH (bcrt1q...)"));
    }
    Ok(hex::encode(address.script_pubkey().as_bytes()))
}

fn create_coinbase_tx(height: u32, script_pubkey: ScriptBuf) -> Transaction {
    let script_sig = bitcoin::blockdata::script::Builder::new()
        .push_int(height as i64)
        .push_slice(&[0u8; 32]) // Extra nonce for uniqueness
        .into_script();

    let input = TxIn {
        previous_output: OutPoint::null(),
        script_sig,
        sequence: Sequence::MAX,
        witness: Witness::default(),
    };

    let output = TxOut {
        value: Amount::from_sat(REGTEST_COINBASE_SUBSIDY),
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

fn unix_time_regtest() -> u32 {
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
