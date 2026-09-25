/* ============================================================
   tools/mini-canvas.js —— 极简 Canvas2D 光栅化器 + PNG 编码器
   只实现本游戏用到的子集：fillRect / drawImage / 变换 / 矩形裁剪 /
   线性渐变 / 多边形填充 / globalAlpha。用于在 Node 里离屏渲染截图。
   ============================================================ */
'use strict';

const zlib = require('zlib');

/* ---------------- 颜色 ---------------- */

function parseColor(s) {
  if (s && typeof s === 'object' && typeof s.colorAt === 'function') return s.colorAt(0);
  if (typeof s !== 'string') return [255, 0, 255, 255];
  s = s.trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return [r || 0, g || 0, b || 0, a];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(function (v) { return parseFloat(v); });
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
  }
  const named = { white: [255, 255, 255, 255], black: [0, 0, 0, 255] };
  return named[s.toLowerCase()] || [255, 0, 255, 255];
}

class Gradient {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.stops = [];
  }
  addColorStop(t, c) {
    this.stops.push([t, parseColor(c)]);
    this.stops.sort(function (a, b) { return a[0] - b[0]; });
  }
  colorAt(y) {
    const dy = this.y1 - this.y0;
    let t = dy === 0 ? 0 : (y - this.y0) / dy;
    t = Math.max(0, Math.min(1, t));
    const s = this.stops;
    if (!s.length) return [0, 0, 0, 255];
    if (s.length === 1) return s[0][1].slice();
    let a = s[0], b = s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) {
      if (t >= s[i][0] && t <= s[i + 1][0]) { a = s[i]; b = s[i + 1]; break; }
    }
    const span = b[0] - a[0];
    const k = span <= 0 ? 0 : (t - a[0]) / span;
    return [
      a[1][0] + (b[1][0] - a[1][0]) * k,
      a[1][1] + (b[1][1] - a[1][1]) * k,
      a[1][2] + (b[1][2] - a[1][2]) * k,
      a[1][3] + (b[1][3] - a[1][3]) * k
    ];
  }
}

/* ---------------- 画布与上下文 ---------------- */

class Ctx {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = false;
    this.filter = 'none';
    this.font = '';
    this.lineWidth = 1;
    this._stack = [];
    this._a = 1; this._d = 1; this._e = 0; this._f = 0;
    this._clip = null;
    this._path = [];
  }

  /* --- 状态 --- */
  save() {
    this._stack.push({
      a: this._a, d: this._d, e: this._e, f: this._f,
      clip: this._clip ? { x0: this._clip.x0, y0: this._clip.y0, x1: this._clip.x1, y1: this._clip.y1 } : null,
      alpha: this.globalAlpha, fillStyle: this.fillStyle
    });
  }
  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this._a = s.a; this._d = s.d; this._e = s.e; this._f = s.f;
    this._clip = s.clip; this.globalAlpha = s.alpha; this.fillStyle = s.fillStyle;
  }
  translate(x, y) { this._e += this._a * x; this._f += this._d * y; }
  scale(x, y) { this._a *= x; this._d *= y; }
  rotate() { /* 本游戏仅用于碎砖旋转，忽略 */ }
  setTransform() { this._a = 1; this._d = 1; this._e = 0; this._f = 0; }

  /* --- 像素写入 --- */
  _blend(x, y, col, alpha) {
    const cv = this.canvas;
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
    const c = this._clip;
    if (c && (x < c.x0 || y < c.y0 || x >= c.x1 || y >= c.y1)) return;
    const a = (col[3] / 255) * alpha;
    if (a <= 0) return;
    const i = (y * cv.width + x) * 4;
    const d = cv._data;
    if (a >= 1) {
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      return;
    }
    const inv = 1 - a;
    d[i] = col[0] * a + d[i] * inv;
    d[i + 1] = col[1] * a + d[i + 1] * inv;
    d[i + 2] = col[2] * a + d[i + 2] * inv;
    d[i + 3] = Math.min(255, 255 * a + d[i + 3] * inv);
  }

  _rectDev(x, y, w, h) {
    const x0 = this._a * x + this._e, x1 = this._a * (x + w) + this._e;
    const y0 = this._d * y + this._f, y1 = this._d * (y + h) + this._f;
    return {
      x0: Math.floor(Math.min(x0, x1)), x1: Math.ceil(Math.max(x0, x1)),
      y0: Math.floor(Math.min(y0, y1)), y1: Math.ceil(Math.max(y0, y1))
    };
  }

  /* --- 填充 --- */
  fillRect(x, y, w, h) {
    const r = this._rectDev(x, y, w, h);
    const grad = (this.fillStyle && typeof this.fillStyle === 'object') ? this.fillStyle : null;
    const solid = grad ? null : parseColor(this.fillStyle);
    const alpha = this.globalAlpha;
    for (let py = r.y0; py < r.y1; py++) {
      const col = grad ? grad.colorAt(py + 0.5) : solid;
      for (let px = r.x0; px < r.x1; px++) this._blend(px, py, col, alpha);
    }
  }

  clearRect(x, y, w, h) {
    const r = this._rectDev(x, y, w, h);
    const cv = this.canvas;
    for (let py = Math.max(0, r.y0); py < Math.min(cv.height, r.y1); py++) {
      for (let px = Math.max(0, r.x0); px < Math.min(cv.width, r.x1); px++) {
        const c = this._clip;
        if (c && (px < c.x0 || py < c.y0 || px >= c.x1 || py >= c.y1)) continue;
        const i = (py * cv.width + px) * 4;
        cv._data[i] = cv._data[i + 1] = cv._data[i + 2] = cv._data[i + 3] = 0;
      }
    }
  }

  strokeRect() {}
  fillText() {}
  strokeText() {}
  measureText() { return { width: 0 }; }

  /* --- 路径 --- */
  beginPath() { this._path = []; }
  closePath() {}
  moveTo(x, y) { this._path.push([[x, y]]); }
  lineTo(x, y) { if (this._path.length) this._path[this._path.length - 1].push([x, y]); }
  rect(x, y, w, h) { this._path.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }
  arc() {} ellipse() {} quadraticCurveTo() {} bezierCurveTo() {} stroke() {}

  clip() {
    if (!this._path.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sub of this._path) {
      for (const p of sub) {
        const dx = this._a * p[0] + this._e, dy = this._d * p[1] + this._f;
        if (dx < x0) x0 = dx; if (dy < y0) y0 = dy;
        if (dx > x1) x1 = dx; if (dy > y1) y1 = dy;
      }
    }
    const prev = this._clip;
    const nx0 = prev ? Math.max(prev.x0, x0) : x0;
    const ny0 = prev ? Math.max(prev.y0, y0) : y0;
    const nx1 = prev ? Math.min(prev.x1, x1) : x1;
    const ny1 = prev ? Math.min(prev.y1, y1) : y1;
    this._clip = { x0: Math.floor(nx0), y0: Math.floor(ny0), x1: Math.ceil(nx1), y1: Math.ceil(ny1) };
  }

  fill() {
    const col = parseColor(this.fillStyle);
    const alpha = this.globalAlpha;
    const edges = [];
    let ymin = Infinity, ymax = -Infinity;
    for (const sub of this._path) {
      if (sub.length < 3) continue;
      const pts = sub.map((p) => [this._a * p[0] + this._e, this._d * p[1] + this._f]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if (p[1] !== q[1]) edges.push([p, q]);
        ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]);
      }
    }
    if (!edges.length) return;
    for (let y = Math.floor(ymin); y < Math.ceil(ymax); y++) {
      const cy = y + 0.5;
      const xs = [];
      for (const [p, q] of edges) {
        if ((cy >= p[1] && cy < q[1]) || (cy >= q[1] && cy < p[1])) {
          xs.push(p[0] + (cy - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
        }
      }
      xs.sort(function (a, b) { return a - b; });
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.floor(xs[i]); x < Math.ceil(xs[i + 1]); x++) this._blend(x, y, col, alpha);
      }
    }
  }

  /* --- 图像 --- */
  drawImage(img) {
    if (!img || !img._data) return;
    const a = this._a, d = this._d, e = this._e, f = this._f;
    let sx, sy, sw, sh, dx, dy, dw, dh;
    if (arguments.length >= 9) {
      sx = arguments[1]; sy = arguments[2]; sw = arguments[3]; sh = arguments[4];
      dx = arguments[5]; dy = arguments[6]; dw = arguments[7]; dh = arguments[8];
    } else if (arguments.length >= 5) {
      sx = 0; sy = 0; sw = img.width; sh = img.height;
      dx = arguments[1]; dy = arguments[2]; dw = arguments[3]; dh = arguments[4];
    } else {
      sx = 0; sy = 0; sw = img.width; sh = img.height;
      dx = arguments[1]; dy = arguments[2]; dw = sw; dh = sh;
    }
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;

    const X0 = a * dx + e, X1 = a * (dx + dw) + e;
    const Y0 = d * dy + f, Y1 = d * (dy + dh) + f;
    const px0 = Math.floor(Math.min(X0, X1)), px1 = Math.ceil(Math.max(X0, X1));
    const py0 = Math.floor(Math.min(Y0, Y1)), py1 = Math.ceil(Math.max(Y0, Y1));
    const alpha = this.globalAlpha;
    const src = img._data, sw0 = img.width, sh0 = img.height;

    for (let py = py0; py < py1; py++) {
      const v = (py + 0.5 - f) / (d || 1);
      const fy = (v - dy) / dh;
      if (fy < 0 || fy >= 1) continue;
      const isy = sy + Math.floor(fy * sh);
      if (isy < 0 || isy >= sh0) continue;
      for (let px = px0; px < px1; px++) {
        const u = (px + 0.5 - e) / (a || 1);
        const fx = (u - dx) / dw;
        if (fx < 0 || fx >= 1) continue;
        const isx = sx + Math.floor(fx * sw);
        if (isx < 0 || isx >= sw0) continue;
        const si = (isy * sw0 + isx) * 4;
        if (src[si + 3] === 0) continue;
        this._blend(px, py, [src[si], src[si + 1], src[si + 2], src[si + 3]], alpha);
      }
    }
  }

  putImageData() {}
  createPattern() { return null; }
  createLinearGradient(x0, y0, x1, y1) { return new Gradient(x0, y0, x1, y1); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Gradient(y0, y0, y1, y1); }
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h };
  }
}

function createCanvas(w, h) {
  const cv = {
    _w: 0, _h: 0, _data: null, _ctx: null,
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    getAttribute() { return null; }, setAttribute() {},
    querySelectorAll() { return []; },
    appendChild() {}, requestFullscreen() {},
    _alloc() { this._data = new Uint8ClampedArray(Math.max(0, this._w * this._h * 4)); },
    getContext() { if (!this._ctx) this._ctx = new Ctx(this); return this._ctx; }
  };
  Object.defineProperty(cv, 'width', {
    get() { return this._w; },
    set(v) { this._w = Math.max(0, v | 0); this._alloc(); }
  });
  Object.defineProperty(cv, 'height', {
    get() { return this._h; },
    set(v) { this._h = Math.max(0, v | 0); this._alloc(); }
  });
  cv._w = w | 0; cv._h = h | 0; cv._alloc();
  return cv;
}

/* ---------------- PNG 编码 ---------------- */

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = rgba[y * stride + i];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** 最近邻放大，方便肉眼看像素 */
function upscale(canvas, factor, bg) {
  const w = canvas.width * factor, h = canvas.height * factor;
  const out = new Uint8ClampedArray(w * h * 4);
  const b = bg || [0, 0, 0, 255];
  const src = canvas._data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / factor) * canvas.width + Math.floor(x / factor)) * 4;
      const di = (y * w + x) * 4;
      const a = src[si + 3] / 255;
      out[di] = src[si] * a + b[0] * (1 - a);
      out[di + 1] = src[si + 1] * a + b[1] * (1 - a);
      out[di + 2] = src[si + 2] * a + b[2] * (1 - a);
      out[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

module.exports = { createCanvas, encodePNG, upscale, parseColor, Ctx, Gradient };
