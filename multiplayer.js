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

async function createRoom() {
  if (!currentUser) return;
  const order = shuffle([...Array(SPOTS.length).keys()]).slice(0, ROUNDS);

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
    spotOrder: order,
    players: { [currentUser.uid]: { name: currentUser.name, totalPoints: 0 } },
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  mpIsHost = true;
  enterRoom(code);
}

async function joinRoom() {
  if (!currentUser) return;
  const code = document.getElementById('mp-join-code').value.trim().toUpperCase();
  if (!code) return;

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

document.getElementById('lobby-start-btn').addEventListener('click', async () => {
  await mpRoomRef.update({ status: 'playing', round: 0 });
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
  ensureMpMap();
  if (mpGuessMarker) { mpMap.removeLayer(mpGuessMarker); mpGuessMarker = null; }
  clearMpOverlays();
  mpMap.setView(GRABO_CENTER, 14);
  document.getElementById('mp-guess-btn').disabled = true;

  const spot = SPOTS[data.spotOrder[data.round]];
  document.getElementById('mp-photo').src = spot.photo;
  document.getElementById('mp-round-info').textContent = `Runda ${data.round + 1} / ${data.spotOrder.length}`;

  if (mpUnsubGuesses) mpUnsubGuesses();
  mpUnsubGuesses = mpRoomRef.collection('rounds').doc(String(data.round)).collection('guesses')
    .onSnapshot((gsnap) => checkRoundComplete(data, gsnap));
}

document.getElementById('mp-guess-btn').addEventListener('click', submitMpGuess);

async function submitMpGuess() {
  document.getElementById('mp-guess-btn').disabled = true;
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
  showScreen('mp-result-modal');
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
}
