/* ============================================================
   audio.js —— 纯 Web Audio 合成音效 + 原创 8-bit 背景音乐
   不依赖任何外部音频文件；第一次用户交互时解锁 AudioContext。
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 工具 ---------- */

  // MIDI 音高 -> 频率
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // 用傅里叶级数合成 NES 风格的脉冲波（duty = 占空比 0.125 / 0.25 / 0.5）
  function makePulseWave(ctx, duty) {
    const N = 32;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let i = 1; i < N; i++) {
      imag[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
    }
    try {
      return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch (e) {
      return null;
    }
  }

  /* ---------- 音乐轨道（全部为原创旋律） ----------
     每个 step 是 1 个八分音符；0 表示休止。             */

  const TRACKS = {

    // 地上关：明快的大调循环
    overworld: {
      bpm: 152, leadDuty: 0.25, leadGain: 0.085, bassGain: 0.16,
      lead: [
        72, 0, 76, 0, 79, 0, 76, 0,
        74, 0, 77, 0, 81, 0, 77, 0,
        76, 0, 79, 0, 83, 0, 79, 0,
        84, 83, 81, 79, 77, 76, 74, 72,
        72, 74, 76, 77, 79, 76, 72, 0,
        74, 76, 77, 79, 81, 79, 77, 0,
        76, 77, 79, 81, 83, 81, 79, 0,
        84, 0, 79, 0, 72, 0, 0, 0
      ],
      bass: [
        36, 0, 43, 0, 36, 0, 43, 0,
        41, 0, 48, 0, 41, 0, 48, 0,
        43, 0, 50, 0, 43, 0, 50, 0,
        36, 0, 43, 0, 36, 0, 43, 0,
        45, 0, 52, 0, 45, 0, 52, 0,
        41, 0, 48, 0, 41, 0, 48, 0,
        43, 0, 50, 0, 43, 0, 50, 0,
        36, 0, 43, 0, 36, 0, 48, 0
      ],
      drum: [
        2, 0, 1, 0, 2, 0, 1, 0,
        2, 0, 1, 0, 2, 0, 1, 1,
        2, 0, 1, 0, 2, 0, 1, 0,
        2, 0, 1, 0, 2, 1, 1, 1,
        2, 0, 1, 0, 2, 0, 1, 0,
        2, 0, 1, 0, 2, 0, 1, 1,
        2, 0, 1, 0, 2, 0, 1, 0,
        2, 0, 1, 0, 2, 1, 2, 2
      ]
    },

    // 地下关：低沉、稀疏、小调
    underground: {
      bpm: 128, leadDuty: 0.125, leadGain: 0.075, bassGain: 0.15,
      lead: [
        57, 0, 0, 0, 60, 0, 0, 0,
        62, 0, 0, 0, 60, 0, 0, 0,
        57, 0, 0, 0, 55, 0, 0, 0,
        53, 0, 0, 0, 0, 0, 0, 0,
        57, 0, 0, 0, 60, 0, 0, 0,
        63, 0, 0, 0, 62, 0, 0, 0,
        60, 0, 0, 0, 57, 0, 0, 0,
        55, 0, 0, 0, 52, 0, 0, 0
      ],
      bass: [
        33, 0, 0, 0, 33, 0, 0, 0,
        29, 0, 0, 0, 29, 0, 0, 0,
        31, 0, 0, 0, 31, 0, 0, 0,
        33, 0, 0, 0, 33, 0, 0, 0,
        33, 0, 0, 0, 33, 0, 0, 0,
        36, 0, 0, 0, 36, 0, 0, 0,
        31, 0, 0, 0, 31, 0, 0, 0,
        28, 0, 0, 0, 28, 0, 0, 0
      ],
      drum: [
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 0,
        3, 0, 0, 0, 0, 0, 1, 1
      ]
    },

    // 空中关：跳跃感强、节奏更快
    sky: {
      bpm: 168, leadDuty: 0.5, leadGain: 0.075, bassGain: 0.15,
      lead: [
        79, 0, 79, 0, 76, 0, 79, 0,
        81, 0, 81, 0, 77, 0, 81, 0,
        83, 0, 83, 0, 79, 0, 83, 0,
        84, 82, 80, 78, 76, 74, 72, 71,
        72, 0, 76, 0, 79, 0, 84, 0,
        83, 0, 79, 0, 76, 0, 72, 0,
        74, 0, 77, 0, 81, 0, 86, 0,
        84, 0, 79, 0, 72, 0, 0, 0
      ],
      bass: [
        36, 0, 43, 0, 36, 0, 43, 0,
        41, 0, 48, 0, 41, 0, 48, 0,
        43, 0, 50, 0, 43, 0, 50, 0,
        36, 0, 43, 0, 36, 0, 43, 0,
        36, 0, 43, 0, 36, 0, 43, 0,
        41, 0, 48, 0, 41, 0, 48, 0,
        43, 0, 50, 0, 43, 0, 50, 0,
        36, 0, 43, 0, 36, 0, 48, 0
      ],
      drum: [
        2, 1, 1, 0, 2, 1, 1, 0,
        2, 1, 1, 0, 2, 1, 1, 0,
        2, 1, 1, 0, 2, 1, 1, 0,
        2, 1, 1, 1, 1, 1, 1, 1,
        2, 1, 1, 0, 2, 1, 1, 0,
        2, 1, 1, 0, 2, 1, 1, 0,
        2, 1, 1, 0, 2, 1, 1, 0,
        2, 1, 1, 1, 1, 1, 2, 2
      ]
    },

    // 无敌星：狂躁高速循环
    star: {
      bpm: 210, leadDuty: 0.125, leadGain: 0.07, bassGain: 0.14,
      lead: [
        84, 0, 84, 0, 84, 0, 84, 0,
        83, 0, 84, 0, 86, 0, 84, 0,
        81, 0, 81, 0, 81, 0, 81, 0,
        79, 0, 81, 0, 83, 0, 79, 0
      ],
      bass: [
        36, 0, 36, 0, 36, 0, 36, 0,
        35, 0, 36, 0, 38, 0, 36, 0,
        33, 0, 33, 0, 33, 0, 33, 0,
        31, 0, 33, 0, 35, 0, 31, 0
      ],
      drum: [2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 2]
    }
  };

  /* ---------- 音效定义 ---------- */

  const SFX = {
    // 跳跃：方波上滑
    jump:      { kind: 'slide', from: 300, to: 880, dur: 0.16, type: 'square', gain: 0.16 },
    // 大跳
    jumpBig:   { kind: 'slide', from: 260, to: 1080, dur: 0.22, type: 'square', gain: 0.17 },
    // 顶砖块（没顶碎）
    bump:      { kind: 'slide', from: 220, to: 90, dur: 0.09, type: 'square', gain: 0.2 },
    // 金币
    coin:      { kind: 'seq', notes: [[988, 0, 0.07], [1319, 0.07, 0.30]], type: 'square', gain: 0.15 },
    // 踩敌人
    stomp:     { kind: 'stomp' },
    // 砖块碎裂
    brick:     { kind: 'noise', dur: 0.22, gain: 0.22, freq: 2200, q: 0.6 },
    // 吃到道具（变身）
    powerup:   { kind: 'arp', notes: [523, 659, 784, 1047, 1319, 1568], step: 0.045, dur: 0.1, type: 'square', gain: 0.15 },
    // 道具出现
    appear:    { kind: 'arp', notes: [392, 523, 659, 784], step: 0.06, dur: 0.12, type: 'triangle', gain: 0.16 },
    // 发射火球
    fireball:  { kind: 'slide', from: 900, to: 180, dur: 0.14, type: 'sawtooth', gain: 0.11 },
    // 敌人被火球/龟壳干掉
    kick:      { kind: 'slide', from: 500, to: 120, dur: 0.16, type: 'square', gain: 0.16 },
    // 马里奥受伤缩小
    shrink:    { kind: 'arp', notes: [784, 660, 550, 440, 330], step: 0.055, dur: 0.09, type: 'square', gain: 0.15 },
    // 死亡
    die:       { kind: 'jingle', notes: [[660, 0, .12], [660, .13, .12], [0, .28, .08], [520, .38, .12], [660, .52, .12], [784, .66, .3], [0, .99, .1], [520, 1.05, .5]], type: 'square', gain: 0.17 },
    // 1UP
    oneup:     { kind: 'jingle', notes: [[659, 0, .1], [784, .1, .1], [659, .2, .1], [523, .3, .1], [587, .4, .1], [784, .5, .35]], type: 'square', gain: 0.16 },
    // 通关小号角
    clear:     { kind: 'jingle', notes: [[523, 0, .14], [659, .15, .14], [784, .3, .14], [1047, .45, .2], [784, .68, .14], [880, .83, .14], [1047, 1.0, .5]], type: 'square', gain: 0.17 },
    // 降旗
    flag:      { kind: 'arp', notes: [1568, 1397, 1319, 1175, 1047, 988, 880, 784, 698, 659], step: 0.05, dur: 0.07, type: 'triangle', gain: 0.14 },
    // 掉进管道 / 进城堡
    pipe:      { kind: 'slide', from: 700, to: 100, dur: 0.4, type: 'triangle', gain: 0.18 },
    // 暂停
    pause:     { kind: 'seq', notes: [[880, 0, 0.06], [660, 0.06, 0.1]], type: 'square', gain: 0.12 },
    // 菜单确认
    select:    { kind: 'seq', notes: [[660, 0, 0.05], [990, 0.06, 0.12]], type: 'square', gain: 0.13 },
    // 时间不够警告
    hurry:     { kind: 'arp', notes: [1047, 1047, 1047], step: 0.16, dur: 0.1, type: 'square', gain: 0.16 },
    // 游戏结束
    gameover:  { kind: 'jingle', notes: [[392, 0, .2], [370, .22, .2], [349, .44, .2], [330, .66, .7]], type: 'triangle', gain: 0.2 }
  };

  /* ---------- 主对象 ---------- */

  const Sound = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    noiseBuf: null,
    waves: {},
    ready: false,
    muted: false,

    _trackName: null,
    _track: null,
    _step: 0,
    _nextTime: 0,
    _stepDur: 0.2,
    _starPending: null,

    /* --- 初始化（必须在用户手势中调用） --- */
    init: function () {
      if (this.ready) {
        this.resume();
        return true;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
      } catch (e) {
        return false;
      }
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(ctx.destination);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.55;
      this.musicBus.connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.95;
      this.sfxBus.connect(this.master);

      this.waves.pulse12 = makePulseWave(ctx, 0.125);
      this.waves.pulse25 = makePulseWave(ctx, 0.25);
      this.waves.pulse50 = makePulseWave(ctx, 0.5);

      // 白噪声缓冲（鼓 / 碎砖）
      const len = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.ready = true;
      this.resume();
      return true;
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted: function (m) {
      this.muted = !!m;
      if (this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
      }
    },

    toggleMute: function () {
      this.setMuted(!this.muted);
      return this.muted;
    },

    /* --- 基础发声原语 --- */

    _env: function (bus, t, dur, gain) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus || this.sfxBus);
      return g;
    },

    _tone: function (freq, t, dur, type, gain, bus, duty) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      if (duty && this.waves[duty]) o.setPeriodicWave(this.waves[duty]);
      else o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      const g = this._env(bus, t, dur, gain);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.03);
      return o;
    },

    _slideNote: function (f0, f1, t, dur, type, gain) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur * 0.9);
      const g = this._env(this.sfxBus, t, dur, gain);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.03);
    },

    _noise: function (t, dur, gain, freq, q) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq || 1500;
      bp.Q.value = q || 1;
      const g = this._env(this.sfxBus, t, dur, gain);
      src.connect(bp); bp.connect(g);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    /* --- 播放音效 --- */
    play: function (name) {
      if (!this.ready) return;
      if (this.ctx.state === 'suspended') return;
      const s = SFX[name];
      if (!s) return;
      const t = this.ctx.currentTime + 0.001;
      const bus = this.sfxBus;

      switch (s.kind) {
        case 'slide':
          this._slideNote(s.from, s.to, t, s.dur, s.type, s.gain);
          break;

        case 'seq':
          for (let i = 0; i < s.notes.length; i++) {
            const n = s.notes[i];
            this._tone(n[0], t + n[1], n[2], s.type, s.gain, bus);
          }
          break;

        case 'arp':
          for (let i = 0; i < s.notes.length; i++) {
            this._tone(s.notes[i], t + i * s.step, s.dur, s.type, s.gain, bus);
          }
          break;

        case 'jingle':
          for (let i = 0; i < s.notes.length; i++) {
            const n = s.notes[i];
            if (n[0] > 0) this._tone(midi(n[0]), t + n[1], n[2], s.type, s.gain, bus);
          }
          break;

        case 'noise':
          this._noise(t, s.dur, s.gain, s.freq, s.q);
          this._slideNote(320, 80, t, s.dur * 0.7, 'square', s.gain * 0.6);
          break;

        case 'stomp':
          this._noise(t, 0.09, 0.14, 900, 0.8);
          this._slideNote(600, 140, t, 0.12, 'square', 0.16);
          break;
      }
    },

    /* --- 背景音乐 --- */

    playMusic: function (name) {
      if (!this.ready) return;
      if (this._trackName === name) return;
      const tr = TRACKS[name];
      if (!tr) { this.stopMusic(); return; }
      this._trackName = name;
      this._track = tr;
      this._step = 0;
      this._stepDur = 60 / tr.bpm / 2;   // 八分音符
      this._nextTime = this.ctx.currentTime + 0.06;
    },

    stopMusic: function () {
      this._trackName = null;
      this._track = null;
    },

    /** 每帧调用：提前 0.3 秒排程音符 */
    update: function () {
      if (!this.ready || !this._track || this.ctx.state === 'suspended') return;
      const ctx = this.ctx;
      const tr = this._track;
      const dur = this._stepDur;
      const horizon = ctx.currentTime + 0.3;
      let guard = 0;
      while (this._nextTime < horizon && guard++ < 64) {
        const i = this._step % tr.lead.length;
        const t = this._nextTime;

        // 主旋律
        const ln = tr.lead[i];
        if (ln) {
          const o = ctx.createOscillator();
          if (this.waves.pulse25) o.setPeriodicWave(this.waves[tr.leadDuty === 0.125 ? 'pulse12' : (tr.leadDuty === 0.5 ? 'pulse50' : 'pulse25')]);
          else o.type = 'square';
          o.frequency.setValueAtTime(midi(ln), t);
          const g = this._env(this.musicBus, t, dur * 0.92, tr.leadGain);
          o.connect(g);
          o.start(t);
          o.stop(t + dur + 0.02);
        }

        // 低音
        const bn = tr.bass[i];
        if (bn) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.setValueAtTime(midi(bn), t);
          const g = this._env(this.musicBus, t, dur * 1.7, tr.bassGain);
          o.connect(g);
          o.start(t);
          o.stop(t + dur * 1.8 + 0.02);
        }

        // 打击
        const dn = tr.drum[i];
        if (dn === 1) {                       // 踩镲
          this._noiseOn(this.musicBus, t, 0.035, 0.055, 7000, 0.7);
        } else if (dn === 2) {                // 底鼓
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(150, t);
          o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
          const g = this._env(this.musicBus, t, 0.11, 0.3);
          o.connect(g);
          o.start(t); o.stop(t + 0.14);
        } else if (dn === 3) {                // 低音鼓（地下）
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(110, t);
          o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
          const g = this._env(this.musicBus, t, 0.16, 0.34);
          o.connect(g);
          o.start(t); o.stop(t + 0.2);
        }

        this._nextTime += dur;
        this._step++;
      }
    },

    _noiseOn: function (bus, t, dur, gain, freq, q) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = freq || 6000;
      const g = this._env(bus, t, dur, gain);
      src.connect(bp); bp.connect(g);
      src.start(t);
      src.stop(t + dur + 0.01);
    }
  };

  global.Sound = Sound;

})(window);
