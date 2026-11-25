/**
 * Milvus/guangling_voice_engine.js (v1.0)
 * 广陵联播 3.0 独立语音合成与播报引擎（零第三方运行时依赖，纯 IIFE，兼容 HTTP 与 file://）
 * - Mode 1 ("animalese"): 仿《动物森友会 / 朋友收集》中文四声双核语音合成
 *   - 核 A: 364Hz 平直普通话音节精灵切片（HTTP 下按需加载，iOS Safari 自动优先 .m4a，其余优先 .ogg）
 *   - 核 B: 三路并联共振峰数学合成器（锯齿+三角双声门源 + F1/F2/F3 + 清辅音噪声脉冲，file:// 自动无感降级）
 *   - VoiceClock 双时钟解耦 + 滞后虚词吞略 + 句尾双字保护 + 8点半音四声滑音轮廓
 * - Mode 2 ("webspeech"): 浏览器原生 Web Speech API 中文真人口播（带安卓 onend 兜底）
 * - Mode 3 ("blip"): 复古 Mii 电子哔哔声
 * - Mode 4 ("mute"): 静音模式（仅保持字幕推进）
 * - 零新增 localStorage 写入，零 Emoji
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_GUANGLING_VOICE_ENGINE_LOADED__) return;
  global.__MILVUS_GUANGLING_VOICE_ENGINE_LOADED__ = true;

  const DEFAULT_BANK_HZ = 364;
  const DEFAULT_UNIT_DUR = 0.115;

  const DEFAULT_VOICE_CONFIG = {
    mode: "animalese", // "animalese" | "clone" | "webspeech" | "blip" | "mute"
    preset: "sunny-helper",
    basePitchHz: 485,
    unitsPerSecond: 10.2,
    toneAmount: 0.62,
    mixRatio: 0.0, // 0 = 100% 纯清晰中文音节采样, 0.5 = 双核混音, 1.0 = 纯数学共振峰
    warmthHz: 9500,
    volume: 0.84,
    maxLag: 0.75,
    webSpeechRate: 1.08,
    webSpeechPitch: 1.0,
    webSpeechVoiceURI: "",
    cloneVoiceId: "",
    clonePrefetch: true,
    anchorCharId: "",
    anchorVoiceMap: {}
  };

  const VOICE_PRESETS = [
    {
      id: "sunny-helper",
      name: "灵动小报童",
      desc: "原版动森清亮纯采样，四声灵动，适合活泼主持与心纸君默认播报",
      config: { basePitchHz: 515, unitsPerSecond: 10.0, toneAmount: 0.62, mixRatio: 0.0, warmthHz: 9500 }
    },
    {
      id: "silk-anchor",
      name: "端庄播音腔",
      desc: "中音清晰稳重纯采样，带有正式新闻台的轻盈质感",
      config: { basePitchHz: 390, unitsPerSecond: 9.8, toneAmount: 0.55, mixRatio: 0.0, warmthHz: 7800 }
    },
    {
      id: "scholar-warm",
      name: "温润公子音",
      desc: "温和清雅的中低纯采样声线，低通柔化齿音",
      config: { basePitchHz: 300, unitsPerSecond: 9.4, toneAmount: 0.46, mixRatio: 0.05, warmthHz: 5200 }
    },
    {
      id: "uncle-nook",
      name: "沉稳大掌柜",
      desc: "低沉磁性慢语速，带有温暖厚实的共鸣底色",
      config: { basePitchHz: 245, unitsPerSecond: 10.0, toneAmount: 0.34, mixRatio: 0.12, warmthHz: 3200 }
    },
    {
      id: "honey-hybrid",
      name: "复古电台混音",
      desc: "采样与共振峰等功率融合，经典动森复古电台味",
      config: { basePitchHz: 448, unitsPerSecond: 12.0, toneAmount: 0.52, mixRatio: 0.5, warmthHz: 6000 }
    }
  ];

  // 高频弱读虚词（滞后追赶时优先舍弃）
  const WEAK_ZH_CHARS = new Set(
    "的了么吗呢吧啊呀哦哈嘛呗着过在地得和与及而就也都还把被让给向从于之其这那哪"
  );

  // 内置精简高频中文播报词表（用于 file:// 或远程词表未加载时的离线四声兜底）
  const FALLBACK_ZH_GROUPS = {
    a5: "啊呀", ba5: "吧", bai2: "白", bao4: "报爆", bei3: "北", ben3: "本", bi3: "比",
    bian1: "边", biao3: "表", bie2: "别", bu4: "不部步", cai2: "才财", cao3: "草",
    cha2: "茶察", chan3: "产", chang2: "长常场", cheng2: "城成程", chi1: "吃", chu1: "出初",
    chuan2: "传船", chun1: "春", ci3: "此", cong2: "从", da4: "大", dai4: "代带待",
    dan4: "但", dang1: "当档", dao4: "到道", de5: "的得地", deng3: "等", di4: "第地",
    dian3: "点典", diao4: "调", ding4: "定", dong1: "东冬", dou1: "都", du2: "独读",
    dui4: "对队", duo1: "多", er2: "而儿", fa1: "发", fang1: "方坊", fei1: "非飞",
    fen1: "分", feng1: "风丰", fu3: "府", gai1: "该", gan3: "感", gao1: "高糕",
    gao4: "告", ge4: "个各", gei3: "给", gen1: "跟", geng4: "更", gong1: "公工宫",
    gu3: "古", guang3: "广", gui4: "桂贵", guo2: "国", guo4: "过果", hai2: "还海",
    hao3: "好号", he2: "和合河", hen3: "很", hong2: "红", hou4: "后候", hua1: "花",
    hua4: "话画化", huan1: "欢", huang2: "黄皇", hui2: "回", hui4: "会", huo3: "火",
    ji1: "机鸡", ji2: "及疾集极", ji3: "己几", ji4: "记计季", jia1: "家加佳", jia4: "价",
    jian1: "间", jian4: "见件建", jiang1: "江将", jiao1: "交", jie1: "街接", jie2: "节结",
    jin1: "今金", jin4: "近进", jing1: "京精经", jiu3: "九酒久", jiu4: "就旧", ju4: "据句局",
    jun1: "君军", kai1: "开", kan4: "看", ke3: "可", ke4: "客刻课", kong1: "空",
    kou3: "口", kuai4: "快", lai2: "来", lao3: "老", le5: "了", li3: "里理礼",
    li4: "立力历", lian2: "联连", liang3: "两", lin2: "林", ling2: "陵灵", liu2: "流留",
    lou2: "楼", lu4: "路录", lun4: "论", ma5: "吗嘛", mai3: "买", mai4: "卖",
    man3: "满", mao1: "猫", mei2: "没", mei3: "美每", men2: "门", men5: "们",
    mi4: "密蜜", mian4: "面", min2: "民", ming2: "明名", mo4: "莫", mu4: "目幕",
    na4: "那", nan2: "南难", ne5: "呢", nei4: "内", neng2: "能", ni3: "你您",
    nian2: "年", nuan3: "暖", nv3: "女", pai2: "排", peng2: "朋", pin3: "品",
    ping2: "平评", qi1: "期七", qi2: "其奇", qi3: "起", qi4: "气器", qian2: "前钱",
    qie3: "且", qin1: "亲", qing1: "清青轻", qing2: "情晴", qing3: "请", qiu1: "秋",
    qu4: "去趣", quan2: "全", ran2: "然", rang4: "让", re4: "热", ren2: "人仁",
    ren4: "任认", ri4: "日", ru2: "如", ru4: "入", san1: "三", se4: "色",
    shan1: "山", shang1: "商", shang4: "上尚", shao3: "少", she4: "社设", shen1: "身深",
    shen2: "神什", sheng1: "生声", sheng3: "省", shi1: "师诗", shi2: "时十实", shi3: "使始",
    shi4: "是事市室式", shou1: "收", shou3: "手首", shou4: "售受", shu1: "书舒", shu4: "数",
    shui3: "水", shuo1: "说", si1: "思司私", si4: "四肆", song4: "送", su4: "速素",
    sui4: "岁", suo3: "所", ta1: "他她它", tai4: "太台", tan2: "谈坛", tang2: "糖堂",
    te4: "特", tian1: "天", tian2: "甜", tiao2: "条", ting1: "听", tong1: "通",
    tong2: "同", tou2: "头", tu2: "图", tuan2: "团", wai4: "外", wan2: "完玩",
    wan3: "晚", wan4: "万", wang2: "王", wang3: "往网", wei1: "微", wei2: "为围",
    wei4: "位味未", wen1: "温", wen2: "文闻", wen4: "问", wo3: "我", wu2: "无",
    wu3: "五午", wu4: "物务", xi1: "西夕息", xi3: "喜", xi4: "细戏", xia4: "下夏",
    xian1: "先鲜", xian4: "现线", xiang1: "香相", xiang3: "想响", xiang4: "向象", xiao1: "消",
    xiao3: "小", xiao4: "笑校", xie1: "些", xie3: "写", xie4: "谢", xin1: "心新信",
    xing1: "星兴", xing2: "行", xiu4: "绣秀", xu1: "需", xuan1: "宣", xue2: "学",
    ya3: "雅", yan2: "言", yan3: "眼演", yang2: "阳杨", yao4: "要药", ye3: "也",
    ye4: "夜业叶", yi1: "一衣医", yi2: "宜仪", yi3: "已以", yi4: "意议易", yin1: "音因",
    ying1: "应英", yong4: "用", you1: "优", you2: "游由", you3: "有友", you4: "又右",
    yu2: "于鱼余", yu3: "语雨与", yu4: "玉遇", yuan2: "元圆园", yuan3: "远", yue4: "月悦",
    yun2: "云", zai4: "在再", zao3: "早", ze2: "则", zen3: "怎", zeng1: "增",
    zhan4: "站战", zhang1: "张章", zhang3: "长掌", zhao1: "朝招", zhao3: "找", zhe4: "这",
    zhe5: "着", zhen1: "真珍", zheng4: "正政", zhi1: "之知织", zhi2: "直值", zhi3: "纸只指",
    zhi4: "至制", zhong1: "中终", zhong4: "重众", zhou1: "周", zhu3: "主煮", zhu4: "注住",
    zhuan1: "专", zhuang4: "状", zhun3: "准", zi4: "字自", zong3: "总", zou3: "走",
    zuo4: "作做坐"
  };

  const FALLBACK_LEXICON = new Map();
  (function buildFallbackLexicon() {
    Object.keys(FALLBACK_ZH_GROUPS).forEach((code) => {
      const m = /^([a-z]+)([1-5])$/.exec(code);
      if (!m) return;
      const key = m[1];
      const tone = Number(m[2]);
      const chars = FALLBACK_ZH_GROUPS[code];
      for (let i = 0; i < chars.length; i++) {
        FALLBACK_LEXICON.set(chars[i], { key, tone });
      }
    });
  })();

  // 元音共振峰频率表 [F1, F2, F3]（Hz）
  const VOWEL_FORMANTS = {
    a: [760, 1280, 2550],
    o: [500, 920, 2450],
    e: [520, 1500, 2520],
    i: [310, 2280, 3020],
    u: [330, 820, 2320],
    v: [320, 1980, 2650]
  };

  const UNVOICED_INITIALS = ["zh", "ch", "sh", "p", "t", "k", "f", "s", "x", "h", "q", "c"];

  const LONG_PAUSE_RE = /[。！？!?…\n]/;
  const MED_PAUSE_RE = /[，、；：,:;—\-]/;
  const SILENT_PUNCT_RE = /[\s「」『』《》【】（）()\[\]“”"'‘’·•]/;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function isFileProtocol() {
    try {
      return typeof global.location !== "undefined" && global.location.protocol === "file:";
    } catch (_) {
      return false;
    }
  }

  function isLikelySafariOrIOS() {
    try {
      const ua = (global.navigator && global.navigator.userAgent) || "";
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in global);
      const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
      return isIOS || isSafari;
    } catch (_) {
      return false;
    }
  }

  function normalizeVoiceConfig(raw) {
    const base = { ...DEFAULT_VOICE_CONFIG };
    if (!raw || typeof raw !== "object") return base;
    const validModes = ["animalese", "clone", "webspeech", "blip", "mute"];
    base.mode = validModes.includes(raw.mode) ? raw.mode : base.mode;
    base.preset = typeof raw.preset === "string" && raw.preset ? raw.preset : base.preset;
    base.basePitchHz = clamp(Number(raw.basePitchHz) || base.basePitchHz, 180, 650);
    base.unitsPerSecond = clamp(Number(raw.unitsPerSecond) || base.unitsPerSecond, 5, 20);
    base.toneAmount = clamp(Number(raw.toneAmount ?? base.toneAmount), 0, 1.3);
    base.mixRatio = clamp(Number(raw.mixRatio ?? base.mixRatio), 0, 1);
    base.warmthHz = clamp(Number(raw.warmthHz) || base.warmthHz, 1200, 14000);
    base.volume = clamp(Number(raw.volume ?? base.volume), 0, 1);
    base.maxLag = clamp(Number(raw.maxLag) || base.maxLag, 0.2, 1.8);
    base.webSpeechRate = clamp(Number(raw.webSpeechRate) || base.webSpeechRate, 0.65, 1.6);
    base.webSpeechPitch = clamp(Number(raw.webSpeechPitch) || base.webSpeechPitch, 0.6, 1.5);
    base.webSpeechVoiceURI = typeof raw.webSpeechVoiceURI === "string" ? raw.webSpeechVoiceURI : "";
    base.cloneVoiceId = typeof raw.cloneVoiceId === "string" ? raw.cloneVoiceId.trim() : "";
    base.clonePrefetch = raw.clonePrefetch !== false;
    base.anchorCharId = typeof raw.anchorCharId === "string" ? raw.anchorCharId : String(raw.anchorCharId || "");
    base.anchorVoiceMap =
      raw.anchorVoiceMap && typeof raw.anchorVoiceMap === "object" ? { ...raw.anchorVoiceMap } : {};
    return base;
  }

  function applyPresetToVoiceConfig(cfg, presetId) {
    const found = VOICE_PRESETS.find((p) => p.id === presetId);
    if (!found) return normalizeVoiceConfig(cfg);
    return normalizeVoiceConfig({
      ...cfg,
      ...found.config,
      preset: found.id
    });
  }

  // ===================== 1. 中文文本分词与四声映射 =====================
  function parseRawHanziLexicon(rawObj) {
    const map = new Map();
    if (!rawObj || typeof rawObj !== "object") return map;
    const keys = Object.keys(rawObj);
    for (let i = 0; i < keys.length; i++) {
      const code = keys[i];
      const m = /^([a-z]+)([1-5])$/.exec(code);
      if (!m) continue;
      const py = m[1];
      const tone = Number(m[2]);
      const chars = String(rawObj[code] || "");
      for (let j = 0; j < chars.length; j++) {
        const ch = chars[j];
        if (!map.has(ch)) map.set(ch, { key: py, tone });
      }
    }
    return map;
  }

  function fallbackSyllableForChar(ch) {
    const code = ch.charCodeAt(0);
    const pool = ["ba", "da", "ga", "la", "ma", "na", "pa", "ta", "sa", "sha", "ji", "qi", "xi", "li", "mi", "ni", "bo", "mo", "po", "fo", "de", "ge", "he", "ke", "le", "me", "ne", "bu", "du", "gu", "hu", "ku", "lu", "mu", "nu", "su", "tu", "zu"];
    const key = pool[code % pool.length];
    const tone = (code % 4) + 1;
    return { key, tone };
  }

  /**
   * 将输入单句拆解为带标点停顿、语调类型与音节索引的 Token 列表
   */
  function tokenizeChineseText(text, lexiconMap, validBankKeys) {
    const str = String(text || "");
    const tokens = [];
    let clauseMood = "plain";
    const trimmed = str.trim();
    if (/[？?][」』”"）】]*$/.test(trimmed)) clauseMood = "question";
    else if (/[！!][」』”"）】]*$/.test(trimmed)) clauseMood = "exclaim";
    else if (/(?:……|\.\.\.)[」』”"）】]*$/.test(trimmed)) clauseMood = "ellipsis";

    const lex = lexiconMap && lexiconMap.size > 0 ? lexiconMap : FALLBACK_LEXICON;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (LONG_PAUSE_RE.test(ch)) {
        tokens.push({ charIndex: i, char: ch, speakable: false, pauseSec: 0.24, revealStep: 1.8 });
        continue;
      }
      if (MED_PAUSE_RE.test(ch)) {
        tokens.push({ charIndex: i, char: ch, speakable: false, pauseSec: 0.13, revealStep: 1.3 });
        continue;
      }
      if (SILENT_PUNCT_RE.test(ch)) {
        tokens.push({ charIndex: i, char: ch, speakable: false, pauseSec: 0.0, revealStep: 0.55 });
        continue;
      }

      // 汉字
      if (/[\u4e00-\u9fff]/.test(ch)) {
        let entry = lex.get(ch) || FALLBACK_LEXICON.get(ch) || fallbackSyllableForChar(ch);
        let key = entry.key;
        if (validBankKeys && validBankKeys.size > 0 && !validBankKeys.has(key)) {
          key = fallbackSyllableForChar(ch).key;
        }
        tokens.push({
          charIndex: i,
          char: ch,
          speakable: true,
          key,
          tone: entry.tone || 1,
          weak: WEAK_ZH_CHARS.has(ch) || entry.tone === 5,
          clauseMood,
          pauseSec: 0,
          revealStep: 1.0
        });
        continue;
      }

      // 英文字母/数字
      if (/[A-Za-z0-9]/.test(ch)) {
        // 连续字母或数字每隔 2 字符发一次音，避免英文缩写念得过密
        const prevIsAscii = i > 0 && /[A-Za-z0-9]/.test(str[i - 1]);
        const speakThis = !prevIsAscii || i % 2 === 0;
        const entry = fallbackSyllableForChar(ch.toLowerCase());
        tokens.push({
          charIndex: i,
          char: ch,
          speakable: speakThis,
          key: entry.key,
          tone: 1,
          weak: !speakThis,
          clauseMood,
          pauseSec: 0,
          revealStep: 0.52
        });
        continue;
      }

      tokens.push({ charIndex: i, char: ch, speakable: false, pauseSec: 0, revealStep: 0.8 });
    }

    // 标记句尾双字保护（每个分句最后两个可发音音节锁死不被滞后丢弃）
    const speakableIndices = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].speakable) {
        speakableIndices.push(i);
      } else if (tokens[i].pauseSec >= 0.13) {
        const len = speakableIndices.length;
        if (len >= 1) tokens[speakableIndices[len - 1]].tailProtected = true;
        if (len >= 2) tokens[speakableIndices[len - 2]].tailProtected = true;
        speakableIndices.length = 0;
      }
    }
    const remLen = speakableIndices.length;
    if (remLen >= 1) tokens[speakableIndices[remLen - 1]].tailProtected = true;
    if (remLen >= 2) tokens[speakableIndices[remLen - 2]].tailProtected = true;

    return tokens;
  }

  // ===================== 2. 8 点半音四声滑音轮廓求解 =====================
  const TONE_ANCHORS = {
    1: [0.8, 0.8],
    2: [-0.6, 1.6],
    3: [-1.0, -1.8, -0.6],
    4: [1.6, -1.2],
    5: [-0.8, -0.8]
  };

  function samplePolyline(anchors, t) {
    if (anchors.length === 1) return anchors[0];
    const pos = clamp(t, 0, 1) * (anchors.length - 1);
    const idx = Math.min(anchors.length - 2, Math.floor(pos));
    const frac = pos - idx;
    return anchors[idx] + (anchors[idx + 1] - anchors[idx]) * frac;
  }

  /**
   * 计算 8 点半音曲线 -> 采样 playbackRate 曲线与共振峰基频曲线
   */
  function solvePitchContour(unit, positionRatio, isFinalUnit, bankHz, unitDur, cfg) {
    const anchors = TONE_ANCHORS[unit.tone] || TONE_ANCHORS[1];
    const toneScale = clamp(cfg.toneAmount ?? 0.65, 0, 1.4);
    const baseHz = clamp(cfg.basePitchHz || 460, 180, 650);
    const refBankHz = bankHz || DEFAULT_BANK_HZ;

    // 确定性微抖动（±0.22 st），避免机械重复感
    const jitterSeed = (hashString(`${unit.key}:${unit.charIndex}`) % 1000) / 1000;
    const microJitter = (jitterSeed - 0.5) * 0.44;
    // 自然句调倾角（Downdrift）
    const downdrift = -0.85 * clamp(positionRatio, 0, 1);

    const mood = unit.clauseMood || "plain";
    const rates = new Float32Array(8);
    const freqs = new Float32Array(8);

    for (let k = 0; k < 8; k++) {
      const t = k / 7;
      let st = samplePolyline(anchors, t) * toneScale + downdrift + microJitter;
      if (mood === "exclaim") {
        st += 0.9 + 0.5 * t;
      } else if (mood === "ellipsis" && isFinalUnit) {
        st -= 0.7 * t;
      } else if (mood === "question" && isFinalUnit) {
        st += 3.0 * t * t;
      }
      const ratio = Math.pow(2, st / 12);
      const targetHz = clamp(baseHz * ratio, 95, 1300);
      freqs[k] = targetHz;
      rates[k] = clamp(targetHz / refBankHz, 0.35, 3.2);
    }

    const dur = clamp((unitDur || DEFAULT_UNIT_DUR) * (unit.tone === 5 ? 0.78 : 1.0), 0.055, 0.16);
    return { rates, freqs, duration: dur };
  }

  // ===================== 3. 双时钟滞后丢字调度器 =====================
  function scheduleVoiceDecision(clockState, nowSec, unit, cfg) {
    const maxRate = clamp(cfg.unitsPerSecond || 10.5, 5, 22);
    const minStep = 1 / maxRate;
    const maxLag = clamp(cfg.maxLag || 0.72, 0.15, 2.0);
    const cand = Math.max(nowSec, clockState.lastVoiceSec + minStep, clockState.freeSec);
    const lag = cand - nowSec;

    if (!unit.tailProtected) {
      if (lag > maxLag * 2) {
        return { speak: false, startSec: cand, lag, reason: "lag_heavy" };
      }
      if (lag > maxLag && unit.weak) {
        return { speak: false, startSec: cand, lag, reason: "lag_weak" };
      }
    }

    clockState.lastVoiceSec = cand;
    return { speak: true, startSec: cand, lag, reason: "ok" };
  }

  // ===================== 4. 音节共振峰解析 =====================
  function extractFormantTargets(syllableKey) {
    const k = String(syllableKey || "a").toLowerCase();
    let hasUnvoicedInitial = false;
    for (let i = 0; i < UNVOICED_INITIALS.length; i++) {
      if (k.startsWith(UNVOICED_INITIALS[i])) {
        hasUnvoicedInitial = true;
        break;
      }
    }
    const vowels = [];
    for (let i = 0; i < k.length; i++) {
      const ch = k[i];
      if (VOWEL_FORMANTS[ch]) vowels.push(ch);
    }
    const v1 = vowels[0] || "a";
    const v2 = vowels[vowels.length - 1] || v1;
    return {
      startF: VOWEL_FORMANTS[v1],
      endF: VOWEL_FORMANTS[v2],
      hasUnvoicedInitial
    };
  }

  // ===================== 5. 主语音引擎类 =====================
  class GuanglingVoiceController {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.warmthFilter = null;
      this.compressor = null;
      this.noiseBuffer = null;

      this.config = normalizeVoiceConfig(DEFAULT_VOICE_CONFIG);
      this.playSessionId = 0;
      this.activeTimers = new Set();
      this.activeNodes = new Set();
      this.activeAudioEl = null;
      this.activeAudioUrl = "";

      // 采样声库状态
      this.bankStatus = "idle"; // "idle" | "loading" | "ready" | "fallback"
      this.bankManifest = null;
      this.bankRawAudio = null;
      this.bankDecodedBuffer = null;
      this.bankFormatUsed = "";
      this.lexiconMap = new Map();
      this.validBankKeys = new Set();
      this.assetLoadPromise = null;

      this._bindFirstGestureUnlock();
    }

    _bindFirstGestureUnlock() {
      if (typeof document === "undefined") return;
      const onFirstGesture = () => {
        this.unlock().catch(() => {});
      };
      try {
        document.addEventListener("pointerdown", onFirstGesture, { once: true, passive: true });
        document.addEventListener("keydown", onFirstGesture, { once: true, passive: true });
      } catch (_) {}
    }

    getConfig() {
      return normalizeVoiceConfig(this.config);
    }

    configure(patch) {
      this.config = normalizeVoiceConfig({ ...this.config, ...(patch || {}) });
      this._applyAudioBusConfig();
      return this.config;
    }

    getStatus() {
      return {
        bankStatus: this.bankStatus,
        bankFormatUsed: this.bankFormatUsed,
        lexiconSize: this.lexiconMap.size || FALLBACK_LEXICON.size,
        audioState: this.ctx ? this.ctx.state : "uninitialized",
        autoplayBlocked: this.isAutoplayBlocked(),
        isFileProtocol: isFileProtocol()
      };
    }

    isAutoplayBlocked() {
      if (this.config.mode === "mute") return false;
      if (this.config.mode === "webspeech") return false;
      return !this.ctx || this.ctx.state === "suspended";
    }

    ensureContext() {
      if (this.ctx && this.ctx.state !== "closed") {
        return this.ctx;
      }
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        const ctx = new AudioCtx();
        const masterGain = ctx.createGain();
        const warmthFilter = ctx.createBiquadFilter();
        warmthFilter.type = "lowpass";
        warmthFilter.Q.value = 0.7;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.08;

        masterGain.connect(warmthFilter);
        warmthFilter.connect(compressor);
        compressor.connect(ctx.destination);

        this.ctx = ctx;
        this.masterGain = masterGain;
        this.warmthFilter = warmthFilter;
        this.compressor = compressor;
        this.noiseBuffer = this._createNoiseBuffer(ctx);
        this._applyAudioBusConfig();
        return ctx;
      } catch (_) {
        return null;
      }
    }

    _createNoiseBuffer(ctx) {
      const length = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buf;
    }

    _applyAudioBusConfig() {
      if (!this.ctx || !this.masterGain || !this.warmthFilter) return;
      const now = this.ctx.currentTime;
      try {
        this.masterGain.gain.setTargetAtTime(clamp(this.config.volume, 0, 1), now, 0.015);
        this.warmthFilter.frequency.setTargetAtTime(clamp(this.config.warmthHz, 1200, 14000), now, 0.02);
      } catch (_) {}
    }

    async unlock() {
      const ctx = this.ensureContext();
      if (!ctx) return false;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch (_) {}
      }
      if (this.bankRawAudio && !this.bankDecodedBuffer && ctx.state === "running") {
        await this._decodePendingBank(ctx);
      }
      return ctx.state === "running";
    }

    _base64ToArrayBuffer(b64) {
      const binStr = global.atob(b64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      return bytes.buffer;
    }

    _loadOfflineBundleScript(bundleUrl) {
      if (global.__GUANGLING_ZH_VOICE_BANK__) {
        return Promise.resolve(global.__GUANGLING_ZH_VOICE_BANK__);
      }
      if (typeof document === "undefined" || !document.createElement) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        try {
          const existing = document.querySelector('script[data-gln-voice-bundle="1"]');
          if (existing) {
            existing.addEventListener("load", () => resolve(global.__GUANGLING_ZH_VOICE_BANK__ || null), { once: true });
            existing.addEventListener("error", () => resolve(null), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = bundleUrl;
          script.async = true;
          script.setAttribute("data-gln-voice-bundle", "1");
          script.onload = () => resolve(global.__GUANGLING_ZH_VOICE_BANK__ || null);
          script.onerror = () => resolve(null);
          (document.head || document.body || document.documentElement).appendChild(script);
        } catch (_) {
          resolve(null);
        }
      });
    }

    /**
     * 按需加载中文精简声库：
     * - HTTP/HTTPS: 优先轻量 fetch(zh.ogg / zh.m4a)
     * - file:// 本地双击: 动态按需插入 zh_bank_bundle.js 解码（0 首屏开销，绕过 file:// CORS）
     * - 若仍失败则自动无感降级为纯数学共振峰
     */
    async loadAssets(baseDir) {
      if (this.bankStatus === "ready" || this.bankStatus === "fallback") {
        return this.getStatus();
      }
      if (this.assetLoadPromise) return this.assetLoadPromise;

      const dir = (baseDir || "./Milvus/assets/animalese").replace(/\/+$/, "");

      this.assetLoadPromise = (async () => {
        this.bankStatus = "loading";

        // 路线 A：file:// 本地双击模式 → 按需动态加载 zh_bank_bundle.js
        if (isFileProtocol() || typeof global.fetch !== "function") {
          try {
            const bundle = await this._loadOfflineBundleScript(`${dir}/zh_bank_bundle.js`);
            if (bundle && bundle.manifest && bundle.oggBase64 && typeof global.atob === "function") {
              this.bankManifest = bundle.manifest;
              if (bundle.lexicon) {
                this.lexiconMap = parseRawHanziLexicon(bundle.lexicon);
              }
              this.validBankKeys = new Set(Object.keys((bundle.manifest && bundle.manifest.units) || {}));
              this.bankRawAudio = this._base64ToArrayBuffer(bundle.oggBase64);
              this.bankFormatUsed = "ogg-bundle";
              // 解成二进制后释放 Base64 字符串以节省内存
              try {
                bundle.oggBase64 = "";
              } catch (_) {}

              const ctx = this.ctx;
              if (ctx && ctx.state === "running") {
                await this._decodePendingBank(ctx);
              } else {
                this.bankStatus = "ready";
              }
              return this.getStatus();
            }
          } catch (_) {}
          this.bankStatus = "fallback";
          return this.getStatus();
        }

        // 路线 B：HTTP/HTTPS 模式 → 轻量原生 fetch
        try {
          const [manifestRes, lexRes] = await Promise.all([
            global.fetch(`${dir}/zh.json`),
            global.fetch(`${dir}/zh-lexicon.json`)
          ]);
          if (!manifestRes.ok || !lexRes.ok) {
            throw new Error("manifest_or_lexicon_http_error");
          }
          const [manifest, lexRaw] = await Promise.all([manifestRes.json(), lexRes.json()]);
          this.bankManifest = manifest;
          this.lexiconMap = parseRawHanziLexicon(lexRaw);
          this.validBankKeys = new Set(Object.keys((manifest && manifest.units) || {}));

          // Safari / iOS 优先加载 .m4a (AAC)，其余优先更轻的 .ogg，失败自动切备用格式
          const order = isLikelySafariOrIOS() ? ["m4a", "ogg"] : ["ogg", "m4a"];
          let loadedBytes = null;
          let usedFmt = "";
          for (let i = 0; i < order.length; i++) {
            const fmt = order[i];
            try {
              const res = await global.fetch(`${dir}/zh.${fmt}`);
              if (res.ok) {
                loadedBytes = await res.arrayBuffer();
                usedFmt = fmt;
                break;
              }
            } catch (_) {}
          }

          if (!loadedBytes) {
            this.bankStatus = "fallback";
            return this.getStatus();
          }

          this.bankRawAudio = loadedBytes;
          this.bankFormatUsed = usedFmt;

          const ctx = this.ctx;
          if (ctx && ctx.state === "running") {
            await this._decodePendingBank(ctx, dir, order);
          } else {
            this.bankStatus = "ready";
          }
        } catch (_) {
          this.bankStatus = "fallback";
        }
        return this.getStatus();
      })();

      return this.assetLoadPromise;
    }

    async _decodePendingBank(ctx, fallbackDir, triedOrder) {
      if (!this.bankRawAudio || this.bankDecodedBuffer) return;
      try {
        const copy = this.bankRawAudio.slice(0);
        this.bankDecodedBuffer = await ctx.decodeAudioData(copy);
        this.bankStatus = "ready";
      } catch (_) {
        // 若首选格式解码失败（如 iOS 遇到 ogg），尝试另一格式
        const altFmt = this.bankFormatUsed === "ogg" ? "m4a" : "ogg";
        if (fallbackDir && triedOrder && triedOrder.includes(altFmt) && typeof global.fetch === "function") {
          try {
            const altRes = await global.fetch(`${fallbackDir}/zh.${altFmt}`);
            if (altRes.ok) {
              const altBytes = await altRes.arrayBuffer();
              this.bankDecodedBuffer = await ctx.decodeAudioData(altBytes.slice(0));
              this.bankFormatUsed = altFmt;
              this.bankStatus = "ready";
              return;
            }
          } catch (_) {}
        }
        this.bankDecodedBuffer = null;
        this.bankStatus = "fallback";
      }
    }

    _registerNode(node) {
      this.activeNodes.add(node);
      if (typeof node.onended !== "undefined") {
        const prev = node.onended;
        node.onended = () => {
          this.activeNodes.delete(node);
          try {
            node.disconnect();
          } catch (_) {}
          if (typeof prev === "function") prev();
        };
      }
    }

    _scheduleTimer(fn, ms) {
      const id = setTimeout(() => {
        this.activeTimers.delete(id);
        fn();
      }, ms);
      this.activeTimers.add(id);
      return id;
    }

    stop() {
      this.playSessionId += 1;
      this.activeTimers.forEach((id) => clearTimeout(id));
      this.activeTimers.clear();

      this.activeNodes.forEach((node) => {
        try {
          if (typeof node.stop === "function") node.stop();
        } catch (_) {}
        try {
          node.disconnect();
        } catch (_) {}
      });
      this.activeNodes.clear();

      if (typeof global.speechSynthesis !== "undefined") {
        try {
          global.speechSynthesis.cancel();
        } catch (_) {}
      }

      if (this.activeAudioEl) {
        try {
          this.activeAudioEl.onended = null;
          this.activeAudioEl.onerror = null;
          this.activeAudioEl.pause();
          this.activeAudioEl.src = "";
        } catch (_) {}
        this.activeAudioEl = null;
      }
      if (this.activeAudioUrl) {
        try {
          if (typeof URL !== "undefined" && URL.revokeObjectURL) URL.revokeObjectURL(this.activeAudioUrl);
        } catch (_) {}
        this.activeAudioUrl = "";
      }
    }

    // 触发单个音节的双核合成（采样切片 + 三路并联共振峰）
    _triggerAnimaleseUnit(unit, startSec, contour) {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running" || !this.masterGain) return;

      const t0 = Math.max(ctx.currentTime + 0.005, startSec);
      const dur = contour.duration;

      const hasSample =
        !!this.bankDecodedBuffer &&
        !!this.bankManifest &&
        !!this.bankManifest.units &&
        Array.isArray(this.bankManifest.units[unit.key]);

      // 无采样声库时自动走 100% 纯数学共振峰
      const effectiveMix = hasSample ? clamp(this.config.mixRatio, 0, 1) : 1.0;
      const sampleGainVal = Math.cos(effectiveMix * Math.PI * 0.5);
      const formantGainVal = Math.sin(effectiveMix * Math.PI * 0.5);

      // 核 A：364Hz 平直采样切片
      if (hasSample && sampleGainVal > 0.02) {
        try {
          const [offsetSec, rawDur] = this.bankManifest.units[unit.key];
          const src = ctx.createBufferSource();
          src.buffer = this.bankDecodedBuffer;
          src.playbackRate.setValueCurveAtTime(contour.rates, t0, dur);

          const env = ctx.createGain();
          env.gain.setValueAtTime(0.0001, t0);
          env.gain.linearRampToValueAtTime(sampleGainVal * 0.92, t0 + 0.012);
          env.gain.setValueAtTime(sampleGainVal * 0.85, t0 + Math.max(0.02, dur - 0.024));
          env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.01);

          src.connect(env);
          env.connect(this.masterGain);
          this._registerNode(src);

          const sliceDur = Math.min(rawDur || 0.12, dur * 1.45);
          src.start(t0, Math.max(0, offsetSec), Math.max(0.03, sliceDur));
          src.stop(t0 + dur + 0.015);
        } catch (_) {}
      }

      // 核 B：三路并联共振峰数学合成器
      if (formantGainVal > 0.02) {
        try {
          const { startF, endF, hasUnvoicedInitial } = extractFormantTargets(unit.key);
          const oscSaw = ctx.createOscillator();
          const oscTri = ctx.createOscillator();
          oscSaw.type = "sawtooth";
          oscTri.type = "triangle";
          oscSaw.frequency.setValueCurveAtTime(contour.freqs, t0, dur);
          oscTri.frequency.setValueCurveAtTime(contour.freqs, t0, dur);

          const sawGain = ctx.createGain();
          const triGain = ctx.createGain();
          sawGain.gain.value = 0.68;
          triGain.gain.value = 0.42;

          const glottalMix = ctx.createGain();
          oscSaw.connect(sawGain);
          oscTri.connect(triGain);
          sawGain.connect(glottalMix);
          triGain.connect(glottalMix);

          const env = ctx.createGain();
          const peak = formantGainVal * 0.42;
          env.gain.setValueAtTime(0.0001, t0);
          env.gain.linearRampToValueAtTime(peak, t0 + 0.014);
          env.gain.setValueAtTime(peak * 0.82, t0 + Math.max(0.024, dur - 0.028));
          env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.012);

          // 三路并联带通滤波器 F1 / F2 / F3
          const qVals = [5.5, 7.5, 9.0];
          const wVals = [1.0, 0.68, 0.32];
          for (let f = 0; f < 3; f++) {
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.Q.value = qVals[f];
            bp.frequency.setValueAtTime(startF[f], t0);
            bp.frequency.linearRampToValueAtTime(endF[f], t0 + dur);
            const fg = ctx.createGain();
            fg.gain.value = wVals[f];
            glottalMix.connect(bp);
            bp.connect(fg);
            fg.connect(env);
          }

          env.connect(this.masterGain);
          this._registerNode(oscSaw);
          this._registerNode(oscTri);

          oscSaw.start(t0);
          oscTri.start(t0);
          oscSaw.stop(t0 + dur + 0.018);
          oscTri.stop(t0 + dur + 0.018);

          // 清辅音窄带噪声脉冲（音头微爆破）
          if (hasUnvoicedInitial && this.noiseBuffer) {
            const nSrc = ctx.createBufferSource();
            nSrc.buffer = this.noiseBuffer;
            const nBp = ctx.createBiquadFilter();
            nBp.type = "bandpass";
            nBp.frequency.value = 3400;
            nBp.Q.value = 1.6;
            const nEnv = ctx.createGain();
            nEnv.gain.setValueAtTime(0.0001, t0);
            nEnv.gain.linearRampToValueAtTime(formantGainVal * 0.14, t0 + 0.005);
            nEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.024);
            nSrc.connect(nBp);
            nBp.connect(nEnv);
            nEnv.connect(this.masterGain);
            this._registerNode(nSrc);
            nSrc.start(t0);
            nSrc.stop(t0 + 0.026);
          }
        } catch (_) {}
      }
    }

    // 复古 Mii 电子哔哔声
    _triggerBlip(charCode) {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running" || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const baseFreq = clamp((this.config.basePitchHz || 420) * 0.78 + ((charCode || 65) % 11) * 18, 220, 900);
        osc.type = "triangle";
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.12, now + 0.045);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);
        osc.connect(gain);
        gain.connect(this.masterGain);
        this._registerNode(osc);
        osc.start(now);
        osc.stop(now + 0.055);
      } catch (_) {}
    }

    // UI 按钮确认清脆音效
    playClick() {
      if (this.config.mode === "mute") return;
      const ctx = this.ensureContext();
      if (!ctx || ctx.state !== "running" || !this.masterGain) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.068);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.masterGain);
        this._registerNode(osc);
        osc.start(now);
        osc.stop(now + 0.085);
      } catch (_) {}
    }

    // 获取浏览器可用中文语音列表（供导播台真人口播选择）
    getAvailableChineseVoices() {
      if (typeof global.speechSynthesis === "undefined") return [];
      try {
        const all = global.speechSynthesis.getVoices() || [];
        return all
          .filter((v) => /^zh/i.test(v.lang || "") || /Chinese|Mandarin|中文|普通话/i.test(v.name || ""))
          .map((v) => ({
            voiceURI: v.voiceURI,
            name: v.name,
            lang: v.lang,
            localService: !!v.localService
          }));
      } catch (_) {
        return [];
      }
    }

    /**
     * 核心对外入口：播报单句台词，驱动字幕揭示 + 主播口型脉冲 + 完成回调
     */
    playLine(text, callbacks) {
      this.stop();
      const sessionId = this.playSessionId;
      const cb = callbacks || {};
      const str = String(text || "");
      const mode = this.config.mode || "animalese";

      if (!str) {
        if (cb.onRevealChar) cb.onRevealChar(0, "");
        if (cb.onComplete) cb.onComplete();
        return;
      }

      if (mode === "clone") {
        this._playLineClone(str, sessionId, cb);
        return;
      }

      if (mode === "webspeech") {
        this._playLineWebSpeech(str, sessionId, cb);
        return;
      }

      if (mode === "blip" || mode === "mute") {
        this._playLineBlipOrMute(str, sessionId, mode === "blip", cb);
        return;
      }

      // 默认：Animalese 双时钟同步播报
      this._playLineAnimalese(str, sessionId, cb);
    }

    _playLineAnimalese(str, sessionId, cb) {
      const tokens = tokenizeChineseText(str, this.lexiconMap, this.validBankKeys);
      const speakableCount = tokens.reduce((acc, t) => acc + (t.speakable ? 1 : 0), 0);
      const bankHz = (this.bankManifest && this.bankManifest.hz) || DEFAULT_BANK_HZ;

      // 后台静默预热声库（不阻塞当前句首字发声）
      if (this.bankStatus === "idle") {
        this.loadAssets().catch(() => {});
      }
      if (this.ctx && this.ctx.state === "running" && this.bankRawAudio && !this.bankDecodedBuffer) {
        this._decodePendingBank(this.ctx).catch(() => {});
      }

      const baseStepMs = clamp(Math.round(920 / (this.config.unitsPerSecond || 10.5)), 48, 120);
      const clockState = { lastVoiceSec: 0, freeSec: 0 };
      let cursorMs = 0;
      let spokenSoFar = 0;
      const baseAudioNow = this.ctx && this.ctx.state === "running" ? this.ctx.currentTime : 0;

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        const scheduledMs = cursorMs;
        const shownCount = tok.charIndex + 1;
        const isFinalUnit = tok.speakable && spokenSoFar === speakableCount - 1;
        const posRatio = speakableCount > 1 ? spokenSoFar / (speakableCount - 1) : 0;
        if (tok.speakable) spokenSoFar += 1;

        this._scheduleTimer(() => {
          if (sessionId !== this.playSessionId) return;
          if (cb.onRevealChar) cb.onRevealChar(shownCount, str.slice(0, shownCount));

          if (tok.pauseSec > 0) {
            const nowSec = this.ctx ? this.ctx.currentTime : baseAudioNow + scheduledMs / 1000;
            clockState.freeSec = Math.max(clockState.freeSec, nowSec + tok.pauseSec);
            return;
          }

          if (tok.speakable) {
            const ctxRunning = this.ctx && this.ctx.state === "running";
            const nowSec = ctxRunning ? this.ctx.currentTime : baseAudioNow + scheduledMs / 1000;
            const dec = scheduleVoiceDecision(clockState, nowSec, tok, this.config);
            if (dec.speak) {
              if (cb.onSyllablePulse) cb.onSyllablePulse(tok);
              if (ctxRunning) {
                const rawUnit =
                  this.bankManifest && this.bankManifest.units && this.bankManifest.units[tok.key];
                const unitDur = Array.isArray(rawUnit) ? rawUnit[1] : DEFAULT_UNIT_DUR;
                const contour = solvePitchContour(tok, posRatio, isFinalUnit, bankHz, unitDur, this.config);
                this._triggerAnimaleseUnit(tok, dec.startSec, contour);
              }
            }
          }
        }, scheduledMs);

        cursorMs += Math.round(baseStepMs * (tok.revealStep || 1.0) + (tok.pauseSec || 0) * 820);
      }

      this._scheduleTimer(() => {
        if (sessionId !== this.playSessionId) return;
        if (cb.onRevealChar) cb.onRevealChar(str.length, str);
        if (cb.onComplete) cb.onComplete();
      }, cursorMs + 90);
    }

    _playLineBlipOrMute(str, sessionId, withSound, cb) {
      let i = 0;
      const step = () => {
        if (sessionId !== this.playSessionId) return;
        if (i < str.length) {
          const ch = str[i];
          const next = i + 1;
          if (cb.onRevealChar) cb.onRevealChar(next, str.slice(0, next));
          if (ch.trim() !== "" && i % 2 === 0) {
            if (cb.onSyllablePulse) cb.onSyllablePulse({ char: ch });
            if (withSound) this._triggerBlip(ch.charCodeAt(0));
          }
          i = next;
          const delay = LONG_PAUSE_RE.test(ch) ? 160 : MED_PAUSE_RE.test(ch) ? 95 : 38;
          this._scheduleTimer(step, delay);
        } else {
          if (cb.onComplete) cb.onComplete();
        }
      };
      step();
    }

    // 查询当前主播在全站 VoiceStudioEngine 的克隆音色绑定状态
    getCloneVoiceStatus(charId, customVoiceId) {
      const custom = String(customVoiceId ?? this.config.cloneVoiceId ?? "").trim();
      const vse = global.VoiceStudioEngine;
      if (!vse || typeof vse.synthesizeForCharacter !== "function") {
        return { available: false, source: "none", label: "未检测到全站语音工作台模块" };
      }
      if (custom) {
        return { available: true, source: "custom", voiceId: custom, label: `自定义音色 ID (${custom.slice(0, 14)})` };
      }
      const cid = String(charId ?? this.config.anchorCharId ?? "").trim();
      if (cid && typeof vse.hasVoiceForCharacter === "function" && vse.hasVoiceForCharacter(cid)) {
        return { available: true, source: "studio_char", voiceId: cid, label: "已自动继承该名士的语音工作台音色" };
      }
      return { available: false, source: "missing", label: "请在下方填写克隆 voiceId 或在语音工作台绑定" };
    }

    _buildCloneSynthOpts() {
      const custom = String(this.config.cloneVoiceId || "").trim();
      if (!custom) return {};
      return {
        voiceOverride: {
          fishReferenceId: custom,
          minimaxVoiceId: custom,
          elevenLabsVoiceId: custom
        }
      };
    }

    // 静默预合成下一句进入 VoiceStudioEngine 音频 Blob 缓存
    prefetchLine(nextText) {
      if (this.config.mode !== "clone" || this.config.clonePrefetch === false) return;
      const str = String(nextText || "").trim();
      if (!str) return;
      const vse = global.VoiceStudioEngine;
      if (!vse || typeof vse.synthesizeForCharacter !== "function") return;
      const charId = String(this.config.anchorCharId || "guangling_anchor");
      const opts = this._buildCloneSynthOpts();
      vse
        .synthesizeForCharacter(str, charId, opts)
        .then((res) => {
          if (res && res.url && typeof URL !== "undefined" && URL.revokeObjectURL) {
            try {
              URL.revokeObjectURL(res.url);
            } catch (_) {}
          }
        })
        .catch(() => {});
    }

    // Mode 5: 克隆音色真声播报（桥接 VoiceStudioEngine + 12s 熔断自动降级动森狸语）
    _playLineClone(str, sessionId, cb) {
      const vse = global.VoiceStudioEngine;
      const fallbackToAnimalese = (reason) => {
        if (sessionId !== this.playSessionId) return;
        if (cb.onSynthesizingChange) cb.onSynthesizingChange(false);
        if (cb.onFallback && reason) cb.onFallback(reason);
        this._playLineAnimalese(str, sessionId, cb);
      };

      if (!vse || typeof vse.synthesizeForCharacter !== "function") {
        fallbackToAnimalese("未加载语音工作台，已自动切换动森狸语");
        return;
      }

      const charId = String(this.config.anchorCharId || "guangling_anchor");
      const opts = this._buildCloneSynthOpts();
      if (cb.onSynthesizingChange) cb.onSynthesizingChange(true);

      let settled = false;
      const timeoutId = this._scheduleTimer(() => {
        if (!settled) {
          settled = true;
          fallbackToAnimalese("克隆音色合成超时，已自动切换动森狸语");
        }
      }, 12000);

      vse
        .synthesizeForCharacter(str, charId, opts)
        .then((result) => {
          clearTimeout(timeoutId);
          this.activeTimers.delete(timeoutId);
          if (settled || sessionId !== this.playSessionId) {
            if (result && result.url && typeof URL !== "undefined" && URL.revokeObjectURL) {
              try {
                URL.revokeObjectURL(result.url);
              } catch (_) {}
            }
            return;
          }
          settled = true;
          if (cb.onSynthesizingChange) cb.onSynthesizingChange(false);

          if (!result || !result.url || typeof global.Audio !== "function") {
            fallbackToAnimalese("当前环境不支持克隆音频播放，已切换动森狸语");
            return;
          }

          const audio = new global.Audio(result.url);
          audio.volume = clamp(this.config.volume ?? 0.84, 0, 1);
          this.activeAudioEl = audio;
          this.activeAudioUrl = result.url;

          let idx = 0;
          let audioFinished = false;
          let textFinished = false;

          const tryFinish = () => {
            if (sessionId !== this.playSessionId) return;
            if (audioFinished && textFinished && cb.onComplete) cb.onComplete();
          };

          const startReveal = (estDurationSec) => {
            const totalMs = clamp(Math.round((estDurationSec || Math.max(1.8, str.length * 0.14)) * 1000), 900, 16000);
            const stepMs = Math.max(36, Math.round(totalMs / Math.max(1, str.length)));
            const tick = () => {
              if (sessionId !== this.playSessionId) return;
              if (idx < str.length) {
                idx += 1;
                if (cb.onRevealChar) cb.onRevealChar(idx, str.slice(0, idx));
                if (idx % 2 === 0 && cb.onSyllablePulse) cb.onSyllablePulse({ char: str[idx - 1] });
                this._scheduleTimer(tick, stepMs);
              } else {
                textFinished = true;
                tryFinish();
              }
            };
            tick();
          };

          audio.onloadedmetadata = () => {
            if (sessionId !== this.playSessionId || idx > 0) return;
            const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : str.length * 0.15;
            startReveal(dur);
          };

          // 保底启动字幕推进（部分浏览器不触发 loadedmetadata）
          this._scheduleTimer(() => {
            if (sessionId === this.playSessionId && idx === 0) {
              startReveal(str.length * 0.15);
            }
          }, 180);

          audio.onended = () => {
            if (sessionId !== this.playSessionId) return;
            audioFinished = true;
            if (!textFinished) {
              idx = str.length;
              textFinished = true;
              if (cb.onRevealChar) cb.onRevealChar(str.length, str);
            }
            tryFinish();
          };

          audio.onerror = () => {
            fallbackToAnimalese("克隆音频解码失败，已自动切换动森狸语");
          };

          const p = audio.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              fallbackToAnimalese("克隆音频播放受限，已自动切换动森狸语");
            });
          }
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          this.activeTimers.delete(timeoutId);
          if (!settled) {
            settled = true;
            fallbackToAnimalese((err && err.message) || "克隆音色未配置，已自动切换动森狸语");
          }
        });
    }

    _playLineWebSpeech(str, sessionId, cb) {
      // 字幕平滑推进 + 浏览器原生真人口播
      const charsPerSec = clamp(10.5 * (this.config.webSpeechRate || 1.08), 6, 18);
      const stepMs = Math.round(1000 / charsPerSec);
      let idx = 0;
      let speechDone = false;
      let textDone = false;

      const tryFinish = () => {
        if (sessionId !== this.playSessionId) return;
        if (speechDone && textDone && cb.onComplete) {
          cb.onComplete();
        }
      };

      const revealStep = () => {
        if (sessionId !== this.playSessionId) return;
        if (idx < str.length) {
          idx += 1;
          if (cb.onRevealChar) cb.onRevealChar(idx, str.slice(0, idx));
          if (idx % 2 === 0 && cb.onSyllablePulse) cb.onSyllablePulse({ char: str[idx - 1] });
          this._scheduleTimer(revealStep, stepMs);
        } else {
          textDone = true;
          tryFinish();
        }
      };
      revealStep();

      if (typeof global.speechSynthesis === "undefined" || typeof global.SpeechSynthesisUtterance === "undefined") {
        speechDone = true;
        tryFinish();
        return;
      }

      try {
        const utter = new global.SpeechSynthesisUtterance(str);
        utter.lang = "zh-CN";
        utter.rate = clamp(this.config.webSpeechRate || 1.08, 0.65, 1.6);
        utter.pitch = clamp(this.config.webSpeechPitch || 1.0, 0.6, 1.5);
        utter.volume = clamp(this.config.volume ?? 0.82, 0, 1);

        const voices = global.speechSynthesis.getVoices() || [];
        let chosen = null;
        if (this.config.webSpeechVoiceURI) {
          chosen = voices.find((v) => v.voiceURI === this.config.webSpeechVoiceURI) || null;
        }
        if (!chosen) {
          chosen =
            voices.find((v) => /zh-CN/i.test(v.lang) && /Xiaoxiao|Yunxi|Tingting|Sinji|Natural|Online/i.test(v.name)) ||
            voices.find((v) => /zh-CN/i.test(v.lang)) ||
            voices.find((v) => /^zh/i.test(v.lang)) ||
            null;
        }
        if (chosen) utter.voice = chosen;

        const finishSpeech = () => {
          if (sessionId !== this.playSessionId || speechDone) return;
          speechDone = true;
          tryFinish();
        };

        utter.onend = finishSpeech;
        utter.onerror = finishSpeech;
        global.speechSynthesis.cancel();
        global.speechSynthesis.speak(utter);

        // 安卓部分 WebView onend 不触发保底定时器
        const maxWaitMs = Math.max(2600, Math.round((str.length / charsPerSec) * 1000) + 3200);
        this._scheduleTimer(finishSpeech, maxWaitMs);
      } catch (_) {
        speechDone = true;
        tryFinish();
      }
    }

    dispose() {
      this.stop();
      if (this.ctx) {
        try {
          this.ctx.close();
        } catch (_) {}
        this.ctx = null;
        this.masterGain = null;
        this.warmthFilter = null;
        this.compressor = null;
      }
    }
  }

  let sharedInstance = null;
  function getSharedController() {
    if (!sharedInstance) {
      sharedInstance = new GuanglingVoiceController();
    }
    return sharedInstance;
  }

  global.GuanglingVoiceEngine = {
    DEFAULT_VOICE_CONFIG,
    VOICE_PRESETS,
    normalizeVoiceConfig,
    applyPresetToVoiceConfig,
    parseRawHanziLexicon,
    tokenizeChineseText,
    solvePitchContour,
    scheduleVoiceDecision,
    extractFormantTargets,
    GuanglingVoiceController,
    getSharedController
  };
})(window);

