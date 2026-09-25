param([string]$Emulator = 'emulator-5554')
$ErrorActionPreference = 'Stop'
if ($Emulator -notmatch '^emulator-\d+$') { throw 'This native check runner only installs on an emulator.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$workspace = Split-Path $projectRoot -Parent
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$env:JAVA_HOME = 'E:\software\JAVA\jdk21'
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$projectRoot\.java-user"
$env:ANDROID_HOME = Join-Path $workspace '.android-sdk-build'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $workspace '.android-user'
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle-user'
$deviceState = & $adb -s $Emulator get-state
if ($LASTEXITCODE -ne 0 -or $deviceState.Trim() -ne 'device') { throw 'Requested emulator is not available.' }
Push-Location (Join-Path $projectRoot 'src-tauri/gen/android')
try {
  # Native-only check: deliberately reuses existing Rust/WebView binary. Not a release build.
  & .\gradlew.bat --offline --no-daemon :app:assembleX86_64Debug -x rustBuildX86_64Debug
  if ($LASTEXITCODE -ne 0) { throw 'Native check APK failed to build.' }
  $apk = Join-Path $projectRoot 'src-tauri/gen/android/app/build/outputs/apk/x86_64/debug/app-x86_64-debug.apk'
  Get-FileHash -LiteralPath $apk -Algorithm SHA256
  & $adb -s $Emulator install -r $apk
  if ($LASTEXITCODE -ne 0) { throw 'Emulator installation failed.' }
  $result = & $adb -s $Emulator shell am instrument -w 'com.framelab.app/com.framelab.app.FrameLabRenderChecks'
  $checkExit = $LASTEXITCODE
  $result
  if ($checkExit -ne 0 -or ($result -join "`n") -notmatch 'PASS:' -or ($result -join "`n") -match 'FAIL:') {
    throw 'Native rendering checks failed; do not deliver this APK.'
  }
} finally { Pop-Location }
