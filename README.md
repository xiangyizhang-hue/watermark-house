# 水印小屋

水印小屋是由**风喃（fengnan）**维护的 Android 本地照片水印工具。手机端界面、编辑体验与版本发布由本仓库独立维护；照片在设备本地处理，无需账号。

[下载 Android 安装包](https://github.com/xiangyizhang-hue/watermark-house/releases/latest) · [反馈问题](https://github.com/xiangyizhang-hue/watermark-house/issues)

## 能做什么

- 导入照片，添加文字、透明图片水印、品牌标识与拍摄参数；支持位置、对齐、颜色和透明度调整。
- 使用内置或自定义模板，将设置应用到不同照片；每张照片保留自己的编辑记录。
- 调整画幅、裁剪、背景、边框和附加效果；预览后导出 JPG 或 PNG。
- 从照片信息读取 EXIF，按照片生成色卡；支持多选与批量处理。
- 本地保存照片副本、编辑记录和模板，并提供备份与恢复入口。

## 安装与更新

在 [Releases](https://github.com/xiangyizhang-hue/watermark-house/releases) 中下载 Android arm64 APK。当前发布版为 **0.3.8**，面向 Android 12 及以上设备。

升级时直接安装同仓库发布的新版本，**不要先卸载旧版**，以免清除应用私有照片和编辑记录。安卓端目前不会自动下载安装更新，重要内容建议定期在应用内备份。

源码 ZIP 不是手机安装包；请下载扩展名为 `.apk` 的文件。当前发布版本的测试范围和注意事项见对应 Release 页面。

## 开发与维护

项目使用 Vue 3、Tauri 2、Rust 和 Android 原生模块。仓库的 `main` 分支保存源码；Android APK 从 GitHub Releases 分发。版本发布步骤见 [安卓更新发布说明](docs/android/GITHUB_RELEASE.md)。

问题与建议请在[本仓库 Issues](https://github.com/xiangyizhang-hue/watermark-house/issues)反馈。
