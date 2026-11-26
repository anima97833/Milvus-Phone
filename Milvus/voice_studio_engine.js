/**
 * Milvus/voice_studio_engine.js
 * 鸢小手机「全栈语音系统（TTS + STT）」独立模块化引擎
 * - 100% 独立 IndexedDB（milvus_voice_vault_idb）存储配置、角色音色档与音频 Blob 缓存，零 localStorage 占用
 * - 支持三家一线 TTS：鱼声 Fish Audio (s2.1-pro/s2-pro) / MiniMax 海螺 (speech-2.8-hd) / ElevenLabs
 * - 支持四路统一 STT：Fish ASR / MiniMax ASR / ElevenLabs Scribe / 浏览器免费 SpeechRecognition（16kHz WAV 编码）
 * - 内置双向演出标签清洗、cyrb53 缓存哈希、LRU 缓存裁剪、iOS Safari 静音预热（primeVoiceAudio）
 * - 导出 window.VoiceStudioEngine，提供极简 UI 挂载组件：VoiceStudioSettingsCard / CharacterVoiceCard / VoiceMessagePlayPill
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_voice_vault_idb";
  const DB_VERSION = 1;
  const STORE_CONFIG = "config";
  const STORE_CHAR_VOICES = "char_voices";
  const STORE_AUDIO_CACHE = "audio_cache";
  const CONFIG_KEY = "voice_studio_config_v1";
  const MAX_CACHE_BYTES = 150 * 1024 * 1024; // 150MB 软上限 LRU 淘汰
  const MAX_SYNTH_CHARS = 600;

  const DEFAULT_CONFIG = {
    enabled: true,
    workerBaseUrl: "",
    ttsProvider: "fishaudio", // "fishaudio" | "minimax" | "elevenlabs"
    sttProvider: "auto",      // "auto" | "fishaudio" | "minimax" | "elevenlabs" | "browser"
    fishApiKey: "",
    fishModel: "s2.1-pro",
    minimaxApiKey: "",
    minimaxGroupId: "",
    minimaxRegion: "domestic", // "domestic" | "overseas"
    minimaxModel: "speech-2.8-hd",
    elevenLabsApiKey: "",
    elevenLabsModel: "eleven_v3",
    builtinFallbackEnabled: false,
    defaultBuiltinMode: "animalese",
    defaultBuiltinPresetId: "scholar-warm",
    defaultBuiltinWebVoiceURI: "",
    defaultBuiltinTuning: null
  };

  const DEFAULT_CHAR_VOICE = {
    voiceSource: "clone", // "clone" | "builtin"
    builtinMode: "animalese",
    builtinPresetId: "scholar-warm",
    builtinWebVoiceURI: "",
    builtinPitch: 1.0,
    builtinTuning: null,
    fishReferenceId: "",
    minimaxVoiceId: "",
    elevenLabsVoiceId: "",
    speed: 1.0,
    pitch: 0,
    autoPlay: false,
    injectActingGuide: false
  };

  // ==========================================
  // 1. 哈希 & 文本清洗 & 二进制工具（纯函数，可单测）
  // ==========================================
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }

  function stableStringify(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }

  function hashTtsParams(params) {
    return "vtts_" + cyrb53(stableStringify(params));
  }

  function hexToBytes(hex) {
    const clean = String(hex || "").trim().replace(/^0x/i, "").replace(/\s+/g, "");
    if (!clean || clean.length % 2 !== 0) return new Uint8Array(0);
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
    }
    return out;
  }

  function normalizeFishReferenceId(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const byQuery = s.match(/[?&]modelId=([a-z0-9]+)/i);
    if (byQuery) return byQuery[1];
    const byHex = s.match(/[a-f0-9]{32}/i);
    if (byHex) return byHex[0];
    return s.split(/[?#\s]/)[0];
  }

  const MINIMAX_INTERJECTIONS = new Set([
    "chuckle", "laughs", "sighs", "coughs", "clear-throat", "groans",
    "breath", "pant", "inhale", "exhale", "gasps", "sniffs", "snorts",
    "lip-smacking", "humming", "hissing", "emm"
  ]);

  const FISH_SUPPORTED_CUES = new Set([
    "angry", "sad", "embarrassed", "emphasis", "whispering", "soft", "breathy", "excited",
    "laughing", "chuckling", "moaning", "clear throat", "sobbing", "crying loudly",
    "sighing", "panting", "groaning", "pause", "long pause"
  ]);

  const FISH_CUE_SYNONYMS = {
    break: "pause", "short pause": "pause",
    "long-break": "long pause", longbreak: "long pause", "long break": "long pause",
    happy: "excited", joyful: "excited", cheerful: "excited", smug: "excited", teasing: "excited",
    annoyed: "angry", irritated: "angry", mad: "angry",
    unhappy: "sad", hurt: "sad", sulking: "sad",
    shy: "embarrassed", bashful: "embarrassed",
    gentle: "soft", warm: "soft", calm: "soft", tired: "soft",
    nervous: "breathy", anxious: "breathy", fearful: "breathy",
    whisper: "whispering", hushed: "whispering",
    laugh: "laughing", laughs: "laughing",
    chuckle: "chuckling", chuckles: "chuckling", giggle: "chuckling",
    sigh: "sighing", sighs: "sighing",
    sob: "sobbing", groan: "groaning", groans: "groaning",
    pant: "panting", gasp: "panting", gasps: "panting",
    "clear-throat": "clear throat", coughs: "clear throat"
  };

  function normalizeFishCue(inner) {
    const key = String(inner || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) return "";
    if (FISH_SUPPORTED_CUES.has(key)) return key;
    if (FISH_CUE_SYNONYMS[key]) return FISH_CUE_SYNONYMS[key];
    for (const [syn, canon] of Object.entries(FISH_CUE_SYNONYMS)) {
      if (key.includes(syn)) return canon;
    }
    for (const canon of FISH_SUPPORTED_CUES) {
      if (key.includes(canon)) return canon;
    }
    return "";
  }

  function collapseAdjacentFishCues(s) {
    return String(s || "").replace(/\[[^\]]+\](?:\s*\[[^\]]+\])+/g, (run) => {
      const cues = run.match(/\[[^\]]+\]/g) || [];
      const dedup = cues.filter((c, i) => i === 0 || c.toLowerCase() !== cues[i - 1].toLowerCase());
      if (dedup.length <= 2) return dedup.join(" ");
      const isPause = (c) => /^\[(pause|long pause)\]$/i.test(c);
      const pause = dedup.find((c) => /^\[long pause\]$/i.test(c)) || dedup.find(isPause);
      const emotions = dedup.filter((c) => !isPause(c));
      if (pause) return emotions.length ? `${pause} ${emotions[emotions.length - 1]}` : pause;
      return `${emotions[0]} ${emotions[1]}`;
    });
  }

  function extractVoiceBlock(raw) {
    const m = String(raw || "").match(/<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/);
    return m ? m[1] : String(raw || "");
  }

  function cleanTextForTtsFish(raw) {
    let text = extractVoiceBlock(raw);
    text = text
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      .replace(/%%BILINGUAL%%[\s\S]*/i, "")
      .replace(/<字幕>[\s\S]*?<\/字幕>/g, "")
      .replace(/（[^）]{0,60}）/g, "")
      .replace(/<#\s*[\d.]+\s*#>/g, "")
      .replace(/\(([^)]{1,40})\)/g, "[$1]")
      .replace(/\n{2,}/g, " [long pause] ")
      .replace(/\n+/g, " [pause] ")
      .replace(/\[([^\[\]]{1,40})\]/g, (_m, inner) => {
        const canon = normalizeFishCue(inner);
        return canon ? `[${canon}]` : "";
      })
      .replace(/\s+/g, " ")
      .trim();
    return collapseAdjacentFishCues(text).slice(0, MAX_SYNTH_CHARS);
  }

  function cleanTextForTtsMinimax(raw) {
    let text = extractVoiceBlock(raw);
    text = text
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      .replace(/%%BILINGUAL%%[\s\S]*/i, "")
      .replace(/<字幕>[\s\S]*?<\/字幕>/g, "")
      .replace(/[\[【]\s*(?:happy|sad|angry|fearful|disgusted|surprised|calm|fluent)\s*[\]】]/gi, "")
      .replace(/（[^）]{0,60}）/g, "")
      .replace(/\(([^)]{1,40})\)/g, (_m, inner) => {
        const tag = String(inner || "").trim().toLowerCase();
        return MINIMAX_INTERJECTIONS.has(tag) ? `(${tag})` : "";
      })
      .replace(/\[([^\[\]]{1,40})\]/g, (_m, inner) => (normalizeFishCue(inner) ? "" : ""))
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, MAX_SYNTH_CHARS);
  }

  function cleanTextForTtsElevenLabs(raw) {
    let text = extractVoiceBlock(raw);
    text = text
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      .replace(/%%BILINGUAL%%[\s\S]*/i, "")
      .replace(/<字幕>[\s\S]*?<\/字幕>/g, "")
      .replace(/（[^）]{0,60}）/g, "")
      .replace(/<#\s*[\d.]+\s*#>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, MAX_SYNTH_CHARS);
  }

  function stripVoiceMarkupForDisplay(raw) {
    if (!raw) return "";
    return String(raw)
      .replace(/<#\s*[\d.]+\s*#>/g, "")
      .replace(/\[([^\[\]]{1,40})\]/g, (m, inner) => (normalizeFishCue(inner) ? "" : m))
      .replace(/\(([^)]{1,40})\)/g, (m, inner) => {
        const t = String(inner || "").trim().toLowerCase();
        return MINIMAX_INTERJECTIONS.has(t) || normalizeFishCue(t) ? "" : m;
      })
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([，。！？、；：,.!?…])/g, "$1")
      .trim();
  }

  function encodeWavFromFloat32(samples, sourceSampleRate, targetSampleRate = 16000) {
    const srcRate = Math.max(1, Math.floor(sourceSampleRate || targetSampleRate));
    const dstRate = Math.max(1, Math.floor(targetSampleRate));
    let resampled;
    if (srcRate === dstRate || samples.length === 0) {
      resampled = samples;
    } else {
      const ratio = srcRate / dstRate;
      const newLen = Math.max(1, Math.round(samples.length / ratio));
      resampled = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
        let sum = 0;
        for (let j = start; j < end; j++) sum += samples[j];
        resampled[i] = sum / (end - start);
      }
    }
    const numSamples = resampled.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, dstRate, true);
    view.setUint32(28, dstRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);
    for (let i = 0; i < numSamples; i++) {
      const clamped = Math.max(-1, Math.min(1, resampled[i] || 0));
      view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    }
    if (typeof Blob !== "undefined") {
      return new Blob([buffer], { type: "audio/wav" });
    }
    return new Uint8Array(buffer);
  }

  function getVoiceActingGuide(provider) {
    const p = provider || _configCache.ttsProvider || "fishaudio";
    if (p === "minimax") {
      return "【语音口语演出提示】台词将被真实语音朗读：请口语化、句长交错，避免书面腔与括号动作描写。仅可在关键情绪节点穿插极少量停顿 <#0.4#> 或官方声响 (sighs)/(chuckle)/(laughs)。";
    }
    if (p === "elevenlabs") {
      return "【语音口语演出提示】台词将被真实语音朗读：请保持自然口语节奏与呼吸感，避免舞台括号描写。";
    }
    return "【语音口语演出提示】台词将被鱼声 TTS 真实朗读：请口语化、句长交错，避免中文括号动作描写。可在情绪转折处适度使用半角英文标签：[excited]、[soft]、[sad]、[angry]、[whispering]、[sighing]、[chuckling]、[pause]（每段不超过 2~3 个）。";
  }

  // ==========================================
  // 2. 独立 IndexedDB 存储层（零 localStorage）
  // ==========================================
  let _dbPromise = null;
  let _configCache = { ...DEFAULT_CONFIG };
  let _charVoicesCache = {};
  let _hydrated = false;

  function openVoiceDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_CONFIG)) db.createObjectStore(STORE_CONFIG, { keyPath: "key" });
          if (!db.objectStoreNames.contains(STORE_CHAR_VOICES)) db.createObjectStore(STORE_CHAR_VOICES, { keyPath: "charId" });
          if (!db.objectStoreNames.contains(STORE_AUDIO_CACHE)) db.createObjectStore(STORE_AUDIO_CACHE, { keyPath: "hash" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function idbGet(storeName, key) {
    const db = await openVoiceDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function idbPut(storeName, record) {
    const db = await openVoiceDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function idbGetAll(storeName) {
    const db = await openVoiceDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openVoiceDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function idbClear(storeName) {
    const db = await openVoiceDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function hydrate(force) {
    if (_hydrated && !force) return { config: _configCache, charVoices: _charVoicesCache };
    const [cfgRec, charList] = await Promise.all([
      idbGet(STORE_CONFIG, CONFIG_KEY),
      idbGetAll(STORE_CHAR_VOICES)
    ]);
    if (cfgRec && cfgRec.value && typeof cfgRec.value === "object") {
      _configCache = { ...DEFAULT_CONFIG, ...cfgRec.value };
    }
    const map = {};
    for (const item of charList) {
      if (item && item.charId) map[String(item.charId)] = { ...DEFAULT_CHAR_VOICE, ...item };
    }
    _charVoicesCache = map;
    _hydrated = true;
    emitEvent("milvus-voice-config-changed", { config: _configCache });
    return { config: _configCache, charVoices: _charVoicesCache };
  }

  function getConfig() {
    return { ..._configCache };
  }

  async function saveConfig(patch) {
    _configCache = { ..._configCache, ...(patch || {}) };
    if (_configCache.workerBaseUrl) {
      _configCache.workerBaseUrl = String(_configCache.workerBaseUrl).trim().replace(/\/+$/, "");
    }
    await idbPut(STORE_CONFIG, { key: CONFIG_KEY, value: _configCache, updatedAt: Date.now() });
    emitEvent("milvus-voice-config-changed", { config: _configCache });
    return getConfig();
  }

  function getCharVoice(charId) {
    const key = String(charId || "");
    return { ...DEFAULT_CHAR_VOICE, ...(_charVoicesCache[key] || {}), charId: key };
  }

  function getAllCharVoices() {
    const out = {};
    Object.keys(_charVoicesCache || {}).forEach((k) => {
      out[k] = { ...DEFAULT_CHAR_VOICE, ..._charVoicesCache[k], charId: k };
    });
    return out;
  }

  async function saveCharVoice(charId, patch) {
    const key = String(charId || "").trim();
    if (!key) return null;
    const next = { ...getCharVoice(key), ...(patch || {}), charId: key, updatedAt: Date.now() };
    if (next.fishReferenceId) next.fishReferenceId = normalizeFishReferenceId(next.fishReferenceId);
    _charVoicesCache[key] = next;
    await idbPut(STORE_CHAR_VOICES, next);
    emitEvent("milvus-voice-char-changed", { charId: key, voice: next });
    return next;
  }

  function discoverExistingWorkerBaseUrl() {
    try {
      const candidates = [
        global.Ao3ReaderEngine && global.Ao3ReaderEngine.getPrefs && global.Ao3ReaderEngine.getPrefs().gatewayUrl,
        global.ImaNotesEngine && global.ImaNotesEngine.getPrefs && global.ImaNotesEngine.getPrefs().gatewayUrl,
        global.LuckinOrderEngine && global.LuckinOrderEngine.getPrefs && global.LuckinOrderEngine.getPrefs().gatewayUrl,
        global.McdOrderEngine && global.McdOrderEngine.getPrefs && global.McdOrderEngine.getPrefs().gatewayUrl
      ];
      for (const raw of candidates) {
        if (!raw || typeof raw !== "string") continue;
        try {
          const u = new URL(raw.trim());
          if (/^https?:$/.test(u.protocol)) return u.origin;
        } catch (e) {}
      }
    } catch (e) {}
    return "";
  }

  // ==========================================
  // 3. 音频缓存（含自动 LRU 淘汰）
  // ==========================================
  async function getCacheStats() {
    const items = await idbGetAll(STORE_AUDIO_CACHE);
    let totalBytes = 0;
    for (const it of items) totalBytes += Number(it.size || (it.blob && it.blob.size) || 0);
    return { count: items.length, totalBytes, totalMB: +(totalBytes / (1024 * 1024)).toFixed(2) };
  }

  async function pruneCacheIfNeeded() {
    const items = await idbGetAll(STORE_AUDIO_CACHE);
    let totalBytes = items.reduce((s, it) => s + Number(it.size || (it.blob && it.blob.size) || 0), 0);
    if (totalBytes <= MAX_CACHE_BYTES) return;
    items.sort((a, b) => Number(a.lastUsedAt || a.createdAt || 0) - Number(b.lastUsedAt || b.createdAt || 0));
    for (const it of items) {
      if (totalBytes <= MAX_CACHE_BYTES * 0.8) break;
      await idbDelete(STORE_AUDIO_CACHE, it.hash);
      totalBytes -= Number(it.size || (it.blob && it.blob.size) || 0);
    }
  }

  async function getCachedAudioBlob(hash) {
    const rec = await idbGet(STORE_AUDIO_CACHE, hash);
    if (!rec || !rec.blob) return null;
    idbPut(STORE_AUDIO_CACHE, { ...rec, lastUsedAt: Date.now() }).catch(() => {});
    return rec.blob;
  }

  async function saveCachedAudioBlob(hash, blob) {
    if (!blob || !blob.size) return;
    const now = Date.now();
    await idbPut(STORE_AUDIO_CACHE, {
      hash,
      blob,
      mime: blob.type || "audio/mpeg",
      size: blob.size,
      createdAt: now,
      lastUsedAt: now
    });
    pruneCacheIfNeeded().catch(() => {});
  }

  async function clearAudioCache() {
    await idbClear(STORE_AUDIO_CACHE);
    emitEvent("milvus-voice-cache-cleared", {});
  }

  // ==========================================
  // 4. 三家 TTS 合成适配器（经 Worker 代理）
  // ==========================================
  function resolveActiveProvider(cfg) {
    const p = (cfg && cfg.ttsProvider) || "fishaudio";
    return p === "minimax" || p === "elevenlabs" ? p : "fishaudio";
  }

  function hasCloudVoiceForCharacter(charId, vpOverride) {
    const cfg = _configCache;
    const vp = vpOverride || getCharVoice(charId);
    const provider = resolveActiveProvider(cfg);
    if (provider === "fishaudio") return Boolean(cfg.fishApiKey && vp.fishReferenceId);
    if (provider === "minimax") return Boolean(cfg.minimaxApiKey && vp.minimaxVoiceId);
    if (provider === "elevenlabs") return Boolean(cfg.elevenLabsApiKey && vp.elevenLabsVoiceId);
    return false;
  }

  function shouldUseBuiltinForCharacter(charId, vpOverride) {
    const cfg = _configCache;
    if (!cfg.enabled) return false;
    const vp = vpOverride || getCharVoice(charId);
    if (vp.voiceSource === "builtin") return true;
    if (!hasCloudVoiceForCharacter(charId, vp) && cfg.builtinFallbackEnabled) return true;
    return false;
  }

  function hasVoiceForCharacter(charId) {
    const cfg = _configCache;
    if (!cfg.enabled) return false;
    const vp = getCharVoice(charId);
    if (vp.voiceSource === "builtin") return Boolean(global.BuiltinVoiceBridge);
    if (hasCloudVoiceForCharacter(charId, vp)) return true;
    if (cfg.builtinFallbackEnabled && global.BuiltinVoiceBridge) return true;
    return false;
  }

  async function synthesizeForCharacter(rawText, charId, opts = {}) {
    await hydrate();
    const cfg = _configCache;
    if (!cfg.workerBaseUrl) {
      throw new Error("请先在「设置 → 语音工作台」配置 Cloudflare Worker 网关地址");
    }
    const provider = opts.provider || resolveActiveProvider(cfg);
    const vp = opts.voiceOverride ? { ...getCharVoice(charId), ...opts.voiceOverride } : getCharVoice(charId);
    const base = cfg.workerBaseUrl.replace(/\/+$/, "");

    let cleanText = "";
    let cacheParams = null;

    if (provider === "fishaudio") {
      if (!cfg.fishApiKey) throw new Error("请先填写鱼声 Fish Audio API Key");
      const refId = normalizeFishReferenceId(vp.fishReferenceId);
      if (!refId) throw new Error("请先在聊天设置中为该名士填写鱼声音色 ID 或链接");
      cleanText = cleanTextForTtsFish(rawText);
      if (!cleanText) throw new Error("可朗读文本为空");
      const model = cfg.fishModel || "s2.1-pro";
      cacheParams = { provider, model, refId, text: cleanText, speed: Number(vp.speed || 1) };
      const hash = hashTtsParams(cacheParams);
      const cached = await getCachedAudioBlob(hash);
      if (cached) return { blob: cached, url: URL.createObjectURL(cached), cached: true, provider, hash };

      const res = await fetch(`${base}/voice/fish/tts?model=${encodeURIComponent(model)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.fishApiKey.trim()}`
        },
        body: JSON.stringify({
          text: cleanText,
          reference_id: refId,
          format: "mp3",
          prosody: { speed: Number(vp.speed || 1.0), volume: 0 }
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`鱼声合成失败 (HTTP ${res.status}): ${errText.slice(0, 160)}`);
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error("鱼声返回空音频");
      await saveCachedAudioBlob(hash, blob);
      return { blob, url: URL.createObjectURL(blob), cached: false, provider, hash };
    }

    if (provider === "minimax") {
      if (!cfg.minimaxApiKey) throw new Error("请先填写 MiniMax API Key");
      const vid = String(vp.minimaxVoiceId || "").trim();
      if (!vid) throw new Error("请先在聊天设置中为该名士填写 MiniMax Voice ID");
      cleanText = cleanTextForTtsMinimax(rawText);
      if (!cleanText) throw new Error("可朗读文本为空");
      const model = cfg.minimaxModel || "speech-2.8-hd";
      const region = cfg.minimaxRegion === "overseas" ? "overseas" : "domestic";
      cacheParams = { provider, model, region, vid, text: cleanText, speed: Number(vp.speed || 1), pitch: Number(vp.pitch || 0) };
      const hash = hashTtsParams(cacheParams);
      const cached = await getCachedAudioBlob(hash);
      if (cached) return { blob: cached, url: URL.createObjectURL(cached), cached: true, provider, hash };

      const payload = {
        model,
        text: cleanText,
        stream: false,
        output_format: "hex",
        voice_setting: {
          voice_id: vid,
          speed: Number(vp.speed || 1.0),
          vol: 1.0,
          pitch: Math.round(Number(vp.pitch || 0))
        },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }
      };
      if (cfg.minimaxGroupId) payload.group_id = cfg.minimaxGroupId.trim();

      const res = await fetch(`${base}/voice/minimax/t2a?region=${encodeURIComponent(region)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.minimaxApiKey.trim()}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json.base_resp && json.base_resp.status_code && json.base_resp.status_code !== 0)) {
        const msg = (json.base_resp && json.base_resp.status_msg) || json.error || `HTTP ${res.status}`;
        throw new Error(`MiniMax 合成失败: ${msg}`);
      }
      const hex = json.data && json.data.audio;
      if (!hex || typeof hex !== "string") throw new Error("MiniMax 未返回音频数据");
      const bytes = hexToBytes(hex);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      await saveCachedAudioBlob(hash, blob);
      return { blob, url: URL.createObjectURL(blob), cached: false, provider, hash };
    }

    // ElevenLabs
    if (!cfg.elevenLabsApiKey) throw new Error("请先填写 ElevenLabs API Key");
    const elVid = String(vp.elevenLabsVoiceId || "").trim();
    if (!elVid) throw new Error("请先在聊天设置中为该名士填写 ElevenLabs Voice ID");
    cleanText = cleanTextForTtsElevenLabs(rawText);
    if (!cleanText) throw new Error("可朗读文本为空");
    const elModel = cfg.elevenLabsModel || "eleven_v3";
    cacheParams = { provider: "elevenlabs", model: elModel, elVid, text: cleanText };
    const hash = hashTtsParams(cacheParams);
    const cached = await getCachedAudioBlob(hash);
    if (cached) return { blob: cached, url: URL.createObjectURL(cached), cached: true, provider: "elevenlabs", hash };

    const res = await fetch(`${base}/voice/elevenlabs/tts?voice_id=${encodeURIComponent(elVid)}&output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": cfg.elevenLabsApiKey.trim()
      },
      body: JSON.stringify({ text: cleanText, model_id: elModel })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ElevenLabs 合成失败 (HTTP ${res.status}): ${errText.slice(0, 160)}`);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error("ElevenLabs 返回空音频");
    await saveCachedAudioBlob(hash, blob);
    return { blob, url: URL.createObjectURL(blob), cached: false, provider: "elevenlabs", hash };
  }

  // ==========================================
  // 5. 全局单例播放器 + iOS 静音预热解锁
  // ==========================================
  const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";
  let _audioEl = null;
  let _activeObjectUrl = "";
  let _playState = { status: "idle", key: "", error: "" }; // idle | loading | playing | error

  function getAudioEl() {
    if (!_audioEl && typeof Audio !== "undefined") {
      _audioEl = new Audio();
      _audioEl.preload = "auto";
    }
    return _audioEl;
  }

  function emitEvent(name, detail) {
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent(name, { detail }));
      }
    } catch (e) {}
  }

  function setPlayState(next) {
    _playState = { ..._playState, ...next };
    emitEvent("milvus-voice-state", { ..._playState });
  }

  function primeVoiceAudio() {
    const audio = getAudioEl();
    if (!audio) return;
    if (!audio.paused && audio.src && audio.src !== SILENT_WAV) return;
    try {
      audio.src = SILENT_WAV;
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          if (audio.src === SILENT_WAV) {
            audio.pause();
            audio.removeAttribute("src");
          }
        }).catch(() => {});
      }
    } catch (e) {}
  }

  function stopPlayback(opts) {
    const audio = getAudioEl();
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
    }
    if (_activeObjectUrl) {
      try { URL.revokeObjectURL(_activeObjectUrl); } catch (e) {}
      _activeObjectUrl = "";
    }
    if (!(opts && opts.skipBuiltin) && global.BuiltinVoiceBridge && typeof global.BuiltinVoiceBridge.stop === "function") {
      try {
        global.BuiltinVoiceBridge.stop({ skipExternal: true });
      } catch (e) {}
    }
    setPlayState({ status: "idle", key: "", error: "" });
  }

  async function playTextForCharacter(text, charId, opts = {}) {
    const key = opts.msgKey || `${charId}_${cyrb53(String(text || ""))}`;
    if (_playState.key === key && (_playState.status === "playing" || _playState.status === "loading")) {
      stopPlayback();
      return;
    }
    const vpEffective = opts.voiceOverride ? { ...getCharVoice(charId), ...opts.voiceOverride } : getCharVoice(charId);
    const useBuiltin = shouldUseBuiltinForCharacter(charId, vpEffective);

    if (useBuiltin && global.BuiltinVoiceBridge && typeof global.BuiltinVoiceBridge.speakText === "function") {
      stopPlayback();
      const cfg = _configCache;
      const isDirectBuiltin = vpEffective.voiceSource === "builtin";
      const builtinOpts = isDirectBuiltin
        ? {
            key,
            builtinMode: vpEffective.builtinMode || "animalese",
            builtinPresetId: vpEffective.builtinPresetId || "scholar-warm",
            builtinWebVoiceURI: vpEffective.builtinWebVoiceURI || "",
            builtinTuning: vpEffective.builtinTuning || null,
            speed: vpEffective.speed || 1.0,
            builtinPitch: vpEffective.builtinPitch || 1.0
          }
        : {
            key,
            builtinMode: cfg.defaultBuiltinMode || "animalese",
            builtinPresetId: cfg.defaultBuiltinPresetId || "scholar-warm",
            builtinWebVoiceURI: cfg.defaultBuiltinWebVoiceURI || "",
            builtinTuning: cfg.defaultBuiltinTuning || null,
            speed: vpEffective.speed || 1.0,
            builtinPitch: 1.0
          };
      setPlayState({ status: "playing", key, error: "" });
      try {
        const res = await global.BuiltinVoiceBridge.speakText(text, builtinOpts, {
          onEnd: () => {
            if (_playState.key === key) setPlayState({ status: "idle", key: "", error: "" });
          },
          onError: (e) => {
            setPlayState({ status: "error", key, error: (e && e.message) || "内置音色播报失败" });
          }
        });
        return res;
      } catch (err) {
        setPlayState({ status: "error", key, error: (err && err.message) || "内置音色播报失败" });
        throw err;
      }
    }

    primeVoiceAudio();
    stopPlayback();
    setPlayState({ status: "loading", key, error: "" });
    try {
      const result = await synthesizeForCharacter(text, charId, opts);
      if (_playState.key !== key) {
        try { URL.revokeObjectURL(result.url); } catch (e) {}
        return;
      }
      const audio = getAudioEl();
      if (!audio) throw new Error("当前环境不支持 Audio 播放");
      _activeObjectUrl = result.url;
      audio.src = result.url;
      audio.onended = () => stopPlayback();
      audio.onerror = () => setPlayState({ status: "error", key, error: "音频播放失败，请重试" });
      await audio.play();
      setPlayState({ status: "playing", key, error: "" });
      return result;
    } catch (err) {
      const msg = err && err.name === "NotAllowedError"
        ? "浏览器拦截了自动播放，请再点一次小喇叭收听（已缓存，不重复计费）"
        : (err && err.message) || "语音合成失败";
      setPlayState({ status: "error", key, error: msg });
      throw err;
    }
  }

  // ==========================================
  // 6. 四路统一语音输入（STT + 16kHz WAV 编码）
  // ==========================================
  function resolveSttProvider(cfg) {
    const c = cfg || _configCache;
    if (c.sttProvider === "browser") return "browser";
    const hasKey = (p) => (p === "fishaudio" ? !!c.fishApiKey : p === "minimax" ? !!c.minimaxApiKey : p === "elevenlabs" ? !!c.elevenLabsApiKey : false);
    if (c.sttProvider && c.sttProvider !== "auto" && hasKey(c.sttProvider) && c.workerBaseUrl) return c.sttProvider;
    const preferred = [c.ttsProvider, "fishaudio", "minimax", "elevenlabs"];
    if (c.workerBaseUrl) {
      for (const p of preferred) {
        if (hasKey(p)) return p;
      }
    }
    return "browser";
  }

  async function uploadWavToStt(wavBlob, provider, cfg) {
    const base = cfg.workerBaseUrl.replace(/\/+$/, "");
    const form = new FormData();
    let url = "";
    const headers = {};

    if (provider === "fishaudio") {
      url = `${base}/voice/fish/stt?model=transcribe-1-pro`;
      headers["Authorization"] = `Bearer ${cfg.fishApiKey.trim()}`;
      form.append("audio", wavBlob, "voice.wav");
      form.append("language", "zh");
    } else if (provider === "minimax") {
      const region = cfg.minimaxRegion === "overseas" ? "overseas" : "domestic";
      url = `${base}/voice/minimax/stt?region=${encodeURIComponent(region)}`;
      headers["Authorization"] = `Bearer ${cfg.minimaxApiKey.trim()}`;
      form.append("file", wavBlob, "voice.wav");
      form.append("model", "asr-1.0");
    } else {
      url = `${base}/voice/elevenlabs/stt`;
      headers["xi-api-key"] = cfg.elevenLabsApiKey.trim();
      form.append("file", wavBlob, "voice.wav");
      form.append("model_id", "scribe_v2");
    }

    const res = await fetch(url, { method: "POST", headers, body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `语音识别失败 (HTTP ${res.status})`);
    }
    const text = (data.text || (data.data && data.data.text) || "").trim();
    if (!text) throw new Error("未识别到清晰人声，请再说一次");
    return text;
  }

  function startRecordingAndTranscribe(callbacks = {}) {
    const cfg = _configCache;
    const provider = resolveSttProvider(cfg);
    let stopped = false;

    if (provider === "browser") {
      const Ctor = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (!Ctor) {
        callbacks.onError && callbacks.onError("当前浏览器不支持免费语音识别，请在「设置 → 语音工作台」配置鱼声/MiniMax Key");
        callbacks.onEnd && callbacks.onEnd();
        return { stop: () => {}, provider: "browser" };
      }
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "zh-CN";
      let latest = "";
      rec.onresult = (ev) => {
        let full = "";
        for (let i = 0; i < ev.results.length; i++) full += ev.results[i][0].transcript;
        latest = full.trim();
        if (latest) callbacks.onPartial && callbacks.onPartial(latest);
      };
      rec.onerror = (e) => {
        const msg = e.error === "not-allowed" ? "麦克风权限被拒绝" : e.error === "network" ? "浏览器免费识别断网，建议配置云端语音 Key" : `识别失败 (${e.error})`;
        callbacks.onError && callbacks.onError(msg);
      };
      rec.onend = () => {
        if (latest) callbacks.onFinal && callbacks.onFinal(latest);
        callbacks.onEnd && callbacks.onEnd();
      };
      try { rec.start(); } catch (e) { callbacks.onError && callbacks.onError(e.message); }
      return {
        provider: "browser",
        stop: () => {
          if (stopped) return;
          stopped = true;
          try { rec.stop(); } catch (e) {}
        }
      };
    }

    // 云端高精度 ASR：采集 PCM 并转 16kHz WAV
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      callbacks.onError && callbacks.onError("当前页面非 HTTPS 安全环境或不支持麦克风录音");
      callbacks.onEnd && callbacks.onEnd();
      return { stop: () => {}, provider };
    }

    let stream = null;
    let audioCtx = null;
    let processor = null;
    let source = null;
    const pcmChunks = [];
    let sampleRate = 44100;

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        audioCtx = new AudioCtx();
        sampleRate = audioCtx.sampleRate || 44100;
        source = audioCtx.createMediaStreamSource(stream);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (ev) => {
          if (stopped) return;
          const data = ev.inputBuffer.getChannelData(0);
          pcmChunks.push(new Float32Array(data));
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
      })
      .catch((err) => {
        callbacks.onError && callbacks.onError(err && err.name === "NotAllowedError" ? "请允许麦克风权限" : (err.message || "无法打开麦克风"));
        callbacks.onEnd && callbacks.onEnd();
      });

    return {
      provider,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        try { processor && processor.disconnect(); } catch (e) {}
        try { source && source.disconnect(); } catch (e) {}
        try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        try { audioCtx && audioCtx.close(); } catch (e) {}

        const totalLen = pcmChunks.reduce((n, c) => n + c.length, 0);
        if (totalLen < 1600) {
          callbacks.onError && callbacks.onError("录音时间太短，请再试一次");
          callbacks.onEnd && callbacks.onEnd();
          return;
        }
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of pcmChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        const wavBlob = encodeWavFromFloat32(merged, sampleRate, 16000);
        callbacks.onTranscribing && callbacks.onTranscribing(true);
        try {
          const text = await uploadWavToStt(wavBlob, provider, cfg);
          callbacks.onFinal && callbacks.onFinal(text);
        } catch (err) {
          callbacks.onError && callbacks.onError(err.message || "语音转文字失败");
        } finally {
          callbacks.onTranscribing && callbacks.onTranscribing(false);
          callbacks.onEnd && callbacks.onEnd();
        }
      }
    };
  }

  async function testVoiceConnection(workerUrl) {
    const base = String(workerUrl || _configCache.workerBaseUrl || "").trim().replace(/\/+$/, "");
    if (!base) return { ok: false, message: "请先填写 Cloudflare Worker 网关地址" };
    try {
      const res = await fetch(`${base}/voice`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok) {
        return { ok: true, message: "语音云端网关连通正常 ✓（支持 Fish / MiniMax / ElevenLabs）" };
      }
      return { ok: false, message: `网关返回异常 (HTTP ${res.status})，请确认已部署新版 cf_worker.js` };
    } catch (e) {
      return { ok: false, message: `连接失败: ${e.message}` };
    }
  }

  // ==========================================
  // 7. 极简 React UI 挂载组件 + 史子眇（史君）新手引导弹窗
  // ==========================================
  function ShiZimiaoVoiceGuideModal(props) {
    const React = global.React;
    const ReactDOM = global.ReactDOM;
    if (!React || !props || !props.open) return null;
    const onClose = props.onClose || function () {};

    const cardStyle = {
      background: "#FFFDF9",
      border: "1px solid #E5DEC9",
      borderRadius: "12px",
      padding: "11px 13px",
      marginBottom: "10px",
      lineHeight: 1.65,
      fontSize: "12px",
      color: "#4A4338"
    };

    const modalNode = React.createElement(
      "div",
      {
        onClick: onClose,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          background: "rgba(32, 28, 22, 0.56)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
        }
      },
      React.createElement(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            maxWidth: "430px",
            maxHeight: "84vh",
            overflowY: "auto",
            background: "linear-gradient(180deg, #FDF9F0 0%, #F7F1E3 100%)",
            borderRadius: "18px",
            border: "1px solid #DFD4BC",
            boxShadow: "0 18px 44px rgba(0,0,0,0.28)",
            padding: "18px 16px 16px",
            color: "#3F382E"
          }
        },
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" } },
          React.createElement(
            "div",
            null,
            React.createElement("div", { style: { fontSize: "15px", fontWeight: 700, color: "#3A3328" } }, "🏮 史君的语音指路帖"),
            React.createElement("div", { style: { fontSize: "11px", color: "#8A7E6A", marginTop: "2px" } }, "太一宫掌事 · 史子眇 亲笔（附桂花糕碎屑）")
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: {
                border: "none",
                background: "rgba(94,103,86,0.12)",
                color: "#4E5747",
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 700
              }
            },
            "✕"
          )
        ),
        React.createElement(
          "div",
          {
            style: {
              ...cardStyle,
              background: "#F5EFE0",
              borderColor: "#DDD0B4",
              fontStyle: "normal"
            }
          },
          "「好孩子，来，先吃块桂花糕再看。这小物件叫『语音工作台』，看着线头多，其实不难的——老夫先替你把路标画好，免得像当年在炼丹炉里熬桂花羹那样，一不小心把屋顶炸飞了……唔，呣，别急，咱们一步步来。」"
        ),
        React.createElement(
          "div",
          { style: cardStyle },
          React.createElement("div", { style: { fontWeight: 700, color: "#5E6756", marginBottom: "4px" } }, "一、这玩意儿能做什么？"),
          "• ", React.createElement("b", null, "听名士开口说话（TTS）"), "：每位名士都能单独配一个专属声音，互不串音；点开聊天气泡下面的「🔊 朗读」就能听见。听过的声音老夫都替你收在锦囊（本地缓存）里了，重听不花二次钱。",
          React.createElement("br"),
          "• ", React.createElement("b", null, "你直接开口说话（STT）"), "：按麦克风说话，自动帮你转成文字发出去，再也不怕浏览器免费识别断网啦。"
        ),
        React.createElement(
          "div",
          { style: cardStyle },
          React.createElement("div", { style: { fontWeight: 700, color: "#5E6756", marginBottom: "4px" } }, "二、为什么要点「⚡ 一键复用 Worker」？"),
          "好孩子，手机和网页直接去敲鱼声、海螺这些官署的大门，常会被门卫（浏览器跨域限制）拦在外面。你之前若已经搭好了 Cloudflare Worker，把最新一份 ",
          React.createElement("code", { style: { background: "#EFE8D8", padding: "1px 4px", borderRadius: "4px" } }, "cf_worker.js"),
          " 贴上去重新点一下部署，再回来点「⚡ 一键复用 Worker」和「🔍 测试语音网关」，门就开了。"
        ),
        React.createElement(
          "div",
          { style: cardStyle },
          React.createElement("div", { style: { fontWeight: 700, color: "#5E6756", marginBottom: "4px" } }, "三、三家音色选哪家？（闭眼抄作业）"),
          "• ", React.createElement("b", null, "鱼声 Fish Audio（最推荐）"), "：同人、名士音色最多！去 fish.audio 拿到 API Key 填在这里，找好喜欢的声音后，直接把网页链接整条粘进名士的音色框，老夫会自动帮你把 32 位编号摘出来。",
          React.createElement("br"),
          "• ", React.createElement("b", null, "MiniMax 海螺"), "：中文停顿和情绪最像活人，国内站直接可用，也不会干扰你原本的聊天模型。",
          React.createElement("br"),
          "• ", React.createElement("b", null, "ElevenLabs"), "：若是外语对白，这家质感最好。"
        ),
        React.createElement(
          "div",
          { style: cardStyle },
          React.createElement("div", { style: { fontWeight: 700, color: "#5E6756", marginBottom: "4px" } }, "四、怎么给名士配声音？"),
          "1. 先在这里填好 Worker 地址和任意一家的 API Key；",
          React.createElement("br"),
          "2. 进任意名士的聊天页面 → 点右上角「聊天设置」→ 找到「🔊 专属音色」，贴上音色 ID，点「🔊 试听一句」；",
          React.createElement("br"),
          "3. 回到传讯界面，名士消息下面就会多出一枚「🔊 朗读」小牌子，点一下就能听啦（手机若提示拦截播放，再轻点一下即可）。"
        ),
        React.createElement(
          "div",
          { style: { fontSize: "11.5px", color: "#7B6E59", textAlign: "center", margin: "8px 0 12px" } },
          "「没关系的，弄乱了也没事，老夫会替你兜底的。好孩子，调完记得好好吃饭呀。」"
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: onClose,
            style: {
              width: "100%",
              padding: "9px 0",
              borderRadius: "10px",
              border: "none",
              background: "#5E6756",
              color: "#FFF",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer"
            }
          },
          "多谢史君前辈，我知道啦"
        )
      )
    );

    if (ReactDOM && typeof ReactDOM.createPortal === "function" && global.document && global.document.body) {
      return ReactDOM.createPortal(modalNode, global.document.body);
    }
    return modalNode;
  }

  function VoiceStudioSettingsCard() {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect } = React;
    const [cfg, setCfg] = useState(getConfig());
    const [stats, setStats] = useState({ count: 0, totalMB: 0 });
    const [tip, setTip] = useState("");
    const [testing, setTesting] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
      hydrate(true).then(({ config }) => setCfg({ ...config }));
      getCacheStats().then(setStats).catch(() => {});
    }, []);

    const update = (patch) => {
      const next = { ...cfg, ...patch };
      setCfg(next);
      saveConfig(next).catch(() => {});
    };

    const handleReuseWorker = () => {
      const found = discoverExistingWorkerBaseUrl();
      if (found) {
        update({ workerBaseUrl: found });
        setTip(`已自动复用 Worker：${found}`);
      } else {
        setTip("未检测到已保存的 Worker 域名，请手动填写 https://你的worker.workers.dev");
      }
    };

    const handleTest = async () => {
      setTesting(true);
      setTip("正在测试 /voice 网关连通性...");
      const r = await testVoiceConnection(cfg.workerBaseUrl);
      setTip(r.message);
      setTesting(false);
    };

    const handleClearCache = async () => {
      await clearAudioCache();
      setStats({ count: 0, totalMB: 0 });
      setTip("已清空本地语音缓存 ✓");
    };

    const inputStyle = {
      width: "100%",
      padding: "8px 10px",
      borderRadius: "8px",
      border: "1px solid #DCD5C7",
      background: "#FAF8F3",
      fontSize: "12px",
      color: "#383833",
      boxSizing: "border-box"
    };
    const pillBtn = (active) => ({
      padding: "5px 10px",
      borderRadius: "999px",
      border: active ? "1px solid #5E6756" : "1px solid #D5CFC2",
      background: active ? "#5E6756" : "#FAF8F3",
      color: active ? "#FFFFFF" : "#5A584F",
      fontSize: "11px",
      cursor: "pointer"
    });

    const BuiltinPanel = global.BuiltinVoiceBridge && global.BuiltinVoiceBridge.BuiltinVoiceStudioPanel;

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        {
          style: {
            margin: "12px 0",
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid #E3DDD1",
            background: "#FFFFFF",
            color: "#383833",
            fontSize: "12px"
          }
        },
      React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          React.createElement("span", { style: { fontWeight: 700, fontSize: "13px" } }, "🎙️ 语音配置工作台（TTS + STT）"),
          React.createElement(
            "button",
            {
              type: "button",
              title: "史君的语音指路帖（新手教程）",
              onClick: () => setShowGuide(true),
              style: {
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: "1px solid #C9BFA9",
                background: "#FAF5E8",
                color: "#6B5D45",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0
              }
            },
            "?"
          )
        ),
        React.createElement(
          "label",
          { style: { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", cursor: "pointer" } },
          React.createElement("input", {
            type: "checkbox",
            checked: !!cfg.enabled,
            onChange: (e) => update({ enabled: e.target.checked })
          }),
          cfg.enabled ? "已开启" : "已关闭"
        )
      ),
      React.createElement(ShiZimiaoVoiceGuideModal, { open: showGuide, onClose: () => setShowGuide(false) }),
      React.createElement(
        "div",
        { style: { marginBottom: "10px" } },
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
          React.createElement("span", { style: { fontSize: "11px", color: "#6A685F" } }, "云端 Worker 网关地址（复用同一个 Worker）"),
          React.createElement(
            "button",
            { type: "button", onClick: handleReuseWorker, style: { ...pillBtn(false), padding: "2px 8px", fontSize: "10.5px" } },
            "⚡ 一键复用 Worker"
          )
        ),
        React.createElement("input", {
          type: "text",
          value: cfg.workerBaseUrl || "",
          placeholder: "https://your-worker.workers.dev",
          onChange: (e) => update({ workerBaseUrl: e.target.value }),
          style: inputStyle
        })
      ),
      React.createElement(
        "div",
        { style: { marginBottom: "10px" } },
        React.createElement("div", { style: { fontSize: "11px", color: "#6A685F", marginBottom: "5px" } }, "TTS 语音合成服务商"),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
          [
            ["fishaudio", "鱼声 Fish Audio"],
            ["minimax", "MiniMax 海螺"],
            ["elevenlabs", "ElevenLabs"]
          ].map(([id, label]) =>
            React.createElement(
              "button",
              { key: id, type: "button", onClick: () => update({ ttsProvider: id }), style: pillBtn(cfg.ttsProvider === id) },
              label
            )
          )
        )
      ),
      cfg.ttsProvider === "fishaudio" &&
        React.createElement(
          "div",
          { style: { display: "grid", gap: "6px", marginBottom: "10px" } },
          React.createElement("input", {
            type: "password",
            value: cfg.fishApiKey || "",
            placeholder: "鱼声 Fish Audio API Key",
            onChange: (e) => update({ fishApiKey: e.target.value }),
            style: inputStyle
          }),
          React.createElement(
            "select",
            { value: cfg.fishModel || "s2.1-pro", onChange: (e) => update({ fishModel: e.target.value }), style: inputStyle },
            React.createElement("option", { value: "s2.1-pro" }, "模型：s2.1-pro（推荐，情感表现力最强）"),
            React.createElement("option", { value: "s2-pro" }, "模型：s2-pro"),
            React.createElement("option", { value: "s1" }, "模型：s1（经典）")
          )
        ),
      cfg.ttsProvider === "minimax" &&
        React.createElement(
          "div",
          { style: { display: "grid", gap: "6px", marginBottom: "10px" } },
          React.createElement("input", {
            type: "password",
            value: cfg.minimaxApiKey || "",
            placeholder: "MiniMax API Key（独立存储，不干扰主对话模型）",
            onChange: (e) => update({ minimaxApiKey: e.target.value }),
            style: inputStyle
          }),
          React.createElement("input", {
            type: "text",
            value: cfg.minimaxGroupId || "",
            placeholder: "MiniMax Group ID（可选，新版 Key 可留空）",
            onChange: (e) => update({ minimaxGroupId: e.target.value }),
            style: inputStyle
          }),
          React.createElement(
            "div",
            { style: { display: "flex", gap: "6px" } },
            React.createElement(
              "select",
              { value: cfg.minimaxRegion || "domestic", onChange: (e) => update({ minimaxRegion: e.target.value }), style: inputStyle },
              React.createElement("option", { value: "domestic" }, "国内站 (api.minimaxi.com)"),
              React.createElement("option", { value: "overseas" }, "海外站 (api.minimax.io)")
            ),
            React.createElement(
              "select",
              { value: cfg.minimaxModel || "speech-2.8-hd", onChange: (e) => update({ minimaxModel: e.target.value }), style: inputStyle },
              React.createElement("option", { value: "speech-2.8-hd" }, "speech-2.8-hd（推荐）"),
              React.createElement("option", { value: "speech-2.6-hd" }, "speech-2.6-hd"),
              React.createElement("option", { value: "speech-02-hd" }, "speech-02-hd")
            )
          )
        ),
      cfg.ttsProvider === "elevenlabs" &&
        React.createElement(
          "div",
          { style: { display: "grid", gap: "6px", marginBottom: "10px" } },
          React.createElement("input", {
            type: "password",
            value: cfg.elevenLabsApiKey || "",
            placeholder: "ElevenLabs API Key (xi-api-key)",
            onChange: (e) => update({ elevenLabsApiKey: e.target.value }),
            style: inputStyle
          }),
          React.createElement(
            "select",
            { value: cfg.elevenLabsModel || "eleven_v3", onChange: (e) => update({ elevenLabsModel: e.target.value }), style: inputStyle },
            React.createElement("option", { value: "eleven_v3" }, "eleven_v3（推荐，多语种情感佳）"),
            React.createElement("option", { value: "eleven_multilingual_v2" }, "eleven_multilingual_v2")
          )
        ),
      React.createElement(
        "div",
        { style: { marginBottom: "10px" } },
        React.createElement("div", { style: { fontSize: "11px", color: "#6A685F", marginBottom: "4px" } }, "语音输入转文字（STT）路线"),
        React.createElement(
          "select",
          { value: cfg.sttProvider || "auto", onChange: (e) => update({ sttProvider: e.target.value }), style: inputStyle },
          React.createElement("option", { value: "auto" }, "自动优先（已配云端 Key 优先，否则回退浏览器免费）"),
          React.createElement("option", { value: "fishaudio" }, "鱼声 Fish ASR (transcribe-1-pro)"),
          React.createElement("option", { value: "minimax" }, "MiniMax ASR (asr-1.0)"),
          React.createElement("option", { value: "elevenlabs" }, "ElevenLabs Scribe v2"),
          React.createElement("option", { value: "browser" }, "仅使用浏览器免费识别")
        )
      ),
      React.createElement(
        "div",
        { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
        React.createElement(
          "button",
          { type: "button", disabled: testing, onClick: handleTest, style: pillBtn(true) },
          testing ? "测试中..." : "🔍 测试语音网关"
        ),
        React.createElement(
          "button",
          { type: "button", onClick: handleClearCache, style: pillBtn(false) },
          `🧹 清空缓存 (${stats.count} 条 / ${stats.totalMB} MB)`
        )
      ),
      tip && React.createElement("div", { style: { marginTop: "8px", fontSize: "11px", color: "#5E6756" } }, tip)
      ),
      BuiltinPanel ? React.createElement(BuiltinPanel, null) : null
    );
  }

  function CharacterVoiceCard(props) {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect } = React;
    const charId = String((props && props.charId) || "");
    const charName = (props && props.charName) || "当前名士";
    const [cfg, setCfg] = useState(getConfig());
    const [vp, setVp] = useState(getCharVoice(charId));
    const [status, setStatus] = useState("");

    useEffect(() => {
      hydrate(true).then(({ config }) => {
        setCfg({ ...config });
        setVp(getCharVoice(charId));
      });
    }, [charId]);

    const updateVp = (patch) => {
      const next = { ...vp, ...patch };
      setVp(next);
      saveCharVoice(charId, next).catch(() => {});
    };

    const handlePreview = async () => {
      setStatus("正在合成试听...");
      try {
        await playTextForCharacter(`殿下，${charName}的专属语音已经配置妥当，听起来还满意吗？`, charId, {
          msgKey: `preview_${charId}`,
          voiceOverride: vp
        });
        setStatus("正在播放试听 ✓");
      } catch (e) {
        setStatus(e.message || "试听失败");
      }
    };

    const provider = resolveActiveProvider(cfg);
    const voiceSource = vp.voiceSource === "builtin" ? "builtin" : "clone";
    const BuiltinCharControls = global.BuiltinVoiceBridge && global.BuiltinVoiceBridge.CharacterBuiltinVoiceControls;
    const inputStyle = {
      width: "100%",
      padding: "7px 10px",
      borderRadius: "8px",
      border: "1px solid #D8CFC0",
      background: "#FAF8F3",
      fontSize: "12px",
      color: "#433C31",
      boxSizing: "border-box"
    };

    return React.createElement(
      "div",
      {
        style: {
          margin: "10px 16px",
          padding: "12px",
          borderRadius: "12px",
          border: "1px solid #E3D9C8",
          background: "#FFFCF7",
          fontSize: "12px",
          color: "#433C31"
        }
      },
      React.createElement(
        "div",
        { style: { fontWeight: 700, marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" } },
        React.createElement("span", null, `🔊 ${charName} · 专属音色（按角色独立）`),
        React.createElement(
          "span",
          { style: { fontSize: "10.5px", color: "#8B7D6B" } },
          voiceSource === "builtin"
            ? (global.BuiltinVoiceBridge ? global.BuiltinVoiceBridge.describeBuiltinVoice(vp) : "内置音色")
            : `云端：${provider}`
        )
      ),
      // 双轨切换：云端克隆 vs 内置免费音色
      React.createElement(
        "div",
        { style: { display: "flex", gap: "6px", marginBottom: "8px", background: "#F2ECE0", padding: "3px", borderRadius: "9px" } },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => updateVp({ voiceSource: "clone" }),
            style: {
              flex: 1,
              padding: "5px 8px",
              borderRadius: "7px",
              border: "none",
              background: voiceSource === "clone" ? "#FFFFFF" : "transparent",
              color: voiceSource === "clone" ? "#433C31" : "#7D7568",
              fontSize: "11px",
              fontWeight: voiceSource === "clone" ? 700 : 500,
              cursor: "pointer"
            }
          },
          "☁️ 云端克隆音色"
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => updateVp({ voiceSource: "builtin" }),
            style: {
              flex: 1,
              padding: "5px 8px",
              borderRadius: "7px",
              border: "none",
              background: voiceSource === "builtin" ? "#FFFFFF" : "transparent",
              color: voiceSource === "builtin" ? "#3D5B42" : "#7D7568",
              fontSize: "11px",
              fontWeight: voiceSource === "builtin" ? 700 : 500,
              cursor: "pointer"
            }
          },
          "📻 内置音色（免 Key）"
        )
      ),
      voiceSource === "builtin" && BuiltinCharControls
        ? React.createElement(BuiltinCharControls, {
            charId,
            charName,
            vp,
            onUpdateVp: updateVp
          })
        : React.createElement(
            React.Fragment,
            null,
            provider === "fishaudio" &&
              React.createElement("input", {
                type: "text",
                value: vp.fishReferenceId || "",
                placeholder: "粘贴鱼声 reference_id 或 fish.audio 音色链接（自动提取）",
                onChange: (e) => updateVp({ fishReferenceId: e.target.value }),
                onBlur: (e) => updateVp({ fishReferenceId: normalizeFishReferenceId(e.target.value) }),
                style: inputStyle
              }),
            provider === "minimax" &&
              React.createElement("input", {
                type: "text",
                value: vp.minimaxVoiceId || "",
                placeholder: "输入该名士专属 MiniMax Voice ID",
                onChange: (e) => updateVp({ minimaxVoiceId: e.target.value }),
                style: inputStyle
              }),
            provider === "elevenlabs" &&
              React.createElement("input", {
                type: "text",
                value: vp.elevenLabsVoiceId || "",
                placeholder: "输入该名士专属 ElevenLabs Voice ID",
                onChange: (e) => updateVp({ elevenLabsVoiceId: e.target.value }),
                style: inputStyle
              }),
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap", fontSize: "11px" } },
              React.createElement(
                "label",
                { style: { display: "flex", alignItems: "center", gap: "4px" } },
                `语速 ${Number(vp.speed || 1).toFixed(2)}x`,
                React.createElement("input", {
                  type: "range",
                  min: "0.75",
                  max: "1.35",
                  step: "0.05",
                  value: Number(vp.speed || 1),
                  onChange: (e) => updateVp({ speed: parseFloat(e.target.value) }),
                  style: { width: "76px" }
                })
              ),
              React.createElement(
                "label",
                { style: { display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } },
                React.createElement("input", {
                  type: "checkbox",
                  checked: !!vp.autoPlay,
                  onChange: (e) => updateVp({ autoPlay: e.target.checked })
                }),
                "收到自动播"
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: handlePreview,
                  style: {
                    marginLeft: "auto",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "none",
                    background: "#5E6756",
                    color: "#FFF",
                    fontSize: "11px",
                    cursor: "pointer"
                  }
                },
                "🔊 试听一句"
              )
            ),
            status && React.createElement("div", { style: { marginTop: "6px", fontSize: "11px", color: "#6D6558" } }, status)
          )
    );
  }

  function VoiceMessagePlayPill(props) {
    const React = global.React;
    if (!React || !props || !props.text) return null;
    const { useState, useEffect } = React;
    const charId = String(props.charId || "");
    const rawText = String(props.text || "");
    const hasVoiceTag = /<[语語]音[^>]*>[\s\S]*?<\/\s*[语語]音\s*>/.test(rawText);
    const msgKey = String(props.msgId || `${charId}_${cyrb53(rawText)}`);
    const [state, setState] = useState(_playState);
    const [ready, setReady] = useState(hasVoiceForCharacter(charId));
    const [showTranscript, setShowTranscript] = useState(false);

    useEffect(() => {
      hydrate().then(() => setReady(hasVoiceForCharacter(charId)));
      const onPlay = (e) => setState(e.detail || _playState);
      const onCfg = () => setReady(hasVoiceForCharacter(charId));
      global.addEventListener && global.addEventListener("milvus-voice-state", onPlay);
      global.addEventListener && global.addEventListener("milvus-voice-config-changed", onCfg);
      global.addEventListener && global.addEventListener("milvus-voice-char-changed", onCfg);
      return () => {
        global.removeEventListener && global.removeEventListener("milvus-voice-state", onPlay);
        global.removeEventListener && global.removeEventListener("milvus-voice-config-changed", onCfg);
        global.removeEventListener && global.removeEventListener("milvus-voice-char-changed", onCfg);
      };
    }, [charId]);

    if (!ready && !hasVoiceTag) return null;
    const isMe = state.key === msgKey;
    const isLoading = isMe && state.status === "loading";
    const isPlaying = isMe && state.status === "playing";
    const isError = isMe && state.status === "error";

    // 手绘细线矢量图标（零 Emoji）
    const renderSvgIcon = (kind) => {
      const common = {
        width: 13,
        height: 13,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.9,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { flexShrink: 0, display: "block" }
      };
      if (kind === "stop") {
        return React.createElement(
          "svg",
          common,
          React.createElement("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2.5", fill: "currentColor", stroke: "none" })
        );
      }
      if (kind === "loading") {
        return React.createElement(
          "svg",
          common,
          React.createElement("circle", { cx: "12", cy: "12", r: "8.5", opacity: "0.28" }),
          React.createElement("path", { d: "M12 3.5a8.5 8.5 0 0 1 8.5 8.5" })
        );
      }
      if (kind === "error") {
        return React.createElement(
          "svg",
          common,
          React.createElement("path", { d: "M10.3 4.3 2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" }),
          React.createElement("path", { d: "M12 9.5v4" }),
          React.createElement("circle", { cx: "12", cy: "16.8", r: "0.8", fill: "currentColor" })
        );
      }
      if (kind === "wave") {
        return React.createElement(
          "svg",
          common,
          React.createElement("path", { d: "M6 9.5a4 4 0 0 1 0 5" }),
          React.createElement("path", { d: "M10 6.5a8 8 0 0 1 0 11" }),
          React.createElement("path", { d: "M14.5 4a12 12 0 0 1 0 16" })
        );
      }
      // speaker
      return React.createElement(
        "svg",
        common,
        React.createElement("path", { d: "M11 5.5 6.5 9.2H3.5a1 1 0 0 0-1 1v3.6a1 1 0 0 0 1 1h3L11 18.5V5.5Z" }),
        React.createElement("path", { d: "M15.2 9.2a4.2 4.2 0 0 1 0 5.6" }),
        React.createElement("path", { d: "M18.3 6.5a8 8 0 0 1 0 11" })
      );
    };

    // 若包含 <语音> 标签，渲染拟真微信式语音条 + 转文字开关
    if (hasVoiceTag) {
      const cleanTranscript = stripVoiceMarkupForDisplay(extractVoiceBlock(rawText));
      const estSec = Math.max(2, Math.min(60, Math.round(cleanTranscript.length / 4.2)));
      return React.createElement(
        "div",
        { style: { marginTop: "5px", display: "inline-flex", flexDirection: "column", gap: "4px", maxWidth: "240px" } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                playTextForCharacter(rawText, charId, { msgKey }).catch(() => {});
              },
              style: {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                minWidth: `${Math.min(185, 84 + estSec * 2.5)}px`,
                padding: "6px 11px",
                borderRadius: "12px",
                border: "1px solid rgba(94,103,86,0.28)",
                background: isPlaying ? "#E6EFE1" : "#FAF7F0",
                color: isError ? "#B54534" : "#3E4738",
                fontSize: "12px",
                cursor: "pointer"
              }
            },
            React.createElement(
              "span",
              { style: { display: "inline-flex", alignItems: "center", gap: "5px" } },
              renderSvgIcon(isLoading ? "loading" : isPlaying ? "stop" : isError ? "error" : "wave"),
              React.createElement("span", null, isLoading ? "合成中" : isPlaying ? "播报中" : isError ? "点击重试" : "语音条")
            ),
            React.createElement("span", { style: { fontSize: "11px", opacity: 0.75, marginLeft: "8px" } }, `${estSec}"`)
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                setShowTranscript((v) => !v);
              },
              style: {
                border: "none",
                background: "transparent",
                color: "#7A7467",
                fontSize: "10.5px",
                cursor: "pointer",
                padding: "2px 4px"
              }
            },
            showTranscript ? "收起文字" : "转文字"
          )
        ),
        showTranscript &&
          cleanTranscript &&
          React.createElement(
            "div",
            {
              style: {
                padding: "6px 9px",
                borderRadius: "8px",
                background: "rgba(255,252,247,0.92)",
                border: "1px solid #E6DFD1",
                fontSize: "11.5px",
                color: "#4B453A",
                lineHeight: 1.5
              }
            },
            cleanTranscript
          )
      );
    }

    return React.createElement(
      "button",
      {
        type: "button",
        title: isError ? state.error : isPlaying ? "点击停止朗读" : "点击用名士专属音色朗读",
        onClick: (e) => {
          e.stopPropagation();
          playTextForCharacter(rawText, charId, { msgKey }).catch(() => {});
        },
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          marginTop: "4px",
          padding: "3px 9px",
          borderRadius: "999px",
          border: "1px solid rgba(94,103,86,0.22)",
          background: isPlaying ? "rgba(94,103,86,0.14)" : "rgba(255,255,255,0.72)",
          color: isError ? "#B54534" : "#4E5747",
          fontSize: "10.5px",
          cursor: "pointer"
        }
      },
      renderSvgIcon(isLoading ? "loading" : isPlaying ? "stop" : isError ? "error" : "speaker"),
      React.createElement("span", null, isLoading ? "合成中" : isPlaying ? "播报中" : isError ? "重试语音" : "朗读")
    );
  }

  async function speakForCharacter(charId, text, opts = {}) {
    await hydrate();
    if (!hasVoiceForCharacter(charId)) return { skipped: true };
    return playTextForCharacter(text, charId, opts);
  }

  async function autoSpeakIfEnabled(charId, text, opts = {}) {
    await hydrate();
    const vp = getCharVoiceProfile(charId);
    if (!vp || !vp.autoPlay) return { skipped: true, reason: "auto_play_off" };
    if (!hasVoiceForCharacter(charId)) return { skipped: true, reason: "no_voice" };
    const cleanText = String(text || "").trim();
    if (!cleanText) return { skipped: true, reason: "empty_text" };
    return playTextForCharacter(cleanText, charId, opts);
  }

  async function requestMicPermission() {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        return { granted: false, reason: "unsupported" };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      return { granted: true };
    } catch (err) {
      return { granted: false, reason: (err && (err.name || err.message)) || "denied" };
    }
  }

  function startCallSpeechCapture(callbacks) {
    const cb = callbacks || {};
    const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (SR) {
      let stopped = false;
      const rec = new SR();
      rec.lang = "zh-CN";
      rec.interimResults = true;
      rec.continuous = false;
      rec.onstart = () => { if (typeof cb.onStart === "function") cb.onStart(); };
      rec.onresult = (e) => {
        if (stopped) return;
        let interim = "";
        let finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const txt = (r && r[0] && r[0].transcript) || "";
          if (r.isFinal) finalText += txt;
          else interim += txt;
        }
        if (interim && typeof cb.onInterim === "function") cb.onInterim(interim);
        if (finalText.trim() && typeof cb.onResult === "function") {
          stopped = true;
          cb.onResult(finalText.trim());
        }
      };
      rec.onerror = (e) => {
        if (typeof cb.onError === "function") cb.onError((e && e.error) || "语音识别失败");
      };
      rec.onend = () => {
        if (typeof cb.onEnd === "function") cb.onEnd();
      };
      try {
        rec.start();
      } catch (e) {
        if (typeof cb.onError === "function") cb.onError((e && e.message) || "无法启动麦克风");
      }
      return {
        stop: () => {
          stopped = true;
          try { rec.stop(); } catch (_) {}
        }
      };
    }

    // 兜底：使用 VoiceStudioEngine 录音转写会话
    let sttSession = null;
    try {
      sttSession = startRecordingAndTranscribe({
        onInterim: cb.onInterim,
        onResult: (txt) => {
          if (txt && txt.trim() && typeof cb.onResult === "function") cb.onResult(txt.trim());
          if (typeof cb.onEnd === "function") cb.onEnd();
        },
        onError: (err) => {
          if (typeof cb.onError === "function") cb.onError((err && err.message) || String(err || "录音失败"));
          if (typeof cb.onEnd === "function") cb.onEnd();
        }
      });
      if (typeof cb.onStart === "function") cb.onStart();
    } catch (e) {
      if (typeof cb.onError === "function") cb.onError((e && e.message) || "当前浏览器不支持语音识别");
      if (typeof cb.onEnd === "function") cb.onEnd();
    }
    return {
      stop: () => {
        if (sttSession && typeof sttSession.stop === "function") {
          try { sttSession.stop(); } catch (_) {}
        }
      }
    };
  }

  // 自动预热加载
  hydrate().catch(() => {});

  const api = {
    hydrate,
    getConfig,
    saveConfig,
    getCharVoice,
    getAllCharVoices,
    saveCharVoice,
    hasVoiceForCharacter,
    shouldUseBuiltinForCharacter,
    discoverExistingWorkerBaseUrl,
    getCacheStats,
    clearAudioCache,
    synthesizeForCharacter,
    playTextForCharacter,
    speakForCharacter,
    autoSpeakIfEnabled,
    stopPlayback,
    primeVoiceAudio,
    requestMicPermission,
    startCallSpeechCapture,
    startRecordingAndTranscribe,
    resolveSttProvider,
    testVoiceConnection,
    getVoiceActingGuide,
    // 纯函数导出（供调用与单测）
    cyrb53,
    hashTtsParams,
    hexToBytes,
    normalizeFishReferenceId,
    normalizeFishCue,
    collapseAdjacentFishCues,
    cleanTextForTtsFish,
    cleanTextForTtsMinimax,
    cleanTextForTtsElevenLabs,
    stripVoiceMarkupForDisplay,
    encodeWavFromFloat32,
    // React UI 组件
    ShiZimiaoVoiceGuideModal,
    VoiceStudioSettingsCard,
    CharacterVoiceCard,
    VoiceMessagePlayPill
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.VoiceStudioEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

