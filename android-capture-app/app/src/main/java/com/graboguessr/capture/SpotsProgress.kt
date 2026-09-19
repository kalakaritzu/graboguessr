package com.graboguessr.capture

import android.content.Context

/** Which of the 50 spots have been confirmed as photographed, shared across all screens. */
object SpotsProgress {
    private const val PREFS = "spots_progress"
    private const val KEY_DONE = "done_stops"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isDone(context: Context, stop: Int): Boolean =
        prefs(context).getStringSet(KEY_DONE, emptySet())?.contains(stop.toString()) == true

    fun markDone(context: Context, stop: Int) {
        val p = prefs(context)
        val current = p.getStringSet(KEY_DONE, emptySet()) ?: emptySet()
        val updated = current.toMutableSet().apply { add(stop.toString()) }
        p.edit().putStringSet(KEY_DONE, updated).apply()
    }

    fun markNotDone(context: Context, stop: Int) {
        val p = prefs(context)
        val current = p.getStringSet(KEY_DONE, emptySet()) ?: emptySet()
        val updated = current.toMutableSet().apply { remove(stop.toString()) }
        p.edit().putStringSet(KEY_DONE, updated).apply()
    }

    fun setDone(context: Context, stop: Int, done: Boolean) {
        if (done) markDone(context, stop) else markNotDone(context, stop)
    }

    fun doneCount(context: Context): Int =
        prefs(context).getStringSet(KEY_DONE, emptySet())?.size ?: 0
}
