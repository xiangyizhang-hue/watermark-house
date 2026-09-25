package com.framelab.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Small versioned SQLite store for mobile queue metadata and future migrations. */
internal object FrameLabLocalStore {
  private const val DB_NAME = "framelab-local.db"
  private const val DB_VERSION = 1

  private class Helper(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL(
        "CREATE TABLE records (record_key TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)",
      )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      // Keep migrations explicit and additive; never delete user data during an app update.
      if (oldVersion < 1) onCreate(db)
    }
  }

  @Synchronized
  fun put(context: Context, key: String, version: Int, value: String) {
    require(key.length in 1..160) { "记录键长度无效" }
    val helper = Helper(context.applicationContext)
    try {
      helper.writableDatabase.insertWithOnConflict(
        "records",
        null,
        android.content.ContentValues().apply {
          put("record_key", key)
          put("version", version.coerceAtLeast(1))
          put("value", value)
          put("updated_at", System.currentTimeMillis())
        },
        SQLiteDatabase.CONFLICT_REPLACE,
      ).takeIf { it != -1L } ?: error("SQLite 写入未提交")
    } finally {
      helper.close()
    }
  }

  @Synchronized
  fun get(context: Context, key: String): String? {
    val helper = Helper(context.applicationContext)
    try {
      helper.readableDatabase.query(
        "records",
        arrayOf("value"),
        "record_key = ?",
        arrayOf(key),
        null,
        null,
        null,
        "1",
      ).use { cursor ->
        return if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } finally {
      helper.close()
    }
  }

  @Synchronized
  fun delete(context: Context, key: String) {
    val helper = Helper(context.applicationContext)
    try {
      helper.writableDatabase.delete("records", "record_key = ?", arrayOf(key))
    } finally {
      helper.close()
    }
  }
}
