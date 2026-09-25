package com.framelab.app

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.plugin.PluginManager
import org.json.JSONObject
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@InvokeArg
internal class SaveMediaArgs {
  lateinit var filename: String
  lateinit var mime: String
  lateinit var dataBase64: String
}

@InvokeArg
internal class StartExportServiceArgs {
  lateinit var jobId: String
  var total: Int = 0
  var completed: Int = 0
  var label: String = ""
}

@InvokeArg
internal class UpdateExportServiceArgs {
  lateinit var jobId: String
  var total: Int = 0
  var completed: Int = 0
  var label: String = ""
}

@InvokeArg
internal class ExportJobIdArgs {
  lateinit var jobId: String
}

@InvokeArg
internal class BeginMediaArgs {
  lateinit var filename: String
  lateinit var mime: String
}

@InvokeArg
internal class WriteMediaChunkArgs {
  lateinit var token: String
  lateinit var dataBase64: String
}

@InvokeArg
internal class MediaTokenArgs {
  lateinit var token: String
}

@InvokeArg
internal class LocalRecordArgs {
  lateinit var key: String
  lateinit var value: String
  var version: Int = 1
}

@InvokeArg
internal class LocalRecordKeyArgs {
  lateinit var key: String
}

@InvokeArg
internal class HistoryArgs {
  lateinit var operation: String
  lateinit var payload: String
}

/**
 * 水印小屋 Android bridge.
 *
 * The web layer only supplies an already rendered image. This class owns the
 * MediaStore transaction so a successful response means the item is visible
 * in Pictures/水印小屋, not merely downloaded by the WebView.
 */
@TauriPlugin
class FrameLabPlugin(hostActivity: Activity) : Plugin(hostActivity) {
  // Tauri can retain this bridge across Activity recreation (font size/density).
  // File/database work belongs to the process, not the destroyed Activity.
  private val activity = hostActivity.applicationContext
  companion object {
    private val io: ExecutorService = Executors.newSingleThreadExecutor()
    private val documentBusy = java.util.concurrent.atomic.AtomicBoolean(false)
  }

  @Command
  fun assets(invoke: Invoke) {
    val args = try { invoke.parseArgs(HistoryArgs::class.java) } catch (error: Exception) {
      invoke.reject("图库参数无效：${error.message}"); return
    }
    if (args.operation in setOf("backupExport", "backupOpen", "documentExport", "documentOpen")) {
      if (!documentBusy.compareAndSet(false, true)) { invoke.reject("请先完成当前文件操作"); return }
      try {
        val payload = JSONObject(args.payload)
        val writing = args.operation.endsWith("Export")
        val intent = Intent(if (writing) Intent.ACTION_CREATE_DOCUMENT else Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = if (!writing) "*/*" else if (args.operation == "backupExport") "application/zip" else "application/json"
          if (writing) putExtra(Intent.EXTRA_TITLE, payload.optString("filename", "水印小屋-backup.zip").substringAfterLast('/').substringAfterLast('\\'))
        }
        PluginManager.activity.runOnUiThread {
          try { startActivityForResult(invoke, intent, "onDocumentResult") }
          catch (error: Exception) { documentBusy.set(false); invoke.reject("无法打开文件选择器：${error.message}") }
        }
      } catch (error: Exception) { documentBusy.set(false); invoke.reject("文件参数无效：${error.message}") }
      return
    }
    io.execute {
      try {
        val payload = JSONObject(args.payload)
        val result = when (args.operation) {
          "backupCommit" -> FrameLabBackup.commit(activity, payload.getString("token")).toString()
          "backupDiscard" -> { FrameLabBackup.discard(payload.getString("token")); "null" }
          "backupPending" -> FrameLabLocalStore.get(activity, FrameLabBackup.PENDING_UI) ?: "null"
          "backupFinish" -> { FrameLabLocalStore.delete(activity, FrameLabBackup.PENDING_UI); "null" }
          else -> FrameLabAssetStore.execute(activity, args.operation, args.payload)
        }
        invoke.resolveObject(result)
      }
      catch (error: Exception) { invoke.reject("图库存储失败：${error.message}") }
    }
  }

  @ActivityCallback
  fun onDocumentResult(invoke: Invoke, result: ActivityResult) {
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) {
      documentBusy.set(false); invoke.resolveObject("null"); return
    }
    io.execute {
      try {
        val args = invoke.parseArgs(HistoryArgs::class.java)
        val payload = JSONObject(args.payload)
        val resolver = activity.contentResolver
        val response = when (args.operation) {
          "backupExport" -> resolver.openOutputStream(uri, "w")?.use { FrameLabBackup.write(activity, it, payload.getJSONObject("ui")).toString() }
          "backupOpen" -> resolver.openInputStream(uri)?.use { FrameLabBackup.prepare(activity, it).toString() }
          "documentExport" -> resolver.openOutputStream(uri, "w")?.use {
            val bytes = payload.getString("text").toByteArray(Charsets.UTF_8)
            require(bytes.size <= 32 * 1024 * 1024) { "模板文件超过32MB" }
            it.write(bytes); it.flush(); "true"
          }
          "documentOpen" -> resolver.openInputStream(uri)?.use {
            val bytes = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val n = it.read(buffer); if (n < 0) break
              require(bytes.size() + n <= 32 * 1024 * 1024) { "模板文件超过32MB" }
              bytes.write(buffer, 0, n)
            }
            JSONObject.quote(bytes.toString("UTF-8"))
          }
          else -> error("未知文件操作")
        } ?: error("无法读取或写入所选文件")
        invoke.resolveObject(response)
      } catch (error: Exception) {
        // Keep provider-managed documents intact on failure; never delete an arbitrary URI.
        invoke.reject("文件操作失败：${error.message}；若生成了不完整文件，请勿用于恢复")
      } finally { documentBusy.set(false) }
    }
  }

  @Command
  fun history(invoke: Invoke) {
    val args = try { invoke.parseArgs(HistoryArgs::class.java) } catch (error: Exception) {
      invoke.reject("历史参数无效：${error.message}"); return
    }
    io.execute {
      try {
        invoke.resolveObject(FrameLabHistoryStore.execute(activity, args.operation, args.payload))
      } catch (error: Exception) {
        invoke.reject("历史存储失败：${error.message}")
      }
    }
  }

  @Command
  fun saveMedia(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(SaveMediaArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("保存参数无效：${error.message ?: "未知错误"}")
      return
    }

    io.execute {
      try {
        val uri = saveToMediaStore(args)
        // Resolve a JSON string so the stable Rust command can return the
        // location without exposing Android types to the frontend.
        invoke.resolveObject(uri.toString())
      } catch (error: Exception) {
        invoke.reject("写入 水印小屋 相册失败：${error.message ?: "未知错误"}")
      }
    }
  }

  /** Begin a streaming MediaStore transaction. Chunks never need to coexist in memory. */
  @Command
  fun beginMedia(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(BeginMediaArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("流式保存参数无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      try {
        val token = FrameLabMediaStream.begin(activity, args.filename, args.mime)
        invoke.resolveObject(token)
      } catch (error: Exception) {
        invoke.reject("无法开始写入 水印小屋 相册：${error.message ?: "未知错误"}")
      }
    }
  }

  @Command
  fun writeMediaChunk(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(WriteMediaChunkArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("流式保存分块参数无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      try {
        FrameLabMediaStream.write(args.token, args.dataBase64)
        invoke.resolveObject("ok")
      } catch (error: Exception) {
        invoke.reject("写入 水印小屋 相册分块失败：${error.message ?: "未知错误"}")
      }
    }
  }

  @Command
  fun finishMedia(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(MediaTokenArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("流式保存令牌无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      try {
        invoke.resolveObject(FrameLabMediaStream.finish(activity, args.token).toString())
      } catch (error: Exception) {
        invoke.reject("完成 水印小屋 相册写入失败：${error.message ?: "未知错误"}")
      }
    }
  }

  @Command
  fun abortMedia(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(MediaTokenArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("流式保存令牌无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      FrameLabMediaStream.abort(activity, args.token)
      invoke.resolveObject("ok")
    }
  }

  /** Versioned SQLite key/value records for queues and future mobile migrations. */
  @Command
  fun saveLocalRecord(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(LocalRecordArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("本地记录参数无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      try {
        FrameLabLocalStore.put(activity, args.key, args.version, args.value)
        invoke.resolveObject("ok")
      } catch (error: Exception) {
        invoke.reject("本地记录保存失败：${error.message ?: "未知错误"}")
      }
    }
  }

  @Command
  fun loadLocalRecord(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(LocalRecordKeyArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("本地记录参数无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      try {
        val value = FrameLabLocalStore.get(activity, args.key)
        if (value == null) invoke.resolve() else invoke.resolveObject(value)
      } catch (error: Exception) {
        invoke.reject("本地记录读取失败：${error.message ?: "未知错误"}")
      }
    }
  }

  @Command
  fun deleteLocalRecord(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(LocalRecordKeyArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("本地记录参数无效：${error.message ?: "未知错误"}")
      return
    }
    io.execute {
      try {
        FrameLabLocalStore.delete(activity, args.key)
        invoke.resolveObject("ok")
      } catch (error: Exception) {
        invoke.reject("本地记录删除失败：${error.message ?: "未知错误"}")
      }
    }
  }

  /** Start a native foreground lifetime for a web-rendered export batch. */
  @Command
  fun startExportService(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(StartExportServiceArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("导出任务参数无效：${error.message ?: "未知错误"}")
      return
    }
    try {
      ExportServiceBridge.start(activity, args.jobId, args.total, args.completed, args.label)
      invoke.resolveObject("ok")
    } catch (error: Exception) {
      invoke.reject("无法启动后台导出通知：${error.message ?: "未知错误"}")
    }
  }

  /** Update the system notification without requiring the WebView to stay visible. */
  @Command
  fun updateExportService(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(UpdateExportServiceArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("导出进度参数无效：${error.message ?: "未知错误"}")
      return
    }
    try {
      ExportServiceBridge.update(activity, args.jobId, args.total, args.completed, args.label)
      invoke.resolveObject("ok")
    } catch (error: Exception) {
      invoke.reject("无法更新后台导出进度：${error.message ?: "未知错误"}")
    }
  }

  /** Request cancellation from the notification or the page; the web loop observes it. */
  @Command
  fun cancelExportService(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(ExportJobIdArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("导出任务参数无效：${error.message ?: "未知错误"}")
      return
    }
    try {
      ExportServiceBridge.cancel(activity, args.jobId)
      invoke.resolveObject("ok")
    } catch (error: Exception) {
      invoke.reject("无法取消后台导出：${error.message ?: "未知错误"}")
    }
  }

  @Command
  fun isExportCancelled(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(ExportJobIdArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("导出任务参数无效：${error.message ?: "未知错误"}")
      return
    }
    invoke.resolveObject(ExportServiceBridge.isCancelled(activity, args.jobId))
  }

  @Command
  fun stopExportService(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(ExportJobIdArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("导出任务参数无效：${error.message ?: "未知错误"}")
      return
    }
    try {
      ExportServiceBridge.stop(activity, args.jobId)
      invoke.resolveObject("ok")
    } catch (error: Exception) {
      invoke.reject("无法结束后台导出：${error.message ?: "未知错误"}")
    }
  }

  private fun saveToMediaStore(args: SaveMediaArgs): android.net.Uri {
    val mime = when (args.mime.lowercase()) {
      "image/png" -> "image/png"
      "image/jpeg", "image/jpg" -> "image/jpeg"
      else -> throw IllegalArgumentException("仅支持 JPG 或 PNG")
    }
    if (args.dataBase64.length > 45_000_000) {
      throw IllegalArgumentException("单张成品过大，请降低尺寸或倍率后重试")
    }
    val bytes = try {
      Base64.decode(args.dataBase64, Base64.DEFAULT)
    } catch (error: IllegalArgumentException) {
      throw IllegalArgumentException("导出数据损坏", error)
    }
    if (bytes.isEmpty()) throw IllegalArgumentException("导出数据为空")

    val extension = if (mime == "image/png") ".png" else ".jpg"
    val requested = args.filename
      .substringAfterLast('/')
      .substringAfterLast('\\')
      .replace(Regex("[\\\\/:*?\"<>|\\r\\n]"), "_")
      .trim()
    val displayName = if (requested.isBlank()) {
      "水印小屋_${System.currentTimeMillis()}$extension"
    } else if (requested.lowercase().endsWith(extension)) {
      requested
    } else {
      requested.substringBeforeLast('.', requested) + extension
    }

    val values = ContentValues().apply {
      put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Images.Media.MIME_TYPE, mime)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        put(
          MediaStore.Images.Media.RELATIVE_PATH,
          Environment.DIRECTORY_PICTURES + "/水印小屋"
        )
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }
    }

    val resolver = activity.contentResolver
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("系统相册拒绝创建媒体项")
    try {
      resolver.openOutputStream(uri, "w")?.use { stream ->
        stream.write(bytes)
        stream.flush()
      } ?: throw IllegalStateException("无法打开系统相册写入流")

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val published = ContentValues().apply {
          put(MediaStore.Images.Media.IS_PENDING, 0)
        }
        resolver.update(uri, published, null, null)
      }
      return uri
    } catch (error: Exception) {
      resolver.delete(uri, null, null)
      throw error
    }
  }

  override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
    // Serialize cleanup behind writes; never interrupt an SQLite transaction or
    // leave a retained plugin permanently backed by a terminated executor.
    val context = activity.applicationContext
    io.execute { FrameLabMediaStream.abortAll(context) }
    super.onDestroy(activity)
  }
}
