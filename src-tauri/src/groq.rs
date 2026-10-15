use crate::settings::StoredSettings;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::ipc::Channel;
use tokio::sync::Notify;
use std::sync::Arc;

const GROQ_BASE: &str = "https://api.groq.com/openai/v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub request_id: String,
    /// "text" → GPT-OSS (optionally with browser search), "vision" → Qwen vision model
    pub mode: String,
    /// OpenAI-compatible message objects built by the frontend
    pub messages: Vec<Value>,
    #[serde(default)]
    pub web_search: bool,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    Start { model: String },
    Content { delta: String },
    Reasoning { delta: String },
    Tools { tools: Value },
    Usage { usage: Value },
    /// Rate-limited: the backend will retry automatically after `seconds`.
    Waiting { seconds: f64, reason: String },
    Done,
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .user_agent("SachalAI-Desktop/0.1")
        .build()
        .expect("failed to build HTTP client")
}

fn build_body(s: &StoredSettings, req: &ChatRequest) -> (String, Value) {
    let vision = req.mode == "vision";
    let model = if vision { s.vision_model.clone() } else { s.text_model.clone() };

    let mut messages: Vec<Value> = Vec::with_capacity(req.messages.len() + 1);
    if !s.system_prompt.trim().is_empty() {
        let today = chrono_like_today();
        messages.push(json!({
            "role": "system",
            "content": format!("{}\nCurrent date: {today}.", s.system_prompt.trim())
        }));
    }
    messages.extend(req.messages.iter().cloned());

    let max_tokens = if vision { s.vision_max_tokens } else { s.max_tokens };
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "temperature": s.temperature,
        "max_completion_tokens": max_tokens,
    });

    let lower = model.to_lowercase();
    if lower.starts_with("openai/gpt-oss") {
        body["reasoning_effort"] = json!(s.reasoning_effort);
        body["include_reasoning"] = json!(true);
        if req.web_search && !vision {
            body["tools"] = json!([{ "type": "browser_search" }]);
            body["tool_choice"] = json!("required");
        }
    } else if lower.contains("qwen") {
        body["reasoning_format"] = json!("parsed");
        body["reasoning_effort"] = json!(s.vision_reasoning_effort);
    }

    (model, body)
}

/// Lightweight UTC date (YYYY-MM-DD) without pulling in chrono.
fn chrono_like_today() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    // Civil-from-days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn error_parts(body: &str) -> (String, String) {
    let parsed = serde_json::from_str::<Value>(body).ok();
    let code = parsed
        .as_ref()
        .and_then(|v| v["error"]["code"].as_str().map(str::to_string))
        .unwrap_or_default();
    let msg = parsed
        .as_ref()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_else(|| body.chars().take(400).collect());
    (code, msg)
}

fn extract_error(status: reqwest::StatusCode, body: &str) -> String {
    let (code, msg) = error_parts(body);
    if code == "context_length_exceeded" {
        return "The web pages found were too large for the model's context. Click Retry, or ask a more specific question.".into();
    }
    match status.as_u16() {
        401 => format!("Invalid Groq API key. Open Settings and paste a valid key. ({msg})"),
        429 => format!("Groq free-tier rate limit reached. Wait a minute and click Retry.\n\n{msg}"),
        _ => format!("Groq API error {}: {msg}", status.as_u16()),
    }
}

/// Parses "try again in 41.94s" / "in 1m2.5s" / "in 850ms" from a Groq error message.
fn parse_retry_secs(msg: &str) -> Option<f64> {
    let start = msg.find("try again in ")? + "try again in ".len();
    let token: String = msg[start..]
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '.')
        .collect();
    let token = token.trim_end_matches('.');
    if let Some(ms) = token.strip_suffix("ms") {
        return ms.parse::<f64>().ok().map(|v| v / 1000.0);
    }
    let token = token.strip_suffix('s')?;
    match token.split_once('m') {
        Some((m, s)) => Some(m.parse::<f64>().ok()? * 60.0 + s.parse::<f64>().unwrap_or(0.0)),
        None => token.parse::<f64>().ok(),
    }
}

/// Parses "Limit 1000" from a Groq rate-limit message.
fn parse_limit(msg: &str) -> Option<u64> {
    let start = msg.find("Limit ")? + "Limit ".len();
    msg[start..].chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().ok()
}

/// Handles one SSE `data:` payload. Returns Ok(true) when the stream signalled completion.
fn handle_payload(payload: &str, ch: &Channel<StreamEvent>) -> Result<bool, String> {
    if payload == "[DONE]" {
        return Ok(true);
    }
    let v: Value = match serde_json::from_str(payload) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    if let Some(err) = v.get("error") {
        let msg = err["message"].as_str().unwrap_or("Unknown streaming error");
        return Err(msg.to_string());
    }
    if let Some(choice) = v["choices"].get(0) {
        let delta = &choice["delta"];
        if let Some(r) = delta["reasoning"].as_str() {
            if !r.is_empty() {
                let _ = ch.send(StreamEvent::Reasoning { delta: r.to_string() });
            }
        }
        if let Some(c) = delta["content"].as_str() {
            if !c.is_empty() {
                let _ = ch.send(StreamEvent::Content { delta: c.to_string() });
            }
        }
        if let Some(t) = delta.get("executed_tools") {
            if !t.is_null() {
                let _ = ch.send(StreamEvent::Tools { tools: t.clone() });
            }
        }
    }
    if let Some(u) = v.get("x_groq").and_then(|x| x.get("usage")) {
        let _ = ch.send(StreamEvent::Usage { usage: u.clone() });
    } else if let Some(u) = v.get("usage") {
        if !u.is_null() {
            let _ = ch.send(StreamEvent::Usage { usage: u.clone() });
        }
    }
    Ok(false)
}

pub async fn stream_chat(
    settings: StoredSettings,
    req: ChatRequest,
    ch: Channel<StreamEvent>,
    cancel: Arc<Notify>,
) -> Result<(), String> {
    if settings.api_key.trim().is_empty() {
        return Err("No Groq API key configured. Open Settings → paste your key from console.groq.com/keys.".into());
    }
    let (model, mut body) = build_body(&settings, &req);
    let _ = ch.send(StreamEvent::Start { model });

    const MAX_ATTEMPTS: u32 = 4;
    let mut attempt = 0;
    let resp = loop {
        attempt += 1;
        let send = client()
            .post(format!("{GROQ_BASE}/chat/completions"))
            .bearer_auth(settings.api_key.trim())
            .json(&body)
            .send();

        let resp = tokio::select! {
            r = send => r.map_err(|e| format!("Network error: {e}"))?,
            _ = cancel.notified() => return Ok(()),
        };

        let status = resp.status();
        if status.is_success() {
            break resp;
        }

        let header_wait = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<f64>().ok());
        let text = resp.text().await.unwrap_or_default();

        if status.as_u16() == 429 && attempt < MAX_ATTEMPTS {
            let (_, msg) = error_parts(&text);

            // "Request too large … Limit 1000, Requested 1293": shrink the output budget and retry now.
            if msg.contains("Request too large") {
                if let Some(limit) = parse_limit(&msg) {
                    let current = body["max_completion_tokens"].as_u64().unwrap_or(u64::MAX);
                    let target = (limit * 9 / 10).max(256);
                    if target < current {
                        body["max_completion_tokens"] = json!(target);
                        continue;
                    }
                }
            }

            // Per-minute quota used up: wait the suggested time, then retry.
            let wait = parse_retry_secs(&msg).or(header_wait).unwrap_or(10.0);
            if wait <= 75.0 {
                let wait = wait + 0.5;
                let reason = if msg.contains("(OTPM)") {
                    "output tokens per minute"
                } else if msg.contains("(TPM)") {
                    "tokens per minute"
                } else if msg.contains("(RPM)") {
                    "requests per minute"
                } else {
                    "rate limit"
                };
                let _ = ch.send(StreamEvent::Waiting { seconds: wait, reason: reason.into() });
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs_f64(wait)) => {},
                    _ = cancel.notified() => return Ok(()),
                }
                continue;
            }
        }
        return Err(extract_error(status, &text));
    };

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::with_capacity(8192);

    loop {
        let next = tokio::select! {
            n = stream.next() => n,
            _ = cancel.notified() => return Ok(()),
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|e| format!("Stream interrupted: {e}"))?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if let Some(payload) = line.strip_prefix("data:") {
                if handle_payload(payload.trim(), &ch)? {
                    return Ok(());
                }
            }
        }
    }
    // flush any trailing line without newline
    let rest = String::from_utf8_lossy(&buf).trim().to_string();
    if let Some(payload) = rest.strip_prefix("data:") {
        handle_payload(payload.trim(), &ch)?;
    }
    Ok(())
}

/// Validates a key by listing models. Returns the available model ids.
pub async fn list_models(api_key: &str) -> Result<Vec<String>, String> {
    if api_key.trim().is_empty() {
        return Err("API key is empty".into());
    }
    let resp = client()
        .get(format!("{GROQ_BASE}/models"))
        .bearer_auth(api_key.trim())
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(extract_error(status, &text));
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = v["data"]
        .as_array()
        .map(|a| a.iter().filter_map(|m| m["id"].as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    ids.sort();
    Ok(ids)
}
