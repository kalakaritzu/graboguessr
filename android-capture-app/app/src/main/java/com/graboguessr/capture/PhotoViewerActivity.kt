package com.graboguessr.capture

import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.graboguessr.capture.databinding.ActivityPhotoViewerBinding

/** Full-screen view of one photo, opened by tapping it in the Photos grid. */
class PhotoViewerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URI = "photo_uri"
        const val EXTRA_NAME = "photo_name"
    }

    private lateinit var binding: ActivityPhotoViewerBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPhotoViewerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val uriString = intent.getStringExtra(EXTRA_URI)
        val name = intent.getStringExtra(EXTRA_NAME)
        binding.fileNameText.text = name

        binding.closeButton.setOnClickListener { finish() }
        binding.root.setOnClickListener { finish() }

        if (uriString != null) {
            loadFullImage(Uri.parse(uriString))
        }
    }

    private fun loadFullImage(uri: Uri) {
        try {
            val source = ImageDecoder.createSource(contentResolver, uri)
            val bitmap = ImageDecoder.decodeBitmap(source)
            binding.fullImage.setImageBitmap(bitmap)
        } catch (e: Exception) {
            // Leave the placeholder background if it fails to load.
        }
    }
}
