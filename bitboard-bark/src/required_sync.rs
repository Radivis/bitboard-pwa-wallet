//! Mailbox, pending Arkoor, pending rounds, and boards must succeed before a
//! Bark sync is stamped. `Wallet::sync` only logs those errors.

use std::future::Future;

/// Runs the four required steps in order. The first error fails the sync.
/// Later steps are not polled.
pub async fn require_mailbox_arkoor_rounds_and_boards(
    sync_mailbox: impl Future<Output = Result<(), String>>,
    sync_pending_arkoor_sends: impl Future<Output = Result<(), String>>,
    sync_pending_rounds: impl Future<Output = Result<(), String>>,
    sync_pending_boards: impl Future<Output = Result<(), String>>,
) -> Result<(), String> {
    sync_mailbox.await?;
    sync_pending_arkoor_sends.await?;
    sync_pending_rounds.await?;
    sync_pending_boards.await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::future::Future;
    use std::sync::{Arc, Mutex};

    use super::require_mailbox_arkoor_rounds_and_boards;

    fn record_step(
        ran: &Arc<Mutex<Vec<&'static str>>>,
        step_name: &'static str,
        result: Result<(), String>,
    ) -> impl Future<Output = Result<(), String>> {
        let ran = Arc::clone(ran);
        async move {
            ran.lock().expect("step log").push(step_name);
            result
        }
    }

    async fn run_required_steps(
        mailbox: Result<(), String>,
        pending_arkoor: Result<(), String>,
        pending_rounds: Result<(), String>,
        pending_boards: Result<(), String>,
    ) -> (Result<(), String>, Vec<&'static str>) {
        let ran = Arc::new(Mutex::new(Vec::new()));
        let result = require_mailbox_arkoor_rounds_and_boards(
            record_step(&ran, "mailbox", mailbox),
            record_step(&ran, "arkoor", pending_arkoor),
            record_step(&ran, "rounds", pending_rounds),
            record_step(&ran, "boards", pending_boards),
        )
        .await;
        let ran_steps = ran.lock().expect("step log").clone();
        (result, ran_steps)
    }

    #[tokio::test]
    async fn a_mailbox_error_fails_the_sync_before_later_steps() {
        let (result, ran_steps) = run_required_steps(
            Err("mailbox sync failed".to_owned()),
            Ok(()),
            Ok(()),
            Ok(()),
        )
        .await;

        assert_eq!(result, Err("mailbox sync failed".to_owned()));
        assert_eq!(ran_steps, ["mailbox"]);
    }

    #[tokio::test]
    async fn a_pending_arkoor_error_fails_the_sync_before_later_steps() {
        let (result, ran_steps) = run_required_steps(
            Ok(()),
            Err("pending arkoor sync failed".to_owned()),
            Ok(()),
            Ok(()),
        )
        .await;

        assert_eq!(result, Err("pending arkoor sync failed".to_owned()));
        assert_eq!(ran_steps, ["mailbox", "arkoor"]);
    }

    #[tokio::test]
    async fn a_pending_round_error_fails_the_sync_before_boards() {
        let (result, ran_steps) = run_required_steps(
            Ok(()),
            Ok(()),
            Err("pending round sync failed".to_owned()),
            Ok(()),
        )
        .await;

        assert_eq!(result, Err("pending round sync failed".to_owned()));
        assert_eq!(ran_steps, ["mailbox", "arkoor", "rounds"]);
    }

    #[tokio::test]
    async fn a_board_error_fails_the_sync_once() {
        let (result, ran_steps) = run_required_steps(
            Ok(()),
            Ok(()),
            Ok(()),
            Err("pending board sync failed".to_owned()),
        )
        .await;

        assert_eq!(result, Err("pending board sync failed".to_owned()));
        assert_eq!(ran_steps, ["mailbox", "arkoor", "rounds", "boards"]);
    }

    #[tokio::test]
    async fn successful_required_steps_return_ok_and_run_boards_once() {
        let (result, ran_steps) = run_required_steps(Ok(()), Ok(()), Ok(()), Ok(())).await;

        assert_eq!(result, Ok(()));
        assert_eq!(ran_steps, ["mailbox", "arkoor", "rounds", "boards"]);
    }
}
