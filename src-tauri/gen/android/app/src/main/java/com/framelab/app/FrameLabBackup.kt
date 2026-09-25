package com.framelab.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Versioned logical backup. Restore appends new identities in one attached-DB transaction. */
internal object FrameLabBackup {
  const val PENDING_UI = "backup-pending-ui-v1"
  private const val MAX_JSON = 32 * 1024 * 1024
  private const val RESERVE = 64L * 1024 * 1024
  private val staged = mutableMapOf<String, Pair<File, JSONObject>>()

  private fun rows(context: Context, name: String, sql: String): JSONArray {
    val path = context.getDatabasePath(name)
    if (!path.exists()) return JSONArray()
    val db = SQLiteDatabase.openDatabase(path.path, null, SQLiteDatabase.OPEN_READONLY)
    try {
      val result = JSONArray()
      db.rawQuery(sql, null).use { cursor ->
        while (cursor.moveToNext()) result.put(JSONObject(cursor.getString(0)))
      }
      return result
    } finally { db.close() }
  }

  private fun sha(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(128 * 1024)
      while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  fun write(context: Context, output: OutputStream, ui: JSONObject): JSONObject {
    check(FrameLabLocalStore.get(context, PENDING_UI) == null) { "请先完成上次恢复，再创建备份" }
    require(ui.toString().toByteArray().size <= MAX_JSON) { "模板或素材数据过大" }
    val assets = rows(context, "framelab-assets.db", "SELECT value FROM assets ORDER BY id")
    val copies = rows(context, "framelab-assets.db", "SELECT value FROM copies ORDER BY id")
    val photoIds = mutableSetOf<String>()
    for (list in listOf(assets, copies)) for (i in 0 until list.length()) photoIds.add(list.getJSONObject(i).getString("id"))
    fun filtered(array: JSONArray, keep: (JSONObject) -> Boolean): JSONArray = JSONArray().also { result ->
      for (i in 0 until array.length()) array.getJSONObject(i).let { if (keep(it)) result.put(it) }
    }
    ui.put("snapshots", filtered(ui.optJSONArray("snapshots") ?: JSONArray()) { photoIds.contains(it.getString("photoId")) })
    val nodes = filtered(rows(context, "framelab-history.db", "SELECT value FROM nodes ORDER BY seq")) { photoIds.contains(it.getString("photoId")) }
    val cursors = filtered(rows(context, "framelab-history.db", "SELECT json_object('key',m.key,'value',m.value) FROM metadata m JOIN nodes n ON n.id=m.value AND m.key='cursor:'||n.photo_id")) { photoIds.contains(it.getString("key").removePrefix("cursor:")) }
    val manifest = JSONObject().put("kind", "framelab-backup").put("version", 1)
      .put("createdAt", System.currentTimeMillis()).put("assets", assets).put("copies", copies)
      .put("nodes", nodes).put("cursors", cursors).put("ui", ui)
    val root = File(context.filesDir, "originals").canonicalFile
    ZipOutputStream(output.buffered()).use { zip ->
      zip.setLevel(0) // Original JPEG/PNG bytes are already compressed; keep CPU use bounded.
      for (i in 0 until assets.length()) {
        val asset = assets.getJSONObject(i)
        val source = File(asset.getString("originalPath")).canonicalFile
        require(source.parentFile == root && source.isFile) { "原图缺失，备份已停止：${asset.optString("name")}" }
        val entry = "originals/${source.name}"
        asset.put("entry", entry).put("sha256", sha(source)).put("size", source.length())
        asset.remove("thumbPath")
        zip.putNextEntry(ZipEntry(entry)); source.inputStream().use { it.copyTo(zip, 128 * 1024) }; zip.closeEntry()
      }
      val bytes = manifest.toString().toByteArray(Charsets.UTF_8)
      require(bytes.size <= MAX_JSON) { "备份历史/模板清单超过32MB，请减少历史后重试" }
      zip.putNextEntry(ZipEntry("manifest.json")); zip.write(bytes); zip.closeEntry()
    }
    return JSONObject().put("photos", assets.length()).put("copies", copies.length()).put("history", nodes.length())
  }

  fun prepare(context: Context, input: InputStream): JSONObject {
    check(FrameLabLocalStore.get(context, PENDING_UI) == null) { "请先完成上次恢复" }
    val token = UUID.randomUUID().toString()
    val dir = File(context.cacheDir, "restore-$token").apply { check(mkdir()) }
    try {
      val names = mutableSetOf<String>()
      ZipInputStream(input.buffered()).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          val name = entry.name
          require(!entry.isDirectory && (name == "manifest.json" || Regex("originals/[A-Za-z0-9_-]+\\.[A-Za-z0-9]+").matches(name))) { "备份包含非法路径" }
          require(names.add(name) && names.size <= 20001) { "备份文件重复或数量超限" }
          val file = File(dir, name)
          file.parentFile?.mkdirs()
          var size = 0L
          file.outputStream().use { out ->
            val buffer = ByteArray(128 * 1024)
            while (true) {
              val n = zip.read(buffer); if (n < 0) break
              size += n
              require(size <= if (name == "manifest.json") MAX_JSON.toLong() else 1024L * 1024 * 1024) { "备份单文件超过安全上限" }
              require(dir.usableSpace > RESERVE + n) { "空间不足，请至少保留64MB额外空间" }
              out.write(buffer, 0, n)
            }
          }
        }
      }
      val manifest = JSONObject(File(dir, "manifest.json").readText())
      require(manifest.getString("kind") == "framelab-backup" && manifest.getInt("version") == 1) { "备份版本不支持" }
      val assets = manifest.getJSONArray("assets")
      require(assets.length() <= 20000) { "照片数量超限" }
      val ids = mutableSetOf<String>()
      fun claim(id: String) { require(id.isNotBlank() && id.length <= 256 && ids.add(id)) { "标识无效或重复" } }
      val used = mutableSetOf("manifest.json")
      for (i in 0 until assets.length()) {
        val asset = assets.getJSONObject(i)
        claim(asset.getString("id"))
        require(asset.getInt("width") > 0 && asset.getInt("height") > 0) { "照片尺寸无效" }
        val name = asset.getString("entry")
        require(names.contains(name) && name.startsWith("originals/") && used.add(name)) { "备份原图引用无效" }
        val file = File(dir, name)
        require(file.length() == asset.getLong("size") && sha(file) == asset.getString("sha256")) { "原图校验失败：${asset.optString("name")}" }
      }
      require(used == names) { "备份含未声明文件" }
      val copies = manifest.getJSONArray("copies")
      val originals = ids.toSet()
      for (i in 0 until copies.length()) {
        val copy = copies.getJSONObject(i)
        claim(copy.getString("id"))
        require(originals.contains(copy.getString("sourceId"))) { "副本关系无效" }
      }
      val nodes = manifest.getJSONArray("nodes")
      val nodePhotos = mutableMapOf<String, String>()
      val photoIds = ids.toSet()
      for (i in 0 until nodes.length()) {
        val node = nodes.getJSONObject(i)
        val id = node.getString("id"); val photo = node.getString("photoId")
        claim(id)
        require(nodePhotos.put(id, photo) == null && photoIds.contains(photo)) { "历史记录关系无效" }
        node.getJSONObject("state"); node.getLong("seq")
      }
      val cursors = manifest.getJSONArray("cursors")
      val cursorKeys = mutableSetOf<String>()
      for (i in 0 until cursors.length()) {
        val row = cursors.getJSONObject(i)
        require(cursorKeys.add(row.getString("key")) && row.getString("key").startsWith("cursor:") && nodePhotos[row.getString("value")] == row.getString("key").removePrefix("cursor:")) { "撤销位置无效" }
      }
      val ui = manifest.getJSONObject("ui")
      for (key in listOf("templates", "logos")) {
        val list = ui.getJSONArray(key)
        require(list.length() <= if (key == "templates") 10000 else 1000) { "模板/素材数量超限" }
        for (i in 0 until list.length()) claim(list.getJSONObject(i).getString("id"))
      }
      val snapshots = ui.optJSONArray("snapshots") ?: JSONArray()
      require(snapshots.length() <= 10000) { "快照数量超限" }
      for (i in 0 until snapshots.length()) {
        val snapshot = snapshots.getJSONObject(i)
        claim(snapshot.getString("id"))
        require(photoIds.contains(snapshot.getString("photoId"))) { "快照照片不存在" }
        snapshot.getJSONObject("state")
      }
      staged[token] = dir to manifest
      return JSONObject().put("token", token).put("photos", assets.length()).put("copies", copies.length())
        .put("history", nodes.length()).put("createdAt", manifest.optLong("createdAt"))
        .put("ui", manifest.getJSONObject("ui"))
    } catch (error: Exception) { dir.deleteRecursively(); throw error }
  }

  fun discard(token: String) { staged.remove(token)?.first?.deleteRecursively() }

  private fun rewrite(value: Any?, replacements: Map<String, String>): Any? = when (value) {
    is String -> replacements[value] ?: value
    is JSONObject -> JSONObject().also { out -> value.keys().forEach { key -> out.put(key, rewrite(value.get(key), replacements)) } }
    is JSONArray -> JSONArray().also { out -> for (i in 0 until value.length()) out.put(rewrite(value.get(i), replacements)) }
    else -> value
  }

  fun commit(context: Context, token: String): JSONObject {
    check(FrameLabLocalStore.get(context, PENDING_UI) == null) { "请先完成上次恢复" }
    val (dir, source) = staged[token] ?: error("待恢复备份已失效，请重新选择文件")
    val replacements = mutableMapOf<String, String>()
    val assets = source.getJSONArray("assets")
    val copies = source.getJSONArray("copies")
    val nodes = source.getJSONArray("nodes")
    val root = File(context.filesDir, "originals").apply { mkdirs() }
    val moved = mutableListOf<File>()
    fun remap(array: JSONArray, prefix: String) {
      for (i in 0 until array.length()) replacements[array.getJSONObject(i).getString("id")] = prefix + UUID.randomUUID()
    }
    remap(assets, "lib_restore_"); remap(copies, "copy_restore_"); remap(nodes, "node_restore_")
    val ui = source.getJSONObject("ui")
    remap(ui.getJSONArray("templates"), "template_restore_")
    remap(ui.optJSONArray("snapshots") ?: JSONArray(), "snapshot_restore_")
    val logos = ui.getJSONArray("logos")
    for (i in 0 until logos.length()) {
      val id = logos.getJSONObject(i).getString("id"); val fresh = "logo_restore_" + UUID.randomUUID()
      replacements[id] = fresh; replacements["custom:$id"] = "custom:$fresh"
    }
    for (i in 0 until assets.length()) {
      val asset = assets.getJSONObject(i)
      val old = asset.getString("originalPath")
      val destination = File(root, UUID.randomUUID().toString() + "." + File(asset.getString("entry")).extension)
      replacements[old] = destination.path
      val encode = { path: String -> java.net.URLEncoder.encode(path, "UTF-8").replace("+", "%20") }
      replacements["http://asset.localhost/" + encode(old)] = "http://asset.localhost/" + encode(destination.path)
      replacements["http://asset.localhost/$old"] = "http://asset.localhost/${destination.path}"
    }
    val data = rewrite(source, replacements) as JSONObject
    val restoredUI = data.getJSONObject("ui").put("restoreId", token)
    // Ensure tables exist before attaching. All bridge work is on the same serial executor.
    FrameLabAssetStore.execute(context, "list", "{}")
    FrameLabHistoryStore.execute(context, "count", "{}")
    FrameLabLocalStore.get(context, PENDING_UI)
    val db = SQLiteDatabase.openDatabase(context.getDatabasePath("framelab-assets.db").path, null, SQLiteDatabase.OPEN_READWRITE)
    var committed = false
    try {
      for (i in 0 until assets.length()) {
        val asset = assets.getJSONObject(i)
        val destination = File(replacements.getValue(asset.getString("originalPath")))
        check(File(dir, asset.getString("entry")).renameTo(destination)) { "无法迁入原图，请检查存储空间" }
        moved.add(destination)
      }
      db.execSQL("ATTACH DATABASE ? AS history", arrayOf(context.getDatabasePath("framelab-history.db").path))
      db.execSQL("ATTACH DATABASE ? AS local", arrayOf(context.getDatabasePath("framelab-local.db").path))
      db.beginTransaction()
      try {
        val restoredAssets = data.getJSONArray("assets")
        for (i in 0 until restoredAssets.length()) {
          val row = restoredAssets.getJSONObject(i); row.remove("entry"); row.remove("sha256"); row.remove("thumbPath")
          db.execSQL("INSERT INTO assets(id,value) VALUES(?,?)", arrayOf(row.getString("id"), row.toString()))
        }
        val restoredCopies = data.getJSONArray("copies")
        for (i in 0 until restoredCopies.length()) {
          val row = restoredCopies.getJSONObject(i)
          db.execSQL("INSERT INTO copies(id,source_id,value) VALUES(?,?,?)", arrayOf(row.getString("id"), row.getString("sourceId"), row.toString()))
        }
        val restoredNodes = data.getJSONArray("nodes")
        for (i in 0 until restoredNodes.length()) {
          val row = restoredNodes.getJSONObject(i)
          db.execSQL("INSERT INTO history.nodes(id,photo_id,seq,value) VALUES(?,?,?,?)", arrayOf(row.getString("id"), row.getString("photoId"), row.getLong("seq"), row.toString()))
        }
        val cursors = source.getJSONArray("cursors")
        for (i in 0 until cursors.length()) {
          val row = cursors.getJSONObject(i)
          db.execSQL("INSERT INTO history.metadata(key,value) VALUES(?,?)", arrayOf("cursor:" + replacements.getValue(row.getString("key").removePrefix("cursor:")), replacements.getValue(row.getString("value"))))
        }
        db.execSQL("INSERT OR REPLACE INTO local.records(record_key,version,value,updated_at) VALUES(?,1,?,?)", arrayOf(PENDING_UI, restoredUI.toString(), System.currentTimeMillis()))
        db.setTransactionSuccessful()
      } finally { db.endTransaction() }
      committed = true
      discard(token)
      return restoredUI
    } finally {
      db.close()
      if (!committed) { moved.forEach { it.delete() }; discard(token) }
    }
  }
}
