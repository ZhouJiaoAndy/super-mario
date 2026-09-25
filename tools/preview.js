/* ============================================================
   tools/preview.js —— 离屏渲染截图
   用 mini-canvas 真正把游戏画面画出来并导出 PNG，用于人工核对美术与排版。

   用法：  node tools/preview.js
   输出：  tools/preview/*.png
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mini = require('./mini-canvas');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'preview');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

/* ---------------- 环境 ---------------- */

const screenCanvas = mini.createCanvas(256, 240);
const stageEl = mini.createCanvas(1, 1);

const elements = {
  screen: screenCanvas,
  stage: stageEl,
  touchpad: Object.assign(mini.createCanvas(1, 1), { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } })
};

const documentStub = {
  fullscreenElement: null,
  hidden: false,
  createElement(tag) {
    if (tag === 'canvas') return mini.createCanvas(300, 150);
    return Object.assign(mini.createCanvas(1, 1), {
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      textContent: '', style: {},
      getAttribute() { return null; }
    });
  },
  getElementById(id) { return elements[id] || (elements[id] = documentStub.createElement('div')); },
  addEventListener() {}, removeEventListener() {}, exitFullscreen() {}
};

const store = new Map();
let clock = 0;
let raf = null;

const sandbox = {
  console, Math, Date, JSON, RegExp, parseInt, parseFloat, isNaN, isFinite,
  String, Number, Boolean, Array, Object, Error, TypeError, RangeError,
  Map, Set, WeakMap, Promise, Uint8ClampedArray, Float32Array, Uint8Array,
  document: documentStub,
  localStorage: {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  },
  navigator: { maxTouchPoints: 0 },
  performance: { now() { return clock; } },
  requestAnimationFrame(fn) { raf = fn; return 1; },
  cancelAnimationFrame() {},
  setTimeout() { return 0; },
  AudioContext: undefined, webkitAudioContext: undefined,
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['js/audio.js', 'js/sprites.js', 'js/levels.js', 'js/entities.js', 'js/game.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});

const game = sandbox.game;
const Spr = sandbox.Spr;
const Ent = sandbox.Ent;

/* ---------------- 输出 ---------------- */

function save(canvas, name, scale) {
  const up = mini.upscale(canvas, scale || 3, [0, 0, 0, 255]);
  fs.writeFileSync(path.join(OUT, name + '.png'), mini.encodePNG(up.width, up.height, up.data));
  console.log('  -> ' + name + '.png  (' + up.width + 'x' + up.height + ')');
}

function quiet(fn) {
  try { fn(); } catch (e) { console.error('  渲染 ' + fn.name + ' 出错:', e.message); }
}

function shoot(name, setup, frames) {
  quiet(function () {
    setup();
    const n = frames === undefined ? 3 : frames;
    for (let i = 0; i < n; i++) { game.render(); }
    save(screenCanvas, name);
  });
}

function activateEnemies() {
  game.entities.forEach(function (e) { e.active = true; });
}

/* ---------------- 场景 ---------------- */

console.log('渲染场景：');

// 1. 标题
shoot('01-title', function () {
  game.state = 'title';
  game.timer = 96;
}, 1);

// 2. 1-1 开场
shoot('02-world11-start', function () {
  game.loadLevel(0, null);
  game.state = 'playing';
  game.mario.x = 14 * 16;
  game.camX = 0;
  activateEnemies();
  game.frame = 20;
});

// 3. 1-1 问号块 / 板栗仔
shoot('03-world11-blocks', function () {
  game.loadLevel(0, null);
  game.state = 'playing';
  game.mario.power = 0;
  game.mario.x = 19 * 16;
  game.mario.y = 12 * 16;
  game.camX = 12 * 16;
  activateEnemies();
});

// 4. 1-1 大马里奥 + 水管 + 食人花
shoot('04-world11-pipes', function () {
  game.loadLevel(0, null);
  game.state = 'playing';
  game.mario.power = 1;
  game.mario.applySize();
  game.mario.x = 57 * 16 - 20;
  game.mario.y = 12 * 16 - 15;
  game.camX = 48 * 16;
  activateEnemies();
  game.entities.forEach(function (e) {
    if (e.type === 'piranha') { e.y = e.upY; e.phase = 'out'; e.timer = 90; }
    if (e.type === 'goomba') e.x = 52 * 16;
  });
});

// 5. 1-2 地下关
shoot('05-world12-underground', function () {
  game.loadLevel(1, null);
  game.state = 'playing';
  game.mario.power = 2;
  game.mario.applySize();
  game.mario.x = 36 * 16;
  game.mario.y = 11 * 16;
  game.camX = 30 * 16;
  activateEnemies();
  game.entities.forEach(function (e) { if (e.type === 'koopa') e.x = 40 * 16; });
});

// 6. 1-2 石柱与金币
shoot('06-world12-coins', function () {
  game.loadLevel(1, null);
  game.state = 'playing';
  game.mario.x = 46 * 16;
  game.mario.y = 12 * 16;
  game.camX = 42 * 16;
  activateEnemies();
});

// 7. 1-3 空中关
shoot('07-world13-sky', function () {
  game.loadLevel(2, null);
  game.state = 'playing';
  game.mario.power = 1;
  game.mario.applySize();
  game.mario.x = 72 * 16 + 4;
  game.mario.y = 7 * 16 - 15;
  game.camX = 68 * 16;
  activateEnemies();
});

// 8. 旗杆与城堡
shoot('08-flagpole', function () {
  game.loadLevel(0, null);
  game.state = 'playing';
  game.mario.power = 1;
  game.mario.applySize();
  game.mario.x = 192 * 16;
  game.mario.y = 12 * 16 - 15;
  game.camX = 188 * 16;
  game.flagY = 70;
});

// 9. 降旗瞬间
shoot('09-flag-slide', function () {
  game.loadLevel(0, null);
  game.state = 'playing';
  game.mario.x = 194 * 16 - 6;
  game.mario.y = 5 * 16;
  game.camX = 189 * 16;
  game.flagSliding = true;
  game.flagY = 96;
  game.mario.state = 'flag';
});

// 10. HUD + 暂停
shoot('10-pause', function () {
  game.loadLevel(0, null);
  game.state = 'playing';
  game.score = 12450; game.coins = 37; game.lives = 3; game.time = 287;
  game.mario.x = 30 * 16;
  game.camX = 26 * 16;
  game.paused = true;
});

// 11. 通关结算卡
shoot('11-ready-card', function () {
  game.loadLevel(0, null);
  game.state = 'ready';
  game.timer = 80;
  game.coins = 12; game.score = 5400;
}, 2);

// 12. 结局
shoot('12-win', function () {
  game.state = 'win';
  game.timer = 30;
  game.score = 128900; game.hiScore = 128900;
}, 1);

/* ---------------- 精灵总览 ---------------- */

quiet(function () {
  const sheet = mini.createCanvas(240, 200);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#5c94fc';
  ctx.fillRect(0, 0, 240, 200);

  function put(img, x, y) { if (img) ctx.drawImage(img, x, y); }

  const M = Spr.SPR.mario;
  let x = 4, y = 4;
  // 小马里奥
  ['idle', 'jump', 'skid', 'dead'].forEach(function (k) { put(M.normal.small[k][0], x, y); x += 18; });
  M.normal.small.walk.forEach(function (w) { put(w, x, y); x += 18; });
  // 大马里奥
  x = 4; y += 34;
  put(M.normal.big.idle[0], x, y); x += 18;
  put(M.normal.big.jump[0], x, y); x += 18;
  put(M.normal.big.skid[0], x, y); x += 18;
  M.normal.big.walk.forEach(function (w) { put(w, x, y); x += 18; });
  x += 4;
  put(M.normal.big.duck[0], x, y - 6); x += 20;
  // 火焰马里奥
  put(M.fire.big.idle[0], x, y); x += 18;
  put(M.fire.big.walk[1], x, y); x += 18;

  // 敌人与道具
  x = 4; y += 38;
  put(Spr.SPR.goomba.walk[0], x, y); x += 18;
  put(Spr.SPR.goomba.walk[1], x, y); x += 18;
  put(Spr.SPR.goomba.flat, x, y); x += 18;
  put(Spr.SPR.koopa.walk[0], x, y); x += 18;
  put(Spr.SPR.koopa.walk[1], x, y); x += 18;
  put(Spr.SPR.koopa.shell, x, y); x += 18;
  put(Spr.SPR.piranha[0], x, y); x += 18;
  put(Spr.SPR.piranha[1], x, y); x += 18;
  put(Spr.SPR.mushroom, x, y); x += 18;
  put(Spr.SPR.flower, x, y); x += 18;
  put(Spr.SPR.star[0], x, y); x += 18;
  put(Spr.SPR.star[2], x, y); x += 18;
  put(Spr.SPR.fireball, x, y + 4); x += 14;

  // 瓦片
  const T = Spr.makeTileset('overworld');
  x = 4; y += 30;
  [T.ground, T.brick, T.stone, T.q[0], T.q[1], T.q[2], T.used,
   T.pipeTL, T.pipeTR, T.pipeBL, T.pipeBR,
   T.coin[0], T.coin[1], T.coin[2], T.coin[3], T.flagBall, T.flag,
   T.hillSmall, T.bush, T.cloudSmall].forEach(function (img) {
    put(img, x, y);
    x += Math.max(img.width, 16) + 2;
  });

  const up = mini.upscale(sheet, 3, [0, 0, 0, 255]);
  fs.writeFileSync(path.join(OUT, '20-sprite-sheet.png'), mini.encodePNG(up.width, up.height, up.data));
  console.log('  -> 20-sprite-sheet.png  (' + up.width + 'x' + up.height + ')');
});

// 马里奥各形态放大图，便于逐帧核对
quiet(function () {
  const cols = 8;
  const big = mini.createCanvas(cols * 20 + 8, 2 * 38 + 8);
  const ctx = big.getContext('2d');
  ctx.fillStyle = '#5c94fc';
  ctx.fillRect(0, 0, big.width, big.height);

  function row(frames, y) {
    let x = 4;
    frames.forEach(function (f) { ctx.drawImage(f, x, y); x += 20; });
  }
  const M = Spr.SPR.mario;
  row([M.normal.small.idle[0], M.normal.small.walk[0], M.normal.small.walk[1],
       M.normal.small.walk[2], M.normal.small.jump[0], M.normal.small.skid[0],
       M.normal.small.dead[0], M.fire.small.idle[0]], 4 + 12);
  row([M.normal.big.idle[0], M.normal.big.walk[0], M.normal.big.walk[1],
       M.normal.big.walk[2], M.normal.big.jump[0], M.normal.big.skid[0],
       M.normal.big.duck[0], M.fire.big.idle[0]], 4 + 12 + 34);

  const up2 = mini.upscale(big, 5, [92, 148, 252, 255]);
  fs.writeFileSync(path.join(OUT, '21-mario-frames.png'), mini.encodePNG(up2.width, up2.height, up2.data));
  console.log('  -> 21-mario-frames.png  (' + up2.width + 'x' + up2.height + ')');
});

console.log('\n全部截图已输出到 tools/preview/');
