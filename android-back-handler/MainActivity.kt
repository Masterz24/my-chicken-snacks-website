package com.chickengray.snacks

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        // Report the real Android IME visibility to the webpage. This is
        // important because Android may close the keyboard with Back/edge
        // swipe while the focused input stays focused. In that case a JS
        // focus/blur check alone cannot reliably restore the bottom nav.
        fun reportKeyboardVisible(visible: Boolean) {
            webView.post {
                webView.evaluateJavascript(
                    "window.__setNativeKeyboardVisible && window.__setNativeKeyboardVisible(" +
                        visible.toString() + ");",
                    null
                )
            }
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            reportKeyboardVisible(insets.isVisible(WindowInsetsCompat.Type.ime()))
            insets
        }

        // Also observe IME animation progress. Android edge-swipe Back can
        // dismiss the keyboard through an animated WindowInsets transition,
        // and some WebView/Android combinations do not issue a second static
        // insets dispatch at the exact moment the animation reaches zero.
        // Reporting on every animation frame makes the webpage restore its
        // bottom navigation + MENU on the SAME gesture that closes the IME.
        ViewCompat.setWindowInsetsAnimationCallback(
            webView,
            object : androidx.core.view.WindowInsetsAnimationCompat.Callback(
                androidx.core.view.WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE
            ) {
                override fun onProgress(
                    insets: WindowInsetsCompat,
                    runningAnimations: MutableList<androidx.core.view.WindowInsetsAnimationCompat>
                ): WindowInsetsCompat {
                    reportKeyboardVisible(insets.isVisible(WindowInsetsCompat.Type.ime()))
                    return insets
                }

                override fun onEnd(animation: androidx.core.view.WindowInsetsAnimationCompat) {
                    reportKeyboardVisible(
                        ViewCompat.getRootWindowInsets(webView)?.isVisible(WindowInsetsCompat.Type.ime()) == true
                    )
                }
            }
        )
        ViewCompat.requestApplyInsets(webView)

        // Keep Android Back / edge-swipe inside the customer WebView.
        // mobile-app.js creates the deterministic page-level Back targets.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Homepage is the terminal screen of the Android customer app.
                // Android Back button and edge-swipe both arrive here, so close
                // the Activity instead of navigating through WebView history.
                val currentUrl = webView.url.orEmpty()
                val currentPath = try {
                    android.net.Uri.parse(currentUrl).path.orEmpty()
                } catch (_: Exception) {
                    currentUrl
                }
                val isHome = currentPath.isBlank() ||
                    currentPath.endsWith("/index.html", ignoreCase = true) ||
                    currentPath.endsWith("/", ignoreCase = true)

                if (isHome) {
                    finishAndRemoveTask()
                    return
                }

                // My Account must return to the customer homepage even when
                // WebView history has been collapsed by navigation/reload.
                if (currentPath.endsWith("/dashboard.html", ignoreCase = true)) {
                    webView.evaluateJavascript("typeof window.__accountBackToHome === 'function' ? (window.__accountBackToHome(), 'handled') : 'missing'", null) { result ->
                        if (result == "\"missing\"") {
                            val homeUrl = try {
                                android.net.Uri.parse(currentUrl).buildUpon()
                                    .path(currentPath.substringBeforeLast('/') + "/index.html")
                                    .fragment(null)
                                    .build()
                                    .toString()
                            } catch (_: Exception) {
                                currentUrl.substringBeforeLast("/dashboard.html") + "/index.html"
                            }
                            webView.loadUrl(homeUrl)
                        }
                    }
                    return
                }

                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState == null) {
            // Replace this with the same URL your existing Android Studio
            // project currently loads. Do not change your Firebase/site URL.
            webView.loadUrl("https://YOUR-DOMAIN.example/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }
}
