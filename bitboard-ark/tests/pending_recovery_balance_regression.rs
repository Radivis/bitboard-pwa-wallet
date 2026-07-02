//! Regression tests for signer-aware offchain balance classification (pending recovery).

use std::collections::HashMap;
use std::str::FromStr;

use ark_client::compute_offchain_balance;
use ark_core::VtxoList;
use ark_core::server::{DeprecatedSigner, Info, VirtualTxOutPoint};
use bitcoin::address::NetworkUnchecked;
use bitcoin::hashes::Hash;
use bitcoin::secp256k1::PublicKey;
use bitcoin::{Amount, Network, OutPoint, ScriptBuf, Txid, XOnlyPublicKey};

const PK_CURRENT: &str = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const PK_DEPRECATED: &str = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

fn public_key(hex: &str) -> PublicKey {
    PublicKey::from_str(hex).expect("valid key")
}

fn deprecated_server_pk() -> XOnlyPublicKey {
    public_key(PK_DEPRECATED).x_only_public_key().0
}

fn test_server_info(current_hex: &str, deprecated: Vec<(&str, i64)>) -> Info {
    let dummy_address: bitcoin::Address<NetworkUnchecked> =
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
            .parse()
            .unwrap();
    Info {
        version: "1".into(),
        signer_pk: public_key(current_hex),
        forfeit_pk: public_key(current_hex),
        forfeit_address: dummy_address.assume_checked(),
        checkpoint_tapscript: ScriptBuf::new(),
        network: Network::Signet,
        session_duration: 0,
        unilateral_exit_delay: bitcoin::Sequence::ZERO,
        boarding_exit_delay: bitcoin::Sequence::ZERO,
        utxo_min_amount: None,
        utxo_max_amount: None,
        vtxo_min_amount: None,
        vtxo_max_amount: None,
        dust: Amount::ZERO,
        fees: None,
        scheduled_session: None,
        deprecated_signers: deprecated
            .into_iter()
            .map(|(key, cutoff)| DeprecatedSigner {
                pk: public_key(key),
                cutoff_date: cutoff,
            })
            .collect(),
        service_status: HashMap::new(),
        digest: String::new(),
        max_tx_weight: 0,
        max_op_return_outputs: 0,
    }
}

fn sample_confirmed_vtxo(amount_sats: u64, script: ScriptBuf) -> VirtualTxOutPoint {
    let future_expiry = 2_000_000_000_i64;
    VirtualTxOutPoint {
        outpoint: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
        created_at: future_expiry - 86_400,
        expires_at: future_expiry,
        amount: Amount::from_sat(amount_sats),
        script,
        is_preconfirmed: false,
        is_swept: false,
        is_unrolled: false,
        is_spent: false,
        spent_by: None,
        commitment_txids: vec![],
        settled_by: None,
        ark_txid: None,
        assets: vec![],
    }
}

#[test]
fn compute_offchain_balance_pending_recovery_for_expired_signer() {
    let script = ScriptBuf::from_bytes(vec![0x51]);
    let vtxo = sample_confirmed_vtxo(50_000, script.clone());
    let vtxo_list = VtxoList::new(Amount::from_sat(330), vec![vtxo]);
    let server_info = test_server_info(PK_CURRENT, vec![(PK_DEPRECATED, 500_000)]);
    let now = 1_000_000_i64;
    let deprecated_pk = deprecated_server_pk();

    let balance = compute_offchain_balance(
        &vtxo_list,
        |lookup_script| {
            if lookup_script == &script {
                Some(deprecated_pk)
            } else {
                None
            }
        },
        &server_info,
        now,
    )
    .expect("balance");

    assert_eq!(balance.confirmed().to_sat(), 0);
    assert_eq!(balance.pending_recovery().to_sat(), 50_000);
    assert_eq!(balance.total().to_sat(), 50_000);
}
