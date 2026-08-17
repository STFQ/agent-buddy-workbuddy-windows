# Agent Guide

## Mission

Build and maintain a Windows-only Tauri desktop companion for WorkBuddy. The app displays local task lifecycle status and the credits of the locally signed-in WorkBuddy account. It is open source and has **no product activation, licensing, device binding, or issuer flow**.

## Start here

```powershell
npm ci
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol
npm run dev
```

For a release-quality executable, use the controlled script:

```powershell
npm run build:desktop-client
```

Use `npm run package:desktop-client` only when a new versioned EXE, ZIP, and SHA-256 package are intentionally needed. Do not use bare `cargo build --release`, `tauri build`, or `npx tauri build` to make a distributable artifact; they skip the repository's release validation.

## Architecture map

| Area | Primary files | Responsibility |
| --- | --- | --- |
| Desktop UI | `src/main.ts`, `src/styles.css`, `index.html` | Pet, panel, themes, interaction regions, refresh behavior |
| Native app | `src-tauri/src/lib.rs` | Tauri window, tray menu, drag/click-through behavior, commands |
| WorkBuddy bridge | `src-tauri/src/workbuddy.rs` | Event spool, local session lookup, credit request, plugin installation |
| Bundled plugin | `src-tauri/resources/workbuddy-plugin/` | Status-only lifecycle hook written into the user's WorkBuddy plugin area |
| Release pipeline | `scripts/*.ps1`, `.github/workflows/build-windows.yml` | Build, test, embed frontend, validate GUI binary, package, publish version tags |

## Runtime contracts

The frontend invokes these Tauri commands:

- `workbuddy_activity_snapshot` → current lifecycle state and plugin status.
- `workbuddy_credit_snapshot` → available/used/total credit data or a user-safe error.
- `install_workbuddy_status_plugin` → writes and enables the status-only local plugin.
- `open_workbuddy_download` → opens the WorkBuddy download page when the host app is unavailable.
- `set_hit_regions` and `set_pet_visible` → native overlay interaction behavior.

The frontend may listen for `workbuddy-plugin-status` after tray-driven setup. Keep command names and TypeScript payload types synchronized when changing these contracts.

## Guardrails

- Treat WorkBuddy session data as sensitive. Never log, commit, upload, or display access tokens.
- The plugin event spool is intentionally structural only: no prompts, generated output, file content, tool input/output, or approval decisions.
- Do not add telemetry or a remote backend without explicit product direction.
- Preserve click-through behavior outside the pet/panel hit regions.
- Keep generated directories out of commits: `dist/`, `release/`, and `src-tauri/target/`.
- When changing packaging, update the script, CI workflow, and `docs/desktop-client-packaging.md` together.

## Change checklist

1. Locate the owning layer from the architecture map.
2. Make the smallest compatible change; preserve the status-only privacy boundary.
3. Run `npm run build` and the Rust test command above.
4. For native/build/release changes, also run `npm run build:desktop-client`.
5. Update README or packaging docs if user-visible behavior or commands changed.

## More detail

- [LLM documentation index](llms.txt)
- [Agent task index](docs/agent-index.md)
- [Packaging rules](docs/desktop-client-packaging.md)
- [Contribution rules](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
