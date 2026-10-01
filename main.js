'use strict';

const {
  app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, protocol, screen, session, shell,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { isTracker } = require('./trackers');

// Development-only switches. Packaged builds ignore them.
const DEV = !app.isPackaged;
if (DEV && process.env.CLOUDGLASS_PROFILE) app.setPath('userData', process.env.CLOUDGLASS_PROFILE);

const SC_HOME = 'https://soundcloud.com/discover';
const SC_PARTITION = 'persist:soundcloud';

// The shell UI is served from app://cloudglass/ instead of file://, so the page
// gets no file-system privileges (see the grantFileProtocolExtraPrivileges fuse).
const APP_ORIGIN = 'app://cloudglass';
const SHELL_DIR = path.join(__dirname, 'src');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const { host, pathname } = new URL(request.url);
    const file = path.normalize(path.join(SHELL_DIR, decodeURIComponent(pathname)));
    const type = MIME[path.extname(file).toLowerCase()];
    if (host !== 'cloudglass' || !file.startsWith(SHELL_DIR + path.sep) || !type) {
      return new Response('Not found', { status: 404 });
    }
    try {
      return new Response(await fs.promises.readFile(file), { headers: { 'content-type': type } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

// Present as regular Chrome so SoundCloud and the Google/Apple sign-in pages
// don't treat the app as an unsupported embedded browser.
const CHROME_MAJOR = process.versions.chrome.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
app.userAgentFallback = CHROME_UA;

// Where the SoundCloud view may navigate. Everything else opens in the default browser.
const MAIN_NAV_HOSTS = ['soundcloud.com', 'accounts.google.com', 'appleid.apple.com', 'idmsa.apple.com', 'facebook.com'];
// Sign-in popups may pass through a few more pages of the same providers.
const POPUP_NAV_HOSTS = ['soundcloud.com', 'google.com', 'accounts.youtube.com', 'apple.com', 'facebook.com'];
// Popups SoundCloud may open in-app (sign-in only).
const AUTH_POPUP_HOSTS = ['secure.soundcloud.com', 'api-auth.soundcloud.com', 'accounts.google.com', 'appleid.apple.com', 'facebook.com'];

const hostMatches = (url, list) => {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    return list.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
};
const isSoundCloud = (url) => hostMatches(url, ['soundcloud.com']);
const isWebUrl = (url) => /^https?:\/\//i.test(url);

// Pages worth reopening on next launch: the main site, not sign-in flows.
const isRestorable = (url) => {
  try {
    const { protocol, hostname, pathname } = new URL(url);
    return protocol === 'https:' && hostname === 'soundcloud.com' && !/^\/(signin|logout|connect)/.test(pathname);
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ settings */

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  bounds: { width: 1380, height: 880 },
  maximized: false,
  closeToTray: true,
  material: 'acrylic', // acrylic | mica | none
  ambient: true,
  blockTrackers: true,
  lastUrl: SC_HOME,
  zoom: 0,
  trayHintShown: false,
};
let settings = { ...DEFAULTS };
let saveTimer = null;

function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
}
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
      fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error('Could not save settings:', err);
    }
  }, 400);
}

/* ------------------------------------------------------------------- assets */

const ICON_DIR = path.join(__dirname, 'build', 'icons');
const icon = (name) => {
  const img = nativeImage.createFromPath(path.join(ICON_DIR, name));
  return img.isEmpty() ? undefined : img;
};

/* ------------------------------------------------------------------- window */

let win = null;
let tray = null;
let scContents = null; // the SoundCloud <webview> guest
let nowPlaying = { title: '', artist: '', playing: false, hasTrack: false };

function boundsAreVisible(b) {
  if (b.x === undefined || b.y === undefined) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y >= a.y - 10 && b.y + 40 < a.y + a.height);
}

// While a full-screen transition is running, win.isFullScreen() on Windows
// still reports the previous state (true inside 'leave-full-screen', false
// inside 'enter-full-screen'). Track it from the events instead.
let fullScreen = false;
let stateTimer = null;

function sendWindowState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window-state', {
    maximized: win.isMaximized(),
    focused: win.isFocused(),
    fullscreen: fullScreen,
  });
}

// Send now, and once more after the window has settled, so the shell never
// keeps a state from the middle of a transition.
function pushWindowState() {
  sendWindowState();
  clearTimeout(stateTimer);
  stateTimer = setTimeout(sendWindowState, 300);
}

function toggleFullScreen() {
  if (win && !win.isDestroyed()) win.setFullScreen(!fullScreen);
}

function createWindow() {
  const b = settings.bounds;
  win = new BrowserWindow({
    width: b.width,
    height: b.height,
    ...(boundsAreVisible(b) ? { x: b.x, y: b.y } : {}),
    minWidth: 980,
    minHeight: 640,
    title: 'Cloudglass',
    icon: icon('icon.png'),
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    backgroundMaterial: settings.material,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: DEV,
    },
  });

  win.loadURL(`${APP_ORIGIN}/index.html`);

  // Maximize only once the first frame is ready: maximize() shows the window
  // immediately, which would flash an empty frame during startup.
  win.once('ready-to-show', () => {
    if (settings.maximized) win.maximize();
    win.show();
    updateThumbar();
  });

  win.on('enter-full-screen', () => { fullScreen = true; pushWindowState(); });
  win.on('leave-full-screen', () => { fullScreen = false; pushWindowState(); });
  ['maximize', 'unmaximize', 'minimize', 'restore', 'show', 'focus', 'blur'].forEach((ev) => win.on(ev, pushWindowState));

  // Remember the normal (not maximized / full-screen / minimized) size and
  // position, read after moves and resizes have settled.
  let boundsTimer = null;
  const rememberBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMinimized()) return;
      settings.bounds = win.getNormalBounds();
      saveSettings();
    }, 400);
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);

  win.on('close', (e) => {
    settings.maximized = win.isMaximized();
    settings.bounds = win.getNormalBounds();
    saveSettings();
    if (!app.isQuitting && settings.closeToTray) {
      e.preventDefault();
      win.hide();
      if (!settings.trayHintShown && tray) {
        tray.displayBalloon({
          title: 'Cloudglass is still playing',
          content: 'It lives in the system tray now. Right-click the tray icon to quit.',
          iconType: 'info',
        });
        settings.trayHintShown = true;
        saveSettings();
      }
    }
  });

  // Mouse back/forward buttons.
  win.on('app-command', (_e, cmd) => {
    if (!scContents) return;
    if (cmd === 'browser-backward' && scContents.navigationHistory.canGoBack()) scContents.navigationHistory.goBack();
    if (cmd === 'browser-forward' && scContents.navigationHistory.canGoForward()) scContents.navigationHistory.goForward();
  });

  // Shortcuts also work while focus is in the shell (sidebar, toolbar).
  win.webContents.on('before-input-event', handleShortcut);

  // Lock down the <webview>: our preload, no Node, sandboxed, SoundCloud only.
  win.webContents.on('will-attach-webview', (e, webPreferences, params) => {
    delete webPreferences.preloadURL;
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.backgroundThrottling = false;
    webPreferences.spellcheck = false;
    webPreferences.devTools = DEV;
    if (params.partition !== SC_PARTITION || (params.src && !isSoundCloud(params.src))) e.preventDefault();
  });

  // The shell itself never navigates or opens windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ------------------------------------------------------------ shortcuts */

function zoomBy(delta) {
  settings.zoom = delta === 0 ? 0 : Math.max(-3, Math.min(3, (settings.zoom || 0) + delta));
  applyZoom();
  saveSettings();
}

function handleShortcut(e, input) {
  if (input.type !== 'keyDown') return;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();
  const sc = scContents && !scContents.isDestroyed() ? scContents : null;
  const history = sc?.navigationHistory;
  let handled = true;
  if (key === 'f11') toggleFullScreen();
  else if (!sc) handled = false;
  else if (input.alt && key === 'arrowleft') history.canGoBack() && history.goBack();
  else if (input.alt && key === 'arrowright') history.canGoForward() && history.goForward();
  else if (key === 'f5' || (ctrl && key === 'r')) sc.reload();
  else if (ctrl && (key === 'l' || key === 'k')) { sc.focus(); sc.send('cmd', 'focus-search'); }
  else if (ctrl && (key === '=' || key === '+')) zoomBy(0.5);
  else if (ctrl && key === '-') zoomBy(-0.5);
  else if (ctrl && key === '0') zoomBy(0);
  else if (DEV && (key === 'f12' || (ctrl && input.shift && key === 'i'))) sc.openDevTools({ mode: 'detach' });
  else handled = false;
  if (handled) e.preventDefault();
}

/* ------------------------------------------------------------- SoundCloud */

const SC_CSS = fs.readFileSync(path.join(__dirname, 'src', 'soundcloud.css'), 'utf8');

// SoundCloud's layout needs ~1010px. When the content area is narrower we zoom
// the page out a little instead of letting it scroll sideways; the user's own
// Ctrl +/- zoom level is applied on top.
let fitFactor = 1;
function applyZoom() {
  if (!scContents || scContents.isDestroyed()) return;
  scContents.setZoomFactor(fitFactor * Math.pow(1.2, settings.zoom || 0));
}

function openExternally(url) {
  if (isWebUrl(url)) shell.openExternal(url);
}

function wireSoundCloud(contents) {
  scContents = contents;

  contents.on('dom-ready', () => {
    applyZoom();
    if (isSoundCloud(contents.getURL())) contents.insertCSS(SC_CSS).catch(() => {});
  });

  const remember = (url) => {
    if (isRestorable(url)) {
      settings.lastUrl = url;
      saveSettings();
    }
  };
  contents.on('did-navigate', (_e, url) => remember(url));
  contents.on('did-navigate-in-page', (_e, url, isMainFrame) => isMainFrame && remember(url));

  const guardNavigation = (e, url) => {
    if (!hostMatches(url, MAIN_NAV_HOSTS)) {
      e.preventDefault();
      openExternally(url);
    }
  };
  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', (e, url, _inPlace, isMainFrame) => {
    if (isMainFrame !== false && e.isMainFrame !== false) guardNavigation(e, url);
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (hostMatches(url, AUTH_POPUP_HOSTS)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          parent: win,
          autoHideMenuBar: true,
          backgroundColor: '#161618',
          icon: icon('icon.png'),
          title: 'Sign in',
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
            devTools: DEV,
          },
        },
      };
    }
    if (isSoundCloud(url)) {
      contents.send('cmd', 'navigate', url);
      return { action: 'deny' };
    }
    openExternally(url);
    return { action: 'deny' };
  });

  contents.on('before-input-event', handleShortcut);

  contents.on('destroyed', () => {
    if (scContents === contents) scContents = null;
  });
}

function sendPlayerCommand(cmd) {
  if (scContents && !scContents.isDestroyed()) scContents.send('cmd', cmd);
}

/* ---------------------------------------------------------------- privacy */

let blockedCount = 0;
let statsTimer = null;
function reportBlocked() {
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    if (win && !win.isDestroyed()) win.webContents.send('privacy-stats', { blocked: blockedCount });
  }, 1000);
}

// Only these permissions are ever granted, and only to soundcloud.com.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

function configureSessions() {
  // The shell needs no permissions at all.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  const ses = session.fromPartition(SC_PARTITION);
  ses.setUserAgent(CHROME_UA);
  ses.setSpellCheckerEnabled(false); // no dictionary downloads

  ses.setPermissionRequestHandler((wc, permission, cb, details) =>
    cb(ALLOWED_PERMISSIONS.has(permission) && isSoundCloud(details?.requestingUrl || wc.getURL())));
  ses.setPermissionCheckHandler((_wc, permission, origin) =>
    ALLOWED_PERMISSIONS.has(permission) && isSoundCloud(origin));
  ses.setDevicePermissionHandler(() => false);

  // Third-party tracker blocking (see trackers.js).
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    if (settings.blockTrackers && isTracker(details.url)) {
      blockedCount++;
      reportBlocked();
      cb({ cancel: true });
      return;
    }
    cb({});
  });

  // Global Privacy Control: tells sites not to sell or share your data.
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, cb) => {
    details.requestHeaders['Sec-GPC'] = '1';
    cb({ requestHeaders: details.requestHeaders });
  });
}

async function eraseSoundCloudData() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Erase SoundCloud data',
    message: 'Erase all SoundCloud data stored by Cloudglass?',
    detail: 'This signs you out and deletes the cookies, cache and site storage Cloudglass keeps for SoundCloud on this PC. Your SoundCloud account itself is not changed.',
    buttons: ['Erase and sign out', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return false;
  const ses = session.fromPartition(SC_PARTITION);
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.clearAuthCache();
  await ses.clearCodeCaches({});
  settings.lastUrl = SC_HOME;
  saveSettings();
  if (scContents && !scContents.isDestroyed()) scContents.loadURL(SC_HOME);
  return true;
}

/* ---------------------------------------------------- other web contents */

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() === 'webview') {
    wireSoundCloud(contents);
    return;
  }
  // Sign-in popups: keep them on the sign-in providers, send everything else to the browser.
  if (contents.getType() === 'window') {
    contents.on('will-navigate', (e, url) => {
      if (contents === win?.webContents) return;
      if (!hostMatches(url, POPUP_NAV_HOSTS)) {
        e.preventDefault();
        openExternally(url);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (hostMatches(url, AUTH_POPUP_HOSTS)) return { action: 'allow' };
      openExternally(url);
      return { action: 'deny' };
    });
  }
});

/* --------------------------------------------------- tray + taskbar buttons */

function trackLabel() {
  if (!nowPlaying.hasTrack) return 'Nothing playing';
  const label = nowPlaying.artist ? `${nowPlaying.title} — ${nowPlaying.artist}` : nowPlaying.title;
  return label.length > 60 ? label.slice(0, 59) + '…' : label;
}

function buildTrayMenu() {
  if (!tray) return;
  const has = nowPlaying.hasTrack;
  tray.setToolTip(has ? `Cloudglass · ${trackLabel()}` : 'Cloudglass');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trackLabel(), enabled: false },
    { type: 'separator' },
    { label: nowPlaying.playing ? 'Pause' : 'Play', enabled: has, click: () => sendPlayerCommand('playpause') },
    { label: 'Next', enabled: has, click: () => sendPlayerCommand('next') },
    { label: 'Previous', enabled: has, click: () => sendPlayerCommand('prev') },
    { type: 'separator' },
    { label: 'Show Cloudglass', click: showWindow },
    {
      label: 'Keep playing when closed',
      type: 'checkbox',
      checked: settings.closeToTray,
      click: (item) => {
        settings.closeToTray = item.checked;
        saveSettings();
        win?.webContents.send('settings', publicSettings());
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(icon('tray.png') || icon('icon.png') || nativeImage.createEmpty());
  tray.on('click', () => (win?.isVisible() && !win.isMinimized() && win.isFocused() ? win.hide() : showWindow()));
  buildTrayMenu();
}

function updateThumbar() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const has = nowPlaying.hasTrack;
  const flags = has ? [] : ['disabled'];
  win.setThumbarButtons([
    { tooltip: 'Previous', icon: icon('prev.png'), flags, click: () => sendPlayerCommand('prev') },
    {
      tooltip: nowPlaying.playing ? 'Pause' : 'Play',
      icon: icon(nowPlaying.playing ? 'pause.png' : 'play.png'),
      flags,
      click: () => sendPlayerCommand('playpause'),
    },
    { tooltip: 'Next', icon: icon('next.png'), flags, click: () => sendPlayerCommand('next') },
  ]);
}

/* ------------------------------------------------------------------- IPC */

// Only the local shell page may talk to the main process. SoundCloud's page
// has no access to IPC at all (context isolation); this is a second check.
const fromShell = (e) =>
  !!win && !win.isDestroyed() && e.sender === win.webContents && (e.senderFrame?.url || '').startsWith(`${APP_ORIGIN}/`);

const publicSettings = () => ({
  closeToTray: settings.closeToTray,
  material: settings.material,
  ambient: settings.ambient,
  blockTrackers: settings.blockTrackers,
  openAtLogin: app.getLoginItemSettings().openAtLogin,
});

ipcMain.handle('init', (e) => {
  if (!fromShell(e)) return null;
  return {
    url: isRestorable(settings.lastUrl) ? settings.lastUrl : SC_HOME,
    settings: publicSettings(),
    maximized: win.isMaximized(),
    fullscreen: fullScreen,
    blocked: blockedCount,
  };
});

ipcMain.on('window', (e, action) => {
  if (!fromShell(e)) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') {
    if (fullScreen) win.setFullScreen(false);
    else if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (action === 'fullscreen') toggleFullScreen();
  else if (action === 'close') win.close();
});

ipcMain.handle('set-setting', (e, key, value) => {
  if (!fromShell(e)) return null;
  if (key === 'material' && ['acrylic', 'mica', 'none'].includes(value)) {
    settings.material = value;
    win.setBackgroundMaterial(value);
  } else if (['closeToTray', 'ambient', 'blockTrackers'].includes(key)) {
    settings[key] = !!value;
  } else if (key === 'openAtLogin') {
    app.setLoginItemSettings({ openAtLogin: !!value });
  } else {
    return publicSettings();
  }
  saveSettings();
  buildTrayMenu();
  return publicSettings();
});

ipcMain.handle('erase-data', (e) => (fromShell(e) ? eraseSoundCloudData() : false));

ipcMain.on('now-playing', (e, np) => {
  if (!fromShell(e)) return;
  const prev = nowPlaying;
  nowPlaying = {
    title: String(np?.title || '').slice(0, 300),
    artist: String(np?.artist || '').slice(0, 300),
    playing: !!np?.playing,
    hasTrack: !!np?.title,
  };
  win.setTitle(nowPlaying.hasTrack ? `${trackLabel()} · Cloudglass` : 'Cloudglass');
  if (prev.title !== nowPlaying.title || prev.playing !== nowPlaying.playing || prev.artist !== nowPlaying.artist) {
    buildTrayMenu();
    updateThumbar();
  }
});

ipcMain.on('stage-width', (e, width) => {
  if (!fromShell(e)) return;
  const fit = Math.max(0.7, Math.min(1, (Number(width) || 1100) / 1010));
  if (Math.abs(fit - fitFactor) > 0.005) {
    fitFactor = fit;
    applyZoom();
  }
});

/* ------------------------------------------------------------------ app */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    app.setAppUserModelId('app.cloudglass.desktop');
    Menu.setApplicationMenu(null);
    nativeTheme.themeSource = 'dark';
    loadSettings();
    registerAppProtocol();
    configureSessions();
    createWindow();
    createTray();
    win.on('show', updateThumbar);
  });

  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('window-all-closed', () => app.quit());
}
