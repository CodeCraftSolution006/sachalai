use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

pub const DEFAULT_TEXT_MODEL: &str = "openai/gpt-oss-20b";
pub const DEFAULT_VISION_MODEL: &str = "qwen/qwen3.8-27b";

/// Settings persisted to `<app_data_dir>/settings.json`.
/// The API key only ever lives here and in Rust memory — it is never sent back to the webview.
#[derive(Serialize, Deserialize, Clone)]
#[serde(default, rename_all = "camelCase")]
pub struct StoredSettings {
    pub api_key: String,
    pub text_model: String,
    pub vision_model: String,
    /// GPT-OSS reasoning effort: low | medium | high
    pub reasoning_effort: String,
    /// Qwen reasoning effort: none | default | low | medium | high
    pub vision_reasoning_effort: String,
    pub temperature: f32,
    pub max_tokens: u32,
    /// Output cap for vision requests (Groq free tier: Qwen OTPM = 1000).
    pub vision_max_tokens: u32,
    pub system_prompt: String,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            text_model: DEFAULT_TEXT_MODEL.into(),
            vision_model: DEFAULT_VISION_MODEL.into(),
            reasoning_effort: "medium".into(),
            vision_reasoning_effort: "default".into(),
            temperature: 0.7,
            max_tokens: 8192,
            vision_max_tokens: 1000,
            system_prompt: "You are SachalAI, a helpful, precise and friendly desktop assistant. \
Format answers with Markdown when it improves readability."
                .into(),
        }
    }
}

/// What the frontend is allowed to see.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PublicSettings {
    pub has_api_key: bool,
    pub api_key_hint: String,
    pub text_model: String,
    pub vision_model: String,
    pub reasoning_effort: String,
    pub vision_reasoning_effort: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub vision_max_tokens: u32,
    pub system_prompt: String,
}

impl From<&StoredSettings> for PublicSettings {
    fn from(s: &StoredSettings) -> Self {
        let key = s.api_key.trim();
        let chars: Vec<char> = key.chars().collect();
        let hint = if chars.len() > 8 {
            let head: String = chars[..4].iter().collect();
            let tail: String = chars[chars.len() - 4..].iter().collect();
            format!("{head}…{tail}")
        } else if key.is_empty() {
            String::new()
        } else {
            "••••".into()
        };
        Self {
            has_api_key: !key.is_empty(),
            api_key_hint: hint,
            text_model: s.text_model.clone(),
            vision_model: s.vision_model.clone(),
            reasoning_effort: s.reasoning_effort.clone(),
            vision_reasoning_effort: s.vision_reasoning_effort.clone(),
            temperature: s.temperature,
            max_tokens: s.max_tokens,
            vision_max_tokens: s.vision_max_tokens,
            system_prompt: s.system_prompt.clone(),
        }
    }
}

/// Partial update sent from the Settings screen.
/// `api_key: None` keeps the current key, `Some("")` clears it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub api_key: Option<String>,
    pub text_model: Option<String>,
    pub vision_model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub vision_reasoning_effort: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub vision_max_tokens: Option<u32>,
    pub system_prompt: Option<String>,
}

impl StoredSettings {
    pub fn apply(&mut self, u: SettingsUpdate) {
        if let Some(v) = u.api_key {
            self.api_key = v.trim().to_string();
        }
        if let Some(v) = u.text_model.filter(|v| !v.trim().is_empty()) {
            self.text_model = v.trim().into();
        }
        if let Some(v) = u.vision_model.filter(|v| !v.trim().is_empty()) {
            self.vision_model = v.trim().into();
        }
        if let Some(v) = u.reasoning_effort {
            self.reasoning_effort = v;
        }
        if let Some(v) = u.vision_reasoning_effort {
            self.vision_reasoning_effort = v;
        }
        if let Some(v) = u.temperature {
            self.temperature = v.clamp(0.0, 2.0);
        }
        if let Some(v) = u.max_tokens {
            self.max_tokens = v.clamp(256, 65536);
        }
        if let Some(v) = u.vision_max_tokens {
            self.vision_max_tokens = v.clamp(128, 32768);
        }
        if let Some(v) = u.system_prompt {
            self.system_prompt = v;
        }
    }
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn load(app: &AppHandle) -> StoredSettings {
    let mut s: StoredSettings = data_dir(app)
        .ok()
        .and_then(|d| fs::read_to_string(d.join("settings.json")).ok())
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default();
    // Optional: allow GROQ_API_KEY / GROQ_MODEL environment variables when nothing is saved.
    if s.api_key.trim().is_empty() {
        if let Ok(k) = std::env::var("GROQ_API_KEY") {
            s.api_key = k.trim().to_string();
            if let Ok(m) = std::env::var("GROQ_MODEL") {
                if !m.trim().is_empty() {
                    s.text_model = m.trim().to_string();
                }
            }
        }
    }
    s
}

pub fn save(app: &AppHandle, s: &StoredSettings) -> Result<(), String> {
    let dir = data_dir(app)?;
    write_atomic(&dir.join("settings.json"), &serde_json::to_string_pretty(s).unwrap())
}

pub fn write_atomic(path: &PathBuf, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
