package com.framelab.app

import android.content.Context
import android.content.ContextWrapper
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Isolated stores: never mutate the emulator's user library during these tests. */
internal object FrameLabBackupChecks {
  fun run(base: Context) {
    val root = File(base.cacheDir, "backup-check-${java.util.UUID.randomUUID()}").apply { check(mkdir()) }
    val context = object : ContextWrapper(base) {
      override fun getApplicationContext(): Context = this
      override fun getFilesDir(): File = File(root, "files").apply { mkdirs() }
      override fun getCacheDir(): File = File(root, "cache").apply { mkdirs() }
      override fun getDatabasePath(name: String): File = File(root, name)
      override fun openOrCreateDatabase(name: String, mode: Int, factory: SQLiteDatabase.CursorFactory?): SQLiteDatabase = SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name), factory)
      override fun openOrCreateDatabase(name: String, mode: Int, factory: SQLiteDatabase.CursorFactory?, errorHandler: DatabaseErrorHandler?): SQLiteDatabase = SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name).path, factory, errorHandler)
    }
    try {
      FrameLabAssetStore.execute(context, "list", "{}")
      FrameLabHistoryStore.execute(context, "count", "{}")
      val original = File(context.filesDir, "originals/fixture.png").apply { parentFile!!.mkdirs() }
      val bitmap = Bitmap.createBitmap(16, 12, Bitmap.Config.ARGB_8888)
      original.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
      val asset = JSONObject().put("id", "p1").put("name", "测试原图.png").put("type", "image/png").put("size", original.length())
        .put("width",16).put("height",12).put("originalPath",original.path).put("createdAt",1).put("updatedAt",1)
      SQLiteDatabase.openDatabase(context.getDatabasePath("framelab-assets.db").path, null, SQLiteDatabase.OPEN_READWRITE).use {
        it.execSQL("INSERT INTO assets(id,value) VALUES(?,?)", arrayOf("p1",asset.toString()))
      }
      FrameLabAssetStore.execute(context,"saveCopy",JSONObject().put("record",JSONObject().put("id","c1").put("sourceId","p1").put("name","副本")).toString())
      val state = JSONObject().put("photoSrc", "http://asset.localhost/" + java.net.URLEncoder.encode(original.path, "UTF-8")).put("brand", "custom:l1").put("padding", 42)
      for ((id,photo) in listOf("n1" to "p1", "n2" to "c1", "orphan" to "removed-photo")) {
        FrameLabHistoryStore.execute(context,"put",JSONObject().put("node",JSONObject().put("id",id).put("photoId",photo).put("seq",2).put("state",state)).toString())
      }
      FrameLabHistoryStore.execute(context,"setCursor","{\"photoId\":\"p1\",\"nodeId\":\"n1\"}")
      val ui = JSONObject().put("templates",JSONArray().put(JSONObject().put("id","t1").put("name","模板").put("category","all").put("config",JSONObject().put("brand","custom:l1"))))
        .put("logos",JSONArray().put(JSONObject().put("id","l1").put("name","logo").put("dataURL","data:image/png;base64,AA==")))
      val bytes = ByteArrayOutputStream()
      FrameLabBackup.write(context,bytes,ui)
      val preview = FrameLabBackup.prepare(context,bytes.toByteArray().inputStream())
      check(preview.getInt("photos")==1 && preview.getInt("history")==2)
      val restoredUI = FrameLabBackup.commit(context,preview.getString("token"))
      check(FrameLabLocalStore.get(context,FrameLabBackup.PENDING_UI)!=null)
      val assets = JSONArray(FrameLabAssetStore.execute(context,"list","{}"))
      check(assets.length()==2)
      val restored = (0 until assets.length()).map { assets.getJSONObject(it) }.first { it.getString("id")!="p1" }
      check(File(restored.getString("originalPath")).readBytes().contentEquals(original.readBytes()))
      val photo = restored.getString("id")
      val history = JSONArray(FrameLabHistoryStore.execute(context,"list",JSONObject().put("photoId",photo).toString()))
      check(history.length()==1 && history.getJSONObject(0).getJSONObject("state").getInt("padding")==42)
      check(history.getJSONObject(0).getJSONObject("state").getString("photoSrc").contains(java.net.URLEncoder.encode(restored.getString("originalPath"),"UTF-8")))
      check(history.getJSONObject(0).getJSONObject("state").getString("brand")=="custom:"+restoredUI.getJSONArray("logos").getJSONObject(0).getString("id"))
      check(FrameLabHistoryStore.execute(context,"getCursor",JSONObject().put("photoId",photo).toString())==JSONObject.quote(history.getJSONObject(0).getString("id")))
      check(FrameLabHistoryStore.execute(context,"getCursor","{\"photoId\":\"p1\"}")=="\"n1\"")
      FrameLabLocalStore.delete(context,FrameLabBackup.PENDING_UI)
      fun rejectArchive(data: ByteArray) {
        check(runCatching { FrameLabBackup.prepare(context,data.inputStream()) }.isFailure)
        check(JSONArray(FrameLabAssetStore.execute(context,"list","{}")).length()==2)
      }
      val bad = ByteArrayOutputStream()
      ZipOutputStream(bad).use { it.putNextEntry(ZipEntry("../escape")); it.write(1); it.closeEntry() }
      rejectArchive(bad.toByteArray())
      rejectArchive(bytes.toByteArray().copyOf(bytes.size()/2))
      val cancelled = FrameLabBackup.prepare(context,bytes.toByteArray().inputStream())
      FrameLabBackup.discard(cancelled.getString("token"))
      check(runCatching { FrameLabBackup.commit(context,cancelled.getString("token")) }.isFailure)
    } finally {
      check(root.canonicalFile.parentFile==base.cacheDir.canonicalFile)
      root.deleteRecursively()
    }
  }
}
