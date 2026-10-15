mod groq;
mod settings;

use groq::{ChatRequest, StreamEvent};
use serde_json::Value;
use settings::{PublicSettings, SettingsUpdate, StoredSettings};
use std::{collections::HashMap, fs, sync::Arc, sync::Mutex};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tokio::sync::Notify;

struct AppState {
    settings: Mutex<StoredSettings>,
    streams: Mutex<HashMap<String, Arc<Notify>>>,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> PublicSettings {
    PublicSettings::from(&*state.settings.lock().unwrap())
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    update: SettingsUpdate,
) -> Result<PublicSettings, String> {
    let mut s = state.settings.lock().unwrap();
    s.apply(update);
    settings::save(&app, &s)?;
    Ok(PublicSettings::from(&*s))
}

/// Tests either a freshly typed key or the stored one; returns available model ids.
#[tauri::command]
async fn test_connection(
    state: State<'_, AppState>,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    let key = match api_key.filter(|k| !k.trim().is_empty()) {
        Some(k) => k,
        None => state.settings.lock().unwrap().api_key.clone(),
    };
    groq::list_models(&key).await
}

#[tauri::command]
async fn chat_stream(
    state: State<'_, AppState>,
    request: ChatRequest,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let settings = state.settings.lock().unwrap().clone();
    let id = request.request_id.clone();
    let cancel = Arc::new(Notify::new());
    state.streams.lock().unwrap().insert(id.clone(), cancel.clone());
    let result = groq::stream_chat(settings, request, on_event.clone(), cancel).await;
    state.streams.lock().unwrap().remove(&id);
    if result.is_ok() {
        let _ = on_event.send(StreamEvent::Done);
    }
    result
}

#[tauri::command]
fn cancel_stream(state: State<'_, AppState>, request_id: String) {
    if let Some(n) = state.streams.lock().unwrap().get(&request_id) {
        n.notify_one();
    }
}

#[tauri::command]
fn load_chats(app: AppHandle) -> Result<Value, String> {
    let path = settings::data_dir(&app)?.join("chats.json");
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(Value::Array(vec![])),
    }
}

#[tauri::command]
fn save_chats(app: AppHandle, chats: Value) -> Result<(), String> {
    let path = settings::data_dir(&app)?.join("chats.json");
    settings::write_atomic(&path, &serde_json::to_string(&chats).map_err(|e| e.to_string())?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let loaded = settings::load(app.handle());
            app.manage(AppState {
                settings: Mutex::new(loaded),
                streams: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            test_connection,
            chat_stream,
            cancel_stream,
            load_chats,
            save_chats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
