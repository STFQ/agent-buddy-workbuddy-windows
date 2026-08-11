# Agent Buddy for WorkBuddy Windows

Windows desktop pet for WorkBuddy credits and realtime work status.

## What this version does

- Transparent always-on-top desktop pet window.
- Hover the pet to show the WorkBuddy credit panel.
- Reads realtime WorkBuddy lifecycle events from `~/.workbuddy-buddy/events.spool`.
- Calls the WorkBuddy billing endpoint with the local WorkBuddy login session to show available credits.
- Bundles the status-only community WorkBuddy plugin files.
- Provides a one-click “启用实时状态” button that installs/enables the local WorkBuddy plugin.
- GitHub Actions builds a portable `.exe` plus optional `.exe` / `.msi` installers.

## Important behavior

Realtime status needs the WorkBuddy plugin to be enabled. After enabling it, restart WorkBuddy and start a new WorkBuddy task.

The bundled plugin is status-only:

- Includes `status-hook.mjs`
- Includes `status-hook.cmd` on Windows to locate WorkBuddy's bundled Node runtime
- Includes `status-runtime.mjs`
- Does not install `approval-hook.mjs`

The status plugin writes only a structural whitelist:

```text
event, ts, session_id, tool_name, permission_mode, notification_type, ends_with_question
```

## Local development

```bash
npm install
npm run build
npm run tauri:build
```

This requires Rust/Cargo locally. If you do not have Rust installed, push to GitHub and run the Windows workflow.

## GitHub cloud build

Push this project to a GitHub repo, then run:

```text
Actions → Build Windows → Run workflow
```

Release assets:

- `Agent-Buddy-WorkBuddy-Portable.zip` → unzip and double-click the `.exe`
- NSIS installer `.exe`
- MSI installer `.msi`

Unsigned builds are fine for friend testing, but Windows SmartScreen may warn about an unknown publisher.

The portable `.exe` is the recommended friend-test artifact. It does not need installation, but WorkBuddy itself must already be installed and logged in. On older Windows machines, Microsoft Edge WebView2 Runtime may also be required.
