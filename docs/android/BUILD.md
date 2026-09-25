# FrameLab Android 构建说明

> 2026-09-21更新：以下0.3.3记录为历史资料，不是当前交付入口。0.3.4使用 `scripts/android-local-test.ps1 -Architecture arm64 -Variant release`，说明见 `DELIVERY-0.3.4.md`，验收见 `ACCEPTANCE-2026-09-21.md`。Android最低版本现为12，版本码3004；不要再分发下文旧debug包。

当前交付的是个人使用测试包：`FrameLab-0.3.3-arm64-16k-debug.apk`，目标 ABI 为 `arm64-v8a`，并已启用 16 KB ELF/ZIP 对齐，适合 vivo X100s 这类 ARM64 手机。0.3.3 修复了 APK 误用 `localhost:5180` 开发服务器的问题：Android 原生库使用 Tauri `custom-protocol`，前端资源随 APK 离线内置。

## 已验证的构建环境

- Windows + PowerShell
- Node/npm、Rust/Cargo
- JDK 21：`E:\software\JAVA\jdk21`
- Android SDK API 35 / Build Tools 35.0.0
- Android NDK 27.0.12077973
- Tauri 2.11.x
- Qt MinGW：`E:\software\QT\Tools\mingw1310_64\bin`

工作区内的 `src-tauri/gen/android/tauri-android` 是 Tauri Android library 的固定副本，compileSdk 已与本机 API 35 对齐。`gradle.properties` 中的 `android.overridePathCheck=true` 用于允许中文工作区路径。

`src-tauri/build.rs` 会在 Android ARM64 构建时自动加入 `max-page-size=16384` 和 `common-page-size=16384`，避免带 Rust 原生库的 APK 在 16 KB 页面设备上出现安装或启动兼容问题。Gradle 打包阶段还会使用 16 KB ZIP 对齐。

## 推荐构建步骤

```powershell
Set-Location 'E:\software\水印软件\FrameLabdesktop'

$sdk='E:\software\水印软件\.android-sdk-build'
$env:ANDROID_HOME=$sdk
$env:ANDROID_SDK_ROOT=$sdk
$env:ANDROID_USER_HOME='E:\software\水印软件\.android'
$env:NDK_HOME='C:\Users\86189\AppData\Local\Android\Sdk\ndk\27.0.12077973'
$env:ANDROID_NDK_HOME=$env:NDK_HOME
$env:JAVA_HOME='E:\software\JAVA\jdk21'
$env:GRADLE_USER_HOME='E:\software\水印软件\FrameLabdesktop\.gradle-user'
$env:CARGO_TARGET_DIR='C:\Users\86189\AppData\Local\Temp\framelab-cargo-target'
$env:PATH='E:\software\QT\Tools\mingw1310_64\bin;' + $env:PATH

npm install
npm test -- --run
npm run build
```

Windows 中文工作区和未开启创建符号链接权限时，建议使用下面的 ASCII 临时盘符和普通文件复制流程。它不复制工程内容，只为 Java/Kotlin 编译器提供 ASCII 路径：

```powershell
$env:ANDROID_USER_HOME='E:\software\水印软件\FrameLabdesktop\.android-user'
$env:ANDROID_PREFS_ROOT=$null
$env:ANDROID_SDK_HOME=$null
$env:ANDROID_NDK_HOME=$env:NDK_HOME
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER='C:\Users\86189\AppData\Local\Android\Sdk\ndk\27.0.12077973\toolchains\llvm\prebuilt\windows-x86_64\bin\aarch64-linux-android24-clang.cmd'
$env:CC_aarch64_linux_android=$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER
$env:AR_aarch64_linux_android='C:\Users\86189\AppData\Local\Android\Sdk\ndk\27.0.12077973\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-ar.exe'

subst Z: 'E:\software\水印软件'
Set-Location 'Z:\FrameLabdesktop'
cargo build --manifest-path 'src-tauri\Cargo.toml' --target aarch64-linux-android --release --features custom-protocol

$src='C:\Users\86189\AppData\Local\Temp\framelab-cargo-target\aarch64-linux-android\release\libframelab_lib.so'
$dst='Z:\FrameLabdesktop\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\libframelab_lib.so'
Copy-Item -LiteralPath $src -Destination $dst -Force

Set-Location 'Z:\FrameLabdesktop\src-tauri\gen\android'
.\gradlew.bat --stop
.\gradlew.bat --no-daemon assembleArm64Debug -x rustBuildArm64Debug

Set-Location 'Z:\FrameLabdesktop'
New-Item -ItemType Directory -Force -Path 'artifacts\android' | Out-Null
Copy-Item 'src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk' 'artifacts\android\FrameLab-0.3.3-arm64-16k-debug.apk' -Force
Get-FileHash 'artifacts\android\FrameLab-0.3.3-arm64-16k-debug.apk' -Algorithm SHA256
```

如需确认 16 KB ZIP 对齐，可执行：

```powershell
$apk='E:\software\水印软件\FrameLabdesktop\artifacts\android\FrameLab-0.3.3-arm64-16k-debug.apk'
& 'E:\software\水印软件\.android-sdk-build\build-tools\35.0.0\zipalign.exe' -c -P 16 -v 4 $apk
```

如 `clang.exe` 被沙箱/安全软件拒绝执行，需要允许当前 Cargo 构建使用 Android NDK linker；不需要放开整个工程或修改系统设置。构建结束可执行 `subst Z: /D`。

最终 APK 位于：

```text
src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
```

## 安装与校验

```powershell
$apk='E:\software\水印软件\FrameLabdesktop\artifacts\android\FrameLab-0.3.3-arm64-16k-debug.apk'
Get-FileHash -LiteralPath $apk -Algorithm SHA256
```

安装前请在手机上允许当前来源安装 APK。该测试包使用 Android Debug 签名，不是正式发布签名；正式版需要单独配置并安全保管长期 keystore。

APK 0.3.3（Android 离线资源修复、16 KB 兼容包）的 SHA-256：

```text
B9A01478F79736010DC4764E1247C58851698C07D9F47B5A6712F74F4AE93438
```
