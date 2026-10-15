#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cmf_eq::autoeq::{self, Profile};

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
        .invoke_handler(tauri::generate_handler![
            import_autoeq,
            reference_profile,
            validate_profile
        ])
        .run(tauri::generate_context!())
        .expect("Could not start CMF EQ");
}
