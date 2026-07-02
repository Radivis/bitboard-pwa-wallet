//! Incremental Server-Sent Events (SSE) parser for long-lived HTTP streams.
//!
//! HTTP clients may deliver partial lines across multiple chunks; the previous
//! implementation treated each chunk as a complete event and dropped or mis-parsed
//! payloads split across reads (common in browser/WASM streaming).

use crate::Error;
use futures::Stream;
use futures::StreamExt;
use std::collections::VecDeque;

/// Accumulates SSE `data:` lines until a blank line terminates an event.
#[derive(Default)]
pub(crate) struct SseEventParser {
    line_buffer: String,
    pending_data_lines: Vec<String>,
}

impl SseEventParser {
    pub fn push_chunk(&mut self, chunk: &[u8]) -> Vec<String> {
        self.line_buffer
            .push_str(&String::from_utf8_lossy(chunk));

        let mut payloads = Vec::new();

        while let Some(newline_index) = self.line_buffer.find('\n') {
            let mut line = self.line_buffer[..newline_index].to_string();
            self.line_buffer.drain(..=newline_index);

            if line.ends_with('\r') {
                line.pop();
            }

            if line.is_empty() {
                if !self.pending_data_lines.is_empty() {
                    payloads.push(self.pending_data_lines.join("\n"));
                    self.pending_data_lines.clear();
                }
                continue;
            }

            if line.starts_with(':') {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                self.pending_data_lines.push(data.to_string());
            } else if let Some(data) = line.strip_prefix("data:") {
                self.pending_data_lines.push(data.to_string());
            }
        }

        payloads
    }
}

/// Map a byte stream of SSE frames into UTF-8 JSON payload strings (one per event).
pub(crate) fn sse_json_payload_stream<S>(
    byte_stream: S,
) -> impl Stream<Item = Result<String, Error>> + Unpin
where
    S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Unpin,
{
    Box::pin(futures::stream::unfold(
        (
            byte_stream,
            SseEventParser::default(),
            VecDeque::<String>::new(),
        ),
        |(mut byte_stream, mut parser, mut pending)| async move {
            loop {
                if let Some(payload) = pending.pop_front() {
                    return Some((Ok(payload), (byte_stream, parser, pending)));
                }

                match byte_stream.next().await {
                    Some(Ok(bytes)) => {
                        for payload in parser.push_chunk(bytes.as_ref()) {
                            pending.push_back(payload);
                        }
                    }
                    Some(Err(error)) => {
                        return Some((Err(Error::request(error)), (byte_stream, parser, pending)));
                    }
                    None => return None,
                }
            }
        },
    ))
}
