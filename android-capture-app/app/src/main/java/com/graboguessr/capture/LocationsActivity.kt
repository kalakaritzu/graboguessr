package com.graboguessr.capture

import android.os.Bundle
import android.view.MenuItem
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.graboguessr.capture.databinding.ActivityLocationsBinding

/** List of all 50 photo spots; tapping one opens it directly in Google Maps. */
class LocationsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLocationsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLocationsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        binding.recyclerView.setHasFixedSize(true)
        binding.recyclerView.layoutManager = LinearLayoutManager(this)
        binding.recyclerView.adapter = SpotsAdapter(this, SPOTS)
    }

    override fun onResume() {
        super.onResume()
        // Reflect any spots confirmed as photographed since this list was last shown.
        binding.recyclerView.adapter?.notifyDataSetChanged()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
