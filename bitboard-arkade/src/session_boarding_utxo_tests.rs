#[cfg(test)]
mod boarding_utxo_balance_tests {
    use crate::session::mappers::accumulate_boarding_utxo_balance;
    use ark_core::BoardingOutput;
    use ark_core::ExplorerUtxo;
    use bitcoin::Amount;
    use bitcoin::OutPoint;
    use bitcoin::Sequence;
    use bitcoin::Txid;
    use bitcoin::XOnlyPublicKey;
    use bitcoin::key::Secp256k1;
    use std::str::FromStr;
    use std::time::Duration;

    fn sample_boarding_output() -> BoardingOutput {
        let secp = Secp256k1::new();
        let server = XOnlyPublicKey::from_str(
            "18845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
        )
        .expect("valid server key");
        let owner = XOnlyPublicKey::from_str(
            "28845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
        )
        .expect("valid owner key");
        BoardingOutput::new(
            &secp,
            server,
            owner,
            Sequence::from_consensus(144),
            bitcoin::Network::Signet,
        )
        .expect("valid boarding output")
    }

    fn sample_utxo(confirmation_blocktime: Option<u64>, confirmations: u64) -> ExplorerUtxo {
        ExplorerUtxo {
            outpoint: OutPoint {
                txid: Txid::from_str(
                    "0000000000000000000000000000000000000000000000000000000000000001",
                )
                .expect("valid txid"),
                vout: 0,
            },
            amount: Amount::from_sat(50_000),
            confirmation_blocktime,
            confirmations,
            is_spent: false,
        }
    }

    #[test]
    fn zero_confirmation_boarding_utxo_counts_as_pending_even_with_blocktime() {
        let boarding_output = sample_boarding_output();
        let mut spendable_sats = 0;
        let mut pending_sats = 0;
        let mut expired_sats = 0;

        accumulate_boarding_utxo_balance(
            &sample_utxo(Some(1_700_000_000), 0),
            &boarding_output,
            Duration::from_secs(1_700_000_100),
            &mut spendable_sats,
            &mut pending_sats,
            &mut expired_sats,
        );

        assert_eq!(spendable_sats, 0);
        assert_eq!(pending_sats, 50_000);
        assert_eq!(expired_sats, 0);
    }

    #[test]
    fn confirmed_boarding_utxo_counts_as_spendable() {
        let boarding_output = sample_boarding_output();
        let mut spendable_sats = 0;
        let mut pending_sats = 0;
        let mut expired_sats = 0;

        accumulate_boarding_utxo_balance(
            &sample_utxo(Some(1_700_000_000), 1),
            &boarding_output,
            Duration::from_secs(1_700_000_100),
            &mut spendable_sats,
            &mut pending_sats,
            &mut expired_sats,
        );

        assert_eq!(spendable_sats, 50_000);
        assert_eq!(pending_sats, 0);
        assert_eq!(expired_sats, 0);
    }
}
