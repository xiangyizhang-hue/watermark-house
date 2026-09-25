package com.framelab.app

import android.app.Activity
import android.app.Instrumentation
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.media.ExifInterface
import android.os.Bundle
import java.io.File
import kotlin.math.abs

/** Debug APK only. Runs real framework decoder tests without a WebView or test downloads. */
class FrameLabRenderChecks : Instrumentation() {
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

  override fun onStart() {
    val result = Bundle()
    try {
      regionChecks()
      FrameLabBackupChecks.run(targetContext)
      result.putString("stream", "PASS: backup append roundtrip, original bytes, history/cursor, logo remap, orphan exclusion, traversal/truncation rejection, cancel; EXIF orientations 1..8, tiled-vs-whole pixels, region budget, outside crop, private path, decoder close\n")
      finish(Activity.RESULT_OK, result)
    } catch (error: Throwable) {
      result.putString("stream", "FAIL: ${error.stackTraceToString()}\n")
      finish(Activity.RESULT_CANCELED, result)
    }
  }

  private fun regionChecks() {
    val fixture = File.createTempFile("region-check-", ".jpg", targetContext.cacheDir)
    val original = Bitmap.createBitmap(64, 48, Bitmap.Config.ARGB_8888)
    val painter = Canvas(original)
    val paint = Paint()
    val colors = intArrayOf(Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW)
    for (i in colors.indices) {
      paint.color = colors[i]
      val x = (i % 2) * 32f; val y = (i / 2) * 24f
      painter.drawRect(x, y, x + 32, y + 24, paint)
    }
    try {
      fixture.outputStream().use { check(original.compress(Bitmap.CompressFormat.JPEG, 100, it)) }
      val expectedTopLeft = intArrayOf(Color.RED, Color.GREEN, Color.YELLOW, Color.BLUE, Color.RED, Color.BLUE, Color.YELLOW, Color.GREEN)
      for (orientation in 1..8) {
        ExifInterface(fixture.path).apply { setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString()); saveAttributes() }
        FrameLabRegionSource.open(fixture, targetContext.cacheDir).use { source ->
          check(source.width == if (orientation in 5..8) 48 else 64)
          check(source.height == if (orientation in 5..8) 64 else 48)
          val full = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
          val stitched = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
          try {
            val whole = RectF(0f, 0f, source.width.toFloat(), source.height.toFloat())
            source.decode(whole)!!.use { region -> Canvas(full).drawBitmap(region.bitmap, region.bitmapToOriented, null) }
            assertNear(full.getPixel(source.width / 4, source.height / 4), expectedTopLeft[orientation - 1], "orientation $orientation")
            val canvas = Canvas(stitched)
            for (y in 0 until source.height step 11) for (x in 0 until source.width step 13) {
              val bounds = RectF(x.toFloat(), y.toFloat(), minOf(x + 13, source.width).toFloat(), minOf(y + 11, source.height).toFloat())
              source.decode(bounds, 13 * 11L)!!.use { region ->
                check(region.bitmap.width * region.bitmap.height <= 13 * 11)
                canvas.save(); canvas.clipRect(bounds)
                canvas.drawBitmap(region.bitmap, region.bitmapToOriented, null)
                canvas.restore()
              }
            }
            for (y in 0 until source.height) for (x in 0 until source.width) {
              assertNear(stitched.getPixel(x, y), full.getPixel(x, y), "tile seam $orientation at $x,$y")
            }
            check(source.decode(RectF(-20f, -20f, -10f, -10f)) == null)
            check(runCatching { source.decode(whole, 10) }.isFailure)
          } finally { full.recycle(); stitched.recycle() }
        }
      }
      check(runCatching { FrameLabRegionSource.open(fixture, targetContext.filesDir) }.isFailure)
      val closed = FrameLabRegionSource.open(fixture, targetContext.cacheDir)
      closed.close(); closed.close()
      check(runCatching { closed.decode(RectF(0f, 0f, 1f, 1f)) }.isFailure)
    } finally { original.recycle(); fixture.delete() }
  }

  private fun assertNear(actual: Int, expected: Int, label: String) {
    check(abs(Color.red(actual) - Color.red(expected)) <= 4 &&
      abs(Color.green(actual) - Color.green(expected)) <= 4 &&
      abs(Color.blue(actual) - Color.blue(expected)) <= 4 &&
      Color.alpha(actual) == Color.alpha(expected)) { "$label: expected $expected, got $actual" }
  }
}
