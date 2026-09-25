# 水印小屋安卓更新发布

源码仓库：`https://github.com/xiangyizhang-hue/watermark-house`。Git 提交管理源码；APK 通过同仓库的 Releases 分发，不把签名密钥或 APK 放进源码提交。

1. 修改 `src-tauri/tauri.android.offline.conf.json` 的版本号，并同步递增 `scripts/android-local-test.ps1` 中的 `versionCode`；不能复用旧版本码。
2. 运行 `npm test -- --run`、`npm run build`，再用 `scripts/android-local-test.ps1 -Architecture arm64 -Variant release` 构建。沿用既有 `com.framelab.app` 包名和签名，才能在手机上覆盖升级并保留数据。
3. 核对 APK 的包名、版本码、签名证书和 SHA-256；在模拟器验证覆盖安装、离线启动及导出。真机验证单列，不把模拟器结果当成真机通过。
4. 提交并推送源码。将 APK 与对应的 `SHA256.txt` 放在独立的 `release-assets-android-vX.Y.Z` 分支；校验文件中的文件名必须与该分支中的 APK 文件名一致。
5. 在源码 `main` 提交上创建并推送 `android-vX.Y.Z` 标签。`.github/workflows/publish-android.yml` 会校验资产、生成英文下载文件名及 GitHub Release。发布后从 Releases 页面重新下载 APK 核验校验值。

当前安卓端不支持应用内自动安装更新。用户从 Releases 下载同签名的新 APK 后直接安装，不要先卸载旧版。桌面端的 Tauri 更新签名与安卓签名是两套机制；未配置新的桌面签名密钥和 `latest.json` 前，不发布桌面自动更新资产。

上游来源与第三方版权记录见根目录 `BRANDING.md`；历史来源记录不可改成定制版作者。
