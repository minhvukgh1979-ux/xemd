// ============================================================
// Nhạc Drive — bản đơn giản, chỉ để nghe nhạc, lấy trực tiếp từ
// 1 folder Google Drive của tài khoản minhvukgh1979.
// ============================================================

// Cấu hình cố định — lấy từ tài khoản minhvukgh1979@gmail.com.
// Muốn đổi sang folder/tài khoản khác thì sửa 2 dòng này.
const API_KEY = 'AIzaSyC8Wyr26jIvv7AETbMshe9u7jv2owfcQRw';
const FOLDER_LINK = 'https://drive.google.com/drive/folders/17wcsWpbjUcW5shb61luAqPjaRoh-8qL2';

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'flac', 'aac', 'wma', 'opus', 'oga', 'ogg'];

const STORAGE_KEY = 'nhacdrive_state_v1';

// ---------------- Tiện ích ----------------

function extractFolderId(link) {
  const m = /\/folders\/([a-zA-Z0-9_-]+)/.exec(link || '');
  return m ? m[1] : (link || '').trim();
}

function getExtension(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function getBaseName(name) {
  return (name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

function isAudioFile(file) {
  if (file.mimeType && file.mimeType.indexOf('audio/') === 0) return true;
  return AUDIO_EXTENSIONS.includes(getExtension(file.name));
}

function normalizeForSearch(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function streamUrl(fileId) {
  return 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
    '?alt=media&key=' + encodeURIComponent(API_KEY);
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveState(patch) {
  const s = Object.assign({}, loadState(), patch);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  return s;
}

// ---------------- Quét folder Drive lấy danh sách nhạc ----------------

async function listFolderFiles(folderId) {
  let files = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
    let url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
      '&fields=' + encodeURIComponent('nextPageToken, files(id,name,mimeType)') +
      '&orderBy=' + encodeURIComponent('name') +
      '&pageSize=1000&key=' + encodeURIComponent(API_KEY);
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);

    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return files;
}

// ---------------- State ----------------

let tracks = [];       // { id, name, title, key }
let filteredTracks = [];
let currentIndex = -1;
let favorites = new Set(loadState().favorites || []);
let shuffleOn = !!loadState().shuffle;
let repeatOn = !!loadState().repeat;

// ---------------- DOM ----------------

const statusMsg = document.getElementById('statusMsg');
const trackListEl = document.getElementById('trackList');
const searchInput = document.getElementById('searchInput');
const reloadBtn = document.getElementById('reloadBtn');

const player = document.getElementById('player');
const audioEl = document.getElementById('audioEl');
const nowTitle = document.getElementById('nowTitle');
const seekBar = document.getElementById('seekBar');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const muteBtn = document.getElementById('muteBtn');
const volumeBar = document.getElementById('volumeBar');

shuffleBtn.classList.toggle('on', shuffleOn);
repeatBtn.classList.toggle('on', repeatOn);

// ---------------- Tải danh sách nhạc ----------------

async function loadTracks() {
  statusMsg.textContent = 'Đang tải danh sách nhạc...';
  statusMsg.classList.remove('hidden', 'error');
  trackListEl.innerHTML = '';

  const folderId = extractFolderId(FOLDER_LINK);
  let files;
  try {
    files = await listFolderFiles(folderId);
  } catch (e) {
    statusMsg.textContent = 'Không tải được danh sách: ' + e.message +
      '. Kiểm tra lại API Key / quyền chia sẻ folder ("Bất kỳ ai có đường liên kết - Người xem").';
    statusMsg.classList.add('error');
    return;
  }

  const audioFiles = files.filter(isAudioFile);
  tracks = audioFiles.map(function (f) {
    const baseName = getBaseName(f.name);
    return { id: f.id, name: f.name, title: baseName, key: normalizeForSearch(baseName) };
  });

  if (tracks.length === 0) {
    statusMsg.textContent = 'Không thấy file nhạc nào trong folder Drive.';
    return;
  }

  statusMsg.classList.add('hidden');
  applyFilter();

  // Nếu có bài đang nghe dở lần trước, chuẩn bị sẵn (không tự phát).
  const st = loadState();
  if (st.lastTrackId) {
    const idx = tracks.findIndex(function (t) { return t.id === st.lastTrackId; });
    if (idx >= 0) {
      currentIndex = idx;
      nowTitle.textContent = tracks[idx].title;
      player.classList.remove('hidden');
    }
  }
}

// ---------------- Hiển thị danh sách ----------------

function applyFilter() {
  const term = normalizeForSearch(searchInput.value);
  filteredTracks = term ? tracks.filter(function (t) { return t.key.indexOf(term) !== -1; }) : tracks.slice();
  renderList();
}

function renderList() {
  trackListEl.innerHTML = '';

  if (filteredTracks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '🔍 Không tìm thấy bài hát phù hợp.';
    trackListEl.appendChild(empty);
    return;
  }

  filteredTracks.forEach(function (track) {
    const row = document.createElement('div');
    row.className = 'track-row' + (tracks[currentIndex] && tracks[currentIndex].id === track.id ? ' playing' : '');
    row.tabIndex = 0;

    const icon = document.createElement('div');
    icon.className = 'track-icon';
    icon.textContent = (tracks[currentIndex] && tracks[currentIndex].id === track.id && !audioEl.paused) ? '▶' : '🎵';
    row.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = track.title;
    row.appendChild(name);

    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (favorites.has(track.id) ? ' active' : '');
    favBtn.textContent = favorites.has(track.id) ? '★' : '☆';
    favBtn.title = 'Yêu thích';
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (favorites.has(track.id)) favorites.delete(track.id); else favorites.add(track.id);
      saveState({ favorites: Array.from(favorites) });
      favBtn.classList.toggle('active');
      favBtn.textContent = favorites.has(track.id) ? '★' : '☆';
    });
    row.appendChild(favBtn);

    row.addEventListener('click', function () { playTrackByKey(track.key); });
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter') playTrackByKey(track.key); });

    trackListEl.appendChild(row);
  });
}

function playTrackByKey(key) {
  const idx = tracks.findIndex(function (t) { return t.key === key; });
  if (idx >= 0) playTrackAt(idx);
}

// ---------------- Phát nhạc ----------------

function playTrackAt(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  currentIndex = idx;
  const track = tracks[idx];

  player.classList.remove('hidden');
  nowTitle.textContent = track.title;
  audioEl.src = streamUrl(track.id);
  audioEl.play().catch(function () { /* có thể bị chặn autoplay lần đầu */ });
  saveState({ lastTrackId: track.id });
  renderList();
}

function togglePlayPause() {
  if (!audioEl.src) {
    if (filteredTracks.length > 0) playTrackByKey(filteredTracks[0].key);
    return;
  }
  if (audioEl.paused) audioEl.play(); else audioEl.pause();
}

function playNext(auto) {
  if (tracks.length === 0) return;
  let idx;
  if (shuffleOn) {
    if (tracks.length === 1) idx = 0;
    else { do { idx = Math.floor(Math.random() * tracks.length); } while (idx === currentIndex); }
  } else {
    idx = currentIndex + 1;
    if (idx >= tracks.length) {
      if (!auto || repeatOn) idx = 0; else return; // hết playlist, không lặp -> dừng
    }
  }
  playTrackAt(idx);
}

function playPrev() {
  if (tracks.length === 0) return;
  let idx = currentIndex - 1;
  if (idx < 0) idx = tracks.length - 1;
  playTrackAt(idx);
}

// ---------------- Sự kiện player ----------------

playPauseBtn.addEventListener('click', togglePlayPause);
prevBtn.addEventListener('click', playPrev);
nextBtn.addEventListener('click', function () { playNext(false); });

shuffleBtn.addEventListener('click', function () {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle('on', shuffleOn);
  saveState({ shuffle: shuffleOn });
});
repeatBtn.addEventListener('click', function () {
  repeatOn = !repeatOn;
  repeatBtn.classList.toggle('on', repeatOn);
  saveState({ repeat: repeatOn });
});

muteBtn.addEventListener('click', function () {
  audioEl.muted = !audioEl.muted;
  muteBtn.textContent = audioEl.muted ? '🔇' : '🔊';
});
volumeBar.addEventListener('input', function () {
  audioEl.volume = parseFloat(volumeBar.value);
  audioEl.muted = false;
  muteBtn.textContent = audioEl.volume === 0 ? '🔇' : '🔊';
});

audioEl.addEventListener('play', function () {
  playPauseBtn.textContent = '⏸';
  renderList();
});
audioEl.addEventListener('pause', function () {
  playPauseBtn.textContent = '▶';
  renderList();
});
audioEl.addEventListener('ended', function () { playNext(true); });

audioEl.addEventListener('loadedmetadata', function () {
  timeDuration.textContent = formatTime(audioEl.duration);
});

let seeking = false;
audioEl.addEventListener('timeupdate', function () {
  if (seeking) return;
  timeCurrent.textContent = formatTime(audioEl.currentTime);
  if (audioEl.duration) seekBar.value = (audioEl.currentTime / audioEl.duration) * 1000;
});
seekBar.addEventListener('input', function () {
  seeking = true;
  if (audioEl.duration) timeCurrent.textContent = formatTime((seekBar.value / 1000) * audioEl.duration);
});
seekBar.addEventListener('change', function () {
  if (audioEl.duration) audioEl.currentTime = (seekBar.value / 1000) * audioEl.duration;
  seeking = false;
});

audioEl.addEventListener('error', function () {
  statusMsg.textContent = 'Không phát được bài này (có thể file chưa chia sẻ công khai, hoặc lỗi mạng). Thử bài khác hoặc tải lại trang.';
  statusMsg.classList.remove('hidden');
  statusMsg.classList.add('error');
});

// ---------------- Tìm kiếm / tải lại ----------------

searchInput.addEventListener('input', applyFilter);
reloadBtn.addEventListener('click', loadTracks);

// ---------------- Phím tắt ----------------

document.addEventListener('keydown', function (e) {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
  else if (e.key === 'ArrowRight') { audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + 10); }
  else if (e.key === 'ArrowLeft') { audioEl.currentTime = Math.max(0, audioEl.currentTime - 10); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); audioEl.volume = Math.min(1, audioEl.volume + 0.1); volumeBar.value = audioEl.volume; }
  else if (e.key === 'ArrowDown') { e.preventDefault(); audioEl.volume = Math.max(0, audioEl.volume - 0.1); volumeBar.value = audioEl.volume; }
  else if (e.key === 'n' || e.key === 'N') { playNext(false); }
  else if (e.key === 'p' || e.key === 'P') { playPrev(); }
});

// ---------------- Khởi động ----------------

loadTracks();
