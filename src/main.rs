#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cmf_eq::autoeq::{self, Profile};
use cmf_eq::bluetooth::{self, ConnectionStatus, Controller, PairedDevice};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct BluetoothState(Arc<Mutex<Controller>>);

#[tauri::command]
async fn list_paired_devices() -> Result<Vec<PairedDevice>, String> {
    tauri::async_runtime::spawn_blocking(bluetooth::paired_devices)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn connect_headphones(
    address: String,
    state: tauri::State<'_, BluetoothState>,
) -> Result<ConnectionStatus, String> {
    let controller = state.inner().0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller
            .lock()
            .map_err(|_| "Bluetooth state unavailable.")?
            .connect(&address)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn refresh_headphones(
    state: tauri::State<'_, BluetoothState>,
) -> Result<ConnectionStatus, String> {
    let controller = state.inner().0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller
            .lock()
            .map_err(|_| "Bluetooth state unavailable.")?
            .refresh()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_anc(
    mode: u8,
    state: tauri::State<'_, BluetoothState>,
) -> Result<ConnectionStatus, String> {
    let controller = state.inner().0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller
            .lock()
            .map_err(|_| "Bluetooth state unavailable.")?
            .set_anc(mode)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn disconnect_headphones(
    state: tauri::State<'_, BluetoothState>,
) -> Result<ConnectionStatus, String> {
    let controller = state.inner().0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(controller
            .lock()
            .map_err(|_| "Bluetooth state unavailable.")?
            .disconnect())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn headphone_status(
    state: tauri::State<'_, BluetoothState>,
) -> Result<ConnectionStatus, String> {
    let controller = state.inner().0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(controller
            .lock()
            .map_err(|_| "Bluetooth state unavailable.")?
            .status())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn import_autoeq(text: String, name: String) -> Result<Profile, String> {
    if text.len() > 256 * 1024 {
        return Err("Profile exceeds the 256 KB import limit.".into());
    }
    autoeq::parse(&text, &name)
}

#[tauri::command]
fn reference_profile() -> Result<Profile, String> {
    autoeq::parse(
        include_str!("../profiles/cmf-harman.txt"),
        "Harman 2018 target",
    )
}

#[tauri::command]
fn validate_profile(profile: Profile) -> Result<Profile, String> {
    autoeq::validate(&profile)?;
    Ok(profile)
}

fn main() {
    tauri::Builder::default()
        .manage(BluetoothState::default())
        .invoke_handler(tauri::generate_handler![
            import_autoeq,
            reference_profile,
            validate_profile,
            list_paired_devices,
            connect_headphones,
            refresh_headphones,
            disconnect_headphones,
            headphone_status,
            set_anc
        ])
        .run(tauri::generate_context!())
        .expect("Could not start CMF EQ");
}
