/**
 * Milvus/phone_fiction_app.js
 * 绣衣楼 · 捡手机文学生成器 & 可编辑楼内通讯录 独立模块化引擎（P0）
 * - 全部图片消息、聊天背景、楼内角色头像直存 IndexedDB STORES.AVATARS（免爆 localStorage，免升库）
 * - 楼内联系人支持完整新增、编辑/重命名原有角色、删除、搜索与一键恢复默认名录
 * - 捡手机工作台支持：自由切换发言身份（我/身份库/当前角色/任意楼内角色串场/系统旁白）、线上/线下双模式、换背景、发图片、撤回/语音/转账/时间戳、单条精修、纯净截图模式、一键复制剧本
 */
(function (global) {
  "use strict";

  const ROSTER_KEY = "xiuyi_custom_roster_v1";
  const GROUPS_KEY = "xiuyi_pf_groups_v1";
  const ROSTER_EVENT = "milvus-xiuyi-roster-updated";
  const GROUP_COLORS = ["#9FBCD0", "#A8C8BA", "#E8C3A8", "#C5BBD8", "#D9A7A0"];

  const BUILTIN_NAMES = [
    "傅融", "吕蒙", "孙尚香", "郭解", "孙权", "张修", "郭嘉", "荀彧", "华佗", "杨修",
    "庞统", "贾诩", "张角", "葛洪", "蔡琰", "张邈", "夏侯惇", "马超", "程昱", "太史慈",
    "张闿", "徐庶", "甘宁", "甄宓", "张鲁", "孔融", "黄月英", "张郃", "董奉", "曹植",
    "诸葛瑾", "诸葛诞", "满宠", "荀攸", "凌统", "安期", "刘繇", "戏学", "马腾", "令狐茂",
    "朱然", "黄盖", "祢衡", "蒯越", "刘豹", "张绣", "鲁肃", "张辽", "干吉", "张仲景",
    "周瑜", "王粲", "陆逊", "董白", "张昭", "程普", "士燮", "虞翻", "张燕", "钟繇",
    "夏侯渊", "颜良", "小乔", "史子眇", "陈登", "公孙珊", "文丑", "许曼", "严白虎", "周忠",
    "张飞", "阿蝉", "许攸", "飞云", "周群", "吕布", "绣球", "庞羲", "刘璋", "陈群",
    "法正", "蒯良", "郭女王", "简雍", "曹丕"
  ];

  const BG_PRESETS = [
    { id: "warm_paper", name: "素雅宣纸", css: "linear-gradient(180deg, #F3EEE6 0%, #EAE3D8 100%)", dark: false },
    { id: "wechat_gray", name: "经典微信灰", css: "#EDEDED", dark: false },
    { id: "morandi_sage", name: "青瓷雾绿", css: "linear-gradient(180deg, #EBF2EE 0%, #DFEAE4 100%)", dark: false },
    { id: "blush_mist", name: "藕粉暮云", css: "linear-gradient(180deg, #F6ECEB 0%, #EFE1DF 100%)", dark: false },
    { id: "night_ink", name: "深夜暗墨", css: "linear-gradient(180deg, #1E2226 0%, #15181B 100%)", dark: true }
  ];

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  async function copyPlainText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // 自动将超大图压缩到合适尺寸，避免单张 5MB 原图卡顿
  function compressImageFile(file, maxSide = 1280, quality = 0.84) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
          resolve(dataUrl);
          return;
        }
        // GIF 动图不做 Canvas 重绘以保留动画
        if (file.type === "image/gif") {
          resolve(dataUrl);
          return;
        }
        const img = new Image();
        img.onerror = () => resolve(dataUrl);
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h || (w <= maxSide && h <= maxSide && dataUrl.length < 450000)) {
            resolve(dataUrl);
            return;
          }
          const scale = Math.min(1, maxSide / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * scale));
          const ch = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, cw, ch);
          try {
            const out = canvas.toDataURL("image/jpeg", quality);
            resolve(out || dataUrl);
          } catch (e) {
            resolve(dataUrl);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  // ==========================================
  // 1. IndexedDB KV 与媒体/头像存储桥接层
  // ==========================================
  async function idbGetKV(key) {
    try {
      if (typeof global.openDB === "function" && global.STORES?.USER_SETTINGS) {
        const db = await global.openDB();
        const res = await new Promise((resolve) => {
          const tx = db.transaction(global.STORES.USER_SETTINGS, "readonly");
          const req = tx.objectStore(global.STORES.USER_SETTINGS).get(key);
          req.onsuccess = () => resolve(req.result?.value);
          req.onerror = () => resolve(undefined);
        });
        if (res !== undefined) return res;
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  async function idbPutKV(key, value) {
    try {
      if (typeof global.openDB === "function" && global.STORES?.USER_SETTINGS) {
        const db = await global.openDB();
        await new Promise((resolve) => {
          const tx = db.transaction(global.STORES.USER_SETTINGS, "readwrite");
          const req = tx.objectStore(global.STORES.USER_SETTINGS).put({ key, value, updatedAt: Date.now() });
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (e) {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  const pfMediaStore = {
    _cache: {},

    save: async (rawKey, dataUrl) => {
      if (!rawKey || !dataUrl) return "";
      const key = String(rawKey).startsWith("idb:") ? String(rawKey).slice(4) : String(rawKey);
      pfMediaStore._cache[key] = dataUrl;
      try {
        if (global.avatarStore && typeof global.avatarStore.put === "function") {
          await global.avatarStore.put(key, dataUrl);
          return `idb:${key}`;
        }
      } catch (e) {
        console.error("[pfMediaStore] 保存图片到 IndexedDB 失败:", e);
      }
      return dataUrl;
    },

    get: async (ref) => {
      if (!ref || typeof ref !== "string") return "";
      if (!ref.startsWith("idb:")) return ref;
      const key = ref.slice(4);
      if (pfMediaStore._cache[key]) return pfMediaStore._cache[key];
      try {
        if (global.avatarStore && typeof global.avatarStore.get === "function") {
          const rec = await global.avatarStore.get(key);
          const val = rec && rec.avatarData ? rec.avatarData : "";
          if (val) pfMediaStore._cache[key] = val;
          return val;
        }
      } catch (e) {}
      return "";
    },

    delete: async (ref) => {
      if (!ref || typeof ref !== "string") return;
      const key = ref.startsWith("idb:") ? ref.slice(4) : ref;
      delete pfMediaStore._cache[key];
      try {
        if (global.avatarStore && typeof global.avatarStore.delete === "function") {
          await global.avatarStore.delete(key);
        }
      } catch (e) {}
    },

    resolveSync: (ref) => {
      if (!ref || typeof ref !== "string") return "";
      if (!ref.startsWith("idb:")) return ref;
      return pfMediaStore._cache[ref.slice(4)] || "";
    },

    preloadRefs: async (refs) => {
      const unique = Array.from(new Set((refs || []).filter((r) => typeof r === "string" && r.startsWith("idb:"))));
      await Promise.all(unique.map((r) => pfMediaStore.get(r)));
    }
  };

  // ==========================================
  // 2. 楼内通讯录名录管理存储层（支持增删改原有角色）
  // ==========================================
  function emitRosterUpdate() {
    try {
      global.dispatchEvent(new CustomEvent(ROSTER_EVENT));
    } catch (e) {}
  }

  let _legacyAvatarMigrated = false;

  const xiuyiRosterStore = {
    _loadState: async () => {
      const saved = await idbGetKV(ROSTER_KEY);
      if (saved && typeof saved === "object" && Array.isArray(saved.customContacts)) {
        return {
          customContacts: saved.customContacts || [],
          overrides: saved.overrides || {},
          deletedIds: Array.isArray(saved.deletedIds) ? saved.deletedIds : [],
          starredIds: Array.isArray(saved.starredIds) ? saved.starredIds : []
        };
      }
      return { customContacts: [], overrides: {}, deletedIds: [], starredIds: [] };
    },

    _saveState: async (state) => {
      await idbPutKV(ROSTER_KEY, state);
      emitRosterUpdate();
    },

    getRoster: async () => {
      const state = await xiuyiRosterStore._loadState();

      // 读取旧版人物介绍
      let legacyBios = {};
      try {
        if (global.settingsStore && typeof global.settingsStore.getCharacterNotes === "function") {
          const b = await global.settingsStore.getCharacterNotes();
          if (b && typeof b === "object") legacyBios = b;
        }
      } catch (e) {}

      // 首次自动迁移旧版 localStorage["绣衣楼头像"] 到 IndexedDB
      if (!_legacyAvatarMigrated) {
        _legacyAvatarMigrated = true;
        try {
          const rawLegacyAvatars = localStorage.getItem("绣衣楼头像");
          if (rawLegacyAvatars) {
            const parsed = JSON.parse(rawLegacyAvatars);
            if (parsed && typeof parsed === "object") {
              let changed = false;
              for (const name of Object.keys(parsed)) {
                const val = parsed[name];
                if (typeof val === "string" && val.startsWith("data:image/")) {
                  const id = `builtin_${name}`;
                  const ref = await pfMediaStore.save(`xiuyi_av_${id}`, val);
                  if (!state.overrides[id]) state.overrides[id] = {};
                  if (!state.overrides[id].avatarRef) {
                    state.overrides[id].avatarRef = ref;
                    changed = true;
                  }
                }
              }
              if (changed) {
                await xiuyiRosterStore._saveState(state);
                try { localStorage.removeItem("绣衣楼头像"); } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }

      const deletedSet = new Set(state.deletedIds || []);
      const starredSet = new Set(state.starredIds || []);
      const builtins = BUILTIN_NAMES.map((origName) => {
        const id = `builtin_${origName}`;
        if (deletedSet.has(id)) return null;
        const ov = state.overrides[id] || {};
        return {
          id,
          origName,
          name: ov.name || origName,
          title: ov.title || "绣衣楼密探",
          bio: ov.bio !== undefined ? ov.bio : (legacyBios[origName] || ""),
          avatarRef: ov.avatarRef || "",
          isBuiltin: true,
          isStarred: starredSet.has(id)
        };
      }).filter(Boolean);

      const customs = (state.customContacts || []).map((c) => ({
        ...c,
        title: c.title || "自定义角色",
        bio: c.bio || "",
        avatarRef: c.avatarRef || "",
        isBuiltin: false,
        isStarred: starredSet.has(c.id)
      }));

      const merged = [...customs, ...builtins];
      await pfMediaStore.preloadRefs(merged.map((c) => c.avatarRef));
      return merged;
    },

    toggleStar: async (contactId) => {
      if (!contactId) return false;
      const state = await xiuyiRosterStore._loadState();
      const set = new Set(state.starredIds || []);
      let nextStarred = false;
      if (set.has(contactId)) {
        set.delete(contactId);
        nextStarred = false;
      } else {
        set.add(contactId);
        nextStarred = true;
      }
      state.starredIds = Array.from(set);
      await xiuyiRosterStore._saveState(state);
      return nextStarred;
    },

    getStarredRoster: async () => {
      const all = await xiuyiRosterStore.getRoster();
      return (all || []).filter((c) => c && c.isStarred);
    },

    addContact: async ({ name, title, bio, avatarDataUrl }) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) throw new Error("请填写角色名字");
      const state = await xiuyiRosterStore._loadState();
      const id = uid("xy_custom");
      let avatarRef = "";
      if (avatarDataUrl) {
        avatarRef = await pfMediaStore.save(`xiuyi_av_${id}`, avatarDataUrl);
      }
      const contact = {
        id,
        name: cleanName,
        title: String(title || "自定义角色").trim(),
        bio: String(bio || "").trim(),
        avatarRef,
        isBuiltin: false,
        createdAt: Date.now()
      };
      state.customContacts = [contact, ...(state.customContacts || [])];
      await xiuyiRosterStore._saveState(state);
      return contact;
    },

    updateContact: async (contact, patch) => {
      const state = await xiuyiRosterStore._loadState();
      let avatarRef = contact.avatarRef || "";
      if (patch.avatarDataUrl) {
        avatarRef = await pfMediaStore.save(`xiuyi_av_${contact.id}`, patch.avatarDataUrl);
      } else if (patch.clearAvatar) {
        if (avatarRef) await pfMediaStore.delete(avatarRef);
        avatarRef = "";
      }

      if (contact.isBuiltin) {
        state.overrides[contact.id] = {
          ...(state.overrides[contact.id] || {}),
          name: patch.name !== undefined ? String(patch.name).trim() || contact.origName : contact.name,
          title: patch.title !== undefined ? String(patch.title).trim() : contact.title,
          bio: patch.bio !== undefined ? String(patch.bio) : contact.bio,
          avatarRef
        };
        if (patch.bio !== undefined && global.settingsStore?.saveCharacterNote) {
          try { await global.settingsStore.saveCharacterNote(contact.origName || contact.name, String(patch.bio)); } catch (e) {}
        }
      } else {
        state.customContacts = (state.customContacts || []).map((c) =>
          c.id === contact.id
            ? {
                ...c,
                name: patch.name !== undefined ? String(patch.name).trim() || c.name : c.name,
                title: patch.title !== undefined ? String(patch.title).trim() : c.title,
                bio: patch.bio !== undefined ? String(patch.bio) : c.bio,
                avatarRef,
                updatedAt: Date.now()
              }
            : c
        );
      }
      await xiuyiRosterStore._saveState(state);
      return true;
    },

    deleteContact: async (contact) => {
      const state = await xiuyiRosterStore._loadState();
      if (contact.avatarRef) await pfMediaStore.delete(contact.avatarRef);
      if (contact.isBuiltin) {
        if (!state.deletedIds.includes(contact.id)) state.deletedIds.push(contact.id);
        delete state.overrides[contact.id];
      } else {
        state.customContacts = (state.customContacts || []).filter((c) => c.id !== contact.id);
      }
      await xiuyiRosterStore._saveState(state);
      return true;
    },

    resetDefaultRoster: async () => {
      const state = await xiuyiRosterStore._loadState();
      state.deletedIds = [];
      await xiuyiRosterStore._saveState(state);
      return true;
    }
  };

  // ==========================================
  // 2.5 楼内群组（群聊捡手机剧本间）存储层
  // ==========================================
  const xiuyiGroupStore = {
    getGroups: async () => {
      const saved = await idbGetKV(GROUPS_KEY);
      return Array.isArray(saved) ? saved : [];
    },

    saveGroups: async (list) => {
      await idbPutKV(GROUPS_KEY, list || []);
      emitRosterUpdate();
    },

    createGroup: async ({ name, memberIds, color }) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) throw new Error("请填写群聊名称");
      const list = await xiuyiGroupStore.getGroups();
      const group = {
        id: uid("group"),
        name: cleanName,
        memberIds: Array.isArray(memberIds) ? Array.from(new Set(memberIds)) : [],
        color: color || GROUP_COLORS[0],
        isGroup: true,
        isStarred: false,
        createdAt: Date.now()
      };
      await xiuyiGroupStore.saveGroups([group, ...list]);
      return group;
    },

    updateGroup: async (groupId, patch) => {
      const list = await xiuyiGroupStore.getGroups();
      const next = list.map((g) => (g.id === groupId ? { ...g, ...patch, updatedAt: Date.now() } : g));
      await xiuyiGroupStore.saveGroups(next);
      return next.find((g) => g.id === groupId) || null;
    },

    toggleStarGroup: async (groupId) => {
      const list = await xiuyiGroupStore.getGroups();
      const next = list.map((g) => (g.id === groupId ? { ...g, isStarred: !g.isStarred } : g));
      await xiuyiGroupStore.saveGroups(next);
      return true;
    },

    deleteGroup: async (groupId) => {
      const list = await xiuyiGroupStore.getGroups();
      await xiuyiGroupStore.saveGroups(list.filter((g) => g.id !== groupId));
      return true;
    }
  };

  // ==========================================
  // 3. 捡手机剧本与外观存储层
  // ==========================================
  const DEFAULT_THEME = {
    mode: "online",
    bgPreset: "warm_paper",
    bgImageRef: "",
    bgOpacity: 0.9,
    bgBlur: 0,
    showStatusBar: true,
    fakeTime: "23:42",
    fakeBattery: "18%",
    chatTitleOverride: ""
  };

  const phoneFictionStore = {
    _slotsKey: (contactId) => `xiuyi_pf_slots_${contactId}`,
    _scriptKey: (contactId, slotId) =>
      !slotId || slotId === "default" ? `xiuyi_pf_script_${contactId}` : `xiuyi_pf_script_${contactId}_${slotId}`,
    _themeKey: (contactId) => `xiuyi_pf_theme_${contactId}`,

    getSlots: async (contactId) => {
      const saved = await idbGetKV(phoneFictionStore._slotsKey(contactId));
      if (Array.isArray(saved) && saved.length > 0) return saved;
      const def = [{ id: "default", title: "默认剧本", updatedAt: Date.now() }];
      await idbPutKV(phoneFictionStore._slotsKey(contactId), def);
      return def;
    },

    saveSlots: async (contactId, slots) => {
      await idbPutKV(phoneFictionStore._slotsKey(contactId), slots);
    },

    createSlot: async (contactId, title) => {
      const slots = await phoneFictionStore.getSlots(contactId);
      const slot = { id: uid("slot"), title: String(title || "新剧本").trim() || "新剧本", updatedAt: Date.now() };
      const next = [slot, ...slots];
      await phoneFictionStore.saveSlots(contactId, next);
      return { slot, slots: next };
    },

    renameSlot: async (contactId, slotId, newTitle) => {
      const slots = await phoneFictionStore.getSlots(contactId);
      const next = slots.map((s) => (s.id === slotId ? { ...s, title: String(newTitle || s.title).trim() || s.title, updatedAt: Date.now() } : s));
      await phoneFictionStore.saveSlots(contactId, next);
      return next;
    },

    deleteSlot: async (contactId, slotId) => {
      const slots = await phoneFictionStore.getSlots(contactId);
      const remaining = slots.filter((s) => s.id !== slotId);
      const next = remaining.length > 0 ? remaining : [{ id: "default", title: "默认剧本", updatedAt: Date.now() }];
      await idbPutKV(phoneFictionStore._scriptKey(contactId, slotId), []);
      await phoneFictionStore.saveSlots(contactId, next);
      return next;
    },

    getMessages: async (contact, slotId = "default") => {
      const saved = await idbGetKV(phoneFictionStore._scriptKey(contact.id, slotId));
      if (Array.isArray(saved)) {
        await pfMediaStore.preloadRefs(saved.flatMap((m) => [m.imageRef, m.speakerAvatarRef]));
        return saved;
      }
      if (slotId === "default") {
        // 首次进入默认槽位自动兼容导入旧版密信记录
        try {
          if (global.settingsStore?.getXiuyiChatHistory) {
            const old = await global.settingsStore.getXiuyiChatHistory(contact.origName || contact.name);
            if (Array.isArray(old) && old.length > 0) {
              const converted = old.map((m) => ({
                id: uid("pfm"),
                kind: "text",
                side: m.sender === "user" ? "right" : "left",
                speakerName: m.sender === "user" ? "我" : contact.name,
                speakerAvatarRef: m.sender === "user" ? "" : contact.avatarRef || "",
                text: String(m.text || ""),
                time: m.time || nowHHMM()
              }));
              await idbPutKV(phoneFictionStore._scriptKey(contact.id, "default"), converted);
              return converted;
            }
          }
        } catch (e) {}
      }
      return [];
    },

    saveMessages: async (contactId, messages, slotId = "default") => {
      await idbPutKV(phoneFictionStore._scriptKey(contactId, slotId), messages || []);
      emitRosterUpdate();
    },

    getTheme: async (contactId) => {
      const saved = await idbGetKV(phoneFictionStore._themeKey(contactId));
      const merged = { ...DEFAULT_THEME, ...(saved || {}) };
      if (merged.bgImageRef) await pfMediaStore.get(merged.bgImageRef);
      return merged;
    },

    saveTheme: async (contactId, theme) => {
      await idbPutKV(phoneFictionStore._themeKey(contactId), theme);
    }
  };

  // ==========================================
  // 3.5 P1：可选 AI 帮接一句 + 高清 PNG 长图导出引擎
  // ==========================================
  async function aiGenerateNextLine({ speakerName, speakerBio, mode, messages }) {
    if (typeof global.sendToLLM !== "function") {
      throw new Error("未配置 API，请先前往「设置 → API 配置中心」配置");
    }
    let worldContext = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = String(wb).trim();
      }
    } catch (e) {}

    // 尝试从通讯录角色库补全 6 维设定
    let charProfileText = speakerBio ? `人物介绍：${speakerBio}` : "";
    try {
      let list = [];
      if (global.chatCharacterStore?.getAll) list = await global.chatCharacterStore.getAll();
      const matched = (list || []).find((c) => c && c.name === speakerName);
      if (matched) {
        const p = matched.profile || {};
        charProfileText = [
          `姓名：${matched.name}`,
          p.mbti ? `MBTI：${p.mbti}` : "",
          p.constellation || p.zodiac ? `星座：${p.constellation || p.zodiac}` : "",
          p.speakingStyle || p.style ? `语言风格：${p.speakingStyle || p.style}` : "",
          p.personality ? `性格特点：${p.personality}` : "",
          p.background || p.bio || speakerBio ? `背景：${p.background || p.bio || speakerBio}` : ""
        ]
          .filter(Boolean)
          .join("\n");
      }
    } catch (e) {}

    const recent = (messages || [])
      .slice(-15)
      .map((m) => {
        if (m.kind === "time") return `[时间 ${m.text}]`;
        if (m.kind === "system" || m.kind === "recall") return `[系统] ${m.text}`;
        if (m.kind === "narration") return `（旁白：${m.text}）`;
        if (m.kind === "image") return `${m.speakerName || "我"}：[发送了一张图片]`;
        return `${m.speakerName || "我"}：${m.text}`;
      })
      .join("\n");

    const modeRule =
      mode === "offline"
        ? "当前为【线下剧场模式】：请写一段 40~110 字的鲜活台词或动作描写，贴合角色神态与口吻。"
        : "当前为【线上捡手机聊天模式】：请只输出 1 条简短自然的微信/手机聊天消息（8~45 字），极度口语化、有活人感、有网感或角色鲜明梗味，严禁加引号和角色名前缀！";

    const sysPrompt = `你正在协助创作一篇「捡手机文学」对话。
现在轮到【${speakerName}】发言。
${charProfileText ? `【角色设定】\n${charProfileText}\n` : ""}
${worldContext ? `【开启的世界书】\n${worldContext}\n` : ""}
【创作要求】
${modeRule}
直接输出这一句内容本身，不要加任何解释、前缀或引号。`;

    const raw = await new Promise((resolve, reject) => {
      global.sendToLLM(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: recent ? `当前已有对话：\n${recent}\n\n请接下一句（发言人：${speakerName}）：` : `请以【${speakerName}】的身份发第一条开场消息：` }
        ],
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "AI 帮写失败"))
      );
    });

    return String(raw || "")
      .replace(/^["「『]+|["」』]+$/g, "")
      .replace(new RegExp(`^${speakerName}\\s*[:：]\\s*`), "")
      .trim();
  }

  function loadHtmlImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const paragraphs = String(text || "").split("\n");
    const lines = [];
    paragraphs.forEach((para) => {
      if (!para) {
        lines.push("");
        return;
      }
      let line = "";
      for (const ch of para) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    });
    return lines.length > 0 ? lines : [""];
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  async function exportPhoneFictionLongImage({ title, theme, messages, fallbackRightAvatar }) {
    const W = 750;
    const padX = 28;
    const isDark = theme.bgPreset === "night_ink" && !theme.bgImageRef;

    // 预加载背景图与消息内图片/头像
    const bgImg = theme.bgImageRef ? await loadHtmlImage(pfMediaStore.resolveSync(theme.bgImageRef)) : null;
    const loadedImgs = {};
    for (const m of messages) {
      if (m.kind === "image" && m.imageRef) {
        loadedImgs[m.id] = await loadHtmlImage(pfMediaStore.resolveSync(m.imageRef));
      }
      if (m.speakerAvatarRef && !loadedImgs["av_" + m.speakerAvatarRef]) {
        loadedImgs["av_" + m.speakerAvatarRef] = await loadHtmlImage(pfMediaStore.resolveSync(m.speakerAvatarRef));
      }
    }
    const rightFallbackImg = fallbackRightAvatar ? await loadHtmlImage(fallbackRightAvatar) : null;

    // 测量总高度
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d");
    mctx.font = "28px system-ui, -apple-system, sans-serif";

    let curY = (theme.showStatusBar ? 48 : 0) + 96 + 26;
    const layouts = [];
    for (const m of messages) {
      const isCenter = m.side === "center" || m.kind === "time" || m.kind === "system" || m.kind === "recall" || m.kind === "narration";
      if (theme.mode === "offline") {
        const lines = wrapCanvasText(mctx, m.text || "", W - padX * 2 - 48);
        const h = (isCenter ? 32 : 66) + lines.length * 42 + 24;
        layouts.push({ m, isCenter, lines, y: curY, h });
        curY += h + 18;
      } else if (isCenter) {
        mctx.font = "22px system-ui, -apple-system, sans-serif";
        const lines = wrapCanvasText(mctx, m.text || "", W - 160);
        const h = lines.length * 30 + 18;
        layouts.push({ m, isCenter: true, lines, y: curY, h });
        curY += h + 22;
        mctx.font = "28px system-ui, -apple-system, sans-serif";
      } else if (m.kind === "image") {
        const img = loadedImgs[m.id];
        let iw = 320;
        let ih = 220;
        if (img && img.width && img.height) {
          const scale = Math.min(360 / img.width, 420 / img.height, 1);
          iw = Math.round(img.width * scale);
          ih = Math.round(img.height * scale);
        }
        const h = Math.max(76, ih + 30);
        layouts.push({ m, isCenter: false, img, iw, ih, y: curY, h });
        curY += h + 22;
      } else if (m.kind === "transfer") {
        const h = 148;
        layouts.push({ m, isCenter: false, y: curY, h });
        curY += h + 22;
      } else {
        const displayTxt = m.kind === "voice" ? `🎙 ${m.meta?.duration || 6}″${m.text ? "\n" + m.text : ""}` : m.text || "";
        const lines = wrapCanvasText(mctx, displayTxt, 450);
        const maxLineW = Math.max(...lines.map((l) => mctx.measureText(l).width), 40);
        const bw = Math.min(500, Math.max(96, maxLineW + 44));
        const bh = lines.length * 40 + 30;
        const h = Math.max(76, bh + 28);
        layouts.push({ m, isCenter: false, lines, bw, bh, y: curY, h });
        curY += h + 20;
      }
    }

    const totalH = Math.max(900, curY + 50);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");

    // 1. 背景
    ctx.fillStyle = isDark ? "#1B1F23" : theme.bgPreset === "wechat_gray" ? "#EDEDED" : "#F0EBE2";
    ctx.fillRect(0, 0, W, totalH);
    if (bgImg) {
      ctx.save();
      ctx.globalAlpha = typeof theme.bgOpacity === "number" ? theme.bgOpacity : 0.9;
      const scale = Math.max(W / bgImg.width, totalH / bgImg.height);
      const dw = bgImg.width * scale;
      const dh = bgImg.height * scale;
      ctx.drawImage(bgImg, (W - dw) / 2, (totalH - dh) / 2, dw, dh);
      ctx.restore();
    }

    // 2. 顶部状态栏与标题栏
    let topOffset = 0;
    if (theme.showStatusBar) {
      ctx.fillStyle = isDark ? "rgba(20,23,26,0.92)" : "rgba(255,255,255,0.92)";
      ctx.fillRect(0, 0, W, 48);
      ctx.fillStyle = isDark ? "#E5E7EB" : "#2C3127";
      ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx.fillText(theme.fakeTime || "23:42", 28, 32);
      ctx.textAlign = "right";
      ctx.fillText(`🔋 ${theme.fakeBattery || "18%"}`, W - 28, 32);
      ctx.textAlign = "left";
      topOffset = 48;
    }
    ctx.fillStyle = isDark ? "rgba(28,32,36,0.94)" : "rgba(255,255,255,0.94)";
    ctx.fillRect(0, topOffset, W, 96);
    ctx.fillStyle = isDark ? "#F3F4F6" : "#2C3127";
    ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title || "绣衣楼", W / 2, topOffset + 60);
    ctx.textAlign = "left";

    // 3. 逐条绘制消息
    for (const item of layouts) {
      const { m, isCenter, y } = item;
      const isRight = m.side === "right";

      if (theme.mode === "offline") {
        ctx.fillStyle = isCenter ? "rgba(255,252,245,0.85)" : "rgba(255,255,255,0.92)";
        drawRoundRect(ctx, padX, y, W - padX * 2, item.h, 22);
        ctx.fill();
        let ty = y + 40;
        if (!isCenter) {
          ctx.fillStyle = isRight ? "#5E8475" : "#9E6B47";
          ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
          ctx.fillText(`${m.speakerName || "我"}：`, padX + 24, ty);
          ty += 38;
        }
        ctx.fillStyle = isCenter ? "#6D6557" : "#2E332B";
        ctx.font = "28px system-ui, -apple-system, sans-serif";
        (item.lines || []).forEach((line) => {
          ctx.fillText(line, padX + 24, ty);
          ty += 42;
        });
        continue;
      }

      if (isCenter) {
        ctx.font = "22px system-ui, -apple-system, sans-serif";
        const maxW = Math.max(...item.lines.map((l) => ctx.measureText(l).width), 60);
        const pw = Math.min(W - 120, maxW + 36);
        const px = (W - pw) / 2;
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        drawRoundRect(ctx, px, y, pw, item.h, 14);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        item.lines.forEach((line, li) => ctx.fillText(line, W / 2, y + 28 + li * 30));
        ctx.textAlign = "left";
        continue;
      }

      // 头像
      const avSize = 70;
      const avX = isRight ? W - padX - avSize : padX;
      const avImg = m.speakerAvatarRef ? loadedImgs["av_" + m.speakerAvatarRef] : isRight ? rightFallbackImg : null;
      ctx.save();
      drawRoundRect(ctx, avX, y, avSize, avSize, 16);
      ctx.clip();
      if (avImg) {
        ctx.drawImage(avImg, avX, y, avSize, avSize);
      } else {
        ctx.fillStyle = isRight ? "#8FA99D" : "#DFB79B";
        ctx.fillRect(avX, y, avSize, avSize);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(m.speakerName || "我").slice(0, 1), avX + avSize / 2, y + 46);
        ctx.textAlign = "left";
      }
      ctx.restore();

      // 名字标签
      ctx.font = "21px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = isDark ? "#D1D5DB" : "#6F7666";
      const bubbleTop = y + 26;
      if (isRight) {
        ctx.textAlign = "right";
        ctx.fillText(m.speakerName || "我", avX - 16, y + 18);
        ctx.textAlign = "left";
      } else {
        ctx.fillText(m.speakerName || title, avX + avSize + 16, y + 18);
      }

      if (m.kind === "image" && item.img) {
        const bx = isRight ? avX - 16 - item.iw : avX + avSize + 16;
        ctx.save();
        drawRoundRect(ctx, bx, bubbleTop, item.iw, item.ih, 18);
        ctx.clip();
        ctx.drawImage(item.img, bx, bubbleTop, item.iw, item.ih);
        ctx.restore();
      } else if (m.kind === "transfer") {
        const bw = 380;
        const bh = 118;
        const bx = isRight ? avX - 16 - bw : avX + avSize + 16;
        ctx.fillStyle = "#EB8934";
        drawRoundRect(ctx, bx, bubbleTop, bw, bh, 18);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 28px system-ui, -apple-system, sans-serif";
        ctx.fillText(`🧧 ${m.meta?.amount || "500 铢"}`, bx + 20, bubbleTop + 48);
        ctx.font = "22px system-ui, -apple-system, sans-serif";
        ctx.fillText(m.meta?.note || "拿去花", bx + 20, bubbleTop + 84);
      } else {
        const bx = isRight ? avX - 16 - item.bw : avX + avSize + 16;
        ctx.fillStyle = isRight ? "#D5EDE0" : "#FFFFFF";
        drawRoundRect(ctx, bx, bubbleTop, item.bw, item.bh, 18);
        ctx.fill();
        ctx.fillStyle = "#222621";
        ctx.font = "28px system-ui, -apple-system, sans-serif";
        (item.lines || []).forEach((line, li) => {
          ctx.fillText(line, bx + 22, bubbleTop + 42 + li * 40);
        });
      }
    }

    return canvas.toDataURL("image/png");
  }

  function getUserPersonasSync() {
    try {
      const list = JSON.parse(localStorage.getItem("user_personas") || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function resolvePersonaAvatar(p) {
    if (!p) return "";
    if (global.personaAvatarStore && typeof global.personaAvatarStore.resolveSync === "function") {
      return global.personaAvatarStore.resolveSync(p.avatar, p.id);
    }
    return p.avatar && !String(p.avatar).startsWith("idb:") ? p.avatar : "";
  }

  // ==========================================
  // 4. 组件 A：楼内联系人全量管理器（通讯录 → 楼内联系人）
  // ==========================================
  const T11InsideContactsManager = ({ onBack }) => {
    const h = React.createElement;
    const [roster, setRoster] = React.useState([]);
    const [search, setSearch] = React.useState("");
    const [editingContact, setEditingContact] = React.useState(null); // null | { isNew: true } | contact
    const [formName, setFormName] = React.useState("");
    const [formTitle, setFormTitle] = React.useState("");
    const [formBio, setFormBio] = React.useState("");
    const [formAvatarPreview, setFormAvatarPreview] = React.useState("");
    const [formAvatarNewData, setFormAvatarNewData] = React.useState("");
    const [clearAvatar, setClearAvatar] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const fileRef = React.useRef(null);

    const reload = async () => {
      const list = await xiuyiRosterStore.getRoster();
      setRoster(list || []);
    };

    React.useEffect(() => {
      reload();
      const handler = () => reload();
      global.addEventListener(ROSTER_EVENT, handler);
      return () => global.removeEventListener(ROSTER_EVENT, handler);
    }, []);

    const openEditor = (contact) => {
      if (contact) {
        setEditingContact(contact);
        setFormName(contact.name || "");
        setFormTitle(contact.title || "");
        setFormBio(contact.bio || "");
        setFormAvatarPreview(pfMediaStore.resolveSync(contact.avatarRef));
      } else {
        setEditingContact({ isNew: true });
        setFormName("");
        setFormTitle("自定义角色");
        setFormBio("");
        setFormAvatarPreview("");
      }
      setFormAvatarNewData("");
      setClearAvatar(false);
    };

    const handleAvatarPick = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const compressed = await compressImageFile(file, 512, 0.85);
        setFormAvatarPreview(compressed);
        setFormAvatarNewData(compressed);
        setClearAvatar(false);
      } catch (err) {
        alert("读取头像失败：" + (err?.message || err));
      }
    };

    const handleSaveContact = async () => {
      if (!formName.trim()) {
        alert("请填写角色名字");
        return;
      }
      setSaving(true);
      try {
        if (editingContact?.isNew) {
          await xiuyiRosterStore.addContact({
            name: formName,
            title: formTitle,
            bio: formBio,
            avatarDataUrl: formAvatarNewData
          });
        } else {
          await xiuyiRosterStore.updateContact(editingContact, {
            name: formName,
            title: formTitle,
            bio: formBio,
            avatarDataUrl: formAvatarNewData || undefined,
            clearAvatar
          });
        }
        setEditingContact(null);
        await reload();
      } catch (err) {
        alert("保存失败：" + (err?.message || err));
      } finally {
        setSaving(false);
      }
    };

    const handleDeleteContact = async (contact) => {
      if (!window.confirm(`确定要从楼内联系人中移除【${contact.name}】吗？`)) return;
      await xiuyiRosterStore.deleteContact(contact);
      setEditingContact(null);
      await reload();
    };

    const filtered = roster.filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.title || "").toLowerCase().includes(q) ||
        String(c.bio || "").toLowerCase().includes(q)
      );
    });

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#F9F7F5",
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      // 顶栏
      h(
        "div",
        {
          className: "t11-nav",
          style: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h(
            "div",
            { onClick: onBack, style: { cursor: "pointer", padding: "4px", color: "#4A4F55" } },
            h("i", { className: "ph ph-caret-left", style: { fontSize: "24px" } })
          ),
          h("span", { style: { fontSize: "16.5px", fontWeight: 700, color: "#3F4536" } }, `楼内联系人（${roster.length}）`)
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h(
            "button",
            {
              type: "button",
              onClick: async () => {
                if (!window.confirm("恢复所有被删除的默认绣衣楼角色？（不会删除你新建的角色）")) return;
                await xiuyiRosterStore.resetDefaultRoster();
                await reload();
              },
              style: {
                border: "1px solid #DDD8CE",
                background: "#FFFFFF",
                color: "#7A826F",
                fontSize: "11px",
                padding: "4px 8px",
                borderRadius: "999px",
                cursor: "pointer"
              }
            },
            "恢复默认"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => openEditor(null),
              style: {
                border: "none",
                background: "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: 700,
                padding: "5px 11px",
                borderRadius: "999px",
                cursor: "pointer"
              }
            },
            "+ 新增角色"
          )
        )
      ),

      // 搜索栏
      h(
        "div",
        { style: { padding: "10px 14px 6px", flexShrink: 0 } },
        h("input", {
          value: search,
          onChange: (e) => setSearch(e.target.value),
          placeholder: "搜索角色名 / 头衔 / 人物介绍…",
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 12px",
            borderRadius: "12px",
            border: "1px solid #E5E0D5",
            background: "#FFFFFF",
            fontSize: "13px",
            color: "#3F4536",
            outline: "none"
          }
        })
      ),

      // 角色列表
      h(
        "div",
        {
          className: "no-scrollbar",
          style: {
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "6px 14px 36px",
            display: "flex",
            flexDirection: "column",
            gap: "9px"
          }
        },
        filtered.map((c) => {
          const av = pfMediaStore.resolveSync(c.avatarRef);
          return h(
            "div",
            {
              key: c.id,
              onClick: () => openEditor(c),
              style: {
                background: "#FFFFFF",
                borderRadius: "15px",
                padding: "11px 13px",
                border: "1px solid #ECE7DE",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer"
              }
            },
            h(
              "div",
              {
                style: {
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: c.isBuiltin
                    ? "linear-gradient(135deg, #E8C3A8 0%, #D4B298 100%)"
                    : "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: "16px",
                  flexShrink: 0
                }
              },
              av ? h("img", { src: av, alt: c.name, style: { width: "100%", height: "100%", objectFit: "cover" } }) : String(c.name || "?").slice(0, 1)
            ),
            h(
              "div",
              { style: { flex: 1, minWidth: 0 } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                h("span", { style: { fontSize: "14.5px", fontWeight: 700, color: "#3F4536" } }, c.name),
                !c.isBuiltin &&
                  h(
                    "span",
                    { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#EBF4EF", color: "#4E7866" } },
                    "自建"
                  ),
                c.title &&
                  h("span", { style: { fontSize: "11px", color: "#9AA190" } }, c.title)
              ),
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: c.bio ? "#6F7666" : "#B4B8AE",
                    marginTop: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }
                },
                c.bio || "点击编辑头像、姓名或人物介绍"
              )
            ),
            h(
              "button",
              {
                type: "button",
                title: c.isStarred ? "取消星标" : "设为星标联系人（消息页自动置顶）",
                onClick: async (e) => {
                  e.stopPropagation();
                  await xiuyiRosterStore.toggleStar(c.id);
                  await reload();
                },
                style: {
                  border: "none",
                  background: c.isStarred ? "#FFF6E0" : "transparent",
                  color: c.isStarred ? "#E5A93B" : "#C5C8BE",
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  fontSize: "17px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }
              },
              c.isStarred ? "★" : "☆"
            ),
            h("i", { className: "ph ph-pencil-simple", style: { fontSize: "16px", color: "#A0A698" } })
          );
        })
      ),

      // 编辑 / 新增弹窗
      editingContact &&
        h(
          "div",
          {
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 13500,
              background: "rgba(38, 42, 34, 0.52)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px"
            },
            onClick: (e) => {
              if (e.target === e.currentTarget) setEditingContact(null);
            }
          },
          h(
            "div",
            {
              style: {
                width: "100%",
                maxWidth: "370px",
                background: "#F9F7F5",
                borderRadius: "20px",
                border: "1px solid #E5E0D5",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "11px",
                boxShadow: "0 20px 50px rgba(0,0,0,0.26)"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
              h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, editingContact.isNew ? "✦ 新增楼内角色" : `✎ 编辑角色 · ${editingContact.name}`),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                !editingContact.isNew &&
                  h(
                    "button",
                    {
                      type: "button",
                      title: editingContact.isStarred ? "取消星标" : "设为星标联系人",
                      onClick: async () => {
                        const nextStar = await xiuyiRosterStore.toggleStar(editingContact.id);
                        setEditingContact((prev) => (prev ? { ...prev, isStarred: nextStar } : prev));
                        await reload();
                      },
                      style: {
                        border: editingContact.isStarred ? "1px solid #F0D28B" : "1px solid #DDD8CE",
                        background: editingContact.isStarred ? "#FFF6E0" : "#FFFFFF",
                        color: editingContact.isStarred ? "#D9941E" : "#8A9080",
                        fontSize: "12px",
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    editingContact.isStarred ? "★ 已星标" : "☆ 加星标"
                  ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => setEditingContact(null),
                    style: { border: "none", background: "#ECE8DF", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" }
                  },
                  "✕"
                )
              )
            ),
            // 头像选择（直存 IndexedDB）
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "12px" } },
              h(
                "div",
                {
                  onClick: () => fileRef.current && fileRef.current.click(),
                  style: {
                    width: "60px",
                    height: "60px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "linear-gradient(135deg, #E8C3A8 0%, #D4B298 100%)",
                    border: "2px solid #A8C8BA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    fontSize: "20px",
                    fontWeight: 700,
                    cursor: "pointer",
                    flexShrink: 0
                  }
                },
                formAvatarPreview
                  ? h("img", { src: formAvatarPreview, style: { width: "100%", height: "100%", objectFit: "cover" } })
                  : String(formName || "+").slice(0, 1)
              ),
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "5px" } },
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => fileRef.current && fileRef.current.click(),
                      style: { border: "1px solid #C8D9D0", background: "#FFFFFF", color: "#4E6E60", fontSize: "12px", padding: "4px 10px", borderRadius: "8px", cursor: "pointer" }
                    },
                    "上传头像"
                  ),
                  formAvatarPreview &&
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => {
                          setFormAvatarPreview("");
                          setFormAvatarNewData("");
                          setClearAvatar(true);
                        },
                        style: { border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "12px", padding: "4px 9px", borderRadius: "8px", cursor: "pointer" }
                      },
                      "清除"
                    )
                ),
                h("span", { style: { fontSize: "11px", color: "#9AA190" } }, "头像自动压缩并存入 IndexedDB")
              ),
              h("input", { ref: fileRef, type: "file", accept: "image/*", onChange: handleAvatarPick, style: { display: "none" } })
            ),
            h("input", {
              value: formName,
              onChange: (e) => setFormName(e.target.value),
              placeholder: "角色姓名（必填）",
              style: { padding: "9px 11px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "13.5px", color: "#3F4536" }
            }),
            h("input", {
              value: formTitle,
              onChange: (e) => setFormTitle(e.target.value),
              placeholder: "头衔/备注（如：绣衣楼副官 / 暗探）",
              style: { padding: "9px 11px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "13px", color: "#5a5f4d" }
            }),
            h("textarea", {
              value: formBio,
              onChange: (e) => setFormBio(e.target.value),
              rows: 3,
              placeholder: "人物介绍 / 捡手机设定备注（选填）",
              style: { padding: "9px 11px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12.5px", color: "#5a5f4d", resize: "none", fontFamily: "inherit" }
            }),
            h(
              "div",
              { style: { display: "flex", gap: "8px", marginTop: "2px" } },
              !editingContact.isNew &&
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleDeleteContact(editingContact),
                    style: { padding: "9px 12px", borderRadius: "12px", border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "13px", fontWeight: 600, cursor: "pointer" }
                  },
                  "删除"
                ),
              h(
                "button",
                {
                  type: "button",
                  disabled: saving,
                  onClick: handleSaveContact,
                  style: {
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)",
                    color: "#FFFFFF",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer"
                  }
                },
                saving ? "保存中…" : "保存角色"
              )
            )
          )
        )
    );
  };

  // ==========================================
  // 5. 组件 B：捡手机文学生成器工作台（P0 + P1）
  // ==========================================
  const PhoneFictionStudioPage = ({ contact, onBack }) => {
    const h = React.createElement;
    const [roster, setRoster] = React.useState([]);
    const [slots, setSlots] = React.useState([{ id: "default", title: "默认剧本" }]);
    const [activeSlotId, setActiveSlotId] = React.useState("default");
    const [messages, setMessages] = React.useState([]);
    const [theme, setTheme] = React.useState(DEFAULT_THEME);
    const [inputText, setInputText] = React.useState("");

    // 发言身份：side = "left" | "right" | "center"
    const [speakerSide, setSpeakerSide] = React.useState("right");
    const [leftSpeaker, setLeftSpeaker] = React.useState(contact);
    // 右侧支持：身份配置库("persona") / 楼内任意角色("character") / 自定义昵称("custom")
    const [rightIdentityMode, setRightIdentityMode] = React.useState("persona");
    const [rightCharacter, setRightCharacter] = React.useState(null);
    const [rightCharSearch, setRightCharSearch] = React.useState("");
    const [personas, setPersonas] = React.useState([]);
    const [selectedPersonaId, setSelectedPersonaId] = React.useState("");
    const [customRightName, setCustomRightName] = React.useState("我");

    // 界面状态
    const [cleanPreview, setCleanPreview] = React.useState(false);
    const [showSettings, setShowSettings] = React.useState(false);
    const [showSlotModal, setShowSlotModal] = React.useState(false);
    const [showGuestPicker, setShowGuestPicker] = React.useState(false);
    const [guestSearch, setGuestSearch] = React.useState("");
    const [showIdentityModal, setShowIdentityModal] = React.useState(false);
    const [editingMsg, setEditingMsg] = React.useState(null);
    const [lightboxSrc, setLightboxSrc] = React.useState("");
    const [exportPreviewUrl, setExportPreviewUrl] = React.useState("");
    const [isExporting, setIsExporting] = React.useState(false);
    const [isAiDrafting, setIsAiDrafting] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const scrollRef = React.useRef(null);
    const imgInputRef = React.useRef(null);
    const bgInputRef = React.useRef(null);

    const scrollToBottom = (smooth = true) => {
      const el = scrollRef.current;
      if (!el) return;
      if (smooth && typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    };

    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        const [allRoster, loadedSlots, loadedTheme] = await Promise.all([
          xiuyiRosterStore.getRoster(),
          phoneFictionStore.getSlots(contact.id),
          phoneFictionStore.getTheme(contact.id)
        ]);
        if (cancelled) return;
        const firstSlotId = (loadedSlots && loadedSlots[0]?.id) || "default";
        const loadedMsgs = await phoneFictionStore.getMessages(contact, firstSlotId);
        if (cancelled) return;

        setRoster(allRoster || []);
        setSlots(loadedSlots || [{ id: "default", title: "默认剧本" }]);
        setActiveSlotId(firstSlotId);
        if (contact.isGroup && Array.isArray(contact.memberIds) && contact.memberIds.length > 0) {
          const firstMember = (allRoster || []).find((c) => c.id === contact.memberIds[0]);
          setLeftSpeaker(firstMember || contact);
        } else {
          const freshSelf = (allRoster || []).find((c) => c.id === contact.id) || contact;
          setLeftSpeaker(freshSelf);
        }
        setMessages(loadedMsgs || []);
        setTheme(loadedTheme || DEFAULT_THEME);

        const pList = getUserPersonasSync();
        setPersonas(pList);
        const activePid = localStorage.getItem("active_persona_id");
        if (activePid && pList.some((p) => String(p.id) === String(activePid))) {
          setSelectedPersonaId(String(activePid));
        } else if (pList[0]) {
          setSelectedPersonaId(String(pList[0].id));
        }
        setTimeout(() => scrollToBottom(false), 60);
      })();
      return () => { cancelled = true; };
    }, [contact?.id]);

    const switchSlot = async (slotId) => {
      setActiveSlotId(slotId);
      const msgs = await phoneFictionStore.getMessages(contact, slotId);
      setMessages(msgs || []);
      setShowSlotModal(false);
      setTimeout(() => scrollToBottom(false), 50);
    };

    const persistMessages = async (next) => {
      setMessages(next);
      await phoneFictionStore.saveMessages(contact.id, next, activeSlotId);
    };

    const updateTheme = async (patch) => {
      const next = { ...theme, ...patch };
      setTheme(next);
      await phoneFictionStore.saveTheme(contact.id, next);
    };

    const getCurrentRightIdentity = () => {
      if (rightIdentityMode === "character" && rightCharacter) {
        return {
          name: rightCharacter.name || "角色",
          bio: rightCharacter.bio || "",
          avatar: pfMediaStore.resolveSync(rightCharacter.avatarRef),
          avatarRef: rightCharacter.avatarRef || ""
        };
      }
      if (rightIdentityMode === "persona") {
        const p = personas.find((x) => String(x.id) === String(selectedPersonaId)) || personas[0];
        if (p) {
          return {
            name: p.name || "我",
            bio: [p.personality, p.background].filter(Boolean).join("；"),
            avatar: resolvePersonaAvatar(p),
            avatarRef: ""
          };
        }
      }
      return { name: customRightName.trim() || "我", bio: "", avatar: "", avatarRef: "" };
    };

    const appendMessage = async (msgObj) => {
      const next = [...messages, { id: uid("pfm"), time: nowHHMM(), ...msgObj }];
      await persistMessages(next);
      setTimeout(() => scrollToBottom(true), 40);
    };

    const handleSendText = async (overrideText) => {
      const txt = String(overrideText !== undefined ? overrideText : inputText).trim();
      if (!txt) return;
      if (overrideText === undefined) setInputText("");
      if (speakerSide === "center") {
        await appendMessage({
          kind: theme.mode === "offline" ? "narration" : "system",
          side: "center",
          speakerName: "",
          speakerAvatarRef: "",
          text: txt
        });
      } else if (speakerSide === "left") {
        await appendMessage({
          kind: "text",
          side: "left",
          speakerName: leftSpeaker?.name || contact.name,
          speakerAvatarRef: leftSpeaker?.avatarRef || "",
          text: txt
        });
      } else {
        const rightId = getCurrentRightIdentity();
        await appendMessage({
          kind: "text",
          side: "right",
          speakerName: rightId.name,
          speakerAvatarRef: rightId.avatarRef || "",
          text: txt
        });
      }
    };

    const handleAiDraftNext = async () => {
      if (isAiDrafting) return;
      const rightId = getCurrentRightIdentity();
      const targetName =
        speakerSide === "left"
          ? (leftSpeaker?.name || contact.name)
          : speakerSide === "right"
          ? rightId.name
          : "旁白";
      const targetBio =
        speakerSide === "left"
          ? (leftSpeaker?.bio || contact.bio || "")
          : speakerSide === "right"
          ? (rightId.bio || "")
          : "";
      setIsAiDrafting(true);
      try {
        const line = await aiGenerateNextLine({
          speakerName: targetName,
          speakerBio: targetBio,
          mode: theme.mode,
          messages
        });
        if (line) await handleSendText(line);
      } catch (err) {
        alert("AI 帮写失败：" + (err?.message || err));
      } finally {
        setIsAiDrafting(false);
      }
    };

    const handleExportLongImage = async () => {
      if (isExporting) return;
      if (messages.length === 0) {
        alert("当前剧本还没有消息，先写几句再导出长图吧~");
        return;
      }
      setIsExporting(true);
      try {
        const url = await exportPhoneFictionLongImage({
          title: theme.chatTitleOverride || contact.name,
          theme,
          messages,
          fallbackRightAvatar: getCurrentRightIdentity().avatar
        });
        setExportPreviewUrl(url);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = `捡手机_${(theme.chatTitleOverride || contact.name).replace(/\s+/g, "")}_${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (e) {}
      } catch (err) {
        alert("导出长图失败：" + (err?.message || err));
      } finally {
        setIsExporting(false);
      }
    };

    const handleSendImage = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const compressed = await compressImageFile(file, 1280, 0.84);
        const imgId = uid("pf_img");
        const imageRef = await pfMediaStore.save(imgId, compressed);
        const side = speakerSide === "center" ? "right" : speakerSide;
        const rightId = getCurrentRightIdentity();
        await appendMessage({
          kind: "image",
          side,
          speakerName: side === "left" ? (leftSpeaker?.name || contact.name) : rightId.name,
          speakerAvatarRef: side === "left" ? (leftSpeaker?.avatarRef || "") : (rightId.avatarRef || ""),
          text: "[图片]",
          imageRef
        });
      } catch (err) {
        alert("发送图片失败：" + (err?.message || err));
      }
    };

    const handleBgUpload = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const compressed = await compressImageFile(file, 1280, 0.84);
        const bgRef = await pfMediaStore.save(`pf_bg_${contact.id}`, compressed);
        await updateTheme({ bgImageRef: bgRef });
      } catch (err) {
        alert("上传背景失败：" + (err?.message || err));
      }
    };

    const insertQuickItem = async (kind) => {
      if (kind === "time") {
        const val = window.prompt("输入时间分割线文字（如：凌晨 02:17 / 昨天 23:59）：", nowHHMM());
        if (val && val.trim()) {
          await appendMessage({ kind: "time", side: "center", text: val.trim() });
        }
      } else if (kind === "recall") {
        const who = speakerSide === "left" ? (leftSpeaker?.name || contact.name) : getCurrentRightIdentity().name;
        const val = window.prompt("输入撤回提示文案：", `"${who}" 撤回了一条消息`);
        if (val && val.trim()) {
          await appendMessage({ kind: "recall", side: "center", text: val.trim() });
        }
      } else if (kind === "voice") {
        const sec = window.prompt("输入语音时长（秒）：", "8");
        if (!sec) return;
        const txt = window.prompt("输入语音转文字内容（选填）：", "");
        const side = speakerSide === "center" ? "left" : speakerSide;
        const rightId = getCurrentRightIdentity();
        await appendMessage({
          kind: "voice",
          side,
          speakerName: side === "left" ? (leftSpeaker?.name || contact.name) : rightId.name,
          speakerAvatarRef: side === "left" ? (leftSpeaker?.avatarRef || "") : (rightId.avatarRef || ""),
          text: (txt || "").trim(),
          meta: { duration: Math.max(1, parseInt(sec, 10) || 6) }
        });
      } else if (kind === "transfer") {
        const amount = window.prompt("输入转账/红包金额（如：500 铢 / ¥520）：", "500 铢");
        if (!amount) return;
        const note = window.prompt("输入附言（如：封口费 / 拿去买糖）：", "拿去花");
        const side = speakerSide === "center" ? "left" : speakerSide;
        const rightId = getCurrentRightIdentity();
        await appendMessage({
          kind: "transfer",
          side,
          speakerName: side === "left" ? (leftSpeaker?.name || contact.name) : rightId.name,
          speakerAvatarRef: side === "left" ? (leftSpeaker?.avatarRef || "") : (rightId.avatarRef || ""),
          text: `${amount} · ${note || ""}`,
          meta: { amount: amount.trim(), note: (note || "").trim() }
        });
      }
    };

    const handleCopyScript = async () => {
      const activeSlotObj = slots.find((s) => s.id === activeSlotId);
      const header = `【捡手机文学 · ${theme.chatTitleOverride || contact.name}${activeSlotObj ? ` · ${activeSlotObj.title}` : ""}（${theme.mode === "online" ? "线上模式" : "线下模式"}）】\n`;
      const lines = messages.map((m) => {
        if (m.kind === "time") return `\n—— ${m.text} ——`;
        if (m.kind === "recall" || m.kind === "system") return `[系统] ${m.text}`;
        if (m.kind === "narration") return `（${m.text}）`;
        if (m.kind === "image") return `${m.speakerName || "我"}：[图片]`;
        if (m.kind === "voice") return `${m.speakerName || "我"}：[语音 ${m.meta?.duration || 5}″] ${m.text || ""}`;
        if (m.kind === "transfer") return `${m.speakerName || "我"}：[转账 ${m.meta?.amount || ""}] ${m.meta?.note || ""}`;
        return `${m.speakerName || (m.side === "right" ? "我" : contact.name)}：${m.text}`;
      });
      const ok = await copyPlainText(header + lines.join("\n"));
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    };

    const activePreset = BG_PRESETS.find((p) => p.id === theme.bgPreset) || BG_PRESETS[0];
    const isDarkBg = activePreset.dark && !theme.bgImageRef;
    const bgImgUrl = pfMediaStore.resolveSync(theme.bgImageRef);
    const rightInfo = getCurrentRightIdentity();
    const groupMembers = contact?.isGroup
      ? (contact.memberIds || []).map((mid) => roster.find((r) => r.id === mid)).filter(Boolean)
      : [];
    const displayTitle =
      theme.chatTitleOverride ||
      (contact?.isGroup ? `${contact.name} (${groupMembers.length}人)` : contact.name);
    const currentSlotTitle = (slots.find((s) => s.id === activeSlotId) || {}).title || "默认剧本";

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 350,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          overscrollBehavior: "contain",
          background: activePreset.css,
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      // 自定义背景图层（IndexedDB）
      bgImgUrl &&
        h("div", {
          style: {
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgImgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: typeof theme.bgOpacity === "number" ? theme.bgOpacity : 0.9,
            filter: theme.bgBlur ? `blur(${theme.bgBlur}px)` : "none",
            pointerEvents: "none",
            zIndex: 0
          }
        }),

      // 顶部仿真手机状态栏
      theme.showStatusBar &&
        h(
          "div",
          {
            style: {
              position: "relative",
              zIndex: 10,
              height: "24px",
              padding: "0 14px",
              background: isDarkBg ? "rgba(20,23,26,0.88)" : "rgba(255,255,255,0.88)",
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              fontWeight: 700,
              color: isDarkBg ? "#E5E7EB" : "#2C3127",
              flexShrink: 0
            }
          },
          h("span", null, theme.fakeTime || "23:42"),
          h("span", { style: { fontSize: "10px", opacity: 0.7 } }, "5G · 绣衣专线"),
          h("span", null, `🔋 ${theme.fakeBattery || "18%"}`)
        ),

      // 顶栏
      h(
        "div",
        {
          style: {
            position: "relative",
            zIndex: 10,
            height: "52px",
            background: isDarkBg ? "rgba(28,32,36,0.9)" : "rgba(255,255,255,0.9)",
            backdropFilter: "blur(12px)",
            borderBottom: isDarkBg ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            flexShrink: 0,
            gap: "6px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 } },
          h(
            "button",
            {
              type: "button",
              onClick: cleanPreview ? () => setCleanPreview(false) : onBack,
              style: { border: "none", background: "transparent", color: isDarkBg ? "#E5E7EB" : "#4A5140", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }
            },
            h("i", { className: "ph ph-caret-left", style: { fontSize: "22px" } })
          ),
          h(
            "div",
            { style: { minWidth: 0 } },
            h(
              "div",
              { style: { fontSize: "15px", fontWeight: 700, color: isDarkBg ? "#F3F4F6" : "#2C3127", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
              displayTitle
            ),
            !cleanPreview &&
              h(
                "div",
                {
                  onClick: () => setShowSlotModal(true),
                  style: { fontSize: "10.5px", color: "#7E9A8D", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }
                },
                `${currentSlotTitle} · ${theme.mode === "online" ? "线上" : "线下"} ▾`
              )
          )
        ),
        cleanPreview
          ? h(
              "button",
              {
                type: "button",
                onClick: () => setCleanPreview(false),
                style: {
                  border: "1px solid rgba(143,169,157,0.45)",
                  background: "rgba(255,255,255,0.75)",
                  color: "#4A5A50",
                  fontSize: "11px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  cursor: "pointer"
                }
              },
              "退出纯净模式"
            )
          : h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 } },
              h(
                "button",
                {
                  type: "button",
                  onClick: () => updateTheme({ mode: theme.mode === "online" ? "offline" : "online" }),
                  style: {
                    border: "1px solid #C8D9D0",
                    background: theme.mode === "offline" ? "#5E8475" : "#EEF6F2",
                    color: theme.mode === "offline" ? "#FFFFFF" : "#3F5D50",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "4px 9px",
                    borderRadius: "999px",
                    cursor: "pointer"
                  }
                },
                theme.mode === "online" ? "线上" : "线下"
              ),
              h(
                "button",
                {
                  type: "button",
                  title: "多剧本存档槽",
                  onClick: () => setShowSlotModal(true),
                  style: { border: "1px solid #E2DDD2", background: "#FFFFFF", color: "#5a5f4d", width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }
                },
                h("i", { className: "ph ph-folders", style: { fontSize: "15px" } })
              ),
              h(
                "button",
                {
                  type: "button",
                  title: "纯净截图模式",
                  onClick: () => setCleanPreview(true),
                  style: { border: "1px solid #E2DDD2", background: "#FFFFFF", color: "#5a5f4d", width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }
                },
                h("i", { className: "ph ph-camera", style: { fontSize: "15px" } })
              ),
              h(
                "button",
                {
                  type: "button",
                  title: "换背景与状态栏设置",
                  onClick: () => setShowSettings(true),
                  style: { border: "1px solid #E2DDD2", background: "#FFFFFF", color: "#5a5f4d", width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }
                },
                h("i", { className: "ph ph-sliders-horizontal", style: { fontSize: "15px" } })
              )
            )
      ),

      // 主消息画布区
      h(
        "div",
        {
          ref: scrollRef,
          className: "no-scrollbar",
          style: {
            position: "relative",
            zIndex: 5,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: theme.mode === "offline" ? "14px 14px 28px" : "14px 12px 24px",
            display: "flex",
            flexDirection: "column",
            gap: theme.mode === "offline" ? "10px" : "11px"
          }
        },
        messages.length === 0 &&
          h(
            "div",
            {
              style: {
                margin: "36px auto",
                padding: "16px 18px",
                maxWidth: "305px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.84)",
                backdropFilter: "blur(6px)",
                textAlign: "center",
                color: "#6F7666",
                fontSize: "12.5px",
                lineHeight: 1.7
              }
            },
            h("div", { style: { fontWeight: 700, fontSize: "14px", color: "#3F4536", marginBottom: "6px" } }, "✨ 捡手机文学生成器已就绪"),
            "左右两侧均可自由切换「身份配置库 / 楼内任意角色 / 临时昵称」，支持发图、换背景、多剧本存档、AI 帮写与一键导出高清长图。"
          ),

        messages.map((msg, idx) => {
          const isCenter = msg.side === "center" || msg.kind === "time" || msg.kind === "system" || msg.kind === "recall" || msg.kind === "narration";
          const isRight = msg.side === "right";
          const msgAv = pfMediaStore.resolveSync(msg.speakerAvatarRef);
          const rightAv = msgAv || rightInfo.avatar;
          const leftAv = msgAv;
          const imgSrc = msg.kind === "image" ? pfMediaStore.resolveSync(msg.imageRef) : "";

          if (theme.mode === "offline") {
            return h(
              "div",
              {
                key: msg.id,
                onClick: () => !cleanPreview && setEditingMsg({ msg, idx }),
                style: {
                  background: isCenter ? "rgba(255,252,245,0.72)" : "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(6px)",
                  borderRadius: "14px",
                  padding: "11px 14px",
                  border: isCenter ? "1px dashed #D5CEBF" : "1px solid rgba(220,214,202,0.7)",
                  cursor: cleanPreview ? "default" : "pointer",
                  color: "#2E332B",
                  fontSize: "14px",
                  lineHeight: 1.75
                }
              },
              isCenter
                ? h("div", { style: { fontStyle: "italic", color: "#6D6557", textAlign: msg.kind === "time" ? "center" : "left", fontSize: "13px" } }, msg.text)
                : h(
                    "div",
                    null,
                    h(
                      "div",
                      { style: { fontSize: "12px", fontWeight: 700, color: isRight ? "#5E8475" : "#9E6B47", marginBottom: "4px" } },
                      `${msg.speakerName || (isRight ? rightInfo.name : contact.name)}：`
                    ),
                    msg.kind === "image" && imgSrc
                      ? h("img", {
                          src: imgSrc,
                          onClick: (e) => { e.stopPropagation(); setLightboxSrc(imgSrc); },
                          style: { maxWidth: "220px", maxHeight: "240px", borderRadius: "10px", display: "block", cursor: "zoom-in" }
                        })
                      : h("div", { style: { whiteSpace: "pre-wrap" } }, msg.text)
                  )
            );
          }

          if (isCenter) {
            return h(
              "div",
              {
                key: msg.id,
                onClick: () => !cleanPreview && setEditingMsg({ msg, idx }),
                style: { display: "flex", justifyContent: "center", cursor: cleanPreview ? "default" : "pointer" }
              },
              h(
                "span",
                {
                  style: {
                    background: "rgba(0, 0, 0, 0.22)",
                    color: "#FFFFFF",
                    fontSize: "11px",
                    padding: "3px 10px",
                    borderRadius: "10px",
                    backdropFilter: "blur(4px)",
                    maxWidth: "85%",
                    textAlign: "center",
                    lineHeight: 1.45
                  }
                },
                msg.text
              )
            );
          }

          const showLeftName = !isRight && msg.speakerName && (contact?.isGroup || msg.speakerName !== displayTitle);
          const showRightName = isRight && msg.speakerName && (contact?.isGroup || msg.speakerName !== "我");
          return h(
            "div",
            {
              key: msg.id,
              style: {
                display: "flex",
                flexDirection: isRight ? "row-reverse" : "row",
                alignItems: "flex-start",
                gap: "8px"
              }
            },
            h(
              "div",
              {
                style: {
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  overflow: "hidden",
                  background: isRight
                    ? "linear-gradient(135deg, #A8C8BA 0%, #7DA493 100%)"
                    : "linear-gradient(135deg, #E8C3A8 0%, #D4B298 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
                }
              },
              isRight
                ? (rightAv ? h("img", { src: rightAv, style: { width: "100%", height: "100%", objectFit: "cover" } }) : String(msg.speakerName || rightInfo.name).slice(0, 1))
                : (leftAv ? h("img", { src: leftAv, style: { width: "100%", height: "100%", objectFit: "cover" } }) : String(msg.speakerName || contact.name).slice(0, 1))
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", alignItems: isRight ? "flex-end" : "flex-start", maxWidth: "74%" } },
              (showLeftName || showRightName) &&
                h("span", { style: { fontSize: "10.5px", color: isDarkBg ? "#D1D5DB" : "#6F7666", marginBottom: "2px", padding: "0 2px" } }, msg.speakerName),
              msg.kind === "image"
                ? h(
                    "div",
                    {
                      onClick: () => (cleanPreview ? setLightboxSrc(imgSrc) : setEditingMsg({ msg, idx })),
                      style: {
                        borderRadius: "14px",
                        overflow: "hidden",
                        border: "2px solid rgba(255,255,255,0.85)",
                        boxShadow: "0 3px 10px rgba(0,0,0,0.12)",
                        cursor: "pointer",
                        background: "#EEE"
                      }
                    },
                    imgSrc
                      ? h("img", {
                          src: imgSrc,
                          onClick: (e) => {
                            if (cleanPreview) {
                              e.stopPropagation();
                              setLightboxSrc(imgSrc);
                            }
                          },
                          style: { maxWidth: "200px", maxHeight: "240px", display: "block", objectFit: "cover" }
                        })
                      : h("div", { style: { padding: "18px 24px", fontSize: "12px", color: "#888" } }, "图片加载中…")
                  )
                : msg.kind === "transfer"
                ? h(
                    "div",
                    {
                      onClick: () => !cleanPreview && setEditingMsg({ msg, idx }),
                      style: {
                        width: "210px",
                        borderRadius: "14px",
                        overflow: "hidden",
                        background: "linear-gradient(135deg, #F59E42 0%, #E67E22 100%)",
                        color: "#FFFFFF",
                        boxShadow: "0 4px 12px rgba(230, 126, 34, 0.25)",
                        cursor: cleanPreview ? "default" : "pointer"
                      }
                    },
                    h(
                      "div",
                      { style: { padding: "11px 12px", display: "flex", alignItems: "center", gap: "10px" } },
                      h("span", { style: { fontSize: "24px" } }, "🧧"),
                      h(
                        "div",
                        { style: { minWidth: 0 } },
                        h("div", { style: { fontSize: "14px", fontWeight: 700 } }, msg.meta?.amount || "500 铢"),
                        h("div", { style: { fontSize: "11.5px", opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, msg.meta?.note || "拿去花")
                      )
                    ),
                    h("div", { style: { background: "rgba(255,255,255,0.92)", color: "#8C6D46", fontSize: "10.5px", padding: "4px 12px" } }, "绣衣楼银票转账")
                  )
                : msg.kind === "voice"
                ? h(
                    "div",
                    {
                      onClick: () => !cleanPreview && setEditingMsg({ msg, idx }),
                      style: {
                        background: isRight ? "#95EC69" : "#FFFFFF",
                        color: "#1F2421",
                        padding: "9px 13px",
                        borderRadius: isRight ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.07)",
                        cursor: cleanPreview ? "default" : "pointer",
                        minWidth: `${Math.min(190, 74 + (msg.meta?.duration || 5) * 6)}px`
                      }
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", justifyContent: isRight ? "flex-end" : "flex-start", gap: "6px", fontSize: "13px", fontWeight: 600 } },
                      h("span", null, "🎙"),
                      h("span", null, `${msg.meta?.duration || 6}″`)
                    ),
                    msg.text &&
                      h("div", { style: { fontSize: "12px", marginTop: "5px", paddingTop: "5px", borderTop: "1px dashed rgba(0,0,0,0.12)", color: "#3A4038", lineHeight: 1.5 } }, msg.text)
                  )
                : h(
                    "div",
                    {
                      onClick: () => !cleanPreview && setEditingMsg({ msg, idx }),
                      style: {
                        background: isRight ? "#D5EDE0" : "#FFFFFF",
                        color: "#222621",
                        padding: "9px 12px",
                        borderRadius: isRight ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        fontSize: "14px",
                        lineHeight: 1.55,
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                        cursor: cleanPreview ? "default" : "pointer"
                      }
                    },
                    msg.text
                  )
            )
          );
        })
      ),

      // 底部捡手机创作控制台
      !cleanPreview &&
        h(
          "div",
          {
            style: {
              position: "relative",
              zIndex: 15,
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(12px)",
              borderTop: "1px solid #E5E0D8",
              padding: "8px 10px calc(10px + var(--safe-bottom, 0px))",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
              flexShrink: 0
            }
          },
          // 群聊模式专属：本群成员一键快切条
          contact?.isGroup &&
            groupMembers.length > 0 &&
            h(
              "div",
              { className: "no-scrollbar", style: { display: "flex", alignItems: "center", gap: "5px", overflowX: "auto", paddingBottom: "2px" } },
              h("span", { style: { fontSize: "10.5px", color: "#8A9080", flexShrink: 0 } }, "本群快切："),
              groupMembers.map((gm) => {
                const isActLeft = speakerSide === "left" && leftSpeaker?.id === gm.id;
                return h(
                  "button",
                  {
                    key: gm.id,
                    type: "button",
                    onClick: () => {
                      setLeftSpeaker(gm);
                      setSpeakerSide("left");
                    },
                    style: {
                      border: isActLeft ? "1.5px solid #C28A62" : "1px solid #E5E0D5",
                      background: isActLeft ? "#FBF0E7" : "#FFFFFF",
                      color: isActLeft ? "#8E552E" : "#5a5f4d",
                      fontSize: "11px",
                      fontWeight: isActLeft ? 700 : 500,
                      padding: "2px 9px",
                      borderRadius: "999px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    }
                  },
                  gm.name
                );
              })
            ),
          // 第一行：身份切换条（右侧支持切用户/切楼内角色/临时昵称，左侧支持当前/换人串场）
          h(
            "div",
            { className: "no-scrollbar", style: { display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" } },
            h(
              "button",
              {
                type: "button",
                onClick: () => setSpeakerSide("right"),
                style: {
                  border: speakerSide === "right" ? "1.5px solid #5E8475" : "1px solid #E2DDD2",
                  background: speakerSide === "right" ? "#E8F4EE" : "#FAF8F4",
                  color: speakerSide === "right" ? "#2E5A47" : "#6F7666",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }
              },
              `右侧·${rightInfo.name}`
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setShowIdentityModal(true),
                style: {
                  border: "1px dashed #B8C7BE",
                  background: "#FFFFFF",
                  color: "#5E8475",
                  fontSize: "11px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }
              },
              "切右侧身份/角色"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setSpeakerSide("left"),
                style: {
                  border: speakerSide === "left" ? "1.5px solid #C28A62" : "1px solid #E2DDD2",
                  background: speakerSide === "left" ? "#FBF0E7" : "#FAF8F4",
                  color: speakerSide === "left" ? "#8E552E" : "#6F7666",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }
              },
              `左侧·${leftSpeaker?.name || contact.name}`
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setShowGuestPicker(true),
                style: {
                  border: "1px dashed #D9B79C",
                  background: "#FFFFFF",
                  color: "#9A6741",
                  fontSize: "11px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }
              },
              "换左侧角色"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setSpeakerSide("center"),
                style: {
                  border: speakerSide === "center" ? "1.5px solid #6E7680" : "1px solid #E2DDD2",
                  background: speakerSide === "center" ? "#EEF0F3" : "#FAF8F4",
                  color: speakerSide === "center" ? "#374151" : "#6F7666",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }
              },
              "居中·旁白"
            )
          ),

          // 第二行：捡手机快捷梗按钮条 + P1 AI 帮写 + 导出高清长图
          h(
            "div",
            { className: "no-scrollbar", style: { display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" } },
            [
              { label: isAiDrafting ? "✨ 构思中…" : "✨ AI帮接一句", fn: handleAiDraftNext, accent: true },
              { label: "🖼 发图", fn: () => imgInputRef.current && imgInputRef.current.click() },
              { label: "🕒 时间", fn: () => insertQuickItem("time") },
              { label: "↩ 撤回", fn: () => insertQuickItem("recall") },
              { label: "🎙 语音", fn: () => insertQuickItem("voice") },
              { label: "🧧 转账", fn: () => insertQuickItem("transfer") },
              { label: isExporting ? "导出中…" : "📸 导出长图", fn: handleExportLongImage },
              { label: copied ? "已复制 ✓" : "📋 复制文本", fn: handleCopyScript }
            ].map((btn, i) =>
              h(
                "button",
                {
                  key: i,
                  type: "button",
                  onClick: btn.fn,
                  style: {
                    border: btn.accent ? "1px solid #B6D0C2" : "1px solid #E8E3D9",
                    background: btn.accent ? "#EEF6F2" : "#F9F7F4",
                    color: btn.accent ? "#345E4C" : "#5a5f4d",
                    fontWeight: btn.accent ? 700 : 500,
                    fontSize: "11px",
                    padding: "3px 9px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0
                  }
                },
                btn.label
              )
            ),
            h("input", { ref: imgInputRef, type: "file", accept: "image/*", onChange: handleSendImage, style: { display: "none" } })
          ),

          // 第三行：输入框 + 发送按钮
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("input", {
              type: "text",
              value: inputText,
              onChange: (e) => setInputText(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              },
              placeholder:
                speakerSide === "center"
                  ? "输入居中旁白 / 系统提示…"
                  : speakerSide === "left"
                  ? `以【${leftSpeaker?.name || contact.name}】口吻输入…`
                  : `以【${rightInfo.name}】口吻输入…`,
              style: {
                flex: 1,
                padding: "9px 13px",
                borderRadius: "18px",
                border: "1.5px solid #E2DDD5",
                background: "#F9F8F6",
                fontSize: "14px",
                color: "#2C3127",
                outline: "none"
              }
            }),
            h(
              "button",
              {
                type: "button",
                onClick: () => handleSendText(),
                style: {
                  border: "none",
                  borderRadius: "18px",
                  padding: "9px 16px",
                  background: inputText.trim()
                    ? "linear-gradient(135deg, #A8C8BA 0%, #7DA493 100%)"
                    : "#E2DDD5",
                  color: "#FFFFFF",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  cursor: inputText.trim() ? "pointer" : "default",
                  flexShrink: 0
                }
              },
              "发送"
            )
          )
        ),

      // 弹窗 1：切换右侧身份（支持：身份配置库 / 楼内任意角色 / 临时昵称）
      showIdentityModal &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 13800, background: "rgba(32,36,30,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setShowIdentityModal(false); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "370px", maxHeight: "80vh", background: "#F9F7F5", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { fontSize: "14.5px", fontWeight: 700, color: "#3F4536" } }, "🎭 选择右侧发言身份 / 角色"),
              h("button", { type: "button", onClick: () => setShowIdentityModal(false), style: { border: "none", background: "#ECE8DF", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" } }, "✕")
            ),
            h(
              "div",
              { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" } },
              // 1) 身份配置库
              personas.length > 0 &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                  h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#7A826F" } }, "1. 从设置 · 身份配置库选择："),
                  h(
                    "div",
                    { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                    personas.map((p) =>
                      h(
                        "button",
                        {
                          key: p.id,
                          type: "button",
                          onClick: () => {
                            setRightIdentityMode("persona");
                            setSelectedPersonaId(String(p.id));
                            setSpeakerSide("right");
                            setShowIdentityModal(false);
                          },
                          style: {
                            border: rightIdentityMode === "persona" && String(selectedPersonaId) === String(p.id) ? "1.5px solid #5E8475" : "1px solid #DDD8CE",
                            background: rightIdentityMode === "persona" && String(selectedPersonaId) === String(p.id) ? "#E8F4EE" : "#FFFFFF",
                            color: "#3F4536",
                            padding: "5px 11px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            cursor: "pointer"
                          }
                        },
                        p.name || "未命名身份"
                      )
                    )
                  )
                ),
              // 2) 楼内任意角色作为右侧机主/发言人
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#7A826F" } }, "2. 选择楼内角色作为右侧发言人（支持双角色捡手机）："),
                h("input", {
                  value: rightCharSearch,
                  onChange: (e) => setRightCharSearch(e.target.value),
                  placeholder: "搜索角色名…",
                  style: { padding: "6px 10px", borderRadius: "9px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12px" }
                }),
                h(
                  "div",
                  { style: { display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "170px", overflowY: "auto" } },
                  roster
                    .filter((c) => !rightCharSearch.trim() || String(c.name || "").toLowerCase().includes(rightCharSearch.trim().toLowerCase()))
                    .map((c) =>
                      h(
                        "button",
                        {
                          key: c.id,
                          type: "button",
                          onClick: () => {
                            setRightIdentityMode("character");
                            setRightCharacter(c);
                            setSpeakerSide("right");
                            setShowIdentityModal(false);
                          },
                          style: {
                            border: rightIdentityMode === "character" && rightCharacter?.id === c.id ? "1.5px solid #5E8475" : "1px solid #E2DDD2",
                            background: rightIdentityMode === "character" && rightCharacter?.id === c.id ? "#E8F4EE" : "#FFFFFF",
                            color: "#3F4536",
                            padding: "5px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            cursor: "pointer"
                          }
                        },
                        c.name
                      )
                    )
                )
              ),
              // 3) 临时自定义昵称
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#7A826F" } }, "3. 或输入临时自定义昵称："),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  h("input", {
                    value: customRightName,
                    onChange: (e) => setCustomRightName(e.target.value),
                    placeholder: "输入临时昵称",
                    style: { flex: 1, padding: "8px 10px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "13px" }
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setRightIdentityMode("custom");
                        setSpeakerSide("right");
                        setShowIdentityModal(false);
                      },
                      style: { border: "none", borderRadius: "10px", padding: "8px 12px", background: "#8FA99D", color: "#FFFFFF", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }
                    },
                    "使用"
                  )
                )
              )
            )
          )
        ),

      // 弹窗 2：左侧角色选择器
      showGuestPicker &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 13800, background: "rgba(32,36,30,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setShowGuestPicker(false); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "360px", maxHeight: "74vh", background: "#F9F7F5", borderRadius: "18px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" } },
            h("div", { style: { fontSize: "14.5px", fontWeight: 700, color: "#3F4536" } }, "👥 选择左侧发言角色（可多人串场）"),
            h("input", {
              value: guestSearch,
              onChange: (e) => setGuestSearch(e.target.value),
              placeholder: "搜索角色名…",
              style: { padding: "7px 10px", borderRadius: "9px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12.5px" }
            }),
            h(
              "div",
              { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: "7px" } },
              roster
                .filter((c) => !guestSearch.trim() || String(c.name || "").toLowerCase().includes(guestSearch.trim().toLowerCase()))
                .map((c) =>
                  h(
                    "button",
                    {
                      key: c.id,
                      type: "button",
                      onClick: () => {
                        setLeftSpeaker(c);
                        setSpeakerSide("left");
                        setShowGuestPicker(false);
                      },
                      style: {
                        border: leftSpeaker?.id === c.id ? "1.5px solid #C28A62" : "1px solid #E2DDD2",
                        background: leftSpeaker?.id === c.id ? "#FBF0E7" : "#FFFFFF",
                        color: "#3F4536",
                        padding: "6px 11px",
                        borderRadius: "999px",
                        fontSize: "12.5px",
                        cursor: "pointer"
                      }
                    },
                    c.name
                  )
                )
            )
          )
        ),

      // 弹窗 2.5（P1）：多剧本存档槽管理
      showSlotModal &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 13800, background: "rgba(32,36,30,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setShowSlotModal(false); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "360px", maxHeight: "76vh", background: "#F9F7F5", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { fontSize: "14.5px", fontWeight: 700, color: "#3F4536" } }, `📚 ${contact.name} · 剧本存档槽`),
              h(
                "button",
                {
                  type: "button",
                  onClick: async () => {
                    const name = window.prompt("输入新剧本标题（如：深夜查账番外 / 现代AU）：", `剧本 ${slots.length + 1}`);
                    if (!name || !name.trim()) return;
                    const res = await phoneFictionStore.createSlot(contact.id, name.trim());
                    setSlots(res.slots);
                    await switchSlot(res.slot.id);
                  },
                  style: { border: "none", background: "#8FA99D", color: "#FFFFFF", fontSize: "11.5px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", cursor: "pointer" }
                },
                "+ 新建剧本"
              )
            ),
            h(
              "div",
              { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "7px" } },
              slots.map((s) => {
                const isAct = s.id === activeSlotId;
                return h(
                  "div",
                  {
                    key: s.id,
                    onClick: () => switchSlot(s.id),
                    style: {
                      background: isAct ? "#EEF6F2" : "#FFFFFF",
                      border: isAct ? "1.5px solid #8FA99D" : "1px solid #E5E0D5",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      cursor: "pointer"
                    }
                  },
                  h("span", { style: { fontSize: "13px", fontWeight: isAct ? 700 : 500, color: "#3F4536" } }, `${isAct ? "● " : ""}${s.title}`),
                  h(
                    "div",
                    { style: { display: "flex", gap: "5px" }, onClick: (e) => e.stopPropagation() },
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: async () => {
                          const nextName = window.prompt("重命名剧本：", s.title);
                          if (!nextName || !nextName.trim()) return;
                          const updated = await phoneFictionStore.renameSlot(contact.id, s.id, nextName.trim());
                          setSlots(updated);
                        },
                        style: { border: "1px solid #DDD8CE", background: "#FFFFFF", color: "#5a5f4d", fontSize: "11px", padding: "2px 7px", borderRadius: "7px", cursor: "pointer" }
                      },
                      "改名"
                    ),
                    slots.length > 1 &&
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: async () => {
                            if (!window.confirm(`确定删除剧本《${s.title}》吗？`)) return;
                            const updated = await phoneFictionStore.deleteSlot(contact.id, s.id);
                            setSlots(updated);
                            if (activeSlotId === s.id) await switchSlot(updated[0].id);
                          },
                          style: { border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "11px", padding: "2px 7px", borderRadius: "7px", cursor: "pointer" }
                        },
                        "删"
                      )
                  )
                );
              })
            )
          )
        ),

      // 弹窗 3：换背景与仿真状态栏设置
      showSettings &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 13800, background: "rgba(32,36,30,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setShowSettings(false); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "380px", maxHeight: "82vh", overflowY: "auto", background: "#F9F7F5", borderRadius: "20px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, "🎨 捡手机装扮与仿真设置"),
              h("button", { type: "button", onClick: () => setShowSettings(false), style: { border: "none", background: "#ECE8DF", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" } }, "✕")
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "6px" } },
              h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#5a5f4d" } }, "内置底色预设"),
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                BG_PRESETS.map((p) =>
                  h(
                    "button",
                    {
                      key: p.id,
                      type: "button",
                      onClick: () => updateTheme({ bgPreset: p.id }),
                      style: {
                        border: theme.bgPreset === p.id ? "2px solid #5E8475" : "1px solid #DDD8CE",
                        background: p.css,
                        color: p.dark ? "#FFFFFF" : "#3F4536",
                        fontSize: "11.5px",
                        padding: "5px 10px",
                        borderRadius: "10px",
                        cursor: "pointer"
                      }
                    },
                    p.name
                  )
                )
              )
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "6px" } },
              h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#5a5f4d" } }, "自定义背景图（存入 IndexedDB）"),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => bgInputRef.current && bgInputRef.current.click(),
                    style: { flex: 1, padding: "8px", borderRadius: "10px", border: "none", background: "#8FA99D", color: "#FFFFFF", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }
                  },
                  "上传背景图"
                ),
                theme.bgImageRef &&
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: async () => {
                        await pfMediaStore.delete(theme.bgImageRef);
                        await updateTheme({ bgImageRef: "" });
                      },
                      style: { padding: "8px 12px", borderRadius: "10px", border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "12.5px", cursor: "pointer" }
                    },
                    "移除"
                  )
              ),
              h("input", { ref: bgInputRef, type: "file", accept: "image/*", onChange: handleBgUpload, style: { display: "none" } }),
              theme.bgImageRef &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" } },
                  h("label", { style: { fontSize: "11.5px", color: "#6F7666" } }, `背景不透明度：${Math.round((theme.bgOpacity ?? 0.9) * 100)}%`),
                  h("input", { type: "range", min: "0.2", max: "1", step: "0.05", value: theme.bgOpacity ?? 0.9, onChange: (e) => updateTheme({ bgOpacity: Number(e.target.value) }) }),
                  h("label", { style: { fontSize: "11.5px", color: "#6F7666" } }, `背景磨砂模糊：${theme.bgBlur || 0}px`),
                  h("input", { type: "range", min: "0", max: "10", step: "1", value: theme.bgBlur || 0, onChange: (e) => updateTheme({ bgBlur: Number(e.target.value) }) })
                )
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px dashed #E2DDD2", paddingTop: "10px" } },
              h("input", {
                value: theme.chatTitleOverride || "",
                onChange: (e) => updateTheme({ chatTitleOverride: e.target.value }),
                placeholder: `顶栏备注名（留空默认显示：${contact.name}）`,
                style: { padding: "8px 10px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12.5px" }
              }),
              h(
                "label",
                { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#3F4536" } },
                h("input", { type: "checkbox", checked: Boolean(theme.showStatusBar), onChange: (e) => updateTheme({ showStatusBar: e.target.checked }) }),
                "显示顶部仿真手机时间/电量栏"
              ),
              theme.showStatusBar &&
                h(
                  "div",
                  { style: { display: "flex", gap: "8px" } },
                  h("input", { value: theme.fakeTime || "", onChange: (e) => updateTheme({ fakeTime: e.target.value }), placeholder: "时间如 23:42", style: { flex: 1, padding: "7px 9px", borderRadius: "9px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12px" } }),
                  h("input", { value: theme.fakeBattery || "", onChange: (e) => updateTheme({ fakeBattery: e.target.value }), placeholder: "电量如 18%", style: { flex: 1, padding: "7px 9px", borderRadius: "9px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12px" } })
                )
            ),
            h(
              "button",
              {
                type: "button",
                onClick: async () => {
                  if (!window.confirm("确定清空当前存档槽内的全部剧本内容吗？")) return;
                  for (const m of messages) {
                    if (m.imageRef) await pfMediaStore.delete(m.imageRef);
                  }
                  await persistMessages([]);
                  setShowSettings(false);
                },
                style: { padding: "9px", borderRadius: "12px", border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }
              },
              "清空当前剧本"
            )
          )
        ),

      // 弹窗 4：单条气泡编辑 / 换边 / 上下移 / 删除
      editingMsg &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 13900, background: "rgba(32,36,30,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setEditingMsg(null); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "350px", background: "#F9F7F5", borderRadius: "18px", padding: "15px", display: "flex", flexDirection: "column", gap: "10px" } },
            h("div", { style: { fontSize: "14px", fontWeight: 700, color: "#3F4536" } }, "✎ 编辑该条消息"),
            editingMsg.msg.kind !== "image" &&
              h("textarea", {
                value: editingMsg.msg.text || "",
                onChange: (e) => setEditingMsg((prev) => ({ ...prev, msg: { ...prev.msg, text: e.target.value } })),
                rows: 3,
                style: { padding: "8px 10px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "13px", resize: "none", fontFamily: "inherit" }
              }),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: async () => {
                    const nextSide = editingMsg.msg.side === "right" ? "left" : "right";
                    const next = messages.map((m, i) =>
                      i === editingMsg.idx
                        ? {
                            ...editingMsg.msg,
                            side: nextSide,
                            speakerName: nextSide === "right" ? rightInfo.name : (leftSpeaker?.name || contact.name),
                            speakerAvatarRef: nextSide === "right" ? (rightInfo.avatarRef || "") : (leftSpeaker?.avatarRef || "")
                          }
                        : m
                    );
                    await persistMessages(next);
                    setEditingMsg(null);
                  },
                  style: { border: "1px solid #D8DFD2", background: "#FFFFFF", color: "#4A5A50", fontSize: "12px", padding: "5px 10px", borderRadius: "8px", cursor: "pointer" }
                },
                "⇄ 左右换边"
              ),
              editingMsg.idx > 0 &&
                h(
                  "button",
                  {
                    type: "button",
                    onClick: async () => {
                      const arr = [...messages];
                      const tmp = arr[editingMsg.idx];
                      arr[editingMsg.idx] = arr[editingMsg.idx - 1];
                      arr[editingMsg.idx - 1] = tmp;
                      await persistMessages(arr);
                      setEditingMsg(null);
                    },
                    style: { border: "1px solid #D8DFD2", background: "#FFFFFF", color: "#4A5A50", fontSize: "12px", padding: "5px 10px", borderRadius: "8px", cursor: "pointer" }
                  },
                  "↑ 上移"
                ),
              editingMsg.idx < messages.length - 1 &&
                h(
                  "button",
                  {
                    type: "button",
                    onClick: async () => {
                      const arr = [...messages];
                      const tmp = arr[editingMsg.idx];
                      arr[editingMsg.idx] = arr[editingMsg.idx + 1];
                      arr[editingMsg.idx + 1] = tmp;
                      await persistMessages(arr);
                      setEditingMsg(null);
                    },
                    style: { border: "1px solid #D8DFD2", background: "#FFFFFF", color: "#4A5A50", fontSize: "12px", padding: "5px 10px", borderRadius: "8px", cursor: "pointer" }
                  },
                  "↓ 下移"
                ),
              editingMsg.msg.kind === "image" &&
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setLightboxSrc(pfMediaStore.resolveSync(editingMsg.msg.imageRef));
                      setEditingMsg(null);
                    },
                    style: { border: "1px solid #D8DFD2", background: "#FFFFFF", color: "#4A5A50", fontSize: "12px", padding: "5px 10px", borderRadius: "8px", cursor: "pointer" }
                  },
                  "🔍 查看大图"
                )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: async () => {
                    if (editingMsg.msg.imageRef) await pfMediaStore.delete(editingMsg.msg.imageRef);
                    await persistMessages(messages.filter((_, i) => i !== editingMsg.idx));
                    setEditingMsg(null);
                  },
                  style: { padding: "8px 12px", borderRadius: "10px", border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "12.5px", cursor: "pointer" }
                },
                "删除"
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: async () => {
                    const next = messages.map((m, i) => (i === editingMsg.idx ? editingMsg.msg : m));
                    await persistMessages(next);
                    setEditingMsg(null);
                  },
                  style: { flex: 1, padding: "8px", borderRadius: "10px", border: "none", background: "#8FA99D", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, cursor: "pointer" }
                },
                "保存修改"
              )
            )
          )
        ),

      // P1：长图导出预览弹窗（支持手机长按保存）
      exportPreviewUrl &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 14400, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", gap: "10px" },
            onClick: (e) => { if (e.target === e.currentTarget) setExportPreviewUrl(""); }
          },
          h("div", { style: { color: "#FFFFFF", fontSize: "13px", fontWeight: 600 } }, "📸 高清长图已生成（PC 已自动下载，手机端可直接长按图片保存）"),
          h(
            "div",
            { style: { maxHeight: "76vh", overflowY: "auto", borderRadius: "12px", boxShadow: "0 12px 36px rgba(0,0,0,0.45)" } },
            h("img", { src: exportPreviewUrl, style: { maxWidth: "90vw", width: "340px", display: "block" } })
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => setExportPreviewUrl(""),
              style: { border: "none", borderRadius: "999px", padding: "7px 22px", background: "#FFFFFF", color: "#333", fontSize: "13px", fontWeight: 700, cursor: "pointer" }
            },
            "关闭预览"
          )
        ),

      // 图片全屏预览灯箱
      lightboxSrc &&
        h(
          "div",
          {
            onClick: () => setLightboxSrc(""),
            style: { position: "fixed", inset: 0, zIndex: 14500, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", cursor: "zoom-out" }
          },
          h("img", { src: lightboxSrc, style: { maxWidth: "96%", maxHeight: "90vh", borderRadius: "10px" } })
        )
    );
  };

  // ==========================================
  // 6. 组件 C：绣衣楼消息列表接管（星标自动置顶 + 群聊聚合）
  // ==========================================
  const T11PhoneFictionMessageHub = ({ onBack, directChatChar, onClearDirectChatChar, onReplayGuide }) => {
    const h = React.createElement;
    const [roster, setRoster] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const [search, setSearch] = React.useState("");
    const [activeContact, setActiveContact] = React.useState(null);
    const [previewMap, setPreviewMap] = React.useState({});

    const reload = async () => {
      const [list, groupList] = await Promise.all([
        xiuyiRosterStore.getRoster(),
        xiuyiGroupStore.getGroups()
      ]);
      setRoster(list || []);
      setGroups(groupList || []);
      const previews = {};
      const allEntries = [...(groupList || []), ...(list || [])];
      for (const c of allEntries) {
        const saved = await idbGetKV(phoneFictionStore._scriptKey(c.id));
        if (Array.isArray(saved) && saved.length > 0) {
          const last = saved[saved.length - 1];
          previews[c.id] = {
            text: last.kind === "image" ? "[图片]" : last.text || "…",
            time: last.time || "",
            count: saved.length
          };
        }
      }
      setPreviewMap(previews);
      if (directChatChar) {
        const matched = (list || []).find((c) => c.name === directChatChar || c.origName === directChatChar);
        if (matched) setActiveContact(matched);
      }
    };

    React.useEffect(() => {
      reload();
      const handler = () => reload();
      global.addEventListener(ROSTER_EVENT, handler);
      return () => global.removeEventListener(ROSTER_EVENT, handler);
    }, [directChatChar]);

    // 合并星标、群聊与普通联系人：★ 星标置顶 > 群聊 / 已有剧本 > 普通角色
    const combined = [...groups, ...roster];
    const sorted = [...combined].sort((a, b) => {
      const sa = a.isStarred ? 1 : 0;
      const sb = b.isStarred ? 1 : 0;
      if (sa !== sb) return sb - sa;
      const ga = a.isGroup ? 1 : 0;
      const gb = b.isGroup ? 1 : 0;
      const ca = previewMap[a.id]?.count || 0;
      const cb = previewMap[b.id]?.count || 0;
      const scoreA = (ca > 0 ? 2 : 0) + ga;
      const scoreB = (cb > 0 ? 2 : 0) + gb;
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (ca !== cb) return cb - ca;
      return 0;
    });

    const filtered = sorted.filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return String(c.name || "").toLowerCase().includes(q) || String(c.title || "").toLowerCase().includes(q);
    });

    return h(
      "div",
      {
        style: {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#F9F7F5",
          zIndex: activeContact ? 300 : 20,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      h(
        "div",
        { className: "t11-nav", "data-fr-t11-msg": "step1", style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center" } },
          h("div", { className: "back-btn", onClick: onBack }, h("i", { className: "ph ph-caret-left", style: { fontSize: "24px" } })),
          h("div", { className: "title" }, "消息 · 捡手机剧场")
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", marginRight: "14px" } },
          h("span", { style: { fontSize: "11.5px", color: "#8FA99D", fontWeight: 600 } }, `${roster.length} 人${groups.length ? ` · ${groups.length} 群` : ""}`),
          onReplayGuide &&
            h(
              "button",
              {
                type: "button",
                onClick: onReplayGuide,
                style: { border: "1px solid rgba(214,114,75,0.25)", background: "#FFFFFF", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer", fontSize: "12px" }
              },
              "💗"
            )
        )
      ),
      h(
        "div",
        { style: { padding: "10px 16px 6px", flexShrink: 0 } },
        h("input", {
          value: search,
          onChange: (e) => setSearch(e.target.value),
          placeholder: "搜索星标心腹 / 群聊 / 楼内角色…",
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 12px",
            borderRadius: "12px",
            border: "1px solid #E5E0D5",
            background: "#FFFFFF",
            fontSize: "13px",
            color: "#3F4536",
            outline: "none"
          }
        })
      ),
      h(
        "div",
        {
          "data-fr-t11-msg": "step2",
          className: "t11-subpage-container no-scrollbar",
          style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 16px 96px", boxSizing: "border-box" }
        },
        filtered.map((c) => {
          const av = !c.isGroup ? pfMediaStore.resolveSync(c.avatarRef) : "";
          const pv = previewMap[c.id];
          return h(
            "div",
            {
              key: c.id,
              onClick: () => setActiveContact(c),
              style: {
                background: c.isStarred ? "linear-gradient(135deg, #FFFDF7 0%, #FFF8EA 100%)" : "#FFFFFF",
                border: c.isStarred ? "1px solid #F0DFB8" : "1px solid transparent",
                borderRadius: "16px",
                padding: "12px 14px",
                marginBottom: "10px",
                boxShadow: "0 3px 12px rgba(140, 145, 123, 0.07)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer"
              }
            },
            h(
              "div",
              {
                style: {
                  width: "46px",
                  height: "46px",
                  borderRadius: c.isGroup ? "14px" : "50%",
                  overflow: "hidden",
                  border: c.isStarred ? "2px solid #E5A93B" : "2px solid #A8C8BA",
                  background: c.isGroup
                    ? c.color || "#9FBCD0"
                    : c.isBuiltin
                    ? "linear-gradient(135deg, #E8C3A8 0%, #D4B298 100%)"
                    : "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontSize: "17px",
                  fontWeight: 700,
                  flexShrink: 0
                }
              },
              c.isGroup
                ? h("i", { className: "ph ph-users-three", style: { fontSize: "22px" } })
                : av
                ? h("img", { src: av, alt: c.name, style: { width: "100%", height: "100%", objectFit: "cover" } })
                : String(c.name || "?").slice(0, 1)
            ),
            h(
              "div",
              { style: { flex: 1, minWidth: 0 } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px", gap: "6px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "5px", minWidth: 0, flexWrap: "wrap" } },
                  h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, c.name),
                  c.isStarred &&
                    h(
                      "span",
                      { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#FFF1CE", color: "#C88412", fontWeight: 700 } },
                      "★ 星标"
                    ),
                  c.isGroup &&
                    h(
                      "span",
                      { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#EBF2F7", color: "#4D738E", fontWeight: 600 } },
                      `群聊 · ${(c.memberIds || []).length}人`
                    ),
                  pv &&
                    h(
                      "span",
                      { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#EEF6F2", color: "#4E7866" } },
                      `${pv.count} 条`
                    )
                ),
                h("span", { style: { fontSize: "11px", color: "#A8ACB0", flexShrink: 0 } }, pv?.time || "新建剧本")
              ),
              h(
                "div",
                { style: { fontSize: "12.5px", color: pv ? "#5A5F4D" : "#9AA190", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                pv ? pv.text : c.isGroup ? "点击进入群聊捡手机剧本间" : (c.bio || "点击进入捡手机文学生成器")
              )
            )
          );
        })
      ),
      activeContact &&
        h(PhoneFictionStudioPage, {
          contact: activeContact,
          onBack: () => {
            setActiveContact(null);
            if (onClearDirectChatChar) onClearDirectChatChar();
          }
        })
    );
  };

  // ==========================================
  // 7. 组件 D：通讯录 → 星标联系人专页（一键进捡手机 / 取消星标）
  // ==========================================
  const T11StarredContactsPage = ({ onBack }) => {
    const h = React.createElement;
    const [starred, setStarred] = React.useState([]);
    const [activeContact, setActiveContact] = React.useState(null);

    const reload = async () => {
      const [chars, groups] = await Promise.all([
        xiuyiRosterStore.getStarredRoster(),
        xiuyiGroupStore.getGroups()
      ]);
      const starredGroups = (groups || []).filter((g) => g && g.isStarred);
      setStarred([...starredGroups, ...(chars || [])]);
    };

    React.useEffect(() => {
      reload();
      const handler = () => reload();
      global.addEventListener(ROSTER_EVENT, handler);
      return () => global.removeEventListener(ROSTER_EVENT, handler);
    }, []);

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#F9F7F5",
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      h(
        "div",
        { className: "t11-nav", style: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("div", { onClick: onBack, style: { cursor: "pointer", padding: "4px", color: "#4A4F55" } }, h("i", { className: "ph ph-caret-left", style: { fontSize: "24px" } })),
          h("span", { style: { fontSize: "16.5px", fontWeight: 700, color: "#3F4536" } }, `★ 星标联系人（${starred.length}）`)
        ),
        h("span", { style: { fontSize: "11px", color: "#C88412" } }, "消息页自动置顶")
      ),
      h(
        "div",
        { className: "no-scrollbar", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px 36px", display: "flex", flexDirection: "column", gap: "10px" } },
        starred.length === 0
          ? h(
              "div",
              { style: { padding: "56px 20px", textAlign: "center", color: "#9AA190", fontSize: "13px", lineHeight: 1.7 } },
              h("div", { style: { fontSize: "34px", marginBottom: "8px", color: "#E5C178" } }, "☆"),
              "暂无星标联系人",
              h("br"),
              "前往「楼内联系人」点击任意角色右侧的星星 ☆，即可将其置顶到消息列表最上方。"
            )
          : starred.map((c) => {
              const av = !c.isGroup ? pfMediaStore.resolveSync(c.avatarRef) : "";
              return h(
                "div",
                {
                  key: c.id,
                  onClick: () => setActiveContact(c),
                  style: {
                    background: "linear-gradient(135deg, #FFFDF7 0%, #FFF8EA 100%)",
                    border: "1px solid #F0DFB8",
                    borderRadius: "15px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    cursor: "pointer"
                  }
                },
                h(
                  "div",
                  {
                    style: {
                      width: "44px",
                      height: "44px",
                      borderRadius: c.isGroup ? "12px" : "50%",
                      overflow: "hidden",
                      border: "2px solid #E5A93B",
                      background: c.isGroup ? (c.color || "#9FBCD0") : "linear-gradient(135deg, #E8C3A8 0%, #D4B298 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      fontSize: "16px",
                      fontWeight: 700,
                      flexShrink: 0
                    }
                  },
                  c.isGroup
                    ? h("i", { className: "ph ph-users-three", style: { fontSize: "20px" } })
                    : av
                    ? h("img", { src: av, style: { width: "100%", height: "100%", objectFit: "cover" } })
                    : String(c.name || "?").slice(0, 1)
                ),
                h(
                  "div",
                  { style: { flex: 1, minWidth: 0 } },
                  h("div", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, c.name),
                  h("div", { style: { fontSize: "12px", color: "#8A7D65", marginTop: "2px" } }, c.isGroup ? `群聊 · ${(c.memberIds || []).length}人` : (c.bio || "点击进入捡手机剧场"))
                ),
                h(
                  "button",
                  {
                    type: "button",
                    title: "取消星标",
                    onClick: async (e) => {
                      e.stopPropagation();
                      if (c.isGroup) await xiuyiGroupStore.toggleStarGroup(c.id);
                      else await xiuyiRosterStore.toggleStar(c.id);
                      await reload();
                    },
                    style: { border: "none", background: "#FFF1CE", color: "#D9941E", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", cursor: "pointer" }
                  },
                  "★"
                )
              );
            })
      ),
      activeContact &&
        h(PhoneFictionStudioPage, {
          contact: activeContact,
          onBack: () => setActiveContact(null)
        })
    );
  };

  // ==========================================
  // 8. 组件 E：通讯录 → 我的群组（群聊捡手机剧本间）
  // ==========================================
  const T11GroupChatsPage = ({ onBack }) => {
    const h = React.createElement;
    const [groups, setGroups] = React.useState([]);
    const [roster, setRoster] = React.useState([]);
    const [activeGroup, setActiveGroup] = React.useState(null);
    const [editingGroup, setEditingGroup] = React.useState(null); // null | { isNew: true } | group
    const [gName, setGName] = React.useState("");
    const [gColor, setGColor] = React.useState(GROUP_COLORS[0]);
    const [gMembers, setGMembers] = React.useState([]);
    const [memberSearch, setMemberSearch] = React.useState("");

    const reload = async () => {
      const [gList, rList] = await Promise.all([
        xiuyiGroupStore.getGroups(),
        xiuyiRosterStore.getRoster()
      ]);
      setGroups(gList || []);
      setRoster(rList || []);
    };

    React.useEffect(() => {
      reload();
      const handler = () => reload();
      global.addEventListener(ROSTER_EVENT, handler);
      return () => global.removeEventListener(ROSTER_EVENT, handler);
    }, []);

    const openEditor = (group) => {
      if (group) {
        setEditingGroup(group);
        setGName(group.name || "");
        setGColor(group.color || GROUP_COLORS[0]);
        setGMembers(Array.isArray(group.memberIds) ? [...group.memberIds] : []);
      } else {
        setEditingGroup({ isNew: true });
        setGName("");
        setGColor(GROUP_COLORS[0]);
        setGMembers([]);
      }
      setMemberSearch("");
    };

    const toggleMember = (id) => {
      setGMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleSaveGroup = async () => {
      if (!gName.trim()) {
        alert("请填写群聊名称（如：背着傅融建的小群）");
        return;
      }
      if (gMembers.length < 2) {
        alert("群聊至少需要勾选 2 位楼内成员");
        return;
      }
      if (editingGroup?.isNew) {
        await xiuyiGroupStore.createGroup({ name: gName, memberIds: gMembers, color: gColor });
      } else {
        await xiuyiGroupStore.updateGroup(editingGroup.id, { name: gName.trim(), memberIds: gMembers, color: gColor });
      }
      setEditingGroup(null);
      await reload();
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#F9F7F5",
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      h(
        "div",
        { className: "t11-nav", style: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("div", { onClick: onBack, style: { cursor: "pointer", padding: "4px", color: "#4A4F55" } }, h("i", { className: "ph ph-caret-left", style: { fontSize: "24px" } })),
          h("span", { style: { fontSize: "16.5px", fontWeight: 700, color: "#3F4536" } }, `我的群组（${groups.length}）`)
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => openEditor(null),
            style: {
              border: "none",
              background: "linear-gradient(135deg, #9FBCD0 0%, #7C9EB5 100%)",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: 700,
              padding: "5px 12px",
              borderRadius: "999px",
              cursor: "pointer"
            }
          },
          "+ 新建群聊"
        )
      ),
      h(
        "div",
        { className: "no-scrollbar", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px 36px", display: "flex", flexDirection: "column", gap: "10px" } },
        groups.length === 0
          ? h(
              "div",
              { style: { padding: "56px 20px", textAlign: "center", color: "#9AA190", fontSize: "13px", lineHeight: 1.75 } },
              h("div", { style: { fontSize: "34px", marginBottom: "8px" } }, "💬"),
              "还没有创建群聊剧本间",
              h("br"),
              "点击右上角「+ 新建群聊」，拉几位密探建个小群（如《背着傅融建的小群》），即可畅写多人群聊捡手机文学！"
            )
          : groups.map((g) => {
              const mNames = (g.memberIds || [])
                .map((id) => roster.find((r) => r.id === id)?.name)
                .filter(Boolean);
              return h(
                "div",
                {
                  key: g.id,
                  onClick: () => setActiveGroup(g),
                  style: {
                    background: "#FFFFFF",
                    border: "1px solid #ECE7DE",
                    borderRadius: "16px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    cursor: "pointer"
                  }
                },
                h(
                  "div",
                  {
                    style: {
                      width: "46px",
                      height: "46px",
                      borderRadius: "14px",
                      background: g.color || "#9FBCD0",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }
                  },
                  h("i", { className: "ph ph-users-three", style: { fontSize: "22px" } })
                ),
                h(
                  "div",
                  { style: { flex: 1, minWidth: 0 } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, g.name),
                    h("span", { style: { fontSize: "11px", color: "#6A87A1" } }, `(${mNames.length}人)`)
                  ),
                  h(
                    "div",
                    { style: { fontSize: "12px", color: "#8C9183", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                    mNames.join("、") || "点击编辑群成员"
                  )
                ),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "4px" }, onClick: (e) => e.stopPropagation() },
                  h(
                    "button",
                    {
                      type: "button",
                      title: g.isStarred ? "取消星标置顶" : "星标置顶到消息页",
                      onClick: async () => {
                        await xiuyiGroupStore.toggleStarGroup(g.id);
                        await reload();
                      },
                      style: { border: "none", background: g.isStarred ? "#FFF6E0" : "transparent", color: g.isStarred ? "#E5A93B" : "#C5C8BE", width: "28px", height: "28px", borderRadius: "50%", fontSize: "16px", cursor: "pointer" }
                    },
                    g.isStarred ? "★" : "☆"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      title: "编辑群聊",
                      onClick: () => openEditor(g),
                      style: { border: "none", background: "#F5F2EC", color: "#5a5f4d", width: "28px", height: "28px", borderRadius: "8px", cursor: "pointer" }
                    },
                    h("i", { className: "ph ph-pencil-simple", style: { fontSize: "14px" } })
                  )
                )
              );
            })
      ),

      // 新建/编辑群聊弹窗
      editingGroup &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 13500, background: "rgba(38,42,34,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setEditingGroup(null); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "380px", maxHeight: "84vh", background: "#F9F7F5", borderRadius: "20px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, editingGroup.isNew ? "✦ 新建群聊剧本间" : "✎ 编辑群聊"),
              h("button", { type: "button", onClick: () => setEditingGroup(null), style: { border: "none", background: "#ECE8DF", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" } }, "✕")
            ),
            h("input", {
              value: gName,
              onChange: (e) => setGName(e.target.value),
              placeholder: "群聊名称（如：背着傅融建的小群）",
              style: { padding: "9px 11px", borderRadius: "10px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "13.5px" }
            }),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h("span", { style: { fontSize: "12px", color: "#7A826F" } }, "群头像色："),
              GROUP_COLORS.map((col) =>
                h("button", {
                  key: col,
                  type: "button",
                  onClick: () => setGColor(col),
                  style: { width: "22px", height: "22px", borderRadius: "50%", background: col, border: gColor === col ? "2.5px solid #3F4536" : "1px solid #DDD", cursor: "pointer" }
                })
              )
            ),
            h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#5a5f4d" } }, `勾选群成员（已选 ${gMembers.length} 人，至少 2 人）：`),
            h("input", {
              value: memberSearch,
              onChange: (e) => setMemberSearch(e.target.value),
              placeholder: "搜索楼内成员…",
              style: { padding: "7px 10px", borderRadius: "9px", border: "1px solid #DDD8CE", background: "#FFFFFF", fontSize: "12.5px" }
            }),
            h(
              "div",
              { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: "6px", padding: "2px 0" } },
              roster
                .filter((c) => !memberSearch.trim() || String(c.name || "").toLowerCase().includes(memberSearch.trim().toLowerCase()))
                .map((c) => {
                  const sel = gMembers.includes(c.id);
                  return h(
                    "button",
                    {
                      key: c.id,
                      type: "button",
                      onClick: () => toggleMember(c.id),
                      style: {
                        border: sel ? "1.5px solid #6A87A1" : "1px solid #E2DDD2",
                        background: sel ? "#EBF2F7" : "#FFFFFF",
                        color: sel ? "#3B5B76" : "#5a5f4d",
                        fontWeight: sel ? 700 : 500,
                        fontSize: "12px",
                        padding: "5px 10px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    sel ? `✓ ${c.name}` : c.name
                  );
                })
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px", paddingTop: "4px" } },
              !editingGroup.isNew &&
                h(
                  "button",
                  {
                    type: "button",
                    onClick: async () => {
                      if (!window.confirm(`确定删除群聊《${editingGroup.name}》吗？`)) return;
                      await xiuyiGroupStore.deleteGroup(editingGroup.id);
                      setEditingGroup(null);
                      await reload();
                    },
                    style: { padding: "9px 12px", borderRadius: "12px", border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", fontSize: "12.5px", cursor: "pointer" }
                  },
                  "删除"
                ),
              h(
                "button",
                {
                  type: "button",
                  onClick: handleSaveGroup,
                  style: { flex: 1, padding: "9px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #9FBCD0 0%, #7C9EB5 100%)", color: "#FFFFFF", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }
                },
                "保存群聊"
              )
            )
          )
        ),

      activeGroup &&
        h(PhoneFictionStudioPage, {
          contact: activeGroup,
          onBack: () => setActiveGroup(null)
        })
    );
  };

  global.pfMediaStore = pfMediaStore;
  global.xiuyiRosterStore = xiuyiRosterStore;
  global.xiuyiGroupStore = xiuyiGroupStore;
  global.phoneFictionStore = phoneFictionStore;
  global.T11InsideContactsManager = T11InsideContactsManager;
  global.T11StarredContactsPage = T11StarredContactsPage;
  global.T11GroupChatsPage = T11GroupChatsPage;
  global.PhoneFictionStudioPage = PhoneFictionStudioPage;
  global.T11PhoneFictionMessageHub = T11PhoneFictionMessageHub;
})(typeof window !== "undefined" ? window : globalThis);
