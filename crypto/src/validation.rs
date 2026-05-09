//! Validation helpers for WASM boundary inputs (e.g. fee rate from JS).

use bitcoin::FeeRate;

use crate::error::CryptoError;

/// Maximum allowed fee rate (sat/vB). Prevents overflow or nonsensical values from JS.
const MAX_FEE_RATE_SAT_PER_VB: f64 = 1_000_000.0;

/// `FeeRate::from_sat_per_vb_unchecked(sat_vb)` uses `sat_vb * (1000 / 4)` sat/kwu (`rust-bitcoin`).
const SAT_PER_KWU_PER_SAT_VB: u64 = 250;

/// Validates `fee_rate_sat_per_vb` from JS: must be finite, positive, and below max.
#[inline]
pub fn validate_fee_rate_sat_per_vb(rate: f64) -> Result<(), CryptoError> {
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
    Ok(())
}

/// Maps fractional sat/vB to [`FeeRate`] by rounding to nearest **satoshi per kilo-weight-unit**.
/// Matches integer `FeeRate::from_sat_per_vb(u64)` when `rate` is a whole number.
pub fn fee_rate_from_sat_per_vb_float(rate_sat_per_vb: f64) -> Result<FeeRate, CryptoError> {
    validate_fee_rate_sat_per_vb(rate_sat_per_vb)?;
    let scaled = rate_sat_per_vb * SAT_PER_KWU_PER_SAT_VB as f64;
    if !scaled.is_finite() || scaled <= 0.0 {
        return Err(CryptoError::Transaction(
            "Fee rate too small after conversion".to_string(),
        ));
    }
    let rounded = scaled.round();
    if rounded <= 0.0 {
        return Err(CryptoError::Transaction(
            "Fee rate rounds to zero; increase sat/vB".to_string(),
        ));
    }
    if rounded > u64::MAX as f64 {
        return Err(CryptoError::Transaction(format!(
            "Fee rate exceeds internal limit (scaled sat/kWU overflow)",
        )));
    }
    let sat_kwu_u64 = rounded as u64;
    if sat_kwu_u64 == 0 {
        return Err(CryptoError::Transaction(
            "Fee rate converts to zero; increase sat/vB".to_string(),
        ));
    }
    Ok(FeeRate::from_sat_per_kwu(sat_kwu_u64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn float_path_matches_integer_from_sat_per_vb() {
        for n in 1u64..=25 {
            let f = fee_rate_from_sat_per_vb_float(n as f64).unwrap();
            let i = FeeRate::from_sat_per_vb(n).expect("within range");
            assert_eq!(f, i, "mismatch at {n} sat/vB");
        }
    }

    #[test]
    fn point_two_sat_per_vb_is_not_ceiled_to_one() {
        let fr = fee_rate_from_sat_per_vb_float(0.2_f64).unwrap();
        let one_sat_vb = FeeRate::from_sat_per_vb(1).expect("within range");
        assert_ne!(
            fr.to_sat_per_kwu(),
            one_sat_vb.to_sat_per_kwu(),
            "0.2 sat/vB must not quantize to same FeeRate as integer 1 sat/vB",
        );
    }

    #[test]
    fn point_five_lab_low_preset() {
        let _ = fee_rate_from_sat_per_vb_float(0.5_f64).expect("0.5 valid");
    }
}
