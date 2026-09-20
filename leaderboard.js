document.getElementById('leaderboard-btn').addEventListener('click', openLeaderboard);
document.getElementById('leaderboard-close').addEventListener('click', () => {
  document.getElementById('leaderboard-modal').classList.add('hidden');
});

async function openLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '<li class="leaderboard-empty">Laddar…</li>';
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  try {
    const snap = await db.collection('users').orderBy('points', 'desc').limit(20).get();
    list.innerHTML = '';
    if (snap.empty) {
      list.innerHTML = '<li class="leaderboard-empty">Inga spelare än.</li>';
      return;
    }
    let rank = 1;
    snap.forEach((doc) => {
      const data = doc.data();
      const li = document.createElement('li');
      li.className = 'leaderboard-row' + (currentUser && doc.id === currentUser.uid ? ' me' : '');
      li.innerHTML =
        `<span class="rank">${rank}</span>` +
        `<span class="name">${escapeHtml(data.name || '?')}</span>` +
        `<span class="points" title="${data.points || 0} Gråbopoäng">${formatPoints(data.points)}<img class="coin-icon" src="assets/coin-icon.png" alt=""></span>`;
      list.appendChild(li);
      rank++;
    });
  } catch (err) {
    list.innerHTML = '<li class="leaderboard-empty">Kunde inte hämta topplistan.</li>';
  }
}
