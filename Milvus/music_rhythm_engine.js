/**
 * Milvus/music_rhythm_engine.js
 * 修武扬文 · 音律训练 独立增强引擎（Phase 0）
 * 职责：
 *  1. 持久化偏好管理（音色、本地歌曲击打音效、采谱难度、音画偏移校准、厅堂混响）
 *  2. 升级版自适应多频段音频采谱器（analyzeAudioToChartV2：20ms Onset Flux + 滑动局部阈值 + ZCR 音高分轨 + 真实延音防重叠 + 1.8s Lead-in）
 *  3. 音律训练顶栏扩展按钮 + BeatForge 音色试听弹窗 + 调校/暂停设置抽屉
 */
(function (global) {
  "use strict";

  const PREFS_KEY = "milvus_music_rhythm_prefs_v1";
  const LEAD_IN_SEC = 1.8;
  const NOTE_SPEED = 250;

  const DEFAULT_PREFS = {
    instrument: "guzheng",
    customAudioSfx: "percussion", // "percussion" | "same" | "mute"
    difficulty: "normal",         // "easy" | "normal" | "hard"
    offsetMs: 0,                  // -150 ~ +150
    reverb: true
  };

  function getPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return { ...DEFAULT_PREFS, ...(saved && typeof saved === "object" ? saved : {}) };
    } catch (e) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(patch) {
    const next = { ...getPrefs(), ...(patch || {}) };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      global.dispatchEvent(new CustomEvent("music-rhythm-prefs-changed", { detail: next }));
    } catch (e) {}
    return next;
  }

  /**
   * 统一游戏发声入口（自动区分自定义本地歌 vs 默认/简谱演奏）
   */
  function playGameTone(ctx, laneIndex, options = {}) {
    if (!ctx || !global.BeatForgeSynth) return;
    const prefs = getPrefs();
    const isCustomAudio = Boolean(options.isCustomAudio);
    let inst = prefs.instrument || "guzheng";
    if (isCustomAudio) {
      if (prefs.customAudioSfx === "mute") return;
      if (prefs.customAudioSfx === "percussion") inst = "percussion";
    }
    const freqs = global.BeatForgeSynth.DEFAULT_SCALE_FREQS;
    const freq = Number(options.freq) || freqs[laneIndex] || 440;
    global.BeatForgeSynth.playNote(ctx, freq, {
      instrument: inst,
      duration: options.durationSec || 0.45,
      velocity: options.velocity || 0.85,
      laneIndex,
      reverb: prefs.reverb !== false
    });
  }

  /**
   * 升级版自适应音频采谱器（彻底修复静态全局阈值、无音高映射、随机瞎出长按与开头飞过判定线）
   */
  function analyzeAudioToChartV2(buffer, customOpts = {}) {
    const prefs = getPrefs();
    const diff = customOpts.difficulty || prefs.difficulty || "normal";
    const diffCfg =
      diff === "easy"
        ? { sens: 1.55, minGap: 0.32, maxHoldChance: 0.25 }
        : diff === "hard"
        ? { sens: 1.16, minGap: 0.14, maxHoldChance: 0.45 }
        : { sens: 1.32, minGap: 0.21, maxHoldChance: 0.35 };

    const sr = buffer.sampleRate;
    const len = buffer.length;
    const numCh = buffer.numberOfChannels || 1;
    const ch0 = buffer.getChannelData(0);
    const ch1 = numCh > 1 ? buffer.getChannelData(1) : null;

    // 1. 立体声合并 + 20ms 帧计算 RMS 能量与过零率（ZCR 估算明暗/音高趋势）
    const hopSec = 0.02;
    const frameSize = Math.max(64, Math.floor(sr * hopSec));
    const frameCount = Math.floor(len / frameSize);
    const rms = new Float32Array(frameCount);
    const zcr = new Float32Array(frameCount);

    for (let f = 0; f < frameCount; f++) {
      const start = f * frameSize;
      let sumSq = 0;
      let crossings = 0;
      let prevSample = 0;
      for (let j = 0; j < frameSize; j++) {
        const s = ch1 ? (ch0[start + j] + ch1[start + j]) * 0.5 : ch0[start + j];
        sumSq += s * s;
        if (j > 0 && ((s >= 0 && prevSample < 0) || (s < 0 && prevSample >= 0))) {
          crossings++;
        }
        prevSample = s;
      }
      rms[f] = Math.sqrt(sumSq / frameSize);
      zcr[f] = crossings / frameSize;
    }

    // 2. 一阶正能量差分（Half-Wave Rectified Onset Flux）
    const flux = new Float32Array(frameCount);
    for (let f = 1; f < frameCount; f++) {
      const d = rms[f] - rms[f - 1];
      flux[f] = d > 0 ? d : 0;
    }

    // 3. 滑动局部均值（前后 1.5 秒 = 75 帧）自适应寻峰
    const halfWin = 38;
    const rawOnsets = [];
    for (let f = 2; f < frameCount - 2; f++) {
      const wStart = Math.max(0, f - halfWin);
      const wEnd = Math.min(frameCount - 1, f + halfWin);
      let localFluxSum = 0;
      let localRmsSum = 0;
      for (let k = wStart; k <= wEnd; k++) {
        localFluxSum += flux[k];
        localRmsSum += rms[k];
      }
      const wLen = wEnd - wStart + 1;
      const localFluxMean = localFluxSum / wLen;
      const localRmsMean = localRmsSum / wLen;

      // 过滤纯静音底噪段
      if (rms[f] < Math.max(0.012, localRmsMean * 0.85)) continue;
      if (
        flux[f] > Math.max(0.006, localFluxMean * diffCfg.sens) &&
        flux[f] >= flux[f - 1] &&
        flux[f] > flux[f + 1]
      ) {
        const t = f * hopSec;
        if (rawOnsets.length > 0 && t - rawOnsets[rawOnsets.length - 1].rawTime < diffCfg.minGap) {
          continue;
        }
        rawOnsets.push({
          frame: f,
          rawTime: t,
          energy: rms[f],
          zcr: zcr[f]
        });
      }
    }

    // 4. 计算 ZCR 分位范围，平滑映射到 0..6 音轨（贴合旋律高低起伏，避免左右乱飞）
    const zcrSorted = rawOnsets.map((o) => o.zcr).sort((a, b) => a - b);
    const zMin = zcrSorted.length > 4 ? zcrSorted[Math.floor(zcrSorted.length * 0.08)] : 0.02;
    const zMax = zcrSorted.length > 4 ? zcrSorted[Math.floor(zcrSorted.length * 0.92)] : 0.25;
    const zSpan = Math.max(0.01, zMax - zMin);

    let prevLane = 3;
    const notes = [];
    for (let i = 0; i < rawOnsets.length; i++) {
      const cur = rawOnsets[i];
      const next = rawOnsets[i + 1];
      const normPitch = Math.max(0, Math.min(1, (cur.zcr - zMin) / zSpan));
      let targetLane = Math.round(normPitch * 6);
      // 短间隔内限制最大跨度为 2 轨，让手部移动有乐感且顺手
      if (i > 0 && cur.rawTime - rawOnsets[i - 1].rawTime < 0.35) {
        const delta = targetLane - prevLane;
        if (Math.abs(delta) > 2) {
          targetLane = prevLane + Math.sign(delta) * 2;
        }
      }
      targetLane = Math.max(0, Math.min(6, targetLane));
      prevLane = targetLane;

      // 5. 真实延音判定 + 防重叠安全间隙
      let sustainSec = 0;
      const sustainThresh = cur.energy * 0.55;
      for (let k = cur.frame + 1; k < Math.min(frameCount, cur.frame + 85); k++) {
        if (rms[k] >= sustainThresh) sustainSec += hopSec;
        else break;
      }
      const gapToNext = next ? next.rawTime - cur.rawTime : 2.0;
      const canHold = sustainSec >= 0.45 && gapToNext >= sustainSec + 0.25;
      const holdDur = canHold ? Math.min(1.4, Math.min(sustainSec, gapToNext - 0.25)) : 0;

      notes.push({
        id: Math.random(),
        time: cur.rawTime + LEAD_IN_SEC, // 统一加上 1.8s Lead-in 缓冲
        lane: targetLane,
        type: canHold ? "hold" : "tap",
        durationSec: canHold ? holdDur : 0,
        length: canHold ? Math.max(70, Math.round(holdDur * NOTE_SPEED)) : 0,
        hit: false,
        headHit: false,
        missed: false,
        isBeingHeld: false,
        x: -1000
      });
    }

    return notes;
  }

  // ==========================================
  // 2.5 数字简谱解析器与公版古风曲库（Phase 1）
  // ==========================================
  const JIANPU_LIB_KEY = "milvus_music_jianpu_library_v1";

  const KEY_TO_ROOT_MIDI = {
    C: 60, "C#": 61, Db: 61, D: 62, "D#": 63, Eb: 63,
    E: 64, F: 65, "F#": 66, Gb: 66, G: 67, "G#": 68,
    Ab: 68, A: 69, "A#": 70, Bb: 70, B: 71
  };
  const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]; // 1 2 3 4 5 6 7

  const BUILTIN_JIANPU_SONGS = [
    {
      id: "builtin_molihua",
      builtin: true,
      title: "茉莉花",
      bpm: 96,
      key: "C",
      instrument: "guzheng",
      notation: `@title 茉莉花
@bpm 96
@key C
@instrument guzheng
3 (35) (61') (1'6) | 5 (56) 5 - |
3 (35) (61') (1'6) | 5 (56) 5 - |
5 5 5 (35) | 6 6 5 - |
3 (23) 5 (32) | 1 (12) 1 - |
(32) (12) 3 (56) | 5 (32) 3 - |
2 (35) (23) (16,) | 5, - 6, 1 | 2 (32) 1 - |`
    },
    {
      id: "builtin_songbie",
      builtin: true,
      title: "送别",
      bpm: 84,
      key: "C",
      instrument: "xiao",
      notation: `@title 送别
@bpm 84
@key C
@instrument xiao
5 (35) 1' - | 6 1' 5 - | 5 (12) 3 (21) | 2 - - 0 |
5 (35) 1' 7 | 6 1' 5 - | 5 (23) 4 7, | 1 - - 0 |
6 1' 1' - | 7 (67) 1' - | (67) (1'6) (65) (31) | 2 - - 0 |
5 (35) 1' 7 | 6 1' 5 - | 5 (23) 4 7, | 1 - - 0 |`
    },
    {
      id: "builtin_yangguan",
      builtin: true,
      title: "阳关三叠·引",
      bpm: 78,
      key: "D",
      instrument: "guqin",
      notation: `@title 阳关三叠·引
@bpm 78
@key D
@instrument guqin
1 2 3 5 | 6 5 3 2 | 1 2 3 - |
5 6 1' 6 | 5 3 2 1 | 2 3 5 - |
6 1' 2' 1' | 6 5 3 2 | 1 (23) 2 1 | 6, 1 1 - |`
    },
    {
      id: "builtin_lanting",
      builtin: true,
      title: "兰亭小调",
      bpm: 108,
      key: "G",
      instrument: "pipa",
      notation: `@title 兰亭小调
@bpm 108
@key G
@instrument pipa
[15] (23) 5 (65) | 3 (21) 2 - |
[36] (56) 1' (65) | 3 (53) 2 - |
(12) (35) 6 (53) | (23) (53) 2 1 |
[15] (6,1) (23) 5 | 3 2 1 - |`
    }
  ];

  function loadCustomJianpuSongs() {
    try {
      const arr = JSON.parse(localStorage.getItem(JIANPU_LIB_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomJianpuSongs(arr) {
    try {
      localStorage.setItem(JIANPU_LIB_KEY, JSON.stringify((arr || []).slice(0, 40)));
    } catch (e) {}
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function parseSingleNoteAtom(atom, rootMidi) {
    // 匹配：[前置高低八度^.] [升降#b] [0-7] [后置高低八度'*,] [附点.] [减时/]
    const m = atom.match(/^([\^\.]*)([#b]?)([0-7])(['*,]*)(\.*)(\/*)$/);
    if (!m) return null;
    const [, preOct, acc, degStr, postOct, dots, slashes] = m;
    const deg = Number(degStr);
    let octave = 0;
    for (const ch of preOct) {
      if (ch === "^") octave += 1;
      else if (ch === ".") octave -= 1;
    }
    for (const ch of postOct) {
      if (ch === "'" || ch === "*") octave += 1;
      else if (ch === ",") octave -= 1;
    }
    let beats = 1;
    if (slashes.length > 0) beats = beats / Math.pow(2, slashes.length);
    if (dots.length > 0) beats = beats * 1.5;

    if (deg === 0) {
      return { isRest: true, beats };
    }
    let semitone = DEGREE_SEMITONES[deg - 1] || 0;
    if (acc === "#") semitone += 1;
    else if (acc === "b") semitone -= 1;
    const midi = rootMidi + semitone + octave * 12;
    return {
      isRest: false,
      lane: deg - 1, // 0..6 对应 1..7 轨
      octave,
      midi,
      freq: Number(midiToFreq(midi).toFixed(2)),
      beats
    };
  }

  /**
   * 宽容容错数字简谱解析器：将简谱文本转化为可直接游玩的 7 轨谱面
   */
  function parseJianpuToChart(rawText, options = {}) {
    const lines = String(rawText || "").split(/\r?\n/);
    let title = options.title || "自定简谱";
    let bpm = Number(options.bpm) || 96;
    let key = String(options.key || "C").trim();
    let instrument = String(options.instrument || "").trim();
    const speedRate = Math.max(0.5, Math.min(2.0, Number(options.speedRate) || 1.0));

    const bodyLines = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("@title")) {
        const v = line.replace(/^@title[:：\s]*/i, "").trim();
        if (v) title = v;
      } else if (line.startsWith("@bpm")) {
        const v = parseFloat(line.replace(/^@bpm[:：\s]*/i, ""));
        if (v >= 30 && v <= 260) bpm = v;
      } else if (line.startsWith("@key")) {
        const v = line.replace(/^@key[:：\s]*/i, "").trim();
        if (KEY_TO_ROOT_MIDI[v]) key = v;
      } else if (line.startsWith("@instrument")) {
        const v = line.replace(/^@instrument[:：\s]*/i, "").trim();
        if (v) instrument = v;
      } else if (!line.startsWith("//") && !line.startsWith("# ")) {
        bodyLines.push(line);
      }
    }

    const rootMidi = KEY_TO_ROOT_MIDI[key] || 60;
    const beatSec = (60 / Math.max(30, bpm)) / speedRate;
    const body = bodyLines.join(" ").replace(/\|/g, " ");

    // 词法切分：括号快音符组 (...)、和弦组 [...]、延音线 -、或单个音符原子
    const tokenRegex = /\([^)]+\)|\[[^\]]+\]|-|[\^\.]*[#b]?[0-7]['*,]*\.*\/*/g;
    const tokens = body.match(tokenRegex) || [];
    const atomRegex = /[\^\.]*[#b]?[0-7]['*,]*\.*\/*/g;

    const events = []; // { startBeat, durBeats, items: [atom...] }
    let curBeat = 0;

    for (const tok of tokens) {
      if (tok === "-") {
        // 延长上一个音符事件 1 拍
        if (events.length > 0) {
          events[events.length - 1].durBeats += 1;
        }
        curBeat += 1;
      } else if (tok.startsWith("(") && tok.endsWith(")")) {
        const inner = tok.slice(1, -1);
        const subAtoms = (inner.match(atomRegex) || []).map((a) => parseSingleNoteAtom(a, rootMidi)).filter(Boolean);
        if (subAtoms.length > 0) {
          const eachBeat = 1 / subAtoms.length;
          for (const sa of subAtoms) {
            if (!sa.isRest) {
              events.push({ startBeat: curBeat, durBeats: eachBeat * sa.beats, items: [sa] });
            }
            curBeat += eachBeat * sa.beats;
          }
        }
      } else if (tok.startsWith("[") && tok.endsWith("]")) {
        const inner = tok.slice(1, -1);
        const subAtoms = (inner.match(atomRegex) || []).map((a) => parseSingleNoteAtom(a, rootMidi)).filter((x) => x && !x.isRest);
        if (subAtoms.length > 0) {
          const dur = subAtoms[0].beats || 1;
          events.push({ startBeat: curBeat, durBeats: dur, items: subAtoms });
          curBeat += dur;
        }
      } else {
        const atom = parseSingleNoteAtom(tok, rootMidi);
        if (atom) {
          if (!atom.isRest) {
            events.push({ startBeat: curBeat, durBeats: atom.beats, items: [atom] });
          }
          curBeat += atom.beats;
        }
      }
    }

    const notes = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const nextEv = events[i + 1];
      const startSec = ev.startBeat * beatSec;
      const durSec = ev.durBeats * beatSec;
      const gapSec = nextEv ? (nextEv.startBeat - ev.startBeat) * beatSec : durSec + 0.5;
      // 延音 ≥ 1.6 拍且不与下一音碰撞时自动生成真实 Hold 长按音符
      const isHold = ev.durBeats >= 1.6 && durSec >= 0.55 && gapSec >= durSec * 0.85;
      const holdDur = isHold ? Math.min(2.2, Math.max(0.5, Math.min(durSec * 0.85, gapSec - 0.12))) : 0;

      for (const item of ev.items) {
        notes.push({
          id: Math.random(),
          time: startSec + LEAD_IN_SEC,
          lane: item.lane,
          octave: item.octave,
          freq: item.freq,
          type: isHold ? "hold" : "tap",
          durationSec: isHold ? holdDur : Math.min(1.2, Math.max(0.28, durSec)),
          length: isHold ? Math.max(70, Math.round(holdDur * NOTE_SPEED)) : 0,
          hit: false,
          headHit: false,
          missed: false,
          isBeingHeld: false,
          _guidePlayed: false,
          x: -1000
        });
      }
    }

    const totalDuration = Math.max(6, Math.ceil(curBeat * beatSec + 1.5));
    return {
      title,
      bpm,
      key,
      instrument,
      notes,
      totalDuration,
      noteCount: notes.length
    };
  }

  // ==========================================
  // 3. 顶栏扩展按钮 + 简谱曲库/导入弹窗 + 音色选择弹窗 + 调校/暂停设置抽屉
  // ==========================================
  function ToolbarAndModals({
    audioCtxRef,
    isPaused,
    onTogglePause,
    isCustomMode,
    songTitle,
    onReanalyzeIfLoaded,
    onStartJianpuChart
  }) {
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;
    const [prefs, setPrefs] = useState(() => getPrefs());
    const [showTimbreModal, setShowTimbreModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showJianpuModal, setShowJianpuModal] = useState(false);
    const [customSongs, setCustomSongs] = useState(() => loadCustomJianpuSongs());
    const [editorText, setEditorText] = useState(BUILTIN_JIANPU_SONGS[0].notation);
    const [speedRate, setSpeedRate] = useState(1.0);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const previewTimersRef = useRef([]);
    const txtInputRef = useRef(null);

    useEffect(() => {
      const onChange = (e) => setPrefs(e?.detail || getPrefs());
      global.addEventListener("music-rhythm-prefs-changed", onChange);
      return () => global.removeEventListener("music-rhythm-prefs-changed", onChange);
    }, []);

    const stopPreview = () => {
      previewTimersRef.current.forEach((t) => clearTimeout(t));
      previewTimersRef.current = [];
      setIsPreviewing(false);
    };

    useEffect(() => {
      if (!showJianpuModal) stopPreview();
    }, [showJianpuModal]);

    const ensureCtx = () => {
      if (audioCtxRef && !audioCtxRef.current) {
        audioCtxRef.current = new (global.AudioContext || global.webkitAudioContext)();
      }
      if (audioCtxRef && audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef ? audioCtxRef.current : null;
    };

    const instruments = global.BeatForgeSynth ? global.BeatForgeSynth.INSTRUMENTS : [];
    const curInst = instruments.find((it) => it.id === prefs.instrument) || { name: "古筝", icon: "🎋" };

    const updatePref = (patch) => {
      const next = savePrefs(patch);
      setPrefs(next);
      return next;
    };

    const parsedPreview = showJianpuModal ? parseJianpuToChart(editorText, { speedRate }) : null;

    const handlePreviewJianpu = () => {
      if (isPreviewing) {
        stopPreview();
        return;
      }
      const chart = parseJianpuToChart(editorText, { speedRate });
      if (!chart.notes || chart.notes.length === 0) return;
      const ctx = ensureCtx();
      if (!ctx || !global.BeatForgeSynth) return;
      const useInst = chart.instrument || prefs.instrument || "guzheng";
      setIsPreviewing(true);
      const timers = [];
      chart.notes.forEach((n) => {
        const delayMs = Math.max(0, Math.round((n.time - LEAD_IN_SEC) * 1000));
        timers.push(
          setTimeout(() => {
            global.BeatForgeSynth.playNote(ctx, n.freq, {
              instrument: useInst,
              duration: n.durationSec || 0.45,
              velocity: 0.78,
              laneIndex: n.lane,
              reverb: prefs.reverb !== false
            });
          }, delayMs)
        );
      });
      timers.push(
        setTimeout(() => {
          setIsPreviewing(false);
        }, Math.round(chart.totalDuration * 1000))
      );
      previewTimersRef.current = timers;
    };

    const handleLaunchJianpu = (accompanyMode) => {
      stopPreview();
      const chart = parseJianpuToChart(editorText, { speedRate });
      if (!chart.notes || chart.notes.length === 0) {
        alert("未解析出有效简谱音符，请检查是否包含 1~7 数字！");
        return;
      }
      if (chart.instrument && instruments.some((i) => i.id === chart.instrument)) {
        updatePref({ instrument: chart.instrument });
      }
      setShowJianpuModal(false);
      if (typeof onStartJianpuChart === "function") {
        onStartJianpuChart(chart, Boolean(accompanyMode), editorText, speedRate);
      }
    };

    const handleSaveToLibrary = () => {
      const chart = parseJianpuToChart(editorText, { speedRate });
      if (!chart.notes || chart.notes.length === 0) {
        alert("简谱为空，无法收藏");
        return;
      }
      const entry = {
        id: `jp_${Date.now()}`,
        title: chart.title || "未命名简谱",
        bpm: chart.bpm,
        key: chart.key,
        instrument: chart.instrument || prefs.instrument,
        notation: editorText
      };
      const next = [entry, ...customSongs.filter((s) => s.title !== entry.title)];
      setCustomSongs(next);
      saveCustomJianpuSongs(next);
    };

    const handleImportTxt = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const txt = String(ev.target.result || "");
        if (txt.trim()) setEditorText(txt);
      };
      reader.readAsText(file, "utf-8");
      e.target.value = "";
    };

    return h(
      React.Fragment,
      null,
      // 顶栏轻量扩展按钮组（无缝融入原有顶栏）
      h(
        "div",
        {
          onClick: (e) => {
            e.stopPropagation();
            setShowJianpuModal(true);
          },
          style: {
            background: "linear-gradient(135deg, #FFF3E0, #FFE0B2)",
            padding: "4px 8px",
            borderRadius: 20,
            fontSize: "0.78rem",
            color: "#6D3B1A",
            cursor: "pointer",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            border: "1px solid rgba(214,114,75,0.45)"
          }
        },
        "🎼 简谱"
      ),
      h(
        "div",
        {
          onClick: (e) => {
            e.stopPropagation();
            setShowTimbreModal(true);
          },
          style: {
            background: "rgba(255, 248, 225, 0.9)",
            padding: "4px 8px",
            borderRadius: 20,
            fontSize: "0.78rem",
            color: "#5D4037",
            cursor: "pointer",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            border: "1px solid rgba(255,193,7,0.5)"
          }
        },
        `${curInst.icon} ${curInst.name}`
      ),
      h(
        "div",
        {
          onClick: (e) => {
            e.stopPropagation();
            if (typeof onTogglePause === "function") onTogglePause();
          },
          style: {
            background: isPaused ? "#FF8F00" : "rgba(0,0,0,0.48)",
            padding: "4px 8px",
            borderRadius: 20,
            fontSize: "0.78rem",
            color: "#fff",
            cursor: "pointer",
            fontWeight: "bold",
            whiteSpace: "nowrap"
          }
        },
        isPaused ? "▶ 继续" : "⏸"
      ),
      h(
        "div",
        {
          onClick: (e) => {
            e.stopPropagation();
            setShowSettingsModal(true);
          },
          style: {
            background: "rgba(0,0,0,0.48)",
            padding: "4px 8px",
            borderRadius: 20,
            fontSize: "0.78rem",
            color: "#fff",
            cursor: "pointer",
            whiteSpace: "nowrap"
          }
        },
        "⚙"
      ),

      (showTimbreModal || showSettingsModal || showJianpuModal) &&
        ((node) =>
          global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body
            ? global.ReactDOM.createPortal(node, document.body)
            : node)(
          h(
            React.Fragment,
            null,
            // BeatForge 国风音色选择弹窗
            showTimbreModal &&
              h(
                "div",
                {
                  onClick: () => setShowTimbreModal(false),
                  style: {
                    position: "fixed",
                    inset: 0,
                    zIndex: 99990,
                    background: "rgba(18, 16, 14, 0.72)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "16px",
                    fontFamily: "sans-serif"
                  }
                },
          h(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "350px",
                maxHeight: "82vh",
                overflowY: "auto",
                background: "#FFFDF7",
                borderRadius: "18px",
                padding: "16px",
                border: "2px solid #E6C98F",
                boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
                color: "#4A3C31"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
              h("strong", { style: { fontSize: "15px" } }, "🎻 音律音色库（BeatForge 民乐引擎）"),
              h(
                "button",
                {
                  onClick: () => setShowTimbreModal(false),
                  style: { border: "none", background: "#EFE7D6", borderRadius: "999px", width: "26px", height: "26px", cursor: "pointer" }
                },
                "✕"
              )
            ),
            h(
              "div",
              { style: { fontSize: "11px", color: "#8C7B6B", marginBottom: "10px" } },
              "点击任意乐器即可切换并试听五声音阶（零采样实时合成）"
            ),
            h(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
              instruments.map((inst) => {
                const active = prefs.instrument === inst.id;
                return h(
                  "div",
                  {
                    key: inst.id,
                    onClick: () => {
                      updatePref({ instrument: inst.id });
                      const ctx = ensureCtx();
                      if (ctx && global.BeatForgeSynth) {
                        global.BeatForgeSynth.playPreviewScale(ctx, inst.id, prefs.reverb !== false);
                      }
                    },
                    style: {
                      padding: "9px 10px",
                      borderRadius: "12px",
                      border: active ? "2px solid #D6724B" : "1px solid #E8DEC8",
                      background: active ? "#FFF4E8" : "#FAF7F0",
                      cursor: "pointer"
                    }
                  },
                  h(
                    "div",
                    { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" } },
                    h("strong", { style: { fontSize: "13px", color: active ? "#B84B24" : "#4A3C31" } }, `${inst.icon} ${inst.name}`),
                    h("span", { style: { fontSize: "9.5px", color: "#9C8B78" } }, inst.tag)
                  ),
                  h("div", { style: { fontSize: "10.5px", color: "#7B6E60", lineHeight: 1.35 } }, inst.desc)
                );
              })
            )
          )
        ),

      // 调校与设置抽屉
      showSettingsModal &&
        h(
          "div",
          {
            onClick: () => setShowSettingsModal(false),
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 99990,
              background: "rgba(18, 16, 14, 0.72)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              fontFamily: "sans-serif"
            }
          },
          h(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "340px",
                background: "#FFFDF7",
                borderRadius: "18px",
                padding: "16px",
                border: "2px solid #E6C98F",
                boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
                color: "#4A3C31",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("strong", { style: { fontSize: "15px" } }, "⚙️ 音律训练 · 采谱与手感调校"),
              h(
                "button",
                {
                  onClick: () => setShowSettingsModal(false),
                  style: { border: "none", background: "#EFE7D6", borderRadius: "999px", width: "26px", height: "26px", cursor: "pointer" }
                },
                "✕"
              )
            ),

            // 1. 音频采谱难度
            h(
              "div",
              null,
              h("div", { style: { fontSize: "12px", fontWeight: "700", marginBottom: "6px" } }, "导入歌曲采谱密度（难度）"),
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                [
                  { id: "easy", label: "轻柔" },
                  { id: "normal", label: "标准" },
                  { id: "hard", label: "挑战" }
                ].map((d) =>
                  h(
                    "button",
                    {
                      key: d.id,
                      onClick: () => {
                        updatePref({ difficulty: d.id });
                        if (typeof onReanalyzeIfLoaded === "function") onReanalyzeIfLoaded(d.id);
                      },
                      style: {
                        flex: 1,
                        padding: "7px",
                        borderRadius: "9px",
                        border: prefs.difficulty === d.id ? "1.5px solid #D6724B" : "1px solid #E2D8C3",
                        background: prefs.difficulty === d.id ? "#FFF2E6" : "#FAF7F0",
                        color: prefs.difficulty === d.id ? "#B84B24" : "#665A4E",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer"
                      }
                    },
                    d.label
                  )
                )
              )
            ),

            // 2. 本地歌曲击打音效模式
            h(
              "div",
              null,
              h("div", { style: { fontSize: "12px", fontWeight: "700", marginBottom: "6px" } }, "导入本地歌曲时的击打音效"),
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                [
                  { id: "percussion", label: "木鱼玉磬(推荐)" },
                  { id: "same", label: "当前乐器" },
                  { id: "mute", label: "静音听原曲" }
                ].map((m) =>
                  h(
                    "button",
                    {
                      key: m.id,
                      onClick: () => updatePref({ customAudioSfx: m.id }),
                      style: {
                        flex: 1,
                        padding: "7px 4px",
                        borderRadius: "9px",
                        border: prefs.customAudioSfx === m.id ? "1.5px solid #6D947C" : "1px solid #E2D8C3",
                        background: prefs.customAudioSfx === m.id ? "#EEF7F1" : "#FAF7F0",
                        color: prefs.customAudioSfx === m.id ? "#336B49" : "#665A4E",
                        fontSize: "11px",
                        fontWeight: "700",
                        cursor: "pointer"
                      }
                    },
                    m.label
                  )
                )
              )
            ),

            // 3. 音画判定偏移校准
            h(
              "div",
              null,
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", marginBottom: "4px" } },
                h("span", null, "音画判定偏移（蓝牙耳机可调）"),
                h("span", { style: { color: "#D6724B" } }, `${prefs.offsetMs > 0 ? "+" : ""}${prefs.offsetMs} ms`)
              ),
              h("input", {
                type: "range",
                min: -150,
                max: 150,
                step: 10,
                value: prefs.offsetMs || 0,
                onChange: (e) => updatePref({ offsetMs: Number(e.target.value) }),
                style: { width: "100%" }
              })
            ),

            // 4. 古风厅堂混响开关
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" } },
              h("span", { style: { fontWeight: "700" } }, "古风厅堂混响（增加民乐余韵）"),
              h("input", {
                type: "checkbox",
                checked: prefs.reverb !== false,
                onChange: (e) => updatePref({ reverb: e.target.checked }),
                style: { width: "18px", height: "18px", cursor: "pointer" }
              })
            ),

            isCustomMode &&
              songTitle &&
              h("div", { style: { fontSize: "11px", color: "#8C7B6B", background: "#F7F3E8", padding: "7px 9px", borderRadius: "8px" } }, `当前载入：${songTitle}`)
          )
        ),

      // 简谱曲库与导入弹窗（Phase 1）
      showJianpuModal &&
        h(
          "div",
          {
            onClick: () => setShowJianpuModal(false),
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 99995,
              background: "rgba(18, 16, 14, 0.74)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px",
              fontFamily: "sans-serif"
            }
          },
          h(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "370px",
                maxHeight: "86vh",
                overflowY: "auto",
                background: "#FFFDF7",
                borderRadius: "18px",
                padding: "15px",
                border: "2px solid #E6C98F",
                boxShadow: "0 14px 36px rgba(0,0,0,0.38)",
                color: "#4A3C31",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("strong", { style: { fontSize: "15px" } }, "🎼 简谱曲库与导入（自动生成 7 轨谱面）"),
              h(
                "button",
                {
                  onClick: () => setShowJianpuModal(false),
                  style: { border: "none", background: "#EFE7D6", borderRadius: "999px", width: "26px", height: "26px", cursor: "pointer" }
                },
                "✕"
              )
            ),

            // 示范曲库与我的收藏切换胶囊
            h(
              "div",
              { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              [...BUILTIN_JIANPU_SONGS, ...customSongs].map((song) =>
                h(
                  "div",
                  {
                    key: song.id,
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 9px",
                      borderRadius: "999px",
                      background: editorText.includes(song.title) ? "#FFF0DE" : "#F6F1E4",
                      border: editorText.includes(song.title) ? "1.5px solid #D6724B" : "1px solid #E2D8C2",
                      fontSize: "11.5px",
                      fontWeight: "700",
                      color: "#5D4037",
                      cursor: "pointer"
                    },
                    onClick: () => {
                      stopPreview();
                      setEditorText(song.notation);
                    }
                  },
                  song.builtin ? `🎋 ${song.title}` : `⭐ ${song.title}`,
                  !song.builtin &&
                    h(
                      "span",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          const next = customSongs.filter((s) => s.id !== song.id);
                          setCustomSongs(next);
                          saveCustomJianpuSongs(next);
                        },
                        style: { marginLeft: "2px", color: "#B84B24", fontSize: "11px" }
                      },
                      "×"
                    )
                )
              )
            ),

            // 语法小提示 + 导入 txt
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10.5px", color: "#8C7B6B" } },
              h("span", null, "支持 1-7 / 0休止 / 1'高音 5,低音 / -延音 / (12)快音 / [135]和弦"),
              h(
                "button",
                {
                  onClick: () => txtInputRef.current && txtInputRef.current.click(),
                  style: {
                    border: "1px solid #DCCBB0",
                    background: "#FAF5E8",
                    color: "#6D4C41",
                    borderRadius: "8px",
                    padding: "2px 7px",
                    fontSize: "11px",
                    cursor: "pointer",
                    flexShrink: 0
                  }
                },
                "导入.txt"
              ),
              h("input", { ref: txtInputRef, type: "file", accept: ".txt,text/plain", style: { display: "none" }, onChange: handleImportTxt })
            ),

            // 简谱编辑文本框
            h("textarea", {
              value: editorText,
              onChange: (e) => setEditorText(e.target.value),
              rows: 6,
              placeholder: "输入或粘贴数字简谱，如：3 3 5 6 | 1' 1' 6 5 - |",
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 10px",
                borderRadius: "10px",
                border: "1px solid #DFD3BC",
                background: "#FFFEFA",
                fontFamily: "monospace",
                fontSize: "12px",
                lineHeight: 1.5,
                color: "#3E332A",
                resize: "vertical"
              }
            }),

            // 实时解析统计 + 速度档位
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#6D5D4E" } },
              h(
                "span",
                null,
                `已解析 ${parsedPreview?.noteCount || 0} 音 · 约 ${parsedPreview?.totalDuration || 0}s · ${parsedPreview?.key || "C"}调 ${parsedPreview?.bpm || 96}BPM`
              ),
              h(
                "div",
                { style: { display: "flex", gap: "4px" } },
                [0.75, 1.0, 1.25].map((r) =>
                  h(
                    "button",
                    {
                      key: r,
                      onClick: () => setSpeedRate(r),
                      style: {
                        border: speedRate === r ? "1px solid #D6724B" : "1px solid #E2D8C2",
                        background: speedRate === r ? "#FFF0E0" : "#FAF7F0",
                        color: speedRate === r ? "#B84B24" : "#7B6E60",
                        borderRadius: "6px",
                        padding: "2px 6px",
                        fontSize: "10.5px",
                        fontWeight: "700",
                        cursor: "pointer"
                      }
                    },
                    `${r}x`
                  )
                )
              )
            ),

            // 操作按钮组：试听 / 收藏 / 独奏开弹 / 伴奏跟弹
            h(
              "div",
              { style: { display: "flex", gap: "6px" } },
              h(
                "button",
                {
                  onClick: handlePreviewJianpu,
                  style: {
                    flex: 1,
                    padding: "8px",
                    borderRadius: "10px",
                    border: "1px solid #D9C8AA",
                    background: isPreviewing ? "#FDECE6" : "#FAF5E8",
                    color: isPreviewing ? "#C64527" : "#5D4037",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer"
                  }
                },
                isPreviewing ? "⏹ 停止试听" : "🔊 自动试听"
              ),
              h(
                "button",
                {
                  onClick: handleSaveToLibrary,
                  style: {
                    flex: 1,
                    padding: "8px",
                    borderRadius: "10px",
                    border: "1px solid #D9C8AA",
                    background: "#FAF5E8",
                    color: "#5D4037",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer"
                  }
                },
                "⭐ 存进曲库"
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  onClick: () => handleLaunchJianpu(false),
                  style: {
                    flex: 1,
                    padding: "10px",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #D6724B, #C25832)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "800",
                    cursor: "pointer"
                  }
                },
                "🎹 独奏开弹"
              ),
              h(
                "button",
                {
                  onClick: () => handleLaunchJianpu(true),
                  style: {
                    flex: 1,
                    padding: "10px",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #6D947C, #527B62)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "800",
                    cursor: "pointer"
                  }
                },
                "🎵 伴奏跟弹"
              )
            )
          )
        )
        )
      )
    );
  }

  global.MusicRhythmEngine = {
    LEAD_IN_SEC,
    NOTE_SPEED,
    BUILTIN_JIANPU_SONGS,
    getPrefs,
    savePrefs,
    playGameTone,
    analyzeAudioToChartV2,
    parseJianpuToChart,
    ToolbarAndModals
  };
})(window);
