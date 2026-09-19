// Multiplayer: host creates a room (short code), a friend joins with that
// code, both see the same 5 spots in the same order, and a round only
// reveals once both players have submitted a guess. Simpler than real
// GeoGuessr Duels on purpose (no HP/damage system) - see PROJECT_BRIEF.txt.
//
// Uses its own map/photo elements (mp- prefixed) rather than sharing
// singleplayer's, so the two flows' event listeners never collide.

let mpRoomCode = null;
let mpRoomRef = null;
let mpUnsubRoom = null;
let mpUnsubGuesses = null;
let mpMap = null;
let mpGuessMarker = null;
let mpGuessLatLng = null;
let mpOverlays = [];
let mpIsHost = false;
let mpCurrentRound = -1;
let mpLatestRoomData = null; // kept in sync by the room's onSnapshot listener
let mpGuessSubmitted = false; // reset each round - distinguishes "not guessed yet" from "already guessed" while the button is disabled for both reasons
let mpTimerInterval = null;

const DEFAULT_MP_SETTINGS = { timerSeconds: 60, roundCount: 5, difficulty: 'easy' };

// game.js defines setupPhotoZoom() and calls it once for singleplayer's
// #photo - reuse it here so multiplayer's photo gets the same scroll-zoom
// and click-drag pan instead of being stuck static.
const resetMpPhotoZoom = setupPhotoZoom('mp-photo', '#mp-game .photo-panel');

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function showScreen(id) {
  ['start-modal', 'multiplayer-modal', 'lobby-modal', 'game', 'mp-game', 'mp-result-modal', 'mp-final-modal']
    .forEach((s) => document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

document.getElementById('multiplayer-btn').addEventListener('click', () => {
  document.getElementById('mp-join-code').value = '';
  showScreen('multiplayer-modal');
});
document.getElementById('mp-back-btn').addEventListener('click', () => showScreen('start-modal'));

document.getElementById('mp-create-btn').addEventListener('click', createRoom);
document.getElementById('mp-join-btn').addEventListener('click', joinRoom);

function showMpLoading(text) {
  document.getElementById('mp-loading-text').textContent = text;
  document.getElementById('mp-loading').classList.remove('hidden');
}
function hideMpLoading() {
  document.getElementById('mp-loading').classList.add('hidden');
}

async function createRoom() {
  if (!currentUser) return;
  showMpLoading('Skapar rum…');
  try {
    let code, ref, snap;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = randomRoomCode();
      ref = db.collection('rooms').doc(code);
      snap = await ref.get();
      if (!snap.exists) break;
    }

    await ref.set({
      hostUid: currentUser.uid,
      status: 'lobby',
      round: 0,
      spotOrder: [], // decided when the host starts the game, using the settings picked in the lobby
      settings: { ...DEFAULT_MP_SETTINGS },
      players: { [currentUser.uid]: { name: currentUser.name, totalPoints: 0 } },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    mpIsHost = true;
    enterRoom(code);
  } finally {
    hideMpLoading();
  }
}

async function joinRoom() {
  if (!currentUser) return;
  const code = document.getElementById('mp-join-code').value.trim().toUpperCase();
  if (!code) return;

  showMpLoading('Går med i rummet…');
  try {
    const ref = db.collection('rooms').doc(code);
    const snap = await ref.get();
    if (!snap.exists) { alert('Hittade inget rum med den koden.'); return; }
    const data = snap.data();
    if (data.status !== 'lobby') { alert('Rundan har redan startat.'); return; }

    await ref.update({
      [`players.${currentUser.uid}`]: { name: currentUser.name, totalPoints: 0 }
    });
    mpIsHost = data.hostUid === currentUser.uid;
    enterRoom(code);
  } finally {
    hideMpLoading();
  }
}

function enterRoom(code) {
  mpRoomCode = code;
  mpRoomRef = db.collection('rooms').doc(code);
  mpCurrentRound = -1;
  document.getElementById('lobby-code').textContent = code;
  showScreen('lobby-modal');
  mpUnsubRoom = mpRoomRef.onSnapshot(handleRoomUpdate);
}

function handleRoomUpdate(snap) {
  if (!snap.exists) return;
  const data = snap.data();
  mpLatestRoomData = data;

  if (data.status === 'lobby') {
    renderLobbyPlayers(data.players);
    renderLobbySettings(data.settings || DEFAULT_MP_SETTINGS);
    const startBtn = document.getElementById('lobby-start-btn');
    startBtn.classList.toggle('hidden', !mpIsHost);
    startBtn.disabled = Object.keys(data.players).length < 2;
  } else if (data.status === 'playing') {
    startMpRound(data);
  } else if (data.status === 'done') {
    showMpFinal(data);
  }
}

function renderLobbyPlayers(players) {
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  Object.values(players).forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.name;
    list.appendChild(li);
  });
}

// Only the host can change these - everyone else just sees them update live
// (synced through the room doc) so they know what they're about to play.
function renderLobbySettings(settings) {
  const timerSel = document.getElementById('setting-timer');
  const roundsSel = document.getElementById('setting-rounds');
  const diffSel = document.getElementById('setting-difficulty');
  timerSel.value = String(settings.timerSeconds);
  roundsSel.value = String(settings.roundCount);
  diffSel.value = settings.difficulty;
  [timerSel, roundsSel, diffSel].forEach((el) => { el.disabled = !mpIsHost; });
}

function updateMpSetting(key, value) {
  if (!mpIsHost || !mpRoomRef) return;
  mpRoomRef.update({ [`settings.${key}`]: value });
}
document.getElementById('setting-timer').addEventListener('change', (e) => {
  updateMpSetting('timerSeconds', Number(e.target.value));
});
document.getElementById('setting-rounds').addEventListener('change', (e) => {
  updateMpSetting('roundCount', Number(e.target.value));
});
document.getElementById('setting-difficulty').addEventListener('change', (e) => {
  updateMpSetting('difficulty', e.target.value);
});

document.getElementById('lobby-start-btn').addEventListener('click', async () => {
  const settings = mpLatestRoomData.settings || DEFAULT_MP_SETTINGS;
  const roundCount = Math.min(settings.roundCount, SPOTS.length);
  const order = shuffle([...Array(SPOTS.length).keys()]).slice(0, roundCount);
  showMpLoading('Startar spelet…');
  try {
    await mpRoomRef.update({ status: 'playing', round: 0, spotOrder: order });
  } finally {
    hideMpLoading();
  }
});
document.getElementById('lobby-leave-btn').addEventListener('click', () => {
  leaveRoomCleanup();
  showScreen('start-modal');
});

function startMpRound(data) {
  // The room doc's onSnapshot fires on *any* field change - including a
  // totalPoints increment when either player submits a guess - not just
  // round advances. Only switch screens when actually entering a new round,
  // otherwise this would yank the view back from the reveal modal (or just
  // repaint the map/photo pointlessly) on every unrelated room update.
  if (data.round !== mpCurrentRound) {
    mpCurrentRound = data.round;
    showScreen('mp-game');
    loadMpRound(data);
  }
}

function ensureMpMap() {
  if (mpMap) {
    // The container was hidden (display:none) until showScreen() just ran,
    // so Leaflet may have measured 0x0 if it was ever touched while hidden -
    // force it to re-measure now that it's actually visible.
    setTimeout(() => mpMap.invalidateSize(), 0);
    return;
  }
  mpMap = L.map('mp-map').setView(GRABO_CENTER, 14);
  mpMap.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mpMap);
  mpMap.on('click', (e) => {
    if (mpGuessLatLng) return; // already guessed this round
    mpGuessLatLng = e.latlng;
    mpGuessMarker = L.marker(mpGuessLatLng).addTo(mpMap);
    document.getElementById('mp-guess-btn').disabled = false;
  });
  setTimeout(() => mpMap.invalidateSize(), 0);

  // Unlike singleplayer's #map-panel (an id, hooked up once in game.js), this
  // panel is only a class - game.js's hover-grow listener can't see it, so
  // without this Leaflet never redraws when the panel widens on hover and
  // the newly revealed area stays blank/offset.
  document.querySelector('#mp-game .map-panel').addEventListener('transitionend', (e) => {
    if (e.propertyName === 'width') mpMap.invalidateSize();
  });
}

function clearMpOverlays() {
  mpOverlays.forEach((layer) => mpMap.removeLayer(layer));
  mpOverlays = [];
}

function loadMpRound(data) {
  mpGuessLatLng = null;
  mpGuessSubmitted = false;
  ensureMpMap();
  if (mpGuessMarker) { mpMap.removeLayer(mpGuessMarker); mpGuessMarker = null; }
  clearMpOverlays();
  mpMap.setView(GRABO_CENTER, 14);
  document.getElementById('mp-guess-btn').disabled = true;

  resetMpPhotoZoom();
  const settings = data.settings || DEFAULT_MP_SETTINGS;
  const spot = SPOTS[data.spotOrder[data.round]];

  // Cover the photo/map with a black screen until the new photo has actually
  // finished loading, instead of showing a stale or half-loaded image while
  // it fetches.
  const photoEl = document.getElementById('mp-photo');
  const roundLoading = document.getElementById('mp-round-loading');
  roundLoading.classList.remove('mp-fade-hidden');
  photoEl.onload = () => roundLoading.classList.add('mp-fade-hidden');
  photoEl.onerror = () => roundLoading.classList.add('mp-fade-hidden');
  photoEl.classList.remove('mp-difficulty-medium', 'mp-difficulty-hard');
  if (settings.difficulty === 'medium') photoEl.classList.add('mp-difficulty-medium');
  if (settings.difficulty === 'hard') photoEl.classList.add('mp-difficulty-hard');
  photoEl.src = spot.photo;

  document.getElementById('mp-round-info').textContent = `Runda ${data.round + 1} / ${data.spotOrder.length}`;
  startMpTimer(settings.timerSeconds);

  if (mpUnsubGuesses) mpUnsubGuesses();
  mpUnsubGuesses = mpRoomRef.collection('rounds').doc(String(data.round)).collection('guesses')
    .onSnapshot((gsnap) => checkRoundComplete(data, gsnap));
}

function stopMpTimer() {
  if (mpTimerInterval) { clearInterval(mpTimerInterval); mpTimerInterval = null; }
  document.getElementById('mp-timer-info').classList.add('hidden');
}

function startMpTimer(seconds) {
  stopMpTimer();
  if (!seconds) return; // 0 = "Ingen gräns" (no limit)
  let remaining = seconds;
  const timerEl = document.getElementById('mp-timer-info');
  timerEl.classList.remove('hidden');
  timerEl.textContent = `${remaining}s`;
  mpTimerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      stopMpTimer();
      // Didn't guess in time - submit at the town center so the round can
      // still complete instead of leaving the other player stuck waiting.
      if (!mpGuessSubmitted) {
        if (!mpGuessLatLng) mpGuessLatLng = { lat: GRABO_CENTER[0], lng: GRABO_CENTER[1] };
        submitMpGuess();
      }
      return;
    }
    timerEl.textContent = `${remaining}s`;
  }, 1000);
}

document.getElementById('mp-guess-btn').addEventListener('click', submitMpGuess);

async function submitMpGuess() {
  document.getElementById('mp-guess-btn').disabled = true;
  mpGuessSubmitted = true;
  stopMpTimer();
  const data = mpLatestRoomData;
  const spot = SPOTS[data.spotOrder[data.round]];
  const dist = haversine(mpGuessLatLng.lat, mpGuessLatLng.lng, spot.lat, spot.lng);
  const points = Math.max(0, Math.round(MAX_POINTS * (1 - dist / MAX_DISTANCE_KM)));

  await mpRoomRef.collection('rounds').doc(String(data.round)).collection('guesses').doc(currentUser.uid).set({
    lat: mpGuessLatLng.lat,
    lng: mpGuessLatLng.lng,
    distance: dist,
    points,
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await mpRoomRef.update({
    [`players.${currentUser.uid}.totalPoints`]: firebase.firestore.FieldValue.increment(points)
  });
  addPoints(points); // Gråbopoäng count from multiplayer too, per brief.
}

function checkRoundComplete(data, guessesSnap) {
  const playerCount = Object.keys(data.players).length;
  if (guessesSnap.size < playerCount) return;

  const spot = SPOTS[data.spotOrder[data.round]];
  const bounds = [[spot.lat, spot.lng]];

  const actualMarker = L.marker([spot.lat, spot.lng], {
    icon: L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41]
    })
  }).addTo(mpMap);
  mpOverlays.push(actualMarker);

  const resultLines = [];
  guessesSnap.forEach((doc) => {
    const g = doc.data();
    bounds.push([g.lat, g.lng]);
    const isMe = doc.id === currentUser.uid;
    const color = isMe ? '#1f6f54' : '#c0392b';
    const marker = L.circleMarker([g.lat, g.lng], { color, radius: 8, fillOpacity: 0.9 }).addTo(mpMap);
    const line = L.polyline([[g.lat, g.lng], [spot.lat, spot.lng]], { color, dashArray: '4 6' }).addTo(mpMap);
    mpOverlays.push(marker, line);
    const name = isMe ? 'Du' : (data.players[doc.id]?.name || '?');
    resultLines.push(`<div><strong>${escapeHtml(name)}:</strong> ${(g.distance * 1000).toFixed(0)} m — ${g.points} poäng</div>`);
  });
  mpMap.fitBounds(bounds, { padding: [40, 40] });

  document.getElementById('mp-result-text').innerHTML = resultLines.join('');
  const isLastRound = data.round + 1 >= data.spotOrder.length;
  const nextBtn = document.getElementById('mp-next-btn');
  nextBtn.classList.toggle('hidden', !mpIsHost);
  nextBtn.textContent = isLastRound ? 'Visa slutresultat' : 'Nästa runda';
  document.getElementById('mp-result-waiting').classList.toggle('hidden', mpIsHost);
  // Don't showScreen() here - that hides every other screen including
  // mp-game, wiping out the map we just drew both players' pins on. The
  // reveal card should float over the still-visible map/photo, exactly
  // like singleplayer's result-modal does over #game.
  document.getElementById('mp-result-modal').classList.remove('hidden');
}

document.getElementById('mp-next-btn').addEventListener('click', async () => {
  const data = mpLatestRoomData;
  const isLastRound = data.round + 1 >= data.spotOrder.length;
  if (isLastRound) {
    await mpRoomRef.update({ status: 'done' });
  } else {
    // Don't switch screens here - the room's onSnapshot listener will call
    // startMpRound() -> loadMpRound() once this write lands, which is what
    // actually clears the map/loads the new photo. Doing it here too just
    // shows a flash of the *previous* round's stale map/photo first.
    await mpRoomRef.update({ round: data.round + 1 });
  }
});

function showMpFinal(data) {
  const sorted = Object.entries(data.players).sort(
    (a, b) => (b[1].totalPoints || 0) - (a[1].totalPoints || 0)
  );
  const list = document.getElementById('mp-final-list');
  list.innerHTML = '';
  sorted.forEach(([uid, p], i) => {
    const li = document.createElement('li');
    li.className = 'mp-final-row' + (uid === currentUser.uid ? ' me' : '');
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="name">${escapeHtml(p.name)}</span><span class="points">${p.totalPoints || 0}</span>`;
    list.appendChild(li);
  });
  showScreen('mp-final-modal');
  leaveRoomCleanup();
}

document.getElementById('mp-final-close').addEventListener('click', () => showScreen('start-modal'));

function leaveRoomCleanup() {
  if (mpUnsubRoom) mpUnsubRoom();
  if (mpUnsubGuesses) mpUnsubGuesses();
  mpUnsubRoom = null;
  mpUnsubGuesses = null;
  mpRoomCode = null;
  mpRoomRef = null;
  mpCurrentRound = -1;
  mpLatestRoomData = null;
  stopMpTimer();
}
