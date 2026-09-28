# 水印小屋

我平时会处理摄影作品，所以想做一个不依赖账号、能在手机上离线完成排版和水印编辑的工具。水印小屋从桌面端的照片排版与模板功能逐步扩展到 Android；我持续维护手机端的编辑体验、问题修复和安装包发布。

[下载 Android 安装包](https://github.com/xiangyizhang-hue/watermark-house/releases/latest) · [反馈问题](https://github.com/xiangyizhang-hue/watermark-house/issues)

## 我做了什么

- 支持文字、透明图片水印、品牌标识和拍摄信息，并可调整位置、对齐、颜色和透明度。
- 提供画幅、裁剪、背景、边框、自动取色色卡及 JPG/PNG 导出；不同照片分别保留编辑记录，常用样式可存为模板复用。
- 在 Android 端本地保存照片副本、编辑记录和模板，提供备份与恢复入口，不要求登录账号。
- 使用 Git 管理版本，通过 GitHub Releases 发布可独立安装的 APK，并持续处理启动白屏、模板应用和色卡等实际使用问题。

开发中我会借助 AI Agent 梳理需求、辅助定位问题和提出实现方案，但会结合复现步骤、代码检查、自动化测试和设备验证来决定是否采用。这个项目让我更重视功能在真实手机上的可用性，而不只是开发环境里能运行。

## 安装与更新

在 [Releases](https://github.com/xiangyizhang-hue/watermark-house/releases) 下载 Android arm64 的 `.apk` 文件。当前发布版为 **0.3.8**，面向 Android 12 及以上设备；源码 ZIP 不是安装包。

升级时请直接安装同仓库发布的新版本，**不要先卸载旧版**，以免清除应用私有照片和编辑记录。安卓端目前不会自动下载安装更新，重要内容建议定期在应用内备份。发布版的测试范围和注意事项见对应 Release 页面。

## 技术与项目边界

项目使用 Vue 3、TypeScript、Tauri 2、Rust 和 Android 原生模块；`main` 分支保存源码，Android APK 通过 Releases 分发。桌面端和 Android 端的运行环境不同，我会分别验证关键编辑与导出流程。版本发布步骤见 [安卓更新发布说明](docs/android/GITHUB_RELEASE.md)。

目前仍在持续迭代。问题或建议可以提交到本仓库的 [Issues](https://github.com/xiangyizhang-hue/watermark-house/issues)。
