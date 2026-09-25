/* ============================================================
   entities.js —— 实体系统
   马里奥（走/跑/跳/蹲/变身/火球/无敌星/死亡/降旗），
   敌人（板栗仔、乌龟、食人花），道具（蘑菇、火花、星星），
   以及金币弹出、砖块碎片、分数飘字等特效。
   ============================================================ */
(function (global) {
  'use strict';

  const TS = 16;

  /* ---------------- 物理常量（单位：像素 / 帧，60fps） ---------------- */
  const PHYS = {
    ACC_WALK: 0.105,
    ACC_RUN: 0.145,
    AIR_ACC: 0.095,
    MAX_WALK: 1.55,
    MAX_RUN: 2.6,
    FRICTION: 0.105,
    SKID: 0.32,
    DECAY: 0.20,          // 超速衰减：必须大于 ACC_RUN，否则永远收敛不到上限
    GRAV_HOLD: 0.165,     // 按住跳跃键上升时
    GRAV_FALL: 0.46,      // 其他情况
    GRAV_ENEMY: 0.34,
    MAX_FALL: 7.4,
    JUMP_V: -4.62,
    JUMP_SPEED_BONUS: 0.24,
    JUMP_MIN_CUT: -3.4,   // 松开跳跃键时保留的最小上升速度
    COYOTE: 5,
    BUFFER: 6,
    STOMP_BOUNCE: -3.5,
    STOMP_BOUNCE_HELD: -5.0,
    SHELL_SPEED: 3.3,
    FIRE_SPEED: 3.7
  };

  /* ---------------- 基类 ---------------- */

  class Entity {
    constructor(game, x, y, w, h) {
      this.game = game;
      this.x = x; this.y = y;
      this.w = w; this.h = h;
      this.vx = 0; this.vy = 0;
      this.facing = -1;
      this.onGround = false;
      this.removed = false;
      this.noClip = false;
      this.active = true;
      this.anim = 0;
      this.type = 'entity';
      this.gravity = PHYS.GRAV_ENEMY;
      this.maxFall = PHYS.MAX_FALL;
      this.headHit = null;
      this.hurtsMario = true;
      this.enemy = false;      // 是否属于「敌人」（可被踩、被火球打）
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    overlaps(o) {
      return this.x < o.x + o.w && this.x + this.w > o.x &&
             this.y < o.y + o.h && this.y + this.h > o.y;
    }

    applyGravity(grav) {
      this.vy += (grav === undefined ? this.gravity : grav);
      if (this.vy > this.maxFall) this.vy = this.maxFall;
    }

    moveX() {
      this.onWallLeft = false;
      this.onWallRight = false;
      this.x += this.vx;
      if (this.noClip) return;
      const top = Math.floor(this.y / TS);
      const bot = Math.floor((this.y + this.h - 1) / TS);
      if (this.vx > 0) {
        const tx = Math.floor((this.x + this.w - 1) / TS);
        for (let ty = top; ty <= bot; ty++) {
          if (this.game.isSolid(tx, ty)) {
            this.x = tx * TS - this.w; this.vx = 0; this.onWallRight = true; break;
          }
        }
      } else if (this.vx < 0) {
        const tx = Math.floor(this.x / TS);
        for (let ty = top; ty <= bot; ty++) {
          if (this.game.isSolid(tx, ty)) {
            this.x = (tx + 1) * TS; this.vx = 0; this.onWallLeft = true; break;
          }
        }
      }
    }

    moveY() {
      this.headHit = null;
      this.y += this.vy;
      this.onGround = false;
      if (this.noClip) return;
      const left = Math.floor(this.x / TS);
      const right = Math.floor((this.x + this.w - 1) / TS);
      if (this.vy > 0) {
        // 用「脚底线」y+h 取样：脚正好贴住方块上沿时也算接触，
        // 否则逐帧重力不足 1px 时会漏检，导致 onGround 每隔一帧闪断
        const ty = Math.floor((this.y + this.h) / TS);
        for (let tx = left; tx <= right; tx++) {
          if (this.game.isSolid(tx, ty)) {
            this.y = ty * TS - this.h; this.vy = 0; this.onGround = true; break;
          }
        }
      } else if (this.vy < 0) {
        const ty = Math.floor(this.y / TS);
        let best = -1, bestD = 1e9;
        for (let tx = left; tx <= right; tx++) {
          if (this.game.isSolid(tx, ty)) {
            const d = Math.abs((tx * TS + TS / 2) - (this.x + this.w / 2));
            if (d < bestD) { bestD = d; best = tx; }
          }
        }
        if (best >= 0) {
          this.y = (ty + 1) * TS; this.vy = 0;
          this.headHit = { tx: best, ty: ty };
        }
      }
    }

    /** 是否已经掉出关卡底部 */
    fellOut() {
      if (this.y > this.game.level.pitDeathY) { this.removed = true; return true; }
      return false;
    }

    update() {}
    draw() {}
  }

  /* =========================================================
     马里奥
     ========================================================= */

  const COMBO_SCORES = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];

  class Mario extends Entity {
    constructor(game, x, y) {
      super(game, x, y, 12, 15);
      this.power = 0;            // 0=小 1=大 2=火
      this.state = 'play';       // play | grow | shrink | dead | flag | walk
      this.stateTimer = 0;
      this.ducking = false;
      this.starTimer = 0;
      this.invulnTimer = 0;
      this.jumping = false;
      this.jumpWasDown = false;
      this.runWasDown = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.fireCooldown = 0;
      this.combo = 0;
      this.skidding = false;
      this.animTimer = 0;
      this.walkFrame = 0;
      this.flagSlideFrom = 0;
      this.deadTimer = 0;
      this.type = 'mario';
      this.hurtsMario = false;
    }

    get big() { return this.power > 0; }

    /* --- 尺寸随形态变化（脚底位置保持不变） --- */
    applySize() {
      const bottom = this.y + this.h;
      let h;
      if (this.power === 0) h = 15;
      else h = this.ducking ? 20 : 30;
      this.w = 12;
      this.h = h;
      this.y = bottom - h;
      this.fixStuck();
    }

    /** 变身后如果卡进方块里，向下推出来 */
    fixStuck() {
      const bottom = this.y + this.h;
      for (let i = 0; i < 4; i++) {
        const left = Math.floor(this.x / TS);
        const right = Math.floor((this.x + this.w - 1) / TS);
        const top = Math.floor(this.y / TS);
        let stuck = false;
        for (let tx = left; tx <= right; tx++) if (this.game.isSolid(tx, top)) { stuck = true; break; }
        if (!stuck) break;
        this.y = (top + 1) * TS;
        if (this.y + this.h > bottom + 32) break;
      }
    }

    /* --- 输入 --- */
    control() {
      const g = this.game, input = g.input;

      // 蹲下
      const wantDuck = input.down && this.big;
      if (wantDuck !== this.ducking) {
        // 站起来前先确认头顶有空间
        if (!wantDuck) {
          const bottom = this.y + this.h;
          const testY = bottom - 30;
          const left = Math.floor(this.x / TS);
          const right = Math.floor((this.x + this.w - 1) / TS);
          const ty = Math.floor(testY / TS);
          let blocked = false;
          for (let tx = left; tx <= right; tx++) if (g.isSolid(tx, ty)) { blocked = true; break; }
          if (blocked) return;
        }
        this.ducking = wantDuck;
        this.applySize();
      }

      let dir = 0;
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
      if (this.ducking) dir = 0;

      const run = !!input.run;
      const maxSpd = run ? PHYS.MAX_RUN : PHYS.MAX_WALK;

      if (dir !== 0) {
        if (this.onGround && this.vx * dir < 0) {
          // 急刹车 / 转身
          this.vx += dir * PHYS.SKID;
          this.skidding = Math.abs(this.vx) > 0.5;
        } else {
          this.skidding = false;
          this.vx += dir * (this.onGround ? (run ? PHYS.ACC_RUN : PHYS.ACC_WALK) : PHYS.AIR_ACC);
        }
        this.facing = dir;
      } else {
        this.skidding = false;
        if (this.onGround) {
          if (Math.abs(this.vx) <= PHYS.FRICTION) this.vx = 0;
          else this.vx -= Math.sign(this.vx) * PHYS.FRICTION;
        }
      }

      // 超过当前上限时平滑衰减（衰减量 > 加速度，保证收敛）
      if (this.vx > maxSpd) this.vx = Math.max(maxSpd, this.vx - PHYS.DECAY);
      else if (this.vx < -maxSpd) this.vx = Math.min(-maxSpd, this.vx + PHYS.DECAY);

      /* --- 跳跃（含土狼时间 + 输入缓冲） --- */
      if (input.jump && !this.jumpWasDown) this.jumpBuffer = PHYS.BUFFER;
      this.jumpWasDown = !!input.jump;
      if (this.jumpBuffer > 0) this.jumpBuffer--;
      if (this.onGround) this.coyote = PHYS.COYOTE; else if (this.coyote > 0) this.coyote--;

      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.vy = PHYS.JUMP_V - Math.min(Math.abs(this.vx), PHYS.MAX_RUN) * PHYS.JUMP_SPEED_BONUS;
        this.onGround = false;
        this.jumping = true;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.combo = 0;
        Sound.play(Math.abs(this.vx) > 2.0 ? 'jumpBig' : 'jump');
      }
      if (this.jumping && this.vy < 0 && !input.jump) {
        this.vy = Math.max(this.vy, PHYS.JUMP_MIN_CUT);
        this.jumping = false;
      }
      if (this.vy >= 0) this.jumping = false;

      /* --- 发射火球 --- */
      if (this.fireCooldown > 0) this.fireCooldown--;
      if (input.run && !this.runWasDown && this.power === 2 && this.fireCooldown <= 0) {
        this.runWasDown = true;
        if (g.fireballs < 2) {
          g.spawn(new Fireball(g, this.cx + this.facing * 6, this.y + (this.ducking ? 4 : 10), this.facing));
          g.fireballs++;
          this.fireCooldown = 12;
          Sound.play('fireball');
        }
      }
      this.runWasDown = !!input.run;
    }

    update() {
      const g = this.game;

      if (this.state === 'dead') return this.updateDead();
      if (this.state === 'done') return;
      if (this.state === 'grow' || this.state === 'shrink') return this.updateTransform();
      if (this.state === 'flag' || this.state === 'walk') return this.updateFlag();

      this.prevBottom = this.y + this.h;   // 供踩踏判定使用

      if (this.starTimer > 0) this.starTimer--;
      if (this.invulnTimer > 0) this.invulnTimer--;

      this.control();

      // 重力
      const grav = (this.vy < 0 && g.input.jump) ? PHYS.GRAV_HOLD : PHYS.GRAV_FALL;
      this.applyGravity(grav);

      this.moveX();

      // 不能退出屏幕左侧
      const minX = g.camX + 1;
      if (this.x < minX) { this.x = minX; if (this.vx < 0) this.vx = 0; }

      this.moveY();

      if (this.headHit) {
        g.hitBlock(this.headHit.tx, this.headHit.ty, this);
        this.headHit = null;
      }

      // 落地重置连击
      if (this.onGround) this.combo = 0;

      // 动画帧
      this.animTimer += Math.abs(this.vx);
      if (this.animTimer > 9) { this.animTimer = 0; this.walkFrame = (this.walkFrame + 1) % 3; }

      // 掉进坑里
      if (this.y > g.level.pitDeathY) this.die(true);

      // 拾取金币瓦片
      g.collectCoins(this);
    }

    updateTransform() {
      this.stateTimer++;
      const total = this.state === 'grow' ? 26 : 26;
      if (this.stateTimer === 6) {
        this.applySize();
      }
      if (this.stateTimer >= total) {
        this.state = 'play';
        this.stateTimer = 0;
        this.invulnTimer = Math.max(this.invulnTimer, 40);
      }
    }

    updateDead() {
      this.deadTimer++;
      if (this.deadTimer > 30) {
        this.vy += 0.34;
        this.y += this.vy;
      }
      if (this.deadTimer > 150) this.game.afterDeath();
    }

    updateFlag() {
      const g = this.game;
      if (this.state === 'flag') {
        this.y += 1.8;
        const floor = g.level.groundY - this.h;
        if (this.y >= floor) {
          this.y = floor;
          this.state = 'walk';
          this.stateTimer = 0;
          this.facing = 1;
          Sound.playMusic(g.level.music);
        }
      } else {
        this.stateTimer++;
        this.x += 1.15;
        this.animTimer += 1.15;
        if (this.animTimer > 9) { this.animTimer = 0; this.walkFrame = (this.walkFrame + 1) % 3; }
        const castleDoorX = (g.level.castleTx + 2.5) * TS;
        if (this.x > castleDoorX) {
          this.state = 'done';
          g.levelComplete();
        }
      }
    }

    /* --- 状态变化 --- */

    die(instant) {
      if (this.state === 'dead') return;
      this.state = 'dead';
      this.deadTimer = 0;
      this.vy = instant ? 0 : -5.2;
      this.vx = 0;
      this.ducking = false;
      this.power = 0;              // 死亡时恢复成小马里奥
      this.h = 15; this.w = 12;
      Sound.stopMusic();
      Sound.play('die');
      this.game.onMarioDeath();
    }

    hurt() {
      if (this.state !== 'play') return;
      if (this.starTimer > 0 || this.invulnTimer > 0) return;
      if (this.power > 0) {
        this.power = 0;
        this.ducking = false;
        this.state = 'shrink';
        this.stateTimer = 0;
        this.applySize();
        this.invulnTimer = 120;
        Sound.play('shrink');
      } else {
        this.die();
      }
    }

    /** 吃到道具 */
    eatMushroom() {
      if (this.power === 0) {
        this.power = 1;
        this.state = 'grow';
        this.stateTimer = 0;
        this.ducking = false;
      } else {
        this.game.addScore(1000, this.x, this.y);
      }
      Sound.play('powerup');
    }

    eatFlower() {
      if (this.power === 0) {
        this.power = 2;
        this.state = 'grow';
        this.stateTimer = 0;
      } else {
        this.power = 2;
      }
      Sound.play('powerup');
    }

    eatStar() {
      this.starTimer = 640;
      Sound.play('powerup');
    }

    /** 踩到敌人后的弹跳 */
    bounce(high) {
      this.vy = high ? PHYS.STOMP_BOUNCE_HELD : PHYS.STOMP_BOUNCE;
      this.jumping = !!high;
      this.onGround = false;
    }

    /* --- 绘制 --- */

    spriteSet() {
      const S = Spr.SPR.mario[this.power === 2 ? 'fire' : 'normal'];
      return this.power === 0 ? S.small : S.big;
    }

    currentFrame() {
      const set = this.spriteSet();
      if (this.state === 'dead') return (set.dead || this.spriteSet().idle)[0];
      if (this.power > 0 && this.ducking) return set.duck[0];
      if (this.state === 'flag') return set.walk[1];
      if (!this.onGround) return set.jump[0];
      if (this.skidding) return set.skid[0];
      if (Math.abs(this.vx) > 0.12) return set.walk[this.walkFrame % set.walk.length];
      return set.idle[0];
    }

    draw(ctx) {
      if (this.state === 'done') return;
      // 受伤闪烁
      if (this.invulnTimer > 0 && this.state !== 'shrink' && Math.floor(this.invulnTimer / 3) % 2 === 0) return;

      const frame = this.currentFrame();
      const sprW = frame.width, sprH = frame.height;
      const dx = this.x + this.w / 2 - sprW / 2;
      const dy = this.y + this.h - sprH;

      // 无敌星：色相循环
      let alpha = 1;
      if (this.starTimer > 0 && this.starTimer < 120 && Math.floor(this.starTimer / 4) % 2 === 0) alpha = 0.55;
      const flip = this.facing < 0;

      if (this.starTimer > 0) {
        const hue = (this.game.frame * 12) % 360;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'source-over';
        // 用色相滤镜近似彩虹闪烁
        ctx.filter = 'hue-rotate(' + hue + 'deg) saturate(2.2) brightness(1.15)';
        Spr.drawSprite(ctx, frame, dx, dy, flip);
        ctx.filter = 'none';
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        Spr.drawSprite(ctx, frame, dx, dy, flip);
        ctx.restore();
      }
    }
  }

  /* =========================================================
     板栗仔
     ========================================================= */

  class Goomba extends Entity {
    constructor(game, x, y) {
      super(game, x, y, 14, 16);
      this.type = 'goomba';
      this.enemy = true;
      this.vx = -0.45;
      this.facing = -1;
      this.squashTimer = 0;
      this.flipping = false;
      this.animTimer = 0;
    }

    stomped(mario) {
      this.squashTimer = 30;
      this.vx = 0;
      this.hurtsMario = false;
      Sound.play('stomp');
    }

    kill(dir) {
      if (this.flipping) return;
      this.flipping = true;
      this.hurtsMario = false;
      this.vy = -3.6;
      this.vx = 1.0 * (dir || 1);
    }

    update() {
      if (this.squashTimer > 0) {
        this.squashTimer--;
        if (this.squashTimer <= 0) this.removed = true;
        return;
      }
      if (this.flipping) {
        this.vy += 0.36;
        this.y += this.vy;
        this.x += this.vx;
        if (this.y > this.game.level.pitDeathY) this.removed = true;
        return;
      }
      this.applyGravity();
      this.moveX();
      if (this.vx === 0) this.vx = (this.onWallLeft ? 0.45 : -0.45);
      this.facing = this.vx > 0 ? 1 : -1;
      this.moveY();
      this.animTimer++;
      this.fellOut();
    }

    draw(ctx) {
      const dx = this.x + this.w / 2 - 8;
      if (this.squashTimer > 0) {
        Spr.drawSprite(ctx, Spr.SPR.goomba.flat, dx, this.y + this.h - 16, false);
        return;
      }
      const f = Math.floor(this.animTimer / 9) % 2;
      const spr = Spr.SPR.goomba.walk[f];
      ctx.save();
      if (this.flipping) { ctx.translate(0, this.y + this.h); ctx.scale(1, -1); ctx.translate(0, -(this.y + this.h)); }
      Spr.drawSprite(ctx, spr, dx, this.y + this.h - 16, this.facing > 0);
      ctx.restore();
    }
  }

  /* =========================================================
     乌龟
     ========================================================= */

  class Koopa extends Entity {
    constructor(game, x, y) {
      super(game, x, y, 13, 22);
      this.type = 'koopa';
      this.enemy = true;
      this.mode = 'walk';        // walk | shell | slide | wake
      this.vx = -0.45;
      this.facing = -1;
      this.timer = 0;
      this.animTimer = 0;
    }

    stomped(mario) {
      if (this.mode === 'walk') {
        const bottom = this.y + this.h;
        this.mode = 'shell';
        this.w = 14;
        this.h = 16;
        this.y = bottom - this.h;
        this.vx = 0;
        this.timer = 0;
        Sound.play('stomp');
      } else if (this.mode === 'slide') {
        this.mode = 'shell';
        this.vx = 0;
        this.timer = 0;
        Sound.play('stomp');
      } else {
        // 踩静止的壳 = 踢出去
        this.kick(mario.cx < this.cx ? 1 : -1);
      }
    }

    kick(dir) {
      this.mode = 'slide';
      this.vx = PHYS.SHELL_SPEED * dir;
      this.timer = 0;
      Sound.play('kick');
      this.game.addScore(400, this.x, this.y);
    }

    kill(dir) {
      this.flipping = true;
      this.hurtsMario = false;
      this.vy = -3.6;
      this.vx = 1.0 * (dir || 1);
    }

    update() {
      if (this.flipping) {
        this.vy += 0.36;
        this.y += this.vy;
        this.x += this.vx;
        if (this.y > this.game.level.pitDeathY) this.removed = true;
        return;
      }

      this.applyGravity();
      this.moveX();
      this.moveY();

      if (this.mode === 'walk') {
        if (this.vx === 0) { this.vx = this.onWallLeft ? 0.45 : -0.45; }
        this.facing = this.vx > 0 ? 1 : -1;
        this.animTimer++;
      } else if (this.mode === 'shell') {
        this.vx = 0;
        this.timer++;
        this.animTimer = 0;
        if (this.timer > 400) {
          // 快醒了：抖动提示
          if (Math.floor(this.timer / 4) % 2 === 1) this.shake = 1;
          if (this.timer > 460) {
            const bottom = this.y + this.h;
            this.mode = 'walk';
            this.w = 13;
            this.h = 22;
            this.y = bottom - this.h;
            this.vx = -0.45;
            this.timer = 0;
          }
        }
      } else if (this.mode === 'slide') {
        this.timer++;
        this.facing = this.vx > 0 ? 1 : -1;
        if (this.vx === 0) { this.vx = (this.onWallLeft ? PHYS.SHELL_SPEED : -PHYS.SHELL_SPEED); }
        // 壳撞到别的敌人
        const list = this.game.entities;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e === this || e.removed || !e.enemy) continue;
          if (e.flipping) continue;
          if (this.overlaps(e)) {
            e.kill(this.vx > 0 ? 1 : -1);
            this.game.addScore(200, e.x, e.y);
            Sound.play('kick');
          }
        }
      }
      this.fellOut();
    }

    draw(ctx) {
      ctx.save();
      if (this.flipping) { ctx.translate(0, this.y + this.h); ctx.scale(1, -1); ctx.translate(0, -(this.y + this.h)); }
      if (this.mode === 'walk') {
        const f = Math.floor(this.animTimer / 9) % 2;
        Spr.drawSprite(ctx, Spr.SPR.koopa.walk[f], this.x + this.w / 2 - 8, this.y + this.h - 24, this.facing > 0);
      } else {
        const wobble = (this.mode === 'shell' && this.timer > 400 && Math.floor(this.timer / 4) % 2 === 1) ? 1 : 0;
        Spr.drawSprite(ctx, Spr.SPR.koopa.shell, this.x + this.w / 2 - 8, this.y + this.h - 16 + wobble, false);
      }
      ctx.restore();
    }
  }

  /* =========================================================
     食人花
     ========================================================= */

  class Piranha extends Entity {
    constructor(game, pipeLeftX, pipeTopY) {
      super(game, pipeLeftX + 8, pipeTopY, 14, 24);
      this.type = 'piranha';
      this.enemy = true;
      this.pipeTopY = pipeTopY;
      this.downY = pipeTopY;          // 完全缩回
      this.upY = pipeTopY - 24;       // 完全伸出
      this.y = this.downY;
      this.phase = 'wait';
      this.timer = 40;
      this.noClip = true;
      this.hurtsMario = true;
      this.baseX = pipeLeftX + 1;
    }

    update() {
      this.anim++;
      const mario = this.game.mario;
      switch (this.phase) {
        case 'wait':
          this.timer--;
          if (this.timer <= 0) {
            const near = mario && Math.abs(mario.cx - this.cx) < 30;
            if (!near) { this.phase = 'up'; this.timer = 0; }
            else this.timer = 10;
          }
          break;
        case 'up':
          this.y -= 0.7;
          if (this.y <= this.upY) { this.y = this.upY; this.phase = 'out'; this.timer = 90; }
          break;
        case 'out':
          this.timer--;
          if (this.timer <= 0) this.phase = 'down';
          break;
        case 'down':
          this.y += 0.7;
          if (this.y >= this.downY) { this.y = this.downY; this.phase = 'wait'; this.timer = 60; }
          break;
      }
    }

    stomped() { /* 食人花不能被踩 */ }

    kill() {
      this.removed = true;
      this.game.addScore(200, this.x, this.y);
    }

    draw(ctx) {
      const f = Math.floor(this.anim / 14) % 2;
      const spr = Spr.SPR.piranha[f];
      const dx = this.x + this.w / 2 - 8;
      // 只画管口以上的部分，模拟从管道里钻出来
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.floor(this.x) - 2, 0, 20, Math.ceil(this.pipeTopY) + 5);
      ctx.clip();
      Spr.drawSprite(ctx, spr, dx, this.y, false);
      ctx.restore();
    }
  }

  /* =========================================================
     道具
     ========================================================= */

  class Item extends Entity {
    constructor(game, x, y, kind) {
      super(game, x, y, 16, 16);
      this.kind = kind;                 // mushroom | flower | star
      this.type = 'item';
      this.hurtsMario = false;
      this.emerge = 16;                 // 从砖块里升起的剩余像素
      this.noClip = true;
      this.vx = 0;
      this.vy = 0;
      this.startY = y;
      this.facing = 1;
      this.anim = 0;
      if (kind === 'star') this.vx = 1.5;
    }

    update() {
      this.anim++;
      if (this.emerge > 0) {
        const step = Math.min(0.7, this.emerge);
        this.y -= step;
        this.emerge -= step;
        if (this.emerge <= 0) {
          this.y = this.startY - 16;
          this.noClip = false;
          if (this.kind === 'mushroom' || this.kind === 'star') this.vx = this.kind === 'star' ? 1.7 : 0.9;
        }
        return;
      }
      if (this.kind === 'flower') return;   // 火花原地不动

      this.applyGravity();
      this.moveX();
      if (this.vx === 0) this.vx = this.onWallLeft ? 0.9 : -0.9;
      this.facing = this.vx > 0 ? 1 : -1;
      this.moveY();
      if (this.kind === 'star' && this.onGround) this.vy = -3.4;
      this.fellOut();
    }

    draw(ctx) {
      const bob = 0;
      if (this.kind === 'mushroom') {
        Spr.drawSprite(ctx, Spr.SPR.mushroom, this.x, this.y + bob, false);
      } else if (this.kind === 'flower') {
        const f = Math.floor(this.anim / 8) % 2;
        if (f === 0) Spr.drawSprite(ctx, Spr.SPR.flower, this.x, this.y, false);
        else {
          // 用轻微缩放模拟花瓣闪动
          ctx.save();
          ctx.translate(this.x + 8, this.y + 8);
          ctx.scale(0.86, 1);
          ctx.drawImage(Spr.SPR.flower, -8, -8);
          ctx.restore();
        }
      } else {
        const f = Math.floor(this.anim / 5) % 4;
        Spr.drawSprite(ctx, Spr.SPR.star[f], this.x, this.y, false);
      }
    }
  }

  /* =========================================================
     火球
     ========================================================= */

  class Fireball extends Entity {
    constructor(game, x, y, dir) {
      super(game, x, y, 8, 8);
      this.type = 'fireball';
      this.hurtsMario = false;
      this.vx = PHYS.FIRE_SPEED * (dir || 1);
      this.vy = 1.6;
      this.life = 300;
      this.anim = 0;
    }

    update() {
      this.anim++;
      this.life--;
      this.applyGravity(0.32);
      this.moveX();
      if (this.vx === 0) { this.burst(); return; }
      this.moveY();
      if (this.onGround) this.vy = -2.7;
      if (this.y > this.game.level.pitDeathY || this.life <= 0) this.burst(true);
      // 打到敌人
      const list = this.game.entities;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e === this || e.removed || !e.enemy || e.flipping) continue;
        if (e.squashTimer > 0) continue;
        if (this.overlaps(e)) {
          e.kill(this.vx > 0 ? 1 : -1);
          this.game.addScore(200, e.x, e.y);
          Sound.play('kick');
          this.burst();
          return;
        }
      }
    }

    burst(silent) {
      this.removed = true;
      if (this.game.fireballs > 0) this.game.fireballs--;
      if (!silent) this.game.spawn(new Puff(this.game, this.x - 4, this.y - 8));
    }

    draw(ctx) {
      Spr.drawSprite(ctx, Spr.SPR.fireball, this.x, this.y, false);
    }
  }

  /** 火球命中/熄灭时的小爆散 */
  class Puff extends Entity {
    constructor(game, x, y) {
      super(game, x, y, 16, 22);
      this.type = 'puff';
      this.hurtsMario = false;
      this.noClip = true;
      this.life = 16;
    }
    update() { if (--this.life <= 0) this.removed = true; }
    draw(ctx) {
      const t = 1 - this.life / 16;
      const w = 4 + t * 12, h = 6 + t * 16;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = '#ffd070';
      ctx.fillRect(Math.round(this.x + 8 - w / 2), Math.round(this.y + 16 - h), Math.round(w), Math.round(h));
      ctx.fillStyle = '#ff7820';
      ctx.fillRect(Math.round(this.x + 8 - w / 4), Math.round(this.y + 16 - h / 2), Math.round(w / 2), Math.round(h / 2));
      ctx.restore();
    }
  }

  /* =========================================================
     特效
     ========================================================= */

  /** 从问号块顶出来的金币 */
  class CoinPop extends Entity {
    constructor(game, x, y) {
      super(game, x, y, 16, 16);
      this.type = 'coinpop';
      this.hurtsMario = false;
      this.noClip = true;
      this.vy = -5.4;
      this.life = 34;
      this.anim = 0;
    }
    update() {
      this.anim++;
      this.vy += 0.42;
      this.y += this.vy;
      if (--this.life <= 0) this.removed = true;
    }
    draw(ctx) {
      const f = Math.floor(this.anim / 4) % 4;
      Spr.drawSprite(ctx, this.game.tiles.coin[f], this.x, this.y, false);
    }
  }

  /** 被顶碎的砖块碎片 */
  class Debris extends Entity {
    constructor(game, x, y, vx, vy) {
      super(game, x, y, 8, 8);
      this.type = 'debris';
      this.hurtsMario = false;
      this.noClip = true;
      this.vx = vx; this.vy = vy;
      this.rot = 0;
      this.spin = (vx > 0 ? 1 : -1) * 0.42;
    }
    update() {
      this.vy += 0.4;
      this.x += this.vx;
      this.y += this.vy;
      this.rot += this.spin;
      if (this.y > this.game.level.pitDeathY) this.removed = true;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(Math.round(this.x + 4), Math.round(this.y + 4));
      ctx.rotate(this.rot);
      ctx.fillStyle = '#c05010';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#f0a060';
      ctx.fillRect(-4, -4, 8, 2);
      ctx.fillStyle = '#6c2000';
      ctx.fillRect(-4, 2, 8, 2);
      ctx.restore();
    }
  }

  /** 分数飘字 */
  class ScorePop extends Entity {
    constructor(game, x, y, text) {
      super(game, x, y, 1, 1);
      this.type = 'scorepop';
      this.hurtsMario = false;
      this.noClip = true;
      this.text = text;
      this.life = 46;
    }
    update() {
      this.y -= 0.55;
      if (--this.life <= 0) this.removed = true;
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.life / 16);
      Spr.drawText(ctx, this.text, this.x, this.y, '#ffffff', { shadow: '#000000' });
      ctx.restore();
    }
  }

  /* ---------------- 导出 ---------------- */

  global.Ent = {
    PHYS: PHYS,
    Entity: Entity,
    Mario: Mario,
    Goomba: Goomba,
    Koopa: Koopa,
    Piranha: Piranha,
    Item: Item,
    Fireball: Fireball,
    Puff: Puff,
    CoinPop: CoinPop,
    Debris: Debris,
    ScorePop: ScorePop,
    COMBO_SCORES: COMBO_SCORES
  };

})(window);
