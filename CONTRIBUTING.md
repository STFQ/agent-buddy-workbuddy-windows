# Contributing

Thanks for helping improve Agent Buddy.

## Before opening a pull request

1. Create a focused branch from `main`.
2. Keep changes limited to the problem being solved; do not commit `dist/`, `release/`, or `src-tauri/target/`.
3. Run the checks below on Windows:

   ```powershell
   npm ci
   npm run build
   cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol
   ```

4. Describe the user-visible result and how you verified it in the pull request.

## Areas that need extra care

- Do not log, upload, or add to the event spool any prompt, output, file path, credential, or approval content.
- Changes to `src-tauri/resources/workbuddy-plugin/` must keep the plugin status-only.
- Packaging changes must preserve the release checks in `scripts/verify-desktop-client-build.ps1`; update the packaging guide and GitHub workflow in the same pull request.

## Issues

Use issues for reproducible bugs and feature proposals. Include the Windows version, Agent Buddy version, WorkBuddy version, expected behavior, actual behavior, and non-sensitive logs. Do not paste access tokens or WorkBuddy session data.
