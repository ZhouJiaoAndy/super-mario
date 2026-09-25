/* ============================================================
   tools/smoke-test.js —— 无头冒烟测试
   在 Node 里用 Canvas/DOM 桩件加载全部游戏脚本，
   驱动数千帧逻辑与渲染，捕捉运行时异常，并校验关卡数据。

   用法：  node tools/smoke-test.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- Canvas / DOM 桩件 ---------------- */

function makeCtx(canvas) {
  const target = {
    canvas: canvas,
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', filter: 'none',
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {},
    beginPath() {}, closePath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    fill() {}, stroke() {}, fillRect() {}, clearRect() {}, strokeRect() {},
    fillText() {}, strokeText() {}, measureText() { return { width: 0 }; },
    drawImage() {}, putImageData() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; }
  };
  return new Proxy(target, {
    get(t, p) {
      if (typeof p === 'symbol') return t[p];
      if (p in t) return t[p];
      return function () {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    width: 300, height: 150,
    style: {}, textContent: '', _ctx: null,
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    getContext(type) {
      if (!this._ctx) this._ctx = makeCtx(this);
      return this._ctx;
    },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getAttribute() { return null; },
    setAttribute() {}, appendChild() {},
    requestFullscreen() {}, focus() {}
  };
  return el;
}

const elements = {};
const documentStub = {
  fullscreenElement: null,
  hidden: false,
  createElement: makeElement,
  getElementById(id) {
    if (!elements[id]) elements[id] = makeElement(id === 'screen' ? 'canvas' : 'div');
    return elements[id];
  },
  addEventListener() {}, removeEventListener() {},
  exitFullscreen() {}
};

const store = new Map();
const localStorageStub = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); }
};

let rafCallback = null;
let clock = 0;

const sandbox = {
  console: console,
  Math: Math, Date: Date, JSON: JSON, RegExp: RegExp,
  parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
  String: String, Number: Number, Boolean: Boolean, Array: Array, Object: Object,
  Error: Error, TypeError: TypeError, RangeError: RangeError,
  Map: Map, Set: Set, WeakMap: WeakMap, Promise: Promise,
  Uint8ClampedArray: Uint8ClampedArray, Float32Array: Float32Array, Uint8Array: Uint8Array,
  document: documentStub,
  localStorage: localStorageStub,
  navigator: { maxTouchPoints: 0, userAgent: 'node' },
  performance: { now() { return clock; } },
  requestAnimationFrame(fn) { rafCallback = fn; return 1; },
  cancelAnimationFrame() {},
  setTimeout(fn) { return 0; },
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener() {}, removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

/* ---------------- 加载脚本 ---------------- */

const FILES = ['js/audio.js', 'js/sprites.js', 'js/levels.js', 'js/entities.js', 'js/game.js'];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: f });
  } catch (e) {
    console.error('加载 ' + f + ' 失败：', e);
    process.exit(1);
  }
}

const game = sandbox.game;
if (!game) { console.error('game 未创建'); process.exit(1); }

/* ---------------- 断言工具 ---------------- */

let failures = 0;
let checks = 0;

function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

/* ---------------- 1. 关卡数据校验 ---------------- */

section('关卡数据校验');
const Levels = sandbox.Levels;
const TS = Levels.TS;

ok(Levels.list.length === 3, '应有 3 个关卡，实际 ' + Levels.list.length);

Levels.list.forEach(function (lv) {
  const tag = '[' + lv.id + '] ';
  ok(lv.tiles.length === lv.height, tag + '行数应为 ' + lv.height + '，实际 ' + lv.tiles.length);
  let badRow = -1;
  for (let y = 0; y < lv.tiles.length; y++) {
    if (lv.tiles[y].length !== lv.width) { badRow = y; break; }
  }
  ok(badRow < 0, tag + '第 ' + badRow + ' 行宽度应为 ' + lv.width);

  // 出生点不能卡在方块里，脚下要有地
  const solid = function (tx, ty) {
    if (ty < 0 || ty >= lv.height || tx < 0 || tx >= lv.width) return false;
    return !!Levels.WALKABLE[lv.tiles[ty][tx]];
  };
  const sx = Math.floor(lv.marioStart.x / TS);
  const sy = Math.floor(lv.marioStart.y / TS);
  ok(!solid(sx, sy), tag + '出生点被方块占据');
  ok(solid(sx, sy + 1), tag + '出生点脚下没有地面');

  // 敌人生成点下方必须有落脚点，或者本身就是飞行/管道类
  lv.spawns.forEach(function (s) {
    if (s.type === 'P') return;
    let found = false;
    for (let y = s.ty; y < lv.height; y++) {
      if (solid(s.tx, y)) { found = true; break; }
    }
    ok(found, tag + '敌人 ' + s.type + ' @(' + s.tx + ',' + s.ty + ') 下方没有落脚点');
  });

  // 旗杆必须存在
  let poleCount = 0;
  for (let y = 0; y < lv.height; y++) if (lv.tiles[y][lv.flagTx] === '|') poleCount++;
  ok(poleCount >= 8, tag + '旗杆太短 (' + poleCount + ' 格)');

  // 城堡不能超出关卡
  ok((lv.castleTx + 5) * TS <= lv.width * TS, tag + '城堡超出关卡右边界');

  // 金币 / 问号块数量
  let coins = 0, q = 0;
  for (let y = 0; y < lv.height; y++) {
    for (let x = 0; x < lv.width; x++) {
      const c = lv.tiles[y][x];
      if (c === 'o') coins++;
      if (c === '?' || c === '!') q++;
    }
  }
  console.log('  ' + lv.id + ': ' + lv.width + 'x' + lv.height +
    '  敌人 ' + lv.spawns.length + '  金币 ' + coins + '  问号块 ' + q +
    '  装饰 ' + lv.decor.length);
  ok(coins > 0, tag + '没有任何金币');
  ok(q > 0, tag + '没有任何问号块');
});

/* ---------------- 1.5 精灵尺寸校验 ---------------- */

section('精灵尺寸校验');
(function () {
  const SPR = sandbox.Spr.SPR;
  const dim = function (img) { return img ? img.width + 'x' + img.height : 'null'; };
  const expect = function (img, w, h, tag) {
    ok(img && img.width === w && img.height === h,
      tag + ' 应为 ' + w + 'x' + h + '，实际 ' + dim(img));
  };

  // 小马里奥 16x16
  ['idle', 'jump', 'skid', 'dead'].forEach(function (k) {
    expect(SPR.mario.normal.small[k][0], 16, 16, 'small.' + k);
    expect(SPR.mario.fire.small[k][0], 16, 16, 'fire.small.' + k);
  });
  SPR.mario.normal.small.walk.forEach(function (f, i) { expect(f, 16, 16, 'small.walk[' + i + ']'); });

  // 大马里奥 16x32
  ['idle', 'jump', 'skid'].forEach(function (k) {
    expect(SPR.mario.normal.big[k][0], 16, 32, 'big.' + k);
    expect(SPR.mario.fire.big[k][0], 16, 32, 'fire.big.' + k);
  });
  SPR.mario.normal.big.walk.forEach(function (f, i) { expect(f, 16, 32, 'big.walk[' + i + ']'); });
  expect(SPR.mario.normal.big.duck[0], 16, 22, 'big.duck');

  // 敌人与道具
  SPR.goomba.walk.forEach(function (f, i) { expect(f, 16, 16, 'goomba.walk[' + i + ']'); });
  expect(SPR.goomba.flat, 16, 16, 'goomba.flat');
  SPR.koopa.walk.forEach(function (f, i) { expect(f, 16, 24, 'koopa.walk[' + i + ']'); });
  expect(SPR.koopa.shell, 16, 16, 'koopa.shell');
  SPR.piranha.forEach(function (f, i) { expect(f, 16, 24, 'piranha[' + i + ']'); });
  expect(SPR.mushroom, 16, 16, 'mushroom');
  expect(SPR.flower, 16, 16, 'flower');
  SPR.star.forEach(function (f, i) { expect(f, 16, 16, 'star[' + i + ']'); });
  expect(SPR.fireball, 8, 8, 'fireball');

  // 瓦片
  ['overworld', 'underground', 'sky'].forEach(function (theme) {
    const T = sandbox.Spr.makeTileset(theme);
    ['ground', 'brick', 'stone', 'used', 'pipeTL', 'pipeTR', 'pipeBL', 'pipeBR',
      'flagBall', 'flag'].forEach(function (k) {
      expect(T[k], 16, 16, theme + '.' + k);
    });
    T.q.forEach(function (f, i) { expect(f, 16, 16, theme + '.q[' + i + ']'); });
    T.coin.forEach(function (f, i) { expect(f, 16, 16, theme + '.coin[' + i + ']'); });
    expect(T.castle, 80, 80, theme + '.castle');
  });
})();

/* ---------------- 1.8 跳跃性能（对照关卡设计） ---------------- */

section('跳跃性能实测');
(function () {
  game.state = 'playing';
  game.paused = false;
  game.loadLevel(0, null);
  game.state = 'playing';
  game.camX = 0;
  game.entities = [];              // 清空敌人，避免干扰测量
  game.time = 400;
  // 清空地面上方的瓦片，得到一条无障碍跑道（砖块会撞头，影响测量）
  for (let ty = 0; ty <= 12; ty++) {
    for (let tx = 0; tx < 68; tx++) game.grid[ty][tx] = ' ';
  }

  const m = game.mario;
  m.power = 0;
  m.applySize();
  m.x = 2 * TS;
  m.y = (Levels.GROUND_TOP - 1) * TS;

  // 先助跑到最高速
  game.input.right = true;
  game.input.run = true;
  game.input.jump = false;
  for (let i = 0; i < 90; i++) { game.update(); }
  const runSpeed = m.vx;
  const startX = m.x;
  const startY = m.y;

  // 起跳并按住跳跃键
  game.input.jump = true;
  let peak = 0;
  let peakX = startX;
  let airFrames = 0;
  for (let i = 0; i < 200; i++) {
    game.update();
    if (startY - m.y > peak) { peak = startY - m.y; peakX = m.x; }
    airFrames++;
    if (m.onGround && i > 5) break;
  }
  game.input.right = false;
  game.input.run = false;
  game.input.jump = false;

  const heightTiles = peak / TS;
  const distTiles = (peakX - startX) / TS;
  console.log('  最高速度 ' + runSpeed.toFixed(2) + ' px/帧   ' +
    '跳跃高度 ' + heightTiles.toFixed(2) + ' 格 (' + peak.toFixed(0) + 'px)   ' +
    '到最高点水平距离 ' + distTiles.toFixed(2) + ' 格   滞空 ' + airFrames + ' 帧');

  ok(heightTiles >= 4.0, '满速起跳高度应 ≥ 4 格，实际 ' + heightTiles.toFixed(2));
  ok(distTiles >= 4.0, '满速起跳水平距离应 ≥ 4 格，实际 ' + distTiles.toFixed(2));
  ok(distTiles <= 10.0, '满速起跳水平距离不应过大（>10 格会让关卡失去挑战），实际 ' + distTiles.toFixed(2));
  ok(runSpeed >= 2.4 && runSpeed <= 2.8, '最高奔跑速度应在 2.4~2.8 px/帧，实际 ' + runSpeed.toFixed(2));

  // 原地起跳高度（用于判断能否顶到 4 格高的砖块）
  game.loadLevel(0, null);
  game.state = 'playing';
  game.entities = [];
  game.time = 400;
  for (let ty = 0; ty <= 12; ty++) {
    for (let tx = 0; tx < 68; tx++) game.grid[ty][tx] = ' ';
  }
  const m2 = game.mario;
  m2.x = 4 * TS; m2.y = (Levels.GROUND_TOP - 1) * TS;
  game.input.jump = false;
  for (let i = 0; i < 30; i++) game.update();
  const y0 = m2.y;
  game.input.jump = true;
  let peak2 = 0;
  for (let i = 0; i < 120; i++) {
    game.update();
    peak2 = Math.max(peak2, y0 - m2.y);
    if (m2.onGround && i > 5) break;
  }
  game.input.jump = false;
  console.log('  原地起跳高度 ' + (peak2 / TS).toFixed(2) + ' 格');
  ok(peak2 / TS >= 2.5, '原地起跳应 ≥ 2.5 格，实际 ' + (peak2 / TS).toFixed(2));

  // 复位，避免影响后续用例
  game.state = 'title';
  game.timer = 0;
  game.lives = 3;
})();

/* ---------------- 2. 空跑若干帧 ---------------- */

let runtimeErrors = [];

function step(frames, hook) {
  for (let i = 0; i < frames; i++) {
    try {
      game.update();
      game.render();
    } catch (e) {
      runtimeErrors.push(e);
      if (runtimeErrors.length > 4) return;
    }
    if (hook) hook(i);
  }
}

section('标题界面');
step(120);
ok(game.state === 'title', '初始状态应为 title，实际 ' + game.state);

section('开始游戏 + 逐关模拟');
game.onStart();
ok(game.state === 'ready', '按开始后应为 ready，实际 ' + game.state);
step(130);
ok(game.state === 'playing', '准备卡结束后应为 playing，实际 ' + game.state);

// 简易 AI：一直向右跑，定期跳跃
function drive(frames) {
  step(frames, function (i) {
    game.input.right = true;
    game.input.run = i % 240 < 120;
    game.input.jump = (i % 34) < 14;
    if (i % 34 === 0) { game.input.jump = true; }
    if (game.mario && game.mario.state === 'dead') {
      game.input.right = false; game.input.jump = false;
    }
  });
}

drive(1800);
ok(!game.mario || game.mario.state !== 'play' || game.mario.x > 100, '马里奥应该已经向右移动（x=' + (game.mario && game.mario.x) + '）');

// 强制触发各种玩法分支
section('强制触发玩法分支');
const S = sandbox.Spr;

function force(tag, fn) {
  const before = runtimeErrors.length;
  try { fn(); } catch (e) { runtimeErrors.push(e); }
  step(40);
  ok(runtimeErrors.length === before, tag + ' 触发了运行时错误');
}

force('吃蘑菇（变大）', function () { game.mario.state = 'play'; game.mario.power = 0; game.mario.eatMushroom(); });
force('吃火花（火焰）', function () { game.mario.eatFlower(); });
force('发射火球', function () {
  game.mario.state = 'play';
  game.input.run = false; step(1);
  game.input.run = true; step(1);
  game.input.run = false; step(1);
});
force('吃星星（无敌）', function () { game.mario.eatStar(); });
force('受伤（缩小）', function () { game.mario.starTimer = 0; game.mario.invulnTimer = 0; game.mario.state = 'play'; game.mario.hurt(); });
force('受伤（死亡）', function () { game.mario.invulnTimer = 0; game.mario.state = 'play'; game.mario.hurt(); });
force('掉坑死亡', function () { game.mario.state = 'play'; game.mario.y = game.level.pitDeathY + 10; });
step(240);   // 等待复活

ok(game.lives >= 0, '生命数不应为负：' + game.lives);

force('顶问号块', function () {
  game.state = 'playing';
  game.mario.state = 'play';
  game.hitBlock(game.level.checkpointTx + 2, 9, game.mario);
});
force('顶砖块（大马里奥）', function () {
  game.mario.power = 1; game.mario.state = 'play';
  // 找一块砖
  outer:
  for (let y = 0; y < game.level.height; y++) {
    for (let x = 0; x < game.level.width; x++) {
      if (game.grid[y][x] === 'B') { game.hitBlock(x, y, game.mario); break outer; }
    }
  }
});
force('收集金币', function () {
  outer2:
  for (let y = 0; y < game.level.height; y++) {
    for (let x = 0; x < game.level.width; x++) {
      if (game.grid[y][x] === 'o') {
        game.mario.x = x * TS; game.mario.y = y * TS;
        game.collectCoins(game.mario);
        break outer2;
      }
    }
  }
});
force('加命 / 100 金币', function () { game.coins = 99; game.gainCoin(); });

/* ---------------- 3. 逐关完整跑通 ---------------- */

section('逐关加载与渲染');
for (let i = 0; i < Levels.list.length; i++) {
  const before = runtimeErrors.length;
  game.state = 'playing';
  game.paused = false;
  game.loadLevel(i, null);
  game.state = 'ready';
  game.timer = 0;
  step(20);
  drive(600);
  ok(runtimeErrors.length === before, '关卡 ' + Levels.list[i].id + ' 运行出错');

  // 触发降旗流程
  try {
    game.state = 'playing';
    game.mario.state = 'play';
    game.mario.x = Levels.list[i].flagTx * TS;
    game.mario.y = (Levels.list[i].flagTopTy + 2) * TS;
    game.checkFlagpole();
    step(500);
  } catch (e) { runtimeErrors.push(e); }
  ok(runtimeErrors.length === before, '关卡 ' + Levels.list[i].id + ' 降旗流程出错；state=' + game.state);
}

section('结算界面');
game.state = 'clear'; game.timer = 0; step(300);
try { game.renderWin(); } catch (e) { runtimeErrors.push(e); }
try { game.renderGameOver(); } catch (e) { runtimeErrors.push(e); }
try { game.renderTitle(); } catch (e) { runtimeErrors.push(e); }
try { game.renderReady(); } catch (e) { runtimeErrors.push(e); }

/* ---------------- 4. 暂停 / 静音 ---------------- */

section('辅助功能');
try {
  game.state = 'playing';
  game.togglePause(); step(10); game.togglePause(); step(10);
  game.toggleMute(); step(5); game.toggleMute(); step(5);
  game.restart(); step(60);
} catch (e) { runtimeErrors.push(e); }

/* ---------------- 结果 ---------------- */

console.log('\n断言：' + (checks - failures) + '/' + checks + ' 通过');

if (runtimeErrors.length) {
  console.error('\n运行时错误 ' + runtimeErrors.length + ' 处：');
  runtimeErrors.slice(0, 5).forEach(function (e) {
    console.error('---');
    console.error(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  });
}

if (failures || runtimeErrors.length) {
  console.error('\n结果：失败');
  process.exit(1);
}
console.log('结果：全部通过 ✅');
