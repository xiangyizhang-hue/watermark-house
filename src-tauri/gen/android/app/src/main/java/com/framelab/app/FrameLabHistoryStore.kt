package com.framelab.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/** Authoritative Android history. Every mutation resolves only after its transaction commits. */
internal object FrameLabHistoryStore {
  private class Helper(context: Context) : SQLiteOpenHelper(context, "framelab-history.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE nodes(id TEXT PRIMARY KEY NOT NULL, photo_id TEXT NOT NULL, seq INTEGER NOT NULL, value TEXT NOT NULL)")
      db.execSQL("CREATE INDEX nodes_photo ON nodes(photo_id, seq)")
      db.execSQL("CREATE TABLE metadata(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      error("未提供历史数据库迁移；保留原数据")
    }
  }

  private fun put(db: SQLiteDatabase, node: JSONObject, conflict: Int = SQLiteDatabase.CONFLICT_REPLACE) {
    val id = node.getString("id")
    val photoId = node.getString("photoId")
    require(id.isNotBlank() && photoId.isNotBlank()) { "历史记录标识无效" }
    node.getJSONObject("state")
    val values = ContentValues().apply {
      put("id", id); put("photo_id", photoId)
      put("seq", node.getLong("seq")); put("value", node.toString())
    }
    val result = db.insertWithOnConflict("nodes", null, values, conflict)
    if (result == -1L) {
      check(conflict == SQLiteDatabase.CONFLICT_IGNORE) { "历史保存失败" }
      db.rawQuery("SELECT 1 FROM nodes WHERE id=?", arrayOf(id)).use {
        check(it.moveToFirst()) { "历史迁移写入失败" }
      }
    }
  }

  @Synchronized
  fun execute(context: Context, operation: String, payload: String): String {
    val args = JSONObject(payload)
    val helper = Helper(context.applicationContext)
    try {
      val db = helper.writableDatabase
      when (operation) {
        "getCursor" -> db.rawQuery("SELECT value FROM metadata WHERE key=?", arrayOf("cursor:" + args.getString("photoId"))).use {
          return if (it.moveToFirst()) JSONObject.quote(it.getString(0)) else "null"
        }
        "migrated" -> db.rawQuery("SELECT value FROM metadata WHERE key='indexeddb-v1'", null).use {
          return (it.moveToFirst()).toString()
        }
        "list" -> {
          val result = JSONArray()
          db.query("nodes", arrayOf("value"), "photo_id=?", arrayOf(args.getString("photoId")), null, null, "seq ASC").use {
            while (it.moveToNext()) result.put(JSONObject(it.getString(0)))
          }
          return result.toString()
        }
        "count" -> db.rawQuery("SELECT COUNT(*) FROM nodes", null).use {
          it.moveToFirst(); return it.getLong(0).toString()
        }
      }
      db.beginTransaction()
      try {
        when (operation) {
          "setCursor" -> db.execSQL("INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)", arrayOf("cursor:" + args.getString("photoId"), args.getString("nodeId")))
          "put" -> put(db, args.getJSONObject("node"))
          "import" -> {
            val nodes = args.getJSONArray("nodes")
            for (i in 0 until nodes.length()) put(db, nodes.getJSONObject(i), SQLiteDatabase.CONFLICT_IGNORE)
          }
          "finishMigration" -> db.execSQL("INSERT OR REPLACE INTO metadata(key,value) VALUES('indexeddb-v1','complete')")
          "deleteIds", "deletePhotos" -> {
            val ids = args.getJSONArray("ids")
            val column = if (operation == "deleteIds") "id" else "photo_id"
            for (i in 0 until ids.length()) db.delete("nodes", "$column=?", arrayOf(ids.getString(i)))
          }
          "clear" -> db.delete("nodes", null, null)
          else -> error("未知历史操作：$operation")
        }
        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }
      return "null"
    } finally {
      helper.close()
    }
  }
}
