# Agent Buddy for WorkBuddy Windows

Windows desktop pet for WorkBuddy credits and realtime work status.

## What this version does

- Transparent always-on-top desktop pet window.
- Hover the pet to show the WorkBuddy credit panel.
- Reads realtime WorkBuddy lifecycle events from `~/.workbuddy-buddy/events.spool`.
- Calls the WorkBuddy billing endpoint with the local WorkBuddy login session to show available credits.
- Bundles the status-only community WorkBuddy plugin files.
- Provides a one-click “启用实时状态” button that installs/enables the local WorkBuddy plugin.
- GitHub Actions builds Windows `.exe` and `.msi` installers.

## Important behavior

Realtime status needs the WorkBuddy plugin to be enabled. After enabling it, restart WorkBuddy and start a new WorkBuddy task.

The bundled plugin is status-only:

- Includes `status-hook.mjs`
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

Artifacts:

- `agent-buddy-workbuddy-windows-nsis` → `.exe`
- `agent-buddy-workbuddy-windows-msi` → `.msi`

Unsigned builds are fine for friend testing, but Windows SmartScreen may warn about an unknown publisher.
