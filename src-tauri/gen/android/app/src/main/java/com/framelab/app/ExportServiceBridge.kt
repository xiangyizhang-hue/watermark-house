package com.framelab.app

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Small, testable bridge around the foreground service intents. */
internal object ExportServiceBridge {
  fun start(context: Context, jobId: String, total: Int, completed: Int, label: String) {
    val intent = intent(context, FrameLabExportService.ACTION_START, jobId)
      .putExtra(FrameLabExportService.EXTRA_TOTAL, total.coerceAtLeast(0))
      .putExtra(FrameLabExportService.EXTRA_COMPLETED, completed.coerceAtLeast(0))
      .putExtra(FrameLabExportService.EXTRA_LABEL, label.take(160))
    ContextCompat.startForegroundService(context, intent)
  }

  fun update(context: Context, jobId: String, total: Int, completed: Int, label: String) {
    val intent = intent(context, FrameLabExportService.ACTION_UPDATE, jobId)
      .putExtra(FrameLabExportService.EXTRA_TOTAL, total.coerceAtLeast(0))
      .putExtra(FrameLabExportService.EXTRA_COMPLETED, completed.coerceAtLeast(0))
      .putExtra(FrameLabExportService.EXTRA_LABEL, label.take(160))
    context.startService(intent)
  }

  fun cancel(context: Context, jobId: String) {
    context.startService(intent(context, FrameLabExportService.ACTION_CANCEL, jobId))
  }

  fun stop(context: Context, jobId: String) {
    context.startService(intent(context, FrameLabExportService.ACTION_STOP, jobId))
  }

  fun isCancelled(context: Context, jobId: String): Boolean =
    context.getSharedPreferences(FrameLabExportService.PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(FrameLabExportService.cancelKey(jobId), false)

  private fun intent(context: Context, action: String, jobId: String): Intent =
    Intent(context, FrameLabExportService::class.java)
      .setAction(action)
      .putExtra(FrameLabExportService.EXTRA_JOB_ID, jobId)
}
