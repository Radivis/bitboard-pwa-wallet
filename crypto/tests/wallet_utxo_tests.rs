#![cfg(not(target_arch = "wasm32"))]

mod common;

use bitboard_crypto::wallet;
use common::wallet_fixtures::{
    DEFAULT_ADDRESS_TYPE, DEFAULT_NETWORK, create_test_wallet, fund_test_wallet,
};

const FUNDING_AMOUNT: u64 = 100_000;

fn funded_wallet() -> bdk_wallet::Wallet {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    fund_test_wallet(&mut wallet, FUNDING_AMOUNT);
    wallet
}

#[test]
fn list_wallet_utxos_returns_funded_outputs() {
    let wallet = funded_wallet();
    let utxos = wallet::list_wallet_utxos(&wallet);

    assert_eq!(utxos.len(), 1, "funded wallet should expose one UTXO");
    assert_eq!(utxos[0].amount_sats, FUNDING_AMOUNT);
    assert!(!utxos[0].address.is_empty());
    assert!(!utxos[0].txid.is_empty());
    assert_eq!(utxos[0].vout, 0);
    assert!(utxos[0].is_confirmed);
}
