(() => {
  const root = document.documentElement;
  const vi = () => root.lang === 'vi';
  const THEME_KEY = 'keybox_theme';
  const colorSchemeMedia = matchMedia('(prefers-color-scheme: light)');

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
      return 'auto';
    } catch {
      return 'auto';
    }
  }

  function setSavedTheme(mode) {
    try { localStorage.setItem(THEME_KEY, mode); } catch {}
  }

  function resolveTheme(mode, serverMode) {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    if (colorSchemeMedia.matches) return 'light';
    return serverMode || 'dark';
  }

  // Apply initial theme immediately to eliminate FOUC
  const initialMode = getSavedTheme();
  const initialEffective = resolveTheme(initialMode, 'dark');
  root.dataset.theme = initialEffective;
  root.dataset.themeMode = initialMode;

  const layer = document.createElement('div');
  layer.className = 'site-background';
  layer.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.alt = '';
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  const overlay = document.createElement('div');
  overlay.className = 'background-overlay';
  layer.append(image, video, overlay);
  document.body.prepend(layer);
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'none';
  const music = document.createElement('button');
  music.className = 'btn music-control hidden';
  music.type = 'button';
  music.setAttribute('aria-pressed', 'false');
  document.body.append(music);
  let settings;
  let preference = false;
  let allowed = false;
  try { preference = localStorage.getItem('keybox_music') === 'on'; } catch {}
  const narrow = matchMedia('(max-width: 767px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function musicLabel() {
    music.textContent = !audio.paused ? (vi() ? '♫ Tắt nhạc' : '♫ Pause music') : (vi() ? '♫ Bật nhạc' : '♫ Play music');
    music.setAttribute('aria-pressed', String(!audio.paused));
  }
  music.addEventListener('click', async () => {
    if (!audio.paused) {
      audio.pause();
      preference = false;
    } else {
      try { await audio.play(); preference = true; allowed = true; }
      catch { music.textContent = vi() ? 'Không phát được nhạc. Thử lại' : 'Playback failed. Try again'; return; }
    }
    try { localStorage.setItem('keybox_music', preference ? 'on' : 'off'); } catch {}
    musicLabel();
  });
  function background() {
    if (!settings) return;
    const media = settings.media;
    const prefix = narrow.matches && media.mobile_url ? 'mobile' : 'desktop';
    const url = media[`${prefix}_url`];
    const poster = media[`${prefix}_poster`];
    const signature = `${prefix}|${url}|${poster}|${reduced.matches}`;
    if (layer.dataset.media === signature) return;
    layer.dataset.media = signature;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    image.hidden = true;
    image.removeAttribute('src');
    if (!url) return;
    if (media[`${prefix}_type`] === 'video' && !reduced.matches) {
      video.hidden = false;
      video.poster = poster || '';
      video.src = url;
      video.play().catch(() => {
        video.hidden = true;
        if (poster) { image.src = poster; image.hidden = false; }
      });
    } else {
      const source = media[`${prefix}_type`] === 'video' ? poster : url;
      if (source) { image.src = source; image.hidden = false; }
    }
  }
  function apply(config) {
    settings = config;
    const a = config.appearance;
    const mode = getSavedTheme();
    const effectiveTheme = resolveTheme(mode, a.mode);

    root.dataset.theme = effectiveTheme;
    root.dataset.themeMode = mode;

    let primaryColor = a.accent;
    let borderFocus = effectiveTheme === 'dark' ? '#c5ceff' : '#4f5be8';
    if (effectiveTheme === 'light') {
      const hex = a.accent.slice(1);
      const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      if (luminance > 0.45 && a.mode === 'dark') {
        primaryColor = '#4f5be8';
      }
    }

    root.style.setProperty('--primary', primaryColor);
    root.style.setProperty('--primary-hover', primaryColor);
    root.style.setProperty('--primary-soft', `${primaryColor}20`);
    root.style.setProperty('--border-focus', borderFocus);
    root.style.setProperty('--card-opacity', a.card_opacity);
    root.style.setProperty('--card-blur', `${a.card_blur ?? 24}px`);
    root.style.setProperty('--background-dim', a.background_dim);

    const hex = primaryColor.slice(1);
    const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    root.style.setProperty('--on-primary', luminance > 0.179 ? '#000000' : '#ffffff');
    background();
    const changed = audio.getAttribute('src') !== config.media.music_url;
    if (changed) {
      audio.pause();
      if (config.media.music_url) audio.src = config.media.music_url;
      else audio.removeAttribute('src');
    }
    audio.volume = config.media.music_volume;
    music.classList.toggle('hidden', !config.media.music_url);
    musicLabel();
    window.dispatchEvent(new CustomEvent('keybox-theme-change', { detail: { mode, effectiveTheme } }));
    window.dispatchEvent(new CustomEvent('keybox-settings', { detail: config }));
  }

  window.KeyboxTheme = {
    getMode: getSavedTheme,
    getEffective: () => root.dataset.theme || 'dark',
    setMode: (mode) => {
      setSavedTheme(mode);
      if (settings) {
        apply(settings);
      } else {
        const eff = resolveTheme(mode, 'dark');
        root.dataset.theme = eff;
        root.dataset.themeMode = mode;
        window.dispatchEvent(new CustomEvent('keybox-theme-change', { detail: { mode, effectiveTheme: eff } }));
      }
    },
    cycle: () => {
      const cur = getSavedTheme();
      const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
      window.KeyboxTheme.setMode(next);
      return next;
    }
  };

  function onSchemeChange() {
    if (getSavedTheme() === 'auto') {
      if (settings) apply(settings);
      else window.KeyboxTheme.setMode('auto');
    }
  }
  if (colorSchemeMedia.addEventListener) {
    colorSchemeMedia.addEventListener('change', onSchemeChange);
  } else if (colorSchemeMedia.addListener) {
    colorSchemeMedia.addListener(onSchemeChange);
  }

  async function load() {
    try {
      const response = await fetch('/api/site-settings', { cache: 'no-store' });
      if (response.ok) apply(await response.json());
    } catch { /* Keep the readable default theme when settings are unavailable. */ }
  }
  narrow.addEventListener('change', background);
  reduced.addEventListener('change', background);
  video.addEventListener('error', () => {
    video.hidden = true;
    if (video.poster) { image.src = video.poster; image.hidden = false; }
  });
  document.addEventListener('pointerdown', () => {
    if (preference && !allowed && audio.getAttribute('src')) {
      allowed = true;
      audio.play().then(musicLabel).catch(musicLabel);
    }
  }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.pause(); video.pause(); }
    else {
      if (!video.hidden && !reduced.matches) video.play().catch(() => {});
      if (allowed && preference && audio.getAttribute('src')) audio.play().catch(() => {});
    }
    musicLabel();
  });
  audio.addEventListener('play', musicLabel);
  audio.addEventListener('pause', musicLabel);
  new MutationObserver(musicLabel).observe(root, { attributes: true, attributeFilter: ['lang'] });
  load();
  setInterval(load, 60000);
})();
