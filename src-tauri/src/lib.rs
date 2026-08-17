pub mod workbuddy;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, PhysicalPosition};

#[derive(Clone, Copy, Default)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Rect {
    fn contains(self, x: f64, y: f64) -> bool {
        self.w > 0.0
            && self.h > 0.0
            && x >= self.x
            && x <= self.x + self.w
            && y >= self.y
            && y <= self.y + self.h
    }
}

#[derive(Clone, Copy, Default)]
struct HitRegions {
    pet: Rect,
    panel: Rect,
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
#[allow(clippy::too_many_arguments)]
fn set_hit_regions(
    app: tauri::AppHandle,
    pet_x: f64,
    pet_y: f64,
    pet_w: f64,
    pet_h: f64,
    panel_x: f64,
    panel_y: f64,
    panel_w: f64,
    panel_h: f64,
) {
    if let Some(state) = app.try_state::<Mutex<HitRegions>>() {
        if let Ok(mut regions) = state.lock() {
            *regions = HitRegions {
                pet: Rect {
                    x: pet_x,
                    y: pet_y,
                    w: pet_w,
                    h: pet_h,
                },
                panel: Rect {
                    x: panel_x,
                    y: panel_y,
                    w: panel_w,
                    h: panel_h,
                },
            };
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
        .manage(Mutex::new(HitRegions::default()))
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            set_pet_visible,
            workbuddy::workbuddy_activity_snapshot,
            workbuddy::workbuddy_credit_snapshot,
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
                    let x = (size.width as f64 / scale) - 400.0 - 40.0;
                    let y = (size.height as f64 / scale) - 440.0 - 60.0;
                    let _ = win.set_position(tauri::LogicalPosition::new(x.max(0.0), y.max(0.0)));
                }
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_ignore: Option<bool> = None;
                let mut last_saved = read_pos();
                let mut interaction_active = false;
                let mut tick: u32 = 0;
                loop {
                    std::thread::sleep(Duration::from_millis(30));
                    let Some(win) = handle.get_webview_window("pet") else {
                        continue;
                    };

                    match (handle.cursor_position(), win.outer_position()) {
                        (Ok(cursor), Ok(window_pos)) => {
                            let regions = handle
                                .try_state::<Mutex<HitRegions>>()
                                .and_then(|state| state.lock().ok().map(|regions| *regions));
                            let scale = win.scale_factor().unwrap_or(1.0).max(f64::EPSILON);
                            let rx = (cursor.x - window_pos.x as f64) / scale;
                            let ry = (cursor.y - window_pos.y as f64) / scale;
                            interaction_active = match regions {
                                Some(regions) if regions.pet.w > 0.0 => {
                                    regions.pet.contains(rx, ry)
                                        || (interaction_active && regions.panel.contains(rx, ry))
                                }
                                _ => true,
                            };
                            let ignore = !interaction_active;
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
            let plugin_status = workbuddy::current_plugin_status();
            let install_label = if plugin_status.is_ready() {
                "✓ WorkBuddy 实时状态已启用"
            } else {
                "启用 WorkBuddy 实时状态"
            };
            let install = MenuItem::with_id(
                app,
                "install-plugin",
                install_label,
                !plugin_status.is_ready(),
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "退出 Agent Buddy", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &install, &quit])?;
            let install_for_event = install.clone();
            let mut tray = TrayIconBuilder::new()
                .tooltip("Agent Buddy")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => set_pet_visible(app.clone(), true),
                    "hide" => set_pet_visible(app.clone(), false),
                    "install-plugin" => {
                        let _ = install_for_event.set_enabled(false);
                        let _ = install_for_event.set_text("正在启用 WorkBuddy 实时状态…");
                        set_pet_visible(app.clone(), true);

                        let app_handle = app.clone();
                        let install_item = install_for_event.clone();
                        std::thread::spawn(move || {
                            match workbuddy::install_workbuddy_status_plugin_blocking() {
                                Ok(status) => {
                                    let _ = install_item.set_text("✓ WorkBuddy 实时状态已启用");
                                    let _ = install_item.set_enabled(false);
                                    let _ = app_handle.emit(
                                        "workbuddy-plugin-status",
                                        serde_json::json!({ "status": status }),
                                    );
                                }
                                Err(error) => {
                                    let _ = install_item.set_text("启用失败，点击重试");
                                    let _ = install_item.set_enabled(true);
                                    let _ = app_handle.emit(
                                        "workbuddy-plugin-status",
                                        serde_json::json!({ "error": error }),
                                    );
                                }
                            }
                        });
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
