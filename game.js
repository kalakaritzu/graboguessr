const GRABO_CENTER = [57.8272, 12.2916];
let ROUNDS = Math.min(5, SPOTS.length); // overridden by the "Antal rundor" setting each game
const MAX_DISTANCE_KM = 5; // distance at which score hits 0
const MAX_POINTS = 1000;

let round = 0;
let score = 0;
let order = [];
let guessMarker = null;
let actualMarker = null;
let guessLatLng = null;
let roundLocked = false; // true once the guess is submitted - the pin can no longer move
let map, line;
let spDifficulty = 'easy';

// Difficulty filters applied to a round's photo - "medium"/"hard" make it
// harder to read without touching the underlying image or scoring. Shared
// by singleplayer and multiplayer.
function applyDifficultyFilter(imgEl, difficulty) {
  imgEl.classList.remove('difficulty-medium', 'difficulty-hard');
  if (difficulty === 'medium') imgEl.classList.add('difficulty-medium');
  if (difficulty === 'hard') imgEl.classList.add('difficulty-hard');
}

// Shared per-round countdown, used by both singleplayer (#timer-info) and
// multiplayer (#mp-timer-info) - each screen gets its own instance bound to
// its own display element and its own "ran out of time" behavior.
function createRoundTimer(displayEl, onExpire) {
  let interval = null;
  function stop() {
    if (interval) { clearInterval(interval); interval = null; }
    displayEl.classList.add('hidden');
  }
  function start(seconds) {
    stop();
    if (!seconds) return; // 0 = "Ingen gräns" (no limit)
    let remaining = seconds;
    displayEl.classList.remove('hidden');
    displayEl.textContent = `${remaining}s`;
    interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) { stop(); onExpire(); return; }
      displayEl.textContent = `${remaining}s`;
    }, 1000);
  }
  return { start, stop };
}

// A row of pill buttons where exactly one is "active" - replaces native
// <select> for settings so they fit the game's own rounded-pill look
// instead of default browser dropdown chrome. Shared by singleplayer and
// multiplayer's settings rows.
function setupSegmentedControl(groupEl, onChange) {
  const buttons = Array.from(groupEl.querySelectorAll('.seg-btn'));
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled || btn.classList.contains('active')) return;
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
  return {
    getValue() {
      const active = groupEl.querySelector('.seg-btn.active');
      return active ? active.dataset.value : null;
    },
    setValue(value) {
      buttons.forEach((b) => b.classList.toggle('active', b.dataset.value === String(value)));
    },
    setDisabled(disabled) {
      buttons.forEach((b) => { b.disabled = disabled; });
    }
  };
}

function initMap() {
  map = L.map('map').setView(GRABO_CENTER, 14);
  // Keep the required OpenStreetMap credit but drop Leaflet's own "Leaflet" self-promo prefix.
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', (e) => {
    if (roundLocked) return; // guess already submitted this round
    guessLatLng = e.latlng;
    if (guessMarker) map.removeLayer(guessMarker);
    guessMarker = L.marker(guessLatLng).addTo(map);
    document.getElementById('guess-btn').disabled = false;
  });
}

// The map panel grows on hover for a closer look at the guess; Leaflet needs
// a manual nudge to redraw itself correctly once the resize finishes.
const mapPanel = document.getElementById('map-panel');
mapPanel.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'width' && map) map.invalidateSize();
});

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const spTimerControl = setupSegmentedControl(document.getElementById('sp-setting-timer'), () => {});
const spRoundsControl = setupSegmentedControl(document.getElementById('sp-setting-rounds'), () => {});
const spDifficultyControl = setupSegmentedControl(document.getElementById('sp-setting-difficulty'), () => {});

function startGame() {
  ROUNDS = Math.min(Number(spRoundsControl.getValue()), SPOTS.length);
  spDifficulty = spDifficultyControl.getValue();
  spTimerSeconds = Number(spTimerControl.getValue());
  score = 0;
  round = 0;
  order = shuffle([...Array(SPOTS.length).keys()]).slice(0, ROUNDS);
  document.getElementById('start-modal').classList.add('hidden');
  document.getElementById('end-modal').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  if (!map) initMap();
  loadRound();
}

function loadRound() {
  guessLatLng = null;
  roundLocked = false;
  if (guessMarker) { map.removeLayer(guessMarker); guessMarker = null; }
  if (actualMarker) { map.removeLayer(actualMarker); actualMarker = null; }
  if (line) { map.removeLayer(line); line = null; }
  map.setView(GRABO_CENTER, 14);
  document.getElementById('guess-btn').disabled = true;

  const spot = SPOTS[order[round]];
  const photoEl = document.getElementById('photo');
  const roundLoadingEl = document.getElementById('round-loading');
  roundLoadingEl.classList.remove('fade-hidden');
  photoEl.onload = () => roundLoadingEl.classList.add('fade-hidden');
  photoEl.onerror = () => roundLoadingEl.classList.add('fade-hidden');
  applyDifficultyFilter(photoEl, spDifficulty);
  photoEl.src = spot.photo;

  document.getElementById('round-info').textContent = `Runda ${round + 1} / ${ROUNDS}`;
  document.getElementById('score-info').textContent = `Poäng: ${score}`;
  resetPhotoZoom();
  spTimer.start(spTimerSeconds);
}

// Scroll-to-zoom on the photo, centered on the cursor, plus click-and-drag
// panning once zoomed in - lets you lean in on signs, plates, storefronts
// etc. for clues without leaving the round. Shared by singleplayer and
// multiplayer's photo panels (each gets its own independent zoom/pan state),
// since multiplayer.js calls this again for #mp-photo.
function setupPhotoZoom(imgId, panelSelector) {
  const photoEl = document.getElementById(imgId);
  const photoPanel = document.querySelector(panelSelector);
  photoEl.draggable = false;
  photoEl.style.transformOrigin = '50% 50%';

  let photoZoom = 1;
  let panX = 0;
  let panY = 0;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  function applyPhotoTransform() {
    photoEl.style.transform = `translate(${panX}px, ${panY}px) scale(${photoZoom})`;
    photoEl.style.cursor = photoZoom > 1 ? 'grab' : 'zoom-in';
  }

  function clampPan() {
    const rect = photoPanel.getBoundingClientRect();
    const maxX = (photoZoom - 1) * rect.width / 2;
    const maxY = (photoZoom - 1) * rect.height / 2;
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }

  function reset() {
    photoZoom = 1;
    panX = 0;
    panY = 0;
    applyPhotoTransform();
  }

  photoPanel.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = photoPanel.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;

    // Point under the cursor, in unscaled image space, before this zoom step.
    const imgX = (cx - panX) / photoZoom;
    const imgY = (cy - panY) / photoZoom;

    photoZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, photoZoom - e.deltaY * 0.0015 * photoZoom));

    // Re-solve pan so that same image point stays under the cursor.
    panX = cx - imgX * photoZoom;
    panY = cy - imgY * photoZoom;
    clampPan();
    applyPhotoTransform();
  }, { passive: false });

  let dragging = false;
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

  photoPanel.addEventListener('mousedown', (e) => {
    if (photoZoom <= 1) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    photoEl.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
    clampPan();
    applyPhotoTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    photoEl.style.cursor = photoZoom > 1 ? 'grab' : 'zoom-in';
  });

  return reset;
}

const resetPhotoZoom = setupPhotoZoom('photo', '#photo-panel');

let spTimerSeconds = 60;
const spTimer = createRoundTimer(document.getElementById('timer-info'), () => {
  // Ran out of time without guessing - auto-guess at the town center so the
  // round still ends instead of leaving the player stuck.
  if (!roundLocked) {
    guessLatLng = { lat: GRABO_CENTER[0], lng: GRABO_CENTER[1] };
    makeGuess();
  }
});

function makeGuess() {
  roundLocked = true;
  spTimer.stop();
  document.getElementById('guess-btn').disabled = true;
  const spot = SPOTS[order[round]];
  const dist = haversine(guessLatLng.lat, guessLatLng.lng, spot.lat, spot.lng);
  const points = Math.max(0, Math.round(MAX_POINTS * (1 - dist / MAX_DISTANCE_KM)));
  score += points;
  if (typeof addPoints === 'function') addPoints(points); // Gråbopoäng - counts from singleplayer too

  actualMarker = L.marker([spot.lat, spot.lng], {
    icon: L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41]
    })
  }).addTo(map);

  line = L.polyline([guessLatLng, [spot.lat, spot.lng]], { color: 'red' }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [40, 40] });

  document.getElementById('result-title').textContent =
    dist < 0.05 ? 'Helt rätt!' : 'Rundans resultat';
  document.getElementById('result-distance').textContent =
    `Avstånd: ${(dist * 1000).toFixed(0)} m`;
  document.getElementById('result-points').textContent =
    `Poäng: ${points}`;
  document.getElementById('result-modal').classList.remove('hidden');
}

function nextRound() {
  document.getElementById('result-modal').classList.add('hidden');
  round++;
  if (round >= ROUNDS) {
    document.getElementById('final-score').textContent = `Slutresultat: ${score} / ${ROUNDS * MAX_POINTS}`;
    document.getElementById('end-modal').classList.remove('hidden');
    document.getElementById('game').classList.add('hidden');
  } else {
    loadRound();
  }
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('guess-btn').addEventListener('click', makeGuess);
document.getElementById('next-btn').addEventListener('click', nextRound);

document.getElementById('about-btn').addEventListener('click', () => {
  document.getElementById('about-modal').classList.remove('hidden');
});
document.getElementById('about-close').addEventListener('click', () => {
  document.getElementById('about-modal').classList.add('hidden');
});

document.getElementById('quit-btn').addEventListener('click', () => {
  if (!confirm('Avsluta spelet?')) return;
  spTimer.stop();
  document.getElementById('game').classList.add('hidden');
  document.getElementById('result-modal').classList.add('hidden');
  document.getElementById('start-modal').classList.remove('hidden');
});

if (SPOTS.length === 0) {
  document.querySelector('#start-box p').textContent =
    'Inga foton tillagda än. Lägg till poster i spots.js först.';
  document.getElementById('start-btn').disabled = true;
}
