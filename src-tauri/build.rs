use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_CUSTOM_PROTOCOL");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android")
        && env::var("PROFILE").as_deref() == Ok("release")
        && env::var_os("CARGO_FEATURE_CUSTOM_PROTOCOL").is_none()
    {
        panic!("Android release requires --features custom-protocol (embedded offline frontend). Refusing to package a development-server client.");
    }
    // Android 15 已支持 16 KB 内存页。FrameLab 的 Android 包包含 Rust
    // 原生库，因此在 NDK r27 及更低版本上必须显式要求 16 KB ELF 段对齐。
    // 把参数放在 build script 中，可以覆盖 Tauri CLI、Gradle 和手动 Cargo
    // 三种构建入口，避免以后重新生成 Android 工程时又退回 4 KB。
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android")
        && env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64")
    {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }

    // Tauri 将 frontendDist 打包进 Rust 二进制。显式声明 dist 目录，避免
    // 只改 Vue/前端资源时 Cargo 误判原生库 up-to-date，Android APK 继续携带旧界面。
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.android.conf.json");
    tauri_build::build()
}
