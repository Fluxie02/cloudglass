'use strict';

// Renders the app / tray / taskbar icons from SVG with Electron's offscreen
// renderer. Run with: npm run icons
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
// Each icon renders in its own window; don't quit when one closes.
app.on('window-all-closed', () => {});

const DROPLET = 'M256 44.8c89.6 100.8 160 185.6 160 272a160 160 0 0 1-320 0c0-86.4 70.4-171.2 160-272Z';

const appIcon = ({ shadow = true, detail = true } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="body" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#ffc06e"/>
      <stop offset="0.45" stop-color="#ff5a1f"/>
      <stop offset="1" stop-color="#d4246a"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.34" cy="0.36" r="0.62">
      <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.95"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="caustic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe2b8" stop-opacity="0"/>
      <stop offset="1" stop-color="#ffe2b8" stop-opacity="0.55"/>
    </linearGradient>
    <clipPath id="clip"><path d="${DROPLET}"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#4a0820" flood-opacity="0.45"/>
    </filter>
  </defs>
  <g ${shadow ? 'filter="url(#shadow)"' : ''}>
    <path d="${DROPLET}" fill="url(#body)"/>
  </g>
  <g clip-path="url(#clip)">
    <rect width="512" height="512" fill="url(#sheen)"/>
    ${detail ? '<ellipse cx="256" cy="470" rx="150" ry="60" fill="url(#caustic)"/>' : ''}
  </g>
  <g stroke="#fff" stroke-linecap="round" stroke-width="${detail ? 27 : 34}">
    <path d="M168 314v40M212 282v104M256 252v164M300 286v96M344 318v32"/>
  </g>
  ${detail ? `<path d="M196 150c-34 44-58 86-66 130" stroke="#fff" stroke-opacity="0.7" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="${DROPLET}" fill="none" stroke="url(#rim)" stroke-width="7" clip-path="url(#clip)"/>` : ''}
</svg>`;

const glyph = (d) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs><filter id="s"><feDropShadow dx="0" dy="0.4" stdDeviation="0.5" flood-color="#000" flood-opacity="0.55"/></filter></defs>
  <g filter="url(#s)" fill="#fff">${d}</g>
</svg>`;

const GLYPHS = {
  play: '<path d="M8 5.4v13.2a1.1 1.1 0 0 0 1.7.94l10.6-6.6a1.1 1.1 0 0 0 0-1.88L9.7 4.46A1.1 1.1 0 0 0 8 5.4Z"/>',
  pause: '<rect x="6.2" y="4.6" width="4.2" height="14.8" rx="1.3"/><rect x="13.6" y="4.6" width="4.2" height="14.8" rx="1.3"/>',
  next: '<path d="M3 6.4v11.2a.9.9 0 0 0 1.4.74l7.4-5.3v4.56a.9.9 0 0 0 1.4.74l7.8-5.6a.9.9 0 0 0 0-1.48l-7.8-5.6a.9.9 0 0 0-1.4.74v4.56L4.4 5.66A.9.9 0 0 0 3 6.4Z"/>',
  prev: '<path d="M21 6.4v11.2a.9.9 0 0 1-1.4.74l-7.4-5.3v4.56a.9.9 0 0 1-1.4.74l-7.8-5.6a.9.9 0 0 1 0-1.48l7.8-5.6a.9.9 0 0 1 1.4.74v4.56l7.4-5.3A.9.9 0 0 1 21 6.4Z"/>',
};

// Installer artwork (shown by the setup wizard). NSIS wants 24-bit BMPs.
const sidebarHtml = `
<div style="position:relative;width:164px;height:314px;overflow:hidden;font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;
  background:radial-gradient(130% 70% at 15% 0%, rgba(255,122,46,.55), transparent 62%),
             radial-gradient(110% 60% at 100% 100%, rgba(200,40,122,.5), transparent 60%),
             linear-gradient(170deg,#1d1522,#120e17 60%,#0b0a10)">
  <div style="position:absolute;left:22px;top:44px;width:120px;height:120px;border-radius:30px;
    background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.04));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 0 0 1px rgba(255,255,255,.08),0 18px 30px -12px rgba(0,0,0,.7)"></div>
  <div style="position:absolute;left:42px;top:58px;width:80px;height:80px">${appIcon({ shadow: false })}</div>
  <div style="position:absolute;top:186px;width:100%;text-align:center;color:#fff;font-weight:600;font-size:21px;letter-spacing:-.2px">Cloudglass</div>
  <div style="position:absolute;top:214px;width:100%;text-align:center;color:rgba(255,255,255,.62);font-size:11px">Liquid glass for SoundCloud</div>
  <div style="position:absolute;bottom:12px;left:10px;right:10px;text-align:center;color:rgba(255,255,255,.42);font-size:9px;line-height:1.35">Unofficial · not affiliated with<br>or endorsed by SoundCloud</div>
</div>`;

const headerHtml = `
<div style="position:relative;width:150px;height:57px;background:#fff;font-family:'Segoe UI Variable Display','Segoe UI',sans-serif">
  <div style="position:absolute;left:14px;top:9px;width:38px;height:38px">${appIcon({ shadow: false })}</div>
  <div style="position:absolute;left:58px;top:17px;color:#1d1d22;font-weight:600;font-size:16px;letter-spacing:-.2px">Cloudglass</div>
</div>`;

// nativeImage bitmap (BGRA, top-down) -> 24-bit BMP (bottom-up, padded rows).
function toBmp(image, width, height) {
  const bgra = image.toBitmap();
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowSize * height;
  const buf = Buffer.alloc(size);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(size, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(rowSize * height, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const out = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[out + x * 3] = bgra[i];
      buf[out + x * 3 + 1] = bgra[i + 1];
      buf[out + x * 3 + 2] = bgra[i + 2];
    }
  }
  return buf;
}

async function renderBmp(html, width, height, file) {
  const image = await paint(html, width, height);
  fs.writeFileSync(file, toBmp(image, width, height));
  console.log('wrote', path.relative(process.cwd(), file), `${width}x${height}`);
}

async function render(svg, size, file) {
  const image = await paint(svg, size, size);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, image.toPNG());
  console.log('wrote', path.relative(process.cwd(), file), `${size}px`);
}

async function paint(markup, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden;width:${width}px;height:${height}px}svg{display:block;width:100%;height:100%}</style></head><body>${markup}</body></html>`;
  const painted = new Promise((resolve) => {
    let last;
    let timer;
    win.webContents.on('paint', (_e, _dirty, image) => {
      last = image;
      clearTimeout(timer);
      timer = setTimeout(() => resolve(last), 250);
    });
  });
  win.webContents.setFrameRate(30);
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.webContents.invalidate();
  const image = await painted;
  win.destroy();
  return image.resize({ width, height, quality: 'best' });
}

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..', 'build');
  const out = path.join(root, 'icons');
  await render(appIcon(), 512, path.join(root, 'icon.png'));
  await render(appIcon(), 256, path.join(out, 'icon.png'));
  await render(appIcon({ shadow: false, detail: false }), 16, path.join(out, 'tray.png'));
  await render(appIcon({ shadow: false, detail: false }), 24, path.join(out, 'tray@1.5x.png'));
  await render(appIcon({ shadow: false, detail: false }), 32, path.join(out, 'tray@2x.png'));
  for (const [name, d] of Object.entries(GLYPHS)) {
    await render(glyph(d), 16, path.join(out, `${name}.png`));
    await render(glyph(d), 32, path.join(out, `${name}@2x.png`));
  }
  await renderBmp(sidebarHtml, 164, 314, path.join(root, 'installerSidebar.bmp'));
  await renderBmp(headerHtml, 150, 57, path.join(root, 'installerHeader.bmp'));
  app.quit();
});
