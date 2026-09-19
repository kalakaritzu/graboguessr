package com.graboguessr.capture

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.util.Size
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.util.concurrent.Executors

data class PhotoItem(val uri: Uri, val displayName: String, val isGood: Boolean)

class PhotosAdapter(
    private val context: Context,
    private val onDelete: (PhotoItem) -> Unit,
    private val onOpen: (PhotoItem) -> Unit
) : RecyclerView.Adapter<PhotosAdapter.ViewHolder>() {

    private var items: List<PhotoItem> = emptyList()
    private val executor = Executors.newFixedThreadPool(4)
    private val mainHandler = Handler(Looper.getMainLooper())

    // Scrolling back up would otherwise re-decode every thumbnail from disk each
    // time - keep the last ~40 in memory (a few MB) so re-showing a cell is instant.
    private val thumbnailCache = object : LruCache<Uri, Bitmap>(40) {}

    fun submitList(newItems: List<PhotoItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val thumbnail: ImageView = view.findViewById(R.id.thumbnail)
        val badge: TextView = view.findViewById(R.id.badge)
        val fileName: TextView = view.findViewById(R.id.fileName)
        val deleteButton: View = view.findViewById(R.id.deleteButton)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_photo, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val photo = items[position]
        holder.fileName.text = photo.displayName
        holder.badge.text = if (photo.isGood) "GOOD" else "RETAKE"
        holder.badge.setBackgroundResource(if (photo.isGood) R.drawable.badge_good else R.drawable.badge_retake)
        holder.thumbnail.tag = photo.uri

        val cached = thumbnailCache.get(photo.uri)
        if (cached != null) {
            holder.thumbnail.setImageBitmap(cached)
        } else {
            holder.thumbnail.setImageBitmap(null)
            executor.execute {
                val bitmap: Bitmap? = try {
                    context.contentResolver.loadThumbnail(photo.uri, Size(300, 300), null)
                } catch (e: Exception) {
                    null
                }
                if (bitmap != null) thumbnailCache.put(photo.uri, bitmap)
                mainHandler.post {
                    if (holder.thumbnail.tag == photo.uri) {
                        holder.thumbnail.setImageBitmap(bitmap)
                    }
                }
            }
        }

        holder.deleteButton.setOnClickListener { onDelete(photo) }
        holder.itemView.setOnClickListener { onOpen(photo) }
    }

    override fun getItemCount() = items.size
}
