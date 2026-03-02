// This binary is used by E2E tests to spawn a test backend server
// User creation is now handled by the frontend fixtures via REST API
// Build with: cargo build --bin spawn_test_server --features e2e-tests

#[cfg(feature = "e2e-tests")]
use std::io::{self, Write};
#[cfg(feature = "e2e-tests")]
use zero2prod::test_support::spawn_app;

#[cfg(feature = "e2e-tests")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Check for --check-features flag to verify build configuration
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--check-features" {
        println!("e2e-tests feature: ENABLED");
        return Ok(());
    }

    // Note: Tracing is initialized by helpers.rs
    // If TEST_LOG=1 is set in the environment, it will output to stdout
    // which will be captured by the Node.js process

    // Get test name from environment variable or use default
    let test_name =
        std::env::var("TEST_NAME").unwrap_or_else(|_| format!("e2e-{}", uuid::Uuid::new_v4()));

    // Spawn a clean test app (no user - users are created via frontend fixtures)
    let app = spawn_app(&test_name).await;
    let address = app.address.clone();
    let port = app.port;

    // Wait for the server to be ready
    let client = reqwest::Client::new();
    let mut attempts = 0;
    let max_attempts = 30;
    while attempts < max_attempts {
        match client.get(format!("{}/health_check", address)).send().await {
            Ok(response) if response.status().is_success() => break,
            _ => {
                attempts += 1;
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }
    if attempts >= max_attempts {
        eprintln!(
            "Warning: Server may not be ready after {} attempts",
            max_attempts
        );
    }

    // Output server information as JSON
    let output = serde_json::json!({
        "port": port,
        "address": address,
        "test_name": test_name
    });

    println!("{}", serde_json::to_string(&output)?);
    io::stdout().flush()?;

    // Keep the server running until we receive a signal or stdin closes
    // This allows Node.js to control the lifecycle
    tokio::signal::ctrl_c().await?;

    Ok(())
}

#[cfg(not(feature = "e2e-tests"))]
fn main() {
    // Check for --check-features flag
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--check-features" {
        println!("e2e-tests feature: DISABLED");
        std::process::exit(1);
    }

    eprintln!("This binary requires the 'e2e-tests' feature to be enabled.");
    eprintln!("Build with: cargo build --bin spawn_test_server --features e2e-tests --release");
    std::process::exit(1);
}
