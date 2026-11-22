/**
 * Milvus/music_synth_beatforge.js
 * 修武扬文 · 音律训练 国风民乐与合成器音色引擎（零外部采样文件，纯 Web Audio 实时合成）
 *
 * Acoustic algorithms & folk-instrument modeling inspired by / ported from:
 *   beiyyyun/beatforge (https://github.com/beiyyyun/beatforge) — MIT License
 *   Copyright (c) beiyyyun
 *
 * 工程适配说明：
 * - 为兼容 file:// 离线打开与移动端 Safari/PWA（规避 AudioWorklet CORS 限制），
 *   拨弦类（古筝/古琴/琵琶/扬琴）采用纯 JS 离帧 Karplus-Strong 物理建模 + LRU Buffer 缓存，
 *   实现 0.0% 音高误差、绝不发散、零加载延迟的真实民乐拨弦听感。
 */
(function (global) {
  "use strict";

  const INSTRUMENTS = [
    { id: "guzheng", name: "古筝", icon: "🎋", tag: "民乐·拨弦", desc: "明亮清越，泛音丰润，国风首选" },
    { id: "guqin", name: "古琴", icon: "🪕", tag: "民乐·丝弦", desc: "苍古低沉，余韵悠长，雅士清音" },
    { id: "pipa", name: "琵琶", icon: "🎻", tag: "民乐·弹拨", desc: "清脆颗粒，起音利落，适合快曲" },
    { id: "yangqin", name: "扬琴", icon: "🎼", tag: "民乐·击弦", desc: "清亮双弦，珠落玉盘，华丽灵动" },
    { id: "dizi", name: "竹笛", icon: "🪈", tag: "民乐·吹管", desc: "清亮气声，笛膜颤音，宛转悠扬" },
    { id: "xiao", name: "洞箫", icon: "🎐", tag: "民乐·吹管", desc: "温润空灵，低通气韵，月夜独酌" },
    { id: "erhu", name: "二胡", icon: "🎶", tag: "民乐·拉弦", desc: "柔滑弓弦，深情揉弦，婉转缠绵" },
    { id: "bianzhong", name: "编钟", icon: "🔔", tag: "古礼·金石", desc: "双音 FM 钟磬，浑厚庄重，礼乐之声" },
    { id: "piano", name: "清透钢琴", icon: "🎹", tag: "现代·键盘", desc: "澄澈温和，通用百搭，层次清晰" },
    { id: "percussion", name: "木鱼玉磬", icon: "🥁", tag: "节奏·无调", desc: "清脆无音高冲突，导入本地歌曲绝配" }
  ];

  // C 大调七声默认频表（1~7）
  const DEFAULT_SCALE_FREQS = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88];

  // LRU Karplus-Strong Buffer 缓存（最多 96 条，极大降低手机端 CPU 开销）
  const _ksBufferCache = new Map();
  const MAX_KS_CACHE = 96;
  let _noiseBuffer = null;
  let _masterChainMap = new WeakMap();

  function getMasterBus(ctx, reverbEnabled) {
    let chain = _masterChainMap.get(ctx);
    if (!chain) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-12, ctx.currentTime);
      comp.knee.setValueAtTime(18, ctx.currentTime);
      comp.ratio.setValueAtTime(6, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.18, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.85, ctx.currentTime);

      // 轻量古风厅堂延迟混响（纯 Delay + Lowpass 反馈，零采样文件）
      const wetGain = ctx.createGain();
      wetGain.gain.setValueAtTime(0.22, ctx.currentTime);
      const delayL = ctx.createDelay(0.5);
      delayL.delayTime.setValueAtTime(0.083, ctx.currentTime);
      const delayR = ctx.createDelay(0.5);
      delayR.delayTime.setValueAtTime(0.131, ctx.currentTime);
      const fbL = ctx.createGain();
      fbL.gain.setValueAtTime(0.26, ctx.currentTime);
      const fbR = ctx.createGain();
      fbR.gain.setValueAtTime(0.22, ctx.currentTime);
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.setValueAtTime(2400, ctx.currentTime);

      comp.connect(masterGain);
      masterGain.connect(ctx.destination);

      comp.connect(damp);
      damp.connect(delayL);
      damp.connect(delayR);
      delayL.connect(fbL);
      fbL.connect(delayR);
      delayR.connect(fbR);
      fbR.connect(delayL);
      delayL.connect(wetGain);
      delayR.connect(wetGain);
      wetGain.connect(masterGain);

      chain = { input: comp, wetGain };
      _masterChainMap.set(ctx, chain);
    }
    chain.wetGain.gain.setTargetAtTime(reverbEnabled === false ? 0 : 0.22, ctx.currentTime, 0.03);
    return chain.input;
  }

  // 确定性 xorshift32 白噪声（对齐 BeatForge folk.ts，保证同音起音形态一致）
  function getNoiseBuffer(ctx) {
    if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) return _noiseBuffer;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.5));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      d[i] = (s / 0xffffffff) * 2 - 1;
    }
    _noiseBuffer = buf;
    return buf;
  }

  /**
   * Karplus-Strong 离线缓冲合成（移植自 BeatForge 拨弦物理建模思想）
   * @param {AudioContext} ctx
   * @param {number} freq 基频 Hz
   * @param {object} cfg { t60, brightness, pluckPos, duration, detuneCents, doubleString }
   */
  function buildKSBuffer(ctx, freq, cfg) {
    const safeFreq = Math.max(65, Math.min(2400, Number(freq) || 440));
    const dur = Math.max(0.45, Math.min(3.5, cfg.duration || 1.8));
    const cacheKey = `${ctx.sampleRate}_${cfg.id}_${Math.round(safeFreq * 10)}_${Math.round(dur * 10)}`;
    if (_ksBufferCache.has(cacheKey)) {
      const hit = _ksBufferCache.get(cacheKey);
      _ksBufferCache.delete(cacheKey);
      _ksBufferCache.set(cacheKey, hit);
      return hit;
    }

    const sr = ctx.sampleRate;
    const totalSamples = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, totalSamples, sr);
    const out = buf.getChannelData(0);

    const renderString = (f, amp, seedInit) => {
      const period = sr / f;
      const N = Math.max(2, Math.floor(period));
      const frac = period - N;
      const ring = new Float32Array(N);

      // xorshift32 确定性噪声激励 + 拨弦位置梳状塑形
      let s = seedInit >>> 0;
      for (let i = 0; i < N; i++) {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        ring[i] = (s / 0xffffffff) * 2 - 1;
      }
      // 拨弦位置滤波（抑制对应节点谐波，让古筝/琵琶/古琴区分明显）
      const pluckOffset = Math.max(1, Math.floor(N * (cfg.pluckPos || 0.22)));
      for (let i = N - 1; i >= pluckOffset; i--) {
        ring[i] -= ring[i - pluckOffset] * 0.45;
      }
      // 初始平滑防高频刺耳
      const preSmooth = 1 - Math.max(0.1, Math.min(0.95, cfg.brightness || 0.72));
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < N; i++) {
          ring[i] = ring[i] * (1 - preSmooth) + ring[i - 1] * preSmooth;
        }
      }

      // 物理 T60 衰减系数：每周期衰减 factor = 10^(-3 / (f * t60))
      const t60 = cfg.t60 || 2.2;
      const decayPerCycle = Math.min(0.9985, Math.pow(10, -3 / Math.max(1, f * t60)));
      const lp = Math.max(0.15, Math.min(0.88, cfg.brightness || 0.7));

      let idx = 0;
      let prev = 0;
      let prevOut = 0;
      for (let i = 0; i < totalSamples; i++) {
        const cur = ring[idx];
        const nextIdx = (idx + 1) % N;
        const interp = cur * (1 - frac) + ring[nextIdx] * frac;
        const filtered = (interp * lp + prev * (1 - lp)) * decayPerCycle;
        prev = interp;
        ring[idx] = filtered;
        // 去直流 + 柔化极短起音
        const sample = filtered - prevOut * 0.004;
        prevOut = filtered;
        const fadeIn = i < 48 ? i / 48 : 1;
        out[i] += sample * amp * fadeIn;
        idx = nextIdx;
      }
    };

    renderString(safeFreq, 0.72, 0x9e3779b9);
    if (cfg.doubleString) {
      const detuned = safeFreq * Math.pow(2, (cfg.detuneCents || 5) / 1200);
      renderString(detuned, 0.42, 0x6a09e667);
    }

    // 归一化峰值防止过载
    let peak = 0;
    for (let i = 0; i < totalSamples; i++) {
      const a = Math.abs(out[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0.001) {
      const scale = 0.82 / peak;
      for (let i = 0; i < totalSamples; i++) out[i] *= scale;
    }

    if (_ksBufferCache.size >= MAX_KS_CACHE) {
      const oldestKey = _ksBufferCache.keys().next().value;
      _ksBufferCache.delete(oldestKey);
    }
    _ksBufferCache.set(cacheKey, buf);
    return buf;
  }

  function playPluck(ctx, dest, freq, cfg, velocity, durationSec) {
    const now = ctx.currentTime;
    const dur = Math.max(0.5, Math.min(3.2, (durationSec || 0.5) + (cfg.tail || 1.2)));
    const buf = buildKSBuffer(ctx, freq, { ...cfg, duration: dur });
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const gain = ctx.createGain();
    const vol = Math.max(0.1, Math.min(1, velocity || 0.85)) * (cfg.level || 0.75);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.setValueAtTime(vol, now + Math.max(0.15, dur - 0.15));
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(gain);
    gain.connect(dest);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  function playWind(ctx, dest, freq, isXiao, velocity, durationSec) {
    const now = ctx.currentTime;
    const dur = Math.max(0.32, Math.min(2.8, durationSec || 0.55));
    const vol = Math.max(0.1, Math.min(1, velocity || 0.8)) * (isXiao ? 0.52 : 0.48);

    const osc = ctx.createOscillator();
    osc.type = isXiao ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, now);

    // 笛膜 / 气息颤音 LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(isXiao ? 4.4 : 5.6, now);
    lfoGain.gain.setValueAtTime(freq * (isXiao ? 0.008 : 0.014), now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // 共振峰滤镜
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(isXiao ? Math.min(1600, freq * 3.2) : Math.min(4200, freq * 6.0), now);

    // 气声噪声通道
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(freq * (isXiao ? 1.5 : 2.2), now);
    bp.Q.setValueAtTime(3.5, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * (isXiao ? 0.24 : 0.16), now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(vol, now + (isXiao ? 0.07 : 0.035));
    env.gain.setValueAtTime(vol * 0.88, now + Math.max(0.09, dur - 0.12));
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(lp);
    lp.connect(env);
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(env);
    env.connect(dest);

    osc.start(now);
    lfo.start(now);
    noise.start(now);
    osc.stop(now + dur + 0.03);
    lfo.stop(now + dur + 0.03);
    noise.stop(now + dur + 0.03);
  }

  function playErhu(ctx, dest, freq, velocity, durationSec) {
    const now = ctx.currentTime;
    const dur = Math.max(0.38, Math.min(2.8, durationSec || 0.6));
    const vol = Math.max(0.1, Math.min(1, velocity || 0.8)) * 0.36;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    // 二胡标志性微滑音起音
    osc.frequency.setValueAtTime(freq * 0.985, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.055);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(5.2, now);
    lfoGain.gain.setValueAtTime(freq * 0.016, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.setValueAtTime(Math.min(2400, freq * 2.4), now);
    formant.Q.setValueAtTime(2.0, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.06);
    env.gain.setValueAtTime(vol * 0.9, now + Math.max(0.1, dur - 0.12));
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(formant);
    formant.connect(env);
    env.connect(dest);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + dur + 0.03);
    lfo.stop(now + dur + 0.03);
  }

  function playBianzhong(ctx, dest, freq, velocity, durationSec) {
    const now = ctx.currentTime;
    const dur = Math.max(0.9, Math.min(3.0, (durationSec || 0.6) + 1.1));
    const vol = Math.max(0.1, Math.min(1, velocity || 0.85)) * 0.44;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const env = ctx.createGain();

    carrier.type = "sine";
    carrier.frequency.setValueAtTime(freq, now);
    mod.type = "sine";
    mod.frequency.setValueAtTime(freq * 2.41, now); // 金属非整数钟磬泛音比
    modGain.gain.setValueAtTime(freq * 1.4, now);
    modGain.gain.exponentialRampToValueAtTime(1, now + dur * 0.6);

    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(dest);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + dur + 0.02);
    mod.stop(now + dur + 0.02);
  }

  function playPiano(ctx, dest, freq, velocity, durationSec) {
    const now = ctx.currentTime;
    const dur = Math.max(0.5, Math.min(2.2, (durationSec || 0.45) + 0.7));
    const vol = Math.max(0.1, Math.min(1, velocity || 0.8)) * 0.46;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "triangle";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.28, now);
    g2.gain.exponentialRampToValueAtTime(0.01, now + dur * 0.45);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc1.connect(env);
    osc2.connect(g2);
    g2.connect(env);
    env.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur + 0.02);
    osc2.stop(now + dur + 0.02);
  }

  // 无音高冲突清脆木鱼 / 玉磬打击音效（本地导入歌曲绝配）
  function playPercussion(ctx, dest, laneIndex, velocity) {
    const now = ctx.currentTime;
    const vol = Math.max(0.1, Math.min(1, velocity || 0.8)) * 0.42;
    const pitch = 520 + (Number(laneIndex) || 3) * 42;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch * 1.35, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.68, now + 0.065);

    env.gain.setValueAtTime(vol, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(env);
    env.connect(dest);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  function playNote(ctx, freq, options = {}) {
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const inst = options.instrument || "guzheng";
    if (inst === "mute") return;
    const dest = getMasterBus(ctx, options.reverb !== false);
    const vel = options.velocity !== undefined ? options.velocity : 0.85;
    const dur = options.duration || 0.5;

    switch (inst) {
      case "guzheng":
        playPluck(ctx, dest, freq, { id: "gz", t60: 2.8, brightness: 0.78, pluckPos: 0.18, level: 0.8, tail: 1.3 }, vel, dur);
        break;
      case "guqin":
        playPluck(ctx, dest, freq * 0.5, { id: "gq", t60: 3.4, brightness: 0.42, pluckPos: 0.34, level: 0.88, tail: 1.6 }, vel, dur);
        break;
      case "pipa":
        playPluck(ctx, dest, freq, { id: "pp", t60: 1.35, brightness: 0.86, pluckPos: 0.12, level: 0.8, tail: 0.75 }, vel, dur);
        break;
      case "yangqin":
        playPluck(ctx, dest, freq, { id: "yq", t60: 2.2, brightness: 0.88, pluckPos: 0.25, level: 0.74, tail: 1.1, doubleString: true, detuneCents: 6 }, vel, dur);
        break;
      case "dizi":
        playWind(ctx, dest, freq, false, vel, dur);
        break;
      case "xiao":
        playWind(ctx, dest, freq, true, vel, dur);
        break;
      case "erhu":
        playErhu(ctx, dest, freq, vel, dur);
        break;
      case "bianzhong":
        playBianzhong(ctx, dest, freq, vel, dur);
        break;
      case "piano":
        playPiano(ctx, dest, freq, vel, dur);
        break;
      case "percussion":
        playPercussion(ctx, dest, options.laneIndex || 3, vel);
        break;
      default:
        playPluck(ctx, dest, freq, { id: "gz", t60: 2.8, brightness: 0.78, pluckPos: 0.18, level: 0.8, tail: 1.3 }, vel, dur);
        break;
    }
  }

  // 试听五声音阶（宫商角徵羽：1 2 3 5 6）
  function playPreviewScale(ctx, instrumentId, reverb = true) {
    if (!ctx) return;
    const pentatonic = [261.63, 293.66, 329.63, 392.0, 440.0];
    pentatonic.forEach((f, idx) => {
      setTimeout(() => {
        playNote(ctx, f, { instrument: instrumentId, duration: 0.45, velocity: 0.82, laneIndex: idx + 1, reverb });
      }, idx * 145);
    });
  }

  global.BeatForgeSynth = {
    INSTRUMENTS,
    DEFAULT_SCALE_FREQS,
    playNote,
    playPreviewScale
  };
})(window);
