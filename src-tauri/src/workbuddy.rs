use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

const MARKETPLACE_ID: &str = "workbuddy-buddy";
const PLUGIN_ID: &str = "workbuddy-buddy@workbuddy-buddy";
const DOWNLOAD_URL: &str = "https://www.workbuddy.cn/";

const PLUGIN_JSON: &str = include_str!("../resources/workbuddy-plugin/.codebuddy-plugin/plugin.json");
const HOOKS_JSON: &str = include_str!("../resources/workbuddy-plugin/hooks.json");
const STATUS_HOOK: &str = include_str!("../resources/workbuddy-plugin/scripts/status-hook.mjs");
const STATUS_HOOK_CMD: &str = include_str!("../resources/workbuddy-plugin/scripts/status-hook.cmd");
const STATUS_RUNTIME: &str = include_str!("../resources/workbuddy-plugin/scripts/status-runtime.mjs");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    activity: ActivitySnapshot,
    credits: CreditSnapshot,
    plugin: PluginStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySnapshot {
    state: &'static str,
    label: &'static str,
    source: &'static str,
    updated_at: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditSnapshot {
    ok: bool,
    left: Option<f64>,
    total: Option<f64>,
    used: Option<f64>,
    percent: Option<f64>,
    plan: Option<String>,
    updated_at: Option<u64>,
    source: Option<&'static str>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatus {
    host_installed: bool,
    plugin_configured: bool,
    marketplace_available: bool,
    restart_required: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
struct SpoolEvent {
    event: String,
    ts: Option<u64>,
    tool_name: Option<String>,
    notification_type: Option<String>,
    ends_with_question: Option<bool>,
}

#[derive(Debug, Clone)]
struct AuthSession {
    access_token: String,
    uid: String,
    domain: Option<String>,
    enterprise_id: Option<String>,
    account_type: Option<String>,
}

#[tauri::command]
pub fn workbuddy_snapshot() -> Snapshot {
    Snapshot {
        activity: activity_snapshot(),
        credits: credit_snapshot(),
        plugin: plugin_status(false),
    }
}

#[tauri::command]
pub fn install_workbuddy_status_plugin() -> Result<PluginStatus, String> {
    let home = home_dir()?;
    install_plugin_files(&home)?;
    enable_plugin_in_settings(&home)?;
    Ok(plugin_status(true))
}

#[tauri::command]
pub fn open_workbuddy_download() -> Result<(), String> {
    #[cfg(windows)]
    let mut command = {
        let mut command = std::process::Command::new("cmd");
        command.args(["/C", "start", "", DOWNLOAD_URL]);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(DOWNLOAD_URL);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(DOWNLOAD_URL);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|_| "无法打开 WorkBuddy 下载页。".to_owned())
}

fn activity_snapshot() -> ActivitySnapshot {
    let latest = latest_spool_event();
    let now_ms = now_millis();
    let Some(event) = latest else {
        return ActivitySnapshot {
            state: "unknown",
            label: "等待事件",
            source: "WorkBuddy 事件",
            updated_at: None,
        };
    };

    let age_ms = event.ts.map(|ts| now_ms.saturating_sub(ts)).unwrap_or(0);
    let mut state = match event.event.as_str() {
        "UserPromptSubmit" | "SessionStart" => "thinking",
        "PreToolUse" => "tool",
        "PostToolUse" => "thinking",
        "PermissionRequest" | "Notification" => "waiting",
        "Stop" if event.ends_with_question == Some(true) => "waiting",
        "Stop" => "done",
        _ => "idle",
    };

    if age_ms > 120_000 && !matches!(state, "done" | "waiting") {
        state = "idle";
    }

    let label = match state {
        "thinking" => "思考中",
        "tool" => "调工具",
        "output" => "输出中",
        "waiting" => "待确认",
        "done" => "已完成",
        "idle" => "待命",
        _ => "等待事件",
    };

    ActivitySnapshot {
        state,
        label,
        source: "WorkBuddy 事件",
        updated_at: event.ts.map(|ts| ts / 1000),
    }
}

fn latest_spool_event() -> Option<SpoolEvent> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".workbuddy-buddy").join("events.spool"),
        home.join(".agent-buddy").join("workbuddy").join("events.spool"),
    ];
    candidates
        .iter()
        .filter_map(|path| latest_event_in_file(path))
        .max_by_key(|event| event.ts.unwrap_or(0))
}

fn latest_event_in_file(path: &Path) -> Option<SpoolEvent> {
    let content = fs::read_to_string(path).ok()?;
    content
        .lines()
        .rev()
        .take(120)
        .filter_map(|line| serde_json::from_str::<SpoolEvent>(line).ok())
        .next()
}

fn credit_snapshot() -> CreditSnapshot {
    match fetch_credits() {
        Ok(snapshot) => snapshot,
        Err(error) => CreditSnapshot {
            ok: false,
            left: None,
            total: None,
            used: None,
            percent: None,
            plan: None,
            updated_at: Some(now_seconds()),
            source: None,
            error: Some(error),
        },
    }
}

fn fetch_credits() -> Result<CreditSnapshot, String> {
    let session = read_auth_session()?;
    let endpoint = resolve_endpoint(&session).unwrap_or_else(|| "https://copilot.tencent.com".to_owned());
    if session.enterprise_id.as_deref().is_some_and(|value| !value.trim().is_empty()) {
        fetch_enterprise_credits(&endpoint, &session)
    } else {
        fetch_personal_credits(&endpoint, &session)
    }
}

fn fetch_personal_credits(endpoint: &str, session: &AuthSession) -> Result<CreditSnapshot, String> {
    let body = json!({
        "PageNumber": 1,
        "PageSize": 100,
        "ProductCode": "p_tcaca",
        "Status": [0, 3],
        "OnlyValidPeriod": true
    });
    let value = post_json(endpoint, "/v2/billing/meter/get-user-resource", session, body, true)?;
    if value.get("code").and_then(Value::as_i64).is_some_and(|code| code != 0) {
        return Err("WorkBuddy 计费接口返回失败。".to_owned());
    }
    let accounts = value
        .pointer("/data/Response/Data/Accounts")
        .and_then(Value::as_array)
        .ok_or_else(|| "WorkBuddy 计费接口没有返回积分包。".to_owned())?;

    let mut left = 0.0;
    let mut total = 0.0;
    let mut plan = None;
    for account in accounts {
        if plan.is_none() {
            plan = account
                .get("PackageName")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(ToOwned::to_owned);
        }
        total += number_field(account, "CycleCapacitySizePrecise").unwrap_or(0.0);
        left += number_field(account, "CycleCapacityRemainPrecise").unwrap_or(0.0);
    }
    let used = (total - left).max(0.0);
    let percent = if total > 0.0 { Some(left / total * 100.0) } else { None };

    Ok(CreditSnapshot {
        ok: true,
        left: Some(left),
        total: Some(total),
        used: Some(used),
        percent,
        plan: plan.or_else(|| session.account_type.clone()),
        updated_at: Some(now_seconds()),
        source: Some("WorkBuddy 官方计费接口"),
        error: None,
    })
}

fn fetch_enterprise_credits(endpoint: &str, session: &AuthSession) -> Result<CreditSnapshot, String> {
    let value = post_json(
        endpoint,
        "/v2/billing/meter/get-enterprise-user-usage",
        session,
        json!({}),
        false,
    )?;
    if value.get("code").and_then(Value::as_i64).is_some_and(|code| code != 0) {
        return Err("WorkBuddy 企业计费接口返回失败。".to_owned());
    }
    let usage = value
        .pointer("/data/data")
        .or_else(|| value.get("data"))
        .ok_or_else(|| "WorkBuddy 企业计费接口没有返回用量。".to_owned())?;
    let limit = number_value(usage.get("limitNum")).unwrap_or(0.0);
    let used = number_value(usage.get("credit")).unwrap_or(0.0);
    let left = (limit - used).max(0.0);
    let percent = if limit > 0.0 { Some(left / limit * 100.0) } else { None };

    Ok(CreditSnapshot {
        ok: true,
        left: Some(left),
        total: Some(limit),
        used: Some(used),
        percent,
        plan: session.account_type.clone(),
        updated_at: Some(now_seconds()),
        source: Some("WorkBuddy 官方计费接口"),
        error: None,
    })
}

fn post_json(endpoint: &str, path: &str, session: &AuthSession, body: Value, zh: bool) -> Result<Value, String> {
    let url = format!("{}{}", endpoint.trim_end_matches('/'), path);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "无法初始化 HTTP 客户端。".to_owned())?;
    let mut request = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("X-User-Id", &session.uid)
        .json(&body);
    if zh {
        request = request.header("Accept-Language", "zh");
    }
    if let Some(domain) = session.domain.as_deref().filter(|value| !value.trim().is_empty()) {
        request = request.header("X-Domain", domain);
    }
    if let Some(enterprise_id) = session
        .enterprise_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        request = request
            .header("X-Enterprise-Id", enterprise_id)
            .header("X-Tenant-Id", enterprise_id);
    }
    let response = request
        .send()
        .map_err(|_| "WorkBuddy 计费请求失败。".to_owned())?;
    if !response.status().is_success() {
        return Err("WorkBuddy 计费请求 HTTP 状态异常。".to_owned());
    }
    response
        .json::<Value>()
        .map_err(|_| "WorkBuddy 计费响应不是有效 JSON。".to_owned())
}

fn read_auth_session() -> Result<AuthSession, String> {
    let path = auth_candidates()
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "未找到 WorkBuddy 登录态，请先登录 WorkBuddy。".to_owned())?;
    let value: Value = serde_json::from_slice(&fs::read(path).map_err(|_| "无法读取 WorkBuddy 登录态。".to_owned())?)
        .map_err(|_| "WorkBuddy 登录态不是有效 JSON。".to_owned())?;
    let access_token = value
        .pointer("/auth/accessToken")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "WorkBuddy 登录态缺少 accessToken。".to_owned())?
        .to_owned();
    let uid = value
        .pointer("/account/uid")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "WorkBuddy 登录态缺少 uid。".to_owned())?
        .to_owned();
    Ok(AuthSession {
        access_token,
        uid,
        domain: value.pointer("/auth/domain").and_then(Value::as_str).map(ToOwned::to_owned),
        enterprise_id: value
            .pointer("/account/enterpriseId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        account_type: value.pointer("/account/type").and_then(Value::as_str).map(ToOwned::to_owned),
    })
}

fn auth_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(data) = dirs::data_dir() {
        paths.push(data.join("CodeBuddyExtension").join("Data").join("Public").join("auth").join("workbuddy-desktop.info"));
    }
    if let Some(data) = dirs::data_local_dir() {
        paths.push(data.join("CodeBuddyExtension").join("Data").join("Public").join("auth").join("workbuddy-desktop.info"));
    }
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join("AppData").join("Roaming").join("CodeBuddyExtension").join("Data").join("Public").join("auth").join("workbuddy-desktop.info"));
        paths.push(home.join("AppData").join("Local").join("CodeBuddyExtension").join("Data").join("Public").join("auth").join("workbuddy-desktop.info"));
    }
    dedupe(paths)
}

fn resolve_endpoint(session: &AuthSession) -> Option<String> {
    let product_dir = product_dirs().into_iter().find(|dir| dir.join("product.json").is_file())?;
    let base = read_json_file(&product_dir.join("product.json"))?;
    let env_file = environment_product_file(session.domain.as_deref(), &base);
    let env_product = env_file.and_then(|name| read_json_file(&product_dir.join(name)));
    text_value(env_product.as_ref(), "/endpoint")
        .or_else(|| text_value(Some(&base), "/endpoint"))
        .or_else(|| text_value(Some(&base), "/authentication/endpoint"))
        .map(|value| value.trim_end_matches('/').to_owned())
}

fn product_dirs() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(data) = dirs::data_local_dir() {
        paths.push(data.join("Programs").join("WorkBuddy").join("resources").join("app.asar.unpacked").join("cli"));
        paths.push(data.join("WorkBuddy").join("resources").join("app.asar.unpacked").join("cli"));
    }
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join("AppData").join("Local").join("Programs").join("WorkBuddy").join("resources").join("app.asar.unpacked").join("cli"));
        paths.push(home.join("AppData").join("Local").join("WorkBuddy").join("resources").join("app.asar.unpacked").join("cli"));
    }
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        paths.push(PathBuf::from(program_files).join("WorkBuddy").join("resources").join("app.asar.unpacked").join("cli"));
    }
    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        paths.push(PathBuf::from(program_files_x86).join("WorkBuddy").join("resources").join("app.asar.unpacked").join("cli"));
    }
    dedupe(paths)
}

fn environment_product_file(domain: Option<&str>, base: &Value) -> Option<&'static str> {
    let domain = domain?.to_lowercase();
    let attrs = base.pointer("/authentication/attributes")?;
    if matches_domain(&domain, attrs.get("internalDomain")) {
        return Some("product.internal.json");
    }
    if matches_domain(&domain, attrs.get("iOADomain")) {
        return Some("product.ioa.json");
    }
    if matches_domain(&domain, attrs.get("cloudHostedDomain")) {
        return Some("product.cloudhosted.json");
    }
    if matches_domain(&domain, attrs.get("externalDomain")) {
        return Some("product.external.json");
    }
    Some("product.selfhosted.json")
}

fn matches_domain(domain: &str, patterns: Option<&Value>) -> bool {
    patterns
        .and_then(Value::as_array)
        .is_some_and(|items| {
            items.iter().filter_map(Value::as_str).any(|pattern| {
                let pattern = pattern.to_lowercase();
                if let Some(suffix) = pattern.strip_prefix("*.") {
                    domain.ends_with(suffix)
                } else {
                    domain == pattern
                }
            })
        })
}

fn plugin_status(restart_required: bool) -> PluginStatus {
    let home = dirs::home_dir();
    let host_installed = home.as_deref().is_some_and(host_is_installed);
    let plugin_configured = home
        .as_deref()
        .and_then(|home| read_json_file(&settings_path(home)))
        .is_some_and(|settings| plugin_is_enabled(&settings));
    let marketplace_available = home
        .as_ref()
        .map(|home| marketplace_root(home).join(".codebuddy-plugin").join("marketplace.json").is_file())
        .unwrap_or(false);
    let message = if restart_required {
        "已启用，请重启 WorkBuddy 后新开任务。"
    } else if plugin_configured {
        "实时状态插件已启用。"
    } else if !host_installed {
        "未检测到 WorkBuddy，请先安装并登录。"
    } else {
        "需要启用 WorkBuddy 状态插件。"
    }
    .to_owned();

    PluginStatus {
        host_installed,
        plugin_configured,
        marketplace_available,
        restart_required,
        message,
    }
}

fn host_is_installed(home: &Path) -> bool {
    if settings_path(home).exists() {
        return true;
    }
    product_dirs().into_iter().any(|dir| dir.exists())
}

fn install_plugin_files(home: &Path) -> Result<(), String> {
    let root = marketplace_root(home);
    let plugin = root.join("plugins").join(MARKETPLACE_ID);
    write_text(&root.join(".codebuddy-plugin").join("marketplace.json"), &marketplace_json(&plugin))?;
    write_text(&plugin.join(".codebuddy-plugin").join("plugin.json"), PLUGIN_JSON)?;
    write_text(&plugin.join("hooks").join("hooks.json"), HOOKS_JSON)?;
    write_text(&plugin.join("scripts").join("status-hook.cmd"), STATUS_HOOK_CMD)?;
    write_text(&plugin.join("scripts").join("status-hook.mjs"), STATUS_HOOK)?;
    write_text(&plugin.join("scripts").join("status-runtime.mjs"), STATUS_RUNTIME)?;
    Ok(())
}

fn enable_plugin_in_settings(home: &Path) -> Result<(), String> {
    let path = settings_path(home);
    let mut settings = read_json_file(&path).unwrap_or_else(|| json!({}));
    let root = settings
        .as_object_mut()
        .ok_or_else(|| "WorkBuddy settings.json 顶层不是对象，未做修改。".to_owned())?;

    let marketplaces = ensure_object(root, "extraKnownMarketplaces")?;
    marketplaces.insert(
        MARKETPLACE_ID.to_owned(),
        json!({
            "source": {
                "source": "local",
                "path": marketplace_root(home).to_string_lossy()
            }
        }),
    );

    let enabled = ensure_object(root, "enabledPlugins")?;
    enabled.insert(PLUGIN_ID.to_owned(), Value::Bool(true));

    write_settings_atomically(&path, &settings)
}

fn plugin_is_enabled(settings: &Value) -> bool {
    settings
        .get("enabledPlugins")
        .and_then(|value| value.get(PLUGIN_ID))
        .and_then(Value::as_bool)
        == Some(true)
}

fn marketplace_json(plugin: &Path) -> String {
    let source = plugin
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| format!("./plugins/{name}"))
        .unwrap_or_else(|| "./plugins/workbuddy-buddy".to_owned());
    serde_json::to_string_pretty(&json!({
        "name": "workbuddy-buddy",
        "version": "0.1.0",
        "description": "Agent Buddy bundled WorkBuddy status plugin marketplace.",
        "plugins": [
            {
                "id": "workbuddy-buddy",
                "name": "Agent Buddy",
                "version": "0.1.0",
                "description": "Status-only WorkBuddy lifecycle bridge. No approval hook is enabled.",
                "source": source,
                "license": "MIT"
            }
        ]
    }))
    .unwrap_or_else(|_| "{}".to_owned())
}

fn settings_path(home: &Path) -> PathBuf {
    home.join(".workbuddy").join("settings.json")
}

fn marketplace_root(home: &Path) -> PathBuf {
    home.join(".workbuddy")
        .join("plugins")
        .join("marketplaces")
        .join(MARKETPLACE_ID)
}

fn write_text(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| format!("无法创建目录：{}", parent.display()))?;
    }
    fs::write(path, content).map_err(|_| format!("无法写入文件：{}", path.display()))
}

fn write_settings_atomically(path: &Path, settings: &Value) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "WorkBuddy 设置路径无效。".to_owned())?;
    fs::create_dir_all(parent).map_err(|_| "无法创建 WorkBuddy 设置目录。".to_owned())?;
    if path.is_file() {
        let backup = parent.join("settings.json.agent-buddy.bak");
        if !backup.exists() {
            fs::copy(path, backup).map_err(|_| "无法备份 WorkBuddy settings.json。".to_owned())?;
        }
    }

    let tmp = parent.join(format!(".settings.agent-buddy-{}.tmp", std::process::id()));
    let serialized = serde_json::to_vec_pretty(settings)
        .map_err(|_| "无法序列化 WorkBuddy settings.json。".to_owned())?;
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(|_| "无法创建临时设置文件。".to_owned())?;
        file.write_all(&serialized)
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.sync_all())
            .map_err(|_| "无法写入临时设置文件。".to_owned())?;
    }
    fs::rename(&tmp, path).map_err(|_| "无法替换 WorkBuddy settings.json。".to_owned())
}

fn ensure_object<'a>(root: &'a mut Map<String, Value>, key: &str) -> Result<&'a mut Map<String, Value>, String> {
    if !root.contains_key(key) {
        root.insert(key.to_owned(), Value::Object(Map::new()));
    }
    root.get_mut(key)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| format!("WorkBuddy settings.json 的 {key} 字段类型异常。"))
}

fn read_json_file(path: &Path) -> Option<Value> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn text_value(value: Option<&Value>, pointer: &str) -> Option<String> {
    value?
        .pointer(pointer)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
}

fn number_field(value: &Value, key: &str) -> Option<f64> {
    number_value(value.get(key))
}

fn number_value(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.replace(',', "").parse::<f64>().ok(),
        _ => None,
    }
}

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法定位用户目录。".to_owned())
}

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn dedupe(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut result = Vec::new();
    for path in paths {
        if !result.contains(&path) {
            result.push(path);
        }
    }
    result
}
