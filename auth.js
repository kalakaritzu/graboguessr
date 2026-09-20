// Anonymous auth + username, persisted automatically by Firebase in the
// browser's storage - so returning visitors are signed back in silently,
// and the username prompt only ever shows once per browser (per brief).

let currentUser = null; // { uid, name, points }

function showUsernameModal() {
  document.getElementById('username-modal').classList.remove('hidden');
}
function hideUsernameModal() {
  document.getElementById('username-modal').classList.add('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Abbreviates big point totals (11165 -> "11.2k") so the header pill and
// leaderboard stay compact once players rack up Gråbopoäng. Shared by
// auth.js (header pill) and leaderboard.js.
function formatPoints(n) {
  n = n || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

async function ensureUserDoc(uid, name) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      name,
      points: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { uid, name, points: 0 };
  }
  const data = snap.data();
  return { uid, name: data.name, points: data.points || 0 };
}

function updatePointsDisplay() {
  const nameEl = document.getElementById('user-pill-name');
  const avatarEl = document.getElementById('user-pill-avatar');
  const pointsEl = document.getElementById('points-display');
  if (!currentUser) return;
  if (nameEl) nameEl.textContent = currentUser.name;
  if (avatarEl) avatarEl.textContent = currentUser.name.trim().charAt(0).toUpperCase() || '?';
  if (pointsEl) {
    pointsEl.textContent = formatPoints(currentUser.points);
    pointsEl.title = `${currentUser.points} Gråbopoäng`; // exact value on hover
  }
}

async function addPoints(amount) {
  if (!currentUser || !amount) return;
  currentUser.points += amount;
  updatePointsDisplay();
  try {
    await db.collection('users').doc(currentUser.uid).update({
      points: firebase.firestore.FieldValue.increment(amount)
    });
  } catch (err) {
    console.warn('Failed to save Gråbopoäng', err);
  }
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showUsernameModal();
    return;
  }
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data();
    currentUser = { uid: user.uid, name: data.name, points: data.points || 0 };
    hideUsernameModal();
    updatePointsDisplay();
  } else {
    // Signed in (e.g. token restored) but no profile yet - ask for a name.
    showUsernameModal();
  }
});

document.getElementById('username-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('username-input');
  const name = input.value.trim().slice(0, 24);
  if (!name) return;

  const submitBtn = document.getElementById('username-submit');
  submitBtn.disabled = true;
  try {
    let cred;
    if (auth.currentUser) {
      cred = { user: auth.currentUser };
    } else {
      cred = await auth.signInAnonymously();
    }
    currentUser = await ensureUserDoc(cred.user.uid, name);
    hideUsernameModal();
    updatePointsDisplay();
  } catch (err) {
    alert('Kunde inte logga in: ' + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
