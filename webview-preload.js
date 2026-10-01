'use strict';

// Runs inside the SoundCloud <webview> (isolated world, sandboxed).
// - adds liquid-glass refraction filters to SoundCloud's header and player
// - reports what's playing to the shell
// - executes player / navigation commands from the shell, tray and taskbar
//
// It only reads the player bar (title, artist, artwork, play state). It never
// touches forms, and it does nothing at all outside soundcloud.com, so it is
// inactive on the Google / Apple / Facebook sign-in pages.
const { contextBridge, ipcRenderer } = require('electron');

const ACTIVE = location.protocol === 'https:' && location.hostname === 'soundcloud.com';

// Global Privacy Control, page side (the Sec-GPC header is added by the main
// process). Consent tools such as SoundCloud's read navigator.globalPrivacyControl.
try {
  contextBridge.executeInMainWorld({
    func: () => {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
    },
  });
} catch {
  // Older Electron without executeInMainWorld: the header alone still applies.
}

/* ------------------------------------------------------------ liquid glass */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Displacement map for a rounded rect: neutral in the middle, bending the
// backdrop inward along a bevel at the edges, like light through thick glass.
function displacementMap(w, h, radius, bevel) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const inside = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) {
        nx = Math.sign(px);
      } else {
        ny = Math.sign(py);
      }
      const k = inside <= 0 ? 1 : inside >= bevel ? 0 : 1 - inside / bevel;
      const m = k * k * (3 - 2 * k) * k; // eased, strongest at the rim
      const i = (y * w + x) * 4;
      d[i] = 128 - nx * m * 127;
      d[i + 1] = 128 - ny * m * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function defs() {
  let svg = document.getElementById('cg-lg-defs');
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'cg-lg-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;';
    svg.appendChild(document.createElementNS(SVG_NS, 'defs'));
    document.body.appendChild(svg);
  }
  return svg.firstChild;
}

function upsertFilter(id, w, h, radius, bevel, scale) {
  let filter = document.getElementById(id);
  if (!filter) {
    filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    const image = document.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'map');
    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'map');
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');
    filter.append(image, disp);
    defs().appendChild(filter);
  }
  const [image, disp] = filter.children;
  filter.setAttribute('width', w);
  filter.setAttribute('height', h);
  image.setAttribute('width', w);
  image.setAttribute('height', h);
  image.setAttribute('href', displacementMap(w, h, radius, bevel));
  disp.setAttribute('scale', scale);
}

const GLASS_TARGETS = [
  { key: 'player', selector: '.playControls__inner', bevel: 22, scale: 44 },
  { key: 'search', selector: '.header__search .headerSearch', bevel: 14, scale: 30 },
  { key: 'actions', selector: '.header__right', bevel: 14, scale: 30 },
];

const bound = new Map(); // key -> { el, ro, size }

function refreshGlass(target, el) {
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w < 8 || h < 8) return;
  const state = bound.get(target.key);
  const size = `${w}x${h}`;
  if (state && state.size === size) return;
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || h / 2;
  const id = `cg-lg-${target.key}`;
  upsertFilter(id, w, h, radius, target.bevel, target.scale);
  document.documentElement.style.setProperty(`--cg-lg-${target.key}`, `url(#${id})`);
  if (state) state.size = size;
}

function bindGlass() {
  if (!document.body) return;
  defs();
  for (const target of GLASS_TARGETS) {
    const el = document.querySelector(target.selector);
    const state = bound.get(target.key);
    if (state && state.el === el) continue;
    if (state) state.ro.disconnect();
    if (!el) {
      bound.delete(target.key);
      continue;
    }
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => refreshGlass(target, el));
    });
    bound.set(target.key, { el, ro, size: '' });
    ro.observe(el);
    refreshGlass(target, el);
  }
}

/* ------------------------------------------------------------ now playing */

const text = (el) => (el ? (el.getAttribute('title') || el.textContent || '').trim() : '');
const bigArtwork = (url) => (url ? url.replace(/-(t\d+x\d+|large|small|badge|tiny|mini|crop)\./, '-t500x500.') : '');

function readNowPlaying() {
  const controls = document.querySelector('.playControls');
  const titleLink = document.querySelector('.playbackSoundBadge__titleLink');
  const artistLink = document.querySelector('.playbackSoundBadge__lightLink');
  const artSpan = document.querySelector('.playbackSoundBadge__avatar .image span, .playbackSoundBadge .sc-artwork span');
  const playBtn = document.querySelector('.playControls__play');
  const likeBtn = document.querySelector('.playbackSoundBadge__like');
  const progress = document.querySelector('.playbackTimeline__progressWrapper');

  let title = text(titleLink);
  let artist = text(artistLink);
  let artwork = '';
  const bg = artSpan ? getComputedStyle(artSpan).backgroundImage : '';
  const m = bg && bg.match(/url\("?([^")]+)"?\)/);
  if (m) artwork = m[1];

  const meta = navigator.mediaSession && navigator.mediaSession.metadata;
  if (meta) {
    title = title || meta.title || '';
    artist = artist || meta.artist || '';
    if (!artwork && meta.artwork && meta.artwork.length) artwork = meta.artwork[meta.artwork.length - 1].src;
  }

  const now = progress ? parseFloat(progress.getAttribute('aria-valuenow')) : NaN;
  const max = progress ? parseFloat(progress.getAttribute('aria-valuemax')) : NaN;

  return {
    visible: !!(controls && controls.classList.contains('m-visible')),
    title,
    artist,
    href: titleLink ? titleLink.href : '',
    artwork: bigArtwork(artwork),
    playing: !!(playBtn && playBtn.classList.contains('playing')),
    liked: !!(likeBtn && likeBtn.classList.contains('sc-button-selected')),
    progress: Number.isFinite(now) && max > 0 ? Math.min(1, now / max) : 0,
    theme: document.body && document.body.classList.contains('theme-light') ? 'light' : 'dark',
    path: location.pathname,
  };
}

let lastReport = '';
function report() {
  try {
    const np = readNowPlaying();
    const json = JSON.stringify(np);
    if (json !== lastReport) {
      lastReport = json;
      ipcRenderer.sendToHost('np', np);
    }
  } catch (err) {
    // SoundCloud markup changed; keep the app usable even if reporting breaks.
  }
}

/* ---------------------------------------------------------------- commands */

function spaNavigate(target) {
  let url;
  try {
    url = new URL(target, location.origin);
  } catch {
    return;
  }
  if (url.origin !== location.origin) {
    location.assign(url.href);
    return;
  }
  // Clicking a real link lets SoundCloud's router handle it without a page
  // reload, so playback continues.
  const a = document.createElement('a');
  a.href = url.pathname + url.search + url.hash;
  a.style.display = 'none';
  (document.getElementById('content') || document.body).appendChild(a);
  a.click();
  a.remove();
}

const click = (selector) => {
  const el = document.querySelector(selector);
  if (el) el.click();
  setTimeout(report, 120);
};

ipcRenderer.on('cmd', (_e, cmd, arg) => {
  if (!ACTIVE) return;
  switch (cmd) {
    case 'playpause': click('.playControls__play'); break;
    case 'next': click('.playControls__next'); break;
    case 'prev': click('.playControls__prev'); break;
    case 'like': click('.playbackSoundBadge__like'); break;
    case 'navigate': spaNavigate(arg); break;
    case 'focus-search': {
      const input = document.querySelector('.headerSearch__input');
      if (input) { input.focus(); input.select(); }
      break;
    }
    default: break;
  }
});

/* -------------------------------------------------------------------- boot */

window.addEventListener('DOMContentLoaded', () => {
  if (!ACTIVE) return;
  bindGlass();
  report();
  setInterval(bindGlass, 1500);
  setInterval(report, 750);
});
