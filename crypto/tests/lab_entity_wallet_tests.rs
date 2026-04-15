//! Native tests for lab entity ephemeral wallets (no WASM).

use std::str::FromStr;

use bitboard_crypto::lab_entity_wallet;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use bitcoin::Address;
use bitcoin::Network;

#[test]
fn lab_entity_create_and_sign_foreign_utxo() {
    let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    let created = lab_entity_wallet::create_lab_entity_wallet(
        mnemonic,
        BitcoinNetwork::Regtest,
        AddressType::Segwit,
        0,
    )
    .expect("create lab entity wallet");

    let first = &created.first_address;
    let addr = Address::from_str(first)
        .unwrap()
        .require_network(Network::Regtest)
        .unwrap();
    let script_hex = hex::encode(addr.script_pubkey().as_bytes());
    let utxos_json = format!(
        r#"[{{"txid":"{}","vout":0,"amount_sats":50000,"script_pubkey_hex":"{}","address":"{}"}}]"#,
        "a".repeat(64),
        script_hex,
        first
    );

    let (pay_to, _) = lab_entity_wallet::lab_entity_reveal_next_external_address(
        mnemonic,
        &created.changeset_json,
        BitcoinNetwork::Regtest,
        AddressType::Segwit,
        0,
    )
    .expect("second external for payment destination");

    let out = lab_entity_wallet::lab_entity_build_and_sign_lab_transaction(
        lab_entity_wallet::LabEntityBuildSignArgs {
            mnemonic,
            changeset_json: &created.changeset_json,
            network: BitcoinNetwork::Regtest,
            address_type: AddressType::Segwit,
            account_id: 0,
            utxos_json: &utxos_json,
            to_address: &pay_to,
            amount_sats: 40_000,
            fee_rate_sat_per_vb: 1.0,
            apply_change_free_bump: false,
        },
    )
    .expect("build and sign");

    assert!(!out.signed_tx_hex.is_empty());
    assert!(out.fee_sats > 0);
    assert!(out.has_change);
    assert!(!out.changeset_json.is_empty());
    let change_addr = out
        .change_address
        .as_deref()
        .expect("change address when has_change");
    assert!(!change_addr.is_empty());
}
