# 0.3.5 构建与后续更新

工程：`E:\software\水印软件\FrameLabdesktop`，Vue3 + Tauri2 + Kotlin。手机版本独立于桌面package.json版本。

## 本机构建

```powershell
npm.cmd ci
npm.cmd test
.\scripts\android-local-test.ps1 -Architecture arm64 -Variant release
```

脚本使用离线Cargo/Gradle缓存；首次在新机器构建需按Cargo.lock/package-lock.json及Gradle配置准备依赖。

已验证环境：Node24、JDK21、Android SDK35/build-tools35、NDK27.0.12077973、Rust Android目标、Qt MinGW工具链。具体本机路径由脚本集中配置，新机器须修改脚本的环境路径。不要把开发服务端口打进手机包：脚本使用 `tauri.android.offline.conf.json` 和 `custom-protocol`。

APK位置：`src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`。

模拟器：同脚本 `-Architecture x86_64 -Variant debug` 或 `release`。debug包可运行 `com.framelab.app/com.framelab.app.FrameLabRenderChecks` 隔离原生测试；release包禁用WebView调试。`scripts/mobile-layout-check.mjs`用于已连接CDP的Android debug WebView布局检查，不修改照片参数。

## 签名与升级

保持 `com.framelab.app` 包名、原签名及递增versionCode。0.3.5=3005。更新手机版本时修改 `src-tauri/tauri.android.offline.conf.json` 和构建脚本versionCode；不要改桌面版本来冒充手机版本。

签名证书SHA256：`e2b9e40513cdcd9db948681d0267c186d9021467bd25b0c780f0ca0d2f134d5d`。

使用工作区上一层 `.android-user/debug.keystore` 的既有密钥，**不能误用项目内另一份同名密钥**。密钥及备份不随源码交付，需单独妥善保管。此版本沿用原开发签名维持覆盖更新，不要重新生成签名。

## 版本化数据

备份逻辑ZIP版本1，数据库保持既有版本。恢复不替换SQLite文件：新原图落入私有目录，图库/历史/待完成UI记录通过附加数据库事务追加。UI记录使用稳定新标识，可幂等重试。迁移不得删除旧库、模板或历史。

源码包使用白名单打包src/public/scripts/docs/design-system及构建配置，不含缓存、APK、原图、签名密钥或node_modules。旧0.3.4交付目录保留；安卓通常不能直接覆盖降级，不要为降级卸载而丢失数据。
