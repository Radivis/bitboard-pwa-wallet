#[cfg(test)]
mod persistence_tests {
    use crate::persistence::{
        BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistenceV2, JsonPersistenceDb,
    };

    #[test]
    fn persistence_v2_round_trip_json() {
        let envelope = BitboardArkPersistenceV2::empty();
        let json = serde_json::to_string(&envelope).expect("serialize");
        let (parsed, reset_v1) = BitboardArkPersistenceV2::parse_import(Some(&json));
        assert!(!reset_v1);
        assert_eq!(parsed.version, BITBOARD_ARK_PERSISTENCE_VERSION);
    }

    #[test]
    fn persistence_v1_import_resets() {
        let v1 = r#"{"version":1,"wallet":{},"contract":{}}"#;
        let (parsed, reset_v1) = BitboardArkPersistenceV2::parse_import(Some(v1));
        assert!(reset_v1);
        assert_eq!(parsed.version, BITBOARD_ARK_PERSISTENCE_VERSION);
    }

    #[test]
    fn shared_db_default_snapshot() {
        let db = JsonPersistenceDb::default();
        assert!(db.snapshot().boarding_outputs.is_empty());
    }
}
