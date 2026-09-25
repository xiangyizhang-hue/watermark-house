package com.framelab.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Chunked MediaStore writer used for high-resolution output. */
internal object FrameLabMediaStream {
  private data class Pending(val uri: Uri, val mime: String, val output: OutputStream)
  private val pending = ConcurrentHashMap<String, Pending>()

  fun begin(context: Context, filename: String, mimeInput: String): String {
    val mime = normalizeMime(mimeInput)
    val displayName = normalizeName(filename, mime)
    val values = ContentValues().apply {
      put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Images.Media.MIME_TYPE, mime)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/水印小屋")
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }
    }
    val resolver = context.contentResolver
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("系统相册拒绝创建媒体项")
    try {
      val output = resolver.openOutputStream(uri, "w")
        ?: throw IllegalStateException("无法打开系统相册写入流")
      val token = UUID.randomUUID().toString()
      pending[token] = Pending(uri, mime, output)
      return token
    } catch (error: Exception) {
      resolver.delete(uri, null, null)
      throw error
    }
  }

  fun write(token: String, base64: String) {
    val item = pending[token] ?: throw IllegalStateException("导出写入已过期")
    val bytes = try {
      Base64.decode(base64, Base64.DEFAULT)
    } catch (error: IllegalArgumentException) {
      throw IllegalArgumentException("导出分块损坏", error)
    }
    if (bytes.isEmpty()) throw IllegalArgumentException("导出分块为空")
    item.output.write(bytes)
    item.output.flush()
  }

  fun finish(context: Context, token: String): Uri {
    val item = pending.remove(token) ?: throw IllegalStateException("导出写入已过期")
    try {
      item.output.close()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        context.contentResolver.update(
          item.uri,
          ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) },
          null,
          null,
        )
      }
      return item.uri
    } catch (error: Exception) {
      context.contentResolver.delete(item.uri, null, null)
      throw error
    }
  }

  fun abort(context: Context, token: String) {
    val item = pending.remove(token) ?: return
    runCatching { item.output.close() }
    runCatching { context.contentResolver.delete(item.uri, null, null) }
  }

  fun abortAll(context: Context) {
    pending.keys.toList().forEach { abort(context, it) }
  }

  private fun normalizeMime(input: String): String = when (input.lowercase()) {
    "image/png" -> "image/png"
    "image/jpeg", "image/jpg" -> "image/jpeg"
    else -> throw IllegalArgumentException("仅支持 JPG 或 PNG")
  }

  private fun normalizeName(input: String, mime: String): String {
    val extension = if (mime == "image/png") ".png" else ".jpg"
    val requested = input.substringAfterLast('/').substringAfterLast('\\')
      .replace(Regex("[\\\\/:*?\"<>|\\r\\n]"), "_")
      .trim()
    if (requested.isBlank()) return "水印小屋_${System.currentTimeMillis()}$extension"
    return if (requested.lowercase().endsWith(extension)) requested
    else requested.substringBeforeLast('.', requested) + extension
  }
}
