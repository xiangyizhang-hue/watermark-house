package com.framelab.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Keeps the export contract alive while the user locks the phone or switches apps.
 *
 * Rendering is still performed by the shared WebView/Rust pipeline in this release;
 * this service owns the Android foreground lifetime, progress notification and cancel
 * signal. The queue remains in the web layer so a process restart can resume it.
 */
class FrameLabExportService : Service() {
  companion object {
    const val ACTION_START = "com.framelab.app.action.EXPORT_START"
    const val ACTION_UPDATE = "com.framelab.app.action.EXPORT_UPDATE"
    const val ACTION_CANCEL = "com.framelab.app.action.EXPORT_CANCEL"
    const val ACTION_STOP = "com.framelab.app.action.EXPORT_STOP"
    const val EXTRA_JOB_ID = "jobId"
    const val EXTRA_TOTAL = "total"
    const val EXTRA_COMPLETED = "completed"
    const val EXTRA_LABEL = "label"
    const val PREFS_NAME = "framelab-export-service"
    private const val CHANNEL_ID = "framelab-export"
    private const val CHANNEL_NAME = "水印小屋 导出"
    private const val NOTIFICATION_ID = 19031

    fun cancelKey(jobId: String): String = "cancelled:$jobId"
    private fun activeKey(jobId: String): String = "active:$jobId"
    private fun totalKey(jobId: String): String = "total:$jobId"
    private fun completedKey(jobId: String): String = "completed:$jobId"
    private fun labelKey(jobId: String): String = "label:$jobId"
    private const val LAST_JOB_ID = "last-job-id"
  }

  private lateinit var manager: NotificationManager
  private lateinit var prefs: android.content.SharedPreferences
  private var currentJobId: String? = null
  private var total: Int = 0
  private var completed: Int = 0
  private var label: String = "准备导出"

  override fun onCreate() {
    super.onCreate()
    manager = getSystemService(NotificationManager::class.java)
    prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
          description = "显示 水印小屋 批量导出进度"
          setShowBadge(false)
        },
      )
    }
    // START_STICKY may recreate the service with a null intent. Restore the
    // notification immediately so a killed WebView still has a visible native
    // task while the persisted queue waits for the next app launch.
    prefs.getString(LAST_JOB_ID, null)?.let { id ->
      if (prefs.getBoolean(activeKey(id), false)) {
        currentJobId = id
        total = prefs.getInt(totalKey(id), 0)
        completed = prefs.getInt(completedKey(id), 0)
        label = prefs.getString(labelKey(id), "等待 水印小屋 恢复") ?: "等待 水印小屋 恢复"
        startInForeground()
        publish()
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val jobId = intent?.getStringExtra(EXTRA_JOB_ID)?.takeIf { it.isNotBlank() }
    if (jobId != null) currentJobId = jobId
    when (intent?.action) {
      ACTION_START -> {
        val id = currentJobId ?: return START_NOT_STICKY
        total = intent.getIntExtra(EXTRA_TOTAL, 0).coerceAtLeast(0)
        completed = intent.getIntExtra(EXTRA_COMPLETED, 0).coerceIn(0, total.coerceAtLeast(1))
        label = intent.getStringExtra(EXTRA_LABEL)?.take(160).orEmpty().ifBlank { "准备导出" }
        prefs.edit()
          .putString(LAST_JOB_ID, id)
          .putBoolean(activeKey(id), true)
          .putBoolean(cancelKey(id), false)
          .putInt(totalKey(id), total)
          .putInt(completedKey(id), completed)
          .putString(labelKey(id), label)
          .apply()
        startInForeground()
        publish()
      }
      ACTION_UPDATE -> {
        val id = currentJobId
        if (id != null && prefs.getBoolean(activeKey(id), false)) {
          total = intent.getIntExtra(EXTRA_TOTAL, total).coerceAtLeast(0)
          completed = intent.getIntExtra(EXTRA_COMPLETED, completed).coerceIn(0, total.coerceAtLeast(1))
          label = intent.getStringExtra(EXTRA_LABEL)?.take(160).orEmpty().ifBlank { label }
          prefs.edit().putInt(totalKey(id), total).putInt(completedKey(id), completed).putString(labelKey(id), label).apply()
          publish()
        }
      }
      ACTION_CANCEL -> {
        val id = currentJobId
        if (id != null) {
          prefs.edit().putBoolean(cancelKey(id), true).apply()
          label = "正在取消…"
          publish()
        }
      }
      ACTION_STOP -> {
        val id = currentJobId
        if (id != null) prefs.edit().putBoolean(activeKey(id), false).apply()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
      }
    }
    return START_STICKY
  }

  private fun startInForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= 35) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING,
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val id = currentJobId.orEmpty()
    val cancelIntent = Intent(this, FrameLabExportService::class.java)
      .setAction(ACTION_CANCEL)
      .putExtra(EXTRA_JOB_ID, id)
    val cancelPending = PendingIntent.getService(
      this,
      id.hashCode(),
      cancelIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("水印小屋 批量导出")
      .setContentText(label)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "取消", cancelPending)
    if (total > 0) builder.setProgress(total, completed.coerceIn(0, total), false)
    else builder.setProgress(0, 0, true)
    return builder.build()
  }

  private fun publish() {
    if (!::manager.isInitialized) return
    // Android 13+ can run the foreground service while notification permission is
    // denied. Keep the export alive in that case; the persisted web queue remains
    // the source of truth and the user can enable notifications later in Settings.
    runCatching {
      NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification())
    }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // START_STICKY plus the persisted queue lets the next app launch resume the job;
    // do not clear the cancellation flag here because a notification cancel may race.
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    val id = currentJobId
    if (id != null && prefs.getBoolean(activeKey(id), false)) {
      // Keep active state and progress for a sticky restart or the next app launch.
      prefs.edit().putInt(totalKey(id), total).putInt(completedKey(id), completed).putString(labelKey(id), label).apply()
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
