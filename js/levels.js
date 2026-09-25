/* ============================================================
   levels.js —— 关卡数据
   关卡用「字符网格 + 构建函数」描述，避免手写超长字符串出错。

   瓦片图例：
     ' '  空气          'X'  地面（实心）      '#'  石块（实心）
     'B'  砖块（大马里奥可顶碎）              '?'  问号块 → 金币
     '!'  问号块 → 道具（蘑菇/火花）          'U'  已顶过的块
     'o'  金币（可拾取，非实心）              '|'  旗杆（非实心）
     '['  ']'  水管顶部左右                    '{'  '}'  水管管身左右
     'g'  板栗仔出生点   'k'  乌龟出生点      'P'  食人花出生点
   ============================================================ */
(function (global) {
  'use strict';

  const TS = 16;          // 瓦片尺寸
  const H = 15;           // 关卡高度（瓦片）
  const GROUND_TOP = 13;  // 地面顶部所在行
  const WALKABLE = { 'X': 1, '#': 1, 'B': 1, '?': 1, '!': 1, 'U': 1, '[': 1, ']': 1, '{': 1, '}': 1 };
  const BREAKABLE = { 'B': 1 };
  const ITEM_BLOCK = { '?': 'coin', '!': 'item' };

  /* ---------------- 网格工具 ---------------- */

  function newGrid(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) {
      const row = new Array(w);
      for (let x = 0; x < w; x++) row[x] = ' ';
      g.push(row);
    }
    g.w = w; g.h = h;
    return g;
  }

  function set(g, x, y, ch) {
    if (x >= 0 && x < g.w && y >= 0 && y < g.h) g[y][x] = ch;
  }

  function fill(g, x0, y0, x1, y1, ch) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch);
  }

  /** 铺地面（最下面两行） */
  function ground(g, x0, x1) { fill(g, x0, GROUND_TOP, x1, g.h - 1, 'X'); }

  /** 水管：左上角在 (x, GROUND_TOP-height)，占 2 列 */
  function pipe(g, x, height, withPlant) {
    const top = GROUND_TOP - height;
    set(g, x, top, '['); set(g, x + 1, top, ']');
    for (let y = top + 1; y < GROUND_TOP; y++) { set(g, x, y, '{'); set(g, x + 1, y, '}'); }
    if (withPlant) set(g, x, top - 1, 'P');
  }

  /** 上升台阶，n 级 */
  function stairsUp(g, x, n, ch) {
    ch = ch || '#';
    for (let i = 0; i < n; i++) {
      for (let h = 0; h <= i; h++) set(g, x + i, GROUND_TOP - 1 - h, ch);
    }
  }

  /** 下降台阶，n 级 */
  function stairsDown(g, x, n, ch) {
    ch = ch || '#';
    for (let i = 0; i < n; i++) {
      for (let h = 0; h < n - i; h++) set(g, x + i, GROUND_TOP - 1 - h, ch);
    }
  }

  /** 悬空平台 */
  function plat(g, x, y, w, ch) {
    ch = ch || '#';
    for (let i = 0; i < w; i++) set(g, x + i, y, ch);
  }

  /** 一排金币 */
  function coinRow(g, x, y, n, step) {
    step = step || 1;
    for (let i = 0; i < n; i++) set(g, x + i * step, y, 'o');
  }

  function flagpole(g, x, topTy, botTy) {
    for (let y = topTy; y <= botTy; y++) set(g, x, y, '|');
  }

  /* ---------------- 确定性随机（用于背景装饰） ---------------- */

  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------------- 收尾：抽出实体、生成装饰 ---------------- */

  function finalize(g, meta) {
    const spawns = [];
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const ch = g[y][x];
        if (ch === 'g' || ch === 'k' || ch === 'P') {
          g[y][x] = ' ';
          spawns.push({ type: ch, x: x * TS, y: y * TS, ty: y, tx: x });
        }
      }
    }

    const tiles = [];
    for (let y = 0; y < g.h; y++) tiles.push(g[y].join(''));

    // 背景装饰
    const rng = makeRng(meta.seed || 12345);
    const decor = [];
    if (meta.theme === 'overworld' || meta.theme === 'sky') {
      for (let x = 6; x < g.w - 6; x += 12 + Math.floor(rng() * 12)) {
        decor.push({ type: rng() < 0.45 ? 'cloudBig' : 'cloudSmall', x: x * TS + Math.floor(rng() * 32), y: (2 + Math.floor(rng() * 3)) * TS });
      }
      if (meta.theme === 'overworld') {
        for (let x = 4; x < g.w - 10; x += 18 + Math.floor(rng() * 16)) {
          if (g[GROUND_TOP][x] !== 'X' || g[GROUND_TOP][x + 3] !== 'X') continue;
          decor.push({ type: rng() < 0.5 ? 'hillBig' : 'hillSmall', x: x * TS, y: GROUND_TOP * TS });
        }
        for (let x = 3; x < g.w - 6; x += 11 + Math.floor(rng() * 12)) {
          if (g[GROUND_TOP][x] !== 'X' || g[GROUND_TOP][x + 2] !== 'X') continue;
          decor.push({ type: 'bush', x: x * TS, y: GROUND_TOP * TS });
        }
      }
    }

    meta.width = g.w;
    meta.height = g.h;
    meta.groundY = GROUND_TOP * TS;
    meta.tiles = tiles;
    meta.spawns = spawns;
    meta.decor = decor;
    return meta;
  }

  /* =========================================================
     1-1  地上关
     ========================================================= */

  function build11() {
    const W = 214;
    const g = newGrid(W, H);

    ground(g, 0, 68);
    ground(g, 71, 85);
    ground(g, 89, 139);
    ground(g, 142, 152);
    ground(g, 155, W - 1);

    /* --- 开场教学区 --- */
    set(g, 16, 9, '?');
    set(g, 20, 9, 'B'); set(g, 21, 9, '?'); set(g, 22, 9, 'B');
    set(g, 23, 9, '!'); set(g, 24, 9, 'B');
    set(g, 22, 5, '?');
    set(g, 21, 7, 'o'); set(g, 23, 7, 'o');
    set(g, 22, 12, 'g');

    /* --- 水管区 --- */
    pipe(g, 28, 2);
    pipe(g, 38, 3);
    pipe(g, 46, 4);
    pipe(g, 57, 4, true);
    set(g, 40, 12, 'g');
    set(g, 51, 12, 'g'); set(g, 52, 12, 'g');
    set(g, 34, 10, 'o'); set(g, 35, 10, 'o');
    set(g, 42, 9, 'o'); set(g, 43, 9, 'o');

    /* --- 第一个坑（69~70） --- */
    set(g, 64, 9, 'B'); set(g, 65, 9, '?'); set(g, 66, 9, 'B');
    set(g, 65, 7, 'o');

    /* --- 71~85 --- */
    set(g, 77, 9, 'B'); set(g, 78, 9, '!'); set(g, 79, 9, 'B');
    set(g, 77, 7, 'o'); set(g, 78, 7, 'o'); set(g, 79, 7, 'o');
    set(g, 80, 12, 'g'); set(g, 82, 12, 'g');

    /* --- 第二个坑（86~88）后 --- */
    set(g, 91, 9, 'B'); set(g, 92, 9, '?'); set(g, 93, 9, 'B');
    plat(g, 94, 5, 3, 'B');
    coinRow(g, 94, 4, 3);
    set(g, 97, 12, 'g'); set(g, 98, 12, 'g');

    /* --- 台阶区 --- */
    stairsUp(g, 104, 4);
    stairsDown(g, 109, 4);

    /* --- 砖桥 --- */
    plat(g, 116, 9, 5, 'B');
    set(g, 118, 9, '?');
    coinRow(g, 116, 7, 5);
    set(g, 124, 12, 'k');
    set(g, 131, 12, 'g'); set(g, 132, 12, 'g');
    set(g, 134, 5, 'B'); set(g, 135, 5, '?'); set(g, 136, 5, 'B');

    /* --- 第三个坑（140~141） --- */
    set(g, 137, 9, 'B'); set(g, 138, 9, 'B');
    set(g, 146, 12, 'k');
    set(g, 144, 10, 'o'); set(g, 145, 10, 'o');

    /* --- 终局区 --- */
    set(g, 157, 9, 'B'); set(g, 158, 9, '?'); set(g, 159, 9, 'B');
    set(g, 160, 12, 'g'); set(g, 161, 12, 'g');
    plat(g, 165, 5, 4, 'B');
    coinRow(g, 165, 4, 4);
    stairsUp(g, 175, 8);
    set(g, 170, 12, 'g');

    /* --- 旗杆与城堡 --- */
    const flagX = 194;
    flagpole(g, flagX, 3, GROUND_TOP - 1);

    return finalize(g, {
      id: '1-1',
      name: 'WORLD 1-1',
      theme: 'overworld',
      music: 'overworld',
      timeLimit: 400,
      seed: 20240501,
      marioStart: { x: 2 * TS, y: (GROUND_TOP - 1) * TS },
      flagTx: flagX,
      flagTopTy: 3,
      castleTx: 199,
      checkpointTx: 100,
      pitDeathY: (H + 2) * TS
    });
  }

  /* =========================================================
     1-2  地下关
     ========================================================= */

  function build12() {
    const W = 172;
    const g = newGrid(W, H);

    ground(g, 0, 58);
    ground(g, 62, 110);
    ground(g, 114, W - 1);

    // 洞顶
    fill(g, 0, 0, W - 1, 1, '#');

    /* --- 起始走廊 --- */
    coinRow(g, 5, 10, 4);
    set(g, 12, 8, 'B'); set(g, 13, 8, '?'); set(g, 14, 8, 'B');
    set(g, 15, 8, '!'); set(g, 16, 8, 'B');
    set(g, 10, 12, 'g');

    /* --- 水管 --- */
    pipe(g, 20, 3);
    set(g, 26, 12, 'g');
    set(g, 30, 12, 'k');

    /* --- 砖顶长廊 --- */
    plat(g, 34, 6, 11, 'B');
    coinRow(g, 35, 7, 5, 2);
    set(g, 38, 12, 'k');

    /* --- 石柱阵 --- */
    fill(g, 48, 10, 48, 12, '#');
    fill(g, 52, 9, 52, 12, '#');
    fill(g, 56, 8, 56, 12, '#');
    set(g, 50, 12, 'g'); set(g, 51, 12, 'g');

    /* --- 第一个坑（59~61），上方有砖桥 --- */
    plat(g, 58, 8, 4, 'B');
    coinRow(g, 58, 7, 4);

    /* --- 62~110 --- */
    coinRow(g, 64, 11, 3);
    set(g, 66, 12, 'g');
    plat(g, 70, 9, 3, 'B');
    set(g, 71, 9, '?');
    set(g, 74, 12, 'k');
    stairsDown(g, 78, 4);
    stairsUp(g, 86, 4);
    set(g, 92, 12, 'g'); set(g, 93, 12, 'g');
    plat(g, 96, 6, 9, 'B');
    set(g, 100, 6, '?');
    coinRow(g, 96, 7, 8);

    /* --- 管道 + 上行石块 --- */
    pipe(g, 104, 3, true);
    stairsUp(g, 106, 4, '#');

    /* --- 第二个坑（111~113） --- */
    plat(g, 111, 7, 3, '#');

    /* --- 114~ 终局 --- */
    set(g, 118, 12, 'k');
    plat(g, 122, 9, 9, 'B');
    set(g, 126, 9, '?');
    coinRow(g, 122, 8, 9);
    set(g, 134, 12, 'g'); set(g, 135, 12, 'g');
    plat(g, 139, 5, 8, 'B');
    coinRow(g, 139, 4, 8);
    set(g, 140, 12, 'k');

    stairsUp(g, 150, 6);

    const flagX = 160;
    flagpole(g, flagX, 3, GROUND_TOP - 1);

    return finalize(g, {
      id: '1-2',
      name: 'WORLD 1-2',
      theme: 'underground',
      music: 'underground',
      timeLimit: 400,
      seed: 771102,
      marioStart: { x: 2 * TS, y: (GROUND_TOP - 1) * TS },
      flagTx: flagX,
      flagTopTy: 3,
      castleTx: 165,
      checkpointTx: 86,
      pitDeathY: (H + 2) * TS
    });
  }

  /* =========================================================
     1-3  空中关
     ========================================================= */

  function build13() {
    const W = 182;
    const g = newGrid(W, H);

    ground(g, 0, 14);
    ground(g, 166, W - 1);

    /* --- 出发平台 --- */
    set(g, 10, 9, '!');
    set(g, 7, 12, 'g');

    /* --- 浮空平台群 --- */
    plat(g, 18, 11, 4);
    coinRow(g, 18, 10, 4);
    plat(g, 25, 10, 4, 'B');
    set(g, 26, 10, '?');
    plat(g, 32, 9, 4);
    plat(g, 39, 8, 4);
    set(g, 40, 7, 'k');
    plat(g, 47, 10, 3);
    coinRow(g, 47, 9, 3);
    plat(g, 53, 11, 5, 'B');
    set(g, 55, 11, '!');
    plat(g, 61, 9, 3);
    set(g, 62, 8, 'k');
    plat(g, 66, 11, 3);
    plat(g, 72, 8, 6);
    set(g, 74, 7, 'k');
    coinRow(g, 72, 7, 6);
    plat(g, 81, 10, 3);
    plat(g, 86, 12, 4, 'B');
    coinRow(g, 86, 11, 4);
    plat(g, 93, 9, 3);
    set(g, 94, 8, 'g');
    plat(g, 98, 7, 5, 'B');
    set(g, 100, 7, '?');
    coinRow(g, 98, 6, 5);
    plat(g, 105, 10, 4);
    set(g, 106, 9, 'k');
    plat(g, 112, 8, 3);
    plat(g, 117, 11, 5, 'B');
    coinRow(g, 117, 10, 5);
    plat(g, 125, 9, 3);
    plat(g, 130, 7, 6, 'B');
    set(g, 132, 7, '?'); set(g, 133, 7, '!');
    plat(g, 139, 10, 4);
    set(g, 140, 9, 'k');
    plat(g, 146, 12, 4);
    coinRow(g, 146, 11, 4);
    plat(g, 153, 10, 3);
    plat(g, 158, 12, 5, 'B');
    set(g, 160, 11, 'g');

    /* --- 终点 --- */
    stairsUp(g, 166, 4, '#');
    const flagX = 175;
    flagpole(g, flagX, 3, GROUND_TOP - 1);

    return finalize(g, {
      id: '1-3',
      name: 'WORLD 1-3',
      theme: 'sky',
      music: 'sky',
      timeLimit: 350,
      seed: 31337,
      marioStart: { x: 2 * TS, y: (GROUND_TOP - 1) * TS },
      flagTx: flagX,
      flagTopTy: 3,
      castleTx: 176,
      checkpointTx: 93,
      pitDeathY: (H + 2) * TS
    });
  }

  /* ---------------- 汇总 ---------------- */

  const LEVELS = [build11, build12, build13].map(function (f) { return f(); });

  global.Levels = {
    TS: TS,
    H: H,
    GROUND_TOP: GROUND_TOP,
    WALKABLE: WALKABLE,
    BREAKABLE: BREAKABLE,
    ITEM_BLOCK: ITEM_BLOCK,
    list: LEVELS
  };

})(window);
