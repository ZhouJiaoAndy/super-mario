/* ============================================================
   sprites.js —— 像素美术资源
   所有图形都在运行时用 Canvas 生成，不依赖任何图片文件。
   - 角色 / 道具：手写 16x16 / 16x24 / 16x32 像素图
   - 砖块 / 水管 / 问号块：按主题配色程序化生成
   - HUD 文字：内置 5x7 位图字体
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------
     0. 基础工具
     --------------------------------------------------------- */

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return c;
  }

  /** 把字符画转成 canvas，pal 是 字符->颜色 的映射，未定义的字符视为透明 */
  function px(rows, pal, rot) {
    let w = 0;
    for (let i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    const h = rows.length;
    const c = cv(w, h);
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  const _flipCache = new Map();
  function flipped(c) {
    let f = _flipCache.get(c);
    if (!f) {
      f = cv(c.width, c.height);
      const g = f.getContext('2d');
      g.translate(c.width, 0);
      g.scale(-1, 1);
      g.drawImage(c, 0, 0);
      _flipCache.set(c, f);
    }
    return f;
  }

  function drawSprite(ctx, c, x, y, flip) {
    if (!c) return;
    ctx.drawImage(flip ? flipped(c) : c, Math.round(x), Math.round(y));
  }

  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(a) {
    return '#' + a.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function mix(c1, c2, t) {
    const a = hex2rgb(c1), b = hex2rgb(c2);
    return rgb2hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }

  /** 带斜面的矩形填充 */
  function bevel(g, x, y, w, h, main, light, dark) {
    g.fillStyle = main;  g.fillRect(x, y, w, h);
    g.fillStyle = light; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    g.fillStyle = dark;  g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
  }

  /* ---------------------------------------------------------
     1. 调色板
     --------------------------------------------------------- */

  const PAL = {
    K: '#000000',   // 描边
    W: '#fcfcfc',   // 白
    R: '#e03020',   // 红（帽子/上衣）
    r: '#a01818',   // 深红
    S: '#fcb078',   // 肤色
    s: '#d08040',   // 肤色暗部
    H: '#7c3808',   // 棕（头发/鞋）
    h: '#b05820',   // 棕（亮）
    B: '#2038ec',   // 蓝（背带裤）
    b: '#1020a8',   // 深蓝
    Y: '#f8b800',   // 黄（纽扣）
    G: '#00a800',   // 绿
    g: '#006800',   // 深绿
    O: '#f88000',   // 橙
    T: '#f8d8a8'    // 浅褐
  };

  // 火焰马里奥：白衣 + 红裤
  const PAL_FIRE = Object.assign({}, PAL, {
    R: '#fcfcfc',
    r: '#c8c8c8',
    B: '#e03020',
    b: '#a01818'
  });

  /* ---------------------------------------------------------
     2. 马里奥像素图
     --------------------------------------------------------- */

  // --- 小马里奥 16x16 ---

  const SM_IDLE = [
    '................',
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '....SSSSSSSS....',
    '...RRRBRRBRRR...',
    '..RRRRBRRBRRRR..',
    '..SSRBBBBBBRSS..',
    '..SSSBBBBBBSSS..',
    '....BBBBBBBB....',
    '...HHHH..HHHH...',
    '..HHHHH..HHHHH..'
  ];
  const SM_WALK0 = [
    '................',
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '....SSSSSSSS....',
    '...RRBBBBRRRR...',
    '..RRRBBBBBBRRR..',
    '..SSBBBBBBBBSS..',
    '...BBBBBBBBBB...',
    '..BBBBB..BBBBB..',
    '.HHHHH....HHHH..',
    '.HHHH......HHH..'
  ];
  const SM_WALK1 = [
    '................',
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '....SSSSSSSS....',
    '..RRRBBBBBBRR...',
    '.RRRBBBBBBBBRR..',
    '.SSBBBBBBBBBSS..',
    '...BBBBBBBBB....',
    '..BBBB...BBBBB..',
    '.HHHH.....HHHH..',
    'HHHH.......HHHH.'
  ];
  const SM_WALK2 = [
    '................',
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '....SSSSSSSS....',
    '...RRRBBBBRRR...',
    '..RRRBBBBBBRRR..',
    '..SSBBBBBBBBSS..',
    '...BBBBBBBBB....',
    '....BBBB.BBB....',
    '...HHHH...HHH...',
    '..HHHHH...HHHH..'
  ];
  const SM_JUMP = [
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '..SS.SSSSSSSS...',
    '.SSSRRBBBBRRRS..',
    '.SSRRRBBBBBBRR..',
    '..RRBBBBBBBBBB..',
    '...BBBBBBBBBB...',
    '..BBBBB...BBB...',
    '.HHHHH.....HHH..',
    '.HHHH......HHHH.',
    '................'
  ];
  const SM_SKID = [
    '................',
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '....SSSSSSSS....',
    '..RRRRBBBBRRRR..',
    '.RRRRRBBBBRRRRR.',
    '.SSRRBBBBBBRRSS.',
    '.SSSBBBBBBBBSSS.',
    '....BBBB.BBB....',
    '...HHHHH.HHHH...',
    '..HHHHH...HHHH..'
  ];
  const SM_DEAD = [
    '................',
    '................',
    '....RRRRRR......',
    '...RRRRRRRRRR...',
    '...HHHSSSKS.....',
    '..HSHSSSSKSSS...',
    '..HSHHSSSSKSSS..',
    '..HHSSSSSKKKK...',
    '....SSSSSSSS....',
    '..RRRRBBBBRRRR..',
    '.RRRRRBBBBRRRRR.',
    '.SSRRBBBBBBRRSS.',
    '.SSSBBBBBBBBSSS.',
    '....BBB..BBB....',
    '...HHHH..HHHH...',
    '..HHHHH..HHHHH..'
  ];

  // --- 大马里奥 16x32（头/躯干/腿 三段拼接，省去重复绘制） ---

  const BIG_TOP = [
    '................',
    '................',
    '.....RRRRRR.....',
    '....RRRRRRRRRR..',
    '...RRRRRRRRRRRR.',
    '...HHHHSSSKS....',
    '..HHSHSSSSKSSS..',
    '..HHSHHSSSSKSSS.',
    '..HHHSSSSSKKKK..',
    '..HHSSSSSSSSSS..',
    '....SSSSSSSS....',
    '....SSSSSSSS....',
    '...RRRRRRRRRR...',
    '..RRRRRRRRRRRR..'
  ];
  const BIG_TORSO = {
    idle: [
      '..RRRBRRRRBRRR..',
      '..SSRBBBBBBRSS..',
      '..SSRBBBBBBRSS..',
      '..SSBBBBBBBBSS..',
      '..SSBBBBBBBBSS..',
      '....BYBBBBYB....',
      '....BBBBBBBB....',
      '....BBBBBBBB....'
    ],
    walk: [
      '..RRRBRRRRBRRR..',
      '..SSRBBBBBBRSS..',
      '..SSRBBBBBBRSS..',
      '.SSSBBBBBBBBSSS.',
      '..SSBBBBBBBBSS..',
      '....BYBBBBYB....',
      '....BBBBBBBB....',
      '...BBBBBBBBBB...'
    ],
    jump: [
      '.RRRRBRRRRBRRRR.',
      '.SSRRBBBBBBRRSS.',
      '.SSRRBBBBBBRRSS.',
      '.SSSBBBBBBBBSSS.',
      '....BBBBBBBB....',
      '....BYBBBBYB....',
      '...BBBBBBBBBB...',
      '..BBBBB..BBBBB..'
    ]
  };
  const BIG_LEGS = {
    idle: [
      '...BBBBBBBBBB...',
      '...BBBB..BBBB...',
      '...BBBB..BBBB...',
      '..BBBBB..BBBBB..',
      '..HHHHH..HHHHH..',
      '..HHHHH..HHHHH..',
      '.HHHHH....HHHHH.',
      '.HHHH......HHHH.',
      '.HHH........HHH.',
      '................'
    ],
    walk0: [
      '...BBBBBBBBBB...',
      '..BBBBB..BBBBB..',
      '..BBBB....BBBBB.',
      '.BBBBB.....BBBB.',
      '.HHHHH....HHHHH.',
      'HHHHH......HHHH.',
      'HHHH.......HHHH.',
      'HHH.........HHH.',
      '................',
      '................'
    ],
    walk1: [
      '...BBBBBBBBBB...',
      '..BBBB...BBBBB..',
      '.BBBB.....BBBBB.',
      '.BBB.......BBBB.',
      'HHHH.......HHHHH',
      'HHH.........HHHH',
      'HH...........HHH',
      '.............HH.',
      '................',
      '................'
    ],
    walk2: [
      '...BBBBBBBBBB...',
      '...BBBBBBBBBB...',
      '....BBBB.BBBB...',
      '....BBBB.BBBB...',
      '...HHHHH.HHHH...',
      '..HHHHH..HHHHH..',
      '.HHHHH....HHHHH.',
      '.HHHH......HHHH.',
      '.HHH........HHH.',
      '................'
    ],
    jump: [
      '..BBBBBBBBBBBB..',
      '..BBBB....BBBB..',
      '.BBBB......BBBB.',
      '.BBB........BBB.',
      '.HHHH......HHHH.',
      'HHHHH......HHHHH',
      'HHHH........HHHH',
      'HHH..........HHH',
      'HH............HH',
      '................'
    ],
    skid: [
      '...BBBBBBBBBB...',
      '...BBBBB.BBBB...',
      '..BBBBB...BBBB..',
      '..BBBB....BBBB..',
      '.HHHHH....HHHH..',
      '.HHHH......HHH..',
      'HHHH.......HHHH.',
      'HHH.........HHH.',
      '................',
      '................'
    ]
  };
  const BIG_DUCK = [
    '................',
    '................',
    '.....RRRRRR.....',
    '....RRRRRRRRRR..',
    '...RRRRRRRRRRRR.',
    '...HHHHSSSKS....',
    '..HHSHSSSSKSSS..',
    '..HHSHHSSSSKSSS.',
    '..HHHSSSSSKKKK..',
    '..HHSSSSSSSSSS..',
    '....SSSSSSSS....',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.SSRRBBBBBBRRSS.',
    '.SSRBBBBBBBBRSS.',
    '...BBBBBBBBBB...',
    '...BBBBBBBBBB...',
    '..BBBBBBBBBBBB..',
    '..HHHHH..HHHHH..',
    '.HHHHH....HHHHH.',
    '.HHHH......HHHH.',
    '.HHH........HHH.'
  ];

  function bigFrame(torso, legs) {
    return BIG_TOP.concat(BIG_TORSO[torso], BIG_LEGS[legs]);
  }

  function buildMarioSet(pal) {
    return {
      small: {
        idle: [px(SM_IDLE, pal)],
        walk: [px(SM_WALK0, pal), px(SM_WALK1, pal), px(SM_WALK2, pal)],
        jump: [px(SM_JUMP, pal)],
        skid: [px(SM_SKID, pal)],
        dead: [px(SM_DEAD, pal)]
      },
      big: {
        idle: [px(bigFrame('idle', 'idle'), pal)],
        walk: [px(bigFrame('walk', 'walk0'), pal), px(bigFrame('walk', 'walk1'), pal), px(bigFrame('walk', 'walk2'), pal)],
        jump: [px(bigFrame('jump', 'jump'), pal)],
        skid: [px(bigFrame('walk', 'skid'), pal)],
        duck: [px(BIG_DUCK, pal)]
      }
    };
  }

  /* ---------------------------------------------------------
     3. 敌人 / 道具像素图
     --------------------------------------------------------- */

  const GOOMBA_A = [
    '................',
    '................',
    '.....KKKKKK.....',
    '....KHHHHHHK....',
    '...KHHHHHHHHK...',
    '..KHHHHHHHHHHK..',
    '..KHWWKHHKWWKH..',
    '..KHWKKHHKKWKH..',
    '..KHHHHHHHHHHK..',
    '..KHHHHHHHHHHK..',
    '...KHHHHHHHHK...',
    '....KKKKKKKK....',
    '...KSSKSSKSSK...',
    '..KKSSKSSKSSKK..',
    '..KKKKKKKKKKKK..',
    '...KKK....KKK...'
  ];
  const GOOMBA_B = [
    '................',
    '................',
    '.....KKKKKK.....',
    '....KHHHHHHK....',
    '...KHHHHHHHHK...',
    '..KHHHHHHHHHHK..',
    '..KHWWKHHKWWKH..',
    '..KHWKKHHKKWKH..',
    '..KHHHHHHHHHHK..',
    '..KHHHHHHHHHHK..',
    '...KHHHHHHHHK...',
    '....KKKKKKKK....',
    '..KSSKSSKSSK....',
    '.KKSSKSSKSSKK...',
    '.KKKKKKKKKKKK...',
    '..KKK....KKK....'
  ];
  const GOOMBA_FLAT = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....KKKKKK.....',
    '...KHHHHHHHHK...',
    '..KHWWKHHKWWKH..',
    '..KHHHHHHHHHHK..',
    '..KKKKKKKKKKKK..',
    '...KKK....KKK...'
  ];

  const KOOPA_A = [
    '................',
    '.......KKKK.....',
    '......KYYYYK....',
    '.....KYWWYYK....',
    '.....KYWKYYK....',
    '.....KYWWYYK....',
    '......KYYYYK....',
    '.....KKYYYYKK...',
    '....KGGKKKKGGK..',
    '...KGGGGGGGGGGK.',
    '..KGGgGGGGGGgGK.',
    '..KGgGGGGGGGGgK.',
    '..KGGgGGGGGGgGK.',
    '..KGGGgGGGGgGGK.',
    '..KGGGGggggGGGK.',
    '..KGGGGGGGGGGGK.',
    '..KGGGGGGGGGGGK.',
    '..KGGGGGGGGGGGK.',
    '...KGGGGGGGGGK..',
    '...KYYYYYYYYYK..',
    '....KYYYYYYYK...',
    '...KYYYK.KYYYK..',
    '..KOOOOK.KOOOOK.',
    '..KKKKKK.KKKKKK.'
  ];
  const KOOPA_B = [
    '................',
    '.......KKKK.....',
    '......KYYYYK....',
    '.....KYWWYYK....',
    '.....KYWKYYK....',
    '.....KYWWYYK....',
    '......KYYYYK....',
    '.....KKYYYYKK...',
    '....KGGKKKKGGK..',
    '...KGGGGGGGGGGK.',
    '..KGGgGGGGGGgGK.',
    '..KGgGGGGGGGGgK.',
    '..KGGgGGGGGGgGK.',
    '..KGGGgGGGGgGGK.',
    '..KGGGGggggGGGK.',
    '..KGGGGGGGGGGGK.',
    '..KGGGGGGGGGGGK.',
    '..KGGGGGGGGGGGK.',
    '...KGGGGGGGGGK..',
    '...KYYYYYYYYYK..',
    '....KYYYYYYYK...',
    '..KYYYK...KYYYK.',
    '.KOOOOK...KOOOOK',
    '.KKKKKK...KKKKKK'
  ];
  const KOOPA_SHELL = [
    '................',
    '................',
    '.....KKKKKK.....',
    '...KKGGGGGGKK...',
    '..KGGgGGGGgGGK..',
    '.KGGgGGGGGGgGGK.',
    '.KGgGGGGGGGGgGK.',
    '.KGGgGGGGGGgGGK.',
    '.KGGGgGGGGgGGGK.',
    '.KGGGGggggGGGGK.',
    '.KGGGGGGGGGGGGK.',
    '.KGGGGGGGGGGGGK.',
    '..KGGGGGGGGGGK..',
    '...KYYYYYYYYK...',
    '....KKKKKKKK....',
    '................'
  ];

  const PIRANHA_A = [
    '................',
    '....KKKKKKKK....',
    '..KKRRRRRRRRKK..',
    '.KRRWWRRRRWWRRK.',
    '.KRWWWWRRWWWWRK.',
    '.KRRWWRRRRWWRRK.',
    '.KRRRRRRRRRRRRK.',
    '..KRRRRRRRRRRK..',
    '...KKRRRRRRKK...',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....'
  ];
  const PIRANHA_B = [
    '................',
    '....KKKKKKKK....',
    '..KKRRRRRRRRKK..',
    '.KRRWWRRRRWWRRK.',
    '.KRWWWWRRWWWWRK.',
    '.KRRWWRRRRWWRRK.',
    '.KRRRRRRRRRRRRK.',
    '..KRRWWWWWWRRK..',
    '...KKWWWWWWKK...',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....',
    '.....KGGGGK.....',
    '.....KGGGGK.....',
    '....KGGGGGGK....'
  ];

  const MUSHROOM = [
    '................',
    '................',
    '.....KKKKKK.....',
    '...KKRRRRRRKK...',
    '..KRRWWRRWWRRK..',
    '..KRWWWWRWWWWK..',
    '.KRRWWWWRWWWWRK.',
    '.KRRRWWRRRWWRRK.',
    '.KRRRRRRRRRRRRK.',
    '.KKRRRRRRRRRRKK.',
    '..KKKKKKKKKKKK..',
    '..KWWWSSSSWWWK..',
    '..KWWSSSSSSWWK..',
    '..KWSSSSSSSSWK..',
    '...KSSSSSSSSK...',
    '....KKKKKKKK....'
  ];

  const FLOWER = [
    '................',
    '................',
    '....KKKKKKKK....',
    '..KKRRRRRRRRKK..',
    '.KRRRRWWWWRRRRK.',
    '.KRRRWWWWWWRRRK.',
    '.KRRWWKKKKWWRRK.',
    '.KRRWWKKKKWWRRK.',
    '.KRRRWWWWWWRRRK.',
    '.KRRRRWWWWRRRRK.',
    '..KKRRRRRRRRKK..',
    '....KKGGGGKK....',
    '.....KGGGGK.....',
    '..KKKKGGGGKKKK..',
    '.KGGGKKGGKKGGGK.',
    '..KKK..KGGK..KK.'
  ];

  const STAR = [
    '................',
    '.......KK.......',
    '......KYYK......',
    '......KYYK......',
    '.....KKYYKK.....',
    '....KYYYYYYK....',
    '..KKYYYYYYYYKK..',
    '.KYYYYYYYYYYYYK.',
    '.KYYKYYYYYYKYYK.',
    '..KYKYYYYYYKYK..',
    '...KYYYYYYYYK...',
    '...KYYYKKYYYK...',
    '..KYYYK..KYYYK..',
    '..KYYK....KYYK..',
    '..KYK......KYK..',
    '..KK........KK..'
  ];

  const FIREBALL = [
    '..KKKK..',
    '.KROORK.',
    'KROWWORK',
    'KROWWORK',
    'KROWWORK',
    '.KROORK.',
    '..KKKK..',
    '........'
  ];

  /* ---------------------------------------------------------
     4. 组装 SPR
     --------------------------------------------------------- */

  const SPR = {};

  // SPR.mario[isFire ? 'fire' : 'normal'][size]  ->  { idle, walk[3], jump, skid, dead? , duck? }
  SPR.mario = {
    normal: buildMarioSet(PAL),
    fire: buildMarioSet(PAL_FIRE)
  };

  SPR.goomba = { walk: [px(GOOMBA_A, PAL), px(GOOMBA_B, PAL)], flat: px(GOOMBA_FLAT, PAL) };
  SPR.koopa = { walk: [px(KOOPA_A, PAL), px(KOOPA_B, PAL)], shell: px(KOOPA_SHELL, PAL) };
  SPR.piranha = [px(PIRANHA_A, PAL), px(PIRANHA_B, PAL)];
  SPR.mushroom = px(MUSHROOM, PAL);
  SPR.flower = px(FLOWER, PAL);
  SPR.fireball = px(FIREBALL, PAL);

  // 无敌星：四色循环
  SPR.star = [
    px(STAR, Object.assign({}, PAL, { Y: '#f8b800' })),
    px(STAR, Object.assign({}, PAL, { Y: '#fcfcfc' })),
    px(STAR, Object.assign({}, PAL, { Y: '#f88000' })),
    px(STAR, Object.assign({}, PAL, { Y: '#fcfcfc' }))
  ];

  /* ---------------------------------------------------------
     5. 位图字体 5x7
     --------------------------------------------------------- */

  const FONT_DATA = {
    'A': '01110 10001 10001 11111 10001 10001 10001',
    'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110',
    'D': '11100 10010 10001 10001 10001 10010 11100',
    'E': '11111 10000 10000 11110 10000 10000 11111',
    'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111',
    'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '11111 00100 00100 00100 00100 00100 11111',
    'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001',
    'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001',
    'N': '10001 11001 10101 10011 10001 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110',
    'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101',
    'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110',
    'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110',
    'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 11011 10001',
    'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 01010 00100 00100 00100 00100',
    'Z': '11111 00001 00010 00100 01000 10000 11111',
    '0': '01110 10001 10011 10101 11001 10001 01110',
    '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00110 01000 10000 11111',
    '3': '11111 00010 00100 00010 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010',
    '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110',
    '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110',
    '9': '01110 10001 10001 01111 00001 00010 01100',
    '-': '00000 00000 00000 11111 00000 00000 00000',
    '*': '00000 10101 01110 11111 01110 10101 00000',
    '!': '00100 00100 00100 00100 00100 00000 00100',
    '?': '01110 10001 00001 00110 00100 00000 00100',
    '.': '00000 00000 00000 00000 00000 00000 00100',
    ',': '00000 00000 00000 00000 00100 00100 01000',
    ':': '00000 00100 00100 00000 00100 00100 00000',
    '/': '00001 00010 00010 00100 01000 01000 10000',
    '+': '00000 00100 00100 11111 00100 00100 00000',
    '=': '00000 00000 11111 00000 11111 00000 00000',
    '(': '00010 00100 01000 01000 01000 00100 00010',
    ')': '01000 00100 00010 00010 00010 00100 01000',
    '>': '01000 00100 00010 00001 00010 00100 01000',
    '<': '00010 00100 01000 10000 01000 00100 00010',
    "'": '00100 00100 00000 00000 00000 00000 00000',
    ' ': '00000 00000 00000 00000 00000 00000 00000'
  };

  const FONT_ORDER = Object.keys(FONT_DATA);
  const FONT_INDEX = {};
  FONT_ORDER.forEach(function (ch, i) { FONT_INDEX[ch] = i; });

  const GLYPH_W = 5, GLYPH_H = 7, CELL_W = 6, CELL_H = 8;
  const _atlasCache = {};

  function fontAtlas(color) {
    let a = _atlasCache[color];
    if (a) return a;
    const c = cv(CELL_W * FONT_ORDER.length, CELL_H);
    const g = c.getContext('2d');
    g.fillStyle = color;
    for (let i = 0; i < FONT_ORDER.length; i++) {
      const rows = FONT_DATA[FONT_ORDER[i]].split(' ');
      const ox = i * CELL_W;
      for (let y = 0; y < GLYPH_H; y++) {
        const row = rows[y] || '';
        for (let x = 0; x < GLYPH_W; x++) {
          if (row[x] === '1') g.fillRect(ox + x, y, 1, 1);
        }
      }
    }
    a = { canvas: c };
    _atlasCache[color] = a;
    return a;
  }

  /** 文本宽度（像素） */
  function textWidth(text, scale, spacing) {
    scale = scale || 1;
    spacing = spacing === undefined ? 1 : spacing;
    if (!text.length) return 0;
    return (text.length * (GLYPH_W + spacing) - spacing) * scale;
  }

  /**
   * 绘制位图文字
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} x 左上角
   * @param {number} y
   * @param {string} color
   * @param {object} [opt] {scale, spacing, shadow}
   */
  function drawText(ctx, text, x, y, color, opt) {
    opt = opt || {};
    const scale = opt.scale || 1;
    const spacing = opt.spacing === undefined ? 1 : opt.spacing;
    const shadow = opt.shadow;
    const outline = opt.outline;
    text = String(text).toUpperCase();
    const atlas = fontAtlas(color).canvas;
    const shadowAtlas = shadow ? fontAtlas(shadow).canvas : null;
    const outlineAtlas = outline ? fontAtlas(outline).canvas : null;
    const gw = GLYPH_W * scale, gh = GLYPH_H * scale;
    let cx = Math.round(x), cy = Math.round(y);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const idx = FONT_INDEX[ch];
      if (idx === undefined) { cx += (GLYPH_W + spacing) * scale; continue; }
      const sx = idx * CELL_W;
      if (outlineAtlas) {
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            if (!ox && !oy) continue;
            ctx.drawImage(outlineAtlas, sx, 0, GLYPH_W, GLYPH_H,
              cx + ox * scale, cy + oy * scale, gw, gh);
          }
        }
      }
      if (shadowAtlas) {
        ctx.drawImage(shadowAtlas, sx, 0, GLYPH_W, GLYPH_H,
          cx + scale, cy + scale, gw, gh);
      }
      ctx.drawImage(atlas, sx, 0, GLYPH_W, GLYPH_H, cx, cy, gw, gh);
      cx += (GLYPH_W + spacing) * scale;
    }
  }

  /** 居中绘制文字，返回实际宽度 */
  function drawTextCenter(ctx, text, cx, y, color, opt) {
    const scale = (opt && opt.scale) || 1;
    const spacing = (opt && opt.spacing !== undefined) ? opt.spacing : 1;
    const w = textWidth(String(text), scale, spacing);
    drawText(ctx, text, Math.round(cx - w / 2), y, color, opt);
    return w;
  }

  /* ---------------------------------------------------------
     6. 主题 & 瓦片生成
     --------------------------------------------------------- */

  const THEMES = {
    overworld: {
      sky: ['#5c94fc', '#9ec8ff'],
      ground: ['#e08030', '#a03800', '#f8c890'],
      brick: ['#c05010', '#6c2000', '#f0a060'],
      stone: ['#d87838', '#8c3c00', '#f8d0a0'],
      pipe: ['#00a800', '#005000', '#78e078'],
      q: ['#f8b800', '#8c5000', '#fce8a0'],
      decor: 'overworld'
    },
    underground: {
      sky: ['#000000', '#000010'],
      ground: ['#2038ec', '#00107c', '#7898f8'],
      brick: ['#0058f8', '#00107c', '#78a8f8'],
      stone: ['#3048f0', '#00107c', '#88a8ff'],
      pipe: ['#00a800', '#005000', '#78e078'],
      q: ['#f8b800', '#8c5000', '#fce8a0'],
      decor: 'underground'
    },
    sky: {
      sky: ['#3c78f0', '#a8dcff'],
      ground: ['#e08030', '#a03800', '#f8c890'],
      brick: ['#c05010', '#6c2000', '#f0a060'],
      stone: ['#d87838', '#8c3c00', '#f8d0a0'],
      pipe: ['#00a800', '#005000', '#78e078'],
      q: ['#f8b800', '#8c5000', '#fce8a0'],
      decor: 'sky'
    }
  };

  // 问号块中央的大问号 8x10
  const QMARK = [
    '..XXXX..',
    '.XX..XX.',
    '.XX..XX.',
    '.....XX.',
    '....XX..',
    '...XX...',
    '...XX...',
    '........',
    '...XX...',
    '...XX...'
  ];

  function makeGround(c) {
    const t = cv(16, 16), g = t.getContext('2d');
    const main = c[0], dark = c[1], light = c[2];
    g.fillStyle = main;  g.fillRect(0, 0, 16, 16);
    g.fillStyle = light; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    g.fillStyle = dark;  g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
    // 中央的四个凹点，做出石块的质感
    g.fillStyle = dark;
    g.fillRect(3, 3, 3, 3); g.fillRect(10, 3, 3, 3);
    g.fillRect(3, 10, 3, 3); g.fillRect(10, 10, 3, 3);
    g.fillStyle = light;
    g.fillRect(4, 4, 2, 2); g.fillRect(11, 4, 2, 2);
    g.fillRect(4, 11, 2, 2); g.fillRect(11, 11, 2, 2);
    return t;
  }

  function makeBrick(c) {
    const t = cv(16, 16), g = t.getContext('2d');
    const main = c[0], dark = c[1], light = c[2];
    g.fillStyle = main; g.fillRect(0, 0, 16, 16);
    g.fillStyle = dark;
    for (let y = 0; y < 16; y += 4) g.fillRect(0, y + 3, 16, 1);
    for (let r = 0; r < 4; r++) {
      const off = (r % 2 === 0) ? 0 : 8;
      for (let x = off; x <= 16; x += 8) {
        if (x > 0 && x < 16) g.fillRect(x - 1, r * 4, 1, 3);
      }
    }
    g.fillStyle = light;
    for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1);
    return t;
  }

  function makeStone(c) {
    const t = cv(16, 16), g = t.getContext('2d');
    const main = c[0], dark = c[1], light = c[2];
    g.fillStyle = main;  g.fillRect(0, 0, 16, 16);
    g.fillStyle = light; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
    g.fillStyle = dark;  g.fillRect(0, 13, 16, 3); g.fillRect(13, 0, 3, 16);
    g.fillStyle = dark;  g.fillRect(5, 5, 6, 6);
    g.fillStyle = light; g.fillRect(6, 6, 4, 4);
    return t;
  }

  function makeQBlock(c, main) {
    const t = cv(16, 16), g = t.getContext('2d');
    const dark = c[1], light = c[2];
    g.fillStyle = main;  g.fillRect(0, 0, 16, 16);
    g.fillStyle = light; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
    g.fillStyle = dark;  g.fillRect(0, 14, 16, 2); g.fillRect(14, 0, 2, 16);
    // 四角铆钉
    g.fillStyle = dark;
    g.fillRect(3, 3, 2, 2); g.fillRect(11, 3, 2, 2);
    g.fillRect(3, 11, 2, 2); g.fillRect(11, 11, 2, 2);
    // 中央问号
    const qg = px(QMARK, { X: dark });
    g.drawImage(qg, 4, 3);
    return t;
  }

  function makeUsed(c) {
    const t = cv(16, 16), g = t.getContext('2d');
    const main = mix(c[0], '#8a5a20', 0.75), dark = '#4a2c08', light = '#c08c48';
    g.fillStyle = main;  g.fillRect(0, 0, 16, 16);
    g.fillStyle = light; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
    g.fillStyle = dark;  g.fillRect(0, 14, 16, 2); g.fillRect(14, 0, 2, 16);
    g.fillRect(4, 4, 1, 8); g.fillRect(11, 4, 1, 8);
    g.fillRect(4, 7, 8, 1);
    return t;
  }

  function pipeBody(g, x, y, w, h, c) {
    const main = c[0], dark = c[1], light = c[2];
    g.fillStyle = main;  g.fillRect(x, y, w, h);
    g.fillStyle = light; g.fillRect(x, y, 3, h);
    g.fillStyle = dark;  g.fillRect(x + w - 2, y, 2, h);
  }

  function makePipePiece(kind, c) {
    const t = cv(16, 16), g = t.getContext('2d');
    const main = c[0], dark = c[1], light = c[2];
    if (kind === 'TL' || kind === 'TR') {
      const bx = (kind === 'TL') ? 2 : 0;
      const bw = (kind === 'TL') ? 14 : 14;
      pipeBody(g, bx, 8, bw, 8, c);
      // 管口
      const rx = 0, rw = 16;
      g.fillStyle = main;  g.fillRect(rx, 0, rw, 8);
      g.fillStyle = light; g.fillRect(rx, 0, rw, 2); g.fillRect((kind === 'TL') ? 0 : 1, 0, 2, 8);
      g.fillStyle = dark;  g.fillRect(rx, 6, rw, 2); g.fillRect(rw - ((kind === 'TL') ? 2 : 3), 0, (kind === 'TL') ? 2 : 3, 8);
      g.fillStyle = dark;  g.fillRect(rx, 0, rw, 1);
    } else {
      const bx = (kind === 'BL') ? 2 : 0;
      pipeBody(g, bx, 0, 14, 16, c);
    }
    return t;
  }

  function makeCoin(halfW) {
    const t = cv(16, 16), g = t.getContext('2d');
    const gold = '#f8c000', darkG = '#a06800', lightG = '#fcf0a0';
    const x = 8 - halfW, w = halfW * 2;
    if (halfW <= 0) return t;
    g.fillStyle = darkG;  g.fillRect(x, 2, w, 12);
    g.fillStyle = gold;   g.fillRect(x + 1, 3, w - 2, 10);
    if (halfW >= 3) {
      g.fillStyle = lightG; g.fillRect(x + 2, 4, Math.max(1, Math.floor(halfW / 2)), 8);
    }
    // 削掉四个角，做出圆角
    g.clearRect(x, 2, 1, 1); g.clearRect(x + w - 1, 2, 1, 1);
    g.clearRect(x, 13, 1, 1); g.clearRect(x + w - 1, 13, 1, 1);
    if (halfW >= 4) {
      g.clearRect(x, 3, 1, 1); g.clearRect(x + w - 1, 3, 1, 1);
      g.clearRect(x, 12, 1, 1); g.clearRect(x + w - 1, 12, 1, 1);
    }
    return t;
  }

  function makeFlagBall() {
    const rows = [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....KKKKKK.....',
      '....KYYYYYYK....',
      '...KYWWWWWWYK...',
      '...KYWYYYYWYK...',
      '...KYWYYYYWYK...',
      '...KYWWWWWWYK...',
      '....KYYYYYYK....',
      '.....KKKKKK.....',
      '................',
      '................',
      '................'
    ];
    return px(rows, PAL);
  }

  function makeFlag() {
    // 三角小旗，旗杆一侧在左；绘制时镜像到旗杆左侧
    const rows = [
      '................',
      '................',
      '..KKKK..........',
      '..KWWWKKK.......',
      '..KWWWWWWKKK....',
      '..KWWWWWWWWWWKK.',
      '..KWWWWWWWWWWWWK',
      '..KWWWWWWWWWWWWK',
      '..KWWWWWWWWWWWWK',
      '..KWWWWWWWWWWKK.',
      '..KWWWWWWKKK....',
      '..KWWWKKK.......',
      '..KKKK..........',
      '................',
      '................',
      '................'
    ];
    return px(rows, PAL);
  }

  /* ---- 背景装饰 ---- */

  function makeHill(big) {
    const w = big ? 80 : 48, h = big ? 48 : 32;
    const c = cv(w, h), g = c.getContext('2d');
    const base = '#00a800', dark = '#007000', light = '#58d858';
    // 阶梯状的小山，模仿 8 位机的做法
    g.fillStyle = base;
    const steps = big ? 5 : 4;
    const stepW = w / (steps * 2);
    const stepH = h / steps;
    for (let i = 0; i < steps; i++) {
      const y = h - (i + 1) * stepH;
      g.fillRect(i * stepW, y, w - i * stepW * 2, stepH + 1);
    }
    g.fillStyle = light;
    for (let i = 0; i < steps; i++) {
      const y = h - (i + 1) * stepH;
      g.fillRect(i * stepW, y, w - i * stepW * 2, 2);
    }
    g.fillStyle = dark;
    g.fillRect(0, h - 4, w, 4);
    // 山上的两个小凹点
    g.fillStyle = dark;
    g.fillRect(w / 2 - 8, h - 14, 3, 3);
    g.fillRect(w / 2 + 5, h - 14, 3, 3);
    g.fillRect(w / 2 - 2, h - 22, 3, 3);
    return c;
  }

  function makeBush() {
    const c = cv(48, 16), g = c.getContext('2d');
    const base = '#00a800', dark = '#007000', light = '#58d858';
    function bump(x, y, w, h) {
      g.fillStyle = base; g.fillRect(x, y, w, h);
      g.fillStyle = light; g.fillRect(x, y, w, 2);
      g.fillStyle = dark; g.fillRect(x, y + h - 2, w, 2);
    }
    bump(4, 8, 12, 8);
    bump(14, 4, 20, 12);
    bump(32, 8, 12, 8);
    g.fillStyle = dark;
    g.fillRect(0, 14, 48, 2);
    return c;
  }

  function makeCloud(big) {
    const w = big ? 48 : 32, h = big ? 24 : 18;
    const c = cv(w, h), g = c.getContext('2d');
    const base = '#fcfcfc', shade = '#a8ccf8';
    function puff(x, y, pw, ph) { g.fillStyle = base; g.fillRect(x, y, pw, ph); }
    if (big) {
      puff(3, 13, 42, 8);
      puff(7, 7, 13, 12);
      puff(17, 2, 16, 17);
      puff(31, 8, 12, 12);
      g.fillStyle = shade;
      g.fillRect(3, 20, 42, 1);
    } else {
      puff(2, 10, 28, 6);
      puff(5, 5, 9, 10);
      puff(12, 1, 12, 15);
      puff(22, 6, 8, 9);
      g.fillStyle = shade;
      g.fillRect(2, 15, 28, 1);
    }
    return c;
  }

  function makeCastle() {
    // 80x80 = 5x5 个瓦片
    const c = cv(80, 80), g = c.getContext('2d');
    const brick = '#c05010', dark = '#6c2000', light = '#f0a060';
    const black = '#000000';

    function bricks(x, y, w, h) {
      g.fillStyle = brick; g.fillRect(x, y, w, h);
      g.fillStyle = dark;
      for (let yy = y; yy < y + h; yy += 8) g.fillRect(x, yy, w, 1);
      for (let yy = y, r = 0; yy < y + h; yy += 8, r++) {
        for (let xx = x + ((r % 2) ? 0 : 7); xx < x + w; xx += 15) {
          g.fillRect(xx, yy, 1, 8);
        }
      }
    }

    // 主楼
    bricks(8, 32, 64, 48);
    // 城垛
    for (let i = 0; i < 5; i++) bricks(8 + i * 14, 24, 8, 8);
    // 中央塔
    bricks(28, 8, 24, 56);
    for (let i = 0; i < 3; i++) bricks(28 + i * 10, 0, 6, 8);
    // 大门
    g.fillStyle = black;
    g.fillRect(33, 56, 14, 24);
    g.fillRect(35, 52, 10, 6);
    // 窗
    g.fillStyle = black;
    g.fillRect(17, 42, 6, 8);
    g.fillRect(57, 42, 6, 8);
    g.fillRect(37, 20, 6, 8);
    // 描边
    g.fillStyle = light;
    g.fillRect(8, 32, 64, 1);
    g.fillRect(28, 8, 24, 1);
    return c;
  }

  /* ---- 生成整套瓦片 ---- */

  function makeTileset(themeName) {
    const th = THEMES[themeName] || THEMES.overworld;
    const g = th.ground, b = th.brick, s = th.stone, q = th.q, p = th.pipe;
    const Q0 = makeQBlock(q, q[0]);
    const Q1 = makeQBlock(q, mix(q[0], '#fff2b0', 0.35));
    const Q2 = makeQBlock(q, mix(q[0], '#ff9c00', 0.30));
    return {
      theme: th,
      ground: makeGround(g),
      brick: makeBrick(b),
      stone: makeStone(s),
      q: [Q0, Q1, Q2, Q1],
      used: makeUsed(q),
      pipeTL: makePipePiece('TL', p),
      pipeTR: makePipePiece('TR', p),
      pipeBL: makePipePiece('BL', p),
      pipeBR: makePipePiece('BR', p),
      coin: [makeCoin(5), makeCoin(4), makeCoin(2), makeCoin(4)],
      flagBall: makeFlagBall(),
      flag: makeFlag(),
      hillBig: makeHill(true),
      hillSmall: makeHill(false),
      bush: makeBush(),
      cloudBig: makeCloud(true),
      cloudSmall: makeCloud(false),
      castle: makeCastle()
    };
  }

  /* ---------------------------------------------------------
     7. 导出
     --------------------------------------------------------- */

  global.Spr = {
    cv: cv,
    px: px,
    drawSprite: drawSprite,
    flipped: flipped,
    mix: mix,
    PAL: PAL,
    THEMES: THEMES,
    SPR: SPR,
    makeTileset: makeTileset,
    drawText: drawText,
    drawTextCenter: drawTextCenter,
    textWidth: textWidth,
    GLYPH_W: GLYPH_W,
    GLYPH_H: GLYPH_H
  };

})(window);
