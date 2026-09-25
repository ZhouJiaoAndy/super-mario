/* ============================================================
   game.js —— 主引擎
   固定步长主循环、输入、瓦片碰撞、砖块交互、相机、渲染、流程状态机
   ============================================================ */
(function (global) {
  'use strict';

  const TS = 16;
  const VW = 256;          // 内部分辨率（与 NES 一致）
  const VH = 240;

  const BUMP_OFFSETS = [0, -3, -6, -8, -8, -6, -3, 0, 0, 0];

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
    KeyX: 'run', ShiftLeft: 'run', ShiftRight: 'run', KeyJ: 'run',
    Enter: 'start', NumpadEnter: 'start',
    KeyP: 'pause', KeyM: 'mute', KeyR: 'reset', KeyF: 'full'
  };

  class Game {
    constructor(canvas, stage) {
      this.canvas = canvas;
      this.stage = stage;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;

      this.input = { left: false, right: false, down: false, jump: false, run: false };
      this.touch = { left: false, right: false, down: false, jump: false, run: false };

      this.state = 'title';
      this.paused = false;
      this.frame = 0;

      this.levelIndex = 0;
      this.score = 0;
      this.coins = 0;
      this.lives = 3;
      this.hiScore = 0;
      try { this.hiScore = parseInt(localStorage.getItem('mario.hiscore') || '0', 10) || 0; } catch (e) {}

      this.camX = 0;
      this.entities = [];
      this.bumps = [];
      this.fireballs = 0;
      this.mario = null;
      this.tiles = null;
      this.level = null;
      this.grid = null;
      this._skyGrad = null;

      this.timer = 0;
      this.timeAcc = 0;
      this.time = 400;
      this.checkpointReached = false;
      this.respawnX = 0;
      this.flagY = 0;
      this.flagSliding = false;
      this.toast = null;
      this.toastTimer = 0;
      this.starWasOn = false;

      this._bindInput();
      this._buildTitleDecor();
    }

    /* =====================================================
       输入
       ===================================================== */

    _bindInput() {
      const self = this;

      window.addEventListener('keydown', function (e) {
        const a = KEYMAP[e.code];
        if (!a) return;
        e.preventDefault();
        Sound.init();
        if (a === 'pause') { self.togglePause(); return; }
        if (a === 'mute') { self.toggleMute(); return; }
        if (a === 'reset') { self.restart(); return; }
        if (a === 'full') { self.toggleFullscreen(); return; }
        if (a === 'start') { self.onStart(); return; }
        self.input[a] = true;
      }, { passive: false });

      window.addEventListener('keyup', function (e) {
        const a = KEYMAP[e.code];
        if (!a) return;
        e.preventDefault();
        if (a === 'start' || a === 'pause' || a === 'mute' || a === 'reset' || a === 'full') return;
        self.input[a] = false;
      }, { passive: false });

      // 触屏
      const pad = document.getElementById('touchpad');
      if (pad) {
        const bind = function (el) {
          const key = el.getAttribute('data-key');
          const on = function (ev) {
            ev.preventDefault();
            Sound.init();
            self.touch[key] = true;
            el.classList.add('active');
            if (self.state === 'title') self.onStart();
          };
          const off = function (ev) {
            ev.preventDefault();
            self.touch[key] = false;
            el.classList.remove('active');
          };
          el.addEventListener('pointerdown', on);
          el.addEventListener('pointerup', off);
          el.addEventListener('pointercancel', off);
          el.addEventListener('pointerleave', off);
          el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        };
        Array.prototype.forEach.call(pad.querySelectorAll('.tbtn'), bind);

        if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
          pad.classList.remove('hidden');
        }
      }

      // 点击画面开始 / 暂停后继续
      this.canvas.addEventListener('pointerdown', function () {
        Sound.init();
        if (self.state === 'title') self.onStart();
        else if (self.state === 'gameover' || self.state === 'win') self.restart();
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden && self.state === 'playing' && !self.paused) self.togglePause();
      });
    }

    mergedInput() {
      const i = this.input, t = this.touch;
      return {
        left: i.left || t.left,
        right: i.right || t.right,
        down: i.down || t.down,
        jump: i.jump || t.jump,
        run: i.run || t.run
      };
    }

    onStart() {
      if (this.state === 'title') {
        Sound.init();
        Sound.play('select');
        this.newGame();
      } else if (this.state === 'gameover' || this.state === 'win') {
        Sound.init();
        Sound.play('select');
        this.restart();
      }
    }

    togglePause() {
      if (this.state !== 'playing') return;
      this.paused = !this.paused;
      Sound.play('pause');
      if (this.paused) Sound.stopMusic();
      else Sound.playMusic(this.mario && this.mario.starTimer > 0 ? 'star' : this.level.music);
    }

    toggleMute() {
      Sound.init();
      const m = Sound.toggleMute();
      const btn = document.getElementById('btnMute');
      if (btn) {
        btn.textContent = m ? '🔇 静音' : '🔊 声音';
        btn.classList.toggle('off', m);
      }
    }

    toggleFullscreen() {
      const el = this.stage;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    }

    restart() {
      this.score = 0;
      this.coins = 0;
      this.lives = 3;
      this.levelIndex = 0;
      this.paused = false;
      this.newGame();
    }

    /* =====================================================
       流程
       ===================================================== */

    newGame() {
      this.loadLevel(0, null);
      this.state = 'ready';
      this.timer = 0;
    }

    loadLevel(index, respawnX) {
      const lv = Levels.list[index];
      this.levelIndex = index;
      this.level = lv;
      this.grid = lv.tiles.map(function (r) { return r.split(''); });
      this.tiles = Spr.makeTileset(lv.theme);
      this.entities = [];
      this.bumps = [];
      this.fireballs = 0;
      this.camX = 0;
      this.time = lv.timeLimit;
      this.timeAcc = 0;
      this.flagSliding = false;
      this.flagY = (lv.flagTopTy + 1) * TS;
      this.starWasOn = false;
      this._skyGrad = null;

      const sx = (respawnX === null || respawnX === undefined)
        ? lv.marioStart.x
        : respawnX;

      this.mario = new Ent.Mario(this, sx, lv.marioStart.y);
      this.mario.active = true;
      this.checkpointReached = (respawnX !== null && respawnX !== undefined);
      this.respawnX = sx;

      const self = this;
      lv.spawns.forEach(function (s) {
        if (s.type === 'g') {
          self.entities.push(new Ent.Goomba(self, s.x + 1, (s.ty + 1) * TS - 16));
        } else if (s.type === 'k') {
          self.entities.push(new Ent.Koopa(self, s.x + 1.5, (s.ty + 1) * TS - 22));
        } else if (s.type === 'P') {
          self.entities.push(new Ent.Piranha(self, s.x, (s.ty + 1) * TS));
        }
      });

      // 出生点附近的敌人先激活
      this.entities.forEach(function (e) { e.active = e.x < VW + 64; });

      this.updateCamera(true);
      Sound.playMusic(lv.music);
    }

    /** 关卡开始前的黑屏卡片 */
    updateReady() {
      this.timer++;
      if (this.timer === 1) Sound.stopMusic();
      if (this.timer > 108 || this.skipPressed()) {
        this.state = 'playing';
        this.timer = 0;
        Sound.playMusic(this.level.music);
      }
    }

    skipPressed() {
      return false;
    }

    updatePlaying() {
      if (this.paused) return;

      // 变身动画期间冻结世界（经典手感）
      const frozen = this.mario.state === 'grow' || this.mario.state === 'shrink';

      this.mario.update();

      if (!frozen) {
        // 计时
        this.timeAcc++;
        if (this.timeAcc >= 24) {
          this.timeAcc = 0;
          this.time--;
          if (this.time === 100) Sound.play('hurry');
          if (this.time <= 0) { this.time = 0; this.mario.die(true); }
        }

        for (let i = 0; i < this.entities.length; i++) {
          const e = this.entities[i];
          if (e.removed) continue;
          if (!e.active) {
            if (e.x < this.camX + VW + 48) e.active = true;
            else continue;
          }
          e.update();
        }

        this.handleCollisions();
        this.updateBumps();
        this.checkCheckpoint();
        this.checkFlagpole();
      }

      // 清理
      if (this.entities.length > 0) {
        this.entities = this.entities.filter(function (e) { return !e.removed; });
      }

      // 无敌星音乐
      const starOn = this.mario.starTimer > 0;
      if (starOn && !this.starWasOn) Sound.playMusic('star');
      if (!starOn && this.starWasOn) Sound.playMusic(this.level.music);
      this.starWasOn = starOn;

      // 降旗
      if (this.flagSliding) {
        const floor = this.level.groundY - 32;
        if (this.flagY < floor) this.flagY += 1.8;
      }

      this.updateCamera(false);
    }

    updateBumps() {
      for (let i = this.bumps.length - 1; i >= 0; i--) {
        this.bumps[i].t++;
        if (this.bumps[i].t >= BUMP_OFFSETS.length) this.bumps.splice(i, 1);
      }
    }

    checkCheckpoint() {
      if (this.checkpointReached) return;
      const tx = this.level.checkpointTx;
      if (tx === undefined || tx === null) return;
      if (this.mario.x > tx * TS) {
        this.checkpointReached = true;
        this.respawnX = tx * TS;
        Sound.play('oneup');
        this.addScore(1000, this.mario.x, this.mario.y - 16);
        this.showToast('CHECKPOINT!');
      }
    }

    showToast(text) { this.toast = text; this.toastTimer = 90; }

    /* --- 触到旗杆 --- */
    checkFlagpole() {
      const m = this.mario;
      if (m.state !== 'play' || this.flagSliding) return;
      const lv = this.level;
      const poleX = lv.flagTx * TS;
      const poleTopY = (lv.flagTopTy + 1) * TS;
      if (m.x + m.w < poleX + 1 || m.x > poleX + 12) return;
      if (m.y + m.h < poleTopY) return;
      this.startFlag();
    }

    startFlag() {
      const m = this.mario;
      const lv = this.level;
      const poleX = lv.flagTx * TS;
      const topY = (lv.flagTopTy + 1) * TS;
      const botY = lv.groundY - 24;

      // 抓得越高分越高
      const ratio = Math.max(0, Math.min(1, 1 - (m.y - topY) / (botY - topY)));
      const table = [100, 400, 800, 2000, 5000];
      const pts = table[Math.min(table.length - 1, Math.floor(ratio * table.length))];
      this.addScore(pts, m.x, m.y - 8);

      m.state = 'flag';
      m.ducking = false;
      m.vx = 0; m.vy = 0;
      m.x = poleX + 6 - m.w / 2;
      m.jumping = false;

      this.flagSliding = true;
      this.flagY = Math.max(this.flagY, topY + 4);
      Sound.stopMusic();
      Sound.play('flag');
    }

    /* --- 死亡 --- */
    onMarioDeath() {
      if (this.state === 'gameover' || this.state === 'win' || this.state === 'title') return;
      this.state = 'dying';
      this.timer = 0;
    }

    afterDeath() {
      if (this.state !== 'dying') return;
      this.lives = Math.max(0, this.lives - 1);
      Sound.stopMusic();
      if (this.lives <= 0) {
        this.state = 'gameover';
        this.timer = 0;
        Sound.play('gameover');
        this.saveHiScore();
      } else {
        this.loadLevel(this.levelIndex, this.checkpointReached ? this.respawnX : null);
        this.state = 'ready';
        this.timer = 0;
      }
    }

    /* --- 通关 --- */
    levelComplete() {
      this.state = 'clear';
      this.timer = 0;
      Sound.stopMusic();
      Sound.play('clear');
      this.saveHiScore();
    }

    updateClear() {
      this.timer++;
      if (this.timer > 60 && this.time > 0) {
        if (this.timer % 2 === 0) {
          const step = Math.min(this.time, 5);
          this.time -= step;
          this.score += step * 50;
          if (this.frame % 4 === 0) Sound.play('coin');
        }
      }
      if (this.timer > 260) {
        if (this.levelIndex + 1 < Levels.list.length) {
          this.loadLevel(this.levelIndex + 1, null);
          this.state = 'ready';
          this.timer = 0;
        } else {
          this.state = 'win';
          this.timer = 0;
          this.saveHiScore();
        }
      }
    }

    saveHiScore() {
      if (this.score > this.hiScore) {
        this.hiScore = this.score;
        try { localStorage.setItem('mario.hiscore', String(this.hiScore)); } catch (e) {}
      }
    }

    updateGameOver() {
      this.timer++;
      if (this.timer > 200) { this.state = 'title'; this.timer = 0; }
    }

    /* =====================================================
       瓦片
       ===================================================== */

    tileAt(tx, ty) {
      if (ty < 0 || ty >= this.level.height) return ' ';
      if (tx < 0 || tx >= this.level.width) return ' ';
      return this.grid[ty][tx];
    }

    setTile(tx, ty, ch) {
      if (ty < 0 || ty >= this.level.height) return;
      if (tx < 0 || tx >= this.level.width) return;
      this.grid[ty][tx] = ch;
    }

    isSolid(tx, ty) {
      if (tx < 0 || tx >= this.level.width) return true;
      if (ty < 0) return false;
      if (ty >= this.level.height) return false;
      return !!Levels.WALKABLE[this.grid[ty][tx]];
    }

    /* --- 顶砖块 --- */
    hitBlock(tx, ty, mario) {
      const ch = this.tileAt(tx, ty);
      if (ch === ' ' || ch === 'o' || ch === '|') return;
      const item = Levels.ITEM_BLOCK[ch];

      if (item) {
        this.setTile(tx, ty, 'U');
        this.bumps.push({ tx: tx, ty: ty, t: 0 });
        if (item === 'coin') {
          this.entities.push(new Ent.CoinPop(this, tx * TS, ty * TS - 16));
          this.gainCoin();
          this.addScore(200, tx * TS, ty * TS - 24);
        } else {
          const kind = (mario.power === 0) ? 'mushroom' : 'flower';
          this.entities.push(new Ent.Item(this, tx * TS, ty * TS, kind));
          Sound.play('appear');
        }
        this.bumpEnemies(tx, ty);
        return;
      }

      if (ch === 'B') {
        if (mario.power > 0 && !mario.ducking) {
          this.setTile(tx, ty, ' ');
          this.breakBrick(tx, ty);
          this.addScore(50, tx * TS, ty * TS);
        } else {
          this.bumps.push({ tx: tx, ty: ty, t: 0 });
          this.bumpEnemies(tx, ty);
          Sound.play('bump');
        }
        return;
      }

      if (Levels.WALKABLE[ch]) {
        this.bumps.push({ tx: tx, ty: ty, t: 0 });
        this.bumpEnemies(tx, ty);
        Sound.play('bump');
      }
    }

    breakBrick(tx, ty) {
      const px = tx * TS, py = ty * TS;
      this.entities.push(new Ent.Debris(this, px, py, -1.1, -3.6));
      this.entities.push(new Ent.Debris(this, px + 8, py, 1.1, -3.6));
      this.entities.push(new Ent.Debris(this, px, py + 8, -1.5, -2.2));
      this.entities.push(new Ent.Debris(this, px + 8, py + 8, 1.5, -2.2));
      Sound.play('brick');
    }

    /** 顶砖块时把站在上面的敌人掀翻 */
    bumpEnemies(tx, ty) {
      const bx = tx * TS, by = ty * TS;
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (e.removed || !e.enemy || e.flipping) continue;
        if (e.type === 'piranha') continue;
        const bottom = e.y + e.h;
        if (bottom > by - 6 && bottom <= by + 8 && e.x + e.w > bx - 2 && e.x < bx + TS + 2) {
          e.kill(0);
          this.addScore(100, e.x, e.y);
        }
      }
    }

    additiveScorePop(text, x, y) {
      this.entities.push(new Ent.ScorePop(this, x, y, text));
    }

    addScore(n, x, y) {
      this.score += n;
      if (x !== undefined) this.additiveScorePop(String(n), x, y);
      if (this.score > this.hiScore) this.hiScore = this.score;
    }

    gainCoin() {
      this.coins++;
      Sound.play('coin');
      if (this.coins >= 100) {
        this.coins -= 100;
        this.lives++;
        Sound.play('oneup');
      }
    }

    /** 收集马里奥碰到的金币瓦片 */
    collectCoins(mario) {
      const x0 = Math.floor(mario.x / TS);
      const x1 = Math.floor((mario.x + mario.w - 1) / TS);
      const y0 = Math.floor(mario.y / TS);
      const y1 = Math.floor((mario.y + mario.h - 1) / TS);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.tileAt(tx, ty) === 'o') {
            this.setTile(tx, ty, ' ');
            this.gainCoin();
            this.addScore(200, tx * TS, ty * TS - 4);
          }
        }
      }
    }

    /* =====================================================
       实体互动
       ===================================================== */

    spawn(e) { this.entities.push(e); }

    comboScore(e) {
      const m = this.mario;
      const idx = Math.min(m.combo, Ent.COMBO_SCORES.length - 1);
      const pts = Ent.COMBO_SCORES[idx];
      m.combo++;
      this.addScore(pts, e.x, e.y);
      if (m.combo > Ent.COMBO_SCORES.length) {
        this.lives++;
        Sound.play('oneup');
      }
    }

    handleCollisions() {
      const m = this.mario;
      if (m.state !== 'play') return;

      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (e.removed || !e.active) continue;

        if (e.type === 'item') {
          if (e.emerge <= 0 && m.overlaps(e)) {
            if (e.kind === 'mushroom') m.eatMushroom();
            else if (e.kind === 'flower') m.eatFlower();
            else m.eatStar();
            e.removed = true;
          }
          continue;
        }

        if (!e.enemy || e.flipping) continue;
        if (e.type === 'goomba' && e.squashTimer > 0) continue;
        if (!m.overlaps(e)) continue;

        // 无敌星：直接撞飞
        if (m.starTimer > 0) {
          e.kill(m.cx < e.cx ? 1 : -1);
          this.addScore(200, e.x, e.y);
          Sound.play('kick');
          continue;
        }

        if (e.type === 'piranha') { m.hurt(); continue; }

        const stomp = m.vy > 0 && m.prevBottom <= e.y + 8;
        if (stomp) {
          if (e.type === 'goomba') {
            e.stomped(m);
            this.comboScore(e);
          } else if (e.type === 'koopa') {
            if (e.mode === 'walk') { e.stomped(m); this.comboScore(e); }
            else if (e.mode === 'slide') { e.stomped(m); }
            else { e.stomped(m); }   // 踢静止的壳
          }
          m.bounce(!!this.input.jump || !!this.touch.jump);
        } else {
          if (e.type === 'koopa' && (e.mode === 'shell' || e.mode === 'wake')) {
            e.kick(m.cx < e.cx ? 1 : -1);
            m.x += (m.cx < e.cx) ? -2 : 2;
          } else {
            m.hurt();
          }
        }
      }
    }

    /* =====================================================
       相机
       ===================================================== */

    updateCamera(snap) {
      const m = this.mario;
      const maxCam = Math.max(0, this.level.width * TS - VW);
      let want = this.camX;
      if (snap) {
        want = m.cx - VW / 2;
      } else {
        if (m.cx > this.camX + 128) want = m.cx - 128;
        else if (m.cx < this.camX + 64) want = m.cx - 64;
      }
      if (want < 0) want = 0;
      if (want > maxCam) want = maxCam;
      this.camX = want;
    }

    /* =====================================================
       主循环
       ===================================================== */

    update() {
      this.frame++;
      if (this.toastTimer > 0) this.toastTimer--;

      switch (this.state) {
        case 'title':    this.updateTitle(); break;
        case 'ready':    this.updateReady(); break;
        case 'playing':  this.updatePlaying(); break;
        case 'dying':
          this.timer++;
          this.mario.update();
          break;
        case 'clear':    this.updateClear(); break;
        case 'gameover': this.updateGameOver(); break;
        case 'win':
          this.timer++;
          break;
      }
      Sound.update();
    }

    updateTitle() {
      this.timer++;
      this.titleTimer = this.timer;
    }

    /* =====================================================
       渲染
       ===================================================== */

    render() {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;

      if (this.state === 'title') { this.renderTitle(); return; }
      if (this.state === 'ready') { this.renderReady(); return; }
      if (this.state === 'gameover') { this.renderGameOver(); return; }
      if (this.state === 'win') { this.renderWin(); return; }

      this.renderWorld();
      this.renderHUD();

      if (this.paused) this.renderPause();
      if (this.state === 'clear') this.renderClear();
      if (this.toastTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.toastTimer / 20);
        Spr.drawTextCenter(ctx, this.toast, VW / 2, 60, '#ffffff', { shadow: '#000000' });
        ctx.restore();
      }
    }

    renderWorld() {
      const ctx = this.ctx;

      // 天空
      if (!this._skyGrad) {
        const sky = this.tiles.theme.sky;
        const grd = ctx.createLinearGradient(0, 0, 0, VH);
        grd.addColorStop(0, sky[0]);
        grd.addColorStop(1, sky[1]);
        this._skyGrad = grd;
      }
      ctx.fillStyle = this._skyGrad;
      ctx.fillRect(0, 0, VW, VH);

      this.renderDecor();
      this.renderCastle();
      this.renderTiles();
      this.renderEntities();
      this.renderFlag();
      this.renderCheckpoint();
    }

    renderDecor() {
      const ctx = this.ctx;
      const d = this.level.decor;
      if (!d || !d.length) return;
      for (let i = 0; i < d.length; i++) {
        const o = d[i];
        const par = (o.type === 'cloudBig' || o.type === 'cloudSmall') ? 0.55 : 1;
        const sx = o.x - this.camX * par;
        if (sx < -96 || sx > VW + 16) continue;
        let img = null, oy = o.y;
        switch (o.type) {
          case 'cloudBig':   img = this.tiles.cloudBig; break;
          case 'cloudSmall': img = this.tiles.cloudSmall; break;
          case 'hillBig':    img = this.tiles.hillBig; oy -= img.height; break;
          case 'hillSmall':  img = this.tiles.hillSmall; oy -= img.height; break;
          case 'bush':       img = this.tiles.bush; oy -= img.height; break;
        }
        if (img) ctx.drawImage(img, Math.round(sx), Math.round(oy));
      }
    }

    bumpOffsetAt(tx, ty) {
      for (let i = 0; i < this.bumps.length; i++) {
        const b = this.bumps[i];
        if (b.tx === tx && b.ty === ty) return BUMP_OFFSETS[Math.min(b.t, BUMP_OFFSETS.length - 1)];
      }
      return 0;
    }

    tileImage(ch, tx, ty) {
      const T = this.tiles;
      switch (ch) {
        case 'X': return T.ground;
        case 'B': case 'b': return T.brick;
        case '#': return T.stone;
        case '?': case '!': {
          const f = Math.floor(this.frame / 9) % 4;
          return T.q[f];
        }
        case 'U': return T.used;
        case 'o': return T.coin[Math.floor(this.frame / 7) % 4];
        case '[': return T.pipeTL;
        case ']': return T.pipeTR;
        case '{': return T.pipeBL;
        case '}': return T.pipeBR;
        default: return null;
      }
    }

    renderTiles() {
      const ctx = this.ctx;
      const x0 = Math.max(0, Math.floor(this.camX / TS));
      const x1 = Math.min(this.level.width - 1, Math.floor((this.camX + VW) / TS) + 1);
      const y1 = this.level.height - 1;

      for (let ty = 0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const ch = this.grid[ty][tx];
          if (ch === ' ') continue;
          if (ch === '|') { this.drawPole(ctx, tx, ty); continue; }
          const img = this.tileImage(ch, tx, ty);
          if (!img) continue;
          const off = this.bumpOffsetAt(tx, ty);
          ctx.drawImage(img, tx * TS - this.camX, ty * TS + off);
        }
      }
    }

    drawPole(ctx, tx, ty) {
      const x = Math.round(tx * TS - this.camX) + 7;
      const y = ty * TS;
      ctx.fillStyle = '#003800';
      ctx.fillRect(x - 1, y, 4, TS);
      ctx.fillStyle = '#58d858';
      ctx.fillRect(x, y, 2, TS);
    }

    renderFlag() {
      const ctx = this.ctx;
      const lv = this.level;
      const px = lv.flagTx * TS - this.camX;
      if (px < -64 || px > VW + 64) return;
      // 顶球
      ctx.drawImage(this.tiles.flagBall, Math.round(px), (lv.flagTopTy - 1) * TS);
      // 旗子（挂在旗杆左侧）
      Spr.drawSprite(ctx, this.tiles.flag, Math.round(px) - 7, Math.round(this.flagY), true);
    }

    renderCastle() {
      const lv = this.level;
      if (lv.castleTx === undefined || lv.castleTx === null) return;
      const img = this.tiles.castle;
      const x = lv.castleTx * TS - this.camX;
      if (x > VW || x + img.width < 0) return;
      this.ctx.drawImage(img, Math.round(x), lv.groundY - img.height);
    }

    renderCheckpoint() {
      const tx = this.level.checkpointTx;
      if (tx === undefined || tx === null) return;
      const ctx = this.ctx;
      const x = Math.round(tx * TS - this.camX) + 6;
      if (x < -32 || x > VW + 32) return;
      const y = this.level.groundY;
      ctx.fillStyle = '#003800';
      ctx.fillRect(x, y - 34, 3, 34);
      ctx.fillStyle = this.checkpointReached ? '#f8c000' : '#606060';
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 34);
      ctx.lineTo(x + 19, y - 28);
      ctx.lineTo(x + 3, y - 22);
      ctx.closePath();
      ctx.fill();
    }

    renderEntities() {
      const ctx = this.ctx;
      const self = this;
      const deferred = [];
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (!e.active) continue;
        if (e.type === 'scorepop' || e.type === 'debris' || e.type === 'puff') { deferred.push(e); continue; }
        ctx.save();
        ctx.translate(-Math.round(this.camX), 0);
        e.draw(ctx);
        ctx.restore();
      }
      if (this.mario && this.mario.state !== 'done') {
        ctx.save();
        ctx.translate(-Math.round(this.camX), 0);
        this.mario.draw(ctx);
        ctx.restore();
      }
      for (let i = 0; i < deferred.length; i++) {
        ctx.save();
        ctx.translate(-Math.round(this.camX), 0);
        deferred[i].draw(ctx);
        ctx.restore();
      }
    }

    /* --- HUD --- */

    renderHUD() {
      const ctx = this.ctx;
      const pad = function (n, len) {
        let s = String(n);
        while (s.length < len) s = '0' + s;
        return s;
      };

      Spr.drawText(ctx, 'MARIO', 16, 8, '#ffffff', { shadow: '#000000' });
      Spr.drawText(ctx, pad(this.score, 6), 16, 18, '#ffffff', { shadow: '#000000' });

      Spr.drawText(ctx, 'COINS', 92, 8, '#ffffff', { shadow: '#000000' });
      ctx.drawImage(this.tiles.coin[0], 90, 15, 10, 10);
      Spr.drawText(ctx, 'X' + pad(this.coins, 2), 102, 18, '#ffffff', { shadow: '#000000' });

      Spr.drawText(ctx, 'WORLD', 152, 8, '#ffffff', { shadow: '#000000' });
      Spr.drawText(ctx, this.level.id, 158, 18, '#ffffff', { shadow: '#000000' });

      Spr.drawText(ctx, 'TIME', 208, 8, '#ffffff', { shadow: '#000000' });
      Spr.drawText(ctx, pad(Math.max(0, this.time), 3), 210, 18,
        this.time <= 100 ? '#ff6050' : '#ffffff', { shadow: '#000000' });

      // 生命
      Spr.drawText(ctx, 'LIVES', 16, 30, '#e8e8e8', { shadow: '#000000' });
      Spr.drawText(ctx, 'X' + this.lives, 52, 30, '#ffffff', { shadow: '#000000' });
    }

    renderPause() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, VW, VH);
      Spr.drawTextCenter(ctx, 'PAUSE', VW / 2, 104, '#ffffff', { scale: 2, shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'PRESS P TO RESUME', VW / 2, 132, '#c8c8c8', { shadow: '#000000' });
    }

    renderClear() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 88, VW, 62);
      Spr.drawTextCenter(ctx, 'COURSE CLEAR!', VW / 2, 96, '#ffffff', { scale: 2, shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'TIME BONUS  ' + (this.time * 50), VW / 2, 122, '#f8d000', { shadow: '#000000' });
    }

    /* --- 各种界面 --- */

    _buildTitleDecor() {
      this.titleTimer = 0;
    }

    renderTitle() {
      const ctx = this.ctx;
      const grd = ctx.createLinearGradient(0, 0, 0, VH);
      grd.addColorStop(0, '#5c94fc');
      grd.addColorStop(0.72, '#9ec8ff');
      grd.addColorStop(1, '#5c94fc');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, VW, VH);

      if (!this._titleTiles) this._titleTiles = Spr.makeTileset('overworld');
      const T = this._titleTiles;

      // 云（放在标题与说明文字之间的空档里）
      const t = this.titleTimer;
      const c1 = (t * 0.35) % (VW + 120) - 60;
      ctx.drawImage(T.cloudBig, Math.round(c1), 100);
      const c2 = (t * 0.22 + 140) % (VW + 120) - 60;
      ctx.drawImage(T.cloudSmall, Math.round(c2), 116);

      // 地面
      for (let x = 0; x < VW; x += TS) {
        ctx.drawImage(T.ground, x, VH - 32);
        ctx.drawImage(T.ground, x, VH - 16);
      }
      ctx.drawImage(T.bush, 4, VH - 48);
      ctx.drawImage(T.hillSmall, 196, VH - 64);

      // 标题
      Spr.drawTextCenter(ctx, 'SUPER', VW / 2, 34, '#ffffff', { scale: 2, outline: '#000000' });
      Spr.drawTextCenter(ctx, 'MARIO', VW / 2, 56, '#e03020', { scale: 2, outline: '#000000' });
      Spr.drawTextCenter(ctx, 'HTML5 CANVAS REMAKE', VW / 2, 82, '#ffe070', { shadow: '#000000' });

      // 装饰角色
      const hop = Math.abs(Math.sin(t / 18)) * 5;
      Spr.drawSprite(ctx, Spr.SPR.mario.normal.small.walk[Math.floor(t / 8) % 3], 24, VH - 48 - hop, false);
      const gx = 56 + Math.sin(t / 60) * 12;
      Spr.drawSprite(ctx, Spr.SPR.goomba.walk[Math.floor(t / 9) % 2], gx, VH - 48, Math.cos(t / 60) < 0);

      // 提示
      if (Math.floor(t / 26) % 2 === 0) {
        Spr.drawTextCenter(ctx, 'PRESS ENTER OR TAP TO START', VW / 2, 136, '#ffffff', { shadow: '#000000' });
      }
      Spr.drawTextCenter(ctx, 'ARROWS / WASD   MOVE', VW / 2, 156, '#e8f0ff', { shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'Z OR SPACE      JUMP', VW / 2, 168, '#e8f0ff', { shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'X OR SHIFT      RUN / FIRE', VW / 2, 180, '#e8f0ff', { shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'TOP SCORE  ' + this.hiScore, VW / 2, 194, '#f8d000', { shadow: '#000000' });
    }

    renderReady() {
      const ctx = this.ctx;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, VW, VH);
      const lv = this.level;
      Spr.drawTextCenter(ctx, lv.name, VW / 2, 90, '#ffffff', { scale: 2, shadow: '#404040' });

      // 马里奥头像 x 生命
      Spr.drawSprite(ctx, Spr.SPR.mario.normal.small.idle[0], VW / 2 - 34, 128, false);
      Spr.drawText(ctx, 'X  ' + this.lives, VW / 2 - 8, 134, '#ffffff');

      const elapsed = this.timer;
      if (elapsed > 40) {
        Spr.drawTextCenter(ctx, 'COINS  ' + this.coins + '     SCORE  ' + this.score, VW / 2, 172, '#c8c8c8');
      }
      if (elapsed > 70) {
        Spr.drawTextCenter(ctx, 'GET READY!', VW / 2, 198, '#f8d000');
      }
    }

    renderGameOver() {
      const ctx = this.ctx;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, VW, VH);
      Spr.drawTextCenter(ctx, 'GAME OVER', VW / 2, 100, '#ffffff', { scale: 2, shadow: '#404040' });
      Spr.drawTextCenter(ctx, 'SCORE  ' + this.score, VW / 2, 136, '#f8d000');
      Spr.drawTextCenter(ctx, 'TOP    ' + this.hiScore, VW / 2, 150, '#c8c8c8');
      if (Math.floor(this.timer / 26) % 2 === 0) {
        Spr.drawTextCenter(ctx, 'PRESS R TO PLAY AGAIN', VW / 2, 184, '#ffffff');
      }
    }

    renderWin() {
      const ctx = this.ctx;
      const grd = ctx.createLinearGradient(0, 0, 0, VH);
      grd.addColorStop(0, '#101830');
      grd.addColorStop(1, '#3050a0');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, VW, VH);

      Spr.drawTextCenter(ctx, 'THANK YOU MARIO!', VW / 2, 30, '#ffffff', { scale: 2, outline: '#000000' });
      Spr.drawTextCenter(ctx, 'YOUR QUEST IS OVER.', VW / 2, 62, '#f8d000', { shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'WE PRESENT YOU A NEW QUEST.', VW / 2, 78, '#f8d000', { shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'FINAL SCORE  ' + this.score, VW / 2, 102, '#ffffff', { shadow: '#000000' });
      Spr.drawTextCenter(ctx, 'TOP SCORE    ' + this.hiScore, VW / 2, 116, '#c8c8c8', { shadow: '#000000' });

      if (!this._titleTiles) this._titleTiles = Spr.makeTileset('overworld');
      const T = this._titleTiles;
      const cy = VH - 90;
      ctx.drawImage(T.castle, VW / 2 - 40, cy);
      Spr.drawSprite(ctx, Spr.SPR.mario.normal.small.idle[0], VW / 2 + 32, cy + 64, false);

      if (Math.floor(this.timer / 26) % 2 === 0) {
        Spr.drawTextCenter(ctx, 'PRESS R TO PLAY AGAIN', VW / 2, 136, '#ffffff', { shadow: '#000000' });
      }
    }
  }

  /* =========================================================
     启动
     ========================================================= */

  const canvas = document.getElementById('screen');
  const stage = document.getElementById('stage');
  const game = new Game(canvas, stage);
  global.game = game;

  // 工具栏按钮
  window.addEventListener('load', function () {
    const b = function (id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    b('btnPause', function () { game.togglePause(); });
    b('btnMute', function () { game.toggleMute(); });
    b('btnFull', function () { game.toggleFullscreen(); });
    b('btnReset', function () { game.restart(); });

    document.addEventListener('fullscreenchange', function () {
      stage.classList.toggle('is-fullscreen', !!document.fullscreenElement);
    });
  });

  // 主循环：固定 60Hz 逻辑步长
  const STEP = 1000 / 60;
  let acc = 0;
  let last = performance.now();

  function loop(now) {
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250;         // 切标签页回来时避免暴走
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      game.update();
      acc -= STEP;
    }
    game.render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

})(window);
