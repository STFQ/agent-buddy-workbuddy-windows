# Agent Buddy for WorkBuddy Windows

简体中文 | [English](README.md)

一个面向 WorkBuddy 的 Windows 桌面伙伴。它常驻桌面顶层，展示当前任务生命周期，并显示已登录 WorkBuddy 账号的可用积分。

> 本项目为独立的社区项目，与 WorkBuddy 或腾讯不存在隶属、认可或支持关系。

**关键词：** WorkBuddy、Windows 桌宠、桌面挂件、Tauri、Rust、TypeScript、实时任务状态、积分监控、系统托盘。

## 功能

- 透明、可穿透、始终置顶的桌宠窗口，并提供系统托盘控制。
- 实时任务状态：待命、思考、调用工具、生成、等待输入、完成和失败。
- 积分面板采用合理的刷新间隔；刷新失败时会明确提示，并保留最近一次成功数据。
- 支持四种外观：WorkBuddy、KittyBuddy、Prismatic Blade 和 Ember Sage；右键桌宠即可切换。
- 一键配置随应用附带的、仅负责状态同步的 WorkBuddy 插件。
- 提供可复现的 Windows 构建、校验、归档和 SHA-256 生成流程。

## 运行要求

- Windows 10 或更高版本。
- 已安装并登录 WorkBuddy。
- Microsoft Edge WebView2 Runtime（多数较新的 Windows 已内置）。

## 安装与使用

1. 从 [Releases](https://github.com/STFQ/agent-buddy-workbuddy-windows/releases) 下载 `Agent-Buddy-WorkBuddy-Windows-v*.zip`。
2. 解压后直接运行其中的 `.exe`。
3. 悬停在桌宠上打开面板，点击 **启用实时状态**。
4. 重启 WorkBuddy，并新建一个任务。

未签名的可执行文件可能触发 Microsoft SmartScreen 提示。请仅从 Releases 下载，并在运行前核对同版本 `.sha256` 文件。

## 隐私与数据处理

附带插件只会将以下结构化生命周期字段写入本地 `~/.workbuddy-buddy/events.spool`：

```text
event, ts, session_id, tool_name, permission_mode, notification_type, ends_with_question
```

插件不会写入提示词、生成内容、工具输入/输出、文件内容或审批决定。桌面应用只读取现有的本地 WorkBuddy 登录态，以请求 WorkBuddy 的积分接口；凭据不会发送到本仓库或任何 Agent Buddy 服务。

## 本地开发

先安装 [Node.js 22](https://nodejs.org/)、Rust/Cargo 与 Tauri 的 Windows 前置依赖，再执行：

```powershell
npm ci
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol
npm run dev
```

制作可发布的客户端时，请使用仓库脚本：

```powershell
npm run build:desktop-client
npm run package:desktop-client
```

`package:desktop-client` 会构建、测试并校验 Windows GUI 可执行文件与内嵌前端资源，之后生成 EXE、ZIP 和 SHA-256 文件。请不要使用裸 `cargo build --release` 或 `tauri build` 制作交付包；详见[桌宠客户端构建与交付流程](docs/desktop-client-packaging.md)。

## 发布与 CI

推送到 `main` 的提交和面向 `main` 的 PR 都会运行 Windows 构建与测试。发布新版本：

```powershell
npm run version:desktop-client -- -Version 0.1.5
git commit -am "Release v0.1.5"
git tag v0.1.5
git push origin main --tags
```

版本标签必须与 `package.json` 中的 `v<version>` 对应。GitHub Actions 会构建经校验的便携版，并创建公开 GitHub Release。本地 `release/` 与构建产物均被 Git 忽略。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/` | Vite/TypeScript 桌面界面 |
| `src-tauri/src/` | Tauri 应用与 WorkBuddy 集成 |
| `src-tauri/resources/` | 随应用附带的仅状态同步插件 |
| `scripts/` | 构建、打包和版本管理脚本 |
| `docs/` | 打包与工程文档 |

## 给编程 Agent 的说明

请从 [AGENTS.md](AGENTS.md) 开始。它提供本仓库的简短操作地图：架构、已验证命令、运行时契约、隐私边界和完成标准。

## 贡献与安全

提交 PR 前请阅读[贡献指南](CONTRIBUTING.md)。安全问题请遵循[安全报告流程](SECURITY.md)，不要公开提交敏感细节。

## 许可证与声明

项目采用 [MIT License](LICENSE)。附带社区插件的归属说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
