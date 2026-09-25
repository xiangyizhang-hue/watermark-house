package com.framelab.app

import android.os.Bundle
import android.graphics.Color
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    val surface = Color.rgb(23, 23, 23)
    enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(surface), navigationBarStyle = SystemBarStyle.dark(surface))
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(surface)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(safe.left, safe.top, safe.right, maxOf(safe.bottom, keyboard.bottom))
      // Native root owns safe-area padding, so WebView must not apply it a second time.
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (ViewCompat.getRootWindowInsets(window.decorView)?.isVisible(WindowInsetsCompat.Type.ime()) == true) {
          WindowInsetsControllerCompat(window, webView).hide(WindowInsetsCompat.Type.ime())
          return
        }
        webView.evaluateJavascript("Boolean(window.__FRAMELAB_HANDLE_BACK__ && window.__FRAMELAB_HANDLE_BACK__())") { handled ->
          if (handled != "true") moveTaskToBack(true)
        }
      }
    })
  }
}
