package com.framelab.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Base64
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/** Originals live in filesDir, never cacheDir. SQLite owns stable photo/copy identities. */
internal object FrameLabAssetStore {
  private class Helper(context: Context) : SQLiteOpenHelper(context, "framelab-assets.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE assets(id TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)")
      db.execSQL("CREATE TABLE copies(id TEXT PRIMARY KEY NOT NULL,source_id TEXT NOT NULL,value TEXT NOT NULL)")
      db.execSQL("CREATE TABLE metadata(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      error("未提供图库迁移；保留原数据")
    }
  }
  private data class Pending(val file: File, val output: FileOutputStream, val metadata: JSONObject, var bytes: Long = 0)
  private val pending = mutableMapOf<String, Pending>()

  private fun withThumbnail(context: Context, record: JSONObject): JSONObject {
    val source = File(record.getString("originalPath"))
    val directory = File(context.cacheDir, "photo-thumbnails").apply { mkdirs() }
    val target = File(directory, source.nameWithoutExtension + ".jpg")
    if (!target.exists()) runCatching {
      val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(source.absolutePath, options)
      var sample = 1
      while (maxOf(options.outWidth, options.outHeight) / sample > 640) sample *= 2
      options.inJustDecodeBounds = false
      options.inSampleSize = sample
      val decoded = BitmapFactory.decodeFile(source.absolutePath, options) ?: return@runCatching
      var transformed: Bitmap? = null
      try {
        val orientation = runCatching { ExifInterface(source.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
        val matrix = Matrix().apply {
          when (orientation) {
            2 -> setScale(-1f, 1f); 3 -> setRotate(180f); 4 -> setScale(1f, -1f)
            5 -> { setRotate(90f); postScale(-1f, 1f) }
            6 -> setRotate(90f)
            7 -> { setRotate(-90f); postScale(-1f, 1f) }
            8 -> setRotate(-90f)
          }
        }
        transformed = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        FileOutputStream(target).use { check(transformed.compress(Bitmap.CompressFormat.JPEG, 82, it)) }
      } finally {
        if (transformed !== decoded) transformed?.recycle()
        decoded.recycle()
      }
    }.onFailure { target.delete() }
    if (target.exists()) record.put("thumbPath", target.absolutePath)
    return record
  }

  @Synchronized
  fun execute(context: Context, operation: String, payload: String): String {
    val args = JSONObject(payload)
    val root = File(context.filesDir, "originals").apply { check(mkdirs() || isDirectory) }
    when (operation) {
      "begin" -> {
        val metadata = args.getJSONObject("metadata")
        require(metadata.getString("id").isNotBlank())
        require(metadata.getLong("size") > 0)
        val token = UUID.randomUUID().toString()
        val file = File(root, "$token.pending")
        pending[token] = Pending(file, FileOutputStream(file), metadata)
        return JSONObject.quote(token)
      }
      "chunk" -> {
        val item = pending[args.getString("token")] ?: error("原图导入已过期")
        val encoded = args.getString("data")
        require(encoded.length <= 1500000) { "导入分块过大" }
        val bytes = Base64.decode(encoded, Base64.DEFAULT)
        require(item.bytes + bytes.size <= item.metadata.getLong("size")) { "原图长度不匹配" }
        item.output.write(bytes)
        item.bytes += bytes.size
        return "null"
      }
      "abort" -> {
        pending.remove(args.getString("token"))?.let {
          runCatching { it.output.close() }; it.file.delete()
        }
        return "null"
      }
    }
    val helper = Helper(context.applicationContext)
    try {
      val db = helper.writableDatabase
      when (operation) {
        "migrated" -> db.rawQuery("SELECT 1 FROM metadata WHERE key='indexeddb-v2'", null).use { return it.moveToFirst().toString() }
        "exists" -> db.rawQuery("SELECT 1 FROM assets WHERE id=?", arrayOf(args.getString("id"))).use { return it.moveToFirst().toString() }
        "list", "listCopies" -> {
          val output = JSONArray()
          val table = if (operation == "list") "assets" else "copies"
          db.query(table, arrayOf("value"), null, null, null, null, "id").use {
            while (it.moveToNext()) {
              val record = JSONObject(it.getString(0))
              output.put(if (operation == "list") withThumbnail(context, record) else record)
            }
          }
          return output.toString()
        }
        "finish" -> {
          val token = args.getString("token")
          val item = pending.remove(token) ?: error("原图导入已过期")
          var destination: File? = null
          try {
            require(item.bytes == item.metadata.getLong("size")) { "原图未完整写入" }
            item.output.fd.sync()
            item.output.close()
            val extension = when (item.metadata.optString("type")) {
              "image/png" -> "png"; "image/webp" -> "webp"; "image/gif" -> "gif"
              "image/avif" -> "avif"; "image/bmp" -> "bmp"; else -> "jpg"
            }
            destination = File(root, "$token.$extension")
            check(item.file.renameTo(destination)) { "原图提交失败" }
            item.metadata.put("originalPath", destination.absolutePath)
            db.beginTransaction()
            try {
              val values = ContentValues().apply {
                put("id", item.metadata.getString("id")); put("value", item.metadata.toString())
              }
              check(db.insertWithOnConflict("assets", null, values, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
              db.setTransactionSuccessful()
            } finally { db.endTransaction() }
            return withThumbnail(context, item.metadata).toString()
          } catch (error: Exception) {
            runCatching { item.output.close() }; item.file.delete(); destination?.delete()
            throw error
          }
        }
      }
      db.beginTransaction()
      try {
        when (operation) {
          "finishMigration" -> db.execSQL("INSERT OR REPLACE INTO metadata(key,value) VALUES('indexeddb-v2','complete')")
          "update" -> {
            val id = args.getString("id")
            db.rawQuery("SELECT value FROM assets WHERE id=?", arrayOf(id)).use {
              check(it.moveToFirst()) { "找不到原图记录" }
              val value = JSONObject(it.getString(0))
              val patch = args.getJSONObject("patch")
              for (key in listOf("exif", "name", "updatedAt")) if (patch.has(key)) value.put(key, patch.get(key))
              db.update("assets", ContentValues().apply { put("value", value.toString()) }, "id=?", arrayOf(id))
            }
          }
          "saveCopy" -> {
            val record = args.getJSONObject("record")
            val source = record.getString("sourceId")
            db.rawQuery("SELECT 1 FROM assets WHERE id=?", arrayOf(source)).use { check(it.moveToFirst()) { "副本原图不存在" } }
            check(db.insertWithOnConflict("copies", null, ContentValues().apply {
              put("id", record.getString("id")); put("source_id", source); put("value", record.toString())
            }, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
          }
          // Removal affects the library, not files: retained originals remain recoverable.
          "delete" -> {
            db.delete("copies", "source_id=?", arrayOf(args.getString("id")))
            db.delete("assets", "id=?", arrayOf(args.getString("id")))
          }
          "deleteCopy" -> db.delete("copies", "id=?", arrayOf(args.getString("id")))
          "clear" -> { db.delete("copies", null, null); db.delete("assets", null, null) }
          "clearCopies" -> db.delete("copies", null, null)
          else -> error("未知图库操作：$operation")
        }
        db.setTransactionSuccessful()
      } finally { db.endTransaction() }
      return "null"
    } finally { helper.close() }
  }
}
