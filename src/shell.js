'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const api = window.cloudglass;

const sc = $('#sc');
const body = document.body;

/* ------------------------------------------------------------ liquid glass */

const GLASS = {
  sidebar: { bevel: 22, scale: 40 },
  np: { bevel: 16, scale: 32 },
  navcaps: { bevel: 14, scale: 30 },
  wincaps: { bevel: 14, scale: 30 },
  settings: { bevel: 20, scale: 36 },
  offline: { bevel: 20, scale: 36 },
};
for (const el of $$('[data-glass]')) {
  const key = el.dataset.glass;
  if (!el.hidden) CGLiquid.attach(el, key, GLASS[key]);
}

// Specular sheen follows the pointer across glass surfaces.
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest && e.target.closest('.glass');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

/* ------------------------------------------------------------ window state */

const toast = $('#toast');
let toastTimer = 0;
function showToast(html, ms = 3200) {
  toast.innerHTML = html;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
}

let wasFullscreen = false;
function applyWindowState(s) {
  const fullscreen = !!s.fullscreen;
  body.classList.toggle('is-maximized', !!s.maximized);
  body.classList.toggle('is-blurred', s.focused === false);
  body.classList.toggle('is-fullscreen', fullscreen);
  $('#maxIcon').setAttribute('href', s.maximized ? '#i-restore' : '#i-max');
  $('[data-win="maximize"]').title = s.maximized ? 'Restore' : 'Maximize';
  $('#fsIcon').setAttribute('href', fullscreen ? '#i-collapse' : '#i-expand');
  $('[data-win="fullscreen"]').title = fullscreen ? 'Exit full screen (F11)' : 'Full screen (F11)';
  if (fullscreen && !wasFullscreen) showToast('Press <kbd>F11</kbd> or the button on the right to exit full screen');
  if (!fullscreen && wasFullscreen) toast.hidden = true;
  wasFullscreen = fullscreen;
}
api.onWindowState(applyWindowState);

for (const btn of $$('[data-win]')) {
  btn.addEventListener('click', () => api.windowAction(btn.dataset.win));
}
$('.titlebar__fill').addEventListener('dblclick', () => api.windowAction('maximize'));

/* ---------------------------------------------------------------- settings */

let settings = {};

function applySettings(s) {
  settings = s;
  body.classList.remove('material-acrylic', 'material-mica', 'material-none');
  body.classList.add(`material-${s.material}`);
  body.classList.toggle('no-ambient', !s.ambient);
  for (const input of $$('[data-setting]')) input.checked = !!s[input.dataset.setting];
  const order = ['acrylic', 'mica', 'none'];
  $('#materialSeg').style.setProperty('--i', String(Math.max(0, order.indexOf(s.material))));
  for (const b of $$('[data-material]')) b.setAttribute('aria-checked', String(b.dataset.material === s.material));
}
api.onSettings(applySettings);

for (const input of $$('[data-setting]')) {
  input.addEventListener('change', async () => {
    applySettings(await api.setSetting(input.dataset.setting, input.checked));
  });
}
for (const b of $$('[data-material]')) {
  b.addEventListener('click', async () => applySettings(await api.setSetting('material', b.dataset.material)));
}

function applyPrivacyStats({ blocked = 0 } = {}) {
  $('#blockedStat').textContent = blocked
    ? `${blocked.toLocaleString()} tracker request${blocked === 1 ? '' : 's'} blocked this session`
    : 'Third-party analytics and ad tracking';
}
api.onPrivacyStats(applyPrivacyStats);

$('#eraseBtn').addEventListener('click', async () => {
  togglePopover(false);
  if (await api.eraseData()) {
    renderNowPlaying({});
    showToast('SoundCloud data erased. You are signed out.');
  }
});

const pop = $('#settings');
let popAttached = false;
function togglePopover(force) {
  const show = force ?? pop.hidden;
  pop.hidden = !show;
  if (show && !popAttached) {
    CGLiquid.attach(pop, 'settings', GLASS.settings);
    popAttached = true;
  }
}
$('#settingsBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover();
});
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !$('#settingsBtn').contains(e.target)) togglePopover(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') togglePopover(false);
});
sc.addEventListener('focus', () => togglePopover(false));

/* -------------------------------------------------------------- navigation */

const navItems = $$('.nav__item[data-route]');
const indicator = $('#navIndicator');

function setActive(path) {
  const active = navItems.find((a) => new RegExp(a.dataset.match).test(path));
  for (const a of navItems) a.classList.toggle('is-active', a === active);
  if (active) {
    indicator.style.setProperty('--y', `${active.offsetTop}px`);
    indicator.classList.add('is-on');
  } else {
    indicator.classList.remove('is-on');
  }
}

for (const a of navItems) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    setActive(a.dataset.route);
    if (sc.dataset.ready) sc.send('cmd', 'navigate', a.dataset.route);
  });
}

function syncHistoryButtons() {
  if (!sc.dataset.ready) return;
  $('#backBtn').disabled = !sc.canGoBack();
  $('#fwdBtn').disabled = !sc.canGoForward();
}

$('#backBtn').addEventListener('click', () => sc.canGoBack() && sc.goBack());
$('#fwdBtn').addEventListener('click', () => sc.canGoForward() && sc.goForward());
$('#reloadBtn').addEventListener('click', () => sc.reload());

const onNavigate = (e) => {
  try {
    const url = new URL(e.url);
    if (url.hostname.endsWith('soundcloud.com')) setActive(url.pathname);
  } catch { /* ignore */ }
  syncHistoryButtons();
};
sc.addEventListener('did-navigate', onNavigate);
sc.addEventListener('did-navigate-in-page', (e) => e.isMainFrame && onNavigate(e));

sc.addEventListener('dom-ready', () => {
  sc.dataset.ready = '1';
  sc.classList.add('is-ready');
  syncHistoryButtons();
});
sc.addEventListener('did-start-loading', () => $('#reloadBtn').classList.add('is-loading'));
sc.addEventListener('did-stop-loading', () => {
  $('#reloadBtn').classList.remove('is-loading');
  syncHistoryButtons();
});

new ResizeObserver(([entry]) => api.stageWidth(Math.round(entry.contentRect.width))).observe($('#stage'));

/* --------------------------------------------------------------- offline */

const offline = $('#offline');
let offlineAttached = false;
sc.addEventListener('did-fail-load', (e) => {
  // -3 = aborted (e.g. a redirect or a click during load) — not a real failure.
  if (!e.isMainFrame || e.errorCode === -3) return;
  $('#offlineMsg').textContent = e.errorCode === -106
    ? 'You appear to be offline. Check your connection and try again.'
    : `SoundCloud didn’t load (${e.errorDescription || e.errorCode}).`;
  offline.hidden = false;
  if (!offlineAttached) {
    CGLiquid.attach($('.offline'), 'offline', GLASS.offline);
    offlineAttached = true;
  }
});
sc.addEventListener('did-finish-load', () => { offline.hidden = true; });
$('#retryBtn').addEventListener('click', () => {
  offline.hidden = true;
  sc.reload();
});
window.addEventListener('online', () => {
  if (!offline.hidden) $('#retryBtn').click();
});

/* ------------------------------------------------------------ now playing */

const np = $('#np');
const npImg = $('#npImg');
const ambient = [$('#ambientA'), $('#ambientB')];
let ambientFront = 0;
let current = { artwork: '', href: '' };

function setAmbient(url) {
  if (!url) {
    ambient.forEach((el) => el.classList.remove('is-on'));
    body.classList.remove('has-art');
    return;
  }
  const img = new Image();
  img.onload = () => {
    const next = ambient[1 - ambientFront];
    next.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    next.classList.add('is-on');
    ambient[ambientFront].classList.remove('is-on');
    ambientFront = 1 - ambientFront;
    body.classList.add('has-art');
  };
  img.src = url;
}

function renderNowPlaying(d) {
  const hasTrack = !!d.title;
  np.dataset.state = !hasTrack ? 'empty' : d.playing ? 'playing' : 'paused';
  $('#npTitle').textContent = hasTrack ? d.title : 'Nothing playing';
  $('#npArtist').textContent = hasTrack ? d.artist : 'Pick a track to start listening';
  $('#npBar').style.setProperty('--p', String(d.progress || 0));

  const playBtn = $('.btn-play');
  playBtn.querySelector('use').setAttribute('href', d.playing ? '#i-pause' : '#i-play');
  playBtn.title = d.playing ? 'Pause' : 'Play';

  const like = $('.np__like');
  like.classList.toggle('is-liked', !!d.liked);
  like.querySelector('use').setAttribute('href', d.liked ? '#i-heart-fill' : '#i-heart');
  like.title = d.liked ? 'Unlike' : 'Like';

  if (d.artwork !== current.artwork) {
    npImg.classList.remove('is-loaded');
    if (d.artwork) {
      npImg.onload = () => npImg.classList.add('is-loaded');
      npImg.src = d.artwork;
    } else {
      npImg.removeAttribute('src');
    }
    setAmbient(d.artwork);
  }
  current = d;
}

sc.addEventListener('ipc-message', (e) => {
  if (e.channel !== 'np') return;
  const d = e.args[0] || {};
  renderNowPlaying(d);
  if (d.path) setActive(d.path);
  api.nowPlaying({ title: d.title, artist: d.artist, playing: d.playing });
});

for (const btn of $$('.np [data-cmd]')) {
  btn.addEventListener('click', () => sc.dataset.ready && sc.send('cmd', btn.dataset.cmd));
}
$('#npArt').addEventListener('click', () => {
  if (current.href && sc.dataset.ready) sc.send('cmd', 'navigate', current.href);
});

/* -------------------------------------------------------------------- boot */

(async () => {
  const init = await api.init();
  applySettings(init.settings);
  applyPrivacyStats({ blocked: init.blocked });
  wasFullscreen = !!init.fullscreen; // no exit hint on startup
  applyWindowState({ maximized: init.maximized, fullscreen: init.fullscreen, focused: true });
  sc.setAttribute('src', init.url);
  try { setActive(new URL(init.url).pathname); } catch { /* ignore */ }
})();
