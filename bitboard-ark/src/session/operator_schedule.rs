use crate::api_types::OperatorScheduledSessionDto;
use crate::cached_operator_info::CachedScheduledSessionRecord;
use crate::error::ArkResult;

use super::ArkSession;
use super::mappers::current_unix_timestamp;

pub(crate) fn map_operator_scheduled_session_dto(
    record: &CachedScheduledSessionRecord,
    now_unix_secs: i64,
) -> OperatorScheduledSessionDto {
    let in_progress =
        now_unix_secs >= record.next_start_time && now_unix_secs < record.next_end_time;
    OperatorScheduledSessionDto {
        next_start_time: record.next_start_time,
        next_end_time: record.next_end_time,
        period: record.period,
        duration: record.duration,
        in_progress,
    }
}

impl ArkSession {
    pub fn operator_scheduled_session(&self) -> ArkResult<Option<OperatorScheduledSessionDto>> {
        let now = current_unix_timestamp();
        let Some(record) = self.resolve_scheduled_session_record() else {
            return Ok(None);
        };
        Ok(Some(map_operator_scheduled_session_dto(&record, now)))
    }

    fn resolve_scheduled_session_record(&self) -> Option<CachedScheduledSessionRecord> {
        if self.autonomous_mode() {
            return self
                .wallet_db
                .cached_operator_info()
                .and_then(|info| info.scheduled_session);
        }

        if let Ok(server_info) = self.client.server_info()
            && let Some(session) = server_info.scheduled_session.as_ref()
        {
            return Some(CachedScheduledSessionRecord::from_scheduled_session(
                session,
            ));
        }

        self.wallet_db
            .cached_operator_info()
            .and_then(|info| info.scheduled_session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cached_operator_info::CachedScheduledSessionRecord;

    #[test]
    fn map_operator_scheduled_session_marks_in_progress_window() {
        let record = CachedScheduledSessionRecord {
            next_start_time: 1_000,
            next_end_time: 2_000,
            period: 3_600,
            duration: 1_000,
            fees: None,
        };
        let active = map_operator_scheduled_session_dto(&record, 1_500);
        assert!(active.in_progress);

        let upcoming = map_operator_scheduled_session_dto(&record, 500);
        assert!(!upcoming.in_progress);

        let ended = map_operator_scheduled_session_dto(&record, 2_500);
        assert!(!ended.in_progress);
    }
}
