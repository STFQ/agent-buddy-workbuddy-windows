# 桌宠客户端标准构建与交付流程

这份文档是桌宠客户端的唯一发布规则。给用户的 EXE 必须离线可启动、内置前端页面、且不弹 CMD；这些是交付基础，不是可选功能。

## 唯一入口

安装依赖后，只执行下面这一条命令制作用户包：

```powershell
npm install
npm run package:desktop-client
```

不要手动拼接命令、复制 EXE 或压缩文件。该命令会自动执行构建、测试、验收、复制、压缩和生成 SHA-256 文件。

如果只需要验证构建而不生成交付包，执行：

```powershell
npm run build:desktop-client
```

## 自动化流程

`package:desktop-client` 固定按此顺序运行，任何一步失败即停止：

1. TypeScript 检查与 Vite 前端构建。
2. Rust 测试（启用 `custom-protocol`）。
3. 明确构建桌宠目标：`agent-buddy-workbuddy`。
4. 启用 `custom-protocol`，将 `dist` 前端资源打入 EXE。
5. 发布验收：版本一致、Windows GUI 子系统、当前桌宠二进制确实启用了 `custom-protocol`、完整 Tauri 资源（含 `index.html`）。
6. 复制已验收的 EXE，生成 ZIP 和 SHA-256 文件。

`src-tauri/build.rs` 监视 `dist` 的变化，前端更新后会重新生成内嵌资源。CI 调用同一个 `scripts/package-desktop-client.ps1`，不允许维护第二套“看起来差不多”的云端构建命令。

## 严禁使用的命令

以下命令不能用于制作用户包：

```powershell
cargo build --release
tauri build
npx tauri build
```

原因：裸 Cargo 命令没有启用桌宠所需的生产资源特性，可能导致应用访问 `http://localhost:1420`。发布脚本还会执行版本、Windows GUI 子系统、嵌入资源和构建特性的验收；裸 Tauri 命令没有这些发布门禁。

## 交付产物与版本规则

自动脚本仅从下列文件制作包：

```text
src-tauri/target/release/agent-buddy-workbuddy.exe
```

标准交付文件名不可自行改写：

```text
Agent-Buddy-WorkBuddy-Windows-v<version>.exe
Agent-Buddy-WorkBuddy-Windows-v<version>.zip
Agent-Buddy-WorkBuddy-Windows-v<version>.sha256
```

发布新版本前，用脚本统一更新版本号：

```powershell
npm run version:desktop-client -- -Version 0.1.5
npm run package:desktop-client
```

若该版本的文件已经存在，脚本会拒绝覆盖。版本更新脚本会同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json`；不得手工只改其中一处，也不得用 `final`、`fix`、`embedded` 等模糊后缀绕过版本控制。

## 发布前的人工检查

自动验收通过后，发布者只需做两项人工确认：

1. 解压 ZIP，确认仅包含同版本的桌宠 EXE。
2. 在未运行 Vite、未运行本地开发服务器的环境双击 EXE，确认显示桌宠主界面，而非 localhost 错误页。

这两项是端到端观感检查，不能被“编译成功”替代。

## 故障即停止交付

| 现象 | 唯一结论与动作 |
| --- | --- |
| `localhost 拒绝连接` | 不是用户网络问题；产物不是可交付版，停止交付并运行标准脚本重建。 |
| 出现新的黑色 CMD 窗口 | 不是 GUI 桌宠产物，停止交付并重新运行发布验收。 |
| 验收脚本失败 | 不允许手工绕过；先修复脚本或构建配置。 |

在标准流程未全绿前，不把问题归因于用户设备、网络、WorkBuddy 或 AI 的临时判断。
