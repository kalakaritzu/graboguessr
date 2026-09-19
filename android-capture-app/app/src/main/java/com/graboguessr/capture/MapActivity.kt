package com.graboguessr.capture

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.MenuItem
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.graboguessr.capture.databinding.ActivityMapBinding
import org.json.JSONArray
import org.json.JSONObject

/** Shows all 50 spots on a live OSM map (via WebView + Leaflet), no route line. */
class MapActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMapBinding

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMapBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        binding.webView.settings.javaScriptEnabled = true
        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                view.evaluateJavascript("window.setSpots(${spotsJson()})", null)
            }

            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("geo:")) {
                    openGeoUri(url)
                    return true
                }
                if (url.startsWith("gg-toggle:")) {
                    toggleSpotDone(view, url.removePrefix("gg-toggle:").toIntOrNull())
                    return true
                }
                return false
            }
        }
        binding.webView.loadUrl("file:///android_asset/map.html")
    }

    override fun onResume() {
        super.onResume()
        // Refresh pending/photographed marker colors in case something changed elsewhere.
        binding.webView.evaluateJavascript("window.setSpots && window.setSpots(${spotsJson()})", null)
    }

    private fun toggleSpotDone(view: WebView, stop: Int?) {
        if (stop == null) return
        val newDone = !SpotsProgress.isDone(this, stop)
        SpotsProgress.setDone(this, stop, newDone)
        view.evaluateJavascript("window.updateSpotDone($stop, $newDone)", null)
    }

    private fun openGeoUri(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage("com.google.android.apps.maps")
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    private fun spotsJson(): String {
        val arr = JSONArray()
        arr.put(JSONObject().apply {
            put("stop", HOME.stop)
            put("name", HOME.name)
            put("lat", HOME.lat)
            put("lng", HOME.lng)
            put("done", false)
        })
        for (s in SPOTS) {
            arr.put(JSONObject().apply {
                put("stop", s.stop)
                put("name", s.name)
                put("lat", s.lat)
                put("lng", s.lng)
                put("done", SpotsProgress.isDone(this@MapActivity, s.stop))
            })
        }
        return arr.toString()
    }
}
