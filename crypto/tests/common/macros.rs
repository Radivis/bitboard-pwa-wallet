pub mod function_name_macro {
    /// Macro that extracts the module name and function name, returning "{module}-{function}".
    /// Usage: `let name = function_name!();`
    ///
    /// This macro first tries to extract the test name from environment variables (nextest/cargo test),
    /// then falls back to backtrace extraction if that fails.
    #[macro_export]
    macro_rules! function_name {
        () => {{
            // First, try to extract from environment variables (works with nextest and cargo test)
            // Nextest sets NEXTEST_TEST_NAME (v0.9.116+), cargo test uses --exact argument
            let mut module_and_function = None;

            // Helper closure to extract module and function from test path
            let extract_from_test_path = |test_path: &str| -> Option<String> {
                // Test path formats:
                // - "api::module::function_name" (api binary, 3 parts)
                // - "subscription_token::get_token_..." (api-e2e binary, 2 parts - no "api" in path)
                let parts: Vec<&str> = test_path.split("::").collect();

                let (module, function) = if let Some(api_idx) = parts.iter().position(|s| *s == "api" || s.contains("api")) {
                    // api binary: api::module::function
                    if api_idx + 2 < parts.len() {
                        (parts[api_idx + 1], parts[api_idx + 2])
                    } else {
                        return None;
                    }
                } else if parts.len() == 2 {
                    // api-e2e binary: module::function (no "api" in path)
                    (parts[0], parts[1])
                } else {
                    return None;
                };

                // Validate these look like valid names
                let is_valid_module = !module.starts_with("_")
                    && module != "helpers"
                    && module.chars().all(|c| c.is_alphanumeric() || c == '_');

                let is_valid_func = !function.starts_with("_")
                    && function.chars().any(|c| c.is_alphabetic());

                if is_valid_module && is_valid_func {
                    Some(format!("{}-{}", module, function))
                } else {
                    None
                }
            };

            // Try NEXTEST_TEST_NAME first
            if let Ok(test_path) = std::env::var("NEXTEST_TEST_NAME") {
                module_and_function = extract_from_test_path(&test_path);
            }

            // Try --exact argument (cargo test)
            if module_and_function.is_none() {
                if let Some(test_path) = std::env::args()
                    .skip_while(|arg| arg != "--exact")
                    .nth(1)
                {
                    module_and_function = extract_from_test_path(&test_path);
                }
            }

            // If environment variable extraction failed, try backtrace extraction
            let mut frame_count = 0;
            let mut all_names = Vec::new();

            if module_and_function.is_none() {
                backtrace::trace(|frame| {
                    frame_count += 1;
                    // Skip the first frame (this macro itself)
                    if frame_count == 1 {
                        return true; // Continue to next frame
                    }

                    backtrace::resolve(frame.ip(), |symbol| {
                        if module_and_function.is_none() {
                            if let Some(name) = symbol.name() {
                                let name_str = name.to_string();
                                all_names.push(name_str.clone());

                                // Look for test functions - they can be in various formats:
                                // - "api::module::function_name" (mangled test binary)
                                // - "zero2prod::tests::api::module::function_name" (unmangled)
                                // We want to find functions that are NOT closures, helpers, or internal symbols
                                let is_test_function = (name_str.contains("api::") && !name_str.contains("helpers::"))
                                    || name_str.contains("tests::api")
                                    || (name_str.contains("::tests::") && !name_str.contains("helpers::"));

                                if is_test_function {
                                    // Extract module and function name from mangled format
                                    // e.g., "api::health_check::health_check_works::h87ccb05bfd20b6d2"
                                    // We want "health_check-health_check_works" (module-function)

                                    let parts: Vec<&str> = name_str.split("::").collect();

                                    // Filter out hash suffixes and invalid parts
                                    let relevant_parts: Vec<&str> = parts
                                        .iter()
                                        .filter(|s| {
                                            let s = s.trim();
                                            // Filter out hash suffixes (h followed by hex digits, length > 10)
                                            !(s.starts_with('h') && s.len() > 10 && s.chars().skip(1).all(|c| c.is_ascii_hexdigit()))
                                                && !s.contains("{{closure}}")
                                                && !s.starts_with('<')
                                                && !s.is_empty()
                                        })
                                        .copied()
                                        .collect();

                                    // Pattern: api::module::function or tests::api::module::function
                                    // Find where "api" appears, then module is next, function is after that
                                    if let Some(api_idx) = relevant_parts.iter().position(|s| *s == "api" || s.contains("api")) {
                                        if api_idx + 2 < relevant_parts.len() {
                                            let candidate_module = relevant_parts[api_idx + 1];
                                            let candidate_func = relevant_parts[api_idx + 2];

                                            // Validate these look like valid names
                                            let is_valid_module = !candidate_module.starts_with("_")
                                                && !candidate_module.contains("helpers")
                                                && candidate_module.chars().all(|c| c.is_alphanumeric() || c == '_');

                                            let is_valid_func = !candidate_func.starts_with("function_name")
                                                && !candidate_func.contains("spawn_app")
                                                && !candidate_func.contains("helpers::")
                                                && !candidate_func.contains("test_app::")
                                                && !candidate_func.starts_with("_")
                                                && candidate_func.chars().any(|c| c.is_alphabetic());

                                            if is_valid_module && is_valid_func {
                                                module_and_function = Some(format!("{}-{}", candidate_module, candidate_func));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });
                    module_and_function.is_none() // Continue until we find a function name
                });
            }

            module_and_function.unwrap_or_else(|| {
                // Last resort fallback: use a UUID
                // This ensures tests can run in CI even if extraction fails
                // The UUID is deterministic based on thread ID to provide some consistency
                let thread_id = std::thread::current().id();
                let fallback_name = format!("unknown-{:?}", thread_id)
                    .replace("ThreadId(", "")
                    .replace(")", "");

                // Log warning about fallback
                eprintln!(
                    "WARNING: Failed to extract test name, using fallback: {}\n\
                     This may cause database conflicts if multiple tests run concurrently.\n\
                     Environment variables: {}\n\
                     Command line args: {}",
                    fallback_name,
                    std::env::vars()
                        .filter(|(k, _)| k.starts_with("NEXTEST"))
                        .map(|(k, v)| format!("{}={}", k, v))
                        .collect::<Vec<_>>()
                        .join(", "),
                    std::env::args().collect::<Vec<_>>().join(" ")
                );

                fallback_name
            })
        }};
    }

    pub use function_name;
}
