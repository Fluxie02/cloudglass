'use strict';

// Liquid glass refraction for the shell.
// Each glass element gets an SVG filter whose displacement map bends the
// backdrop inward along a rounded bevel at the edges (strongest at the rim,
// untouched in the middle). CSS picks it up through the --lg variable:
//   backdrop-filter: var(--lg, ) blur(...) saturate(...)
// The same map generator lives in webview-preload.js for the SoundCloud page.
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

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
        const i = (y * w + x) * 4;
        d[i + 2] = 128;
        d[i + 3] = 255;
        if (inside >= bevel) {
          d[i] = 128;
          d[i + 1] = 128;
          continue;
        }
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
        const k = inside <= 0 ? 1 : 1 - inside / bevel;
        const m = k * k * (3 - 2 * k) * k;
        d[i] = 128 - nx * m * 127;
        d[i + 1] = 128 - ny * m * 127;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  let defsEl = null;
  function defs() {
    if (!defsEl) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;';
      defsEl = document.createElementNS(SVG_NS, 'defs');
      svg.appendChild(defsEl);
      document.body.appendChild(svg);
    }
    return defsEl;
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

  function attach(el, key, { bevel = 18, scale = 36 } = {}) {
    const id = `lg-${key}`;
    let last = '';
    let timer = 0;
    const update = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (w < 8 || h < 8) return;
      const size = `${w}x${h}`;
      if (size === last) return;
      last = size;
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      upsertFilter(id, w, h, radius, bevel, scale);
      el.style.setProperty('--lg', `url(#${id})`);
    };
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(update, last ? 90 : 0);
    }).observe(el);
    update();
  }

  window.CGLiquid = { attach };
})();
