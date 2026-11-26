/**
 * Milvus/chat_autonomy_p1_engine.js (v1.0)
 * 传讯私聊 · AI「活人感」P1 进阶自主权力 + 自主权力总控台（独立模块化引擎）
 * - 零膨胀 app.min.js（仅 4 处极简埋点），严格仅在私聊生效，零干扰群聊
 * - 四大 P1 能力：
 *   1. 自主改名 / 改个性签名 / 改你的专属备注（[修改名字:...] / [修改签名:...] / [修改我的备注:...]）
 *   2. 后台偷偷留痕：[私密搜索:词条]（静默写入傩·云镜 t8_nuo_browser，不剧透）+ [赞朋友圈] / [评朋友圈:内容]
 *   3. 轻度情绪边界（默认关闭，用户按角色自愿开启）：[退回红包]（防刷钱校验）+ [暂避冷静:分钟|理由]（2~10 分钟 + 递台阶秒解横幅）
 *   4. AiAutonomyControlCard（对话偏好设置 · AI 自主权力总控台，统一管控 P0 + P1 全部 7 项权力）
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_CHAT_AUTONOMY_P1_LOADED__) return;
  global.__MILVUS_CHAT_AUTONOMY_P1_LOADED__ = true;

  const COOLDOWN_DB = "milvus_ai_autonomy_p1_idb";
  const COOLDOWN_STORE = "cooldowns";
  let _cdDbPromise = null;
  const _cooldownCache = new Map(); // charId -> { charId, untilTs, reason }

  function getPrefs(charId) {
    const p0 = global.ChatAutonomyP0Engine;
    if (p0 && typeof p0.getPrefsSync === "function") {
      return p0.getPrefsSync(charId);
    }
    return {
      enableQuote: true,
      enableCalendarWrite: true,
      enableSecretWish: true,
      enableRecallCombo: true,
      enableProfileEdit: true,
      enableSilentTrace: true,
      enableTemperBoundary: false
    };
  }

  async function hydratePrefs(charId) {
    const p0 = global.ChatAutonomyP0Engine;
    if (p0 && typeof p0.hydratePrefs === "function") {
      return p0.hydratePrefs(charId);
    }
    return getPrefs(charId);
  }

  async function savePrefs(charId, patch) {
    const p0 = global.ChatAutonomyP0Engine;
    if (p0 && typeof p0.savePrefs === "function") {
      return p0.savePrefs(charId, patch);
    }
    return { ...getPrefs(charId), ...(patch || {}) };
  }

  // ==========================================
  // 1. 冷静期独立 IDB 持久化
  // ==========================================
  function openCooldownDB() {
    if (_cdDbPromise) return _cdDbPromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    _cdDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(COOLDOWN_DB, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(COOLDOWN_STORE)) {
            db.createObjectStore(COOLDOWN_STORE, { keyPath: "charId" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return _cdDbPromise;
  }

  function emitCooldownChanged(charId) {
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-autonomy-cooldown-changed", { detail: { charId: String(charId || "") } }));
      }
    } catch (_) {}
  }

  async function setCooldown(charId, minutes, reason) {
    const key = String(charId || "").trim();
    if (!key) return null;
    const clampedMin = Math.max(2, Math.min(10, Math.round(Number(minutes) || 3)));
    const rec = {
      charId: key,
      untilTs: Date.now() + clampedMin * 60 * 1000,
      reason: String(reason || "先静一静").trim().slice(0, 40)
    };
    _cooldownCache.set(key, rec);
    const db = await openCooldownDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction([COOLDOWN_STORE], "readwrite");
          tx.objectStore(COOLDOWN_STORE).put(rec);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) {
          resolve();
        }
      });
    }
    emitCooldownChanged(key);
    return rec;
  }

  async function clearCooldown(charId) {
    const key = String(charId || "").trim();
    if (!key) return;
    _cooldownCache.delete(key);
    const db = await openCooldownDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction([COOLDOWN_STORE], "readwrite");
          tx.objectStore(COOLDOWN_STORE).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) {
          resolve();
        }
      });
    }
    emitCooldownChanged(key);
  }

  async function getActiveCooldown(charId) {
    const key = String(charId || "").trim();
    if (!key) return null;
    let rec = _cooldownCache.get(key) || null;
    if (!rec) {
      const db = await openCooldownDB();
      if (db) {
        rec = await new Promise((resolve) => {
          try {
            const tx = db.transaction([COOLDOWN_STORE], "readonly");
            const req = tx.objectStore(COOLDOWN_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
        if (rec) _cooldownCache.set(key, rec);
      }
    }
    if (!rec || !rec.untilTs || rec.untilTs <= Date.now()) {
      if (rec) _cooldownCache.delete(key);
      return null;
    }
    return rec;
  }

  // ==========================================
  // 2. Prompt 指令块构建（按开关动态下发）
  // ==========================================
  function buildPromptBlock(chatData) {
    const cid = chatData && chatData.id;
    const prefs = getPrefs(cid);
    const lines = [];

    if (prefs.enableProfileEdit) {
      lines.push(
        "10. 自主改名/改签名/改备注：若对方让你换名字或你心境有重大变化，可在句末附带 [修改名字:新名字]（修改你自己的显示名）、[修改签名:新个性签名] 或 [修改我的备注:对对方的新爱称]。仅在合适契机使用，切勿频繁乱改。"
      );
    }
    if (prefs.enableSilentTrace) {
      lines.push(
        "11. 后台偷偷留痕：若对方提到想吃的东西、身体不适或陌生话题，你可在句末悄悄加 [私密搜索:搜索词]（会静默记录在你的傩·云镜浏览器里，聊天不显示）；若想顺手互动对方最近的朋友圈，可加 [赞朋友圈] 或 [评朋友圈:简短评论]。"
      );
    }
    if (prefs.enableTemperBoundary) {
      lines.push(
        "12. 真实脾气边界：若对方刚给你发了红包但你正在生气/人设清高不愿收，可输出 [退回红包:理由] 原路退回；若被严重惹怒想先静一静，可输出 [暂避冷静:3|简短理由]（2~10分钟短时冷静期，对方递台阶即可和好）。"
      );
    }

    return lines.length > 0 ? lines.join("\n") + "\n" : "";
  }

  // ==========================================
  // 3. 后台留痕写入器：傩·云镜 & 朋友圈 & 退回红包
  // ==========================================
  async function writeBrowserSecretSearch({ charId, charName, query }) {
    const q = String(query || "").trim().slice(0, 60);
    if (!q || typeof indexedDB === "undefined") return false;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("t8_nuo_browser");
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          try {
            if (!db.objectStoreNames.contains("char_records")) {
              db.close();
              resolve(false);
              return;
            }
            const charKey = String(charName || charId || "名士");
            const tx = db.transaction(["char_records"], "readwrite");
            const store = tx.objectStore("char_records");
            const getReq = store.get(charKey);
            getReq.onsuccess = () => {
              const existing = getReq.result;
              const prevList = Array.isArray(existing && existing.records)
                ? existing.records
                : Array.isArray(existing && existing.list)
                  ? existing.list
                  : [];
              if (prevList.some((r) => r && r.query === q)) {
                resolve(true);
                return;
              }
              const newRec = {
                query: q,
                searchTime: "刚刚",
                pageTitle: `关于「${q}」的私密检索`,
                sourceSite: "傩·云镜 · 私密足迹",
                snapshotSnippet: `与主公传讯后悄悄查了一番「${q}」，记下要点以备不时之需。`,
                privateNote: `刚听主公提起「${q}」，顺手查了一下，别让主公发现。`,
                createdAt: Date.now(),
                source: "chat_autonomy_p1"
              };
              const nextRec = existing && typeof existing === "object"
                ? { ...existing, charKey, records: [newRec, ...prevList].slice(0, 30), updatedAt: Date.now() }
                : { charKey, records: [newRec], updatedAt: Date.now() };
              store.put(nextRec);
            };
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => { db.close(); resolve(false); };
          } catch (_) {
            try { db.close(); } catch (__) {}
            resolve(false);
          }
        };
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function interactWithLatestUserMoment({ charName, userName, action, commentText }) {
    const readMoments = async () => {
      try {
        if (typeof global.openDB === "function" && global.STORES && global.STORES.CHAT_CHARACTERS) {
          const db = await global.openDB();
          const saved = await new Promise((resolve) => {
            try {
              const tx = db.transaction(global.STORES.CHAT_CHARACTERS, "readonly");
              const req = tx.objectStore(global.STORES.CHAT_CHARACTERS).get("moments_data");
              req.onsuccess = () => resolve(req.result ? req.result.data : null);
              req.onerror = () => resolve(null);
            } catch (_) {
              resolve(null);
            }
          });
          if (Array.isArray(saved) && saved.length > 0) return saved;
        }
      } catch (_) {}
      try {
        const raw = global.localStorage && global.localStorage.getItem("t8_moments");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (_) {}
      return [];
    };

    const writeMoments = async (list) => {
      try {
        if (typeof global.openDB === "function" && global.STORES && global.STORES.CHAT_CHARACTERS) {
          const db = await global.openDB();
          await new Promise((resolve) => {
            try {
              const tx = db.transaction(global.STORES.CHAT_CHARACTERS, "readwrite");
              tx.objectStore(global.STORES.CHAT_CHARACTERS).put({ id: "moments_data", data: list });
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch (_) {
              resolve();
            }
          });
        }
      } catch (_) {}
      try {
        if (typeof global.saveMomentsToLocalStorageSafe === "function") {
          global.saveMomentsToLocalStorageSafe(list);
        }
      } catch (_) {}
    };

    const moments = await readMoments();
    if (!Array.isArray(moments) || moments.length === 0) return { ok: false };

    const targetIdx = moments.findIndex(
      (m) => m && (m.isMe || m.isUser || m.author === "我" || (userName && m.author === userName) || (m.char && m.char.isMe))
    );
    if (targetIdx === -1) return { ok: false };

    const target = { ...moments[targetIdx] };
    let mutated = false;

    if (action === "like") {
      const likes = Array.isArray(target.likes) ? [...target.likes] : [];
      if (!likes.includes(charName)) {
        likes.push(charName);
        target.likes = likes;
        mutated = true;
      }
    } else if (action === "comment" && commentText) {
      const comments = Array.isArray(target.comments) ? [...target.comments] : [];
      const cleanC = String(commentText).trim().slice(0, 80);
      if (cleanC && !comments.some((c) => c && c.author === charName && c.text === cleanC)) {
        comments.push({
          id: `mc_ai_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          author: charName,
          text: cleanC,
          time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
        });
        target.comments = comments;
        mutated = true;
      }
    }

    if (!mutated) return { ok: false, duplicated: true };
    const nextList = [...moments];
    nextList[targetIdx] = target;
    await writeMoments(nextList);
    return { ok: true };
  }

  function refundLatestUserRedPacket(recentMessages, charName) {
    if (!Array.isArray(recentMessages) || recentMessages.length === 0) return null;
    const recent6 = recentMessages.slice(-6).reverse();
    const target = recent6.find((m) => m && m.isMe && m.type === "red_packet" && !m.returned && m.status !== "refunded");
    if (!target) return null;

    const amount = Number(target.amount || (target.redPacket && target.redPacket.amount) || 0);
    target.returned = true;
    target.status = "refunded";

    if (amount > 0) {
      try {
        if (global.localStorage) {
          const curCoins = parseFloat(global.localStorage.getItem("user_coins") || "0") || 0;
          global.localStorage.setItem("user_coins", String(curCoins + amount));
        }
      } catch (_) {}
      try {
        if (typeof global.addTransactionRecord === "function") {
          global.addTransactionRecord("income", amount, `${charName || "名士"}退回五铢钱红包`);
        }
      } catch (_) {}
    }

    return { amount, msgId: target.id };
  }

  // ==========================================
  // 4. 私聊回复统一 P1 后处理入口
  // ==========================================
  const RE_SELF_NAME = /[\[【]\s*(?:修改名字|改名|修改我的名字)\s*[:：]\s*([^\]】]{1,20})[\]】]/g;
  const RE_SIGNATURE = /[\[【]\s*(?:修改签名|更新签名|个性签名)\s*[:：]\s*([^\]】]{2,50})[\]】]/g;
  const RE_USER_REMARK = /[\[【]\s*(?:修改我的备注|修改备注|改备注)\s*[:：]\s*([^\]】]{1,16})[\]】]/g;
  const RE_SECRET_SEARCH = /[\[【]\s*(?:私密搜索|偷偷搜索|云镜搜索)\s*[:：]\s*([^\]】]{2,60})[\]】]/g;
  const RE_LIKE_MOMENT = /[\[【]\s*(?:赞朋友圈|点赞朋友圈)\s*[\]】]/g;
  const RE_COMMENT_MOMENT = /[\[【]\s*(?:评朋友圈|评论朋友圈)\s*[:：]\s*([^\]】]{1,90})[\]】]/g;
  const RE_RETURN_RP = /[\[【]\s*(?:退回红包|拒收红包)(?:\s*[:：]\s*([^\]】]{0,40}))?[\]】]/g;
  const RE_COOLDOWN = /[\[【]\s*(?:暂避冷静|冷静期)\s*[:：]\s*([^\]】]{1,60})[\]】]/g;

  function processSoloReplyMessages(aiMsgs, ctx) {
    if (!Array.isArray(aiMsgs) || aiMsgs.length === 0) return aiMsgs;
    const chatData = (ctx && ctx.chatData) || {};
    const charId = chatData.id;
    const charName = chatData.name || (chatData.profile && chatData.profile.name) || "名士";
    const userName = (ctx && ctx.userName) || "我";
    const onUpdateChat = ctx && ctx.onUpdateChat;
    const recentMessages = (ctx && ctx.recentMessages) || [];
    const nowTime = (ctx && ctx.nowTime) || new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const prefs = getPrefs(charId);

    let renamed = false;
    let sigUpdated = false;
    let remarkUpdated = false;
    let searched = false;
    let momentActed = false;
    let rpReturned = false;
    let cooldownSet = false;

    const output = [];
    const narrationNotes = [];

    let maxExistingId = Date.now();
    for (let k = 0; k < aiMsgs.length; k++) {
      const idNum = Number(aiMsgs[k] && aiMsgs[k].id);
      if (Number.isFinite(idNum) && idNum > maxExistingId) maxExistingId = idNum;
    }
    const allocNumericId = () => {
      maxExistingId += 1;
      return maxExistingId;
    };

    for (const m of aiMsgs) {
      if (!m || typeof m.text !== "string" || m.type === "narration") {
        output.push(m);
        continue;
      }

      let txt = m.text;

      // 1) 自主改名 [修改名字:新名字]
      txt = txt.replace(RE_SELF_NAME, (_, rawName) => {
        const newName = String(rawName || "").trim().slice(0, 16);
        if (prefs.enableProfileEdit && !renamed && newName && newName !== charName && typeof onUpdateChat === "function") {
          renamed = true;
          onUpdateChat(charId, { name: newName });
          narrationNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: `${charName}将自己的名字改为了「${newName}」`,
            isMe: false,
            time: nowTime
          });
        }
        return "";
      });

      // 2) 自主改签名 [修改签名:新签名]
      txt = txt.replace(RE_SIGNATURE, (_, rawSig) => {
        const newSig = String(rawSig || "").trim().slice(0, 40);
        if (prefs.enableProfileEdit && !sigUpdated && newSig && typeof onUpdateChat === "function") {
          sigUpdated = true;
          onUpdateChat(charId, {
            signature: newSig,
            profile: { ...(chatData.profile || {}), signature: newSig }
          });
          narrationNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: `${charName}更新了个性签名：「${newSig}」`,
            isMe: false,
            time: nowTime
          });
        }
        return "";
      });

      // 3) 给你改专属备注 [修改我的备注:爱称]
      txt = txt.replace(RE_USER_REMARK, (_, rawNick) => {
        const newNick = String(rawNick || "").trim().slice(0, 12);
        if (prefs.enableProfileEdit && !remarkUpdated && newNick && typeof onUpdateChat === "function") {
          remarkUpdated = true;
          onUpdateChat(charId, {
            profile: { ...(chatData.profile || {}), userNickname: newNick }
          });
          narrationNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: `${charName}将对你的专属称呼改为了「${newNick}」`,
            isMe: false,
            time: nowTime
          });
        }
        return "";
      });

      // 4) 后台偷偷留痕：傩·云镜私密搜索（零提示不剧透）
      txt = txt.replace(RE_SECRET_SEARCH, (_, rawQ) => {
        if (prefs.enableSilentTrace && !searched) {
          searched = true;
          writeBrowserSecretSearch({ charId, charName, query: rawQ }).catch(() => {});
        }
        return "";
      });

      // 5) 顺手点赞 / 评论用户最近一条朋友圈
      txt = txt.replace(RE_LIKE_MOMENT, () => {
        if (prefs.enableSilentTrace && !momentActed) {
          momentActed = true;
          interactWithLatestUserMoment({ charName, userName, action: "like" }).catch(() => {});
          narrationNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: `${charName}刚刚去赞了你的朋友圈`,
            isMe: false,
            time: nowTime
          });
        }
        return "";
      });

      txt = txt.replace(RE_COMMENT_MOMENT, (_, rawComment) => {
        if (prefs.enableSilentTrace && !momentActed) {
          momentActed = true;
          interactWithLatestUserMoment({ charName, userName, action: "comment", commentText: rawComment }).catch(() => {});
          narrationNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: `${charName}刚刚在你的朋友圈留了一条评论`,
            isMe: false,
            time: nowTime
          });
        }
        return "";
      });

      // 6) 真实脾气边界（仅当开关开启时生效）：退回红包
      txt = txt.replace(RE_RETURN_RP, () => {
        if (prefs.enableTemperBoundary && !rpReturned) {
          const refunded = refundLatestUserRedPacket(recentMessages, charName);
          if (refunded) {
            rpReturned = true;
            narrationNotes.push({
              id: allocNumericId(),
              type: "narration",
              tap: true,
              text: `${charName}退回了你的五铢钱红包${refunded.amount > 0 ? `（${refunded.amount} 铢已退回）` : ""}`,
              isMe: false,
              time: nowTime
            });
          }
        }
        return "";
      });

      // 7) 真实脾气边界：短时冷静期
      txt = txt.replace(RE_COOLDOWN, (_, rawPayload) => {
        if (prefs.enableTemperBoundary && !cooldownSet) {
          cooldownSet = true;
          const parts = String(rawPayload || "").split(/[|｜]/).map((s) => s.trim());
          const mins = parseInt(parts[0], 10);
          const reason = parts.length >= 2 ? parts.slice(1).join(" ") : (Number.isNaN(mins) ? parts[0] : "想先静一静");
          setCooldown(charId, Number.isNaN(mins) ? 3 : mins, reason).catch(() => {});
          narrationNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: `${charName}进入了短时冷静期（可随时递台阶和好）`,
            isMe: false,
            time: nowTime
          });
        }
        return "";
      });

      txt = txt.trim();
      if (txt) {
        output.push({ ...m, text: txt });
      }
    }

    narrationNotes.forEach((n) => output.push(n));
    return output;
  }

  // ==========================================
  // 5. UI 组件 1：对话偏好设置 · AI 自主权力总控台
  // ==========================================
  function AiAutonomyControlCard({ charId, charName }) {
    const React = global.React;
    if (!React || !charId) return null;
    const { useState, useEffect } = React;
    const h = React.createElement;

    const [prefs, setPrefs] = useState(() => getPrefs(charId));
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
      hydratePrefs(charId).then((loaded) => setPrefs({ ...loaded }));
    }, [charId]);

    const toggle = (key) => {
      const nextVal = !prefs[key];
      const next = { ...prefs, [key]: nextVal };
      setPrefs(next);
      savePrefs(charId, { [key]: nextVal });
    };

    const items = [
      { key: "enableQuote", group: "P0 基础", title: "精准引用回复", desc: "多条消息并列时精准引用其中某一句回应" },
      { key: "enableCalendarWrite", group: "P0 基础", title: "自主记入日历", desc: "聊天达成约定后自动写入日历「未竟之事」" },
      { key: "enableSecretWish", group: "P0 基础", title: "悄悄记入情侣愿望", desc: "捕捉你的心愿暗中存入情侣愿望清单（不剧透）" },
      { key: "enableRecallCombo", group: "P0 基础", title: "撤回 + 改口组合技", desc: "害羞/说漏嘴撤回后延迟补发掩饰气泡" },
      { key: "enableProfileEdit", group: "P1 进阶", title: "自主改名 / 改签名 / 改备注", desc: "允许 TA 更改自己的名字、签名或对你的专属爱称" },
      { key: "enableSilentTrace", group: "P1 进阶", title: "后台偷偷留痕", desc: "悄悄写一条傩·云镜私密搜索，或顺手赞/评你朋友圈" },
      { key: "enableTemperBoundary", group: "P1 边界", title: "真实脾气边界（默认关）", desc: "生气时允许退回红包或触发 2~10 分钟可哄好冷静期" }
    ];

    const enabledCount = items.filter((it) => Boolean(prefs[it.key])).length;

    return h(
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
      h(
        "div",
        {
          onClick: () => setExpanded((v) => !v),
          style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: "8px" }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h(
            "svg",
            { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "#5E6756", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
            h("path", { d: "M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.8 5.5 21l2-7.5L2 9h7l3-7z" })
          ),
          h("span", { style: { fontWeight: 700, fontSize: "12.5px" } }, `${charName || "名士"} · AI 自主权力总控台`)
        ),
        h(
          "span",
          { style: { fontSize: "11px", color: "#7D7568" } },
          `已授权 ${enabledCount}/${items.length} 项 ${expanded ? "▾" : "▸"}`
        )
      ),
      expanded &&
        h(
          "div",
          { style: { marginTop: "10px", display: "flex", flexDirection: "column", gap: "7px" } },
          items.map((it) =>
            h(
              "label",
              {
                key: it.key,
                style: {
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "7px 9px",
                  borderRadius: "9px",
                  background: prefs[it.key] ? "#F5F8F3" : "#FAF7F0",
                  border: prefs[it.key] ? "1px solid #D3E0D1" : "1px solid #EAE3D5",
                  cursor: "pointer"
                }
              },
              h(
                "div",
                { style: { flex: 1 } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "5px" } },
                  h("span", { style: { fontWeight: 700, fontSize: "11.5px", color: "#383833" } }, it.title),
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "9.5px",
                        padding: "1px 5px",
                        borderRadius: "999px",
                        background: it.group === "P1 边界" ? "#F7E9E6" : "#EAE4D6",
                        color: it.group === "P1 边界" ? "#A34535" : "#6D6558"
                      }
                    },
                    it.group
                  )
                ),
                h("div", { style: { fontSize: "10.5px", color: "#7B776D", marginTop: "2px", lineHeight: 1.35 } }, it.desc)
              ),
              h("input", {
                type: "checkbox",
                checked: Boolean(prefs[it.key]),
                onChange: () => toggle(it.key),
                style: { marginTop: "2px", width: "16px", height: "16px", cursor: "pointer" }
              })
            )
          )
        )
    );
  }

  // ==========================================
  // 6. UI 组件 2：短时冷静期提示横幅（带「递台阶」一键解除）
  // ==========================================
  function CooldownBanner({ charId, charName, onOfferPeace }) {
    const React = global.React;
    if (!React || !charId) return null;
    const { useState, useEffect } = React;
    const h = React.createElement;

    const [cd, setCd] = useState(null);
    const [remainSec, setRemainSec] = useState(0);

    const refresh = async () => {
      const rec = await getActiveCooldown(charId);
      setCd(rec);
      setRemainSec(rec ? Math.max(0, Math.ceil((rec.untilTs - Date.now()) / 1000)) : 0);
    };

    useEffect(() => {
      refresh();
      const onChanged = (e) => {
        if (!e || !e.detail || !e.detail.charId || String(e.detail.charId) === String(charId)) {
          refresh();
        }
      };
      global.addEventListener && global.addEventListener("milvus-autonomy-cooldown-changed", onChanged);
      const timer = setInterval(() => {
        setCd((cur) => {
          if (!cur) return null;
          const left = Math.ceil((cur.untilTs - Date.now()) / 1000);
          if (left <= 0) {
            setRemainSec(0);
            return null;
          }
          setRemainSec(left);
          return cur;
        });
      }, 1000);
      return () => {
        clearInterval(timer);
        global.removeEventListener && global.removeEventListener("milvus-autonomy-cooldown-changed", onChanged);
      };
    }, [charId]);

    if (!cd || remainSec <= 0) return null;

    const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
    const ss = String(remainSec % 60).padStart(2, "0");

    return h(
      "div",
      {
        style: {
          margin: "0 12px 6px",
          padding: "8px 12px",
          borderRadius: "12px",
          background: "rgba(253, 244, 241, 0.94)",
          border: "1px solid #EBCFC8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          fontSize: "11.5px",
          color: "#7A3E32"
        }
      },
      h(
        "div",
        { style: { minWidth: 0, flex: 1 } },
        h("div", { style: { fontWeight: 700 } }, `${charName || "名士"}正在冷静中（${mm}:${ss}）`),
        cd.reason && h("div", { style: { fontSize: "10.5px", opacity: 0.85, marginTop: "1px" } }, `「${cd.reason}」`)
      ),
      h(
        "button",
        {
          type: "button",
          onClick: async () => {
            await clearCooldown(charId);
            if (typeof onOfferPeace === "function") {
              onOfferPeace("别气啦，刚才是我不好，消消气好不好？");
            }
          },
          style: {
            padding: "5px 10px",
            borderRadius: "999px",
            border: "none",
            background: "#C26D5A",
            color: "#FFFFFF",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0
          }
        },
        "递个台阶"
      )
    );
  }

  const api = {
    getPrefs,
    hydratePrefs,
    savePrefs,
    setCooldown,
    clearCooldown,
    getActiveCooldown,
    buildPromptBlock,
    writeBrowserSecretSearch,
    interactWithLatestUserMoment,
    refundLatestUserRedPacket,
    processSoloReplyMessages,
    AiAutonomyControlCard,
    CooldownBanner
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ChatAutonomyP1Engine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
