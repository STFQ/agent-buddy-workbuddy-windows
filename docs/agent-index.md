# Agent Task Index

Use this page after reading the root [AGENTS.md](../AGENTS.md). It is a compact map from a requested task to the smallest set of files and validation commands.

| Task | Start with | Usually also inspect | Verify |
| --- | --- | --- | --- |
| Change the pet or credit-panel UI | `src/main.ts`, `src/styles.css`, `index.html` | `src/assets/desktop-pet/` | `npm run build` |
| Add or adjust a visual theme | `src/main.ts`, `src/styles.css` | matching assets under `src/assets/desktop-pet/` | `npm run build` |
| Change task states or refresh behavior | `src/main.ts` | `src-tauri/src/workbuddy.rs` | `npm run build`; Rust tests if payloads change |
| Change WorkBuddy discovery, credit lookup, or plugin setup | `src-tauri/src/workbuddy.rs` | `src-tauri/resources/workbuddy-plugin/` | `cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol` |
| Change the local status plugin | `src-tauri/resources/workbuddy-plugin/` | corresponding embedded constants in `src-tauri/src/workbuddy.rs` | Rust tests; inspect data written to the spool |
| Change tray, overlay, or click-through behavior | `src-tauri/src/lib.rs` | `src/main.ts` hit-region reporting | `npm run build:desktop-client` |
| Change Windows packaging or release automation | `scripts/`, `.github/workflows/build-windows.yml` | `docs/desktop-client-packaging.md`, `package.json`, `src-tauri/tauri.conf.json` | `npm run build:desktop-client` |
| Change a version | `scripts/set-desktop-client-version.ps1` | `package.json`, lockfile, Cargo manifest, Tauri config | `npm run version:desktop-client -- -Version <version>` |

## Runtime boundary

Frontend-to-native command contracts live in `src/main.ts` and `src-tauri/src/lib.rs`. When adding or changing a command, update both its TypeScript call/payload and its Rust registration. The WorkBuddy integration is local-first: do not introduce external data collection.

## Privacy stop conditions

Stop and seek product direction before changing any behavior that would store, log, transmit, or display WorkBuddy access tokens, prompts, output, files, tool input/output, or approval decisions. The intended event spool is structural status data only.

## Release stop conditions

Do not ship an EXE produced by a bare Cargo or Tauri command. A distributable client must pass `npm run build:desktop-client`; delivery packages must be made with `npm run package:desktop-client`.
