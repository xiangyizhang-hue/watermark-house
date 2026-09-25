# FrameLab Android 测试报告

日期：2026-09-16  
设备基准：vivo X100s（仅已知型号，RAM、系统版本和批量数量未提供）  
包：`FrameLab-0.3.3-arm64-16k-debug.apk`
SHA-256：`B9A01478F79736010DC4764E1247C58851698C07D9F47B5A6712F74F4AE93438`

## 已通过

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 前端类型检查与生产构建 | 通过 | `npm run build` |
| 自动回归 | 通过 | 35 个测试文件、308 个测试 |
| Android ARM64 Rust 库编译 | 通过 | `aarch64-linux-android` Release library |
| Kotlin 原生桥与 Manifest 编译 | 通过 | MediaStore、2MB 分块写入、SQLite、本地前台服务 |
| Gradle ARM64 APK 打包 | 通过 | `assembleArm64Debug` |
| APK 包信息 | 通过 | 包名 `com.framelab.app`，版本 `0.3.3`，versionCode `3003`，min/target SDK `24/35` |
| ABI | 通过 | APK 含 `lib/arm64-v8a/libframelab_lib.so` |
| 前端资源嵌入 | 通过 | 动态库中包含 `index.html`、构建后的前端 JS 和 `FrameLab` 字符串 |
| APK 内原生库完整性 | 通过 | APK 内库与构建输入 SHA-256 一致 |
| 16 KB ELF 段对齐 | 通过 | ARM64 库 4 个 `LOAD` 段均为 `0x4000`（16384）对齐 |
| 16 KB ZIP 对齐 | 通过 | `zipalign -c -P 16 -v 4`：Verification successful |
| APK 签名完整性 | 通过 | Android Debug 签名；APK Signature Scheme v2 |
| Android 离线资源启动 | 已构建进包 | Android 原生库启用 Tauri `custom-protocol`，内置 `dist` 前端资源；APK 内 `libframelab_lib.so` 与构建输入 SHA-256 均为 `DB183E4A97FD50C3B552CCFC35A514E6D9DA8B7F86BB7188847BAADEC8412CFC` |

自动测试中的 Canvas `getContext` stderr 是 jsdom 未实现 Canvas 的已知测试环境告警；相关测试均通过，没有失败用例。

## 已实现并覆盖到代码回归的移动能力

- 移动图库、多选、Photo Picker、IndexedDB 原图副本。
- 每张照片独立编辑记录、撤销/重做、重启恢复和虚拟副本隔离。
- 普通/创意水印、文字图片元素、单横线、上下品牌联动、文字快捷编辑。
- 模板保存、导入、批量应用和不同图片套用。
- 新照片与复位均保持无装饰状态。
- 手机底部工具栏、Bottom Sheet、安全区和横屏侧面参数布局。
- 移动批量导出队列持久化、稳定 jobId、已完成成品记录。
- Android MediaStore 写入 `Pictures/FrameLab` 的 JPG/PNG 桥接命令。
- 2MB 分块 MediaStore 写入，移除原先 32MB base64 过渡上限；失败会中止并删除 pending 媒体项。
- Android 前台服务通知、进度更新、通知栏取消和服务重启时的进度恢复提示。
- 版本化 SQLite 本地记录表，批量队列同时镜像到 SQLite，WebView 重新打开时优先采用较新的记录。

## 当前未验证

- 当前主机没有可用 Android Emulator，`adb devices` 没有可连接设备；未声称模拟器通过。
- vivo X100s 真机安装、相册写入、锁屏/切微信/进程终止后的连续导出，未验证。
- Android 12、14、15、16 的完整矩阵未完成；本包以 API 35 构建。
- 360/375/393/430 宽度、横屏、大字体和输入法弹出应在真机或模拟器做最终目测验收；移动浏览器基础页面检查不替代真机验收。

## 尚需进入下一阶段的能力

- 当前 Kotlin 前台服务负责 Android 前台生命周期、通知和取消信号；渲染计划仍由共享 WebView/Rust 导出器执行，系统杀死 WebView 后由持久化队列在下次打开恢复，不应称为“原生服务独立渲染已验收”。
- 原生分块解码/绘制/按行编码仍未完成；目前已完成的是成品分块写入 MediaStore，原图解码与排版仍在 WebView/Rust 共享渲染链。
- SQLite 当前用于版本化队列/本地记录镜像；移动原图 Blob、编辑历史和模板仍由 WebView IndexedDB 管理，Room/SQLite 全量数据迁移待后续版本。
- 正式 release 签名、同签名覆盖升级、正式版包和签名校验。
# 2026-09-19 接管说明

以下是历史测试记录，不能代表当前源码或最终 APK 已验收。当前差距和本轮结果见 [接管审计](AUDIT-2026-09-19.md)。现有 APK 未包含本轮修复，暂不交付。
# 2026-09-21 当前版本提示

下文属于旧版历史报告。0.3.4请以 `ACCEPTANCE-2026-09-21.md`、`DELIVERY-0.3.4.md` 及交付目录校验文件为准，不能用旧哈希验收新包。
