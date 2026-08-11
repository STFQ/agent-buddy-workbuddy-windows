@echo off
setlocal

set "SCRIPT=%CODEBUDDY_PLUGIN_ROOT%\scripts\status-hook.mjs"
set "WB_NODE="

if exist "%USERPROFILE%\.workbuddy\binaries\node\versions" (
  for /f "delims=" %%D in ('dir /b /ad /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
    if not defined WB_NODE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%D\node.exe" (
      set "WB_NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%D\node.exe"
    )
  )
)

if not defined WB_NODE if exist "%LOCALAPPDATA%\Programs\WorkBuddy\resources\app.asar.unpacked\cli\node.exe" set "WB_NODE=%LOCALAPPDATA%\Programs\WorkBuddy\resources\app.asar.unpacked\cli\node.exe"
if not defined WB_NODE if exist "%LOCALAPPDATA%\WorkBuddy\resources\app.asar.unpacked\cli\node.exe" set "WB_NODE=%LOCALAPPDATA%\WorkBuddy\resources\app.asar.unpacked\cli\node.exe"
if not defined WB_NODE if exist "%ProgramFiles%\WorkBuddy\resources\app.asar.unpacked\cli\node.exe" set "WB_NODE=%ProgramFiles%\WorkBuddy\resources\app.asar.unpacked\cli\node.exe"
if not defined WB_NODE if exist "%ProgramFiles(x86)%\WorkBuddy\resources\app.asar.unpacked\cli\node.exe" set "WB_NODE=%ProgramFiles(x86)%\WorkBuddy\resources\app.asar.unpacked\cli\node.exe"

if not defined WB_NODE (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    if not defined WB_NODE set "WB_NODE=%%N"
  )
)

if not defined WB_NODE exit /b 0
if not exist "%SCRIPT%" exit /b 0

"%WB_NODE%" "%SCRIPT%" %*
exit /b 0
