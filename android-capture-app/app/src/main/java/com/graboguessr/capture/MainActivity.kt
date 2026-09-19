package com.graboguessr.capture

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.location.Location
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.provider.MediaStore
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.Toast
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.graboguessr.capture.databinding.ActivityMainBinding

/**
 * In-app camera (CameraX) instead of delegating to the stock camera app.
 *
 * The stock Samsung camera turned out unusable for this: given an output
 * URI (EXTRA_OUTPUT) it saves the photo but silently skips geotagging even
 * with location permission and its own "Location tags" setting on; given
 * no output URI it doesn't persist a photo at all, only a thumbnail. Both
 * confirmed by pulling real captures and inspecting EXIF/the camera roll.
 *
 * GPS comes from Google's Fused Location Provider (blends GPS with
 * Wi-Fi/sensor data for faster, steadier fixes than raw GPS alone - free,
 * no API key/billing, unlike Maps). A rolling window of recent fixes is
 * kept so a single noisy reading can't clobber a better one from a moment
 * earlier; at shutter time the most accurate fix still within that window
 * is written straight into the captured JPEG's EXIF.
 *
 * Good/Retake counters are never trusted as in-memory state alone - they're
 * recomputed from what's actually in Pictures/GraboGuessr/{Good,Retake} on
 * every start, since the Activity (and its fields) can be killed by Android
 * while the app is backgrounded out on the route, but the files themselves
 * are safe the moment each photo is written.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var fusedLocationClient: FusedLocationProviderClient

    private var imageCapture: ImageCapture? = null
    private var camera: Camera? = null
    private var lensFacing = CameraSelector.LENS_FACING_BACK
    private var currentZoomRatio = 1f
    private var immersiveMode = false
    private lateinit var pinchZoomDetector: ScaleGestureDetector
    private lateinit var tapToCaptureDetector: GestureDetector
    private var goodCount = 0
    private var retakeCount = 0

    // A fix older than this is treated the same as no fix at all.
    private val maxLocationAgeMillis = 15_000L

    // A fix coarser than this isn't precise enough to tag a spot for the
    // game - only count real GPS-grade accuracy, not a Wi-Fi/cell estimate.
    private val maxAccuracyMeters = 30f

    // Recent fixes (not just the latest) so a momentarily noisier reading
    // can't hide a better one received a second or two earlier.
    private val recentLocations = ArrayDeque<Location>()
    private val recentLocationsCap = 8

    private val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
        .setMinUpdateIntervalMillis(500L)
        .build()

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            for (location in result.locations) {
                recentLocations.addLast(location)
                while (recentLocations.size > recentLocationsCap) recentLocations.removeFirst()
            }
            updateGpsStatus()
        }
    }

    private fun bestFix(): Location? {
        val now = System.currentTimeMillis()
        return recentLocations
            .filter { now - it.time <= maxLocationAgeMillis }
            .minByOrNull { it.accuracy }
    }

    private val requestPermissions = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val cameraOk = grants[Manifest.permission.CAMERA] == true
        val locationOk = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (cameraOk) startCamera() else toast("Camera permission is required")
        if (locationOk) startLocationUpdates() else toast("Location permission is required to geotag photos")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        binding.captureButton.setOnClickListener { takePhoto() }
        binding.locationsNavButton.setOnClickListener {
            startActivity(Intent(this, LocationsActivity::class.java))
        }
        binding.mapNavButton.setOnClickListener {
            startActivity(Intent(this, MapActivity::class.java))
        }
        binding.photosNavButton.setOnClickListener {
            startActivity(Intent(this, PhotosActivity::class.java))
        }
        binding.zoom05Button.setOnClickListener { setZoomRatio(0.5f) }
        binding.zoom1Button.setOnClickListener { setZoomRatio(1f) }
        binding.zoom2Button.setOnClickListener { setZoomRatio(2f) }
        binding.flipCameraButton.setOnClickListener {
            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
                CameraSelector.LENS_FACING_FRONT
            } else {
                CameraSelector.LENS_FACING_BACK
            }
            startCamera()
        }
        binding.hideUiButton.setOnClickListener { setImmersiveMode(!immersiveMode) }

        pinchZoomDetector = ScaleGestureDetector(
            this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    setZoomRatio(currentZoomRatio * detector.scaleFactor)
                    return true
                }
            }
        )
        tapToCaptureDetector = GestureDetector(
            this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onSingleTapUp(e: MotionEvent): Boolean {
                    if (!immersiveMode) return false
                    // Bring the UI back first so the Good/Retake result is visible,
                    // same as a normal shutter tap - not left hidden after capture.
                    setImmersiveMode(false)
                    takePhoto()
                    return true
                }
            }
        )
        binding.previewView.setOnTouchListener { _, event ->
            pinchZoomDetector.onTouchEvent(event)
            tapToCaptureDetector.onTouchEvent(event)
            true
        }

        refreshCountsFromStorage()
        applyNavigationBarPadding()
        applyTopBarPadding()

        if (hasPermissions()) {
            startCamera()
            startLocationUpdates()
        } else {
            requestPermissions.launch(
                arrayOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION)
            )
        }
    }

    override fun onResume() {
        super.onResume()
        // Photos can be deleted from the Photos screen while this Activity is paused,
        // so don't trust the in-memory counts on the way back - recheck storage.
        refreshCountsFromStorage()
    }

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        statusHideHandler.removeCallbacks(hideStatusRunnable)
    }

    private fun hasPermissions(): Boolean {
        val camera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        return camera && hasLocationPermission()
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun startLocationUpdates() {
        if (!hasLocationPermission()) return
        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                if (location != null) {
                    recentLocations.addLast(location)
                    updateGpsStatus()
                }
            }
        } catch (e: SecurityException) {
            toast("Location permission is required to geotag photos")
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.previewView.surfaceProvider)
            }
            imageCapture = ImageCapture.Builder().build()
            val selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()

            try {
                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(this, selector, preview, imageCapture)
                setupZoomControls()
            } catch (e: Exception) {
                toast("Failed to start camera: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /**
     * 0.5x/2x are only shown when the device actually has a wider zoom range than
     * 1x-ish - CameraX (via Camera2's logical multi-camera support) transparently
     * switches to the ultra-wide/telephoto physical camera as the ratio crosses
     * those thresholds, so this is just picking a ratio, not selecting a lens.
     */
    private fun setupZoomControls() {
        val zoomState = camera?.cameraInfo?.zoomState?.value
        val minRatio = zoomState?.minZoomRatio ?: 1f
        val maxRatio = zoomState?.maxZoomRatio ?: 1f

        binding.zoom05Button.visibility = if (minRatio <= 0.6f) View.VISIBLE else View.GONE
        binding.zoom2Button.visibility = if (maxRatio >= 1.8f) View.VISIBLE else View.GONE

        setZoomRatio(1f)
    }

    private fun setZoomRatio(ratio: Float) {
        val cam = camera ?: return
        val zoomState = cam.cameraInfo.zoomState.value ?: return
        val clamped = ratio.coerceIn(zoomState.minZoomRatio, zoomState.maxZoomRatio)
        cam.cameraControl.setZoomRatio(clamped)
        currentZoomRatio = clamped
        highlightZoomButton(clamped)
    }

    private fun highlightZoomButton(ratio: Float) {
        val activeBg = ColorStateList.valueOf(ContextCompat.getColor(this, R.color.accent))
        val inactiveBg = ColorStateList.valueOf(ContextCompat.getColor(this, R.color.scrim))
        val activeText = ContextCompat.getColor(this, R.color.accent_on)
        val inactiveText = ContextCompat.getColor(this, R.color.on_surface)

        for ((button, ratioMatch) in listOf(
            binding.zoom05Button to isNear(ratio, 0.5f),
            binding.zoom1Button to isNear(ratio, 1f),
            binding.zoom2Button to isNear(ratio, 2f)
        )) {
            button.backgroundTintList = if (ratioMatch) activeBg else inactiveBg
            button.setTextColor(if (ratioMatch) activeText else inactiveText)
        }
    }

    private fun isNear(a: Float, b: Float) = kotlin.math.abs(a - b) < 0.05f

    private fun takePhoto() {
        val capture = imageCapture ?: return

        val fixAtCapture = bestFix()
        val hasFreshFix = fixAtCapture != null && fixAtCapture.accuracy <= maxAccuracyMeters
        val relativeFolder = if (hasFreshFix) "GraboGuessr/Good" else "GraboGuessr/Retake"

        val name = "spot_${System.currentTimeMillis()}.jpg"
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/$relativeFolder")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }

        val outputOptions = ImageCapture.OutputFileOptions.Builder(
            contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
        ).build()

        capture.takePicture(
            outputOptions,
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    val savedUri = output.savedUri
                    if (savedUri != null && hasFreshFix && fixAtCapture != null) {
                        writeGpsExif(savedUri, fixAtCapture)
                    }
                    finalizePending(savedUri, values)
                    onCaptureResult(name, hasFreshFix, fixAtCapture)
                    if (savedUri != null && hasFreshFix && fixAtCapture != null) {
                        promptSpotGuess(savedUri, fixAtCapture)
                    }
                }

                override fun onError(exc: ImageCaptureException) {
                    log("Capture failed: ${exc.message}")
                }
            }
        )
    }

    /**
     * Guesses which of the 50 spots this shot was taken at, from the tagged GPS fix.
     * Several spots sit within a few meters of each other (e.g. Preem Gråbo / Grusvägen,
     * Coop Mjörnbotorget / Konsum - some closer than our GPS accuracy floor), so a single
     * "is it X?" guess isn't reliable there. Instead show the closest few candidates
     * ranked by distance and let the correct one be picked directly.
     */
    private fun promptSpotGuess(photoUri: Uri, location: Location) {
        val ranked = SPOTS
            .map { it to haversineMeters(location.latitude, location.longitude, it.lat, it.lng) }
            .sortedBy { it.second }
        val top = ranked.take(3)
        val options = top.map { (spot, dist) -> "#${spot.stop} ${spot.name} — ${dist.toInt()}m away" } +
            listOf("Pick from full list…", "Skip")

        MaterialAlertDialogBuilder(this)
            .setTitle("Which spot is this?")
            .setItems(options.toTypedArray()) { _, which ->
                when {
                    which < top.size -> confirmSpot(photoUri, top[which].first)
                    which == top.size -> showSpotPicker(photoUri)
                    // else: Skip
                }
            }
            .show()
    }

    private fun showSpotPicker(photoUri: Uri) {
        val names = SPOTS.map { "#${it.stop} ${it.name}" }.toTypedArray()
        MaterialAlertDialogBuilder(this)
            .setTitle("Which spot is this?")
            .setItems(names) { _, which -> confirmSpot(photoUri, SPOTS[which]) }
            .show()
    }

    private fun confirmSpot(photoUri: Uri, spot: Spot) {
        SpotsProgress.markDone(this, spot.stop)
        renameSavedPhoto(photoUri, spot)
        toast("Marked #${spot.stop} ${spot.name} as photographed")
    }

    /** Folds the identified spot into the filename so it's obvious later which photo is which, without re-opening each one. */
    private fun renameSavedPhoto(photoUri: Uri, spot: Spot) {
        val safeName = spot.name.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-')
        val newName = "spot_%02d_%s.jpg".format(spot.stop, safeName)
        val values = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, newName) }
        try {
            contentResolver.update(photoUri, values, null, null)
        } catch (e: Exception) {
            log("Warning: couldn't rename photo (${e.message})")
        }
    }

    private fun writeGpsExif(uri: Uri, location: Location) {
        try {
            contentResolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                val exif = ExifInterface(pfd.fileDescriptor)
                exif.setLatLong(location.latitude, location.longitude)
                exif.saveAttributes()
            }
        } catch (e: Exception) {
            log("Warning: couldn't write EXIF GPS (${e.message})")
        }
    }

    private fun finalizePending(uri: Uri?, values: ContentValues) {
        if (uri == null) return
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        contentResolver.update(uri, values, null, null)
    }

    private fun onCaptureResult(name: String, hasFreshFix: Boolean, location: Location?) {
        if (hasFreshFix && location != null) {
            goodCount++
            setStatus(
                "Good shot — GPS %.5f, %.5f".format(location.latitude, location.longitude),
                good = true
            )
            log("GOOD    $name  (${"%.5f".format(location.latitude)}, ${"%.5f".format(location.longitude)})")
        } else {
            retakeCount++
            val reason = if (location == null) "no fix" else "±${location.accuracy.toInt()}m, too coarse"
            setStatus("No precise GPS fix — RETAKE this one", good = false)
            log("RETAKE  $name  ($reason)")
        }
        updateCounters()
    }

    /** Recomputes Good/Retake counts from the actual files on disk, not remembered state. */
    private fun refreshCountsFromStorage() {
        goodCount = countPhotosIn("GraboGuessr/Good")
        retakeCount = countPhotosIn("GraboGuessr/Retake")
        updateCounters()
    }

    private fun countPhotosIn(relativeFolder: String): Int {
        val projection = arrayOf(MediaStore.Images.Media._ID)
        val selection = "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?"
        val args = arrayOf("Pictures/$relativeFolder/%")
        contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, selection, args, null
        )?.use { cursor -> return cursor.count }
        return 0
    }

    private fun updateGpsStatus() {
        val loc = bestFix()
        binding.gpsStatusText.text = when {
            loc == null -> "GPS: searching..."
            loc.accuracy <= maxAccuracyMeters ->
                "GPS: locked  ±${loc.accuracy.toInt()}m  (${"%.5f".format(loc.latitude)}, ${"%.5f".format(loc.longitude)})"
            else ->
                "GPS: too imprecise (±${loc.accuracy.toInt()}m, need ≤${maxAccuracyMeters.toInt()}m) — move outside for a real fix"
        }
    }

    private val statusHideHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val hideStatusRunnable = Runnable { binding.statusText.visibility = View.GONE }

    private fun setStatus(text: String, good: Boolean) {
        binding.statusText.text = text
        binding.statusText.visibility = View.VISIBLE
        val color = ContextCompat.getColor(
            this,
            if (good) R.color.good_bg else R.color.retake_bg
        )
        binding.statusText.setTextColor(color)

        // Only needed right after a shot to confirm Good/Retake - collapse it
        // back down after a few seconds so the preview has more room the rest
        // of the time.
        statusHideHandler.removeCallbacks(hideStatusRunnable)
        statusHideHandler.postDelayed(hideStatusRunnable, 4000L)
    }

    private fun updateCounters() {
        binding.counterText.text = "Good: $goodCount    Retake: $retakeCount"
    }

    /**
     * The app targets API 35, where Android draws edge-to-edge by default,
     * so the 3-button/gesture navigation bar overlaps the bottom panel
     * unless we account for it ourselves - pad the panel by the system
     * bars' bottom inset on top of its normal padding.
     */
    private fun applyNavigationBarPadding() {
        val panel = binding.bottomPanel
        val basePaddingBottom = panel.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(panel) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(bottom = basePaddingBottom + bars.bottom)
            insets
        }
    }

    /** Same edge-to-edge issue as the bottom panel, but for the top nav row vs. the status bar / camera cutout. */
    private fun applyTopBarPadding() {
        val row = binding.topNavRow
        val basePaddingTop = row.paddingTop
        ViewCompat.setOnApplyWindowInsetsListener(row) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.updatePadding(top = basePaddingTop + bars.top)
            insets
        }
    }

    /**
     * Hides everything but the live preview so framing isn't blocked by our
     * own UI - tapping the preview while hidden takes the photo, then the UI
     * (including the Good/Retake result) comes back automatically.
     */
    private fun setImmersiveMode(enabled: Boolean) {
        immersiveMode = enabled
        binding.locationsNavButton.visibility = if (enabled) View.GONE else View.VISIBLE
        binding.photosNavButton.visibility = if (enabled) View.GONE else View.VISIBLE
        binding.mapNavButton.visibility = if (enabled) View.GONE else View.VISIBLE
        binding.bottomPanel.visibility = if (enabled) View.GONE else View.VISIBLE
        binding.hideUiButton.text = if (enabled) "Show UI" else "Hide UI"
    }

    private fun log(line: String) {
        android.util.Log.d("GraboCapture", line)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
