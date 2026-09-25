package com.framelab.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.ColorSpace
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.RectF
import android.media.ExifInterface
import android.os.Build
import java.io.Closeable
import java.io.File
import kotlin.math.ceil
import kotlin.math.floor

/** One decoder per export source. Returned pixels retain encoded orientation; the
 * matrix places them into the EXIF-oriented coordinate system used by WebView.
 * No full-image bitmap or second rotated bitmap is allocated.
 */
internal class FrameLabRegionSource private constructor(
  private val decoder: BitmapRegionDecoder,
  val orientation: Int,
) : Closeable {
  val encodedWidth = decoder.width
  val encodedHeight = decoder.height
  val width = if (orientation in 5..8) encodedHeight else encodedWidth
  val height = if (orientation in 5..8) encodedWidth else encodedHeight
  private val rawToOriented = orientationMatrix(orientation, encodedWidth, encodedHeight)
  private val orientedToRaw = Matrix().also { check(rawToOriented.invert(it)) }
  private var closed = false

  class Region(val bitmap: Bitmap, val bitmapToOriented: Matrix, val encodedBounds: Rect) : Closeable {
    override fun close() { if (!bitmap.isRecycled) bitmap.recycle() }
  }

  /** Full resolution only. The caller splits oversized work regions, never lowers quality. */
  @Synchronized
  fun decode(orientedBounds: RectF, maxPixels: Long = 4_194_304): Region? {
    check(!closed) { "原图解码器已关闭" }
    require(maxPixels in 1..16_777_216) { "无效的区域内存预算" }
    require(listOf(orientedBounds.left, orientedBounds.top, orientedBounds.right, orientedBounds.bottom).all { it.isFinite() })
    require(orientedBounds.width() > 0 && orientedBounds.height() > 0) { "无效的原图区域" }
    val clipped = RectF(orientedBounds)
    if (!clipped.intersect(0f, 0f, width.toFloat(), height.toFloat())) return null
    val encoded = RectF(clipped)
    orientedToRaw.mapRect(encoded)
    val rect = Rect(
      floor(encoded.left.toDouble()).toInt().coerceIn(0, encodedWidth),
      floor(encoded.top.toDouble()).toInt().coerceIn(0, encodedHeight),
      ceil(encoded.right.toDouble()).toInt().coerceIn(0, encodedWidth),
      ceil(encoded.bottom.toDouble()).toInt().coerceIn(0, encodedHeight),
    )
    if (rect.isEmpty) return null
    require(rect.width().toLong() * rect.height() <= maxPixels) { "原图区域超过内存预算，需要继续拆分绘制块" }
    val options = BitmapFactory.Options().apply {
      inSampleSize = 1
      inScaled = false
      inPreferredConfig = Bitmap.Config.ARGB_8888
      if (Build.VERSION.SDK_INT >= 26) inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
    }
    val bitmap = decoder.decodeRegion(rect, options) ?: error("原图区域解码失败")
    if (bitmap.width != rect.width() || bitmap.height != rect.height()) {
      bitmap.recycle()
      error("原图区域尺寸异常，已停止导出以免降低分辨率")
    }
    val placement = Matrix(rawToOriented).apply { preTranslate(rect.left.toFloat(), rect.top.toFloat()) }
    return Region(bitmap, placement, rect)
  }

  @Synchronized
  override fun close() {
    if (!closed) { closed = true; decoder.recycle() }
  }

  companion object {
    @Suppress("DEPRECATION")
    fun open(file: File, allowedRoot: File): FrameLabRegionSource {
      val root = allowedRoot.canonicalFile
      val source = file.canonicalFile
      require(source.path.startsWith(root.path + File.separator) && source.isFile) { "原图不在允许的私有资源目录中" }
      val orientation = runCatching {
        ExifInterface(source.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1)
      }.getOrDefault(1).let { if (it in 1..8) it else 1 }
      val decoder = BitmapRegionDecoder.newInstance(source.path, false) ?: error("此图片无法进行区域解码")
      return try { FrameLabRegionSource(decoder, orientation) } catch (error: Throwable) { decoder.recycle(); throw error }
    }

    /** Transforms pixel edges (not centers), hence translation by W/H, not W-1/H-1. */
    internal fun orientationMatrix(orientation: Int, width: Int, height: Int): Matrix {
      val w = width.toFloat(); val h = height.toFloat()
      val values = when (orientation) {
        2 -> floatArrayOf(-1f, 0f, w, 0f, 1f, 0f, 0f, 0f, 1f)
        3 -> floatArrayOf(-1f, 0f, w, 0f, -1f, h, 0f, 0f, 1f)
        4 -> floatArrayOf(1f, 0f, 0f, 0f, -1f, h, 0f, 0f, 1f)
        5 -> floatArrayOf(0f, 1f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)
        6 -> floatArrayOf(0f, -1f, h, 1f, 0f, 0f, 0f, 0f, 1f)
        7 -> floatArrayOf(0f, -1f, h, -1f, 0f, w, 0f, 0f, 1f)
        8 -> floatArrayOf(0f, 1f, 0f, -1f, 0f, w, 0f, 0f, 1f)
        else -> floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)
      }
      return Matrix().apply { setValues(values) }
    }
  }
}
