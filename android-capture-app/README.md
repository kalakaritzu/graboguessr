# GråboGuessr Capture

Companion Android app for taking the 50 route photos. Launches your phone's
stock camera app for each shot, then checks the resulting JPEG's EXIF GPS
data:

- **Valid GPS** (non-zero lat/lng) → photo is moved to `Pictures/GraboGuessr/Good/`
- **No GPS / placeholder 0,0 GPS** → photo is moved to `Pictures/GraboGuessr/Retake/`,
  with an on-screen warning so you know immediately to take it again before
  moving on.

A running `Good / Retake` counter and a scrollable log of every shot (with
coordinates for good ones) stay on screen during the whole route.

## Requirements

- Android Studio (any recent version)
- A phone running Android 10 (API 29) or newer, with location services on
- The stock camera app must embed GPS in JPEG EXIF (true for essentially all
  Android camera apps when location is enabled)

## Opening the project

1. Android Studio → **Open** → select this `android-capture-app` folder.
2. Let Gradle sync. This project doesn't ship a `gradlew`/wrapper jar, so
   Android Studio will use its bundled Gradle (matching the version pinned in
   `gradle/wrapper/gradle-wrapper.properties`) to sync, and can regenerate the
   wrapper for you (`Sync Project with Gradle Files` if prompted).
3. Connect your phone via USB with USB debugging on, or use an emulator with
   a mock camera, and hit **Run**.

## Using it

1. Tap **Take Photo**.
2. The stock camera opens — take the photo, confirm/accept it.
3. The app checks EXIF GPS and shows Good/Retake immediately, updates the
   counters and log.
4. Repeat for all 50 spots along `route_from_home.csv` in the parent project.
5. When done, pull `Pictures/GraboGuessr/Good/` off the phone (e.g. via USB
   file transfer or a zip — see the "PHOTO PIPELINE" note in
   `../PROJECT_BRIEF.txt` about chat apps stripping EXIF) into the web
   project's `photos/` folder, then run `build_spots.py` there as usual.

## Notes

- No camera permission is requested — the app only launches the existing
  camera app via an intent and never touches the camera hardware directly.
- Files are written through `MediaStore` (`Pictures/GraboGuessr/...`) so they
  survive the app being uninstalled and show up in the normal Gallery/Files
  app.
