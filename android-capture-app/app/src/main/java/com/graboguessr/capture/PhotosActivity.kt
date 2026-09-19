package com.graboguessr.capture

import android.content.ContentUris
import android.content.Intent
import android.os.Bundle
import android.provider.MediaStore
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import com.graboguessr.capture.databinding.ActivityPhotosBinding

/** Every captured photo (Good and Retake), with a delete button on each. */
class PhotosActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPhotosBinding
    private lateinit var adapter: PhotosAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPhotosBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        adapter = PhotosAdapter(
            this,
            onDelete = { photo -> confirmDelete(photo) },
            onOpen = { photo -> openViewer(photo) }
        )
        binding.recyclerView.setHasFixedSize(true)
        binding.recyclerView.layoutManager = GridLayoutManager(this, 3)
        binding.recyclerView.adapter = adapter
        loadPhotos()
    }

    override fun onResume() {
        super.onResume()
        loadPhotos()
    }

    private fun loadPhotos() {
        val items = mutableListOf<PhotoItem>()
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.RELATIVE_PATH
        )
        val selection = "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?"
        val args = arrayOf("Pictures/GraboGuessr/%")
        val sort = "${MediaStore.Images.Media.DATE_ADDED} DESC"

        contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, selection, args, sort
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val pathCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.RELATIVE_PATH)
            while (cursor.moveToNext()) {
                val id = cursor.getLong(idCol)
                val name = cursor.getString(nameCol)
                val path = cursor.getString(pathCol) ?: ""
                val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                items.add(PhotoItem(uri, name, path.contains("/Good")))
            }
        }

        adapter.submitList(items)
        binding.emptyText.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        binding.countText.text = "${items.size} photo${if (items.size == 1) "" else "s"}"
    }

    private fun openViewer(photo: PhotoItem) {
        val intent = Intent(this, PhotoViewerActivity::class.java).apply {
            putExtra(PhotoViewerActivity.EXTRA_URI, photo.uri.toString())
            putExtra(PhotoViewerActivity.EXTRA_NAME, photo.displayName)
        }
        startActivity(intent)
    }

    private fun confirmDelete(photo: PhotoItem) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete this photo?")
            .setMessage(photo.displayName)
            .setPositiveButton("Delete") { _, _ ->
                try {
                    contentResolver.delete(photo.uri, null, null)
                } catch (e: Exception) {
                    Toast.makeText(this, "Couldn't delete: ${e.message}", Toast.LENGTH_SHORT).show()
                }
                loadPhotos()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
