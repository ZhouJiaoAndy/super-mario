/* ============================================================
   tools/harness.js —— 在 Node 里加载游戏脚本的公共环境
   提供 Canvas / DOM / localStorage 桩件，返回 { sandbox, game, ... }
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mini = require('./mini-canvas');

const ROOT = path.resolve(__dirname, '..');

function boot(options) {
  options = options || {};
  const real = options.realCanvas !== false;      // 默认用真实光栅化器

  const screenCanvas = real ? mini.createCanvas(256, 240) : mini.createCanvas(256, 240);

  const stubClassList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  const elements = {
    screen: screenCanvas,
    stage: screenCanvas
  };

  const documentStub = {
    fullscreenElement: null,
    hidden: false,
    createElement(tag) {
      if (tag === 'canvas') return mini.createCanvas(300, 150);
      return Object.assign(mini.createCanvas(1, 1), { classList: stubClassList, textContent: '', style: {}, getAttribute() { return null; } });
    },
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = Object.assign(mini.createCanvas(1, 1), {
          classList: stubClassList, textContent: '', style: {}, getAttribute() { return null; }
        });
      }
      return elements[id];
    },
    addEventListener() {}, removeEventListener() {}, exitFullscreen() {}
  };

  const store = new Map();
  let clock = 0;
  let raf = null;

  const sandbox = {
    console: options.quiet ? Object.assign({}, console, { log() {} }) : console,
    Math, Date, JSON, RegExp, parseInt, parseFloat, isNaN, isFinite,
    String, Number, Boolean, Array, Object, Error, TypeError, RangeError,
    Map, Set, WeakMap, Promise, Uint8ClampedArray, Float32Array, Uint8Array,
    document: documentStub,
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); }
    },
    navigator: { maxTouchPoints: 0, userAgent: 'node' },
    performance: { now() { return clock; } },
    requestAnimationFrame(fn) { raf = fn; return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 0; },
    AudioContext: undefined,
    webkitAudioContext: undefined,
    addEventListener() {}, removeEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  ['js/audio.js', 'js/sprites.js', 'js/levels.js', 'js/entities.js', 'js/game.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  });

  return {
    sandbox,
    game: sandbox.game,
    Levels: sandbox.Levels,
    Spr: sandbox.Spr,
    Ent: sandbox.Ent,
    screen: screenCanvas,
    elements,
    tick(ms) { clock += (ms || 0); if (raf) raf(clock); }
  };
}

module.exports = { boot, ROOT };
