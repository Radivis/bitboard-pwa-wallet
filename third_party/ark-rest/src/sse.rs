//! Incremental Server-Sent Events (`data:` line) parsing for chunked HTTP bodies.

use std::collections::VecDeque;

use futures::Stream;
use futures::StreamExt;

use crate::Error;

/// Buffers incomplete SSE lines across HTTP body chunks.
#[derive(Default)]
pub(crate) struct SseDataLineBuffer {
    pending: String,
}

impl SseDataLineBuffer {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Append a chunk and return payloads from any newly completed `data:` lines.
    pub(crate) fn push_chunk(&mut self, chunk: &[u8]) -> Result<Vec<String>, Error> {
        let text = std::str::from_utf8(chunk).map_err(Error::conversion)?;
        self.pending.push_str(text);

        let mut payloads = Vec::new();
        while let Some(newline_index) = self.pending.find('\n') {
            let line = self.pending[..newline_index].to_string();
            self.pending.drain(..=newline_index);

            let line = line.trim_end_matches('\r').trim();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            if let Some(data) = line.strip_prefix("data: ") {
                payloads.push(data.to_string());
            }
        }
        Ok(payloads)
    }
}

pub(crate) async fn poll_next_sse_event<S, T, F, B>(
    byte_stream: &mut S,
    line_buffer: &mut SseDataLineBuffer,
    pending_events: &mut VecDeque<Result<T, Error>>,
    parse_line: &mut F,
) -> Option<Result<T, Error>>
where
    S: Stream<Item = Result<B, reqwest::Error>> + Unpin,
    B: AsRef<[u8]>,
    F: FnMut(&str) -> Result<T, Error>,
{
    if let Some(event) = pending_events.pop_front() {
        return Some(event);
    }

    loop {
        match byte_stream.next().await {
            Some(Ok(chunk)) => {
                let data_lines = match line_buffer.push_chunk(chunk.as_ref()) {
                    Ok(lines) => lines,
                    Err(error) => return Some(Err(error)),
                };
                for data_line in data_lines {
                    pending_events.push_back(parse_line(&data_line));
                }
                if let Some(event) = pending_events.pop_front() {
                    return Some(event);
                }
            }
            Some(Err(error)) => return Some(Err(Error::request(error))),
            None => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_data_line_split_across_chunks() {
        let mut buffer = SseDataLineBuffer::new();
        assert!(buffer.push_chunk(b"data: {\"stream").unwrap().is_empty());
        let lines = buffer
            .push_chunk(b"Started\":{\"id\":\"x\"}}\n\n")
            .unwrap();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("streamStarted"));
    }

    #[test]
    fn skips_heartbeats_and_comments() {
        let mut buffer = SseDataLineBuffer::new();
        let chunk = b": comment\ndata: {\"heartbeat\":1}\n\ndata: {\"streamStarted\":{\"id\":\"y\"}}\n\n";
        let lines = buffer.push_chunk(chunk).unwrap();
        assert_eq!(lines.len(), 2);
    }
}
