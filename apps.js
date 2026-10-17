// ============================================================
// Ứng dụng phụ (file .html chạy trực tiếp, vd. Hand Grab 3D)
// Nguồn app:
//   1) Trong repo GitHub Pages (file .html nằm cạnh index.html) - tự dò
//   2) Trong folder Google Drive đã cấu hình (cùng folder với video/APK)
// Mỗi app có: ▶ Mở chạy trực tiếp  và  ⬇ Tải về.
// File này độc lập, không sửa app.js.
// ============================================================
(function () {
  'use strict';

  // Dự phòng nếu app.js chưa kịp cung cấp cấu hình Drive
  var FALLBACK_ACCOUNTS = [{
    label: 'minhvukgh1979',
    apiKey: 'AIzaSyC8Wyr26jIvv7AETbMshe9u7jv2owfcQRw',
    folderLink: 'https://drive.google.com/drive/folders/17wcsWpbjUcW5shb61luAqPjaRoh-8qL2'
  }];
  var GH_OWNER = 'minhvukgh1979-ux';
  var GH_REPO = 'xemd';
  var HIDE_FILES = ['index.html', '404.html'];   // không coi là app
  var APP_EXT = ['html', 'htm'];

  var openBtn = document.getElementById('appsOpenBtn');
  if (!openBtn) return;

  // ---------- tiện ích ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ext(name) {
    var m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }
  function baseName(name) { return String(name || '').replace(/\.[a-zA-Z0-9]+$/, ''); }
  function fmtSize(b) {
    b = Number(b); if (!b) return '';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function say(msg, type) {
    if (typeof toast === 'function') { try { toast(msg, type); return; } catch (e) {} }
    alert(msg);
  }
  function folderIdOf(text) {
    if (typeof extractFolderId === 'function') { try { return extractFolderId(text); } catch (e) {} }
    var m = /folders\/([a-zA-Z0-9_-]+)/.exec(text || '') || /[?&]id=([a-zA-Z0-9_-]+)/.exec(text || '');
    return m ? m[1] : String(text || '').trim();
  }
  function accounts() {
    if (typeof getAccounts === 'function') {
      try { var l = getAccounts(); if (l && l.length) return l; } catch (e) {}
    }
    return FALLBACK_ACCOUNTS;
  }
  function token() {
    try { return (typeof accessToken === 'string' && accessToken) ? accessToken : null; } catch (e) { return null; }
  }
  function hasCamera() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // ---------- dựng giao diện ----------
  var screen = document.createElement('div');
  screen.id = 'appsScreen';
  screen.className = 'apps-screen hidden';
  screen.innerHTML =
    '<div class="apps-top">' +
      '<button id="appsBackBtn" class="btn" type="button" tabindex="0">← Quay lại</button>' +
      '<h1>🧩 Ứng dụng</h1>' +
      '<button id="appsReloadBtn" class="btn" type="button" tabindex="0">↻ Tải lại</button>' +
    '</div>' +
    '<div class="apps-body">' +
      '<div id="appsWarn" class="apps-warn hidden"></div>' +
      '<p id="appsStatus" class="apps-status"></p>' +
      '<div id="appsList" class="apps-list"></div>' +
    '</div>';
  document.body.appendChild(screen);

  var viewer = document.createElement('div');
  viewer.id = 'appsViewer';
  viewer.className = 'apps-viewer hidden';
  viewer.innerHTML =
    '<div class="apps-vbar">' +
      '<button id="appsVCloseBtn" class="btn btn-sm" type="button" tabindex="0">✕ Đóng (Esc)</button>' +
      '<span id="appsVTitle" class="apps-vtitle"></span>' +
      '<button id="appsVFullBtn" class="btn btn-sm" type="button" tabindex="0">⛶ Toàn màn hình</button>' +
      '<button id="appsVDownBtn" class="btn btn-sm" type="button" tabindex="0">⬇ Tải về</button>' +
    '</div>' +
    '<div id="appsVLoading" class="apps-vloading hidden"></div>' +
    '<iframe id="appsVFrame" class="apps-vframe" title="Ứng dụng" ' +
      'allow="camera; microphone; fullscreen; autoplay; accelerometer; gyroscope; clipboard-write"></iframe>';
  document.body.appendChild(viewer);

  var listEl = document.getElementById('appsList');
  var statusEl = document.getElementById('appsStatus');
  var warnEl = document.getElementById('appsWarn');
  var frame = document.getElementById('appsVFrame');
  var vTitle = document.getElementById('appsVTitle');
  var vLoading = document.getElementById('appsVLoading');
  var currentBlobUrl = null;
  var currentApp = null;
  var loaded = false;
  var items = [];

  // ---------- nguồn 1: repo GitHub Pages ----------
  function repoBase() {
    return location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '');
  }

  async function loadRepoApps() {
    var meta = {};
    try {
      var r = await fetch('apps.json', { cache: 'no-store' });
      if (r.ok) {
        var j = await r.json();
        (j.apps || []).forEach(function (a) { if (a && a.file) meta[a.file] = a; });
      }
    } catch (e) {}

    var files = null;
    try {
      var api = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/';
      var g = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
      if (g.ok) {
        var arr = await g.json();
        files = arr.filter(function (f) {
          return f.type === 'file' && APP_EXT.indexOf(ext(f.name)) >= 0 &&
                 HIDE_FILES.indexOf(f.name.toLowerCase()) < 0;
        }).map(function (f) { return { file: f.name, size: f.size }; });
      }
    } catch (e) {}

    if (!files) {           // GitHub API lỗi/hết lượt -> dùng danh sách trong apps.json
      files = Object.keys(meta).map(function (k) { return { file: k, size: 0 }; });
    }

    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i], m = meta[f.file] || {};
      var url = repoBase() + encodeURI(f.file);
      if (!f.size) {        // kiểm tra file có thật không
        try { var h = await fetch(url, { method: 'HEAD', cache: 'no-store' }); if (!h.ok) continue; } catch (e) { continue; }
      }
      out.push({
        source: 'repo',
        key: 'repo:' + f.file,
        file: f.file,
        url: url,
        name: m.name || baseName(f.file),
        icon: m.icon || '🧩',
        desc: m.desc || '',
        size: f.size
      });
    }
    return out;
  }

  // ---------- nguồn 2: Google Drive ----------
  async function driveList(acc, folderId, depth) {
    var found = [], pageToken = '', tk = token();
    do {
      var q = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
      var url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
        '&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime)') +
        '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true';
      if (!tk) url += '&key=' + encodeURIComponent(acc.apiKey);
      if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
      var res = await fetch(url, tk ? { headers: { Authorization: 'Bearer ' + tk } } : undefined);
      if (!res.ok) throw new Error('Drive ' + res.status);
      var data = await res.json();
      pageToken = data.nextPageToken || '';
      for (var i = 0; i < (data.files || []).length; i++) {
        var f = data.files[i];
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (depth < 3) { try { found = found.concat(await driveList(acc, f.id, depth + 1)); } catch (e) {} }
        } else if (APP_EXT.indexOf(ext(f.name)) >= 0 || f.mimeType === 'text/html') {
          found.push({ acc: acc, f: f });
        }
      }
    } while (pageToken);
    return found;
  }

  async function loadDriveApps() {
    var out = [], errors = 0;
    var accs = accounts();
    for (var a = 0; a < accs.length; a++) {
      var acc = accs[a];
      var id = folderIdOf(acc.folderLink);
      if (!id || !acc.apiKey) continue;
      try {
        var rows = await driveList(acc, id, 0);
        rows.forEach(function (r) {
          out.push({
            source: 'drive',
            key: 'drive:' + r.f.id,
            id: r.f.id,
            apiKey: acc.apiKey,
            file: r.f.name,
            name: baseName(r.f.name),
            icon: '🧩',
            desc: '',
            size: Number(r.f.size) || 0
          });
        });
      } catch (e) { errors++; }
    }
    return { list: out, errors: errors };
  }

  function driveMediaUrl(app) {
    var u = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(app.id) +
            '?alt=media&supportsAllDrives=true';
    if (!token()) u += '&key=' + encodeURIComponent(app.apiKey);
    return u;
  }
  async function driveFetchBlob(app) {
    var tk = token();
    var res = await fetch(driveMediaUrl(app), tk ? { headers: { Authorization: 'Bearer ' + tk } } : undefined);
    if (!res.ok) {
      var err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  }
  function driveErrorHint(e) {
    if (e && (e.status === 403 || e.status === 429)) {
      return 'Drive từ chối (quá hạn mức tải). Bấm 👤 đăng nhập Google ở trang chính rồi thử lại.';
    }
    if (e && e.status === 404) return 'Không tìm thấy file. Kiểm tra folder có để chia sẻ "Bất kỳ ai có liên kết".';
    return 'Không tải được file từ Drive (' + (e && e.message ? e.message : 'lỗi mạng') + ').';
  }

  // ---------- hiển thị danh sách ----------
  function render() {
    if (!items.length) {
      listEl.innerHTML = '';
      return;
    }
    listEl.innerHTML = items.map(function (it, i) {
      var badge = it.source === 'repo' ? '🌐 Trong repo' : '☁️ Google Drive';
      var size = fmtSize(it.size);
      return '<div class="apps-card">' +
        '<div class="apps-icon">' + esc(it.icon) + '</div>' +
        '<div class="apps-info">' +
          '<p class="apps-name">' + esc(it.name) + '</p>' +
          '<p class="apps-desc"><span class="apps-badge">' + badge + '</span>' +
            (size ? '<span class="apps-badge">' + size + '</span>' : '') + esc(it.desc) + '</p>' +
        '</div>' +
        '<div class="apps-actions">' +
          '<button class="btn btn-primary" type="button" tabindex="0" data-act="run" data-i="' + i + '">▶ Mở chạy trực tiếp</button>' +
          '<button class="btn" type="button" tabindex="0" data-act="down" data-i="' + i + '">⬇ Tải về</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function reload() {
    statusEl.textContent = 'Đang quét ứng dụng...';
    listEl.innerHTML = '';
    warnEl.classList.add('hidden');
    if (!hasCamera()) {
      warnEl.textContent = '⚠️ Trình duyệt/thiết bị này không hỗ trợ camera (getUserMedia). ' +
        'Các app nhận dạng bàn tay sẽ không chạy được. Hãy dùng trình duyệt Chrome và gắn webcam.';
      warnEl.classList.remove('hidden');
    }
    var repo = [], drive = { list: [], errors: 0 };
    try { repo = await loadRepoApps(); } catch (e) {}
    try { drive = await loadDriveApps(); } catch (e) { drive.errors = 1; }
    items = repo.concat(drive.list);
    loaded = true;
    render();
    if (!items.length) {
      statusEl.textContent = drive.errors
        ? 'Không đọc được Google Drive (kiểm tra mạng/đăng nhập 👤). Chưa có app nào.'
        : 'Chưa có app nào. Up file .html lên repo GitHub hoặc vào folder Google Drive là sẽ hiện ở đây.';
    } else {
      statusEl.textContent = items.length + ' ứng dụng' +
        (drive.errors ? ' (Google Drive đọc lỗi, chỉ hiện phần trong repo)' : '') + '.';
      focusFirst();
    }
  }

  // ---------- mở / đóng ----------
  function focusFirst() {
    var b = listEl.querySelector('button');
    if (b) b.focus(); else document.getElementById('appsBackBtn').focus();
  }
  function openScreen() {
    screen.classList.remove('hidden');
    if (!loaded) reload(); else focusFirst();
    document.getElementById('appsBackBtn').focus();
  }
  function closeScreen() {
    screen.classList.add('hidden');
    openBtn.focus();
  }

  function stopViewer() {
    try { frame.src = 'about:blank'; } catch (e) {}
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
    currentApp = null;
  }
  function closeViewer() {
    if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
    stopViewer();
    viewer.classList.add('hidden');
    vLoading.classList.add('hidden');
    var b = listEl.querySelector('button');
    if (b) b.focus();
  }

  async function runApp(app) {
    stopViewer();
    currentApp = app;
    vTitle.textContent = app.icon + ' ' + app.name;
    viewer.classList.remove('hidden');
    vLoading.textContent = 'Đang tải ứng dụng...';
    vLoading.classList.remove('hidden');
    document.getElementById('appsVCloseBtn').focus();
    try {
      if (app.source === 'repo') {
        frame.onload = function () { vLoading.classList.add('hidden'); };
        frame.src = app.url;
      } else {
        var html = await driveFetchBlob(app);
        if (currentApp !== app) return;            // người dùng đã đóng
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        currentBlobUrl = URL.createObjectURL(blob);
        frame.onload = function () { vLoading.classList.add('hidden'); };
        frame.src = currentBlobUrl;
      }
      if (!hasCamera()) say('Thiết bị này không hỗ trợ camera - app nhận dạng tay có thể không chạy.', 'err');
    } catch (e) {
      vLoading.textContent = '❌ ' + driveErrorHint(e);
      say(driveErrorHint(e), 'err');
    }
  }

  async function downloadApp(app) {
    try {
      if (app.source === 'repo') {
        var a = document.createElement('a');
        a.href = app.url; a.download = app.file;
        document.body.appendChild(a); a.click(); a.remove();
        say('Đang tải ' + app.file, 'ok');
        return;
      }
      say('Đang tải ' + app.file + '...', 'ok');
      var html = await driveFetchBlob(app);
      var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      var b = document.createElement('a');
      b.href = url; b.download = app.file;
      document.body.appendChild(b); b.click(); b.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    } catch (e) {
      if (app.source === 'drive') {      // dự phòng: link tải trực tiếp của Drive (giống tải APK)
        window.open('https://drive.google.com/uc?export=download&id=' + encodeURIComponent(app.id), '_blank');
      } else {
        say('Không tải được file.', 'err');
      }
    }
  }

  // ---------- sự kiện ----------
  openBtn.addEventListener('click', openScreen);
  document.getElementById('appsBackBtn').addEventListener('click', closeScreen);
  document.getElementById('appsReloadBtn').addEventListener('click', reload);
  document.getElementById('appsVCloseBtn').addEventListener('click', closeViewer);
  document.getElementById('appsVFullBtn').addEventListener('click', function () {
    if (viewer.requestFullscreen) viewer.requestFullscreen().catch(function () {});
  });
  document.getElementById('appsVDownBtn').addEventListener('click', function () {
    if (currentApp) downloadApp(currentApp);
  });
  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var app = items[Number(b.getAttribute('data-i'))];
    if (!app) return;
    if (b.getAttribute('data-act') === 'run') runApp(app); else downloadApp(app);
  });

  // Phím điều khiển TV: chạy ở pha capture để chặn phím tắt của app.js khi đang ở màn Ứng dụng
  function spatialMove(dir) {
    var root = viewer.classList.contains('hidden') ? screen : viewer;
    var els = Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (b) { return b.offsetParent !== null; });
    var cur = document.activeElement;
    if (els.indexOf(cur) < 0) { if (els[0]) els[0].focus(); return; }
    var c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var best = null, bestScore = 1e12;
    els.forEach(function (el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      var dx = x - cx, dy = y - cy, ok = false, score;
      if (dir === 'ArrowRight') { ok = dx > 5; score = dx + Math.abs(dy) * 3; }
      if (dir === 'ArrowLeft')  { ok = dx < -5; score = -dx + Math.abs(dy) * 3; }
      if (dir === 'ArrowDown')  { ok = dy > 5; score = dy + Math.abs(dx) * 3; }
      if (dir === 'ArrowUp')    { ok = dy < -5; score = -dy + Math.abs(dx) * 3; }
      if (ok && score < bestScore) { best = el; bestScore = score; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }

  window.addEventListener('keydown', function (e) {
    var viewerOpen = !viewer.classList.contains('hidden');
    var screenOpen = !screen.classList.contains('hidden');
    if (!viewerOpen && !screenOpen) return;
    var k = e.key;
    if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack') {
      e.preventDefault(); e.stopPropagation();
      if (viewerOpen) closeViewer(); else closeScreen();
      return;
    }
    if (k.indexOf('Arrow') === 0) {
      e.preventDefault(); e.stopPropagation();
      spatialMove(k);
      return;
    }
    e.stopPropagation();   // chặn M, Space, F, Enter... của app.js (Enter/Tab vẫn chạy mặc định của nút)
  }, true);
})();
