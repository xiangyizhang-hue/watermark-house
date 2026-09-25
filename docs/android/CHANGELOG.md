# Android 更新记录

## 0.3.3-mobile-offline-resource-fix — 2026-09-16

- 修复 Android APK 启动时错误请求 `http://localhost:5180/` 的打包配置问题。
- Android Release 原生库启用 Tauri `custom-protocol`，将 `dist` 前端资源内置到 APK，手机端不依赖电脑开发服务器或局域网服务。
- 版本号更新为 0.3.3，Android versionCode 更新为 3003。
- 重新生成 ARM64、16 KB ELF/ZIP 对齐测试 APK，并复核包信息、库哈希、签名与 zipalign。

## 0.3.2-mobile-white-screen-fix — 2026-09-16

- 修复打开 Android APK 后只有白屏的问题：移动端启动时显式创建唯一的 `main` WebView，并加载前端 `index.html`。
- 版本号更新为 0.3.2，Android versionCode 更新为 3002，避免与旧白屏测试包混淆。
- 重新生成 ARM64、16 KB ELF/ZIP 对齐测试 APK，并完成 APK 内原生库、签名、包信息与 zipalign 校验。

## 0.3.1-mobile-preview — 2026-09-16

- 修复 Android ARM64 原生库仍为 4 KB ELF 对齐导致的 16 KB 页面设备安装/启动兼容问题；按 16 KB ELF 与 ZIP 对齐重新生成测试 APK。
- 新增移动图库、照片多选、虚拟副本和本地原图持久化。
- 新增移动端编辑壳：图库、编辑、导出、模板、设置入口，以及安全区和横屏布局。
- 接入普通水印、创意水印、单横线、上下品牌联动和文字快捷编辑。
- 修复新照片/复位出现默认黑色边框的问题。
- 增加独立照片编辑历史、撤销/重做、重启恢复和模板批量应用。
- 增加移动导出队列持久化与已完成任务记录。
- 增加 Android MediaStore JPG/PNG 保存桥接，默认目录为 `Pictures/FrameLab`。
- 增加 2MB 分块 MediaStore 写入，支持大于 32MB 的 JPG/PNG 成品，失败自动清理 pending 媒体项。
- 增加 Android 前台导出服务：系统通知进度、通知栏取消、服务重启时保留任务提示。
- 增加 SQLite 版本化本地记录表，批量导出队列同时镜像到原生存储并在重新打开导出页时恢复。
- 修复移动端启动时等待 IndexedDB 恢复导致 8 秒看门狗误报白屏的问题：先挂载界面，再异步恢复图库和选中照片。
- 构建脚本显式监听 `dist`，避免前端更新后 Android 原生库被 Cargo 错误判定为旧缓存。
- 生成 ARM64 Android 测试 APK，compileSdk/targetSdk 为 API 35。

## 后续版本计划

- SQLite 全量照片/编辑记录迁移与本地备份/恢复。
- 前台服务脱离 WebView 的原生渲染、进度断点续作和更严格的系统终止恢复。
- 原生分块解码/绘制/按行编码，覆盖 2400 万至约 1 亿像素压力场景。
- vivo X100s 真机验收后修正性能、兼容性和页面细节。
- 配置长期 release 签名与同签名覆盖升级。
# 0.3.4 — 2026-09-21

- 手机模板保存入口、存储失败反馈、跨图模板恢复。
- 修复Photo Picker导入时过早清空文件控件导致的NotReadableError；INFO读取同类修复。
- 原图/历史落盘与保存状态提示；批量失败/取消恢复。
- 安卓字体/密度变化生命周期修复；画布ResizeObserver写入延后，避免横屏布局循环。
- Android12+，关闭release调试，原个人签名覆盖升级，前台导出限制明确标示。
- 未完成项见 `DELIVERY-0.3.4.md`；不宣称完整手机规划已实现。
