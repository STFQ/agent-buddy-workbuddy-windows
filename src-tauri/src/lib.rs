pub mod workbuddy;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, PhysicalPosition};

#[derive(Default)]
struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

fn pos_file() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|dir| dir.join("Agent Buddy").join("workbuddy-pos"))
}

fn read_pos() -> Option<(i32, i32)> {
    let raw = std::fs::read_to_string(pos_file()?).ok()?;
    let (x, y) = raw.trim().split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

fn write_pos(x: i32, y: i32) {
    if let Some(path) = pos_file() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, format!("{x},{y}"));
    }
}

#[tauri::command]
fn set_hit_rect(app: tauri::AppHandle, x: f64, y: f64, w: f64, h: f64) {
    if let Some(state) = app.try_state::<Mutex<HitRect>>() {
        if let Ok(mut rect) = state.lock() {
            *rect = HitRect { x, y, w, h };
        }
    }
}

#[tauri::command]
fn set_pet_visible(app: tauri::AppHandle, visible: bool) {
    if let Some(win) = app.get_webview_window("pet") {
        if visible {
            let _ = win.show();
        } else {
            let _ = win.hide();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("pet") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .manage(Mutex::new(HitRect::default()))
        .invoke_handler(tauri::generate_handler![
            set_hit_rect,
            set_pet_visible,
            workbuddy::workbuddy_snapshot,
            workbuddy::install_workbuddy_status_plugin,
            workbuddy::open_workbuddy_download
        ])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("pet") {
                let on_screen = |x: i32, y: i32| {
                    win.available_monitors().map_or(false, |monitors| {
                        monitors.iter().any(|monitor| {
                            let pos = monitor.position();
                            let size = monitor.size();
                            x >= pos.x
                                && x < pos.x + size.width as i32
                                && y >= pos.y
                                && y < pos.y + size.height as i32
                        })
                    })
                };

                if let Some((x, y)) = read_pos().filter(|&(x, y)| on_screen(x, y)) {
                    let _ = win.set_position(PhysicalPosition::new(x, y));
                } else if let Ok(Some(monitor)) = win.primary_monitor() {
                    let scale = monitor.scale_factor();
                    let size = monitor.size();
                    let x = (size.width as f64 / scale) - 520.0 - 40.0;
                    let y = (size.height as f64 / scale) - 680.0 - 60.0;
                    let _ = win.set_position(tauri::LogicalPosition::new(x.max(0.0), y.max(0.0)));
                }
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_ignore: Option<bool> = None;
                let mut last_saved = read_pos();
                let mut tick: u32 = 0;
                loop {
                    std::thread::sleep(Duration::from_millis(30));
                    let Some(win) = handle.get_webview_window("pet") else {
                        continue;
                    };

                    match (handle.cursor_position(), win.outer_position()) {
                        (Ok(cursor), Ok(window_pos)) => {
                            let rect = handle
                                .try_state::<Mutex<HitRect>>()
                                .and_then(|state| state.lock().ok().map(|r| (r.x, r.y, r.w, r.h)));
                            let inside = match rect {
                                Some((x, y, w, h)) if w > 0.0 && h > 0.0 => {
                                    let rx = cursor.x - window_pos.x as f64;
                                    let ry = cursor.y - window_pos.y as f64;
                                    rx >= x && rx <= x + w && ry >= y && ry <= y + h
                                }
                                _ => true,
                            };
                            let ignore = !inside;
                            if Some(ignore) != last_ignore {
                                let _ = win.set_ignore_cursor_events(ignore);
                                last_ignore = Some(ignore);
                            }
                        }
                        _ => {
                            if last_ignore != Some(false) {
                                let _ = win.set_ignore_cursor_events(false);
                                last_ignore = Some(false);
                            }
                        }
                    }

                    tick = tick.wrapping_add(1);
                    if tick % 33 == 0 {
                        if let Ok(pos) = win.outer_position() {
                            if last_saved != Some((pos.x, pos.y)) {
                                write_pos(pos.x, pos.y);
                                last_saved = Some((pos.x, pos.y));
                            }
                        }
                    }
                }
            });

            let show = MenuItem::with_id(app, "show", "显示桌宠", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏桌宠", true, None::<&str>)?;
            let install =
                MenuItem::with_id(app, "install-plugin", "启用 WorkBuddy 实时状态", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Agent Buddy", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &install, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Agent Buddy")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => set_pet_visible(app.clone(), true),
                    "hide" => set_pet_visible(app.clone(), false),
                    "install-plugin" => {
                        let _ = workbuddy::install_workbuddy_status_plugin();
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            let _tray = tray.build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Agent Buddy");
}
