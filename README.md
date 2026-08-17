# Agent Buddy for WorkBuddy Windows

A Windows desktop companion for WorkBuddy. It stays on top of the desktop, shows the current task lifecycle, and displays the credits available to the signed-in WorkBuddy account.

> This is an independent community project. It is not affiliated with, endorsed by, or supported by WorkBuddy or Tencent.

**Keywords:** WorkBuddy, Windows desktop pet, desktop widget, Tauri, Rust, TypeScript, real-time task status, credit monitor, system tray.

## Features

- Transparent, click-through, always-on-top desktop pet with tray controls.
- Live task states: idle, thinking, running a tool, generating, waiting for input, completed, and failed.
- Credit panel with sensible refresh intervals and an explicit stale-data/error state.
- Four selectable looks: WorkBuddy, KittyBuddy, Prismatic Blade, and Ember Sage. Right-click the pet to switch.
- One-click setup for the bundled status-only WorkBuddy plugin.
- Reproducible Windows build, verification, archive, and checksum scripts.

## Requirements

- Windows 10 or later.
- WorkBuddy installed and signed in.
- Microsoft Edge WebView2 Runtime (usually already present on current Windows installations).

## Install

1. Download the `Agent-Buddy-WorkBuddy-Windows-v*.zip` asset from [Releases](https://github.com/STFQ/agent-buddy-workbuddy-windows/releases).
2. Extract it and run the contained `.exe`.
3. Hover the pet to open the panel, then choose **启用实时状态**.
4. Restart WorkBuddy and begin a new task.

Unsigned binaries can cause a Microsoft SmartScreen warning. Verify the published `.sha256` file before running a download from an untrusted mirror.

## Privacy and data handling

The bundled plugin projects only the following structural lifecycle fields to a local file at `~/.workbuddy-buddy/events.spool`:

```text
event, ts, session_id, tool_name, permission_mode, notification_type, ends_with_question
```

It does not write prompts, generated text, tool input/output, files, or approval decisions. The desktop app reads the existing local WorkBuddy login session only to query WorkBuddy's billing endpoint; credentials are not sent to this repository or any Agent Buddy service.

## Development

Install [Node.js 22](https://nodejs.org/), Rust/Cargo, and the Tauri Windows prerequisites. Then run:

```powershell
npm ci
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol
npm run dev
```

For a release-quality client build, use the repository scripts:

```powershell
npm run build:desktop-client
npm run package:desktop-client
```

`package:desktop-client` builds, tests, verifies the Windows GUI binary and embedded frontend, then creates the EXE, ZIP, and SHA-256 file. Do not use bare `cargo build --release` or `tauri build` for a distributable client; see the [packaging guide](docs/desktop-client-packaging.md).

## Releases and CI

Pushes and pull requests to `main` run the Windows build and test pipeline. To publish a release:

```powershell
npm run version:desktop-client -- -Version 0.1.5
git commit -am "Release v0.1.5"
git tag v0.1.5
git push origin main --tags
```

The `v<version>` tag must match `package.json`. GitHub Actions builds the verified portable package and creates the public GitHub Release. Local release files and build output are intentionally ignored by Git.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | Vite/TypeScript desktop UI |
| `src-tauri/src/` | Tauri app and WorkBuddy integration |
| `src-tauri/resources/` | Bundled status-only WorkBuddy plugin |
| `scripts/` | Build, packaging, and versioning utilities |
| `docs/` | Packaging and engineering notes |

## For coding agents

Start with [AGENTS.md](AGENTS.md). It contains the short operational map: architecture, verified commands, change boundaries, privacy rules, and the definition of done for this repository.

## Contributing and security

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security-sensitive reports should follow [SECURITY.md](SECURITY.md), not public issues.

## License and notices

This project is available under the [MIT License](LICENSE). Attribution for the bundled community plugin is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
