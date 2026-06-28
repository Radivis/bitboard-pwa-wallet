//! OpenAPI `style: simple` query arrays must use repeated keys (`?scripts=a&scripts=b`).
//!
//! The openapi-generator Rust client defaults to comma-joining into one value (`?scripts=a,b`),
//! which breaks operator endpoints that validate each value independently (e.g. vtxo scripts
//! must each be hex).

/// Build `(param, value)` pairs for reqwest `.query()` from a simple-style array parameter.
pub fn repeated_simple_query_pairs<'a>(
    param_name: &'a str,
    values: &'a [String],
) -> Vec<(&'a str, &'a str)> {
    values
        .iter()
        .map(|value| (param_name, value.as_str()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_simple_query_pairs_preserves_each_value() {
        let scripts = vec!["5120ab".to_string(), "5120cd".to_string()];
        let pairs = repeated_simple_query_pairs("scripts", &scripts);
        assert_eq!(
            pairs,
            vec![("scripts", "5120ab"), ("scripts", "5120cd")]
        );
    }
}
