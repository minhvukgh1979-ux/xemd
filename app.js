// ============================================================
// Dethi Drive TV - phiên bản Web (quét Folder + quản lý + trình
// phát tuỳ chỉnh có tua lùi/tiến, tốc độ, phụ đề, ghi nhớ vị trí xem)
// ============================================================

// ============================================================
// CẤU HÌNH MẶC ĐỊNH (điền 1 LẦN DUY NHẤT trước khi đưa code lên
// GitHub Pages, để mở trang là có video ngay, không cần nhập gì).
//
// Hỗ trợ NHIỀU TÀI KHOẢN Google Drive cùng lúc: mỗi tài khoản là 1
// folder riêng (apiKey có thể dùng chung 1 key cho mọi tài khoản, vì
// API Key chỉ là khoá của 1 project Google Cloud, không gắn với tài
// khoản Drive nào - cái khác nhau giữa các "tài khoản" ở đây chính là
// folderLink, tức là 2 folder Drive khác nhau chứa 2 bản phim giống
// nhau). App sẽ tự quét hết các folder bên dưới, phim nào trùng tên ở
// nhiều tài khoản sẽ gộp làm 1 mục - khi phát mà tài khoản A bị giới
// hạn (quota) thì tự động nhảy qua tài khoản B phát tiếp, không cần
// bấm gì thêm.
//
// Để trống apiKey/folderLink của 1 dòng nếu chưa dùng tới - dòng đó sẽ
// bị bỏ qua. Có thể thêm/bớt/tuỳ chỉnh ngay trên web qua màn hình
// Cấu hình (⚙️ hoặc phím M) mà không cần sửa file này.
// ============================================================
const DEFAULT_ACCOUNTS = [
  {
    label: 'minhvukgh1979',
    apiKey: 'AIzaSyC8Wyr26jIvv7AETbMshe9u7jv2owfcQRw',
    folderLink: 'https://drive.google.com/drive/folders/17wcsWpbjUcW5shb61luAqPjaRoh-8qL2'
  },
  {
    label: 'minhvukgh1977',
    apiKey: '',      // <-- điền API Key dùng cho tài khoản 2 (có thể copy y hệt key ở trên)
    folderLink: ''   // <-- điền link folder Drive THẬT SỰ của minhvukgh1977 (khác folder ở trên)
  }
];

// ---------------- OAuth (đăng nhập Google, tránh download quota) ----------------
const OAUTH_CLIENT_ID = '50814470997-lo6soguprrloh213jvdbll7t3kl5mk9l.apps.googleusercontent.com';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let accessToken = null;   // token hiện tại (null nếu chưa đăng nhập)
let tokenClient = null;
let swRegistration = null;

// ---------------- OAuth riêng cho Đồng bộ Drive (đọc + GHI) ----------------
// Dùng chung OAUTH_CLIENT_ID ở trên (không cần Project/Client ID mới), chỉ
// xin thêm scope 'drive' đầy đủ (đọc/ghi) khi người dùng chủ động bật tính
// năng Đồng bộ - tách riêng khỏi accessToken (chỉ đọc) dùng để phát video,
// để không xin quyền ghi khi không cần thiết.
const SYNC_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive';
const SYNC_BACKUP_FILENAME = 'dethidrivetv-backup.json';
let syncAccessToken = null;
let syncTokenClient = null;
let syncTokenExpiresAt = 0;
let isApplyingRemoteBackup = false; // true khi đang áp bản tải từ Drive, để không tự đẩy ngược lại
let autoPushTimer = null;

const LS_KEY_SYNC_CONFIG = 'drivetv_sync_config';       // {enabled, folderLink, folderId, apiKey, fileId}
const LS_KEY_SYNC_LOCAL_TS = 'drivetv_sync_local_ts';   // mốc thời gian thay đổi local gần nhất
const LS_KEY_SYNC_PUSHED_TS = 'drivetv_sync_pushed_ts'; // mốc thời gian đã đẩy lên Drive gần nhất

const LS_KEY_API = 'drivetv_api_key';             // cũ - chỉ dùng để migrate 1 lần
const LS_KEY_FOLDER_LINK = 'drivetv_folder_link'; // cũ - chỉ dùng để migrate 1 lần
const LS_KEY_ACCOUNTS = 'drivetv_accounts';       // [{googleAccount,label,apiKey,folderLink}, ...]
const LS_KEY_ACCOUNTS_BACKUP = 'drivetv_accounts_backup'; // bản sao dự phòng local
const LS_KEY_META = 'drivetv_meta';         // {key: {title, favorite, hidden, note, watchedManual}}
const LS_KEY_PROGRESS = 'drivetv_progress'; // {key: {time, duration, updatedAt}}
const LS_KEY_VIEW = 'drivetv_view';         // 'grid' | 'list'
const LS_KEY_MEDIA_FILTER = 'drivetv_media_filter'; // 'all' | 'video' | 'audio'
const LS_KEY_PLAYER_PREFS = 'drivetv_player_prefs'; // {shuffle, repeat}

// ---------------- DOM refs ----------------

const gridScreen = document.getElementById('gridScreen');
const playerScreen = document.getElementById('playerScreen');
const settingsScreen = document.getElementById('settingsScreen');
const editModal = document.getElementById('editModal');

const settingsBtn = document.getElementById('settingsBtn');
const signInBtn = document.getElementById('signInBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const accountsListEl = document.getElementById('accountsList');
const addAccountBtn = document.getElementById('addAccountBtn');
const saveBtn = document.getElementById('saveBtn');
const settingsError = document.getElementById('settingsError');

const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sortSelect = document.getElementById('sortSelect');
const refreshBtn = document.getElementById('refreshBtn');
const tabsEl = document.getElementById('tabs');
const mediaSwitchEl = document.getElementById('mediaSwitch');
const videoGrid = document.getElementById('videoGrid');
const statusMsg = document.getElementById('statusMsg');
const videoCountBadge = document.getElementById('videoCountBadge');
const viewToggleBtn = document.getElementById('viewToggleBtn');
const selectModeBtn = document.getElementById('selectModeBtn');
const bulkBar = document.getElementById('bulkBar');
const bulkCount = document.getElementById('bulkCount');
const bulkFavBtn = document.getElementById('bulkFavBtn');
const bulkHideBtn = document.getElementById('bulkHideBtn');
const bulkCancelBtn = document.getElementById('bulkCancelBtn');
const continueSection = document.getElementById('continueSection');
const continueRow = document.getElementById('continueRow');

const videoPlayer = document.getElementById('videoPlayer');
const subtitleTrack = document.getElementById('subtitleTrack');
const playerWrap = document.getElementById('playerWrap');
const playerControls = document.getElementById('playerControls');
const bigPlayBtn = document.getElementById('bigPlayBtn');
const playerError = document.getElementById('playerError');
const backBtn = document.getElementById('backBtn');
const playerTitle = document.getElementById('playerTitle');
const audioCover = document.getElementById('audioCover');
const audioCoverTitle = document.getElementById('audioCoverTitle');
const audioCoverSub = document.getElementById('audioCoverSub');
const shortcutsBtn = document.getElementById('shortcutsBtn');
const seekBar = document.getElementById('seekBar');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const playPauseBtn = document.getElementById('playPauseBtn');
const rewindBtn = document.getElementById('rewindBtn');
const forwardBtn = document.getElementById('forwardBtn');
const muteBtn = document.getElementById('muteBtn');
const volumeBar = document.getElementById('volumeBar');
const subtitleBtn = document.getElementById('subtitleBtn');
const speedBtn = document.getElementById('speedBtn');
const pipBtn = document.getElementById('pipBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const playerSubtitle = document.getElementById('playerSubtitle');
const playerFavBtn = document.getElementById('playerFavBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const prevTrackBtn = document.getElementById('prevTrackBtn');
const nextTrackBtn = document.getElementById('nextTrackBtn');
const queueBtn = document.getElementById('queueBtn');
const queuePanel = document.getElementById('queuePanel');
const queueList = document.getElementById('queueList');
const closeQueueBtn = document.getElementById('closeQueueBtn');

const editTitleInput = document.getElementById('editTitleInput');
const editNoteInput = document.getElementById('editNoteInput');
const editWatchedInput = document.getElementById('editWatchedInput');
const editSaveBtn = document.getElementById('editSaveBtn');
const editResetBtn = document.getElementById('editResetBtn');
const editCancelBtn = document.getElementById('editCancelBtn');

const toastContainer = document.getElementById('toastContainer');

// ---------------- State ----------------

let allVideos = [];        // dữ liệu gốc quét từ Drive
let currentTab = 'all';
let currentMediaFilter = (function () {
  const saved = localStorage.getItem(LS_KEY_MEDIA_FILTER);
  return saved === 'all' || saved === 'video' || saved === 'audio' ? saved : 'video';
})(); // 'all' | 'video' (phim, mặc định) | 'audio' (nhạc)
let currentSubtitleUrl = null;
let currentVideo = null;
let currentSourceIndex = -1; // vị trí trong video.sources đang phát (để nhảy tài khoản khi lỗi)
let editingKey = null;
let controlsHideTimer = null;
let progressSaveTimer = null;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

let currentDisplayedList = []; // danh sách đang hiện trên lưới (đã lọc/sắp xếp) - dùng để dựng hàng đợi phát
let audioQueue = [];       // hàng đợi phát hiện tại (cùng loại phim hoặc cùng loại nhạc với bài đang mở)
let queueIndex = -1;       // vị trí bài đang phát trong audioQueue
let shuffleOrder = [];     // thứ tự phát khi bật trộn bài (mảng chỉ số của audioQueue)
const playerPrefs = loadPlayerPrefs();
let shuffleOn = playerPrefs.shuffle;
let repeatMode = playerPrefs.repeat; // 'off' | 'all' | 'one'

function loadPlayerPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY_PLAYER_PREFS) || '{}');
    return {
      shuffle: !!p.shuffle,
      repeat: (p.repeat === 'all' || p.repeat === 'one') ? p.repeat : 'off'
    };
  } catch (e) {
    return { shuffle: false, repeat: 'off' };
  }
}

function savePlayerPrefs() {
  localStorage.setItem(LS_KEY_PLAYER_PREFS, JSON.stringify({ shuffle: shuffleOn, repeat: repeatMode }));
}
let speedIndex = 2;
let bulkModeActive = false;
let selectedKeys = new Set();

// ---------------- Toast (thông báo nhẹ, thay cho alert) ----------------

function toast(message, type) {
  if (!toastContainer) { return; }
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'ok' ? ' toast-ok' : type === 'err' ? ' toast-err' : '');
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(function () { el.remove(); }, 260);
  }, 3200);
}

// ---------------- Config helpers ----------------

// Bản cũ chỉ lưu 1 tài khoản (LS_KEY_API + LS_KEY_FOLDER_LINK). Nếu
// trình duyệt người dùng còn cấu hình kiểu cũ và CHƯA có LS_KEY_ACCOUNTS,
// tự chuyển sang định dạng mới 1 lần duy nhất để không mất cấu hình.
function migrateOldConfigIfNeeded() {
  if (localStorage.getItem(LS_KEY_ACCOUNTS)) return;
  const oldKey = localStorage.getItem(LS_KEY_API);
  const oldFolder = localStorage.getItem(LS_KEY_FOLDER_LINK);
  if (oldKey || oldFolder) {
    saveAccounts([{ label: '', apiKey: oldKey || '', folderLink: oldFolder || '' }]);
  }
}

function normalizeAccount(a) {
  return {
    googleAccount: String((a && a.googleAccount) || '').trim(),
    label: String((a && a.label) || '').trim(),
    apiKey: String((a && a.apiKey) || '').trim(),
    folderLink: String((a && a.folderLink) || '').trim()
  };
}

function getAccounts() {
  migrateOldConfigIfNeeded();
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(LS_KEY_ACCOUNTS) || '[]');
  } catch (e) {
    list = [];
  }
  if (!Array.isArray(list) || !list.length) {
    try {
      list = JSON.parse(localStorage.getItem(LS_KEY_ACCOUNTS_BACKUP) || '[]');
    } catch (e) {
      list = [];
    }
  }

  list = list.map(normalizeAccount).filter(function (a) {
    return a.apiKey && a.folderLink;
  });

  if (list.length === 0) {
    list = DEFAULT_ACCOUNTS.map(normalizeAccount).filter(function (a) {
      return a.apiKey && a.folderLink;
    });
  }
  return list;
}

function saveAccounts(accounts) {
  const clean = accounts.map(normalizeAccount).filter(function (a) {
    return a.apiKey && a.folderLink;
  });
  const json = JSON.stringify(clean);
  try {
    localStorage.setItem(LS_KEY_ACCOUNTS, json);
    localStorage.setItem(LS_KEY_ACCOUNTS_BACKUP, json);
    // Đọc lại ngay để chắc chắn trình duyệt đã ghi thành công.
    const verify = JSON.parse(localStorage.getItem(LS_KEY_ACCOUNTS) || '[]');
    if (!Array.isArray(verify) || verify.length !== clean.length) {
      throw new Error('Không xác minh được dữ liệu đã lưu');
    }
  } catch (e) {
    console.error('saveAccounts failed', e);
    throw new Error('Trình duyệt không cho phép lưu cấu hình. Hãy kiểm tra quyền lưu dữ liệu của trang GitHub Pages.');
  }
  bumpLocalChangeTs();
}

function isConfigured() {
  return getAccounts().length > 0;
}

function getMetaStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_META) || '{}'); }
  catch (e) { return {}; }
}

function saveMetaStore(store) {
  localStorage.setItem(LS_KEY_META, JSON.stringify(store));
  bumpLocalChangeTs();
}

// Lưu ý: "key" ở đây là khoá gộp phim theo TÊN (xem fetchFolderVideos),
// không phải fileId của 1 file cụ thể - để yêu thích/ẩn/tên hiển thị/vị
// trí xem giữ nguyên bất kể đang phát từ tài khoản/nguồn nào.
function getMeta(key) {
  const store = getMetaStore();
  return Object.assign({ title: null, favorite: false, hidden: false, note: '', watchedManual: false }, store[key] || {});
}

function setMeta(key, patch) {
  const store = getMetaStore();
  store[key] = Object.assign({ title: null, favorite: false, hidden: false, note: '', watchedManual: false }, store[key] || {}, patch);
  saveMetaStore(store);
}

function getProgressStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_PROGRESS) || '{}'); }
  catch (e) { return {}; }
}

function getProgress(key) {
  const store = getProgressStore();
  return store[key] || null;
}

function setProgress(key, data) {
  const store = getProgressStore();
  if (data === null) { delete store[key]; }
  else { store[key] = Object.assign({}, data, { updatedAt: Date.now() }); }
  localStorage.setItem(LS_KEY_PROGRESS, JSON.stringify(store));
  bumpLocalChangeTs();
}

// Tách folder ID từ link Drive, hoặc chuỗi ID thuần.
function extractFolderId(text) {
  if (!text) return '';
  const t = text.trim();
  let m = t.match(/\/folders\/([-\w]{10,})/);
  if (m) return m[1];
  m = t.match(/[?&]id=([-\w]{10,})/);
  if (m) return m[1];
  if (/^[-\w]{10,}$/.test(t)) return t;
  return t;
}

function streamUrl(fileId, apiKey) {
  const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
  // Nếu đã đăng nhập Google, không gắn key nữa - service worker (sw.js)
  // sẽ tự chèn header Authorization: Bearer <token> vào request này.
  // Nhờ vậy request được tính là "có xác thực", không bị tính vào
  // download quota dành cho truy cập ẩn danh qua link công khai.
  if (accessToken) return base;
  return base + '&key=' + encodeURIComponent(apiKey);
}

// ---------------- OAuth: đăng nhập Google ----------------

function sendTokenToServiceWorker(token) {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SET_TOKEN', token: token });
  } else {
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ type: 'SET_TOKEN', token: token });
    });
  }
}

function updateSignInButton() {
  if (!signInBtn) return;
  signInBtn.textContent = accessToken ? '✅' : '👤';
  signInBtn.title = accessToken
    ? 'Đã đăng nhập Google (tránh giới hạn tải xuống)'
    : 'Đăng nhập Google để tránh lỗi "download quota exceeded"';
}

// ---------------- Nhận diện TV / trình duyệt cũ không hỗ trợ đăng nhập Google ----------------
// Google chặn hẳn luồng OAuth (lỗi "disallowed_useragent") trên nhiều
// trình duyệt TV đời cũ / WebView nhúng. Vì đây là chặn từ phía Google,
// không có cách nào vượt qua bằng code, nên tốt nhất là ẩn hẳn nút đăng
// nhập trên các thiết bị này để tránh người dùng bị kẹt ở màn hình lỗi.
function isLikelyUnsupportedAuthBrowser() {
  const ua = navigator.userAgent || '';
  const tvPattern = /SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|VIDAA|HbbTV|CrKey|AFTM|AFTT|AFTS|AFTB|AFTA|Roku|PhilipsTV|GoogleTV|SMART-TV|DuiD|POV_TV|TV Store|LG Browser|Espial|OMI\/|Quest/i;
  if (tvPattern.test(ua)) return true;
  // Engine quá cũ (thường thấy trên TV) sẽ thiếu các API JS hiện đại này.
  if (typeof Promise === 'undefined' || typeof fetch === 'undefined') return true;
  if (!window.crypto || !window.crypto.subtle) return true;
  return false;
}

let authInitAttempts = 0;
const AUTH_INIT_MAX_ATTEMPTS = 15; // ~4.5s, sau đó coi như trình duyệt không hỗ trợ

function hideSignInButton() {
  if (signInBtn) signInBtn.classList.add('hidden');
}

function initGoogleAuth() {
  if (isLikelyUnsupportedAuthBrowser()) {
    hideSignInButton();
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    authInitAttempts++;
    if (authInitAttempts >= AUTH_INIT_MAX_ATTEMPTS) {
      // Thư viện đăng nhập Google không load được (mạng chặn, trình
      // duyệt không hỗ trợ...) - ẩn nút để tránh bấm vào bị lỗi.
      hideSignInButton();
      return;
    }
    // Thư viện GIS load async, thử lại sau 300ms nếu chưa sẵn sàng
    setTimeout(initGoogleAuth, 300);
    return;
  }
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: OAUTH_SCOPE,
      callback: function (response) {
        if (response && response.access_token) {
          accessToken = response.access_token;
          sendTokenToServiceWorker(accessToken);
          updateSignInButton();
          // Đặt hẹn giờ tự hỏi lại token mới trước khi hết hạn (~1 giờ)
          const expiresInMs = (response.expires_in || 3600) * 1000;
          setTimeout(function () {
            if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
          }, Math.max(expiresInMs - 60000, 30000));
        }
      },
      error_callback: function () {
        // Google báo không đăng nhập được (vd. disallowed_useragent) -
        // im lặng bỏ qua, người dùng vẫn dùng được app qua API key.
      }
    });
  } catch (e) {
    hideSignInButton();
  }
}

if (signInBtn) {
  signInBtn.addEventListener('click', function () {
    if (isLikelyUnsupportedAuthBrowser()) { hideSignInButton(); return; }
    if (!tokenClient) { initGoogleAuth(); setTimeout(function () { if (tokenClient) tokenClient.requestAccessToken(); }, 500); return; }
    try { tokenClient.requestAccessToken(); } catch (e) { /* bỏ qua, dùng API key */ }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    swRegistration = reg;
    if (accessToken) sendTokenToServiceWorker(accessToken);
  }).catch(function () { /* nếu SW không đăng ký được, app vẫn chạy bằng API key */ });
}

initGoogleAuth();
updateSignInButton();

// ================= ĐỒNG BỘ CẤU HÌNH QUA GOOGLE DRIVE (tự động) =================

// Cấu hình Đồng bộ Drive MẶC ĐỊNH - lấy thẳng từ tài khoản đầu tiên trong
// DEFAULT_ACCOUNTS (cùng apiKey + folderLink đã điền ở đầu file), để mở
// trang lần đầu trên BẤT KỲ máy/trình duyệt nào cũng tự đọc được ngay,
// không cần bấm gì. Người dùng vẫn có thể đổi lại ở tab ☁️ Đồng bộ Drive.
function getDefaultSyncConfig() {
  const def = DEFAULT_ACCOUNTS.map(normalizeAccount).filter(function (a) {
    return a.apiKey && a.folderLink;
  })[0];
  if (!def) return { enabled: false, folderLink: '', folderId: '', apiKey: '', fileId: '' };
  return {
    enabled: true,
    folderLink: def.folderLink,
    folderId: extractFolderId(def.folderLink),
    apiKey: def.apiKey,
    fileId: ''
  };
}

function getSyncConfig() {
  const fallback = getDefaultSyncConfig();
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY_SYNC_CONFIG) || 'null');
    if (c && typeof c === 'object') {
      // Cấu hình đã lưu (kể cả từ bản cũ chưa có field apiKey) - giữ nguyên
      // những gì người dùng đã chọn, chỉ bù các field còn thiếu bằng mặc định.
      const merged = Object.assign({ enabled: false, folderLink: '', folderId: '', apiKey: '', fileId: '' }, fallback, c);
      // Chỉ bù apiKey mặc định khi cấu hình cũ CHƯA TỪNG có field này (bản
      // trước khi có tính năng đọc-bằng-key) - không ghi đè trường hợp
      // người dùng đã chủ động để trống (vd. folder riêng tư qua wizard).
      if (c.apiKey === undefined) merged.apiKey = fallback.apiKey;
      return merged;
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

function saveSyncConfig(cfg) {
  localStorage.setItem(LS_KEY_SYNC_CONFIG, JSON.stringify(cfg));
}

// Gọi mỗi khi có 1 thay đổi cấu hình cục bộ (tài khoản/yêu thích/ẩn/ghi
// chú/vị trí xem...) - đặt hẹn giờ đẩy lên Drive sau vài giây, để gộp
// nhiều thay đổi liên tiếp thành 1 lần ghi thay vì ghi liên tục.
function bumpLocalChangeTs() {
  if (isApplyingRemoteBackup) return; // đang áp bản từ Drive xuống, không phải người dùng tự đổi
  localStorage.setItem(LS_KEY_SYNC_LOCAL_TS, String(Date.now()));
  scheduleAutoPush();
}

function scheduleAutoPush() {
  const cfg = getSyncConfig();
  if (!cfg.enabled) return;
  if (autoPushTimer) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(function () {
    pushBackupToDrive(false).catch(function (e) {
      console.warn('Tự động đồng bộ lên Drive thất bại:', e && e.message);
    });
  }, 4000);
}

// ---- Lấy access token riêng cho Đồng bộ (scope đọc/ghi Drive đầy đủ) ----
function requestSyncAccessToken(promptMode) {
  return new Promise(function (resolve, reject) {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      reject(new Error('Thư viện đăng nhập Google chưa sẵn sàng, hãy thử lại sau vài giây.'));
      return;
    }
    if (!syncTokenClient) {
      try {
        syncTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: OAUTH_CLIENT_ID,
          scope: SYNC_OAUTH_SCOPE,
          callback: function () {}
        });
      } catch (e) {
        reject(e);
        return;
      }
    }
    syncTokenClient.callback = function (response) {
      if (response && response.access_token) {
        syncAccessToken = response.access_token;
        syncTokenExpiresAt = Date.now() + ((response.expires_in || 3600) * 1000);
        resolve(syncAccessToken);
      } else {
        reject(new Error('Không nhận được quyền truy cập Google Drive.'));
      }
    };
    syncTokenClient.error_callback = function (err) {
      reject(new Error((err && err.type) || 'Đăng nhập/cấp quyền Google Drive thất bại hoặc bị huỷ.'));
    };
    try {
      syncTokenClient.requestAccessToken(promptMode === undefined ? {} : { prompt: promptMode });
    } catch (e) {
      reject(e);
    }
  });
}

// Dùng token còn hạn nếu có; nếu hết hạn, thử xin lại 1 cách âm thầm
// (prompt:'') trước - chỉ khi thất bại mới cần người dùng bấm đăng nhập
// lại thủ công qua nút trong wizard.
async function ensureSyncAccessToken() {
  if (syncAccessToken && Date.now() < syncTokenExpiresAt - 30000) return syncAccessToken;
  return requestSyncAccessToken('');
}

async function driveApiFetch(url, options) {
  const token = await ensureSyncAccessToken();
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); msg = (j && j.error && j.error.message) || msg; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

// ---- Đọc (list/tải) file đồng bộ bằng API Key công khai - KHÔNG cần đăng
// nhập Google. Chỉ hoạt động nếu folder đã chia sẻ "Bất kỳ ai có link"
// (giống hệt cách app đọc danh sách video). Dùng cho MỌI lượt tự động kéo
// bản mới nhất về khi mở trang, kể cả lần đầu tiên trên 1 máy/trình duyệt
// hoàn toàn mới - vì đây là hành động ĐỌC, Google cho phép API Key đọc bất
// kỳ lúc nào, không giới hạn 1 lần/máy như đăng nhập OAuth.
async function driveApiKeyFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); msg = (j && j.error && j.error.message) || msg; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

async function findSyncFileIdByApiKey(apiKey, folderId) {
  const q = encodeURIComponent("'" + folderId + "' in parents and name = '" + SYNC_BACKUP_FILENAME + "' and trashed = false");
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
    '&fields=' + encodeURIComponent('files(id,name,modifiedTime)') + '&pageSize=5' +
    '&key=' + encodeURIComponent(apiKey);
  const res = await driveApiKeyFetch(url);
  const data = await res.json();
  return (data.files && data.files.length) ? data.files[0].id : null;
}

async function downloadSyncFileByApiKey(apiKey, fileId) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
    '?alt=media&key=' + encodeURIComponent(apiKey);
  const res = await driveApiKeyFetch(url);
  return res.json();
}

// ---- Ghi (tạo/cập nhật) file đồng bộ - LUÔN cần đăng nhập Google (OAuth),
// vì API Key không bao giờ có quyền ghi lên Drive, dù folder public hay
// không. Các hàm find/create/update/download bên dưới dùng chung
// driveApiFetch (đã tự đính kèm access token).
async function findSyncFileId(folderId) {
  const q = encodeURIComponent("'" + folderId + "' in parents and name = '" + SYNC_BACKUP_FILENAME + "' and trashed = false");
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
    '&fields=' + encodeURIComponent('files(id,name,modifiedTime)') + '&pageSize=5';
  const res = await driveApiFetch(url);
  const data = await res.json();
  return (data.files && data.files.length) ? data.files[0].id : null;
}

async function createSyncFile(folderId, contentStr) {
  const boundary = '-------dethidrivetvsync' + Date.now();
  const metadata = { name: SYNC_BACKUP_FILENAME, parents: [folderId], mimeType: 'application/json' };
  const body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    contentStr + '\r\n' +
    '--' + boundary + '--';
  const res = await driveApiFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body }
  );
  const data = await res.json();
  return data.id;
}

async function updateSyncFile(fileId, contentStr) {
  await driveApiFetch(
    'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media',
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: contentStr }
  );
}

async function downloadSyncFile(fileId) {
  const res = await driveApiFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media');
  return res.json();
}

// ---- Dùng chung với tab "Sao lưu": gói toàn bộ cấu hình / áp dụng lại ----
function buildBackupPayload() {
  return {
    exportedAt: new Date().toISOString(),
    accounts: getAccounts(),
    meta: getMetaStore(),
    progress: getProgressStore()
  };
}

function applyBackupPayload(data) {
  if (!data || !Array.isArray(data.accounts)) throw new Error('Dữ liệu sao lưu không đúng định dạng.');
  isApplyingRemoteBackup = true;
  try {
    saveAccounts(data.accounts);
    if (data.meta && typeof data.meta === 'object') saveMetaStore(data.meta);
    if (data.progress && typeof data.progress === 'object') localStorage.setItem(LS_KEY_PROGRESS, JSON.stringify(data.progress));
  } finally {
    isApplyingRemoteBackup = false;
  }
}

async function pushBackupToDrive(manual) {
  const cfg = getSyncConfig();
  if (!cfg.enabled || !cfg.folderId) {
    if (manual) toast('Chưa bật đồng bộ Drive.', 'err');
    return;
  }
  const payload = buildBackupPayload();
  const content = JSON.stringify(payload, null, 2);
  // Tìm fileId (nếu chưa biết) bằng API Key trước - đỡ phải xin token chỉ
  // để tìm; token chỉ thật sự cần cho bước ghi (tạo/cập nhật) ngay sau đây.
  let fileId = cfg.fileId || null;
  if (!fileId && cfg.apiKey) {
    try { fileId = await findSyncFileIdByApiKey(cfg.apiKey, cfg.folderId); }
    catch (e) { /* folder có thể riêng tư - để nhánh OAuth bên dưới tự tìm lại */ }
  }
  if (!fileId) fileId = await findSyncFileId(cfg.folderId);
  if (fileId) { await updateSyncFile(fileId, content); }
  else { fileId = await createSyncFile(cfg.folderId, content); }
  cfg.fileId = fileId;
  saveSyncConfig(cfg);
  localStorage.setItem(LS_KEY_SYNC_PUSHED_TS, String(Date.parse(payload.exportedAt) || Date.now()));
  if (manual) toast('✓ Đã đồng bộ lên Google Drive.', 'ok');
  updateSyncStatusUI();
}

async function pullBackupFromDrive(manual) {
  const cfg = getSyncConfig();
  if (!cfg.enabled || !cfg.folderId) {
    if (manual) toast('Chưa bật đồng bộ Drive.', 'err');
    return false;
  }

  // Luồng ĐỌC: ưu tiên dùng API Key công khai trước - không cần đăng nhập,
  // chạy được ngay cả lần đầu tiên mở trang trên 1 máy/trình duyệt mới.
  // Chỉ khi cách này thất bại (vd. người dùng tự đổi sang 1 folder riêng
  // tư qua wizard) mới rơi về luồng OAuth (cần đã đăng nhập/cấp quyền).
  let fileId = cfg.fileId || null;
  let data = null;
  let usedApiKey = false;
  if (cfg.apiKey) {
    try {
      if (!fileId) fileId = await findSyncFileIdByApiKey(cfg.apiKey, cfg.folderId);
      if (fileId) {
        data = await downloadSyncFileByApiKey(cfg.apiKey, fileId);
        usedApiKey = true;
      }
    } catch (e) {
      console.warn('Đọc bằng API Key thất bại, thử lại bằng tài khoản đã đăng nhập:', e && e.message);
      fileId = cfg.fileId || null; // reset, để nhánh OAuth tự tìm lại nếu cần
    }
  }
  if (!usedApiKey) {
    try {
      if (!fileId) fileId = await findSyncFileId(cfg.folderId);
      if (fileId) data = await downloadSyncFile(fileId);
    } catch (e) {
      // Chỉ báo lỗi khi người dùng chủ động bấm nút - lúc tự động chạy nền
      // lúc mở trang thì im lặng bỏ qua, tránh hiện popup đăng nhập phiền.
      if (manual) throw e;
      console.warn('Không tự đồng bộ được từ Drive (cần đăng nhập):', e && e.message);
      return false;
    }
  }

  if (!fileId || !data) {
    if (manual) toast('Chưa có file đồng bộ nào trên Drive - hãy bấm "Đồng bộ ngay" trước.', 'err');
    return false;
  }
  cfg.fileId = fileId;
  saveSyncConfig(cfg);
  const remoteTs = (data && data.exportedAt) ? Date.parse(data.exportedAt) : 0;
  const localTs = Number(localStorage.getItem(LS_KEY_SYNC_LOCAL_TS) || 0);
  if (manual || remoteTs > localTs) {
    applyBackupPayload(data);
    localStorage.setItem(LS_KEY_SYNC_LOCAL_TS, String(remoteTs || Date.now()));
    localStorage.setItem(LS_KEY_SYNC_PUSHED_TS, String(remoteTs || Date.now()));
    if (manual) toast('✓ Đã áp dụng bản đồng bộ từ Drive. Đang tải lại...', 'ok');
    setTimeout(function () { location.reload(); }, 800);
    return true;
  }
  return false;
}

// Gọi lúc khởi động app: nếu đã bật đồng bộ và có bản trên Drive mới hơn
// bản trên máy này, tự áp dụng luôn (không cần bấm gì).
async function tryAutoRestoreFromDrive() {
  const cfg = getSyncConfig();
  if (!cfg.enabled || !cfg.folderId) return;
  try {
    await pullBackupFromDrive(false);
  } catch (e) {
    console.warn('Không tự đồng bộ được từ Drive lúc khởi động:', e && e.message);
  }
}

function updateSyncStatusUI() {
  const box = document.getElementById('syncStatusBox');
  const activeActions = document.getElementById('syncActiveActions');
  const enableBtn = document.getElementById('syncEnableBtn');
  if (!box) return;
  const cfg = getSyncConfig();
  if (cfg.enabled) {
    const pushedTs = Number(localStorage.getItem(LS_KEY_SYNC_PUSHED_TS) || 0);
    const lastText = pushedTs ? new Date(pushedTs).toLocaleString('vi-VN') : 'chưa lần nào';
    const readNote = cfg.apiKey
      ? 'Đọc tự động bằng API Key - không cần đăng nhập.'
      : 'Folder này cần đăng nhập Google mới đọc được (không có API Key công khai).';
    box.innerHTML = '✅ Đang bật - Folder: <b>' + escapeHtml(cfg.folderLink) + '</b><br>' +
      readNote + ' Ghi (Đồng bộ ngay) luôn cần đăng nhập 1 lần/máy.<br>' +
      'Lần đồng bộ gần nhất: ' + escapeHtml(lastText);
    if (activeActions) activeActions.classList.remove('hidden');
    if (enableBtn) enableBtn.classList.add('hidden');
  } else {
    box.innerHTML = 'Chưa bật đồng bộ tự động.';
    if (activeActions) activeActions.classList.add('hidden');
    if (enableBtn) enableBtn.classList.remove('hidden');
  }
}

document.getElementById('syncNowBtn')?.addEventListener('click', function () {
  pushBackupToDrive(true).catch(function (e) { toast('✗ Đồng bộ lỗi: ' + (e.message || String(e)), 'err'); });
});
document.getElementById('syncPullBtn')?.addEventListener('click', function () {
  pullBackupFromDrive(true).catch(function (e) { toast('✗ Kéo dữ liệu lỗi: ' + (e.message || String(e)), 'err'); });
});
document.getElementById('syncDisableBtn')?.addEventListener('click', function () {
  const cfg = getSyncConfig();
  cfg.enabled = false;
  saveSyncConfigWithoutBump(cfg);
  toast('Đã tắt đồng bộ tự động (file trên Drive vẫn còn, chỉ ngừng tự đẩy/kéo).', 'ok');
  updateSyncStatusUI();
});
// saveSyncConfig không nên tự kích hoạt bumpLocalChangeTs (không liên quan
// nội dung cấu hình phim), nên tách riêng để rõ ràng ý định.
function saveSyncConfigWithoutBump(cfg) { saveSyncConfig(cfg); }

// ================= WIZARD BẬT ĐỒNG BỘ DRIVE =================
const syncWizard = document.getElementById('syncWizard');
let syncWizardData = { folderLink: '', folderId: '' };

function syncWizardShowStep(step) {
  syncWizard.querySelectorAll('.wizard-panel').forEach(function (p) {
    p.classList.toggle('hidden', Number(p.dataset.spanel) !== step);
  });
  syncWizard.querySelectorAll('[data-swstep]').forEach(function (p) {
    const n = Number(p.dataset.swstep);
    p.classList.toggle('active', n === step);
    p.classList.toggle('done', n < step);
  });
}

document.getElementById('syncEnableBtn')?.addEventListener('click', function () {
  syncWizardData = { folderLink: '', folderId: '' };
  const input = document.getElementById('syncFolderLink');
  if (input) input.value = '';
  const loginStatus = document.getElementById('syncLoginStatus');
  if (loginStatus) loginStatus.textContent = '';
  const testStatus = document.getElementById('syncTestStatus');
  if (testStatus) testStatus.textContent = '';
  const finishBtn = document.getElementById('syncFinishBtn');
  if (finishBtn) finishBtn.disabled = true;
  syncWizardShowStep(1);
  syncWizard.classList.remove('hidden');
  syncWizard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
document.getElementById('closeSyncWizardBtn')?.addEventListener('click', function () {
  syncWizard.classList.add('hidden');
});

document.getElementById('syncStep1Next')?.addEventListener('click', function () {
  const link = document.getElementById('syncFolderLink').value.trim();
  if (!link) { toast('Hãy dán link folder Drive.', 'err'); return; }
  const folderId = extractFolderId(link);
  if (!folderId) { toast('Không nhận ra được folder ID từ link này.', 'err'); return; }
  syncWizardData.folderLink = link;
  syncWizardData.folderId = folderId;
  syncWizardShowStep(2);
});

document.getElementById('syncLoginBtn')?.addEventListener('click', async function () {
  const status = document.getElementById('syncLoginStatus');
  if (status) status.textContent = '⏳ Đang mở màn hình đăng nhập Google...';
  try {
    await requestSyncAccessToken();
    if (status) status.textContent = '✓ Đã cấp quyền Google Drive.';
    syncWizardShowStep(3);
  } catch (e) {
    if (status) status.textContent = '✗ ' + (e.message || String(e));
  }
});

document.getElementById('syncTestBtn')?.addEventListener('click', async function () {
  const status = document.getElementById('syncTestStatus');
  const finishBtn = document.getElementById('syncFinishBtn');
  if (status) status.textContent = '⏳ Đang kiểm tra quyền ghi vào folder...';
  if (finishBtn) finishBtn.disabled = true;
  try {
    const payload = buildBackupPayload();
    const content = JSON.stringify(payload, null, 2);
    let fileId = await findSyncFileId(syncWizardData.folderId);
    if (fileId) { await updateSyncFile(fileId, content); }
    else { fileId = await createSyncFile(syncWizardData.folderId, content); }
    syncWizardData.fileId = fileId;
    if (status) status.textContent = '✓ Ghi thử thành công - file "' + SYNC_BACKUP_FILENAME + '" đã có trong folder.';
    if (finishBtn) finishBtn.disabled = false;
  } catch (e) {
    if (status) status.textContent = '✗ Ghi thử thất bại: ' + (e.message || String(e)) + ' (kiểm tra lại bạn đã đăng nhập đúng tài khoản có quyền chỉnh sửa folder này chưa).';
  }
});

document.getElementById('syncFinishBtn')?.addEventListener('click', function () {
  // Nếu folder vừa chọn trùng với 1 trong các tài khoản video đã cấu hình,
  // tái dùng luôn apiKey của tài khoản đó - nhờ vậy vẫn ĐỌC được không cần
  // đăng nhập ở các lần mở sau (chỉ cần đăng nhập lại khi thật sự GHI).
  // Nếu là 1 folder hoàn toàn khác (vd. riêng tư), để trống - app sẽ tự
  // dùng luôn tài khoản đã đăng nhập ở bước 2 cho việc đọc lẫn ghi.
  const matchedAccount = getAccounts().find(function (a) {
    return extractFolderId(a.folderLink) === syncWizardData.folderId;
  });
  const cfg = {
    enabled: true,
    folderLink: syncWizardData.folderLink,
    folderId: syncWizardData.folderId,
    apiKey: matchedAccount ? matchedAccount.apiKey : '',
    fileId: syncWizardData.fileId || ''
  };
  saveSyncConfigWithoutBump(cfg);
  localStorage.setItem(LS_KEY_SYNC_PUSHED_TS, String(Date.now()));
  syncWizard.classList.add('hidden');
  updateSyncStatusUI();
  toast('✓ Đã bật đồng bộ tự động qua Google Drive.', 'ok');
});

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
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

// ---------------- Nhận diện loại file ----------------

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv'];
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'flac', 'aac', 'wma', 'opus', 'oga'];
const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'];

function getExtension(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function getBaseName(name) {
  return (name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

function isVideoFile(file) {
  if (file.mimeType && file.mimeType.indexOf('video/') === 0) return true;
  return VIDEO_EXTENSIONS.includes(getExtension(file.name));
}

// File nhạc/âm thanh (mp3, m4a, wav, flac...) - phát được y như video,
// chỉ khác là không có hình, dùng icon nốt nhạc thay thế.
function isAudioFile(file) {
  if (file.mimeType && file.mimeType.indexOf('audio/') === 0) return true;
  return AUDIO_EXTENSIONS.includes(getExtension(file.name));
}

function isPlayableMediaFile(file) {
  return isVideoFile(file) || isAudioFile(file);
}

function isSubtitleFile(file) {
  return SUBTITLE_EXTENSIONS.includes(getExtension(file.name));
}

// ---------------- Quét toàn bộ file trong 1 folder Drive ----------------

async function listFolderFiles(apiKey, folderId) {
  let files = [];
  let pageToken = '';

  do {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
    let url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
      '&fields=' + encodeURIComponent('nextPageToken, files(id,name,mimeType,thumbnailLink,createdTime)') +
      '&orderBy=' + encodeURIComponent('name') +
      '&pageSize=1000&key=' + encodeURIComponent(apiKey);
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

// ================= ĐỒNG BỘ FOLDER GIỮA CÁC TÀI KHOẢN (copy file) =================
// Copy toàn bộ video + phụ đề còn THIẾU từ 1 folder (tài khoản nguồn) sang
// 1 folder khác (tài khoản đích), để 2 tài khoản có cùng bộ phim -> tính
// năng dự phòng (nhảy tài khoản khi hết quota) mới thật sự có tác dụng.
//
// Cách hoạt động: dùng API Key (đọc, không cần đăng nhập) để liệt kê file
// ở folder NGUỒN - vì folder đó đã để "Bất kỳ ai có link". Sau đó đăng
// nhập bằng CHÍNH TÀI KHOẢN ĐÍCH (chọn đúng account đó ở màn hình Google
// hiện ra) rồi gọi Drive API "files.copy" - Google copy thẳng file từ
// folder nguồn (chỉ cần có quyền xem) sang folder đích, ngay trên server
// của Google - web KHÔNG tải video về máy rồi tải lên lại, nên dù phim
// nặng vài GB cũng không tốn băng thông hay pin của máy đang mở trang.

let copyAccessToken = null;
let copyTokenClient = null;
let copyTokenExpiresAt = 0;

function requestCopyAccessToken(promptMode) {
  return new Promise(function (resolve, reject) {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      reject(new Error('Thư viện đăng nhập Google chưa sẵn sàng, hãy thử lại sau vài giây.'));
      return;
    }
    if (!copyTokenClient) {
      try {
        copyTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: OAUTH_CLIENT_ID,
          scope: SYNC_OAUTH_SCOPE,
          callback: function () {}
        });
      } catch (e) { reject(e); return; }
    }
    copyTokenClient.callback = function (response) {
      if (response && response.access_token) {
        copyAccessToken = response.access_token;
        copyTokenExpiresAt = Date.now() + ((response.expires_in || 3600) * 1000);
        resolve(copyAccessToken);
      } else {
        reject(new Error('Không nhận được quyền truy cập Google Drive.'));
      }
    };
    copyTokenClient.error_callback = function (err) {
      reject(new Error((err && err.type) || 'Đăng nhập/cấp quyền Google Drive thất bại hoặc bị huỷ.'));
    };
    try {
      // Mặc định luôn hiện màn hình chọn tài khoản (select_account) - vì
      // thao tác này CẦN đăng nhập ĐÚNG tài khoản ĐÍCH, có thể khác với
      // tài khoản đã đăng nhập cho tính năng Đồng bộ Drive (JSON) ở trên.
      copyTokenClient.requestAccessToken(promptMode === undefined ? { prompt: 'select_account' } : { prompt: promptMode });
    } catch (e) { reject(e); }
  });
}

async function copyApiFetch(url, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + copyAccessToken });
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); msg = (j && j.error && j.error.message) || msg; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

async function copyFileToFolder(fileId, destFolderId, name) {
  const body = { parents: [destFolderId] };
  if (name) body.name = name;
  const res = await copyApiFetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/copy?fields=id,name',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  return res.json();
}

// sourceAcc/destAcc: {label, apiKey, folderLink}. onProgress(evt) được gọi
// liên tục để cập nhật UI - evt.phase: 'login' | 'listing' | 'copying' | 'done'.
// Trả về { total, copied, skipped, errors[] }.
async function syncFolderContents(sourceAcc, destAcc, onProgress) {
  const notify = onProgress || function () {};
  const sourceFolderId = extractFolderId(sourceAcc.folderLink);
  const destFolderId = extractFolderId(destAcc.folderLink);
  if (!sourceAcc.apiKey || !sourceFolderId) throw new Error('Tài khoản nguồn thiếu API Key hoặc link folder.');
  if (!destFolderId) throw new Error('Tài khoản đích thiếu link folder.');
  if (sourceFolderId === destFolderId) throw new Error('Folder nguồn và đích đang trùng nhau.');

  notify({ phase: 'listing' });
  const sourceFiles = await listFolderFiles(sourceAcc.apiKey, sourceFolderId);
  let destFiles = [];
  try {
    // Ưu tiên đọc danh sách đích bằng API Key (nếu có) để khỏi cần đăng
    // nhập chỉ để kiểm tra file nào đã có sẵn - đỡ 1 bước xin quyền.
    if (destAcc.apiKey) destFiles = await listFolderFiles(destAcc.apiKey, destFolderId);
  } catch (e) { /* folder đích có thể riêng tư/không đọc được bằng key - bỏ qua, coi như trống */ }
  const destNames = new Set(destFiles.map(function (f) { return f.name; }));

  const toCopy = sourceFiles.filter(function (f) { return !destNames.has(f.name); });
  if (toCopy.length === 0) {
    notify({ phase: 'done', total: 0, done: 0, errors: [] });
    return { total: 0, copied: 0, skipped: sourceFiles.length, errors: [] };
  }

  notify({ phase: 'login' });
  await requestCopyAccessToken('select_account');

  const errors = [];
  let done = 0;
  const total = toCopy.length;
  for (const f of toCopy) {
    notify({ phase: 'copying', done: done, total: total, name: f.name });
    try {
      await copyFileToFolder(f.id, destFolderId, f.name);
    } catch (e) {
      errors.push(f.name + ': ' + (e.message || String(e)));
    }
    done++;
  }
  notify({ phase: 'done', total: total, done: done, errors: errors });
  return { total: total, copied: total - errors.length, skipped: sourceFiles.length - toCopy.length, errors: errors };
}


// rồi GỘP các video trùng TÊN PHIM (bỏ dấu, không phân biệt hoa/thường)
// thành 1 mục duy nhất có nhiều "nguồn" (sources). Khi phát, app sẽ thử
// lần lượt từng nguồn - nếu tài khoản này bị giới hạn (quota/403) sẽ tự
// nhảy sang tài khoản khác phát cùng phim đó, không cần người xem làm
// gì thêm. Trả về mảng video, mỗi video có dạng:
//   { key, originalTitle, thumbnail, createdTime, sources: [
//       { accountLabel, apiKey, fileId, subtitleFileId, subtitleExt }, ...
//   ] }
async function fetchFolderVideos(accounts) {
  const merged = {};  // key (tên phim đã chuẩn hoá) -> video gộp
  const order = [];   // giữ đúng thứ tự phim xuất hiện lần đầu
  const errors = [];  // lỗi riêng của từng tài khoản (không làm hỏng cả danh sách)

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (!acc || !acc.apiKey || !acc.folderLink) continue;
    const accLabel = acc.label || ('Tài khoản ' + (i + 1));
    const folderId = extractFolderId(acc.folderLink);

    let files;
    try {
      files = await listFolderFiles(acc.apiKey, folderId);
    } catch (err) {
      // 1 tài khoản bị lỗi (sai key, hết quota liệt kê, folder riêng
      // tư...) không nên làm mất luôn danh sách của các tài khoản còn
      // lại - ghi nhận lỗi rồi bỏ qua, quét tiếp tài khoản kế.
      errors.push(accLabel + ': ' + err.message);
      continue;
    }

    const videoFiles = files.filter(isPlayableMediaFile);
    const subtitleFiles = files.filter(isSubtitleFile);
    const subtitleByBase = {};
    subtitleFiles.forEach(function (f) { subtitleByBase[getBaseName(f.name)] = f; });

    videoFiles.forEach(function (f) {
      const baseName = getBaseName(f.name);
      const key = normalizeForSearch(baseName);
      const sub = subtitleByBase[baseName];

      const source = {
        accountLabel: accLabel,
        apiKey: acc.apiKey,
        fileId: f.id,
        subtitleFileId: sub ? sub.id : null,
        subtitleExt: sub ? getExtension(sub.name) : null
      };

      if (!merged[key]) {
        merged[key] = {
          key: key,
          originalTitle: baseName,
          mimeType: f.mimeType || '',
          mediaType: isAudioFile(f) ? 'audio' : 'video',
          thumbnail: f.thumbnailLink || null,
          createdTime: f.createdTime || null,
          sources: [source]
        };
        order.push(key);
      } else {
        merged[key].sources.push(source);
        if (!merged[key].thumbnail && f.thumbnailLink) merged[key].thumbnail = f.thumbnailLink;
      }
    });
  }

  if (order.length === 0 && errors.length > 0) {
    // Không quét được bất kỳ tài khoản nào -> báo lỗi rõ ràng thay vì
    // âm thầm trả về danh sách rỗng.
    throw new Error(errors.join(' | '));
  }

  const videos = order.map(function (k) { return merged[k]; });
  videos._partialErrors = errors; // để loadVideos() có thể cảnh báo nhẹ nếu muốn
  return videos;
}

// ---------------- Chuyển .srt sang .vtt ----------------

function srtToVtt(srtText) {
  let text = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + text;
}

// ---------------- Chuyển .ass/.ssa sang .vtt ----------------

// Đổi mốc thời gian kiểu ASS "0:00:01.23" (H:MM:SS.cc, cc = centgiây)
// sang mốc thời gian kiểu VTT "00:00:01.230" (HH:MM:SS.mmm).
function assTimeToVtt(t) {
  const m = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/.exec(t.trim());
  if (!m) return '00:00:00.000';
  const h = String(m[1]).padStart(2, '0');
  const mm = m[2];
  const ss = m[3];
  const ms = m[4] + '0'; // centigiây (2 chữ số) -> mili giây (3 chữ số)
  return h + ':' + mm + ':' + ss + '.' + ms;
}

// Bóc sạch các mã định dạng riêng của ASS trong nội dung câu thoại,
// ví dụ {\an8}, {\pos(400,300)}, {\c&H0000FF&}... và đổi \N, \n, \h
// thành xuống dòng / khoảng trắng cho dễ đọc trên phụ đề thường.
function cleanAssText(text) {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .trim();
}

function assToVtt(assText) {
  const raw = assText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');

  let inEvents = false;
  let fields = [];
  let idxStart = -1, idxEnd = -1, idxText = -1;
  const cues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\[.+\]$/.test(trimmed)) {
      inEvents = /^\[Events\]$/i.test(trimmed);
      continue;
    }
    if (!inEvents) continue;

    if (/^Format:/i.test(trimmed)) {
      fields = trimmed.substring(trimmed.indexOf(':') + 1).split(',').map(function (s) { return s.trim().toLowerCase(); });
      idxStart = fields.indexOf('start');
      idxEnd = fields.indexOf('end');
      idxText = fields.indexOf('text');
      continue;
    }

    if (/^Dialogue:/i.test(trimmed) && idxText !== -1) {
      const body = trimmed.substring(trimmed.indexOf(':') + 1);
      // Text là trường cuối cùng và có thể chứa dấu phẩy, nên chỉ tách
      // đúng số trường đứng trước nó, phần còn lại giữ nguyên làm text.
      const parts = body.split(',');
      if (parts.length <= idxText) continue;
      const head = parts.slice(0, idxText);
      const textPart = parts.slice(idxText).join(',');

      const start = idxStart !== -1 ? assTimeToVtt(head[idxStart]) : null;
      const end = idxEnd !== -1 ? assTimeToVtt(head[idxEnd]) : null;
      const text = cleanAssText(textPart);

      if (start && end && text) {
        cues.push({ start: start, end: end, text: text });
      }
    }
  }

  let vtt = 'WEBVTT\n\n';
  cues.forEach(function (cue, i) {
    vtt += (i + 1) + '\n' + cue.start + ' --> ' + cue.end + '\n' + cue.text + '\n\n';
  });
  return vtt;
}

async function buildSubtitleUrl(source) {
  if (!source || !source.subtitleFileId) return null;
  const res = await fetch(streamUrl(source.subtitleFileId, source.apiKey));
  if (!res.ok) return null;
  let text = await res.text();
  if (source.subtitleExt === 'srt') text = srtToVtt(text);
  else if (source.subtitleExt === 'ass' || source.subtitleExt === 'ssa') text = assToVtt(text);
  else if (!/^WEBVTT/.test(text.trim())) text = 'WEBVTT\n\n' + text;
  const blob = new Blob([text], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

// ---------------- Screen switching ----------------

function showScreen(name) {
  gridScreen.classList.add('hidden');
  playerScreen.classList.add('hidden');
  if (name === 'grid') gridScreen.classList.remove('hidden');
  if (name === 'player') playerScreen.classList.remove('hidden');
}

// ---------------- Kiểu xem: lưới / danh sách ----------------

function getSavedView() {
  return localStorage.getItem(LS_KEY_VIEW) === 'list' ? 'list' : 'grid';
}

function applyView(view) {
  videoGrid.classList.toggle('list-view', view === 'list');
  if (viewToggleBtn) viewToggleBtn.textContent = view === 'list' ? '☰' : '▦';
}

if (viewToggleBtn) {
  applyView(getSavedView());
  viewToggleBtn.addEventListener('click', function () {
    const next = videoGrid.classList.contains('list-view') ? 'grid' : 'list';
    localStorage.setItem(LS_KEY_VIEW, next);
    applyView(next);
  });
}

// ---------------- Chọn nhiều video (thao tác hàng loạt) ----------------

function updateBulkBar() {
  if (!bulkBar) return;
  bulkBar.classList.toggle('hidden', !bulkModeActive);
  videoGrid.classList.toggle('select-mode', bulkModeActive);
  bulkCount.textContent = selectedKeys.size + ' video đã chọn';
}

if (selectModeBtn) {
  selectModeBtn.addEventListener('click', function () {
    bulkModeActive = !bulkModeActive;
    selectModeBtn.classList.toggle('active-toggle', bulkModeActive);
    if (!bulkModeActive) selectedKeys.clear();
    updateBulkBar();
    applyFilters();
  });
}

if (bulkCancelBtn) {
  bulkCancelBtn.addEventListener('click', function () {
    bulkModeActive = false;
    selectedKeys.clear();
    if (selectModeBtn) selectModeBtn.classList.remove('active-toggle');
    updateBulkBar();
    applyFilters();
  });
}

if (bulkFavBtn) {
  bulkFavBtn.addEventListener('click', function () {
    if (selectedKeys.size === 0) { toast('Chưa chọn video nào.'); return; }
    selectedKeys.forEach(function (key) { setMeta(key, { favorite: true }); });
    toast('Đã thêm ' + selectedKeys.size + ' video vào Yêu thích.', 'ok');
    selectedKeys.clear();
    updateBulkBar();
    applyFilters();
  });
}

if (bulkHideBtn) {
  bulkHideBtn.addEventListener('click', function () {
    if (selectedKeys.size === 0) { toast('Chưa chọn video nào.'); return; }
    selectedKeys.forEach(function (key) {
      const meta = getMeta(key);
      setMeta(key, { hidden: !meta.hidden });
    });
    toast('Đã ẩn/hiện ' + selectedKeys.size + ' video.', 'ok');
    selectedKeys.clear();
    updateBulkBar();
    applyFilters();
  });
}

// ---------------- Cấu hình nhiều tài khoản (dòng động trong modal) ----------------

let accountDraftRows = []; // [{label, apiKey, folderLink}] đang chỉnh trong modal, chưa lưu

// ---------------- Chuyển tab trong màn hình Cấu hình ----------------

function switchSettingsTab(name) {
  document.querySelectorAll('.settings-tab').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.settingsTab === name);
  });
  document.querySelectorAll('.settings-panel-content').forEach(function (panel) {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== name);
  });
  if (name === 'backup') renderBackupStats();
  if (name === 'sync') updateSyncStatusUI();
  if (name === 'accounts') populateFolderSyncSelects();
}

document.getElementById('settingsTabs')?.addEventListener('click', function (e) {
  const btn = e.target.closest('.settings-tab');
  if (!btn) return;
  switchSettingsTab(btn.dataset.settingsTab);
});

// ---------------- Sao lưu & khôi phục cấu hình ----------------

function renderBackupStats() {
  const el = document.getElementById('backupStats');
  if (!el) return;
  const metaStore = getMetaStore();
  const values = Object.values(metaStore);
  const favCount = values.filter(function (m) { return m.favorite; }).length;
  const hiddenCount = values.filter(function (m) { return m.hidden; }).length;
  const noteCount = values.filter(function (m) { return m.note; }).length;
  el.innerHTML =
    '<div class="stat-box"><span class="stat-num">' + getAccounts().length + '</span><span class="stat-label">Tài khoản</span></div>' +
    '<div class="stat-box"><span class="stat-num">' + allVideos.length + '</span><span class="stat-label">Video hiện có</span></div>' +
    '<div class="stat-box"><span class="stat-num">' + favCount + '</span><span class="stat-label">Yêu thích</span></div>' +
    '<div class="stat-box"><span class="stat-num">' + hiddenCount + '</span><span class="stat-label">Đã ẩn</span></div>' +
    '<div class="stat-box"><span class="stat-num">' + noteCount + '</span><span class="stat-label">Có ghi chú</span></div>';
}

document.getElementById('exportConfigBtn')?.addEventListener('click', function () {
  const data = buildBackupPayload();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  a.href = url;
  a.download = 'dethidrivetv-backup-' + stamp + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  toast('Đã xuất file sao lưu.', 'ok');
});

document.getElementById('importConfigInput')?.addEventListener('change', function (e) {
  const file = e.target.files && e.target.files[0];
  const backupMsg = document.getElementById('backupMsg');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const data = JSON.parse(String(reader.result));
      applyBackupPayload(data);
      if (backupMsg) backupMsg.textContent = '✓ Đã khôi phục cấu hình. Đang tải lại...';
      toast('Khôi phục thành công. Đang tải lại trang...', 'ok');
      setTimeout(function () { location.reload(); }, 900);
    } catch (err) {
      if (backupMsg) backupMsg.textContent = '';
      toast('Lỗi đọc file sao lưu: ' + (err.message || String(err)), 'err');
    }
  };
  reader.readAsText(file);
});

// ================= ACCOUNT SETUP WIZARD =================
const accountWizard = document.getElementById('accountWizard');
const closeAccountWizardBtn = document.getElementById('closeAccountWizardBtn');
const wizardGoogleAccount = document.getElementById('wizardGoogleAccount');
const wizardAccountLabel = document.getElementById('wizardAccountLabel');
const wizardFolderAccountLabel = document.getElementById('wizardFolderAccountLabel');
const wizardApiKey = document.getElementById('wizardApiKey');
const wizardApiStatus = document.getElementById('wizardApiStatus');
const wizardFolderLink = document.getElementById('wizardFolderLink');
const wizardAccountLabelInput = document.getElementById('wizardAccountLabelInput');
const wizardFolderStatus = document.getElementById('wizardFolderStatus');
const wizardStep5Next = document.getElementById('wizardStep5Next');
const wizardSummary = document.getElementById('wizardSummary');

let accountWizardStep = 1;
let accountWizardData = {
  googleAccount: '',
  label: '',
  apiKey: '',
  folderLink: '',
  folderOk: false,
  videoCount: 0
};

function wizardShowStep(step) {
  accountWizardStep = step;
  accountWizard.querySelectorAll('.wizard-panel').forEach(function(p) {
    p.classList.toggle('hidden', Number(p.dataset.panel) !== step);
  });
  accountWizard.querySelectorAll('[data-wstep]').forEach(function(p) {
    const n = Number(p.dataset.wstep);
    p.classList.toggle('active', n === step);
    p.classList.toggle('done', n < step);
  });
}

function openAccountWizard() {
  accountWizardData = { googleAccount:'', label:'', apiKey:'', folderLink:'', folderOk:false, videoCount:0 };
  wizardGoogleAccount.value = '';
  wizardApiKey.value = '';
  wizardAccountLabelInput.value = '';
  wizardFolderLink.value = '';
  wizardApiStatus.textContent = '';
  wizardFolderStatus.textContent = '';
  const fcd = document.getElementById('wizardFolderCreatedDone'); if (fcd) fcd.checked = false;
  const fsd = document.getElementById('wizardFolderSharedDone'); if (fsd) fsd.checked = false;
  const copyBox = document.getElementById('wizardCopyBox'); if (copyBox) copyBox.classList.add('hidden');
  const copyStatus = document.getElementById('wizardCopyStatus'); if (copyStatus) copyStatus.textContent = '';
  const quickName = document.getElementById('wizardQuickFolderName'); if (quickName) quickName.value = 'Phim';
  const quickStatus = document.getElementById('wizardQuickStatus'); if (quickStatus) quickStatus.textContent = '';
  const consentDone = document.getElementById('wizardConsentOpenedDone'); if (consentDone) consentDone.checked = false;
  const testUserDone = document.getElementById('wizardTestUserAddedDone'); if (testUserDone) testUserDone.checked = false;
  const testLoginStatus = document.getElementById('wizardTestLoginStatus'); if (testLoginStatus) testLoginStatus.textContent = '';
  wizardStep5Next.disabled = true;
  wizardShowStep(1);
  accountWizard.classList.remove('hidden');
  wizardGoogleAccount.focus();
  accountWizard.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeAccountWizard() {
  accountWizard.classList.add('hidden');
}

document.getElementById('addAccountBtn')?.addEventListener('click', openAccountWizard);
closeAccountWizardBtn?.addEventListener('click', closeAccountWizard);

document.getElementById('wizardStep1Next')?.addEventListener('click', function() {
  const email = wizardGoogleAccount.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast('Vui lòng nhập đúng Google Account/Gmail của tài khoản mới.', 'err');
    return;
  }
  accountWizardData.googleAccount = email;
  wizardAccountLabel.textContent = email;
  wizardFolderAccountLabel.textContent = email;
  ['wizardTestUserAccountLabel', 'wizardTestUserAccountLabel2', 'wizardTestUserAccountLabel3', 'wizardQuickAccountLabel', 'wizardQuickAccountLabel2'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.textContent = email;
  });
  wizardShowStep(2);
});

document.getElementById('wizardCloudBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardProjectBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/projectcreate', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardStep2Next')?.addEventListener('click', function() {
  if (!document.getElementById('wizardProjectDone').checked) {
    toast('Hãy xác nhận bạn đã chọn/tạo Project bằng Google Account mới.', 'err');
    return;
  }
  wizardShowStep(3);
});
document.getElementById('wizardDriveApiBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/apis/library/drive.googleapis.com', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardStep3Next')?.addEventListener('click', function() {
  if (!document.getElementById('wizardDriveApiDone').checked) {
    toast('Hãy xác nhận Google Drive API đã được bật.', 'err');
    return;
  }
  wizardShowStep(4);
});
document.getElementById('wizardCredentialsBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/apis/credentials', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardStep4Next')?.addEventListener('click', function() {
  const key = wizardApiKey.value.trim();
  if (!key || key.length < 20) {
    wizardApiStatus.textContent = '⚠ API Key chưa được nhập đầy đủ.';
    return;
  }
  accountWizardData.apiKey = key;
  wizardApiStatus.textContent = '✓ Đã nhận API Key. Key này sẽ được lưu riêng cho ' + accountWizardData.googleAccount + '.';
  wizardShowStep(5);
});

document.getElementById('wizardOpenDriveBtn')?.addEventListener('click', function() {
  window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener,noreferrer');
});

document.getElementById('wizardOpenConsentBtn')?.addEventListener('click', function() {
  // Số project được lấy từ chính OAUTH_CLIENT_ID (phần trước dấu "-") để
  // Google Cloud Console tự mở đúng project sở hữu OAuth client này.
  const projectNumber = (OAUTH_CLIENT_ID.split('-')[0] || '').trim();
  const url = projectNumber
    ? 'https://console.cloud.google.com/apis/credentials/consent?project=' + encodeURIComponent(projectNumber)
    : 'https://console.cloud.google.com/apis/credentials/consent';
  window.open(url, '_blank', 'noopener,noreferrer');
});

document.getElementById('wizardTestLoginBtn')?.addEventListener('click', async function () {
  const statusEl = document.getElementById('wizardTestLoginStatus');
  this.disabled = true;
  if (statusEl) statusEl.textContent = '⏳ Đang mở màn hình đăng nhập Google - hãy chọn đúng account ' + (accountWizardData.googleAccount || 'mới') + '...';
  try {
    await requestCopyAccessToken('select_account');
    if (statusEl) statusEl.textContent = '✓ Đăng nhập thành công! Account này đã dùng được nút "⚡ Tự tạo folder + Đồng bộ ngay" và "Copy video từ" bên dưới rồi.';
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (statusEl) {
      if (/access_denied|disallowed|blocked/i.test(msg)) {
        statusEl.textContent = '✗ Vẫn bị chặn (access_denied). Hãy kiểm tra lại: (1) Bước B mở ĐÚNG project bằng ĐÚNG account gốc, (2) Bước C đã Save đúng email ' + (accountWizardData.googleAccount || '') + ' vào Test users chưa. Google có thể mất 1-2 phút để cập nhật - đợi rồi bấm kiểm tra lại.';
      } else if (/popup_closed|closed the popup|user did not/i.test(msg)) {
        statusEl.textContent = '⚠ Cửa sổ đăng nhập bị đóng trước khi hoàn tất - hãy bấm lại nút này, chọn tài khoản và bấm Cho phép đến cùng.';
      } else {
        statusEl.textContent = '✗ Lỗi: ' + msg + ' - hãy thử bấm lại, hoặc kiểm tra lại các Bước A-C ở trên.';
      }
    }
  } finally {
    this.disabled = false;
  }
});

document.getElementById('wizardCheckFolderBtn')?.addEventListener('click', async function() {
  if (!document.getElementById('wizardFolderCreatedDone').checked) {
    wizardFolderStatus.textContent = '⚠ Hãy xác nhận bạn đã tạo folder mới trên Drive.';
    return;
  }
  if (!document.getElementById('wizardFolderSharedDone').checked) {
    wizardFolderStatus.textContent = '⚠ Hãy xác nhận bạn đã chia sẻ folder "Bất kỳ ai có đường liên kết" và chọn quyền phù hợp.';
    return;
  }
  const label = wizardAccountLabelInput.value.trim();
  const folder = wizardFolderLink.value.trim();
  if (!label) {
    wizardFolderStatus.textContent = '⚠ Hãy nhập tên hiển thị cho account.';
    return;
  }
  if (!folder) {
    wizardFolderStatus.textContent = '⚠ Hãy nhập link folder Google Drive.';
    return;
  }
  wizardFolderStatus.textContent = '⏳ Đang kiểm tra folder...';
  wizardStep5Next.disabled = true;

  try {
    const folderId = extractFolderId(folder);
    const files = await listFolderFiles(accountWizardData.apiKey, folderId);
    const count = files.filter(isPlayableMediaFile).length;
    accountWizardData.label = label;
    accountWizardData.folderLink = folder;
    accountWizardData.folderOk = true;
    accountWizardData.videoCount = count;
    wizardFolderStatus.textContent = '✓ OK — tìm thấy ' + count + ' video trong folder.';
    wizardStep5Next.disabled = false;
    const copyBox = document.getElementById('wizardCopyBox');
    if (copyBox) { copyBox.classList.remove('hidden'); populateFolderSyncSelects(); }
  } catch (err) {
    wizardFolderStatus.textContent = '✗ Không quét được folder: ' + (err?.message || String(err));
  }
});

document.getElementById('wizardQuickAutoBtn')?.addEventListener('click', async function () {
  const statusEl = document.getElementById('wizardQuickStatus');
  const nameInput = document.getElementById('wizardQuickFolderName');
  const srcSel = document.getElementById('wizardQuickSourceSelect');
  const accounts = getAccounts();
  const sourceIdx = srcSel ? Number(srcSel.value) : NaN;
  const hasSource = Number.isInteger(sourceIdx) && !!accounts[sourceIdx];

  if (!accountWizardData.apiKey) {
    if (statusEl) statusEl.textContent = '⚠ Hãy hoàn tất bước 4 (API Key) trước khi dùng cách nhanh này.';
    return;
  }
  const label = wizardAccountLabelInput.value.trim();
  if (!label) {
    if (statusEl) statusEl.textContent = '⚠ Hãy nhập "Tên hiển thị" ở ô bên dưới (phần thủ công) trước, rồi bấm lại nút này.';
    wizardAccountLabelInput.focus();
    return;
  }
  const folderName = nameInput.value.trim() || 'Phim';

  this.disabled = true;
  try {
    statusEl.textContent = '⏳ Đang mở màn hình đăng nhập - hãy chọn đúng tài khoản MỚI (' + accountWizardData.googleAccount + ')...';
    await requestCopyAccessToken('select_account');

    statusEl.textContent = '⏳ Đang tự tạo folder "' + folderName + '" giống folder gốc...';
    const folderRes = await copyApiFetch(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }) }
    );
    const folder = await folderRes.json();

    statusEl.textContent = '⏳ Đang tự chia sẻ "Bất kỳ ai có đường liên kết"...';
    await copyApiFetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(folder.id) + '/permissions',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }) }
    );

    const folderLink = 'https://drive.google.com/drive/folders/' + folder.id;
    wizardFolderLink.value = folderLink;
    const fcd = document.getElementById('wizardFolderCreatedDone'); if (fcd) fcd.checked = true;
    const fsd = document.getElementById('wizardFolderSharedDone'); if (fsd) fsd.checked = true;

    accountWizardData.label = label;
    accountWizardData.folderLink = folderLink;
    accountWizardData.folderOk = true;
    accountWizardData.videoCount = 0;

    const copyBox = document.getElementById('wizardCopyBox');
    if (copyBox) { copyBox.classList.remove('hidden'); populateFolderSyncSelects(); }

    if (hasSource) {
      const destAcc = { label: label, apiKey: accountWizardData.apiKey, folderLink: folderLink };
      await runFolderSyncUI(accounts[sourceIdx], destAcc, statusEl, null);
    } else {
      statusEl.textContent = '✓ Đã tự tạo & chia sẻ folder "' + folderName + '". Chưa có tài khoản nguồn nào để copy - có thể copy sau ở ô "Copy video từ" bên dưới.';
    }

    try {
      const files = await listFolderFiles(accountWizardData.apiKey, extractFolderId(folderLink));
      accountWizardData.videoCount = files.filter(isPlayableMediaFile).length;
    } catch (e) { /* folder vừa tạo, key mới có thể cần vài giây để lập chỉ mục - bỏ qua */ }
    wizardFolderStatus.textContent = '✓ OK — folder tự tạo, hiện có ' + accountWizardData.videoCount + ' video.';
    wizardStep5Next.disabled = false;
  } catch (err) {
    statusEl.textContent = '✗ Lỗi: ' + (err.message || String(err));
  } finally {
    this.disabled = false;
  }
});

document.getElementById('wizardCopyStartBtn')?.addEventListener('click', async function () {
  const statusEl = document.getElementById('wizardCopyStatus');
  const sel = document.getElementById('wizardCopySourceSelect');
  const accounts = getAccounts();
  const sourceIdx = sel ? Number(sel.value) : NaN;
  if (!accountWizardData.folderOk) {
    if (statusEl) statusEl.textContent = '⚠ Hãy "🔍 Kiểm tra folder" ở trên trước.';
    return;
  }
  if (!Number.isInteger(sourceIdx) || !accounts[sourceIdx]) {
    if (statusEl) statusEl.textContent = '⚠ Chưa có tài khoản nào để copy từ đó - hãy thêm ít nhất 1 tài khoản trước.';
    return;
  }
  const destAcc = { label: accountWizardData.label, apiKey: accountWizardData.apiKey, folderLink: accountWizardData.folderLink };
  await runFolderSyncUI(accounts[sourceIdx], destAcc, statusEl, this);
  // Sau khi copy xong, quét lại folder đích để cập nhật số video hiển thị ở bước tóm tắt.
  try {
    const files = await listFolderFiles(accountWizardData.apiKey, extractFolderId(accountWizardData.folderLink));
    accountWizardData.videoCount = files.filter(isPlayableMediaFile).length;
    wizardFolderStatus.textContent = '✓ OK — hiện có ' + accountWizardData.videoCount + ' video trong folder.';
  } catch (e) { /* bỏ qua - không quét lại được thì vẫn giữ số cũ */ }
});

document.getElementById('wizardStep5Next')?.addEventListener('click', function() {
  if (!accountWizardData.folderOk) return;
  wizardSummary.innerHTML =
    '<div><b>Google Account:</b> ' + escapeHtml(accountWizardData.googleAccount) + '</div>' +
    '<div><b>Tên:</b> ' + escapeHtml(accountWizardData.label) + '</div>' +
    '<div><b>API Key:</b> ' + escapeHtml(accountWizardData.apiKey.slice(0,8)) + '••••••••</div>' +
    '<div><b>Folder:</b> ' + escapeHtml(accountWizardData.folderLink) + '</div>' +
    '<div><b>Video tìm thấy:</b> ' + accountWizardData.videoCount + '</div>';
  wizardShowStep(6);
});

document.getElementById('wizardFinishBtn')?.addEventListener('click', function() {
  const newAccount = {
    googleAccount: accountWizardData.googleAccount,
    label: accountWizardData.label,
    apiKey: accountWizardData.apiKey,
    folderLink: accountWizardData.folderLink
  };

  // Wizard hoàn tất là LƯU THẬT ngay, không còn trạng thái nháp.
  const existing = getAccounts().filter(function(a) {
    return (a.googleAccount || '').toLowerCase() !== newAccount.googleAccount.toLowerCase();
  });
  try {
    saveAccounts(existing.concat([newAccount]));
    accountDraftRows = getAccounts().map(function(a) {
      return {
        googleAccount: a.googleAccount || '',
        label: a.label || '',
        apiKey: a.apiKey || '',
        folderLink: a.folderLink || ''
      };
    });
    closeAccountWizard();
    renderAccountRows();
    populateFolderSyncSelects();
    showScreen('grid');
    loadVideos();
    toast('✓ Đã lưu vĩnh viễn account ' + newAccount.googleAccount + ' trên trình duyệt này.', 'ok');
  } catch (err) {
    toast('✗ Không lưu được account: ' + (err.message || String(err)), 'err');
  }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, function(ch) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
  });
}

function renderAccountRows() {
  accountsListEl.innerHTML = '';
  accountDraftRows.forEach(function (row, idx) {
    const div = document.createElement('div');
    div.className = 'account-row';

    const labelWrap = document.createElement('label');
    labelWrap.className = 'account-label-wrap';
    labelWrap.textContent = 'Tài khoản ' + (idx + 1);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = 'Tên gợi nhớ (vd. minhvukgh1979)';
    labelInput.value = row.label || '';
    labelInput.setAttribute('tabindex', '0');
    labelInput.addEventListener('input', function () { row.label = labelInput.value; });

    const googleInput = document.createElement('input');
    googleInput.type = 'email';
    googleInput.placeholder = 'Google Account (vd. minhvukgh1977@gmail.com)';
    googleInput.value = row.googleAccount || '';
    googleInput.setAttribute('tabindex', '0');
    googleInput.addEventListener('input', function () { row.googleAccount = googleInput.value; });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Google Drive API Key (AIzaSy...)';
    keyInput.value = row.apiKey || '';
    keyInput.setAttribute('tabindex', '0');
    keyInput.addEventListener('input', function () { row.apiKey = keyInput.value; });

    const folderInput = document.createElement('input');
    folderInput.type = 'text';
    folderInput.placeholder = 'Link folder Google Drive (https://drive.google.com/drive/folders/...)';
    folderInput.value = row.folderLink || '';
    folderInput.setAttribute('tabindex', '0');
    folderInput.addEventListener('input', function () { row.folderLink = folderInput.value; });

    // ---- Kiểm tra ngay tại chỗ: bấm là biết luôn folder có quét
    // được video không, không cần Lưu rồi thử lại từ đầu. ----
    const checkRow = document.createElement('div');
    checkRow.className = 'account-check-row';

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn account-check-btn';
    checkBtn.textContent = '🔍 Kiểm tra folder này';
    checkBtn.setAttribute('tabindex', '0');

    const checkStatus = document.createElement('span');
    checkStatus.className = 'account-check-status';

    checkBtn.addEventListener('click', async function () {
      const apiKey = (row.apiKey || '').trim();
      const folderLink = (row.folderLink || '').trim();
      if (!apiKey || !folderLink) {
        checkStatus.textContent = 'Cần nhập đủ API Key và link folder trước đã.';
        checkStatus.className = 'account-check-status err';
        return;
      }
      checkBtn.disabled = true;
      checkStatus.textContent = 'Đang kiểm tra...';
      checkStatus.className = 'account-check-status';
      try {
        const folderId = extractFolderId(folderLink);
        const files = await listFolderFiles(apiKey, folderId);
        const videoCount = files.filter(isPlayableMediaFile).length;
        if (videoCount > 0) {
          checkStatus.textContent = '✓ OK - tìm thấy ' + videoCount + ' video.';
          checkStatus.className = 'account-check-status ok';
        } else {
          checkStatus.textContent = '⚠ Kết nối được, nhưng folder chưa có video/nhạc nào.';
          checkStatus.className = 'account-check-status warn';
        }
      } catch (err) {
        checkStatus.textContent = '✗ Lỗi: ' + err.message;
        checkStatus.className = 'account-check-status err';
      } finally {
        checkBtn.disabled = false;
      }
    });

    checkRow.appendChild(checkBtn);
    checkRow.appendChild(checkStatus);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn account-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Xoá tài khoản này';
    removeBtn.setAttribute('tabindex', '0');
    removeBtn.addEventListener('click', function () {
      accountDraftRows.splice(idx, 1);
      if (accountDraftRows.length === 0) accountDraftRows.push({ googleAccount: '', label: '', apiKey: '', folderLink: '' });
      renderAccountRows();
    });

    div.appendChild(labelWrap);
    div.appendChild(googleInput);
    div.appendChild(labelInput);
    div.appendChild(keyInput);
    div.appendChild(folderInput);
    div.appendChild(checkRow);
    div.appendChild(removeBtn);
    accountsListEl.appendChild(div);
  });
}

// ---------------- Đồng bộ folder giữa các tài khoản (đổ dữ liệu dropdown) ----------------

function populateFolderSyncSelects() {
  const accounts = getAccounts();
  const options = accounts.map(function (a, idx) {
    const label = a.label || a.googleAccount || ('Tài khoản ' + (idx + 1));
    return { value: String(idx), label: label };
  });

  function fill(select, placeholder) {
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '';
    if (options.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    options.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    });
    if (options.some(function (o) { return o.value === prevValue; })) select.value = prevValue;
  }

  fill(document.getElementById('folderSyncSourceSelect'), 'Cần thêm ít nhất 2 tài khoản trước');
  fill(document.getElementById('folderSyncDestSelect'), 'Cần thêm ít nhất 2 tài khoản trước');
  // Mặc định chọn 2 dòng khác nhau (nếu có từ 2 tài khoản trở lên) cho tiện.
  const destSel = document.getElementById('folderSyncDestSelect');
  if (destSel && options.length > 1 && destSel.value === document.getElementById('folderSyncSourceSelect')?.value) {
    destSel.value = options[1].value;
  }

  fill(document.getElementById('wizardCopySourceSelect'), 'Chưa có tài khoản nào để copy từ đó');
  fill(document.getElementById('wizardQuickSourceSelect'), 'Chưa có tài khoản nào để copy từ đó');
}

async function runFolderSyncUI(sourceAcc, destAcc, statusEl, startBtn) {
  if (!sourceAcc || !destAcc) { if (statusEl) statusEl.textContent = '⚠ Hãy chọn đủ tài khoản nguồn và đích.'; return; }
  if (startBtn) startBtn.disabled = true;
  try {
    const result = await syncFolderContents(sourceAcc, destAcc, function (evt) {
      if (!statusEl) return;
      if (evt.phase === 'listing') statusEl.textContent = '⏳ Đang quét danh sách file 2 folder...';
      else if (evt.phase === 'login') statusEl.textContent = '⏳ Đang mở màn hình đăng nhập Google - hãy chọn đúng tài khoản ĐÍCH (' + (destAcc.label || destAcc.googleAccount || 'tài khoản đích') + ')...';
      else if (evt.phase === 'copying') statusEl.textContent = '⏳ Đang copy ' + (evt.done + 1) + '/' + evt.total + ': ' + evt.name;
    });
    if (!statusEl) return;
    if (result.total === 0) {
      statusEl.textContent = '✓ Đích đã có đủ, không có file nào cần copy thêm (đã bỏ qua ' + result.skipped + ' file trùng tên).';
    } else if (result.errors.length === 0) {
      statusEl.textContent = '✓ Đã copy xong ' + result.copied + '/' + result.total + ' file sang tài khoản đích.';
    } else {
      statusEl.textContent = '⚠ Copy xong ' + result.copied + '/' + result.total + ' file - lỗi ' + result.errors.length + ' file: ' + result.errors.slice(0, 3).join('; ') + (result.errors.length > 3 ? '...' : '');
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '✗ Đồng bộ lỗi: ' + (e.message || String(e));
  } finally {
    if (startBtn) startBtn.disabled = false;
  }
}

document.getElementById('folderSyncStartBtn')?.addEventListener('click', function () {
  const accounts = getAccounts();
  const sourceSel = document.getElementById('folderSyncSourceSelect');
  const destSel = document.getElementById('folderSyncDestSelect');
  const statusEl = document.getElementById('folderSyncStatus');
  const sourceIdx = sourceSel ? Number(sourceSel.value) : NaN;
  const destIdx = destSel ? Number(destSel.value) : NaN;
  if (!Number.isInteger(sourceIdx) || !Number.isInteger(destIdx)) {
    if (statusEl) statusEl.textContent = '⚠ Cần ít nhất 2 tài khoản đã thêm ở trên trước khi đồng bộ.';
    return;
  }
  if (sourceIdx === destIdx) {
    if (statusEl) statusEl.textContent = '⚠ Hãy chọn 2 tài khoản khác nhau cho nguồn và đích.';
    return;
  }
  runFolderSyncUI(accounts[sourceIdx], accounts[destIdx], statusEl, this);
});

function openSettings() {
  const accounts = getAccounts();
  accountDraftRows = accounts.length > 0
    ? accounts.map(function (a) { return { googleAccount: a.googleAccount || '', label: a.label || '', apiKey: a.apiKey || '', folderLink: a.folderLink || '' }; })
    : [{ label: '', apiKey: '', folderLink: '' }];
  renderAccountRows();
  settingsError.textContent = '';
  switchSettingsTab('accounts');
  settingsScreen.classList.remove('hidden');
  populateFolderSyncSelects();
  const firstInput = accountsListEl.querySelector('input');
  if (firstInput) firstInput.focus();
}

function closeSettings() {
  settingsScreen.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', function () {
  if (isConfigured()) closeSettings();
});

if (shortcutsBtn) {
  shortcutsBtn.addEventListener('click', function () {
    openSettings();
    switchSettingsTab('shortcuts');
  });
}

saveBtn.addEventListener('click', function () {
  const cleaned = accountDraftRows.map(function (r) {
    return {
      googleAccount: (r.googleAccount || '').trim(),
      label: (r.label || '').trim(),
      apiKey: (r.apiKey || '').trim(),
      folderLink: (r.folderLink || '').trim()
    };
  });
  const nonEmpty = cleaned.filter(function (r) {
    return r.googleAccount || r.label || r.apiKey || r.folderLink;
  });
  const valid = nonEmpty.filter(function (r) {
    return r.apiKey && r.folderLink;
  });

  if (valid.length === 0) {
    settingsError.textContent = 'Vui lòng nhập đủ API Key và link folder Google Drive cho ít nhất 1 tài khoản.';
    return;
  }

  try {
    saveAccounts(valid);
    settingsError.textContent = '';
    populateFolderSyncSelects();
    closeSettings();
    showScreen('grid');
    loadVideos();
    toast('Đã lưu cấu hình.', 'ok');
  } catch (err) {
    settingsError.textContent = err.message || String(err);
  }
});

// ---------------- Tabs & sort ----------------

tabsEl.addEventListener('click', function (e) {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  currentTab = btn.getAttribute('data-tab');
  Array.from(tabsEl.querySelectorAll('.tab')).forEach(function (t) { t.classList.toggle('active', t === btn); });
  applyFilters();
});

if (mediaSwitchEl) {
  Array.from(mediaSwitchEl.querySelectorAll('.media-switch-btn')).forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-media') === currentMediaFilter);
  });
  mediaSwitchEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.media-switch-btn');
    if (!btn) return;
    currentMediaFilter = btn.getAttribute('data-media');
    localStorage.setItem(LS_KEY_MEDIA_FILTER, currentMediaFilter);
    Array.from(mediaSwitchEl.querySelectorAll('.media-switch-btn')).forEach(function (t) { t.classList.toggle('active', t === btn); });
    applyFilters();
  });
}

sortSelect.addEventListener('change', applyFilters);
searchInput.addEventListener('input', function () {
  clearSearchBtn.classList.toggle('hidden', !searchInput.value);
  applyFilters();
});
if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', function () {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    applyFilters();
  });
}
refreshBtn.addEventListener('click', function () { loadVideos(); });

function decorate(video) {
  const meta = getMeta(video.key);
  const progress = getProgress(video.key);
  const rawPct = progress && progress.duration ? Math.min(100, Math.round((progress.time / progress.duration) * 100)) : 0;
  return Object.assign({}, video, {
    title: meta.title || video.originalTitle,
    favorite: !!meta.favorite,
    hidden: !!meta.hidden,
    note: meta.note || '',
    watchedManual: !!meta.watchedManual,
    watchedPct: meta.watchedManual ? 100 : rawPct,
    progressUpdatedAt: progress ? (progress.updatedAt || 0) : 0
  });
}

function applyFilters() {
  const term = normalizeForSearch(searchInput.value);
  const sortMode = sortSelect.value;

  let list = allVideos.map(decorate);

  if (currentTab === 'favorite') list = list.filter(function (v) { return v.favorite && !v.hidden; });
  else if (currentTab === 'hidden') list = list.filter(function (v) { return v.hidden; });
  else list = list.filter(function (v) { return !v.hidden; });

  if (currentMediaFilter === 'video') list = list.filter(function (v) { return v.mediaType !== 'audio'; });
  else if (currentMediaFilter === 'audio') list = list.filter(function (v) { return v.mediaType === 'audio'; });

  if (term) {
    list = list.filter(function (v) { return normalizeForSearch(v.title).includes(term); });
  }

  if (sortMode === 'name') {
    list.sort(function (a, b) { return a.title.localeCompare(b.title, 'vi'); });
  } else if (sortMode === 'newest') {
    list.sort(function (a, b) { return new Date(b.createdTime || 0) - new Date(a.createdTime || 0); });
  } else if (sortMode === 'favorite') {
    list.sort(function (a, b) {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.title.localeCompare(b.title, 'vi');
    });
  } else if (sortMode === 'progress') {
    list.sort(function (a, b) {
      if (a.watchedPct !== b.watchedPct) return b.watchedPct - a.watchedPct;
      return a.title.localeCompare(b.title, 'vi');
    });
  }

  currentDisplayedList = list;
  renderVideos(list);
  renderContinueWatching(term);

  if (videoCountBadge) {
    videoCountBadge.classList.toggle('hidden', allVideos.length === 0);
    videoCountBadge.textContent = allVideos.length + ' mục';
  }

  if (allVideos.length === 0) {
    statusMsg.textContent = 'Không thấy video/nhạc nào trong folder. Kiểm tra lại link folder và quyền chia sẻ.';
  } else {
    const mediaLabel = currentMediaFilter === 'video' ? ' (phim)' : currentMediaFilter === 'audio' ? ' (nhạc)' : ' (video + nhạc)';
    statusMsg.textContent = list.length + ' / ' + allVideos.length + ' mục' + mediaLabel + '.';
  }
}

// ---------------- "Xem tiếp" (continue watching) ----------------

function renderContinueWatching(term) {
  if (!continueSection || !continueRow) return;
  if (term || currentTab !== 'all' || currentMediaFilter !== 'all' || bulkModeActive) {
    continueSection.classList.add('hidden');
    return;
  }
  const list = allVideos.map(decorate)
    .filter(function (v) { return !v.hidden && v.watchedPct > 3 && v.watchedPct < 95 && !v.watchedManual; })
    .sort(function (a, b) { return b.progressUpdatedAt - a.progressUpdatedAt; })
    .slice(0, 12);

  if (list.length === 0) {
    continueSection.classList.add('hidden');
    continueRow.innerHTML = '';
    return;
  }

  continueSection.classList.remove('hidden');
  continueRow.innerHTML = '';
  list.forEach(function (video) {
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.tabIndex = 0;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';
    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = video.title;
    if (video.thumbnail) { img.src = video.thumbnail; }
    else { img.style.background = '#37474f'; }
    thumbWrap.appendChild(img);
    if (video.mediaType === 'audio' && !video.thumbnail) {
      thumbWrap.classList.add('thumb-wrap-audio');
      const audioIcon = document.createElement('span');
      audioIcon.className = 'audio-note-icon';
      audioIcon.textContent = '🎵';
      thumbWrap.appendChild(audioIcon);
    }

    const sliver = document.createElement('div');
    sliver.className = 'progress-sliver';
    sliver.style.width = video.watchedPct + '%';
    thumbWrap.appendChild(sliver);

    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = video.title;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = 'Đã xem ' + video.watchedPct + '%';
    info.appendChild(title);
    info.appendChild(desc);

    card.appendChild(thumbWrap);
    card.appendChild(info);
    card.addEventListener('click', function () { openPlayer(video); });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter') openPlayer(video); });
    continueRow.appendChild(card);
  });
}

// ---------------- Grid rendering ----------------

function renderVideos(videos) {
  videoGrid.innerHTML = '';

  if (videos.length === 0 && allVideos.length > 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<span class="empty-emoji">🔍</span>Không tìm thấy video/nhạc phù hợp.';
    videoGrid.appendChild(empty);
    return;
  }

  videos.forEach(function (video) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.dataset.key = video.key;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';

    if (bulkModeActive) {
      const check = document.createElement('div');
      check.className = 'select-check' + (selectedKeys.has(video.key) ? ' checked' : '');
      check.textContent = selectedKeys.has(video.key) ? '✓' : '';
      thumbWrap.appendChild(check);
    }

    const isAudio = video.mediaType === 'audio';
    if (isAudio) thumbWrap.classList.add('thumb-wrap-audio');

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = video.title;
    if (video.thumbnail) {
      img.src = video.thumbnail;
      img.onerror = function () { img.style.background = '#37474f'; img.removeAttribute('src'); };
    } else {
      img.style.background = '#37474f';
    }
    thumbWrap.appendChild(img);

    if (isAudio && !video.thumbnail) {
      const audioIcon = document.createElement('span');
      audioIcon.className = 'audio-note-icon';
      audioIcon.textContent = '🎵';
      thumbWrap.appendChild(audioIcon);
    }

    if (video.sources.some(function (s) { return s.subtitleFileId; })) {
      const ccBadge = document.createElement('span');
      ccBadge.className = 'badge badge-cc';
      ccBadge.textContent = 'CC';
      thumbWrap.appendChild(ccBadge);
    }
    if (video.note) {
      const noteBadge = document.createElement('span');
      noteBadge.className = 'badge badge-note';
      noteBadge.textContent = '📝';
      noteBadge.title = video.note;
      thumbWrap.appendChild(noteBadge);
    }
    if (video.sources.length > 1) {
      const multiBadge = document.createElement('span');
      multiBadge.className = 'badge badge-multi';
      multiBadge.textContent = video.sources.length + ' nguồn';
      multiBadge.title = 'Có ở ' + video.sources.length + ' tài khoản: ' +
        video.sources.map(function (s) { return s.accountLabel; }).join(', ');
      thumbWrap.appendChild(multiBadge);
    }
    if (video.favorite) {
      const favBadge = document.createElement('span');
      favBadge.className = 'badge badge-fav';
      favBadge.textContent = '★';
      thumbWrap.appendChild(favBadge);
    }
    if (video.watchedManual || video.watchedPct >= 95) {
      const watchedBadge = document.createElement('span');
      watchedBadge.className = 'badge badge-watched';
      watchedBadge.textContent = '✓ Đã xem';
      thumbWrap.appendChild(watchedBadge);
    }
    if (video.watchedPct > 3 && video.watchedPct < 95) {
      const sliver = document.createElement('div');
      sliver.className = 'progress-sliver';
      sliver.style.width = video.watchedPct + '%';
      thumbWrap.appendChild(sliver);
    }

    const info = document.createElement('div');
    info.className = 'info';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = video.title;

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = (video.watchedManual || video.watchedPct >= 95) ? 'Đã xem xong' :
      (video.watchedPct > 3 ? 'Đã xem ' + video.watchedPct + '%' : 'Nhấn để phát');

    info.appendChild(title);
    info.appendChild(desc);

    if (video.note) {
      const notePreview = document.createElement('div');
      notePreview.className = 'note-preview';
      notePreview.textContent = '📝 ' + video.note;
      info.appendChild(notePreview);
    }

    const tools = document.createElement('div');
    tools.className = 'card-tools';

    const favBtn = document.createElement('button');
    favBtn.textContent = video.favorite ? '★ Bỏ thích' : '☆ Yêu thích';
    if (video.favorite) favBtn.classList.add('active-fav');
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMeta(video.key, { favorite: !video.favorite });
      applyFilters();
    });

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎ Sửa';
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openEditModal(video);
    });

    const hideBtn = document.createElement('button');
    hideBtn.textContent = video.hidden ? '↩ Khôi phục' : '🙈 Ẩn';
    hideBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMeta(video.key, { hidden: !video.hidden });
      applyFilters();
    });

    tools.appendChild(favBtn);
    tools.appendChild(editBtn);
    tools.appendChild(hideBtn);

    card.appendChild(thumbWrap);
    card.appendChild(info);
    card.appendChild(tools);

    card.addEventListener('click', function () {
      if (bulkModeActive) {
        if (selectedKeys.has(video.key)) selectedKeys.delete(video.key);
        else selectedKeys.add(video.key);
        updateBulkBar();
        applyFilters();
        return;
      }
      openPlayer(video);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); card.click(); }
    });

    videoGrid.appendChild(card);
  });
}

async function loadVideos() {
  const accounts = getAccounts();
  statusMsg.textContent = 'Đang quét folder Google Drive (' + accounts.length + ' tài khoản)...';
  videoGrid.innerHTML = '';

  try {
    allVideos = await fetchFolderVideos(accounts);
    searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
    applyFilters();
    const partialErrors = allVideos._partialErrors || [];
    if (partialErrors.length > 0) {
      // Vẫn quét được ít nhất 1 tài khoản, nhưng có tài khoản khác lỗi -
      // hiện thêm cảnh báo nhẹ phía sau số liệu video, không chặn xem.
      statusMsg.textContent += ' (Lỗi ở ' + partialErrors.length + ' tài khoản: ' + partialErrors.join(' | ') + ')';
    }
    const firstCard = videoGrid.querySelector('.card');
    if (firstCard) firstCard.focus();
  } catch (err) {
    statusMsg.textContent = 'Lỗi quét folder: ' + err.message;
  }
}

// ---------------- Edit modal ----------------

function openEditModal(video) {
  editingKey = video.key;
  editTitleInput.value = video.title;
  if (editNoteInput) editNoteInput.value = video.note || '';
  if (editWatchedInput) editWatchedInput.checked = !!video.watchedManual;
  editModal.classList.remove('hidden');
  editTitleInput.focus();
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editingKey = null;
}

editSaveBtn.addEventListener('click', function () {
  if (!editingKey) return;
  const val = editTitleInput.value.trim();
  const patch = { title: val || null };
  if (editNoteInput) patch.note = editNoteInput.value.trim();
  if (editWatchedInput) patch.watchedManual = editWatchedInput.checked;
  setMeta(editingKey, patch);
  closeEditModal();
  applyFilters();
});

editResetBtn.addEventListener('click', function () {
  if (!editingKey) return;
  setMeta(editingKey, { title: null });
  closeEditModal();
  applyFilters();
});

editCancelBtn.addEventListener('click', closeEditModal);

// ---------------- Player ----------------

function clearSubtitle() {
  if (currentSubtitleUrl) { URL.revokeObjectURL(currentSubtitleUrl); currentSubtitleUrl = null; }
  subtitleTrack.removeAttribute('src');
  subtitleTrack.src = '';
  subtitleBtn.classList.add('hidden');
  subtitleBtn.classList.remove('on');
}

function updatePlayPauseIcon() {
  const icon = videoPlayer.paused ? '▶' : '⏸';
  playPauseBtn.textContent = icon;
  bigPlayBtn.textContent = icon;
  bigPlayBtn.style.display = videoPlayer.paused ? 'flex' : 'none';
}

function showControls() {
  playerControls.classList.remove('faded');
  clearTimeout(controlsHideTimer);
  if (!videoPlayer.paused) {
    controlsHideTimer = setTimeout(function () { playerControls.classList.add('faded'); }, 3000);
  }
}

function showPlayerError(message) {
  if (!playerError) return;
  playerError.textContent = message;
  playerError.classList.remove('hidden');
}

function hidePlayerError() {
  if (!playerError) return;
  playerError.classList.add('hidden');
  playerError.textContent = '';
}

// Gọi thử 1 byte đầu của file trước khi gán vào thẻ <video>, để phát
// hiện sớm lỗi 403 (file chưa chia sẻ công khai) / 404 (file bị xoá,
// sai ID) và báo rõ ràng, thay vì để video đơ im lặng không rõ lý do.
async function checkPlayableUrl(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    if (res.ok || res.status === 206) return { ok: true };
    return { ok: false, status: res.status };
  } catch (e) {
    // Lỗi mạng/CORS: thường đi kèm 403 phía server không trả header
    // CORS, trình duyệt báo thành lỗi "Failed to fetch" chung chung.
    return { ok: false, status: null };
  }
}

function describePlaybackError(status) {
  if (status === 403) {
    return 'Không phát được video (lỗi 403). Nhiều khả năng file trên Google Drive chưa để chia sẻ "Bất kỳ ai có đường liên kết → Người xem". Vào Drive, chuột phải vào file → Chia sẻ → đổi thành "Bất kỳ ai có đường liên kết", quyền Người xem.';
  }
  if (status === 404) {
    return 'Không tìm thấy video (lỗi 404). File có thể đã bị xoá hoặc di chuyển khỏi thư mục trên Google Drive.';
  }
  return 'Không phát được video. Vui lòng kiểm tra lại kết nối mạng hoặc quyền chia sẻ file trên Google Drive rồi tải lại trang.';
}

// Thử phát lần lượt từng "nguồn" (mỗi nguồn = 1 tài khoản) của 1 phim,
// bắt đầu từ startIndex. Nguồn nào bị lỗi (403 hết quota/quyền, 404...)
// sẽ tự động thử nguồn kế tiếp, không cần người xem bấm gì. Trả về
// true nếu tìm được 1 nguồn phát được, false nếu tất cả đều lỗi.
async function tryLoadSource(video, startIndex) {
  for (let i = startIndex; i < video.sources.length; i++) {
    const source = video.sources[i];
    const vidUrl = streamUrl(source.fileId, source.apiKey);

    if (video.sources.length > 1) {
      statusForPlayerLoading(source, i, video.sources.length);
    }

    const check = await checkPlayableUrl(vidUrl);
    if (!check.ok) continue; // thử nguồn kế tiếp

    currentSourceIndex = i;
    hidePlayerError();
    videoPlayer.src = vidUrl;

    const saved = getProgress(video.key);
    if (saved && saved.time > 5 && saved.duration && saved.time < saved.duration - 5) {
      videoPlayer.currentTime = saved.time;
    }

    videoPlayer.play().catch(function () { /* có thể bị chặn autoplay */ });
    updatePlayPauseIcon();

    if (source.subtitleFileId) {
      try {
        const url = await buildSubtitleUrl(source);
        if (url) {
          currentSubtitleUrl = url;
          subtitleTrack.src = url;
          subtitleBtn.classList.remove('hidden');
          subtitleBtn.classList.add('on');
          if (videoPlayer.textTracks && videoPlayer.textTracks[0]) {
            videoPlayer.textTracks[0].mode = 'showing';
          }
        }
      } catch (e) { /* bỏ qua nếu không tải được phụ đề */ }
    }
    return true;
  }
  return false;
}

function statusForPlayerLoading(source, index, total) {
  if (index === 0) return; // lần thử đầu tiên không cần báo gì
  showPlayerError('Tài khoản trước bị giới hạn - đang thử phát từ "' + source.accountLabel + '" (' + (index + 1) + '/' + total + ')...');
}

// ---------------- Hàng đợi phát (playlist) ----------------

// Dựng lại hàng đợi từ danh sách đang hiện trên lưới, chỉ lấy cùng loại
// (phim với phim, nhạc với nhạc) để bấm "bài kế tiếp" không bị lẫn.
// Gọi khi người dùng bấm mở 1 mục MỚI từ lưới/xem tiếp/tìm kiếm.
function buildQueue(video) {
  const pool = (currentDisplayedList || []).filter(function (v) { return v.mediaType === video.mediaType; });
  audioQueue = pool.length ? pool : [video];
  queueIndex = audioQueue.findIndex(function (v) { return v.key === video.key; });
  if (queueIndex === -1) { audioQueue = [video]; queueIndex = 0; }
  rebuildShuffleOrder();
}

function rebuildShuffleOrder() {
  shuffleOrder = audioQueue.map(function (_, i) { return i; });
  if (!shuffleOn) return;
  for (let i = shuffleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffleOrder[i]; shuffleOrder[i] = shuffleOrder[j]; shuffleOrder[j] = tmp;
  }
  // Bài đang phát luôn đứng đầu thứ tự trộn, để không tự nhảy lung tung
  // ngay khi vừa bật trộn bài.
  const pos = shuffleOrder.indexOf(queueIndex);
  if (pos > 0) { shuffleOrder.splice(pos, 1); shuffleOrder.unshift(queueIndex); }
}

function activeOrder() {
  return shuffleOn ? shuffleOrder : audioQueue.map(function (_, i) { return i; });
}

// Trả về vị trí (trong audioQueue) của bài cách bài hiện tại `delta` bước
// theo đúng thứ tự đang áp dụng (thường/trộn), có tính lặp lại toàn bộ.
function stepQueue(delta) {
  if (!audioQueue.length) return null;
  const order = activeOrder();
  let pos = order.indexOf(queueIndex);
  if (pos === -1) pos = 0;
  pos += delta;
  if (pos < 0) {
    if (repeatMode === 'all') pos = order.length - 1; else return null;
  } else if (pos >= order.length) {
    if (repeatMode === 'all') pos = 0; else return null;
  }
  return order[pos];
}

function playNextTrack(auto) {
  if (auto && repeatMode === 'one' && currentVideo) {
    videoPlayer.currentTime = 0;
    videoPlayer.play().catch(function () {});
    return;
  }
  const idx = stepQueue(1);
  if (idx == null) { updatePlayPauseIcon(); return; } // hết hàng đợi, dừng lại
  queueIndex = idx;
  openTrack(audioQueue[idx]);
}

function playPrevTrack() {
  // Giống nhiều app nghe nhạc: nếu đã nghe > 3 giây, bấm "bài trước" sẽ
  // tua bài hiện tại về đầu trước, bấm lần nữa mới thật sự lùi bài.
  if (currentVideo && currentVideo.mediaType === 'audio' && videoPlayer.currentTime > 3) {
    videoPlayer.currentTime = 0;
    return;
  }
  const idx = stepQueue(-1);
  if (idx == null) { videoPlayer.currentTime = 0; return; }
  queueIndex = idx;
  openTrack(audioQueue[idx]);
}

function updateTransportUI() {
  if (shuffleBtn) {
    shuffleBtn.classList.toggle('on', shuffleOn);
    shuffleBtn.title = shuffleOn ? 'Đang phát ngẫu nhiên (bấm để tắt)' : 'Phát ngẫu nhiên';
  }
  if (repeatBtn) {
    repeatBtn.classList.toggle('on', repeatMode !== 'off');
    repeatBtn.classList.toggle('repeat-one', repeatMode === 'one');
    repeatBtn.title = repeatMode === 'off' ? 'Lặp lại: Tắt' : repeatMode === 'all' ? 'Lặp lại: Toàn bộ danh sách' : 'Lặp lại: 1 bài';
  }
}

function updatePlayerFavUI() {
  if (!playerFavBtn || !currentVideo) return;
  playerFavBtn.textContent = currentVideo.favorite ? '★' : '☆';
  playerFavBtn.classList.toggle('active-fav', !!currentVideo.favorite);
  playerFavBtn.title = currentVideo.favorite ? 'Bỏ yêu thích bài này' : 'Yêu thích bài này';
}

function renderQueuePanel() {
  if (!queueList) return;
  queueList.innerHTML = '';
  if (!audioQueue.length) {
    queueList.innerHTML = '<p class="hint" style="padding:16px;">Không có mục nào trong danh sách.</p>';
    return;
  }
  activeOrder().forEach(function (poolIdx, pos) {
    const v = audioQueue[poolIdx];
    const row = document.createElement('div');
    row.className = 'queue-row' + (poolIdx === queueIndex ? ' playing' : '');
    row.setAttribute('tabindex', '0');

    const idx = document.createElement('div');
    idx.className = 'queue-row-idx';
    idx.textContent = poolIdx === queueIndex ? '▶' : String(pos + 1);

    const info = document.createElement('div');
    info.className = 'queue-row-info';
    const title = document.createElement('div');
    title.className = 'queue-row-title';
    title.textContent = v.title;
    const sub = document.createElement('div');
    sub.className = 'queue-row-sub';
    sub.textContent = v.mediaType === 'audio' ? '🎵 Nhạc' : '🎬 Phim';
    info.appendChild(title);
    info.appendChild(sub);

    row.appendChild(idx);
    row.appendChild(info);

    if (v.favorite) {
      const fav = document.createElement('span');
      fav.className = 'queue-row-fav';
      fav.textContent = '★';
      row.appendChild(fav);
    }

    row.addEventListener('click', function () {
      queueIndex = poolIdx;
      openTrack(v);
    });
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter') row.click(); });

    queueList.appendChild(row);
  });
}

// Điểm vào khi người dùng bấm mở 1 mục MỚI từ lưới / xem tiếp / tìm kiếm:
// dựng lại hàng đợi (và thứ tự trộn bài) rồi phát.
async function openPlayer(rawVideo) {
  buildQueue(rawVideo);
  await openTrack(audioQueue[queueIndex] || rawVideo);
}

// Phát 1 mục cụ thể, KHÔNG đụng tới hàng đợi hiện có - dùng cho bài
// kế tiếp/trước đó, hoặc bấm thẳng vào 1 dòng trong danh sách phát.
async function openTrack(rawVideo) {
  const video = decorate(rawVideo);
  currentVideo = video;
  currentSourceIndex = -1;
  clearSubtitle();
  hidePlayerError();

  const isAudio = video.mediaType === 'audio';

  playerTitle.textContent = video.title;
  videoPlayer.playbackRate = SPEEDS[speedIndex];
  speedBtn.textContent = SPEEDS[speedIndex] + 'x';
  if (pipBtn) pipBtn.classList.toggle('hidden', !document.pictureInPictureEnabled || isAudio);
  if (audioCover) {
    audioCover.classList.toggle('hidden', !isAudio);
    audioCover.classList.remove('playing');
    if (isAudio && audioCoverTitle) audioCoverTitle.textContent = video.title;
  }
  if (playerSubtitle) {
    if (audioQueue.length > 1) {
      const pos = activeOrder().indexOf(queueIndex);
      playerSubtitle.textContent = (isAudio ? '🎵 Bài ' : '🎬 Mục ') + (pos + 1) + ' / ' + audioQueue.length;
      playerSubtitle.classList.remove('hidden');
      if (audioCoverSub) {
        audioCoverSub.textContent = playerSubtitle.textContent;
        audioCoverSub.classList.remove('hidden');
      }
    } else {
      playerSubtitle.classList.add('hidden');
      if (audioCoverSub) audioCoverSub.classList.add('hidden');
    }
  }
  updatePlayerFavUI();
  updateTransportUI();
  renderQueuePanel();

  showScreen('player');
  showControls();

  const played = await tryLoadSource(video, 0);
  if (!played) {
    const lastSource = video.sources[video.sources.length - 1];
    const single = video.sources.length === 1;
    hidePlayerError();
    const check = await checkPlayableUrl(streamUrl(lastSource.fileId, lastSource.apiKey));
    showPlayerError(
      (single ? '' : 'Đã thử ' + video.sources.length + ' tài khoản, tài khoản nào cũng lỗi. ') +
      describePlaybackError(check.status)
    );
  }
}

videoPlayer.addEventListener('error', function () {
  // Trường hợp preflight qua được nhưng thẻ <video> vẫn không phát nổi
  // giữa chừng (vd. quota bị tính sau khi đã stream 1 phần, codec lỗi,
  // mất kết nối...). Nếu phim này còn nguồn khác chưa thử, tự nhảy
  // sang nguồn kế tiếp thay vì báo lỗi luôn.
  if (!currentVideo) return;
  const nextIndex = currentSourceIndex + 1;
  if (nextIndex < currentVideo.sources.length) {
    tryLoadSource(currentVideo, nextIndex).then(function (ok) {
      if (!ok) showPlayerError('Không phát được video này. Định dạng có thể không được trình duyệt hỗ trợ, hoặc kết nối tới Google Drive bị gián đoạn.');
    });
  } else if (playerError && playerError.classList.contains('hidden')) {
    showPlayerError('Không phát được video này. Định dạng có thể không được trình duyệt hỗ trợ, hoặc kết nối tới Google Drive bị gián đoạn.');
  }
});

function saveCurrentProgress() {
  if (!currentVideo || !videoPlayer.duration) return;
  if (videoPlayer.currentTime < 3 || videoPlayer.currentTime > videoPlayer.duration - 2) {
    setProgress(currentVideo.key, null);
  } else {
    setProgress(currentVideo.key, { time: videoPlayer.currentTime, duration: videoPlayer.duration });
  }
}

function closePlayer() {
  saveCurrentProgress();
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  clearSubtitle();
  hidePlayerError();
  videoPlayer.load();
  currentVideo = null;
  if (queuePanel) queuePanel.classList.remove('open');
  showScreen('grid');
  applyFilters();
  const firstCard = videoGrid.querySelector('.card:focus') || videoGrid.querySelector('.card');
  if (firstCard) firstCard.focus();
}

backBtn.addEventListener('click', closePlayer);

function togglePlayPause() {
  if (videoPlayer.paused) videoPlayer.play(); else videoPlayer.pause();
}

playPauseBtn.addEventListener('click', togglePlayPause);
bigPlayBtn.addEventListener('click', togglePlayPause);
videoPlayer.addEventListener('play', function () {
  updatePlayPauseIcon();
  showControls();
  if (audioCover) audioCover.classList.add('playing');
});
videoPlayer.addEventListener('pause', function () {
  updatePlayPauseIcon();
  showControls();
  if (audioCover) audioCover.classList.remove('playing');
});
videoPlayer.addEventListener('click', togglePlayPause);

// ---------------- Điều khiển hàng đợi / trộn bài / lặp lại / yêu thích ----------------

if (prevTrackBtn) prevTrackBtn.addEventListener('click', function () { playPrevTrack(); showControls(); });
if (nextTrackBtn) nextTrackBtn.addEventListener('click', function () { playNextTrack(false); showControls(); });

if (shuffleBtn) {
  shuffleBtn.addEventListener('click', function () {
    shuffleOn = !shuffleOn;
    savePlayerPrefs();
    rebuildShuffleOrder();
    updateTransportUI();
    renderQueuePanel();
    showControls();
    toast(shuffleOn ? 'Đã bật phát ngẫu nhiên.' : 'Đã tắt phát ngẫu nhiên.', 'ok');
  });
}

if (repeatBtn) {
  repeatBtn.addEventListener('click', function () {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    savePlayerPrefs();
    updateTransportUI();
    showControls();
    const label = repeatMode === 'off' ? 'Đã tắt lặp lại.' : repeatMode === 'all' ? 'Lặp lại toàn bộ danh sách.' : 'Lặp lại 1 bài.';
    toast(label, 'ok');
  });
}

if (playerFavBtn) {
  playerFavBtn.addEventListener('click', function () {
    if (!currentVideo) return;
    const newFav = !currentVideo.favorite;
    setMeta(currentVideo.key, { favorite: newFav });
    currentVideo.favorite = newFav;
    const inQueue = audioQueue.find(function (v) { return v.key === currentVideo.key; });
    if (inQueue) inQueue.favorite = newFav;
    updatePlayerFavUI();
    renderQueuePanel();
    showControls();
  });
}

if (queueBtn) {
  queueBtn.addEventListener('click', function () {
    renderQueuePanel();
    queuePanel.classList.toggle('open');
    showControls();
  });
}
if (closeQueueBtn) closeQueueBtn.addEventListener('click', function () { queuePanel.classList.remove('open'); });

rewindBtn.addEventListener('click', function () { videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10); showControls(); });
forwardBtn.addEventListener('click', function () { videoPlayer.currentTime = Math.min(videoPlayer.duration || Infinity, videoPlayer.currentTime + 10); showControls(); });

let seeking = false;
seekBar.addEventListener('input', function () {
  seeking = true;
  if (videoPlayer.duration) {
    const t = (seekBar.value / 1000) * videoPlayer.duration;
    timeCurrent.textContent = formatTime(t);
  }
});
seekBar.addEventListener('change', function () {
  if (videoPlayer.duration) {
    videoPlayer.currentTime = (seekBar.value / 1000) * videoPlayer.duration;
  }
  seeking = false;
  showControls();
});

videoPlayer.addEventListener('timeupdate', function () {
  if (!seeking && videoPlayer.duration) {
    seekBar.value = (videoPlayer.currentTime / videoPlayer.duration) * 1000;
    timeCurrent.textContent = formatTime(videoPlayer.currentTime);
  }
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(saveCurrentProgress, 2000);
});

videoPlayer.addEventListener('loadedmetadata', function () {
  timeDuration.textContent = formatTime(videoPlayer.duration);
});

videoPlayer.addEventListener('ended', function () {
  if (currentVideo) setProgress(currentVideo.key, { time: videoPlayer.duration, duration: videoPlayer.duration });
  updatePlayPauseIcon();
  // Nhạc thì tự chuyển bài kế tiếp (như 1 app nghe nhạc thật); phim thì
  // để người xem tự bấm, tránh tự nhảy sang phim khác ngoài ý muốn.
  if (currentVideo && currentVideo.mediaType === 'audio') {
    playNextTrack(true);
  }
});

function updateMuteIcon() {
  muteBtn.textContent = (videoPlayer.muted || videoPlayer.volume === 0) ? '🔇' : '🔊';
}

muteBtn.addEventListener('click', function () {
  videoPlayer.muted = !videoPlayer.muted;
  updateMuteIcon();
  showControls();
});

volumeBar.addEventListener('input', function () {
  videoPlayer.volume = parseFloat(volumeBar.value);
  videoPlayer.muted = videoPlayer.volume === 0;
  updateMuteIcon();
  showControls();
});

subtitleBtn.addEventListener('click', function () {
  if (!videoPlayer.textTracks || !videoPlayer.textTracks[0]) return;
  const tr = videoPlayer.textTracks[0];
  const on = tr.mode === 'showing';
  tr.mode = on ? 'hidden' : 'showing';
  subtitleBtn.classList.toggle('on', !on);
  showControls();
});

speedBtn.addEventListener('click', function () {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  videoPlayer.playbackRate = SPEEDS[speedIndex];
  speedBtn.textContent = SPEEDS[speedIndex] + 'x';
  showControls();
});

if (pipBtn) {
  pipBtn.addEventListener('click', async function () {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoPlayer.requestPictureInPicture();
      }
    } catch (e) { /* trình duyệt không hỗ trợ PiP cho video này */ }
    showControls();
  });
}

function isFullscreen() {
  return !!document.fullscreenElement;
}

fullscreenBtn.addEventListener('click', function () {
  if (!isFullscreen()) {
    (playerWrap.requestFullscreen || playerWrap.webkitRequestFullscreen || function () {}).call(playerWrap);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
  }
  showControls();
});

playerWrap.addEventListener('mousemove', showControls);
playerWrap.addEventListener('touchstart', showControls);

// Lưu tiến độ khi rời/đóng trang
window.addEventListener('beforeunload', saveCurrentProgress);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) saveCurrentProgress();
});

// ---------------- Bàn phím / điều khiển từ xa ----------------

function isTextInput(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

function getFocusables(container) {
  return Array.from(container.querySelectorAll('[tabindex], input, button, select'))
    .filter(function (el) { return el.offsetParent !== null; });
}

function moveFocus(container, direction) {
  const focusables = getFocusables(container);
  const active = document.activeElement;

  if (!active || !focusables.includes(active)) {
    if (focusables[0]) focusables[0].focus();
    return;
  }

  const r1 = active.getBoundingClientRect();
  const c1x = r1.left + r1.width / 2;
  const c1y = r1.top + r1.height / 2;

  let best = null;
  let bestDist = Infinity;

  focusables.forEach(function (el) {
    if (el === active) return;
    const r2 = el.getBoundingClientRect();
    const c2x = r2.left + r2.width / 2;
    const c2y = r2.top + r2.height / 2;
    const dx = c2x - c1x;
    const dy = c2y - c1y;

    let valid = false;
    if (direction === 'up') valid = dy < -10 && Math.abs(dx) < Math.abs(dy) * 3 + r1.width;
    if (direction === 'down') valid = dy > 10 && Math.abs(dx) < Math.abs(dy) * 3 + r1.width;
    if (direction === 'left') valid = dx < -10 && Math.abs(dy) < r1.height * 1.5;
    if (direction === 'right') valid = dx > 10 && Math.abs(dy) < r1.height * 1.5;
    if (!valid) return;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });

  if (best) best.focus();
}

document.addEventListener('keydown', function (e) {
  const key = e.key;
  const active = document.activeElement;

  // ---- Modal cấu hình / sửa tên đang mở: chỉ Escape để đóng (nếu đã cấu hình) ----
  if (!settingsScreen.classList.contains('hidden')) {
    if (key === 'Escape' && isConfigured()) { closeSettings(); }
    return;
  }
  if (!editModal.classList.contains('hidden')) {
    if (key === 'Escape') closeEditModal();
    return;
  }

  // ---- Màn hình phát video: phím tắt điều khiển media ----
  if (!playerScreen.classList.contains('hidden')) {
    if (isTextInput(active) && (key === 'ArrowLeft' || key === 'ArrowRight')) return; // để range input tự xử lý

    if (key === ' ' || key === 'k' || key === 'K') { e.preventDefault(); togglePlayPause(); return; }
    if (key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); playPrevTrack(); showControls(); return; }
    if (key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); playNextTrack(false); showControls(); return; }
    if (key === 'ArrowLeft' || key === 'j' || key === 'J') { e.preventDefault(); rewindBtn.click(); return; }
    if (key === 'ArrowRight' || key === 'l' || key === 'L') { e.preventDefault(); forwardBtn.click(); return; }
    if (key === 'ArrowUp') { e.preventDefault(); videoPlayer.volume = Math.min(1, videoPlayer.volume + 0.1); volumeBar.value = videoPlayer.volume; videoPlayer.muted = false; updateMuteIcon(); showControls(); return; }
    if (key === 'ArrowDown') { e.preventDefault(); videoPlayer.volume = Math.max(0, videoPlayer.volume - 0.1); volumeBar.value = videoPlayer.volume; updateMuteIcon(); showControls(); return; }
    if (key === 'f' || key === 'F') { e.preventDefault(); fullscreenBtn.click(); return; }
    if (key === 'm' || key === 'M') { e.preventDefault(); muteBtn.click(); return; }
    if (key === 'c' || key === 'C') { e.preventDefault(); if (!subtitleBtn.classList.contains('hidden')) subtitleBtn.click(); return; }
    if (key === 's' || key === 'S') { e.preventDefault(); shuffleBtn?.click(); return; }
    if (key === 'r' || key === 'R') { e.preventDefault(); repeatBtn?.click(); return; }
    if (key === 'q' || key === 'Q') { e.preventDefault(); queueBtn?.click(); return; }
    if (key === '?') { e.preventDefault(); shortcutsBtn?.click(); return; }
    if (key === 'Escape' || key === 'Backspace') { e.preventDefault(); closePlayer(); return; }
    if (key === 'Enter') {
      if (active && active.tagName === 'BUTTON') { e.preventDefault(); active.click(); }
      return;
    }
    return;
  }

  // ---- Màn hình danh sách: điều hướng không gian bằng phím mũi tên ----
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    if (isTextInput(active) && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
    e.preventDefault();
    moveFocus(gridScreen, key.replace('Arrow', '').toLowerCase());
    return;
  }

  if (key === 'Enter') {
    if (active && (active.tagName === 'BUTTON' || active.classList.contains('card'))) {
      e.preventDefault();
      active.click();
    }
    return;
  }

  if (key === '?' && !isTextInput(active)) {
    e.preventDefault();
    openSettings();
    switchSettingsTab('shortcuts');
    return;
  }

  if (key === 'm' || key === 'M') {
    if (!isTextInput(active)) openSettings();
  }
});

// ---------------- Khởi động ----------------

if (isConfigured()) {
  showScreen('grid');
  loadVideos();
} else {
  showScreen('grid');
  openSettings();
}

// Nếu đã bật Đồng bộ Drive, thử âm thầm kéo bản mới nhất về ngay khi mở
// app (không chặn màn hình chính - nếu có bản mới hơn sẽ tự áp dụng và
// tải lại trang 1 lần).
tryAutoRestoreFromDrive();
