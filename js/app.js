/* ============================================================
   NURUL SHOLAWAT — Main Application (FULL FIXED)
   Support: Localhost (mock UI) | Production (Apps Script)
   ============================================================ */

const App = (() => {
  'use strict';

  // ============ CONFIGURATION ============
  const CONFIG = {
    // ⚠️ GANTI dengan URL Apps Script kamu setelah deploy
    API_URL: 'https://script.google.com/macros/s/AKfycbyxsIy0E0QcHnZsCiazVK2UjN7S5i69lv6QMIrH_h2a2ByhMMtK4frLAz_cMg9aHjw/exec',
    SECRET: 'AKsiejwp8234',
    
    // Environment settings
    MODE: 'auto', // 'auto' | 'prod'
    DEBUG: true, // Set true untuk console log verbose
    CACHE_ENABLED: true,
    CACHE_TTL: 5 * 60 * 1000,
    ALLOW_DEV_LOGIN: false
  };

  // ============ ENVIRONMENT DETECTION ============
  function detectEnvironment() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '' ||
      hostname.match(/^192\.168\./) ||
      hostname.match(/^10\./) ||
      protocol === 'file:'
    ) {
      return 'dev';
    }
    return 'prod';
  }

  CONFIG.MODE = CONFIG.MODE === 'auto' ? detectEnvironment() : CONFIG.MODE;
  CONFIG.IS_DEV = CONFIG.MODE === 'dev';
  CONFIG.IS_PROD = CONFIG.MODE === 'prod';

  // ============ LOGGING ============
  const logger = {
    log: (...args) => CONFIG.DEBUG && console.log('[NS]', ...args),
    warn: (...args) => CONFIG.DEBUG && console.warn('[NS]', ...args),
    error: (...args) => console.error('[NS]', ...args)
  };

  logger.log(`Mode: ${CONFIG.MODE} | API: ${CONFIG.API_URL}`);

  // ============ STATE ============
  const state = {
    sholawat: [],
    filtered: [],
    currentId: null,
    user: JSON.parse(localStorage.getItem('ns_user') || 'null'),
    favorites: JSON.parse(localStorage.getItem('ns_favorites') || '[]'),
    theme: localStorage.getItem('ns_theme') || 'light',
    searchQuery: '',
    sortBy: 'newest',
    cache: new Map(),
    loading: false
  };

  // ============ UTILITIES ============
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d)) return String(dateStr);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return String(dateStr); }
  }

  function isNew(dateStr) {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = (now - d) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    } catch { return false; }
  }

  function isFavorite(id) {
    return state.favorites.includes(Number(id));
  }

  // ============ TOAST ============
  function toast(message, type = 'info') {
    const container = $('#toast-container');
    if (!container) return;
    
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    el.innerHTML = `<i data-lucide="${icons[type] || 'info'}" class="icon-sm"></i> ${escapeHtml(message)}`;
    container.appendChild(el);
    if (window.lucide) lucide.createIcons({ nodes: [el] });
    
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      el.style.transition = '0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // ============ CACHE ============
  const cache = {
    set(key, data) {
      if (!CONFIG.CACHE_ENABLED || CONFIG.IS_DEV) return;
      state.cache.set(key, { data, timestamp: Date.now() });
    },
    get(key) {
      if (!CONFIG.CACHE_ENABLED || CONFIG.IS_DEV) return null;
      const cached = state.cache.get(key);
      if (!cached) return null;
      if (Date.now() - cached.timestamp > CONFIG.CACHE_TTL) {
        state.cache.delete(key);
        return null;
      }
      return cached.data;
    },
    clear() { state.cache.clear(); }
  };

  // ============ API (STRICT AUTH - NO BYPASS) ============
  async function api(action, data = null) {
    if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID')) {
      throw new Error('API belum dikonfigurasi. Hubungi admin.');
    }

    const cacheKey = data ? null : action;
    if (cacheKey) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.log(`Cache hit: ${cacheKey}`);
        return cached;
      }
    }

    try {
      let url = `${CONFIG.API_URL}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(CONFIG.SECRET)}`;
      let options = { redirect: 'follow' };

      if (data) {
        options.method = 'POST';
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        options.body = JSON.stringify({ action, ...data, token: CONFIG.SECRET });
        url = CONFIG.API_URL;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      options.signal = controller.signal;

      logger.log(`API call: ${action}`, data);

      const res = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      if (cacheKey) cache.set(cacheKey, json);
      logger.log(`API response: ${action}`, json);
      return json;

    } catch (err) {
      logger.error('API Error:', err);
      
      if (err.name === 'AbortError') {
        throw new Error('Request timeout. Periksa koneksi internet.');
      }
      
      if (['login', 'addSholawat', 'addFavorite', 'removeFavorite'].includes(action)) {
        throw err;
      }
      
      if (CONFIG.IS_DEV && action === 'getSholawat') {
        logger.warn('API gagal, menggunakan mock data untuk testing UI');
        toast('Koneksi ke server gagal. Menampilkan data contoh.', 'info');
        return getMockSholawat();
      }
      
      throw err;
    }
  }

  function getMockSholawat() {
    return [
      {
        id: 1,
        judul: 'Sholawat Badar (Contoh)',
        kategori: 'Suluk Arab',
        lirik: '<p style="text-align:center;"><em>Ini adalah data contoh untuk testing UI.</em></p>',
        tanggal_tambah: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        views: 120,
        audio_url: ''
      },
      {
        id: 2,
        judul: 'Sholawat Nariyah (Contoh)',
        kategori: 'Arab (Biasa)',
        lirik: '<p style="text-align:center;"><em>Data contoh.</em></p>',
        tanggal_tambah: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        views: 85,
        audio_url: ''
      }
    ];
  }

  // ============ THEME ============
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('ns_theme', state.theme);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    const icon = $('#theme-icon');
    if (icon) {
      icon.setAttribute('data-lucide', state.theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) lucide.createIcons();
    }
  }

  // ============ NAVIGATION ============
  function navigate(view, param) {
    closeMenu();
    const views = $$('.view');
    views.forEach(v => v.classList.remove('active'));

    $$('.nav-link, .mobile-link').forEach(l => l.classList.remove('active'));
    $$(`[data-nav="${view}"]`).forEach(l => l.classList.add('active'));

    switch (view) {
      case 'home':
        $('#view-home').classList.add('active');
        window.location.hash = '/';
        break;
      case 'detail':
        state.currentId = Number(param);
        $('#view-detail').classList.add('active');
        renderDetail();
        window.location.hash = `/detail/${param}`;
        break;
      case 'favorites':
        $('#view-favorites').classList.add('active');
        renderFavorites();
        window.location.hash = '/favorites';
        break;
      case 'tambah':
        if (!state.user) {
          toast('Silakan masuk terlebih dahulu', 'info');
          navigate('login');
          return;
        }
        $('#view-tambah').classList.add('active');
        window.location.hash = '/tambah';
        break;
      case 'login':
        $('#view-login').classList.add('active');
        renderLoginState();
        window.location.hash = '/login';
        break;
      default:
        $('#view-home').classList.add('active');
        window.location.hash = '/';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.lucide) lucide.createIcons();
  }

  function handleHash() {
    const hash = window.location.hash || '#/';
    if (hash.startsWith('#/detail/')) {
      const id = hash.split('/')[2];
      navigate('detail', id);
    } else if (hash === '#/favorites') {
      navigate('favorites');
    } else if (hash === '#/tambah') {
      navigate('tambah');
    } else if (hash === '#/login') {
      navigate('login');
    } else {
      navigate('home');
    }
  }

  function toggleMenu() {
    $('#mobile-menu').classList.toggle('open');
  }

  function closeMenu() {
    $('#mobile-menu').classList.remove('open');
  }

  // ============ RENDER LIST ============
  function renderList(container, items, emptyMsg) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="book-open" class="icon-lg"></i>
          <p>${escapeHtml(emptyMsg || 'Tidak ada sholawat ditemukan.')}</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = items.map((item, i) => {
      const newBadge = isNew(item.tanggal_tambah) ? '<span class="badge badge-new">NEW</span>' : '';
      const favBadge = isFavorite(item.id) ? '<span class="badge badge-fav">♥</span>' : '';
      return `
        <div class="sholawat-item" onclick="App.navigate('detail', ${item.id})">
          <span class="sholawat-item-number">${i + 1}</span>
          <div class="sholawat-item-info">
            <div class="sholawat-item-title">
              ${escapeHtml(item.judul)}
              ${newBadge}
              ${favBadge}
            </div>
            <div class="sholawat-item-meta">
              <span class="badge badge-category">${escapeHtml(item.kategori || '')}</span>
              <span>${formatDate(item.tanggal_tambah)}</span>
            </div>
          </div>
          <span class="sholawat-item-arrow"><i data-lucide="chevron-right" class="icon-sm"></i></span>
        </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  function applyFilters() {
    let items = [...state.sholawat];
    const q = state.searchQuery.toLowerCase().trim();

    if (q) {
      items = items.filter(s =>
        (s.judul || '').toLowerCase().includes(q) ||
        (s.kategori || '').toLowerCase().includes(q)
      );
    }

    switch (state.sortBy) {
      case 'newest':
        items.sort((a, b) => new Date(b.tanggal_tambah) - new Date(a.tanggal_tambah));
        break;
      case 'oldest':
        items.sort((a, b) => new Date(a.tanggal_tambah) - new Date(b.tanggal_tambah));
        break;
      case 'az':
        items.sort((a, b) => (a.judul || '').localeCompare(b.judul || ''));
        break;
      case 'za':
        items.sort((a, b) => (b.judul || '').localeCompare(a.judul || ''));
        break;
      case 'favorite':
        items = items.filter(s => isFavorite(s.id));
        items.sort((a, b) => new Date(b.tanggal_tambah) - new Date(a.tanggal_tambah));
        break;
    }

    state.filtered = items;
    const container = $('#sholawat-list');
    renderList(container, items, 'Tidak ada sholawat yang cocok.');
    const countEl = $('#sholawat-count');
    if (countEl) countEl.textContent = `${items.length} sholawat ditemukan`;
  }

  function handleSearch(value) {
    state.searchQuery = value;
    const clearBtn = $('#search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'flex' : 'none';
    applyFilters();
  }

  function clearSearch() {
    const input = $('#search-input');
    if (input) input.value = '';
    state.searchQuery = '';
    const clearBtn = $('#search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    applyFilters();
  }

  function handleSort(value) {
    state.sortBy = value;
    applyFilters();
  }

  // ============ RENDER DETAIL ============
  function renderDetail() {
    const item = state.sholawat.find(s => s.id === state.currentId);
    if (!item) {
      const detailCard = $('#detail-card');
      if (detailCard) detailCard.innerHTML = '<p>Sholawat tidak ditemukan.</p>';
      return;
    }

    const catEl = $('#detail-category'); if (catEl) catEl.textContent = item.kategori || '';
    const titleEl = $('#detail-title'); if (titleEl) titleEl.textContent = item.judul || '';
    const dateEl = $('#detail-date'); if (dateEl) dateEl.textContent = formatDate(item.tanggal_tambah);
    const viewsEl = $('#detail-views'); if (viewsEl) viewsEl.textContent = (item.views || 0) + 'x dibaca';
    const lyricsEl = $('#detail-lyrics'); if (lyricsEl) lyricsEl.innerHTML = item.lirik || '<p>Belum ada lirik.</p>';

    // Handle Audio (Safe Checks)
    const audioSection = $('#audio-section');
    if (audioSection && item.audio_url && item.audio_url.trim()) {
      audioSection.style.display = 'block';
      const audioUrl = item.audio_url.trim();
      const audioPlayer = $('#audio-player');
      const tiktokEmbed = $('#tiktok-embed');
      const externalLink = $('#audio-external-link');
      const sourceText = $('#audio-source-text');

      if (isTikTokUrl(audioUrl)) {
        renderTikTokEmbed(audioUrl, tiktokEmbed);
        if (audioPlayer) audioPlayer.style.display = 'none';
        if (externalLink) externalLink.href = audioUrl;
        if (sourceText) sourceText.textContent = 'Audio dari TikTok';
      } else if (isYouTubeUrl(audioUrl)) {
        renderYouTubeEmbed(audioUrl, tiktokEmbed);
        if (audioPlayer) audioPlayer.style.display = 'none';
        if (externalLink) externalLink.href = audioUrl;
        if (sourceText) sourceText.textContent = 'Audio dari YouTube';
      } else if (isSoundCloudUrl(audioUrl)) {
        renderSoundCloudEmbed(audioUrl, tiktokEmbed);
        if (audioPlayer) audioPlayer.style.display = 'none';
        if (externalLink) externalLink.href = audioUrl;
        if (sourceText) sourceText.textContent = 'Audio dari SoundCloud';
      } else if (audioUrl.match(/\.(mp3|wav|ogg|m4a)($|\?)/i)) {
        if (audioPlayer) {
          audioPlayer.querySelector('source').src = audioUrl;
          audioPlayer.load();
          audioPlayer.style.display = 'block';
        }
        if (tiktokEmbed) tiktokEmbed.style.display = 'none';
        if (externalLink) externalLink.href = audioUrl;
        if (sourceText) sourceText.textContent = 'File audio langsung';
      } else {
        audioSection.style.display = 'none';
        toast('Format audio tidak didukung', 'info');
      }
    } else if (audioSection) {
      audioSection.style.display = 'none';
    }

    // Favorite state
    const fav = isFavorite(item.id);
    const favBtn = $('#btn-detail-fav');
    if (favBtn) {
      favBtn.classList.toggle('active', fav);
      const favText = $('#detail-fav-text');
      if (favText) favText.textContent = fav ? 'Hapus Favorit' : 'Favorit';
    }

    // Prev/Next
    const idx = state.sholawat.findIndex(s => s.id === state.currentId);
    const btnPrev = $('#btn-prev');
    const btnNext = $('#btn-next');
    if (btnPrev) btnPrev.disabled = idx <= 0;
    if (btnNext) btnNext.disabled = idx >= state.sholawat.length - 1;

    // Increment views
    api('incrementView', { id: item.id }).catch(() => {});

    if (window.lucide) lucide.createIcons();
  }

  // ============ AUDIO HELPERS ============
  function isTikTokUrl(url) {
    return url.match(/tiktok\.com\/(@[\w.]+\/video\/\d+)/i);
  }

  function isYouTubeUrl(url) {
    return url.match(/(youtube\.com|youtu\.be)/i);
  }

  function isSoundCloudUrl(url) {
    return url.match(/soundcloud\.com/i);
  }

  function renderTikTokEmbed(url, container) {
    if (!container) return;
    container.style.display = 'block';
    
    const match = url.match(/tiktok\.com\/(@[\w.]+\/video\/\d+)/i);
    if (!match) {
      container.innerHTML = '<p style="color:var(--error);text-align:center;">URL TikTok tidak valid</p>';
      return;
    }

    container.innerHTML = `
      <blockquote class="tiktok-embed" cite="${url}" data-video-id="${match[1]}">
        <section>
          <a target="_blank" href="${url}">Lihat video di TikTok</a>
        </section>
      </blockquote>
    `;

    if (!document.querySelector('script[src="https://www.tiktok.com/embed.js"]')) {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.tiktok.com/embed.js';
      document.body.appendChild(script);
    }
  }

  function renderYouTubeEmbed(url, container) {
    if (!container) return;
    container.style.display = 'block';
    
    let videoId = '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      videoId = match[2];
    }

    if (!videoId) {
      container.innerHTML = '<p style="color:var(--error);text-align:center;">URL YouTube tidak valid</p>';
      return;
    }

    container.innerHTML = `
      <iframe 
        width="100%" 
        height="120" 
        src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1" 
        title="YouTube audio player" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen
        style="border-radius:var(--radius);"
      ></iframe>
    `;
  }

  function renderSoundCloudEmbed(url, container) {
    if (!container) return;
    container.style.display = 'block';
    
    const oEmbedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    
    fetch(oEmbedUrl)
      .then(res => res.json())
      .then(data => {
        container.innerHTML = data.html;
      })
      .catch(err => {
        console.error('SoundCloud embed error:', err);
        container.innerHTML = `
          <a href="${url}" target="_blank" rel="noopener" class="audio-external-link" style="width:100%;justify-content:center;">
            <i data-lucide="external-link" class="icon-sm"></i>
            <span>Buka di SoundCloud</span>
          </a>
        `;
        if (window.lucide) lucide.createIcons();
      });
  }

  // ============ NAVIGATION HELPERS (FIXED: Previously Missing) ============
  function navigatePrev() {
    const idx = state.sholawat.findIndex(s => s.id === state.currentId);
    if (idx > 0) navigate('detail', state.sholawat[idx - 1].id);
  }

  function navigateNext() {
    const idx = state.sholawat.findIndex(s => s.id === state.currentId);
    if (idx < state.sholawat.length - 1) navigate('detail', state.sholawat[idx + 1].id);
  }

  // ============ SUBMIT SHOLAWAT ============
  async function submitSholawat(e) {
    e.preventDefault();
    if (!state.user) {
      toast('Silakan masuk terlebih dahulu', 'info');
      navigate('login');
      return;
    }

    const judul = $('#input-judul').value.trim();
    const kategori = $('#input-kategori').value;
    const lirik = $('#editor-area').innerHTML.trim();
    const audioUrlInput = $('#input-audio-url');
    const audioUrl = audioUrlInput ? audioUrlInput.value.trim() : '';

    if (!judul || !kategori || !lirik || lirik === '<br>') {
      toast('Mohon lengkapi semua field', 'error');
      return;
    }

    const btn = $('#btn-submit-sholawat');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Menyimpan...';
    }

    try {
      await api('addSholawat', {
        judul,
        kategori,
        lirik,
        audio_url: audioUrl,
        phone: state.user.phone
      });

      toast('Sholawat berhasil ditambahkan! ✨', 'success');
      const form = $('#form-tambah');
      if (form) form.reset();
      const editor = $('#editor-area');
      if (editor) editor.innerHTML = '';

      await loadSholawat();
      setTimeout(() => navigate('home'), 1000);
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="icon-sm"></i> Simpan Sholawat';
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  // ============ FAVORITES ============
  function toggleFavoriteDetail() {
    if (!state.user) {
      toast('Silakan masuk untuk menambah favorit', 'info');
      navigate('login');
      return;
    }

    const id = state.currentId;
    const idx = state.favorites.indexOf(Number(id));

    if (idx > -1) {
      state.favorites.splice(idx, 1);
      api('removeFavorite', { phone: state.user.phone, sholawat_id: id }).catch(() => {});
      toast('Dihapus dari favorit', 'info');
    } else {
      state.favorites.push(Number(id));
      api('addFavorite', { phone: state.user.phone, sholawat_id: id }).catch(() => {});
      toast('Ditambahkan ke favorit ♥', 'success');
    }

    localStorage.setItem('ns_favorites', JSON.stringify(state.favorites));
    renderDetail();
  }

  function renderFavorites() {
    const container = $('#favorites-list');
    const favItems = state.sholawat.filter(s => isFavorite(s.id));
    renderList(container, favItems, 'Belum ada sholawat favorit.');
  }

  // ============ LOGIN (STRICT AUTH) ============
  function renderLoginState() {
    const form = $('#form-login');
    const logged = $('#login-logged');

    if (state.user) {
      if (form) form.style.display = 'none';
      if (logged) logged.style.display = 'flex';
      
      const displayName = state.user.nama || state.user.phone;
      
      // Safe DOM selection (fallback to logged-phone if logged-name doesn't exist)
      const nameEl = $('#logged-name') || $('#logged-phone');
      if (nameEl) nameEl.textContent = displayName;
      
      const mobileLabel = $('#mobile-user-label');
      if (mobileLabel) mobileLabel.textContent = displayName;
      
      const btnUser = $('#btn-user');
      if (btnUser) {
        btnUser.innerHTML = '<i data-lucide="user-check" class="icon-sm green"></i>';
        btnUser.title = `Masuk sebagai ${displayName}`;
      }
    } else {
      if (form) form.style.display = 'block';
      if (logged) logged.style.display = 'none';
      
      const mobileLabel = $('#mobile-user-label');
      if (mobileLabel) mobileLabel.textContent = 'Masuk';
      
      const btnUser = $('#btn-user');
      if (btnUser) {
        btnUser.innerHTML = '<i data-lucide="user" class="icon-sm"></i>';
        btnUser.title = 'Masuk ke akun';
      }
    }
    if (window.lucide) lucide.createIcons();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const phoneInput = $('#input-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const statusEl = $('#login-status');
    const btn = $('#btn-login');

    if (!/^\d{9,12}$/.test(phone)) {
      if (statusEl) {
        statusEl.className = 'login-status error';
        statusEl.innerHTML = '✗ Nomor HP harus 9-12 digit angka.';
        statusEl.style.display = 'block';
      }
      return;
    }

    if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID')) {
      if (statusEl) {
        statusEl.className = 'login-status error';
        statusEl.innerHTML = `
          <strong>✗ API belum dikonfigurasi</strong>
          <span style="font-size:13px;margin-top:4px;display:block;">
            Hubungi admin untuk setup sistem.
          </span>
        `;
        statusEl.style.display = 'block';
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Memverifikasi...';
    }
    if (statusEl) statusEl.style.display = 'none';

    try {
      const res = await api('login', { phone });
      
      state.user = { phone, nama: res.nama || phone };
      localStorage.setItem('ns_user', JSON.stringify(state.user));

      if (res.favorites && Array.isArray(res.favorites)) {
        state.favorites = res.favorites.map(Number);
        localStorage.setItem('ns_favorites', JSON.stringify(state.favorites));
      }

      if (statusEl) {
        statusEl.className = 'login-status success';
        statusEl.innerHTML = '✓ Berhasil masuk!';
        statusEl.style.display = 'block';
      }
      toast('Assalamu\'alaikum, ' + state.user.nama + '!', 'success');

      setTimeout(() => {
        renderLoginState();
        navigate('home');
      }, 800);
      
    } catch (err) {
      if (statusEl) {
        statusEl.className = 'login-status error';
        let errorMsg = '✗ Gagal masuk.';
        
        if (err.message.includes('tidak terdaftar')) {
          errorMsg = `
            <strong>✗ Nomor tidak terdaftar</strong>
            <span style="font-size:13px;margin-top:4px;display:block;">
              Nomor <strong>+62${phone}</strong> belum ada di database.<br/>
              Hubungi admin untuk pendaftaran.
            </span>
          `;
        } else if (err.message.includes('Unauthorized') || err.message.includes('token')) {
          errorMsg = '✗ Token tidak valid. Hubungi developer.';
        } else if (err.message.includes('timeout') || err.message.includes('koneksi') || err.message.includes('Failed to fetch')) {
          errorMsg = `
            <strong>✗ Koneksi ke server gagal</strong>
            <span style="font-size:13px;margin-top:4px;display:block;">
              Periksa koneksi internet atau hubungi admin.
            </span>
          `;
        } else if (err.message.includes('API belum dikonfigurasi')) {
          errorMsg = `
            <strong>✗ Sistem belum siap</strong>
            <span style="font-size:13px;margin-top:4px;display:block;">
              Hubungi admin untuk setup.
            </span>
          `;
        } else {
          errorMsg = '✗ ' + err.message;
        }
        
        statusEl.innerHTML = errorMsg;
        statusEl.style.display = 'block';
      }
      logger.error('Login error:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in" class="icon-sm"></i> Masuk';
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  function logout() {
    state.user = null;
    localStorage.removeItem('ns_user');
    toast('Berhasil keluar', 'info');
    renderLoginState();
    navigate('home');
  }

  // ============ RICH TEXT EDITOR (FIXED) ============
  function editorCmd(command, value = null) {
    const editor = $('#editor-area');
    if (!editor) return;

    editor.focus();
    const success = document.execCommand(command, false, value);

    if (!success && CONFIG.DEBUG) {
      console.warn(`[Editor] Gagal mengeksekusi command: ${command}`);
    }

    if (window.lucide) lucide.createIcons();
  }

  function insertLink() {
    const editor = $('#editor-area');
    if (!editor) return;
    editor.focus();
    
    const url = prompt('Masukkan URL link (contoh: https://youtube.com/watch?v=...):');
    
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert('URL harus diawali dengan http:// atau https://');
        return;
      }

      const selection = window.getSelection();
      if (selection.toString().trim().length === 0) {
        document.execCommand('insertText', false, url);
      }
      
      document.execCommand('createLink', false, url);
      if (window.lucide) lucide.createIcons();
    }
  }

  function insertImage() {
    const editor = $('#editor-area');
    if (!editor) return;
    editor.focus();
    
    const url = prompt('Masukkan URL gambar (contoh: https://example.com/gambar.jpg):');
    
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert('URL gambar harus diawali dengan http:// atau https://');
        return;
      }
      
      document.execCommand('insertImage', false, url);
      if (window.lucide) lucide.createIcons();
    }
  }

  // ============ LOAD DATA ============
  async function loadSholawat() {
    if (state.loading) return;
    state.loading = true;

    try {
      const data = await api('getSholawat');
      state.sholawat = (Array.isArray(data) ? data : []).map(s => ({
        ...s,
        id: Number(s.id)
      }));
      applyFilters();
    } catch (err) {
      logger.error('Load sholawat error:', err);
      const listEl = $('#sholawat-list');
      if (listEl) {
        listEl.innerHTML = `
          <div class="empty-state">
            <i data-lucide="alert-circle" class="icon-lg"></i>
            <p>Gagal memuat data.</p>
            <button class="btn btn-outline btn-sm" onclick="App.loadSholawat()" style="margin-top:16px;">
              <i data-lucide="refresh-cw" class="icon-sm"></i> Coba Lagi
            </button>
          </div>`;
        if (window.lucide) lucide.createIcons();
      }
    } finally {
      state.loading = false;
    }
  }

  // ============ DEV TOOLS ============
  async function testConnection() {
    console.log('🔍 Testing API connection...');
    console.log('API URL:', CONFIG.API_URL);
    
    if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID')) {
      console.error('❌ API URL belum dikonfigurasi!');
      toast('API belum dikonfigurasi. Lihat console.', 'error');
      return;
    }

    try {
      const data = await api('getSholawat');
      console.log('✅ API connection successful!');
      console.log(`📚 Loaded ${data.length} sholawat`);
      toast('Koneksi API berhasil! ✓', 'success');
    } catch (err) {
      console.error('❌ API connection failed:', err);
      toast('Koneksi API gagal. Lihat console.', 'error');
    }
  }

  function showInfo() {
    const info = {
      Mode: CONFIG.MODE,
      'API URL': CONFIG.API_URL,
      'API Configured': !CONFIG.API_URL.includes('YOUR_SCRIPT_ID'),
      'Total Sholawat': state.sholawat.length,
      'User': state.user ? state.user.phone : 'Not logged in',
      'Favorites': state.favorites.length,
      'Theme': state.theme
    };
    console.table(info);
    toast('Info ditampilkan di console (F12)', 'info');
  }

  function clearCache() {
    cache.clear();
    toast('Cache dibersihkan', 'success');
  }

  // ============ INIT ============
  function init() {
    initTheme();
    loadSholawat();
    handleHash();
    window.addEventListener('hashchange', handleHash);
    if (window.lucide) lucide.createIcons();

    if (CONFIG.IS_DEV) {
      const badge = document.createElement('div');
      badge.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 16px;
        padding: 6px 12px;
        background: #fbbf24;
        color: #000;
        font-size: 11px;
        font-weight: 700;
        border-radius: 100px;
        z-index: 9999;
        font-family: monospace;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        cursor: pointer;
      `;
      badge.textContent = `DEV MODE`;
      badge.title = 'Klik untuk test koneksi API';
      badge.onclick = testConnection;
      document.body.appendChild(badge);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeView = $('.view.active');
        if (activeView && activeView.id !== 'view-home') {
          navigate('home');
        }
      }
    });

    window.addEventListener('online', () => {
      toast('Koneksi internet kembali', 'success');
      if (CONFIG.IS_PROD) loadSholawat();
    });

    window.addEventListener('offline', () => {
      toast('Koneksi internet terputus', 'error');
    });

    logger.log('App initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============ PUBLIC API ============
  return {
    navigate,
    toggleTheme,
    toggleMenu,
    closeMenu,
    handleSearch,
    clearSearch,
    handleSort,
    navigatePrev,    // <-- FIXED: Now properly exposed
    navigateNext,    // <-- FIXED: Now properly exposed
    toggleFavoriteDetail,
    handleLogin,
    logout,
    editorCmd,
    insertLink,
    insertImage,
    submitSholawat,
    loadSholawat,
    testConnection,
    showInfo,
    clearCache,
    getState: () => ({ ...state }),
    getConfig: () => ({ ...CONFIG })
  };
})();