/**
 * Milvus/huijing_canvas_app.js
 * 「绘·境（HuiJing）」交互式音乐可视化画板（独立模块化引擎）
 * - 参考 playmusictheory.org：横轴时间循环扫掠 + 纵轴音高 + 颜色（黑白水墨至国风彩墨）映射音色
 * - 100% 复用「修武扬文 · 音律训练」十大实时民乐与合成器音色（window.BeatForgeSynth）
 * - 64 步时间栅格量化 + 单列最大 6 复音限流，涂抹再密亦清澈不破音
 * - 矢量归一化坐标 + 双层高分屏 Canvas（底层静画 + 顶层 60fps 游标与涟漪粒子）
 * - 独立 IndexedDB: milvus_huijing_idb（零 localStorage 写入）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_huijing_idb";
  const DB_VERSION = 1;
  const STORE_ARTWORKS = "artworks";
  const TOTAL_STEPS = 64;
  const MAX_VOICES_PER_STEP = 6;

  // 4 套音阶（由低到高排列，15 个阶梯，渲染时画布上方为高音、下方为低音）
  const SCALE_PRESETS = [
    {
      id: "pentatonic",
      name: "五声国风",
      short: "五声",
      // C3 ~ C6 五声音阶（宫商角徵羽，绝不跑调）
      freqs: [
        130.81, 146.83, 164.81, 196.0, 220.0,
        261.63, 293.66, 329.63, 392.0, 440.0,
        523.25, 587.33, 659.25, 783.99, 880.0
      ]
    },
    {
      id: "major",
      name: "C 大调",
      short: "大调",
      freqs: [
        196.0, 220.0, 246.94, 261.63, 293.66,
        329.63, 349.23, 392.0, 440.0, 493.88,
        523.25, 587.33, 659.25, 698.46, 783.99
      ]
    },
    {
      id: "minor",
      name: "A 小调",
      short: "小调",
      freqs: [
        164.81, 196.0, 220.0, 246.94, 261.63,
        293.66, 329.63, 349.23, 392.0, 440.0,
        493.88, 523.25, 587.33, 659.25, 698.46
      ]
    },
    {
      id: "miyako",
      name: "空灵都节",
      short: "都节",
      // 东方空灵半音五声（C Db F G Ab）
      freqs: [
        130.81, 138.59, 174.61, 196.0, 207.65,
        261.63, 277.18, 349.23, 392.0, 415.3,
        523.25, 554.37, 698.46, 783.99, 830.61
      ]
    }
  ];

  // 10 色画笔：前 2 色黑白水墨 + 后 8 色国风彩墨，一对一复用 BeatForgeSynth 十大音色
  const BRUSH_PALETTE = [
    { id: "ink_black", name: "玄墨", color: "#1E242B", darkColor: "#E2E8F0", instrument: "guqin", icon: "🪕", instName: "古琴" },
    { id: "ink_gray", name: "淡墨", color: "#64748B", darkColor: "#94A3B8", instrument: "percussion", icon: "🥁", instName: "木鱼玉磬" },
    { id: "bamboo", name: "竹青", color: "#2D6A4F", darkColor: "#52B788", instrument: "guzheng", icon: "🎋", instName: "古筝" },
    { id: "cinnabar", name: "朱砂", color: "#C85A32", darkColor: "#F0714A", instrument: "pipa", icon: "🎻", instName: "琵琶" },
    { id: "gilded", name: "鎏金", color: "#D99B26", darkColor: "#FBBF24", instrument: "yangqin", icon: "🎼", instName: "扬琴" },
    { id: "celadon", name: "天青", color: "#0EA5A4", darkColor: "#2DD4BF", instrument: "dizi", icon: "🪈", instName: "竹笛" },
    { id: "indigo", name: "黛蓝", color: "#4F6D9A", darkColor: "#7AA2F7", instrument: "xiao", icon: "🎐", instName: "洞箫" },
    { id: "rouge", name: "胭脂", color: "#B84A62", darkColor: "#F472B6", instrument: "erhu", icon: "🎶", instName: "二胡" },
    { id: "amethyst", name: "紫檀", color: "#8B5CF6", darkColor: "#A78BFA", instrument: "bianzhong", icon: "🔔", instName: "编钟" },
    { id: "coral", name: "珊瑚", color: "#E07A5F", darkColor: "#FB923C", instrument: "piano", icon: "🎹", instName: "清透钢琴" }
  ];

  const BRUSH_SIZES = [
    { id: "thin", width: 3.5, velocity: 0.58, dot: 7 },
    { id: "med", width: 7, velocity: 0.8, dot: 11 },
    { id: "thick", width: 12, velocity: 0.98, dot: 15 }
  ];

  // ==========================================
  // 1. 纯数学与音乐映射层（100% 可单测）
  // ==========================================
  function getScaleById(scaleId) {
    return SCALE_PRESETS.find((s) => s.id === scaleId) || SCALE_PRESETS[0];
  }

  function getBrushById(brushId) {
    return BRUSH_PALETTE.find((b) => b.id === brushId) || BRUSH_PALETTE[2];
  }

  /**
   * 纵轴归一化坐标 normY (0=顶部高音, 1=底部低音) -> 音阶频率
   */
  function yToScaleNote(normY, scaleId = "pentatonic") {
    const scale = getScaleById(scaleId);
    const freqs = scale.freqs;
    const clamped = Math.max(0, Math.min(1, Number(normY) || 0));
    // 顶部 (0) -> 最高音 index (freqs.length - 1)，底部 (1) -> 最低音 index 0
    const noteIndex = Math.round((1 - clamped) * (freqs.length - 1));
    const safeIdx = Math.max(0, Math.min(freqs.length - 1, noteIndex));
    return {
      noteIndex: safeIdx,
      freq: freqs[safeIdx],
      laneIndex: (safeIdx % 7) + 1
    };
  }

  const INSTRUMENT_TAIL_SEC = {
    guqin: 1.85,
    guzheng: 1.55,
    bianzhong: 2.1,
    xiao: 1.45,
    dizi: 1.25,
    erhu: 1.4,
    piano: 1.35,
    yangqin: 1.15,
    pipa: 0.8,
    percussion: 0.35
  };

  const SUSTAIN_PRESETS = [
    { id: "long", short: "绵", label: "绵长余韵", mul: 1.45 },
    { id: "soft", short: "柔", label: "柔和连奏", mul: 1.0 },
    { id: "crisp", short: "短", label: "清脆断奏", mul: 0.6 }
  ];

  const MIN_STROKE_RETRIGGER_STEPS = 4; // 同一条笔触至少跨越 4 步（约 1 拍）且音高变化才起下一个新音，彻底防密击
  const CROSS_STROKE_INST_COOLDOWN = 2; // 同一颜色/乐器在多笔堆叠时，相邻 2 步内不重复起音

  /**
   * 将矢量笔触编译为 64 步循环栅格（一笔成韵 · 竖线单音化 + 笔触稀疏乐句 + 堆叠防密冷却）：
   * 1. 同一笔触在每个时间列只取 1 个代表音高（竖线不再一巴掌砸出 6 个音）；
   * 2. 同一笔触按最小节奏步距（4 步）采样稀疏乐句，且相同音高自动合并为绵长延音 spanSteps；
   * 3. 多条同色直/竖线堆叠时，同乐器单列仅留 1 音并施加跨笔冷却，只让不同颜色交织成清雅和声。
   */
  function compileStrokesToGrid(strokes = [], totalSteps = TOTAL_STEPS, scaleId = "pentatonic") {
    const steps = Math.max(8, Math.floor(Number(totalSteps) || TOTAL_STEPS));
    // 每列按 instrument 去重（同一列同种乐器最多 1 个代表音，防同色堆叠爆响）
    const buckets = Array.from({ length: steps }, () => new Map());

    const commitEvent = (stepIdx, x, y, note, brush, stroke, spanSteps) => {
      const bucket = buckets[stepIdx];
      const existing = bucket.get(brush.instrument);
      if (!existing || spanSteps > existing.spanSteps) {
        const tail = INSTRUMENT_TAIL_SEC[brush.instrument] || 1.2;
        bucket.set(brush.instrument, {
          step: stepIdx,
          spanSteps: Math.max(1, spanSteps),
          x,
          y,
          freq: note.freq,
          noteIndex: note.noteIndex,
          laneIndex: note.laneIndex,
          instrument: brush.instrument,
          brushId: brush.id,
          color: brush.color,
          darkColor: brush.darkColor,
          velocity: Math.max(0.35, Math.min(1, Number(stroke.velocity) || 0.8)),
          tailSec: tail,
          duration: Math.min(3.5, Math.max(0.65, spanSteps * 0.18 + tail))
        });
      }
    };

    for (const stroke of Array.isArray(strokes) ? strokes : []) {
      const pts = Array.isArray(stroke?.points) ? stroke.points : [];
      if (pts.length === 0) continue;
      const brush = getBrushById(stroke.brushId);

      // 1) 按时间列 stepIdx 归并该笔触的所有点，每列取该列平均 Y（彻底把竖线/回折线收束为每列 1 个清澈音高）
      const colAccum = new Map();
      const addPt = (x, y) => {
        const cx = Math.max(0, Math.min(0.9999, Number(x) || 0));
        const cy = Math.max(0, Math.min(1, Number(y) || 0));
        const stepIdx = Math.min(steps - 1, Math.floor(cx * steps));
        let acc = colAccum.get(stepIdx);
        if (!acc) {
          acc = { stepIdx, sumX: 0, sumY: 0, count: 0 };
          colAccum.set(stepIdx, acc);
        }
        acc.sumX += cx;
        acc.sumY += cy;
        acc.count += 1;
      };

      if (pts.length === 1) {
        addPt(pts[0].x, pts[0].y);
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const dx = Math.abs((b.x || 0) - (a.x || 0));
          const subDivs = Math.max(1, Math.ceil(dx * steps));
          for (let s = 0; s <= subDivs; s++) {
            const t = s / subDivs;
            addPt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
          }
        }
      }

      // 按时间顺序排列该笔触覆盖的列
      const orderedCols = Array.from(colAccum.values())
        .sort((a, b) => a.stepIdx - b.stepIdx)
        .map((c) => {
          const avgX = c.sumX / c.count;
          const avgY = c.sumY / c.count;
          return { stepIdx: c.stepIdx, x: avgX, y: avgY, note: yToScaleNote(avgY, scaleId) };
        });

      if (orderedCols.length === 0) continue;

      // 2) 稀疏乐句归并：同一笔触至少隔 MIN_STROKE_RETRIGGER_STEPS 步且音高确实变化，才起下一个新音
      let activePhrase = orderedCols[0];
      let phraseEndStep = orderedCols[0].stepIdx;

      for (let i = 1; i < orderedCols.length; i++) {
        const col = orderedCols[i];
        const gapFromStart = col.stepIdx - activePhrase.stepIdx;
        const isContinuous = col.stepIdx <= phraseEndStep + 2;
        const pitchChanged = Math.abs(col.note.noteIndex - activePhrase.note.noteIndex) >= 1;

        if (!isContinuous || (pitchChanged && gapFromStart >= MIN_STROKE_RETRIGGER_STEPS)) {
          commitEvent(
            activePhrase.stepIdx,
            activePhrase.x,
            activePhrase.y,
            activePhrase.note,
            brush,
            stroke,
            phraseEndStep - activePhrase.stepIdx + 1
          );
          activePhrase = col;
          phraseEndStep = col.stepIdx;
        } else {
          phraseEndStep = col.stepIdx;
        }
      }
      commitEvent(
        activePhrase.stepIdx,
        activePhrase.x,
        activePhrase.y,
        activePhrase.note,
        brush,
        stroke,
        phraseEndStep - activePhrase.stepIdx + 1
      );
    }

    // 3) 跨笔触同音色防密冷却 + 单列最大 6 复音限流
    const lastFiredByInst = new Map();
    return buckets.map((bucket, stepIdx) => {
      const all = Array.from(bucket.values()).filter((ev) => {
        const prevStep = lastFiredByInst.get(ev.instrument);
        if (prevStep !== undefined && stepIdx - prevStep < CROSS_STROKE_INST_COOLDOWN) {
          return false;
        }
        return true;
      });
      const capped = all.slice(0, MAX_VOICES_PER_STEP);
      capped.forEach((ev) => lastFiredByInst.set(ev.instrument, stepIdx));
      return capped;
    });
  }

  // 3 幅预置示范画作（归一化坐标，一键即看即听）
  function buildDemoArtworks() {
    const mountainPts = [];
    for (let i = 0; i <= 24; i++) {
      const x = 0.04 + (i / 24) * 0.92;
      const y = 0.72 - Math.sin((i / 24) * Math.PI * 2) * 0.14 - Math.sin((i / 24) * Math.PI) * 0.1;
      mountainPts.push({ x, y });
    }
    const fluteWave = [];
    for (let i = 0; i <= 18; i++) {
      const x = 0.08 + (i / 18) * 0.84;
      const y = 0.28 + Math.sin((i / 18) * Math.PI * 3) * 0.11;
      fluteWave.push({ x, y });
    }
    const rainDrops = [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.92].map((x, idx) => ({
      id: `demo_drop_${idx}`,
      brushId: idx % 2 === 0 ? "cinnabar" : "gilded",
      width: 8,
      velocity: 0.78,
      points: [{ x, y: 0.18 + ((idx * 3) % 5) * 0.12 }]
    }));
    const drumBeats = [0.06, 0.31, 0.56, 0.81].map((x, idx) => ({
      id: `demo_drum_${idx}`,
      brushId: "ink_gray",
      width: 11,
      velocity: 0.82,
      points: [{ x, y: 0.86 }]
    }));

    return [
      {
        id: "demo_moon_mountain",
        name: "月夜山水",
        scaleId: "pentatonic",
        bpm: 96,
        strokes: [
          { id: "dm_1", brushId: "ink_black", width: 10, velocity: 0.85, points: mountainPts },
          { id: "dm_2", brushId: "celadon", width: 5, velocity: 0.72, points: fluteWave },
          ...drumBeats
        ]
      },
      {
        id: "demo_flower_rain",
        name: "花雨落泉",
        scaleId: "pentatonic",
        bpm: 116,
        strokes: [
          {
            id: "df_1",
            brushId: "bamboo",
            width: 6,
            velocity: 0.8,
            points: [
              { x: 0.06, y: 0.2 }, { x: 0.25, y: 0.45 }, { x: 0.5, y: 0.68 }, { x: 0.75, y: 0.38 }, { x: 0.94, y: 0.22 }
            ]
          },
          ...rainDrops
        ]
      },
      {
        id: "demo_star_bells",
        name: "星河编钟",
        scaleId: "miyako",
        bpm: 86,
        strokes: [
          { id: "ds_1", brushId: "amethyst", width: 12, velocity: 0.92, points: [{ x: 0.12, y: 0.78 }] },
          { id: "ds_2", brushId: "amethyst", width: 12, velocity: 0.92, points: [{ x: 0.62, y: 0.72 }] },
          { id: "ds_3", brushId: "indigo", width: 6, velocity: 0.72, points: [{ x: 0.18, y: 0.42 }, { x: 0.48, y: 0.32 }, { x: 0.85, y: 0.45 }] },
          { id: "ds_4", brushId: "coral", width: 7, velocity: 0.75, points: [{ x: 0.28, y: 0.25 }] },
          { id: "ds_5", brushId: "coral", width: 7, velocity: 0.75, points: [{ x: 0.42, y: 0.18 }] },
          { id: "ds_6", brushId: "gilded", width: 7, velocity: 0.82, points: [{ x: 0.75, y: 0.22 }] },
          { id: "ds_7", brushId: "rouge", width: 6, velocity: 0.76, points: [{ x: 0.55, y: 0.55 }, { x: 0.9, y: 0.35 }] }
        ]
      }
    ];
  }

  // ==========================================
  // 2. 独立 IDB 作品集（零 localStorage 写入）
  // ==========================================
  let _dbPromise = null;
  let _memArtworks = [];

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_ARTWORKS)) {
            db.createObjectStore(STORE_ARTWORKS, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function saveArtwork(art) {
    const rec = {
      id: art.id || `hj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(art.name || "无题音画").trim().slice(0, 20),
      scaleId: art.scaleId || "pentatonic",
      bpm: Number(art.bpm) || 104,
      strokes: Array.isArray(art.strokes) ? art.strokes : [],
      savedAt: Date.now()
    };
    const db = await openDb();
    if (!db) {
      _memArtworks = [rec, ..._memArtworks.filter((a) => a.id !== rec.id)];
      return rec;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ARTWORKS, "readwrite");
        tx.objectStore(STORE_ARTWORKS).put(rec);
        tx.oncomplete = () => resolve(rec);
        tx.onerror = () => resolve(rec);
      } catch (e) {
        resolve(rec);
      }
    });
  }

  async function listArtworks() {
    const db = await openDb();
    if (!db) return [..._memArtworks].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ARTWORKS, "readonly");
        const req = tx.objectStore(STORE_ARTWORKS).getAll();
        req.onsuccess = () => {
          const arr = Array.isArray(req.result) ? req.result : [];
          resolve(arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function deleteArtwork(id) {
    const db = await openDb();
    if (!db) {
      _memArtworks = _memArtworks.filter((a) => a.id !== id);
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ARTWORKS, "readwrite");
        tx.objectStore(STORE_ARTWORKS).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // ==========================================
  // 3. 音频触发桥接（100% 复用 BeatForgeSynth）
  // ==========================================
  let _audioCtx = null;

  function ensureAudioCtx() {
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!_audioCtx) _audioCtx = new AudioCtx();
    if (_audioCtx.state === "suspended") {
      _audioCtx.resume().catch(() => { });
    }
    return _audioCtx;
  }

  function triggerSynthNote(freq, { instrument = "guzheng", velocity = 0.8, duration = 0.4, laneIndex = 3, reverb = true } = {}) {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (global.BeatForgeSynth && typeof global.BeatForgeSynth.playNote === "function") {
      try {
        global.BeatForgeSynth.playNote(ctx, freq, { instrument, velocity, duration, laneIndex, reverb });
        return;
      } catch (e) { }
    }
    // 兜底极简合成器
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18 * velocity, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch (e) { }
  }

  // ==========================================
  // 4. 全屏交互组件：HuiJingCanvasModal
  // ==========================================
  function HuiJingCanvasModal({ isOpen, onClose }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef, useMemo } = React;

    const [strokes, setStrokes] = useState([]);
    const [brushId, setBrushId] = useState("bamboo"); // 默认竹青古筝
    const [sizeIdx, setSizeIdx] = useState(1);
    const [eraserMode, setEraserMode] = useState(false);
    const [scaleId, setScaleId] = useState("pentatonic");
    const [bpm, setBpm] = useState(104);
    const [sustainId, setSustainId] = useState("long"); // 默认「绵」长延音连奏
    const [reverbOn, setReverbOn] = useState(true);
    const [darkCanvas, setDarkCanvas] = useState(true); // 默认星夜墨砚，荧光线条质感极佳
    const [showGrid, setShowGrid] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [demoIdx, setDemoIdx] = useState(0);
    const [showVault, setShowVault] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showCharCompose, setShowCharCompose] = useState(false);
    const [charList, setCharList] = useState([]);
    const [selectedCharId, setSelectedCharId] = useState("");
    const [motifInput, setMotifInput] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const [activeInscription, setActiveInscription] = useState(null); // { charName, title, note }
    const [inscriptionCollapsed, setInscriptionCollapsed] = useState(false);
    const [savedList, setSavedList] = useState([]);
    const [toast, setToast] = useState("");

    const wrapRef = useRef(null);
    const bgCanvasRef = useRef(null);
    const fxCanvasRef = useRef(null);
    const drawingRef = useRef(null);
    const animTokenRef = useRef(0);
    const lastAuditionRef = useRef({ noteIdx: -1, at: 0 });
    const ripplesRef = useRef([]);
    const playheadRef = useRef({ x: 0, lastStep: -1, lastTs: 0 });
    const rafRef = useRef(0);
    const gridRef = useRef([]);
    const bpmRef = useRef(bpm);
    const sustainRef = useRef(sustainId);
    const reverbRef = useRef(reverbOn);
    const darkRef = useRef(darkCanvas);

    useEffect(() => { bpmRef.current = bpm; }, [bpm]);
    useEffect(() => { sustainRef.current = sustainId; }, [sustainId]);
    useEffect(() => { reverbRef.current = reverbOn; }, [reverbOn]);
    useEffect(() => { darkRef.current = darkCanvas; }, [darkCanvas]);

    const compiledGrid = useMemo(
      () => compileStrokesToGrid(strokes, TOTAL_STEPS, scaleId),
      [strokes, scaleId]
    );
    useEffect(() => { gridRef.current = compiledGrid; }, [compiledGrid]);

    const flashToast = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(""), 1700);
    };

    const drawStaticCanvas = (strokeList = strokes) => {
      const canvas = bgCanvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 背景
      ctx.fillStyle = darkCanvas ? "#11151E" : "#FAF6EE";
      ctx.fillRect(0, 0, rect.width, rect.height);

      // 参考网格（16 拍竖线 + 5 条音区横线）
      if (showGrid) {
        ctx.strokeStyle = darkCanvas ? "rgba(148,163,184,0.1)" : "rgba(120,113,108,0.12)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) {
          const x = (i / 16) * rect.width;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, rect.height);
          ctx.stroke();
        }
        for (let j = 1; j < 5; j++) {
          const y = (j / 5) * rect.height;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(rect.width, y);
          ctx.stroke();
        }
      }

      // 绘制所有矢量笔触
      for (const st of strokeList) {
        const pts = st.points || [];
        if (pts.length === 0) continue;
        const brush = getBrushById(st.brushId);
        const col = darkCanvas ? brush.darkColor : brush.color;
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = st.width || 7;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (darkCanvas) {
          ctx.shadowColor = col;
          ctx.shadowBlur = 8;
        } else {
          ctx.shadowBlur = 0;
        }
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x * rect.width, pts[0].y * rect.height, (st.width || 7) * 0.65, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0].x * rect.width, pts[0].y * rect.height);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * rect.width, pts[i].y * rect.height);
          }
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    };

    useEffect(() => {
      if (!isOpen) return;
      drawStaticCanvas(strokes);
      const onResize = () => drawStaticCanvas(strokes);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [isOpen, strokes, darkCanvas, showGrid]);

    // 播放循环与 60fps 发光游标 + 涟漪动画
    useEffect(() => {
      if (!isOpen || !isPlaying) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        const fx = fxCanvasRef.current;
        if (fx) {
          const fctx = fx.getContext("2d");
          if (fctx) fctx.clearRect(0, 0, fx.width, fx.height);
        }
        return;
      }

      playheadRef.current.lastTs = performance.now();
      const loop = (now) => {
        const wrap = wrapRef.current;
        const fx = fxCanvasRef.current;
        if (!wrap || !fx) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        const rect = wrap.getBoundingClientRect();
        const dpr = Math.min(2, global.devicePixelRatio || 1);
        if (fx.width !== Math.round(rect.width * dpr) || fx.height !== Math.round(rect.height * dpr)) {
          fx.width = Math.round(rect.width * dpr);
          fx.height = Math.round(rect.height * dpr);
        }
        const ctx = fx.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

        // 16 拍 = 64 个 16 分音符；1 圈时长 = (60 / bpm) * 16 秒
        const dt = Math.min(0.08, Math.max(0, (now - playheadRef.current.lastTs) / 1000));
        playheadRef.current.lastTs = now;
        const loopSec = (60 / Math.max(40, bpmRef.current)) * 16;
        playheadRef.current.x = (playheadRef.current.x + dt / loopSec) % 1;

        const stepIdx = Math.min(TOTAL_STEPS - 1, Math.floor(playheadRef.current.x * TOTAL_STEPS));
        if (stepIdx !== playheadRef.current.lastStep) {
          playheadRef.current.lastStep = stepIdx;
          const stepSec = loopSec / TOTAL_STEPS;
          const sPreset = SUSTAIN_PRESETS.find((p) => p.id === sustainRef.current) || SUSTAIN_PRESETS[0];
          const events = gridRef.current[stepIdx] || [];
          for (const ev of events) {
            const noteDur = Math.min(3.5, Math.max(0.45, ((ev.spanSteps || 1) * stepSec + (ev.tailSec || 1.2)) * sPreset.mul));
            triggerSynthNote(ev.freq, {
              instrument: ev.instrument,
              velocity: ev.velocity,
              duration: noteDur,
              laneIndex: ev.laneIndex,
              reverb: reverbRef.current
            });
            ripplesRef.current.push({
              x: ev.x * rect.width,
              y: ev.y * rect.height,
              color: darkRef.current ? ev.darkColor : ev.color,
              r: 6,
              alpha: 0.92
            });
          }
        }

        // 发光游标线
        const px = playheadRef.current.x * rect.width;
        const grad = ctx.createLinearGradient(px - 22, 0, px + 2, 0);
        grad.addColorStop(0, "rgba(251, 191, 36, 0)");
        grad.addColorStop(1, darkRef.current ? "rgba(251, 191, 36, 0.35)" : "rgba(217, 119, 6, 0.22)");
        ctx.fillStyle = grad;
        ctx.fillRect(px - 22, 0, 22, rect.height);

        ctx.strokeStyle = darkRef.current ? "#FBBF24" : "#D97706";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, rect.height);
        ctx.stroke();

        // 触音水墨光圈粒子
        const nextRipples = [];
        for (const rp of ripplesRef.current) {
          rp.r += 1.45;
          rp.alpha -= 0.032;
          if (rp.alpha > 0.02) {
            ctx.strokeStyle = rp.color;
            ctx.globalAlpha = rp.alpha;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
            ctx.stroke();
            nextRipples.push(rp);
          }
        }
        ctx.globalAlpha = 1;
        ripplesRef.current = nextRipples;

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      };
    }, [isOpen, isPlaying]);

    // 关闭弹窗时立刻停止播放并取消逐笔动画
    useEffect(() => {
      if (!isOpen) {
        animTokenRef.current += 1;
        if (isPlaying) setIsPlaying(false);
      }
    }, [isOpen]);

    if (!isOpen) return null;

    const getNormPoint = (e) => {
      const wrap = wrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      };
    };

    const eraseAtPoint = (pt) => {
      const threshold = 0.045;
      setStrokes((prev) =>
        prev.filter((st) => !(st.points || []).some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < threshold))
      );
    };

    const auditionPoint = (pt, brush, vel) => {
      const now = performance.now();
      const note = yToScaleNote(pt.y, scaleId);
      if (note.noteIndex !== lastAuditionRef.current.noteIdx || now - lastAuditionRef.current.at > 130) {
        lastAuditionRef.current = { noteIdx: note.noteIndex, at: now };
        const sPreset = SUSTAIN_PRESETS.find((p) => p.id === sustainId) || SUSTAIN_PRESETS[0];
        const tail = INSTRUMENT_TAIL_SEC[brush.instrument] || 1.1;
        triggerSynthNote(note.freq, {
          instrument: brush.instrument,
          velocity: vel * 0.85,
          duration: Math.min(2.6, Math.max(0.5, tail * sPreset.mul * 0.85)),
          laneIndex: note.laneIndex,
          reverb: reverbOn
        });
      }
    };

    const handlePointerDown = (e) => {
      e.preventDefault();
      ensureAudioCtx();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
      const pt = getNormPoint(e);
      if (!pt) return;
      if (eraserMode) {
        drawingRef.current = { erasing: true };
        eraseAtPoint(pt);
        return;
      }
      const brush = getBrushById(brushId);
      const sz = BRUSH_SIZES[sizeIdx] || BRUSH_SIZES[1];
      const newStroke = {
        id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        brushId: brush.id,
        width: sz.width,
        velocity: sz.velocity,
        points: [pt]
      };
      drawingRef.current = newStroke;
      auditionPoint(pt, brush, sz.velocity);
      drawStaticCanvas([...strokes, newStroke]);
    };

    const handlePointerMove = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const pt = getNormPoint(e);
      if (!pt) return;
      if (drawingRef.current.erasing) {
        eraseAtPoint(pt);
        return;
      }
      const pts = drawingRef.current.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.008) return;
      pts.push(pt);
      const brush = getBrushById(drawingRef.current.brushId);
      auditionPoint(pt, brush, drawingRef.current.velocity);
      drawStaticCanvas([...strokes, drawingRef.current]);
    };

    const handlePointerEnd = () => {
      if (!drawingRef.current) return;
      const finished = drawingRef.current;
      drawingRef.current = null;
      if (finished.erasing) return;
      setStrokes((prev) => [...prev.slice(-80), finished]);
    };

    const handleLoadNextDemo = () => {
      ensureAudioCtx();
      const demos = buildDemoArtworks();
      const demo = demos[demoIdx % demos.length];
      setDemoIdx((i) => i + 1);
      setScaleId(demo.scaleId);
      setBpm(demo.bpm);
      setStrokes(demo.strokes);
      playheadRef.current.x = 0;
      playheadRef.current.lastStep = -1;
      setIsPlaying(true);
      flashToast(`🎨 ${demo.name}`);
    };

    const handleExportPng = () => {
      const canvas = bgCanvasRef.current;
      if (!canvas) return;
      try {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `绘境_${Date.now()}.png`;
        a.click();
        flashToast("🖼️ 已导出");
      } catch (e) { }
    };

    const handleOpenVault = async () => {
      const list = await listArtworks();
      setSavedList(list);
      setShowVault(true);
    };

    const handleSaveCurrent = async () => {
      if (strokes.length === 0) return flashToast("先画几笔再存吧");
      const name = window.prompt("给这幅音画起个名字：", activeInscription ? `《${activeInscription.title}》` : `绘境小调 ${new Date().getMonth() + 1}.${new Date().getDate()}`);
      if (!name || !name.trim()) return;
      await saveArtwork({ name: name.trim(), scaleId, bpm, strokes });
      const list = await listArtworks();
      setSavedList(list);
      flashToast("💾 已保存");
    };

    const handleOpenCharCompose = async () => {
      setShowSettings(false);
      if (global.HuiJingAiComposer && typeof global.HuiJingAiComposer.loadAvailableCharacters === "function") {
        const list = await global.HuiJingAiComposer.loadAvailableCharacters();
        setCharList(list);
        if (list.length > 0 && !list.some((c) => String(c.id) === String(selectedCharId))) {
          setSelectedCharId(String(list[0].id));
        }
      }
      setShowCharCompose(true);
    };

    const handleRunCharCompose = async () => {
      const composer = global.HuiJingAiComposer;
      const targetChar = charList.find((c) => String(c.id) === String(selectedCharId)) || charList[0];
      if (!composer || !targetChar || isComposing) return;
      ensureAudioCtx();
      setIsComposing(true);
      try {
        const res = await composer.composeForCharacter({
          character: targetChar,
          motif: motifInput.trim()
        });
        if (!res || !res.ok || !Array.isArray(res.strokes) || res.strokes.length === 0) {
          flashToast("作画受阻，请重试");
          return;
        }
        const token = ++animTokenRef.current;
        setShowCharCompose(false);
        setIsPlaying(false);
        setScaleId(res.scaleId || "pentatonic");
        setBpm(res.bpm || 98);
        setSustainId(res.sustainId || "long");
        setActiveInscription({ charName: res.charName, title: res.title, note: res.note });
        setInscriptionCollapsed(false);
        setStrokes([]);
        flashToast(`🎭 ${res.charName} 正在落笔《${res.title}》…`);

        // 逐笔现场落墨动画 + 同步试音
        const allStrokes = res.strokes;
        for (let i = 0; i < allStrokes.length; i++) {
          if (token !== animTokenRef.current) return;
          const st = allStrokes[i];
          setStrokes((prev) => [...prev, st]);
          const firstPt = st.points && st.points[0];
          if (firstPt) {
            const brush = getBrushById(st.brushId);
            const note = yToScaleNote(firstPt.y, res.scaleId || "pentatonic");
            triggerSynthNote(note.freq, {
              instrument: brush.instrument,
              velocity: st.velocity || 0.8,
              duration: 1.25,
              laneIndex: note.laneIndex,
              reverb: reverbOn
            });
          }
          await new Promise((r) => setTimeout(r, 230));
        }
        if (token !== animTokenRef.current) return;
        playheadRef.current.x = 0;
        playheadRef.current.lastStep = -1;
        setIsPlaying(true);
      } finally {
        setIsComposing(false);
      }
    };

    const curScale = getScaleById(scaleId);
    const curBrush = getBrushById(brushId);

    const topBtn = (active = false) => ({
      border: active ? "1px solid #FBBF24" : "1px solid rgba(255,255,255,0.14)",
      background: active ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.08)",
      color: active ? "#FDE68A" : "#E2E8F0",
      borderRadius: "10px",
      padding: "5px 8px",
      fontSize: "12px",
      fontWeight: 700,
      cursor: "pointer",
      flexShrink: 0,
      whiteSpace: "nowrap"
    });

    const helpItems = [
      { icon: "画布", desc: "左右为时间循环，越靠上音越高、越靠下音越低；落笔即发声，画线条自动奏出连贯旋律。" },
      { icon: "🎨 色点", desc: "前 2 色黑白水墨（玄墨古琴 / 淡墨木鱼玉磬），后 8 色国风彩墨对应古筝、琵琶、扬琴、竹笛、洞箫、二胡、编钟、钢琴。" },
      { icon: "▶ / ♩", desc: "开启发光游标循环演奏；点 ♩ 可循环调节 84 / 104 / 128 / 148 速度。" },
      { icon: "🎼 / 🌊", desc: "🎼 切换五声国风/C大调/A小调/空灵都节；🌊 开关古风厅堂混响。" },
      { icon: "🎨 / 💾", desc: "🎨 一键载入示范音画体验；💾 存入作品集或导出高清 PNG 画作。" }
    ];

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99990,
          background: "#0B0E14",
          color: "#F8FAFC",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          userSelect: "none"
        }
      },
      // 顶栏（极简 4 键：返回 / 播放 / 设置 / 名士奏画）
      h(
        "div",
        {
          style: {
            padding: "calc(8px + env(safe-area-inset-top, 0px)) 10px 8px",
            background: "rgba(15, 19, 28, 0.96)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            flexShrink: 0
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("button", { type: "button", title: "返回", onClick: () => { animTokenRef.current += 1; setIsPlaying(false); onClose && onClose(); }, style: topBtn(false) }, "←"),
          h(
            "button",
            {
              type: "button",
              title: isPlaying ? "暂停" : "播放循环",
              onClick: () => {
                ensureAudioCtx();
                setIsPlaying((p) => !p);
              },
              style: { ...topBtn(isPlaying), background: isPlaying ? "#16A34A" : "#2563EB", border: "none", color: "#FFF", padding: "6px 14px" }
            },
            isPlaying ? "⏸" : "▶"
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h(
            "button",
            {
              type: "button",
              onClick: () => { setShowCharCompose(false); setShowSettings(true); },
              style: topBtn(showSettings)
            },
            "⚙️ 设置"
          ),
          h(
            "button",
            {
              type: "button",
              disabled: isComposing,
              onClick: handleOpenCharCompose,
              style: {
                ...topBtn(showCharCompose),
                background: "linear-gradient(135deg, rgba(168,85,247,0.34) 0%, rgba(236,72,153,0.28) 100%)",
                border: "1px solid rgba(216,180,254,0.45)",
                color: "#F5D0FE"
              }
            },
            isComposing ? "🎭 作画中…" : "🎭 名士奏画"
          )
        )
      ),

      // 中央双层画布区
      h(
        "div",
        {
          ref: wrapRef,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerEnd,
          onPointerCancel: handlePointerEnd,
          onContextMenu: (e) => e.preventDefault(),
          style: {
            flex: 1,
            minHeight: 0,
            position: "relative",
            touchAction: "none",
            cursor: eraserMode ? "cell" : "crosshair",
            overflow: "hidden"
          }
        },
        h("canvas", { ref: bgCanvasRef, style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" } }),
        h("canvas", { ref: fxCanvasRef, style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" } }),
        // 左上角当前音色微标
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "10px",
              left: "10px",
              pointerEvents: "none",
              background: darkCanvas ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.82)",
              color: darkCanvas ? "#E2E8F0" : "#44403C",
              border: "1px solid rgba(148,163,184,0.22)",
              borderRadius: "999px",
              padding: "3px 10px",
              fontSize: "11px",
              fontWeight: 700
            }
          },
          eraserMode ? "🧹 擦除" : `${curBrush.icon} ${curBrush.name}·${curBrush.instName}`
        ),
        toast &&
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "10px",
              right: "10px",
              pointerEvents: "none",
              background: "rgba(15,23,42,0.85)",
              color: "#FDE68A",
              borderRadius: "999px",
              padding: "4px 10px",
              fontSize: "11.5px",
              fontWeight: 700
            }
          },
          toast
        ),
        // 名士题跋浮动诗笺（可收起，不遮挡合奏作画）
        activeInscription &&
        h(
          "div",
          {
            onPointerDown: (e) => e.stopPropagation(),
            style: {
              position: "absolute",
              left: "10px",
              right: "10px",
              bottom: "10px",
              zIndex: 8,
              background: darkCanvas ? "rgba(15, 23, 42, 0.84)" : "rgba(255, 251, 242, 0.92)",
              backdropFilter: "blur(8px)",
              border: darkCanvas ? "1px solid rgba(251,191,36,0.28)" : "1px solid #E5D4B3",
              borderRadius: "14px",
              padding: inscriptionCollapsed ? "6px 10px" : "9px 12px",
              color: darkCanvas ? "#F1F5F9" : "#3E362E",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", fontSize: "12px", fontWeight: 700 } },
            h("span", null, `🎭 ${activeInscription.charName} · 《${activeInscription.title}》`),
            h(
              "div",
              { style: { display: "flex", gap: "6px" } },
              h("button", { type: "button", onClick: () => setInscriptionCollapsed((v) => !v), style: { border: "none", background: "transparent", color: "inherit", opacity: 0.75, cursor: "pointer", fontSize: "11px" } }, inscriptionCollapsed ? "展开" : "收起"),
              h("button", { type: "button", onClick: () => setActiveInscription(null), style: { border: "none", background: "transparent", color: "inherit", opacity: 0.75, cursor: "pointer", fontSize: "11px" } }, "✕")
            )
          ),
          !inscriptionCollapsed &&
            h("div", { style: { fontSize: "11.5px", lineHeight: 1.5, opacity: 0.9 } }, `“${activeInscription.note}”`)
        )
      ),

      // 底部：10 色水墨/彩墨调色盘（横滑）+ 粗细/橡皮/撤销/清空
      h(
        "div",
        {
          style: {
            padding: "8px 10px calc(10px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(15, 19, 28, 0.98)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            flexShrink: 0
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", overflowX: "auto", scrollbarWidth: "none", padding: "2px 0" } },
          BRUSH_PALETTE.map((b) => {
            const active = !eraserMode && brushId === b.id;
            return h(
              "button",
              {
                key: b.id,
                type: "button",
                title: `${b.name}（${b.instName}）`,
                onClick: () => {
                  setEraserMode(false);
                  setBrushId(b.id);
                  const note = yToScaleNote(0.42, scaleId);
                  triggerSynthNote(note.freq, { instrument: b.instrument, velocity: 0.78, duration: 0.38, laneIndex: 3, reverb: reverbOn });
                },
                style: {
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  background: darkCanvas ? b.darkColor : b.color,
                  border: active ? "2.5px solid #FBBF24" : "2px solid rgba(255,255,255,0.22)",
                  boxShadow: active ? "0 0 0 2px rgba(251,191,36,0.35)" : "none",
                  cursor: "pointer",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  padding: 0
                }
              },
              active ? b.icon : ""
            );
          })
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            BRUSH_SIZES.map((sz, idx) =>
              h(
                "button",
                {
                  key: sz.id,
                  type: "button",
                  title: "笔触粗细（影响演奏力度）",
                  onClick: () => { setEraserMode(false); setSizeIdx(idx); },
                  style: {
                    width: "30px",
                    height: "28px",
                    borderRadius: "8px",
                    border: !eraserMode && sizeIdx === idx ? "1px solid #FBBF24" : "1px solid rgba(255,255,255,0.14)",
                    background: !eraserMode && sizeIdx === idx ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }
                },
                h("span", { style: { width: `${sz.dot}px`, height: `${sz.dot}px`, borderRadius: "50%", background: "#E2E8F0", display: "block" } })
              )
            )
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h("button", { type: "button", title: "橡皮擦（点触擦除整笔）", onClick: () => setEraserMode((v) => !v), style: topBtn(eraserMode) }, "🧹"),
            h("button", { type: "button", title: "撤销上一笔", onClick: () => setStrokes((p) => p.slice(0, -1)), style: topBtn(false) }, "↩"),
            h("button", { type: "button", title: "清空画布", onClick: () => setStrokes([]), style: topBtn(false) }, "🗑️")
          )
        )
      ),

      // ⚙️ 设置收纳弹窗（聚合全部参数与工具）
      showSettings &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget) setShowSettings(false); },
          style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
        },
        h(
          "div",
          { style: { width: "100%", maxWidth: "350px", background: "#161B26", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontWeight: 700, fontSize: "14px" } }, "⚙️ 绘·境 设置"),
            h("button", { type: "button", onClick: () => setShowSettings(false), style: topBtn(false) }, "✕")
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            h("span", { style: { opacity: 0.7 } }, "🎼 音阶调式"),
            h(
              "div",
              { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              SCALE_PRESETS.map((sc) =>
                h("button", { key: sc.id, type: "button", onClick: () => setScaleId(sc.id), style: topBtn(scaleId === sc.id) }, sc.name)
              )
            )
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            h("span", { style: { opacity: 0.7 } }, "⏳ 延音余韵 & ♩ 速度"),
            h(
              "div",
              { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              SUSTAIN_PRESETS.map((sp) =>
                h("button", { key: sp.id, type: "button", onClick: () => setSustainId(sp.id), style: topBtn(sustainId === sp.id) }, sp.label)
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "2px" } },
              [84, 104, 128, 148].map((b) =>
                h("button", { key: b, type: "button", onClick: () => setBpm(b), style: topBtn(bpm === b) }, `♩${b}`)
              )
            )
          ),
          h(
            "div",
            { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
            h("button", { type: "button", onClick: () => setReverbOn((v) => !v), style: topBtn(reverbOn) }, reverbOn ? "🌊 混响开" : "🌊 混响关"),
            h("button", { type: "button", onClick: () => setDarkCanvas((v) => !v), style: topBtn(false) }, darkCanvas ? "🌙 星夜墨砚" : "☀️ 宣纸素笺"),
            h("button", { type: "button", onClick: () => setShowGrid((v) => !v), style: topBtn(showGrid) }, showGrid ? "⊞ 网格开" : "⊞ 网格关")
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "10px" } },
            h("button", { type: "button", onClick: () => { setShowSettings(false); handleLoadNextDemo(); }, style: { ...topBtn(false), flex: 1 } }, "🎨 示范画"),
            h("button", { type: "button", onClick: () => { setShowSettings(false); handleOpenVault(); }, style: { ...topBtn(false), flex: 1 } }, "💾 作品集"),
            h("button", { type: "button", onClick: () => { setShowSettings(false); setShowHelp(true); }, style: topBtn(false) }, "?")
          )
        )
      ),

      // 🎭 名士奏画选择弹窗（选名士 + 可选指定意象）
      showCharCompose &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget && !isComposing) setShowCharCompose(false); },
          style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(0,0,0,0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
        },
        h(
          "div",
          { style: { width: "100%", maxWidth: "360px", maxHeight: "80vh", background: "#161B26", border: "1px solid rgba(216,180,254,0.28)", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontWeight: 700, fontSize: "14px", color: "#F5D0FE" } }, "🎭 邀名士为你奏画"),
            h("button", { type: "button", disabled: isComposing, onClick: () => setShowCharCompose(false), style: topBtn(false) }, "✕")
          ),
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "130px", overflowY: "auto" } },
            charList.length === 0
              ? h("span", { style: { opacity: 0.6 } }, "未找到可选名士，请先在传讯中添加角色")
              : charList.map((c) => {
                  const active = String(c.id) === String(selectedCharId);
                  return h(
                    "button",
                    {
                      key: c.id,
                      type: "button",
                      onClick: () => setSelectedCharId(String(c.id)),
                      style: topBtn(active)
                    },
                    c.name
                  );
                })
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            h("input", {
              type: "text",
              value: motifInput,
              onChange: (e) => setMotifInput(e.target.value),
              placeholder: "指定意象（可留空让 TA 按心境与近况自由创作）…",
              style: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "10px", padding: "8px 10px", color: "#FFF", fontSize: "12px", outline: "none" }
            }),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "5px" } },
              ((global.HuiJingAiComposer && global.HuiJingAiComposer.MOTIF_CHIPS) || []).map((chip) =>
                h(
                  "button",
                  {
                    key: chip,
                    type: "button",
                    onClick: () => setMotifInput(chip),
                    style: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#CBD5E1", borderRadius: "999px", padding: "3px 8px", fontSize: "11px", cursor: "pointer" }
                  },
                  chip
                )
              )
            )
          ),
          h(
            "button",
            {
              type: "button",
              disabled: isComposing || charList.length === 0,
              onClick: handleRunCharCompose,
              style: {
                padding: "10px",
                borderRadius: "12px",
                border: "none",
                background: isComposing ? "#475569" : "linear-gradient(135deg, #9333EA 0%, #DB2777 100%)",
                color: "#FFF",
                fontSize: "13px",
                fontWeight: 700,
                cursor: isComposing ? "not-allowed" : "pointer"
              }
            },
            isComposing ? "✨ 正在执笔谱曲中…" : "✨ 请 TA 为我作画演奏"
          )
        )
      ),

      // 作品集与 PNG 导出抽屉
      showVault &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget) setShowVault(false); },
          style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
        },
        h(
          "div",
          { style: { width: "100%", maxWidth: "350px", maxHeight: "75vh", background: "#161B26", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "18px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontWeight: 700, fontSize: "14px" } }, "💾 绘·境 作品集"),
            h("button", { type: "button", onClick: () => setShowVault(false), style: topBtn(false) }, "✕")
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            h("button", { type: "button", onClick: handleSaveCurrent, style: { ...topBtn(true), flex: 1 } }, "💾 保存当前"),
            h("button", { type: "button", onClick: handleExportPng, style: { ...topBtn(false), flex: 1 } }, "🖼️ 导出PNG")
          ),
          h(
            "div",
            { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" } },
            savedList.length === 0
              ? h("div", { style: { textAlign: "center", opacity: 0.55, fontSize: "12px", padding: "20px 0" } }, "暂无保存的音画作品")
              : savedList.map((item) =>
                h(
                  "div",
                  { key: item.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.06)", padding: "8px 10px", borderRadius: "10px" } },
                  h(
                    "div",
                    { style: { cursor: "pointer", flex: 1 }, onClick: () => { setStrokes(item.strokes || []); setScaleId(item.scaleId || "pentatonic"); setBpm(item.bpm || 104); setShowVault(false); setIsPlaying(true); } },
                    h("div", { style: { fontSize: "12.5px", fontWeight: 700 } }, item.name),
                    h("div", { style: { fontSize: "10.5px", opacity: 0.65 } }, `${(item.strokes || []).length} 笔 · ♩${item.bpm}`)
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: async () => {
                        await deleteArtwork(item.id);
                        setSavedList((prev) => prev.filter((x) => x.id !== item.id));
                      },
                      style: { border: "none", background: "transparent", color: "#F87171", cursor: "pointer", fontSize: "13px" }
                    },
                    "🗑️"
                  )
                )
              )
          )
        )
      ),

      // ? 图标说明弹窗
      showHelp &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget) setShowHelp(false); },
          style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
        },
        h(
          "div",
          { style: { width: "100%", maxWidth: "340px", background: "#161B26", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontWeight: 700, fontSize: "14px" } }, "🎨 绘·境 玩法说明"),
            h("button", { type: "button", onClick: () => setShowHelp(false), style: topBtn(false) }, "✕")
          ),
          helpItems.map((it) =>
            h(
              "div",
              { key: it.icon, style: { display: "flex", gap: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "10px", padding: "8px 10px", fontSize: "11.5px", lineHeight: 1.45 } },
              h("span", { style: { minWidth: "54px", fontWeight: 700, color: "#FDE68A", flexShrink: 0 } }, it.icon),
              h("span", { style: { color: "#CBD5E1" } }, it.desc)
            )
          )
        )
      )
    );
  }

  const api = {
    DB_NAME,
    TOTAL_STEPS,
    MAX_VOICES_PER_STEP,
    SCALE_PRESETS,
    BRUSH_PALETTE,
    BRUSH_SIZES,
    yToScaleNote,
    compileStrokesToGrid,
    buildDemoArtworks,
    saveArtwork,
    listArtworks,
    deleteArtwork,
    HuiJingCanvasModal
  };

  global.HuiJingCanvasEngine = api;
  global.HuiJingCanvasModal = HuiJingCanvasModal;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

