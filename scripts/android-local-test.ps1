param(
  [ValidateSet('x86_64', 'arm64')][string]$Architecture = 'x86_64',
  [ValidateSet('debug', 'release')][string]$Variant = 'debug'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$ndkBin = Join-Path $sdkRoot 'ndk\27.0.12077973\toolchains\llvm\prebuilt\windows-x86_64\bin'
$target = if ($Architecture -eq 'arm64') { 'aarch64-linux-android' } else { 'x86_64-linux-android' }
$abi = if ($Architecture -eq 'arm64') { 'arm64-v8a' } else { 'x86_64' }
$flavor = if ($Architecture -eq 'arm64') { 'Arm64' } else { 'X86_64' }
$tripleKey = $target.Replace('-', '_')
$workspace = Split-Path $projectRoot -Parent
$env:JAVA_HOME = 'E:\software\JAVA\jdk21'
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$projectRoot\.java-user"
$env:ANDROID_HOME = Join-Path $workspace '.android-sdk-build'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $workspace '.android-user'
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle-user'
$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'Temp\framelab-cargo-target-033'
$env:PATH = 'E:\software\QT\Tools\mingw1310_64\bin;' + $env:PATH
$offlineConfigPath = Join-Path $projectRoot 'src-tauri/tauri.android.offline.conf.json'
$env:TAURI_CONFIG = Get-Content -LiteralPath $offlineConfigPath -Raw
$versionName = ($env:TAURI_CONFIG | ConvertFrom-Json).version
$versionCode = 3008
$variantTask = if ($Variant -eq 'release') { 'Release' } else { 'Debug' }
if ($Variant -eq 'release') {
  # Reuse the established candidate signing identity for in-place data-preserving updates.
  $env:FRAMELAB_SIGNING_STORE = Join-Path $workspace '.android-user/debug.keystore'
  if (-not (Test-Path -LiteralPath $env:FRAMELAB_SIGNING_STORE)) { throw 'Existing signing key missing; do not generate a replacement.' }
  $env:FRAMELAB_SIGNING_PASSWORD = 'android'
  $env:FRAMELAB_SIGNING_ALIAS = 'androiddebugkey'
}
[Environment]::SetEnvironmentVariable("CARGO_TARGET_$($tripleKey.ToUpper())_LINKER", (Join-Path $ndkBin "$($target)24-clang.cmd"), 'Process')
[Environment]::SetEnvironmentVariable("CC_$tripleKey", (Join-Path $ndkBin "$($target)24-clang.cmd"), 'Process')
[Environment]::SetEnvironmentVariable("AR_$tripleKey", (Join-Path $ndkBin 'llvm-ar.exe'), 'Process')
Push-Location $projectRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
  & cargo build --offline --manifest-path src-tauri/Cargo.toml --target $target --release --features custom-protocol --jobs 4
  if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
  $destination = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\$abi"
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR "$target\release\libframelab_lib.so") -Destination (Join-Path $destination 'libframelab_lib.so')
  Push-Location 'src-tauri/gen/android'
  try {
    & .\gradlew.bat --offline --no-daemon "assemble${flavor}${variantTask}" -x "rustBuild${flavor}${variantTask}" "-PframelabVersionName=$versionName" "-PframelabVersionCode=$versionCode"
    if ($LASTEXITCODE -ne 0) { throw 'Test APK build failed' }
  } finally { Pop-Location }
  Get-FileHash "src-tauri/gen/android/app/build/outputs/apk/$Architecture/$Variant/app-$Architecture-$Variant.apk" -Algorithm SHA256
} finally { Pop-Location }
