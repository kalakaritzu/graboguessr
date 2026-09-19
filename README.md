# GråboGuessr

A GeoGuessr-style game for Gråbo, Sweden. Free, static, no API keys.

## How to add spots (automatic)

1. Take photos around Gråbo with your phone's location services turned on
   (GPS gets embedded automatically in the photo's EXIF data).
2. Drop the photos into `photos/`.
3. Run:

```
pip install Pillow --break-system-packages
python3 build_spots.py
```

This reads each photo's embedded GPS coordinates and rewrites `spots.js`
automatically — no manual coordinate entry. Re-run it any time you add
more photos. Photos without GPS data get skipped and listed so you can
add their coordinates manually if needed.

Add as many as you like — each game picks 5 at random.

### Manual alternative

You can still add entries to `spots.js` by hand if you'd rather:

```js
const SPOTS = [
  { photo: "photos/spot1.jpg", lat: 57.8275, lng: 12.2915 },
  { photo: "photos/spot2.jpg", lat: 57.8290, lng: 12.2870 },
];
```

## Run locally

Just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## Deploy to GitHub Pages (free)

1. Create a new GitHub repo, push this folder.
2. Repo Settings → Pages → Deploy from branch → `main` / root.
3. Your game is live at `https://<username>.github.io/<repo>/`.
