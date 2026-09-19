package com.graboguessr.capture

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

fun openInGoogleMaps(context: Context, spot: Spot) {
    // No name in the query: a labeled geo: URI (?q=lat,lng(Name)) can make Maps geocode
    // the name text and snap to a same-named POI elsewhere instead of these exact
    // coordinates. Pure coordinates always drop the pin exactly where we mean.
    val uri = Uri.parse("geo:${spot.lat},${spot.lng}?q=${spot.lat},${spot.lng}")
    val mapIntent = Intent(Intent.ACTION_VIEW, uri).apply { setPackage("com.google.android.apps.maps") }
    if (mapIntent.resolveActivity(context.packageManager) != null) {
        context.startActivity(mapIntent)
    } else {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }
}

class SpotsAdapter(private val context: Context, private val spots: List<Spot>) :
    RecyclerView.Adapter<SpotsAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val checkbox: CheckBox = view.findViewById(R.id.doneCheckbox)
        val number: TextView = view.findViewById(R.id.stopNumber)
        val name: TextView = view.findViewById(R.id.spotName)
        val coords: TextView = view.findViewById(R.id.spotCoords)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_spot, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val spot = spots[position]
        holder.number.text = "#${spot.stop}"
        holder.name.text = spot.name
        holder.coords.text = "%.5f, %.5f".format(spot.lat, spot.lng)

        // Avoid firing the listener while we're just setting the initial state from data.
        holder.checkbox.setOnCheckedChangeListener(null)
        holder.checkbox.isChecked = SpotsProgress.isDone(context, spot.stop)
        holder.checkbox.setOnCheckedChangeListener { _, checked ->
            SpotsProgress.setDone(context, spot.stop, checked)
        }

        holder.itemView.setOnClickListener { openInGoogleMaps(context, spot) }
    }

    override fun getItemCount() = spots.size
}
