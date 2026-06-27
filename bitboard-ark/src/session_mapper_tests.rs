#[cfg(test)]
mod send_amount_validation_tests {
    use crate::error::{ArkWasmError, MSG_SEND_AMOUNT_MUST_BE_POSITIVE};
    use crate::session::mappers::validate_send_amount_sats;

    #[test]
    fn validate_send_amount_sats_rejects_zero() {
        let error = validate_send_amount_sats(0).expect_err("zero amount");
        assert!(matches!(error, ArkWasmError::InvalidSendAmount));
        assert_eq!(error.to_string(), MSG_SEND_AMOUNT_MUST_BE_POSITIVE);
    }

    #[test]
    fn validate_send_amount_sats_accepts_positive() {
        validate_send_amount_sats(1).expect("one sat");
        validate_send_amount_sats(21_000_000).expect("large amount");
    }
}

#[cfg(test)]
mod payment_and_history_mapper_tests {
    use crate::constants::{PAYMENT_DIRECTION_INCOMING, PAYMENT_DIRECTION_OUTGOING};
    use crate::error::ArkWasmError;
    use crate::session::mappers::{
        map_history_row, map_intent_fee_configured, parse_outpoint,
        payment_direction_and_amount_sats,
    };
    use ark_core::history::Transaction;
    use ark_core::server::IntentFeeInfo;
    use bitcoin::Amount;
    use bitcoin::SignedAmount;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    #[test]
    fn payment_direction_maps_signed_amounts() {
        assert_eq!(
            payment_direction_and_amount_sats(1_500),
            (PAYMENT_DIRECTION_INCOMING, 1_500)
        );
        assert_eq!(
            payment_direction_and_amount_sats(-2_000),
            (PAYMENT_DIRECTION_OUTGOING, 2_000)
        );
        assert_eq!(
            payment_direction_and_amount_sats(0),
            (PAYMENT_DIRECTION_INCOMING, 0)
        );
    }

    #[test]
    fn parse_outpoint_accepts_valid_txid() {
        let txid_hex = Txid::from_byte_array([0x11; 32]).to_string();
        let outpoint = parse_outpoint(&txid_hex, 3).expect("valid outpoint");
        assert_eq!(outpoint.txid.to_string(), txid_hex);
        assert_eq!(outpoint.vout, 3);
    }

    #[test]
    fn parse_outpoint_rejects_invalid_txid() {
        let error = parse_outpoint("not-a-txid", 0).expect_err("invalid txid");
        assert!(matches!(error, ArkWasmError::InvalidTxid(_)));
    }

    #[test]
    fn map_intent_fee_configured_detects_nonempty_programs() {
        let configured = map_intent_fee_configured(&IntentFeeInfo {
            offchain_input: Some("program".to_string()),
            offchain_output: Some(String::new()),
            onchain_input: None,
            onchain_output: Some("rate".to_string()),
        });

        assert!(configured.offchain_input);
        assert!(!configured.offchain_output);
        assert!(!configured.onchain_input);
        assert!(configured.onchain_output);
    }

    #[test]
    fn map_history_row_maps_transaction_variants() {
        let boarding_txid = Txid::from_byte_array([1; 32]);
        let boarding = map_history_row(Transaction::Boarding {
            txid: boarding_txid,
            amount: Amount::from_sat(42_000),
            confirmed_at: Some(1_700_000_000),
        })
        .expect("boarding row");
        assert_eq!(boarding.direction, PAYMENT_DIRECTION_INCOMING);
        assert_eq!(boarding.amount_sats, 42_000);
        assert_eq!(boarding.timestamp, 1_700_000_000);

        let commitment_txid = Txid::from_byte_array([2; 32]);
        let incoming_commitment = map_history_row(Transaction::Commitment {
            txid: commitment_txid,
            amount: SignedAmount::from_sat(5_000),
            created_at: 1_700_000_100,
        })
        .expect("incoming commitment");
        assert_eq!(incoming_commitment.direction, PAYMENT_DIRECTION_INCOMING);
        assert_eq!(incoming_commitment.amount_sats, 5_000);

        let outgoing_commitment = map_history_row(Transaction::Commitment {
            txid: commitment_txid,
            amount: SignedAmount::from_sat(-7_500),
            created_at: 1_700_000_200,
        })
        .expect("outgoing commitment");
        assert_eq!(outgoing_commitment.direction, PAYMENT_DIRECTION_OUTGOING);
        assert_eq!(outgoing_commitment.amount_sats, 7_500);

        let ark_txid = Txid::from_byte_array([3; 32]);
        let ark_payment = map_history_row(Transaction::Ark {
            txid: ark_txid,
            amount: SignedAmount::from_sat(-1_000),
            is_settled: false,
            created_at: 1_700_000_300,
        })
        .expect("ark payment");
        assert_eq!(ark_payment.direction, PAYMENT_DIRECTION_OUTGOING);
        assert_eq!(ark_payment.amount_sats, 1_000);

        let offboard_txid = Txid::from_byte_array([4; 32]);
        let offboard = map_history_row(Transaction::Offboard {
            commitment_txid: offboard_txid,
            amount: Amount::from_sat(99_000),
            confirmed_at: Some(1_700_000_400),
        })
        .expect("offboard");
        assert_eq!(offboard.direction, PAYMENT_DIRECTION_OUTGOING);
        assert_eq!(offboard.amount_sats, 99_000);
        assert_eq!(offboard.txid, offboard_txid.to_string());
    }
}
