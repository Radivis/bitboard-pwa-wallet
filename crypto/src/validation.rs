//! Validation helpers for WASM boundary inputs (e.g. fee rate from JS).

use crate::error::CryptoError;

/// Maximum allowed fee rate (sat/vB). Prevents overflow or nonsensical values from JS.
const MAX_FEE_RATE_SAT_PER_VB: f64 = 1_000_000.0;

/// Validates `fee_rate_sat_per_vb` from JS: must be finite, positive, and below max.
/// Returns the rate as `u64` (ceiled) for use with `FeeRate::from_sat_per_vb_unchecked`.
pub fn validate_fee_rate_sat_per_vb(rate: f64) -> Result<u64, CryptoError> {
    if !rate.is_finite() {
        return Err(CryptoError::Transaction(
            "Fee rate must be finite (not NaN or Infinity)".to_string(),
        ));
    }
    if rate <= 0.0 {
        return Err(CryptoError::Transaction(
            "Fee rate must be greater than zero".to_string(),
        ));
    }
    if rate > MAX_FEE_RATE_SAT_PER_VB {
        return Err(CryptoError::Transaction(format!(
            "Fee rate must not exceed {} sat/vB",
            MAX_FEE_RATE_SAT_PER_VB as u64
        )));
    }
    Ok(rate.ceil() as u64)
}
