/**
 * Milvus/jianpu_workshop_engine.js
 * 「转换工坊」核心引擎（Phase 0）
 * - 零外部依赖，支持浏览器与 Node.js 双环境运行
 * - 1. Standard MIDI File (SMF Type 0 / 1) 二进制解析器（VLQ / Running Status / Tempo / TimeSig / KeySig / TrackName）
 * - 2. 智能主旋律推荐 + 12 调最优定调 + Skyline 单音/双押量化 + 标准简谱排版生成器
 * - 3. 野生谱多方言清洗器（数字方言 / 光遇原神 21 键 / 唱名 DoReMi / 音名 C4D4 / 歌词杂讯过滤 / 5- 歧义消解）
 * - 4. 简谱语法与手感体检器 + 小手机曲库直存（milvus_music_jianpu_library_v1）
 */
(function (global) {
  "use strict";

  const JIANPU_LIB_KEY = "milvus_music_jianpu_library_v1";

  const KEY_TO_ROOT_MIDI = {
    C: 60, "C#": 61, Db: 61, D: 62, "D#": 63, Eb: 63,
    E: 64, F: 65, "F#": 66, Gb: 66, G: 67, "G#": 68,
    Ab: 68, A: 69, "A#": 70, Bb: 70, B: 71
  };

  const MAJOR_KEYS_ORDERED = ["C", "G", "D", "F", "A", "Bb", "E", "Eb", "B", "Ab", "F#", "Db"];

  // MIDI Key Signature Meta Event (sf: -7..+7, mi: 0=major 1=minor)
  const MIDI_SF_TO_MAJOR_KEY = {
    "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
    "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#"
  };
  const MIDI_SF_TO_MINOR_REL_MAJOR = MIDI_SF_TO_MAJOR_KEY; // 简谱一律采用首调大调记谱

  // 半音偏移 (0..11) -> 简谱音级表示
  const SEMITONE_TO_DEGREE = [
    { deg: "1", acc: "" },
    { deg: "1", acc: "#" },
    { deg: "2", acc: "" },
    { deg: "3", acc: "b" },
    { deg: "3", acc: "" },
    { deg: "4", acc: "" },
    { deg: "4", acc: "#" },
    { deg: "5", acc: "" },
    { deg: "5", acc: "#" },
    { deg: "6", acc: "" },
    { deg: "7", acc: "b" },
    { deg: "7", acc: "" }
  ];

  // ==========================================
  // 1. 零依赖二进制 MIDI 解析器 (SMF Type 0 / 1)
  // ==========================================
  function decodeTrackText(bytes) {
    if (!bytes || bytes.length === 0) return "";
    try {
      if (typeof TextDecoder === "function") {
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "").trim();
      }
    } catch (e) {}
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] >= 32 && bytes[i] < 127) s += String.fromCharCode(bytes[i]);
    }
    return s.trim();
  }

  function readVLQ(view, state) {
    let val = 0;
    for (let i = 0; i < 4; i++) {
      if (state.pos >= state.end) break;
      const b = view.getUint8(state.pos++);
      val = (val << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return val;
  }

  function parseMidiFile(input) {
    let buf;
    if (input instanceof ArrayBuffer) {
      buf = input;
    } else if (ArrayBuffer.isView(input)) {
      buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    } else {
      throw new Error("无效的 MIDI 数据：需要 ArrayBuffer 或 Uint8Array");
    }

    if (buf.byteLength < 14) {
      throw new Error("MIDI 文件过小或已损坏");
    }

    const view = new DataView(buf);
    const readStr = (off, len) => {
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
      return s;
    };

    if (readStr(0, 4) !== "MThd") {
      throw new Error("不是标准的 MIDI 文件（缺少 MThd 文件头）");
    }

    const headerLen = view.getUint32(4);
    const format = view.getUint16(8);
    const numTracks = view.getUint16(10);
    const division = view.getUint16(12);
    if ((division & 0x8000) !== 0) {
      throw new Error("暂不支持 SMPTE 时间码格式的 MIDI，请使用常规节拍 MIDI");
    }
    const ticksPerBeat = Math.max(24, division);

    let offset = 8 + headerLen;
    const tempos = []; // { tick, usPerBeat, bpm }
    const timeSigs = []; // { tick, num, den }
    const keySigs = []; // { tick, sf, mi, key }
    const rawTracks = [];

    for (let tIdx = 0; tIdx < numTracks && offset + 8 <= buf.byteLength; tIdx++) {
      const chunkId = readStr(offset, 4);
      const chunkLen = view.getUint32(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = Math.min(buf.byteLength, chunkStart + chunkLen);
      offset = chunkEnd;

      if (chunkId !== "MTrk") continue;

      const state = { pos: chunkStart, end: chunkEnd };
      let absTick = 0;
      let runningStatus = 0;
      let trackName = "";
      const activeNotes = new Map(); // key = `${ch}_${midi}` -> [{ startTick, velocity }]
      const notes = [];
      let drumNoteCount = 0;
      const channelsUsed = new Set();

      while (state.pos < state.end) {
        const delta = readVLQ(view, state);
        absTick += delta;
        if (state.pos >= state.end) break;

        let status = view.getUint8(state.pos);
        if (status < 0x80) {
          if (runningStatus === 0) break;
          status = runningStatus;
        } else {
          state.pos++;
          if (status < 0xf0) runningStatus = status;
          else if (status === 0xf0 || status === 0xf7) runningStatus = 0;
        }

        if (status === 0xff) {
          // Meta Event
          if (state.pos >= state.end) break;
          const metaType = view.getUint8(state.pos++);
          const metaLen = readVLQ(view, state);
          const dataStart = state.pos;
          const dataEnd = Math.min(state.end, dataStart + metaLen);

          if (metaType === 0x03 && metaLen > 0) {
            const nameBytes = new Uint8Array(buf, dataStart, dataEnd - dataStart);
            const decoded = decodeTrackText(nameBytes);
            if (decoded && !trackName) trackName = decoded;
          } else if (metaType === 0x51 && metaLen >= 3 && dataStart + 3 <= state.end) {
            const usPerBeat =
              (view.getUint8(dataStart) << 16) |
              (view.getUint8(dataStart + 1) << 8) |
              view.getUint8(dataStart + 2);
            if (usPerBeat > 0) {
              tempos.push({ tick: absTick, usPerBeat, bpm: Math.round(60000000 / usPerBeat) });
            }
          } else if (metaType === 0x58 && metaLen >= 2 && dataStart + 2 <= state.end) {
            const num = view.getUint8(dataStart);
            const den = Math.pow(2, view.getUint8(dataStart + 1));
            if (num > 0 && den > 0) {
              timeSigs.push({ tick: absTick, num, den });
            }
          } else if (metaType === 0x59 && metaLen >= 2 && dataStart + 2 <= state.end) {
            const sf = view.getInt8(dataStart);
            const mi = view.getUint8(dataStart + 1);
            const rawKey = (mi === 1 ? MIDI_SF_TO_MINOR_REL_MAJOR : MIDI_SF_TO_MAJOR_KEY)[String(sf)] || "C";
            const normKey = rawKey === "Cb" ? "B" : rawKey;
            keySigs.push({ tick: absTick, sf, mi, key: normKey });
          } else if (metaType === 0x2f) {
            state.pos = dataEnd;
            break;
          }
          state.pos = dataEnd;
        } else if (status === 0xf0 || status === 0xf7) {
          // SysEx
          const sysexLen = readVLQ(view, state);
          state.pos = Math.min(state.end, state.pos + sysexLen);
        } else {
          const eventType = status & 0xf0;
          const channel = status & 0x0f;

          if (eventType === 0xc0 || eventType === 0xd0) {
            // 1 data byte
            state.pos = Math.min(state.end, state.pos + 1);
          } else if (
            eventType === 0x80 ||
            eventType === 0x90 ||
            eventType === 0xa0 ||
            eventType === 0xb0 ||
            eventType === 0xe0
          ) {
            if (state.pos + 2 > state.end) break;
            const d1 = view.getUint8(state.pos++);
            const d2 = view.getUint8(state.pos++);

            if (eventType === 0x90 && d2 > 0) {
              channelsUsed.add(channel);
              if (channel === 9) {
                drumNoteCount++;
              } else {
                const k = `${channel}_${d1}`;
                if (!activeNotes.has(k)) activeNotes.set(k, []);
                activeNotes.get(k).push({ startTick: absTick, velocity: d2 });
              }
            } else if (eventType === 0x80 || (eventType === 0x90 && d2 === 0)) {
              if (channel !== 9) {
                const k = `${channel}_${d1}`;
                const list = activeNotes.get(k);
                if (list && list.length > 0) {
                  const started = list.shift();
                  const durTick = Math.max(1, absTick - started.startTick);
                  notes.push({
                    midi: d1,
                    startTick: started.startTick,
                    durationTick: durTick,
                    velocity: started.velocity,
                    channel
                  });
                }
              }
            }
          }
        }
      }

      // 收尾未关闭的悬空音符（给 1 拍默认时值）
      for (const [k, list] of activeNotes.entries()) {
        const parts = k.split("_");
        const ch = Number(parts[0]);
        const midi = Number(parts[1]);
        for (const started of list) {
          notes.push({
            midi,
            startTick: started.startTick,
            durationTick: Math.max(ticksPerBeat / 2, absTick - started.startTick),
            velocity: started.velocity,
            channel: ch
          });
        }
      }

      notes.sort((a, b) => a.startTick - b.startTick || b.midi - a.midi);
      rawTracks.push({
        index: rawTracks.length,
        name: trackName || `轨道 ${rawTracks.length + 1}`,
        notes,
        drumNoteCount,
        channels: Array.from(channelsUsed)
      });
    }

    // 仅保留有旋律音符的轨道并评分推荐主旋律
    const primaryBpm = tempos.length > 0 ? Math.max(30, Math.min(260, tempos[0].bpm)) : 100;
    const primaryTimeSig = timeSigs.length > 0 ? timeSigs[0] : { tick: 0, num: 4, den: 4 };
    const primaryKeySig = keySigs.length > 0 ? keySigs[0].key : null;

    let maxTick = 0;
    const tracks = rawTracks
      .filter((tr) => tr.notes.length > 0)
      .map((tr) => {
        let minMidi = 127;
        let maxMidi = 0;
        let sumMidi = 0;
        const onsetTicks = new Set();

        for (const n of tr.notes) {
          if (n.midi < minMidi) minMidi = n.midi;
          if (n.midi > maxMidi) maxMidi = n.midi;
          sumMidi += n.midi;
          onsetTicks.add(Math.round(n.startTick / (ticksPerBeat / 4)));
          const endT = n.startTick + n.durationTick;
          if (endT > maxTick) maxTick = endT;
        }

        const avgMidi = sumMidi / tr.notes.length;
        const monoRatio = onsetTicks.size / tr.notes.length; // 越接近 1 越像单音主旋律

        // 主旋律推荐打分：偏好音域在 C4~C6 (60..84)、单音比例高、音符数充足、轨名含 melody/lead/vocal/right
        let score = 0;
        if (avgMidi >= 58 && avgMidi <= 84) score += 35;
        else if (avgMidi >= 50 && avgMidi <= 90) score += 18;
        score += Math.min(30, monoRatio * 30);
        score += Math.min(25, Math.log2(tr.notes.length + 1) * 3.5);
        if (/melody|lead|vocal|main|right|主旋律|人声|右手|笛|筝|琴/i.test(tr.name)) score += 25;
        if (/bass|drum|perc|left|chord|伴奏|左手|贝斯|鼓/i.test(tr.name)) score -= 22;

        return {
          ...tr,
          noteCount: tr.notes.length,
          minMidi,
          maxMidi,
          avgMidi: Math.round(avgMidi),
          monoRatio: Number(monoRatio.toFixed(2)),
          melodyScore: Math.round(score),
          recommended: false
        };
      });

    if (tracks.length > 0) {
      let best = tracks[0];
      for (const tr of tracks) {
        if (tr.melodyScore > best.melodyScore) best = tr;
      }
      best.recommended = true;
    }

    const beatsPerMeasure = Math.max(1, Math.round((primaryTimeSig.num * 4) / primaryTimeSig.den));
    const totalBeats = maxTick / ticksPerBeat;
    const totalMeasures = Math.max(1, Math.ceil(totalBeats / beatsPerMeasure));

    return {
      format,
      ticksPerBeat,
      bpm: primaryBpm,
      timeSig: { num: primaryTimeSig.num, den: primaryTimeSig.den, beatsPerMeasure },
      keySig: primaryKeySig,
      totalBeats,
      totalMeasures,
      tracks
    };
  }

  // ==========================================
  // 2. MIDI → 标准简谱量化与排版生成器
  // ==========================================
  function detectBestKey(notes, midiKeySig) {
    if (!notes || notes.length === 0) return { key: midiKeySig || "C", naturalRate: 1 };

    const NATURAL_OFFSETS = new Set([0, 2, 4, 5, 7, 9, 11]);
    let bestKey = midiKeySig && KEY_TO_ROOT_MIDI[midiKeySig] ? midiKeySig : "C";
    let bestScore = -1;

    for (const k of MAJOR_KEYS_ORDERED) {
      const root = KEY_TO_ROOT_MIDI[k] % 12;
      let hit = 0;
      for (const n of notes) {
        const diff = ((n.midi % 12) - root + 12) % 12;
        if (NATURAL_OFFSETS.has(diff)) hit++;
      }
      const rate = hit / notes.length;
      // 若与 MIDI 自带调号一致，给予 +0.02 轻微加权
      const bonus = k === midiKeySig ? 0.02 : k === "C" ? 0.005 : 0;
      if (rate + bonus > bestScore) {
        bestScore = rate + bonus;
        bestKey = k;
      }
    }

    const chosenRoot = KEY_TO_ROOT_MIDI[bestKey] % 12;
    let naturalHits = 0;
    for (const n of notes) {
      const diff = ((n.midi % 12) - chosenRoot + 12) % 12;
      if (NATURAL_OFFSETS.has(diff)) naturalHits++;
    }
    return { key: bestKey, naturalRate: Number((naturalHits / notes.length).toFixed(3)) };
  }

  function midiToJianpuAtom(midi, rootMidi, octaveShift) {
    const shifted = midi + (octaveShift || 0) * 12;
    const rel = shifted - rootMidi;
    const oct = Math.floor(rel / 12);
    const semi = ((rel % 12) + 12) % 12;
    const info = SEMITONE_TO_DEGREE[semi];

    let octSuffix = "";
    if (oct > 0) octSuffix = "'".repeat(Math.min(3, oct));
    else if (oct < 0) octSuffix = ",".repeat(Math.min(3, -oct));

    return {
      text: `${info.acc}${info.deg}${octSuffix}`,
      accidental: Boolean(info.acc),
      midi: shifted
    };
  }

  function convertMidiToJianpu(parsedMidi, options = {}) {
    if (!parsedMidi || !Array.isArray(parsedMidi.tracks) || parsedMidi.tracks.length === 0) {
      throw new Error("该 MIDI 文件中没有可转换的旋律轨道");
    }

    const selectedIndices =
      Array.isArray(options.trackIndices) && options.trackIndices.length > 0
        ? options.trackIndices
        : [
            (parsedMidi.tracks.find((t) => t.recommended) || parsedMidi.tracks[0]).index
          ];

    let mergedNotes = [];
    for (const tr of parsedMidi.tracks) {
      if (selectedIndices.includes(tr.index)) {
        mergedNotes = mergedNotes.concat(tr.notes);
      }
    }
    if (mergedNotes.length === 0) {
      throw new Error("所选轨道中没有音符");
    }

    const ticksPerBeat = parsedMidi.ticksPerBeat || 480;
    const bpm = Math.max(30, Math.min(260, Number(options.bpm) || parsedMidi.bpm || 100));
    const beatsPerMeasure = parsedMidi.timeSig ? parsedMidi.timeSig.beatsPerMeasure : 4;
    const gridStep = [0.25, 0.5, 1].includes(Number(options.gridStep)) ? Number(options.gridStep) : 0.5;
    const chordMode = options.chordMode || "skyline"; // "skyline" | "duo" | "chord"
    const minGapMs = Math.max(0, Number(options.minGapMs ?? 90));
    const instrument = options.instrument || "guzheng";
    const title = String(options.title || "MIDI 转换简谱").trim() || "MIDI 转换简谱";

    // 小节裁切
    const startMeasure = Math.max(1, Number(options.startMeasure) || 1);
    const endMeasure = Math.max(startMeasure, Number(options.endMeasure) || parsedMidi.totalMeasures || 999);
    const startBeatLimit = (startMeasure - 1) * beatsPerMeasure;
    const endBeatLimit = endMeasure * beatsPerMeasure;

    let filtered = mergedNotes
      .map((n) => ({
        midi: n.midi,
        startBeat: n.startTick / ticksPerBeat,
        durBeats: Math.max(gridStep, n.durationTick / ticksPerBeat)
      }))
      .filter((n) => n.startBeat >= startBeatLimit - 0.001 && n.startBeat < endBeatLimit);

    if (filtered.length === 0) {
      throw new Error(`第 ${startMeasure} ~ ${endMeasure} 小节内没有音符，请调整小节范围`);
    }

    // 相对归零：去掉裁切后的前导空白小节
    const firstBeat = filtered.reduce((m, n) => Math.min(m, n.startBeat), Infinity);
    const leadingMeasures = Math.floor(firstBeat / beatsPerMeasure);
    const baseBeatOffset = leadingMeasures * beatsPerMeasure;

    filtered = filtered.map((n) => ({
      ...n,
      startBeat: Math.max(0, n.startBeat - baseBeatOffset)
    }));

    // 调性检测与八度居中
    const autoKeyInfo = detectBestKey(filtered, parsedMidi.keySig);
    const key =
      options.key && options.key !== "auto" && KEY_TO_ROOT_MIDI[options.key]
        ? options.key
        : autoKeyInfo.key;
    const rootMidi = KEY_TO_ROOT_MIDI[key] || 60;

    let octaveShift = Number(options.octaveShift) || 0;
    if (options.autoCenterOctave !== false && !options.octaveShift) {
      const sortedMidis = filtered.map((n) => n.midi).sort((a, b) => a - b);
      const median = sortedMidis[Math.floor(sortedMidis.length / 2)];
      // 期望中位音落在 rootMidi + 7（中音 5）附近
      const targetCenter = rootMidi + 7;
      octaveShift = Math.round((targetCenter - median) / 12);
    }

    // 量化到 gridStep 网格并聚合同步音符
    const slotsMap = new Map(); // slotIdx -> [{ midi, durSteps }]
    const stepsPerBeat = Math.round(1 / gridStep);
    let maxSlot = 0;

    for (const n of filtered) {
      const slotIdx = Math.round(n.startBeat * stepsPerBeat);
      const durSteps = Math.max(1, Math.round(n.durBeats * stepsPerBeat));
      if (!slotsMap.has(slotIdx)) slotsMap.set(slotIdx, []);
      slotsMap.get(slotIdx).push({ midi: n.midi, durSteps });
      if (slotIdx + durSteps > maxSlot) maxSlot = slotIdx + durSteps;
    }

    // 防抽筋最小间隔过滤（过滤超短装饰音）
    const minGapBeats = (minGapMs / 1000) * (bpm / 60);
    const minGapSlots = minGapBeats > 0 ? Math.floor(minGapBeats * stepsPerBeat) : 0;

    const sortedSlots = Array.from(slotsMap.keys()).sort((a, b) => a - b);
    const eventsBySlot = new Map();
    let lastAcceptedSlot = -9999;

    for (const s of sortedSlots) {
      if (minGapSlots > 0 && s - lastAcceptedSlot < minGapSlots) {
        continue;
      }
      const list = slotsMap.get(s);
      // 按音高降序去重
      list.sort((a, b) => b.midi - a.midi);
      const unique = [];
      const seenMidi = new Set();
      for (const item of list) {
        if (!seenMidi.has(item.midi)) {
          seenMidi.add(item.midi);
          unique.push(item);
        }
      }

      const maxPoly = chordMode === "chord" ? 3 : chordMode === "duo" ? 2 : 1;
      const picked = unique.slice(0, maxPoly);
      const durSteps = picked[0].durSteps;
      eventsBySlot.set(s, { notes: picked, durSteps });
      lastAcceptedSlot = s;
    }

    // 按「整拍」为单位渲染成干净可读的简谱记号
    const totalMeasuresOut = Math.max(1, Math.ceil(maxSlot / (beatsPerMeasure * stepsPerBeat)));
    const totalBeatsOut = totalMeasuresOut * beatsPerMeasure;
    let accidentalCount = 0;
    let totalRenderedNotes = 0;

    const formatPicked = (picked, slashSuffix = "") => {
      const atoms = picked.map((p) => {
        const a = midiToJianpuAtom(p.midi, rootMidi, octaveShift);
        if (a.accidental) accidentalCount++;
        totalRenderedNotes++;
        return a.text + slashSuffix;
      });
      return atoms.length > 1 ? `[${atoms.join("")}]` : atoms[0];
    };

    const measureStrings = [];
    let sustainRemainingSteps = 0;

    for (let m = 0; m < totalMeasuresOut; m++) {
      const beatTokens = [];
      for (let b = 0; b < beatsPerMeasure; b++) {
        const beatBaseSlot = (m * beatsPerMeasure + b) * stepsPerBeat;
        const subEvents = [];
        for (let sub = 0; sub < stepsPerBeat; sub++) {
          const ev = eventsBySlot.get(beatBaseSlot + sub);
          if (ev) subEvents.push({ sub, ev });
        }

        if (subEvents.length === 0) {
          // 整拍没有新起音：判断是上一音的延音还是休止
          if (sustainRemainingSteps >= stepsPerBeat) {
            beatTokens.push("-");
            sustainRemainingSteps -= stepsPerBeat;
          } else {
            beatTokens.push("0");
            sustainRemainingSteps = 0;
          }
        } else if (subEvents.length === 1 && subEvents[0].sub === 0) {
          // 整拍起音在拍头
          const ev = subEvents[0].ev;
          beatTokens.push(formatPicked(ev.notes));
          sustainRemainingSteps = Math.max(0, ev.durSteps - stepsPerBeat);
        } else {
          // 拍内包含细分快音：用 (...) 包裹平分这一拍（如果只有一个事件且在后半拍则补前导 0）
          const parts = [];
          if (stepsPerBeat === 2) {
            // 八分音符网格：两格
            const e0 = eventsBySlot.get(beatBaseSlot);
            const e1 = eventsBySlot.get(beatBaseSlot + 1);
            parts.push(e0 ? formatPicked(e0.notes) : sustainRemainingSteps > 0 ? "0" : "0");
            parts.push(e1 ? formatPicked(e1.notes) : "0");
            sustainRemainingSteps = e1 ? Math.max(0, e1.durSteps - 1) : 0;
          } else {
            // 十六分音符网格：四格，若第 1,3 格为空可自动简化成两格八分音符
            const e0 = eventsBySlot.get(beatBaseSlot);
            const e1 = eventsBySlot.get(beatBaseSlot + 1);
            const e2 = eventsBySlot.get(beatBaseSlot + 2);
            const e3 = eventsBySlot.get(beatBaseSlot + 3);
            if (!e1 && !e3) {
              parts.push(e0 ? formatPicked(e0.notes) : "0");
              parts.push(e2 ? formatPicked(e2.notes) : "0");
              sustainRemainingSteps = e2 ? Math.max(0, e2.durSteps - 2) : 0;
            } else {
              parts.push(e0 ? formatPicked(e0.notes) : "0");
              parts.push(e1 ? formatPicked(e1.notes) : "0");
              parts.push(e2 ? formatPicked(e2.notes) : "0");
              parts.push(e3 ? formatPicked(e3.notes) : "0");
              sustainRemainingSteps = e3 ? Math.max(0, e3.durSteps - 1) : 0;
            }
          }
          // 若拍内含和弦 [...]，避免 (...) 内嵌套 [...] 引起解析歧义，改用显式 / 记号
          const hasChord = parts.some((p) => p.startsWith("["));
          if (hasChord) {
            const slash = parts.length === 4 ? "//" : "/";
            beatTokens.push(
              parts
                .map((p) => (p.startsWith("[") ? p.replace(/\]$/, `${slash}]`) : `${p}${slash}`))
                .join(" ")
            );
          } else {
            beatTokens.push(`(${parts.join("")})`);
          }
        }
      }
      measureStrings.push(beatTokens.join(" "));
    }

    // 去除末尾纯休止小节
    while (measureStrings.length > 1 && /^[0\s]+$/.test(measureStrings[measureStrings.length - 1])) {
      measureStrings.pop();
    }

    // 每 2 或 4 小节换行排版
    const linesOut = [];
    const perLine = beatsPerMeasure >= 4 ? 2 : 4;
    for (let i = 0; i < measureStrings.length; i += perLine) {
      linesOut.push(measureStrings.slice(i, i + perLine).join(" | ") + " |");
    }

    const header = [
      `@title ${title}`,
      `@bpm ${bpm}`,
      `@key ${key}`,
      `@instrument ${instrument}`
    ].join("\n");

    const notation = `${header}\n${linesOut.join("\n")}`;

    return {
      notation,
      meta: {
        title,
        bpm,
        key,
        instrument,
        octaveShift,
        measures: measureStrings.length,
        noteCount: totalRenderedNotes,
        accidentalRate: totalRenderedNotes > 0 ? Number((accidentalCount / totalRenderedNotes).toFixed(3)) : 0,
        naturalRate: autoKeyInfo.naturalRate
      }
    };
  }

  // ==========================================
  // 3. 野生谱多方言智能清洗引擎
  // ==========================================
  const SKY_21_MAP = {
    Z: "1,", X: "2,", C: "3,", V: "4,", B: "5,", N: "6,", M: "7,",
    A: "1",  S: "2",  D: "3",  F: "4",  G: "5",  H: "6",  J: "7",
    Q: "1'", W: "2'", E: "3'", R: "4'", T: "5'", Y: "6'", U: "7'"
  };

  const CIRCLED_NUM_MAP = {
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5", "⑥": "6", "⑦": "7",
    "⓪": "0", "⑴": "1", "⑵": "2", "⑶": "3", "⑷": "4", "⑸": "5", "⑹": "6", "⑺": "7"
  };

  const SOLFEGE_MAP = {
    do: "1", re: "2", mi: "3", fa: "4", sol: "5", so: "5", la: "6", si: "7", ti: "7"
  };

  const NOTE_NAME_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function detectWildDialect(text) {
    const clean = String(text || "");
    // 检查唱名
    const solfMatches = clean.match(/\b(do|re|mi|fa|sol|so|la|si|ti)\b/gi) || [];
    if (solfMatches.length >= 6) return "solfege";

    // 检查科学音名 C4 D4 E5
    const sciMatches = clean.match(/\b[A-G][#b]?[2-7]\b/g) || [];
    if (sciMatches.length >= 6) return "note_names";

    // 检查光遇/原神 21 键字母谱（大量出现 Q-U / A-J / Z-M 且数字很少）
    const digits = (clean.match(/[1-7]/g) || []).length;
    const skyChars = (clean.match(/[QWERTYUASDFGHJZXCVBNM]/gi) || []).length;
    if (skyChars >= 8 && skyChars > digits * 2) return "sky_genshin";

    return "standard";
  }

  function cleanWildNotation(rawText, options = {}) {
    const src = String(rawText || "");
    if (!src.trim()) {
      return {
        notation: "",
        dialect: "standard",
        stats: { convertedNotes: 0, strippedChars: 0, dashAsLowOctave: false }
      };
    }

    // 保留或覆盖顶部 @元数据
    let title = String(options.title || "").trim();
    let bpm = Number(options.bpm) || 96;
    let key = String(options.key || "C").trim();
    let instrument = String(options.instrument || "guzheng").trim();

    const rawLines = src.split(/\r?\n/);
    const contentLines = [];
    for (const ln of rawLines) {
      const t = ln.trim();
      if (!t) continue;
      if (/^@title/i.test(t)) {
        if (!title) title = t.replace(/^@title[:：\s]*/i, "").trim();
      } else if (/^@bpm/i.test(t)) {
        const v = parseFloat(t.replace(/^@bpm[:：\s]*/i, ""));
        if (v >= 30 && v <= 260 && !options.bpm) bpm = v;
      } else if (/^@key/i.test(t)) {
        const v = t.replace(/^@key[:：\s]*/i, "").trim();
        if (KEY_TO_ROOT_MIDI[v] && !options.key) key = v;
      } else if (/^@instrument/i.test(t)) {
        const v = t.replace(/^@instrument[:：\s]*/i, "").trim();
        if (v && !options.instrument) instrument = v;
      } else if (!t.startsWith("//")) {
        contentLines.push(t);
      }
    }

    let body = contentLines.join("\n");

    // Step 1：全角符号、圆圈数字、中文标点归一化
    body = body
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[①②③④⑤⑥⑦⓪⑴⑵⑶⑷⑸⑹⑺]/g, (c) => CIRCLED_NUM_MAP[c] || c)
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/【/g, "[")
      .replace(/】/g, "]")
      .replace(/[｜┃│]/g, "|")
      .replace(/[’‘`´]/g, "'")
      .replace(/[，、]/g, ",")
      .replace(/[—–－―]/g, "-")
      .replace(/♯/g, "#")
      .replace(/♭/g, "b")
      .replace(/[\u3000\t]+/g, " ");

    const dialect =
      options.dialect && options.dialect !== "auto"
        ? options.dialect
        : detectWildDialect(body);

    let dashAsLowOctave = Boolean(options.dashAsLowOctave);

    if (dialect === "sky_genshin") {
      // 光遇 / 原神 21 键映射：逐行清理中文注释后按字符映射
      const mappedLines = body.split("\n").map((line) => {
        // 去掉中文字段（如 副歌：）
        const noZh = line.replace(/[\u4e00-\u9fa5]+[:：]?/g, " ");
        let out = "";
        for (let i = 0; i < noZh.length; i++) {
          const ch = noZh[i];
          const upper = ch.toUpperCase();
          if (SKY_21_MAP[upper]) {
            out += SKY_21_MAP[upper] + " ";
          } else if ("()[]|-0 ".includes(ch)) {
            out += ch;
          } else if (ch === "+" || ch === "/") {
            out += " ";
          }
        }
        return out.replace(/\s+/g, " ").trim();
      });
      body = mappedLines.filter(Boolean).join("\n");
    } else if (dialect === "solfege") {
      // 唱名谱 do re mi fa sol la si
      body = body.replace(/[\u4e00-\u9fa5]+[:：]?/g, " ");
      body = body.replace(/\b(do|re|mi|fa|sol|so|la|si|ti)\b/gi, (m) => SOLFEGE_MAP[m.toLowerCase()] || m);
    } else if (dialect === "note_names") {
      // 科学音名 C4 D#4 G5 -> C 调简谱
      body = body.replace(/[\u4e00-\u9fa5]+[:：]?/g, " ");
      const rootMidi = KEY_TO_ROOT_MIDI[key] || 60;
      body = body.replace(/\b([A-G])([#b]?)([2-7])\b/g, (_, letter, acc, octStr) => {
        let midi = (Number(octStr) + 1) * 12 + (NOTE_NAME_SEMITONE[letter] || 0);
        if (acc === "#") midi += 1;
        else if (acc === "b") midi -= 1;
        return midiToJianpuAtom(midi, rootMidi, 0).text + " ";
      });
    } else {
      // 通用野生数字简谱方言清洗
      // 1) 自动检测是否把 -5 / 5- 当作低音（若未显式指定且全文存在 +1/1+ 与 -5/5- 对称写法）
      if (options.dashAsLowOctave === undefined || options.dashAsLowOctave === "auto") {
        const hasPlusOct = /(\+[1-7]|[1-7]\+)/.test(body);
        const hasAttachedMinus = /(-[1-7]|[1-7]-(?=\s|[0-7|\n]|$))/.test(body);
        const hasStandaloneDash = /\s-\s/.test(body);
        dashAsLowOctave = hasPlusOct && hasAttachedMinus && !hasStandaloneDash;
      }

      // 2) 剥离中文歌词/段落标注（保留「高1」「低5」先转换再剥离中文）
      body = body
        .replace(/高([1-7])/g, "$1'")
        .replace(/低([1-7])/g, "$1,")
        .replace(/[\u4e00-\u9fa5]+[:：]?/g, " ");

      // 3) 高低音前后缀方言归一化
      // +1 / ++1 / 1+ / 1++ / 1* -> 1' / 1''
      body = body
        .replace(/\+\+([1-7])/g, "$1''")
        .replace(/\+([1-7])/g, "$1'")
        .replace(/([1-7])\+\+/g, "$1''")
        .replace(/([1-7])\+/g, "$1'")
        .replace(/([1-7])\*\*/g, "$1''")
        .replace(/([1-7])\*/g, "$1'")
        .replace(/([1-7])__/g, "$1,,")
        .replace(/([1-7])_/g, "$1,");

      if (dashAsLowOctave) {
        body = body
          .replace(/--([1-7])/g, "$1,,")
          .replace(/-([1-7])/g, "$1,")
          .replace(/([1-7])--/g, "$1,,")
          .replace(/([1-7])-/g, "$1,");
      } else {
        // 确保独立的延音线两侧有空格，方便与音符区分（如 5- -> 5 -）
        body = body.replace(/([0-7'*,])(-+)/g, (_, a, dashes) => `${a} ${dashes.split("").join(" ")}`);
      }
    }

    // Step 2：清理非法残留字符，仅保留合法简谱字符集与换行
    const beforeLen = body.length;
    body = body
      .replace(/[^0-7#b'*,.\-\/\(\)\[\]\|\s\n]/g, " ")
      .replace(/[ \t]+/g, " ");

    // Step 3：如果用户粘贴了一整串无小节线的数字，自动按 4 拍补小节线方便阅读
    const beatsPerMeasure = Math.max(2, Math.min(6, Number(options.beatsPerMeasure) || 4));
    const finalLines = [];
    let convertedNotes = 0;

    for (const rawLine of body.split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // 统计音符数
      const noteHits = trimmed.match(/[1-7]/g) || [];
      convertedNotes += noteHits.length;

      if (options.autoBarlines !== false && !trimmed.includes("|")) {
        const toks = trimmed.match(/\([^)]+\)|\[[^\]]+\]|-|[#b]?[0-7]['*,]*\.*\/*/g) || [];
        if (toks.length > 0) {
          const bars = [];
          for (let i = 0; i < toks.length; i += beatsPerMeasure) {
            bars.push(toks.slice(i, i + beatsPerMeasure).join(" "));
          }
          finalLines.push(bars.join(" | ") + " |");
          continue;
        }
      }
      finalLines.push(trimmed);
    }

    const header = [
      `@title ${title || "清洗简谱"}`,
      `@bpm ${bpm}`,
      `@key ${key}`,
      `@instrument ${instrument}`
    ].join("\n");

    const notation = `${header}\n${finalLines.join("\n")}`;
    return {
      notation,
      dialect,
      stats: {
        convertedNotes,
        strippedChars: Math.max(0, beforeLen - body.length),
        dashAsLowOctave
      }
    };
  }

  // ==========================================
  // 4. 简谱语法与手感体检 + 小手机曲库直存
  // ==========================================
  function diagnoseJianpu(notationText) {
    const text = String(notationText || "");
    const warnings = [];
    let parsed = null;

    if (global.MusicRhythmEngine && typeof global.MusicRhythmEngine.parseJianpuToChart === "function") {
      parsed = global.MusicRhythmEngine.parseJianpuToChart(text);
    }

    const bodyLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("@") && !l.startsWith("//"));
    const body = bodyLines.join(" ");

    const illegalChars = body.match(/[^0-7#b'*,.\-\/\(\)\[\]\|\s\^]/g) || [];
    if (illegalChars.length > 0) {
      const sample = Array.from(new Set(illegalChars)).slice(0, 6).join(" ");
      warnings.push(`发现 ${illegalChars.length} 处非标准字符（${sample}），建议点「野生谱清洗」清理`);
    }

    const allNotes = body.match(/[#b]?[1-7]['*,]*/g) || [];
    const accNotes = allNotes.filter((n) => n.startsWith("#") || n.startsWith("b"));
    const accRate = allNotes.length > 0 ? accNotes.length / allNotes.length : 0;
    if (accRate > 0.22) {
      warnings.push(`临时升降号占比 ${Math.round(accRate * 100)}%，建议在 MIDI 模式下尝试切换调号或自动定调`);
    }

    const noteCount = parsed ? parsed.noteCount : allNotes.length;
    const totalDuration = parsed ? parsed.totalDuration : Math.max(4, Math.round(allNotes.length * 0.55));
    if (noteCount === 0) {
      warnings.push("尚未解析出有效音符（1-7），请检查输入内容");
    }

    return {
      ok: noteCount > 0 && illegalChars.length === 0,
      noteCount,
      totalDuration,
      accidentalRate: Number(accRate.toFixed(3)),
      warnings,
      parsed
    };
  }

  function loadPhoneLibrary() {
    try {
      const arr = JSON.parse(localStorage.getItem(JIANPU_LIB_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveToPhoneLibrary(entry) {
    const parsed = diagnoseJianpu(entry.notation).parsed;
    const list = loadPhoneLibrary();
    const item = {
      id: entry.id || `workshop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: String(entry.title || parsed?.title || "工坊简谱").trim(),
      bpm: Number(entry.bpm || parsed?.bpm || 96),
      key: String(entry.key || parsed?.key || "C"),
      instrument: String(entry.instrument || parsed?.instrument || "guzheng"),
      notation: String(entry.notation || ""),
      createdAt: Date.now()
    };
    const next = [item, ...list.filter((x) => x.title !== item.title)].slice(0, 40);
    localStorage.setItem(JIANPU_LIB_KEY, JSON.stringify(next));
    return { item, total: next.length };
  }

  const api = {
    JIANPU_LIB_KEY,
    MAJOR_KEYS_ORDERED,
    parseMidiFile,
    detectBestKey,
    convertMidiToJianpu,
    detectWildDialect,
    cleanWildNotation,
    diagnoseJianpu,
    loadPhoneLibrary,
    saveToPhoneLibrary
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.JianpuWorkshopEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

