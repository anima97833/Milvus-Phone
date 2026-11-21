
// IndexedDB 数据库配置
const DB_NAME = "t8_chat_db";
const DB_VERSION = 54; // 升级数据库版本至 54，新增情侣空间「沧海一刻」心情日记与习惯记录表
const STORES = {
  AVATARS: "avatars",
  USER_SETTINGS: "user_settings", // 存储用户设置，包括头像和背景
  CHAT_CHARACTERS: "chat_characters", // 存储聊天角色列表
  CHAT_HISTORY: "chat_history", // 存储聊天历史记录
  WORLD_BOOK: "world_book", // 存储世界书数据
  RELATIONSHIP: "relationship", // 存储关系数据
  CALENDAR: "calendar", // 存储日历任务
  DIARY: "diary", // 存储日记数据
  AREAS: "areas", // 存储区域数据
  BOOKS: "books", // 存储书籍元数据
  BOOK_CONTENTS: "book_contents", // 存储书籍全文内容
  MUSIC_PLAYLIST: "music_playlist", // 存储音乐列表
  EMOJIS: "emojis", // 存储用户自定义表情包
  BACKPACK: "backpack", // 背包存储
  LOCKSCREEN: "lockscreen", // 锁屏图片存储
  DELIVERY_ORDERS: "delivery_orders", // 配送订单存储
  MCP_TOOLS: "mcp_tools", // MCP 工具存储
  MCP_LOGS: "mcp_logs", // MCP 调用日志
  MCP_CACHE: "mcp_cache", // MCP 缓存
  CHAT_REPORTS: "chat_reports", // 传讯可视化总结报告存档
  STORY_LOOM: "story_loom", // 情侣空间「故事织机」双人共写存档
  INK_POETRY: "ink_poetry", // 情侣空间「笔墨诗书」诗/词/剧/史互赠与评分存档
  MOMENT_MOODS: "moment_moods", // 情侣空间「沧海一刻」双人心情日记
  MOMENT_HABITS: "moment_habits", // 情侣空间「沧海一刻」习惯定义（用户/角色）
  MOMENT_HABIT_LOGS: "moment_habit_logs", // 情侣空间「沧海一刻」每日习惯/经期打卡日志
};

// 挂载到 window 方便全局使用
if (typeof window !== "undefined") {
  window.STORES = STORES;
  window.DB_VERSION = DB_VERSION;
  window.DB_NAME = DB_NAME;
  window.openDB = openDB;
}

// 统一辅助函数：在 onupgradeneeded 中确保所有 Store 都已完整创建
function initAllStores(db) {
  // 1. 头像存储
  if (!db.objectStoreNames.contains(STORES.AVATARS)) {
    db.createObjectStore(STORES.AVATARS, { keyPath: "id" });
  }

  // 2. 日记存储
  if (!db.objectStoreNames.contains(STORES.DIARY)) {
    db.createObjectStore(STORES.DIARY, { keyPath: "id" });
  }

  // 3. 用户设置存储 (包含背景、头像、系统配置)
  if (!db.objectStoreNames.contains(STORES.USER_SETTINGS)) {
    db.createObjectStore(STORES.USER_SETTINGS, { keyPath: "key" });
  }

  // 4. 聊天角色存储
  if (!db.objectStoreNames.contains(STORES.CHAT_CHARACTERS)) {
    db.createObjectStore(STORES.CHAT_CHARACTERS, { keyPath: "id" });
  }

  // 5. 聊天历史存储 (复合键 characterId + id，带索引)
  if (!db.objectStoreNames.contains(STORES.CHAT_HISTORY)) {
    const historyStore = db.createObjectStore(STORES.CHAT_HISTORY, {
      keyPath: ["characterId", "id"],
    });
    historyStore.createIndex("by_character", "characterId", {
      unique: false,
    });
  }

  // 6. 世界书存储
  if (!db.objectStoreNames.contains(STORES.WORLD_BOOK)) {
    db.createObjectStore(STORES.WORLD_BOOK, { keyPath: "id" });
  }

  // 7. 关系数据存储
  if (!db.objectStoreNames.contains(STORES.RELATIONSHIP)) {
    db.createObjectStore(STORES.RELATIONSHIP, { keyPath: "id" });
  }

  // 8. 日历任务存储
  if (!db.objectStoreNames.contains(STORES.CALENDAR)) {
    db.createObjectStore(STORES.CALENDAR, { keyPath: "id" });
  }

  // 9. 区域数据存储
  if (!db.objectStoreNames.contains(STORES.AREAS)) {
    db.createObjectStore(STORES.AREAS, { keyPath: "id" });
  }

  // 10. 书籍元数据存储
  if (!db.objectStoreNames.contains(STORES.BOOKS)) {
    db.createObjectStore(STORES.BOOKS, { keyPath: "id" });
  }

  // 11. 书籍内容存储
  if (!db.objectStoreNames.contains(STORES.BOOK_CONTENTS)) {
    db.createObjectStore(STORES.BOOK_CONTENTS, { keyPath: "id" });
  }

  // 12. 音乐列表存储
  if (!db.objectStoreNames.contains(STORES.MUSIC_PLAYLIST)) {
    db.createObjectStore(STORES.MUSIC_PLAYLIST, { keyPath: "id" });
  }

  // 13. 表情包存储
  if (!db.objectStoreNames.contains(STORES.EMOJIS)) {
    db.createObjectStore(STORES.EMOJIS, { keyPath: "id" });
  }

  // 14. 背包存储
  if (!db.objectStoreNames.contains(STORES.BACKPACK)) {
    db.createObjectStore(STORES.BACKPACK, { keyPath: "id" });
  }

  // 15. 锁屏图片存储
  if (!db.objectStoreNames.contains(STORES.LOCKSCREEN)) {
    db.createObjectStore(STORES.LOCKSCREEN, { keyPath: "id" });
  }

  // 16. 配送订单存储
  if (!db.objectStoreNames.contains(STORES.DELIVERY_ORDERS)) {
    db.createObjectStore(STORES.DELIVERY_ORDERS, { keyPath: "id" });
  }

  // 17. MCP 工具存储
  if (!db.objectStoreNames.contains(STORES.MCP_TOOLS)) {
    db.createObjectStore(STORES.MCP_TOOLS, { keyPath: "name" });
  }

  // 18. MCP 日志存储
  if (!db.objectStoreNames.contains(STORES.MCP_LOGS)) {
    db.createObjectStore(STORES.MCP_LOGS, { keyPath: "id" });
  }

  // 19. MCP 缓存存储
  if (!db.objectStoreNames.contains(STORES.MCP_CACHE)) {
    db.createObjectStore(STORES.MCP_CACHE, { keyPath: "key" });
  }
  if (!db.objectStoreNames.contains(STORES.CHAT_REPORTS)) {
    const reportStore = db.createObjectStore(STORES.CHAT_REPORTS, { keyPath: "id" });
    reportStore.createIndex("by_periodType", "periodType", { unique: false });
    reportStore.createIndex("by_createdAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.STORY_LOOM)) {
    const loomStore = db.createObjectStore(STORES.STORY_LOOM, { keyPath: "id" });
    loomStore.createIndex("by_charId", "charId", { unique: false });
    loomStore.createIndex("by_updatedAt", "updatedAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.INK_POETRY)) {
    const inkStore = db.createObjectStore(STORES.INK_POETRY, { keyPath: "id" });
    inkStore.createIndex("by_charId", "charId", { unique: false });
    inkStore.createIndex("by_genre", "genre", { unique: false });
    inkStore.createIndex("by_updatedAt", "updatedAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.MOMENT_MOODS)) {
    const moodStore = db.createObjectStore(STORES.MOMENT_MOODS, { keyPath: "id" });
    moodStore.createIndex("by_charId", "charId", { unique: false });
    moodStore.createIndex("by_date", "date", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.MOMENT_HABITS)) {
    const habitStore = db.createObjectStore(STORES.MOMENT_HABITS, { keyPath: "id" });
    habitStore.createIndex("by_ownerScope", "ownerScope", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.MOMENT_HABIT_LOGS)) {
    const habitLogStore = db.createObjectStore(STORES.MOMENT_HABIT_LOGS, { keyPath: "id" });
    habitLogStore.createIndex("by_habitId", "habitId", { unique: false });
    habitLogStore.createIndex("by_date", "date", { unique: false });
  }
}

// 全局单例连接与并发 Promise 管理
let _cachedDbInstance = null;
let _openDbPromise = null;

function resetDbCache() {
  if (_cachedDbInstance) {
    try {
      _cachedDbInstance.close();
    } catch (e) {}
  }
  _cachedDbInstance = null;
  _openDbPromise = null;
}

// 打开数据库连接 (支持单例复用、并发合并、自动升版与缺失表自愈)
function openDB() {
  if (_cachedDbInstance) {
    try {
      if (_cachedDbInstance.objectStoreNames) {
        return Promise.resolve(_cachedDbInstance);
      }
    } catch (e) {
      _cachedDbInstance = null;
    }
  }

  if (_openDbPromise) {
    return _openDbPromise;
  }

  _openDbPromise = new Promise(async (resolve, reject) => {
    // 内部通用打开辅助
    const performOpen = (ver) => {
      return new Promise((res, rej) => {
        let req;
        try {
          req = ver ? indexedDB.open(DB_NAME, ver) : indexedDB.open(DB_NAME);
        } catch (err) {
          return rej(err);
        }

        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          console.log(`[IndexedDB 升级] 版本已升至 ${db.version}`);
          initAllStores(db);
        };

        req.onblocked = () => {
          console.warn("[IndexedDB] 打开请求被未关闭的旧连接阻塞，正在尝试调度...");
        };

        req.onsuccess = (event) => {
          const db = event.target.result;
          db.onversionchange = () => {
            console.warn("[IndexedDB] 侦测到外部升级信号，主动断开当前实例");
            try {
              db.close();
            } catch (e) {}
            resetDbCache();
          };
          db.onclose = () => {
            resetDbCache();
          };
          res(db);
        };

        req.onerror = (event) => {
          if (event.preventDefault) event.preventDefault();
          rej(event.target?.error || new Error("打开数据库失败"));
        };
      });
    };

    try {
      let db = null;
      try {
        db = await performOpen(DB_VERSION);
      } catch (err) {
        console.warn(`[DB] 尝试版本 ${DB_VERSION} 打开失败，自动无缝回退当前最新版本:`, err);
        db = await performOpen(null);
      }

      // 检查是否有缺失表
      const missingStores = Object.values(STORES).filter(
        (s) => !db.objectStoreNames.contains(s)
      );

      if (missingStores.length > 0) {
        console.log(`[IndexedDB 自愈] 发现缺失表: [${missingStores.join(", ")}]，执行动态补全升级...`);
        const nextVer = db.version + 1;
        try {
          db.close();
        } catch (e) {}
        resetDbCache();
        db = await performOpen(nextVer);
      }

      _cachedDbInstance = db;
      resolve(db);
    } catch (finalErr) {
      console.error("[IndexedDB 核心连接异常]", finalErr);
      resetDbCache();
      reject(finalErr);
    } finally {
      _openDbPromise = null;
    }
  });

  return _openDbPromise;
}
window.openDB = openDB;

// 手动或代码调用的主动升级数据库函数
window.upgradeIndexedDB = async function (targetVer) {
  resetDbCache();
  const currentDb = await openDB();
  const nextVer = targetVer || Math.max(currentDb.version + 1, DB_VERSION);
  try {
    currentDb.close();
  } catch (e) {}
  resetDbCache();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, nextVer);
    req.onupgradeneeded = (e) => {
      initAllStores(e.target.result);
      console.log(`[IndexedDB 手动升级成功] 当前版本为: ${nextVer}`);
    };
    req.onsuccess = (e) => {
      _cachedDbInstance = e.target.result;
      resolve(e.target.result);
    };
    req.onerror = (e) => {
      if (e.preventDefault) e.preventDefault();
      reject(e.target.error);
    };
  });
};

// 音乐存储操作对象
const musicStore = {
  getAll: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MUSIC_PLAYLIST, "readonly");
      const request = tx.objectStore(STORES.MUSIC_PLAYLIST).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  },
  save: async (song) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MUSIC_PLAYLIST, "readwrite");
      // 过滤掉内存链接(audioSrc)，仅存持久化数据
      const { audioSrc, ...dataToSave } = song;
      const request = tx
        .objectStore(STORES.MUSIC_PLAYLIST)
        .put(dataToSave);
      request.onsuccess = () => resolve(true);
    });
  },
  delete: async (id) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MUSIC_PLAYLIST, "readwrite");
      const request = tx.objectStore(STORES.MUSIC_PLAYLIST).delete(id);
      request.onsuccess = () => resolve(true);
    });
  },
};
window.musicStore = musicStore; // 暴露给全局

// [新增] 表情包存储操作对象
const emojiStore = {
  getAll: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.EMOJIS, "readonly");
      const request = tx.objectStore(STORES.EMOJIS).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  },
  save: async (emoji) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.EMOJIS, "readwrite");
      const request = tx.objectStore(STORES.EMOJIS).put(emoji);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error("表情保存失败"));
    });
  },
  delete: async (id) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.EMOJIS, "readwrite");
      const request = tx.objectStore(STORES.EMOJIS).delete(id);
      request.onsuccess = () => resolve(true);
    });
  },
};
window.emojiStore = emojiStore; // 暴露给全局

// ✅ 新增：背包存储操作对象
const backpackStore = {
  getAll: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.BACKPACK, "readonly");
      const request = tx.objectStore(STORES.BACKPACK).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  },
  addItems: async (items) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.BACKPACK, "readwrite");
      const store = tx.objectStore(STORES.BACKPACK);
      items.forEach((item) => {
        // 加上时间戳和唯一ID
        store.put({
          ...item,
          id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          acquiredAt: item.acquiredAt || Date.now(),
        });
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },
  removeItem: async (itemId) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.BACKPACK, "readwrite");
      const store = tx.objectStore(STORES.BACKPACK);
      const request = store.delete(itemId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  },
  removeItems: async (itemIds) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.BACKPACK, "readwrite");
      const store = tx.objectStore(STORES.BACKPACK);
      itemIds.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve(true);
    });
  },
};
window.backpackStore = backpackStore;

// ✅ 新增：锁屏图片存储操作对象
const lockScreenStore = {
  getAll: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.LOCKSCREEN, "readonly");
      const request = tx.objectStore(STORES.LOCKSCREEN).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  },
  save: async (image) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.LOCKSCREEN, "readwrite");
      const request = tx.objectStore(STORES.LOCKSCREEN).put(image);
      request.onsuccess = () => resolve(true);
    });
  },
  delete: async (id) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.LOCKSCREEN, "readwrite");
      const request = tx.objectStore(STORES.LOCKSCREEN).delete(id);
      request.onsuccess = () => resolve(true);
    });
  },
  clearAll: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.LOCKSCREEN, "readwrite");
      const request = tx.objectStore(STORES.LOCKSCREEN).clear();
      request.onsuccess = () => resolve(true);
    });
  }
};
window.lockScreenStore = lockScreenStore;

// 检查并创建必要的存储（兼容旧版本，自动委托给 openDB 自愈）
async function ensureStoresExist() {
  try {
    const db = await openDB();

    // 自动初始化背包种子数据
    if (!localStorage.getItem("backpack_seed_initialized")) {
      const seedItems = [
        {
          id: `seed_${Date.now()}_1`,
          name: "广陵密探印信",
          type: "ticket",
          price: "不可交易",
          acquiredAt: Date.now() - 10000,
        },
        {
          id: `seed_${Date.now()}_2`,
          name: "辟谷丹",
          type: "food",
          price: "50钱",
          acquiredAt: Date.now() - 5000,
        }
      ];
      if (window.backpackStore) {
        await window.backpackStore.addItems(seedItems);
        localStorage.setItem("backpack_seed_initialized", "true");
      }
    }

    return db;
  } catch (error) {
    console.error("检查存储失败:", error);
    // 不抛出错误，让调用者继续执行
    return null;
  }
}

// 头像存储操作
const avatarStore = {
  // 获取头像
  get: async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AVATARS, "readonly");
      const store = transaction.objectStore(STORES.AVATARS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("获取头像失败");
    });
  },

  // 保存头像
  put: async (id, avatarData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AVATARS, "readwrite");
      const store = transaction.objectStore(STORES.AVATARS);
      const request = store.put({ id, avatarData });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存头像失败");
    });
  },

  // 删除头像
  delete: async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AVATARS, "readwrite");
      const store = transaction.objectStore(STORES.AVATARS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject("删除头像失败");
    });
  },
};

// 用户设置存储操作（新增）
const settingsStore = {
  // === 场景与换装选定形态 (团建/离线/心纸居) ===
    getSelectedSprites: async (key = "t8_teambuilding_selected_sprites") => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value && typeof req.result.value === "object") {
            try { localStorage.removeItem(key); } catch (e) {}
            resolve(req.result.value);
          } else {
            try {
              const local = JSON.parse(localStorage.getItem(key) || "{}");
              if (local && typeof local === "object" && Object.keys(local).length > 0) {
                settingsStore.setSelectedSprites(key, local).catch(() => {});
              }
              resolve(local);
            } catch (e) {
              resolve({});
            }
          }
        };
        req.onerror = () => resolve({});
      });
    } catch (e) {
      return {};
    }
  },

  setSelectedSprites: async (key, map) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      store.put({ key: key, value: map, updatedAt: Date.now() });
      try { localStorage.removeItem(key); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  },

  // === 州郡大帝 / 密奏主公头像 ===
  getEmperorAvatar: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("t13_emperor_avatar");
        req.onsuccess = () => {
          if (req.result && req.result.value) {
            resolve(req.result.value);
          } else {
            const local = localStorage.getItem("t13_emperor_avatar");
            resolve(local || "");
          }
        };
        req.onerror = () => resolve("");
      });
    } catch (e) {
      return "";
    }
  },

  setEmperorAvatar: async (base64) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      store.put({ key: "t13_emperor_avatar", value: base64, updatedAt: Date.now() });
      try { localStorage.removeItem("t13_emperor_avatar"); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  },

  // === 黄巾矿场自定义矿工头像 ===
  getMinerAvatar: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("yellow_turban_miner_avatar");
        req.onsuccess = () => {
          if (req.result && req.result.value) {
            resolve(req.result.value);
          } else {
            const local = localStorage.getItem("yellow_turban_miner_avatar");
            resolve(local || null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  setMinerAvatar: async (dataUrl) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      store.put({ key: "yellow_turban_miner_avatar", value: dataUrl, updatedAt: Date.now() });
      try { localStorage.removeItem("yellow_turban_miner_avatar"); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  },

  // === 绣衣楼自定义头像 ===
  getXiuyilouAvatars: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("xiuyilou_avatars");
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject("获取绣衣楼头像失败");
    });
  },

  setXiuyilouAvatars: async (avatarsMap) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "xiuyilou_avatars", value: avatarsMap });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存绣衣楼头像失败");
    });
  },

  // 获取用户头像
  getUserAvatar: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.USER_SETTINGS,
        "readonly",
      );
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("user_avatar");

      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取用户头像失败");
    });
  },

  // 设置用户头像
  setUserAvatar: async (avatarData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.USER_SETTINGS,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({
        key: "user_avatar",
        value: avatarData,
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存用户头像失败");
    });
  },

  // 获取页面背景
  getPageBackground: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.USER_SETTINGS,
        "readonly",
      );
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("page_background");

      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取页面背景失败");
    });
  },

  // 设置页面背景
  setPageBackground: async (backgroundData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.USER_SETTINGS,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({
        key: "page_background",
        value: backgroundData,
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存页面背景失败");
    });
  },

  // 获取木桩训练角色图片
  getJumpGameCharImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("jumpgame_char_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取木桩训练角色图片失败");
    });
  },

  // 设置木桩训练角色图片
  setJumpGameCharImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "jumpgame_char_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存木桩训练角色图片失败");
    });
  },

  // 获取木桩训练道具图片
  getJumpGameItemImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("jumpgame_item_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取木桩训练道具图片失败");
    });
  },

  // 设置木桩训练道具图片
  setJumpGameItemImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "jumpgame_item_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存木桩训练道具图片失败");
    });
  },

  // 获取蹴鞠训练角色头像
  getCujuGameAvatar: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("cujugame_avatar_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取蹴鞠训练角色头像失败");
    });
  },

  // 设置蹴鞠训练角色头像
  setCujuGameAvatar: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "cujugame_avatar_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存蹴鞠训练角色头像失败");
    });
  },

  // 获取射箭训练角色1图片
  getArcheryGameChar1Image: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("archerygame_char1_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取射箭训练角色1图片失败");
    });
  },

  // 设置射箭训练角色1图片
  setArcheryGameChar1Image: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "archerygame_char1_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存射箭训练角色1图片失败");
    });
  },

  // 获取射箭训练角色2图片
  getArcheryGameChar2Image: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("archerygame_char2_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取射箭训练角色2图片失败");
    });
  },

  // 设置射箭训练角色2图片
  setArcheryGameChar2Image: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "archerygame_char2_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存射箭训练角色2图片失败");
    });
  },

  // 获取射箭训练角色3(有毒)图片
  getArcheryGameChar3Image: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("archerygame_char3_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取射箭训练角色3图片失败");
    });
  },

  // 设置射箭训练角色3(有毒)图片
  setArcheryGameChar3Image: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "archerygame_char3_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存射箭训练角色3图片失败");
    });
  },

  // 获取射箭训练角色4(爆炸)图片
  getArcheryGameChar4Image: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("archerygame_char4_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取射箭训练角色4图片失败");
    });
  },

  // 设置射箭训练角色4(爆炸)图片
  setArcheryGameChar4Image: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "archerygame_char4_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存射箭训练角色4图片失败");
    });
  },

  // 获取敏捷训练角色1(普通)正常态图片
  getAgilityGameThief1IdleImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("agilitygame_thief1_idle_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取敏捷训练角色1正常态图片失败");
    });
  },

  // 设置敏捷训练角色1(普通)正常态图片
  setAgilityGameThief1IdleImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "agilitygame_thief1_idle_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存敏捷训练角色1正常态图片失败");
    });
  },

  // 获取敏捷训练角色1(普通)击中态图片
  getAgilityGameThief1HitImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("agilitygame_thief1_hit_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取敏捷训练角色1击中态图片失败");
    });
  },

  // 设置敏捷训练角色1(普通)击中态图片
  setAgilityGameThief1HitImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "agilitygame_thief1_hit_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存敏捷训练角色1击中态图片失败");
    });
  },

  // 获取敏捷训练角色2(特殊)正常态图片
  getAgilityGameThief2IdleImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("agilitygame_thief2_idle_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取敏捷训练角色2正常态图片失败");
    });
  },

  // 设置敏捷训练角色2(特殊)正常态图片
  setAgilityGameThief2IdleImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "agilitygame_thief2_idle_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存敏捷训练角色2正常态图片失败");
    });
  },

  // 获取敏捷训练角色2(特殊)击中态图片
  getAgilityGameThief2HitImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("agilitygame_thief2_hit_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取敏捷训练角色2击中态图片失败");
    });
  },

  // 设置敏捷训练角色2(特殊)击中态图片
  setAgilityGameThief2HitImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "agilitygame_thief2_hit_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存敏捷训练角色2击中态图片失败");
    });
  },

  // 获取划船训练角色1头像
  getRowingGameChar1Image: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("rowinggame_char1_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取划船训练角色1头像失败");
    });
  },

  // 设置划船训练角色1头像
  setRowingGameChar1Image: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "rowinggame_char1_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存划船训练角色1头像失败");
    });
  },

  // 获取划船训练角色2头像
  getRowingGameChar2Image: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("rowinggame_char2_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取划船训练角色2头像失败");
    });
  },

  // 设置划船训练角色2头像
  setRowingGameChar2Image: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "rowinggame_char2_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存划船训练角色2头像失败");
    });
  },

  // 获取音律训练角色弹奏图片 (Active)
  getMusicGameCharActiveImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("musicgame_char_active_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取音律训练角色弹奏图片失败");
    });
  },

  // 设置音律训练角色弹奏图片 (Active)
  setMusicGameCharActiveImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "musicgame_char_active_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存音律训练角色弹奏图片失败");
    });
  },

  // 获取音律训练角色待机图片 (Idle)
  getMusicGameCharIdleImage: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("musicgame_char_idle_image");
      request.onsuccess = () => resolve(request.result?.value || "");
      request.onerror = () => reject("获取音律训练角色待机图片失败");
    });
  },

  // 获取音律训练角色待机图片 (Idle)
  setMusicGameCharIdleImage: async (imageData) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "musicgame_char_idle_image", value: imageData });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存音律训练角色待机图片失败");
    });
  },

  // 获取绣衣楼公告数据
  getXiuyiNotices: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("xiuyi_notices");
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject("获取绣衣楼公告失败");
    });
  },

  // 设置/保存绣衣楼公告数据
  setXiuyiNotices: async (notices) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "xiuyi_notices", value: notices });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存绣衣楼公告失败");
    });
  },

  // 获取注册码验证状态
  getRegistrationVerified: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("reg_code_verified");
      request.onsuccess = () => resolve(request.result?.value === true);
      request.onerror = () => reject("获取注册状态失败");
    });
  },

  // 设置注册码验证状态
  setRegistrationVerified: async (isVerified) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "reg_code_verified", value: !!isVerified });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存注册状态失败");
    });
  },

  // 获取楼内联系人自定义笔记/备注字典
  getCharacterNotes: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("xiuyi_character_notes");
      request.onsuccess = () => resolve(request.result?.value || {});
      request.onerror = () => reject("获取人物笔记失败");
    });
  },

  // 保存某个楼内联系人的自定义笔记/备注
  saveCharacterNote: async (character, note) => {
    const db = await openDB();
    return new Promise(async (resolve, reject) => {
      try {
        let existingNotes = {};
        try {
          const transactionRead = db.transaction(STORES.USER_SETTINGS, "readonly");
          const storeRead = transactionRead.objectStore(STORES.USER_SETTINGS);
          const reqRead = storeRead.get("xiuyi_character_notes");
          existingNotes = await new Promise((res) => {
            reqRead.onsuccess = () => res(reqRead.result?.value || {});
            reqRead.onerror = () => res({});
          });
        } catch (e) { }

        existingNotes[character] = note;

        const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = transaction.objectStore(STORES.USER_SETTINGS);
        const request = store.put({ key: "xiuyi_character_notes", value: existingNotes });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("保存人物笔记失败");
      } catch (err) {
        reject(err);
      }
    });
  },

  // 获取某个角色的绣衣楼聊天记录
  getXiuyiChatHistory: async (character) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.get("xiuyi_chat_" + character);
      request.onsuccess = () => resolve(request.result?.value || []);
      request.onerror = () => reject("获取聊天记录失败");
    });
  },

  // 保存某个角色的绣衣楼聊天记录
  saveXiuyiChatHistory: async (character, messages) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = transaction.objectStore(STORES.USER_SETTINGS);
      const request = store.put({ key: "xiuyi_chat_" + character, value: messages });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存聊天记录失败");
    });
  },
};

// 迁移用户数据从 localStorage 到 IndexedDB（新增）
async function migrateUserData() {
  try {
    console.log("开始迁移用户数据...");

    // 迁移用户头像
    const userAvatar = localStorage.getItem("user_avatar");
    if (userAvatar) {
      await settingsStore.setUserAvatar(userAvatar);
      console.log("用户头像迁移成功");
    }

    // 迁移页面背景
    const pageBackground = localStorage.getItem("page_background");
    if (pageBackground) {
      await settingsStore.setPageBackground(pageBackground);
      console.log("页面背景迁移成功");
    }

    // 验证迁移结果
    const migratedAvatar = await settingsStore.getUserAvatar();
    const migratedBackground = await settingsStore.getPageBackground();

    console.log("迁移验证结果:");
    console.log("用户头像:", migratedAvatar ? "已迁移" : "无数据");
    console.log("页面背景:", migratedBackground ? "已迁移" : "无数据");

    // 清除 localStorage 中的旧数据
    localStorage.removeItem("user_avatar");
    localStorage.removeItem("page_background");
    console.log("localStorage 旧数据已清除");

    console.log("用户数据迁移完成");
    return true;
  } catch (error) {
    console.error("用户数据迁移失败:", error);
    return false;
  }
}

// 聊天角色存储操作
const chatCharacterStore = {
  // 获取单个聊天角色
  get: async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_CHARACTERS,
        "readonly",
      );
      const store = transaction.objectStore(STORES.CHAT_CHARACTERS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("获取聊天角色失败");
    });
  },

  // 获取所有聊天角色
  getAll: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_CHARACTERS,
        "readonly",
      );
      const store = transaction.objectStore(STORES.CHAT_CHARACTERS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("获取聊天角色失败");
    });
  },

  // 保存聊天角色
  save: async (character) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_CHARACTERS,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.CHAT_CHARACTERS);
      const request = store.put(character);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存聊天角色失败");
    });
  },

  // 批量保存聊天角色
  saveAll: async (characters) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_CHARACTERS,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.CHAT_CHARACTERS);

      let count = 0;
      let error = null;

      characters.forEach((character) => {
        const request = store.put(character);
        request.onsuccess = () => {
          count++;
          if (count === characters.length) {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          }
        };
        request.onerror = () => {
          error = "批量保存聊天角色失败";
          count++;
          if (count === characters.length) {
            reject(error);
          }
        };
      });
    });
  },

  // 删除聊天角色
  delete: async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_CHARACTERS,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.CHAT_CHARACTERS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject("删除聊天角色失败");
    });
  },
};

// 聊天历史存储操作
const chatHistoryStore = {
  // 保存单条聊天消息
  saveMessage: async (characterId, message) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_HISTORY,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      // 添加characterId到消息对象
      const messageWithCharacterId = {
        ...message,
        characterId,
      };
      const request = store.put(messageWithCharacterId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存聊天消息失败");
    });
  },

  // 批量保存聊天消息 (安全增量更新，杜绝误删未加载历史)
  saveMessages: async (characterId, messages) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_HISTORY,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const index = store.index("by_character");
      const range = IDBKeyRange.only(characterId);

      const newMsgMap = new Map();
      (messages || []).forEach(m => {
        if (m && m.id) newMsgMap.set(String(m.id), m);
      });

      const cursorRequest = index.openCursor(range);
      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const existingMsg = cursor.value;
          const existingId = String(existingMsg.id);
          // 若当前消息被用户明确删除，则从数据库中删除
          if (!newMsgMap.has(existingId)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          // 写入/更新当前传入的所有消息
          if (!messages || messages.length === 0) {
            resolve();
            return;
          }
          let count = 0;
          let hasError = false;
          messages.forEach((message) => {
            const messageWithCharacterId = {
              ...message,
              characterId,
            };
            const request = store.put(messageWithCharacterId);
            request.onsuccess = () => {
              count++;
              if (count === messages.length && !hasError) {
                resolve();
              }
            };
            request.onerror = () => {
              if (!hasError) {
                hasError = true;
                reject("批量保存聊天消息失败");
              }
            };
          });
        }
      };
      cursorRequest.onerror = () => {
        reject("查询并保存聊天消息失败");
      };
    });
  },

  // 获取全部聊天历史 (无截断)
  getAllMessages: async (characterId) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CHAT_HISTORY, "readonly");
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const index = store.index("by_character");
      const range = IDBKeyRange.only(characterId);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const msgs = (request.result || []).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
        resolve({
          messages: msgs,
          totalCount: msgs.length
        });
      };
      request.onerror = () => {
        reject("获取全部聊天历史失败");
      };
    });
  },

  // 分页获取聊天历史
  getMessages: async (characterId, page = 1, pageSize = 999999) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CHAT_HISTORY, "readonly");
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const index = store.index("by_character");
      const range = IDBKeyRange.only(characterId);

      // 先获取总数
      const countRequest = index.count(range);

      countRequest.onsuccess = () => {
        const totalCount = countRequest.result;
        const totalPages = Math.ceil(totalCount / pageSize);
        const offset = (page - 1) * pageSize;

        // 逆序获取（最新的消息在后面）
        const request = index.openCursor(range, "prev");
        const messages = [];
        let cursorCount = 0;

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && cursorCount < offset + pageSize) {
            if (cursorCount >= offset) {
              messages.unshift(cursor.value);
            }
            cursorCount++;
            cursor.continue();
          } else {
            resolve({
              messages,
              page,
              pageSize,
              totalCount,
              totalPages,
            });
          }
        };

        request.onerror = () => {
          reject("获取聊天历史失败");
        };
      };

      countRequest.onerror = () => {
        reject("获取聊天历史计数失败");
      };
    });
  },

  // 获取最近的聊天消息
  getRecentMessages: async (characterId, limit = 10) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CHAT_HISTORY, "readonly");
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const index = store.index("by_character");
      const range = IDBKeyRange.only(characterId);

      const request = index.openCursor(range, "prev");
      const messages = [];
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && count < limit) {
          messages.unshift(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(messages);
        }
      };

      request.onerror = () => {
        reject("获取最近聊天消息失败");
      };
    });
  },

  // 获取全部聊天历史
  getAll: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(
        STORES.CHAT_HISTORY,
        "readonly",
      );
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  },

  // 获取聊天历史总数
  count: async () => {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(
        STORES.CHAT_HISTORY,
        "readonly",
      );
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const request = store.count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
    });
  },

  // 删除聊天历史
  deleteMessages: async (characterId) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.CHAT_HISTORY,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.CHAT_HISTORY);
      const index = store.index("by_character");
      const range = IDBKeyRange.only(characterId);

      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
        reject("删除聊天历史失败");
      };
    });
  },
};

// 迁移聊天数据从localStorage到IndexedDB
async function migrateChatData() {
  try {
    console.log("开始迁移聊天数据...");

    // 迁移聊天角色列表
    const savedChats = localStorage.getItem("t8_chat_list");
    if (savedChats) {
      try {
        const characters = JSON.parse(savedChats);
        if (Array.isArray(characters) && characters.length > 0) {
          await chatCharacterStore.saveAll(characters);
          console.log(
            "聊天角色列表迁移成功，共",
            characters.length,
            "个角色",
          );
        }
      } catch (e) {
        console.error("解析聊天角色列表失败:", e);
      }
    }

    // 迁移聊天历史记录
    const chatKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("t8_history_")) {
        chatKeys.push(key);
      }
    }

    console.log("发现", chatKeys.length, "个聊天历史记录");

    for (const key of chatKeys) {
      try {
        const characterId = key.replace("t8_history_", "");
        const savedHistory = localStorage.getItem(key);
        if (savedHistory) {
          const messages = JSON.parse(savedHistory);
          if (Array.isArray(messages) && messages.length > 0) {
            await chatHistoryStore.saveMessages(characterId, messages);
            console.log(
              "迁移聊天历史记录成功:",
              characterId,
              "共",
              messages.length,
              "条消息",
            );
          }
        }
      } catch (e) {
        console.error("迁移聊天历史记录失败:", key, e);
      }
    }

    // 清除localStorage中的旧数据
    localStorage.removeItem("t8_chat_list");
    chatKeys.forEach((key) => localStorage.removeItem(key));
    console.log("localStorage中的旧聊天数据已清除");

    console.log("聊天数据迁移完成");
    return true;
  } catch (error) {
    console.error("迁移聊天数据失败:", error);
    return false;
  }
}

// 世界书存储操作
const worldBookStore = {
  // 保存世界书数据
  saveData: async (data) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.WORLD_BOOK, "readwrite");
      const store = transaction.objectStore(STORES.WORLD_BOOK);
      const request = store.put({ id: "world_book_data", ...data });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存世界书数据失败");
    });
  },

  // 获取世界书数据
  getData: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.WORLD_BOOK, "readonly");
      const store = transaction.objectStore(STORES.WORLD_BOOK);
      const request = store.get("world_book_data");

      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject("获取世界书数据失败");
    });
  },

  // 删除世界书数据
  deleteData: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.WORLD_BOOK, "readwrite");
      const store = transaction.objectStore(STORES.WORLD_BOOK);
      const request = store.delete("world_book_data");

      request.onsuccess = () => resolve();
      request.onerror = () => reject("删除世界书数据失败");
    });
  },
};

// 关系数据存储操作
const relationshipStore = {
  // 保存关系数据
  saveData: async (data) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.RELATIONSHIP,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.RELATIONSHIP);
      const request = store.put({ id: "relationship_data", ...data });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存关系数据失败");
    });
  },

  // 获取关系数据
  getData: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.RELATIONSHIP, "readonly");
      const store = transaction.objectStore(STORES.RELATIONSHIP);
      const request = store.get("relationship_data");

      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject("获取关系数据失败");
    });
  },

  // 删除关系数据
  deleteData: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORES.RELATIONSHIP,
        "readwrite",
      );
      const store = transaction.objectStore(STORES.RELATIONSHIP);
      const request = store.delete("relationship_data");

      request.onsuccess = () => resolve();
      request.onerror = () => reject("删除关系数据失败");
    });
  },
};

let _lastSavedCalendarTasksJson = "";

// 日历任务存储操作
const calendarStore = {
  // 保存日历任务
  saveTasks: async (tasks, fromCalendarUI = false) => {
    try {
      const taskStr = JSON.stringify(tasks || {});
      localStorage.setItem("cached_calendar_tasks", taskStr);
      if (!fromCalendarUI && taskStr !== _lastSavedCalendarTasksJson) {
        _lastSavedCalendarTasksJson = taskStr;
        window.dispatchEvent(
          new CustomEvent("calendar_tasks_updated", {
            detail: { ...(tasks || {}), _source: "db_store" }
          }),
        );
      }
    } catch (e) { }

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CALENDAR, "readwrite");
      const store = transaction.objectStore(STORES.CALENDAR);
      const request = store.put({ id: "calendar_tasks", tasks });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存日历任务失败");
    });
  },

  // 获取日历任务
  getTasks: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CALENDAR, "readonly");
      const store = transaction.objectStore(STORES.CALENDAR);
      const request = store.get("calendar_tasks");

      request.onsuccess = () => {
        const res = request.result?.tasks;
        if (res) {
          try {
            localStorage.setItem("cached_calendar_tasks", JSON.stringify(res));
          } catch (e) { }
          resolve(res);
        } else {
          resolve({});
        }
      };
      request.onerror = () => reject("获取日历任务失败");
    });
  },

  // 删除日历任务
  deleteTasks: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CALENDAR, "readwrite");
      const store = transaction.objectStore(STORES.CALENDAR);
      const request = store.delete("calendar_tasks");

      request.onsuccess = () => resolve();
      request.onerror = () => reject("删除日历任务失败");
    });
  },
};

// 区域数据存储操作
const areaStore = {
  // 保存选中区域
  saveSelectedArea: async (area) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AREAS, "readwrite");
      const store = transaction.objectStore(STORES.AREAS);
      const request = store.put({ id: "selected_area", ...area });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存选中区域失败");
    });
  },

  // 获取选中区域
  getSelectedArea: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AREAS, "readonly");
      const store = transaction.objectStore(STORES.AREAS);
      const request = store.get("selected_area");

      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject("获取选中区域失败");
    });
  },

  // 保存区域列表
  saveAreas: async (areas) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AREAS, "readwrite");
      const store = transaction.objectStore(STORES.AREAS);
      const request = store.put({ id: "saved_areas", areas });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("保存区域列表失败");
    });
  },

  // 获取区域列表
  getAreas: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AREAS, "readonly");
      const store = transaction.objectStore(STORES.AREAS);
      const request = store.get("saved_areas");

      request.onsuccess = () => resolve(request.result?.areas || []);
      request.onerror = () => reject("获取区域列表失败");
    });
  },

  // 删除区域数据
  deleteAreaData: async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.AREAS, "readwrite");
      const store = transaction.objectStore(STORES.AREAS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject("删除区域数据失败");
    });
  },
};

// 迁移大结构化数据从localStorage到IndexedDB
async function migrateLargeData() {
  try {
    console.log("开始迁移大结构化数据...");

    // 迁移世界书数据
    const worldBookData = localStorage.getItem("world_book_data");
    if (worldBookData) {
      try {
        const data = JSON.parse(worldBookData);
        await worldBookStore.saveData(data);
        console.log("世界书数据迁移成功");
        localStorage.removeItem("world_book_data");
      } catch (e) {
        console.error("迁移世界书数据失败:", e);
      }
    }

    // 迁移关系数据
    const relationshipData = localStorage.getItem("relationship_data");
    if (relationshipData) {
      try {
        const data = JSON.parse(relationshipData);
        await relationshipStore.saveData(data);
        console.log("关系数据迁移成功");
        localStorage.removeItem("relationship_data");
      } catch (e) {
        console.error("迁移关系数据失败:", e);
      }
    }

    // 迁移日历任务
    const calendarTasks = localStorage.getItem("日历任务");
    if (calendarTasks) {
      try {
        const tasks = JSON.parse(calendarTasks);
        await calendarStore.saveTasks(tasks);
        console.log("日历任务迁移成功");
        localStorage.removeItem("日历任务");
      } catch (e) {
        console.error("迁移日历任务失败:", e);
      }
    }

    // 迁移选中区域
    const selectedAreaData = localStorage.getItem("selected_area");
    if (selectedAreaData) {
      try {
        const area = JSON.parse(selectedAreaData);
        await areaStore.saveSelectedArea(area);
        console.log("选中区域迁移成功");
        localStorage.removeItem("selected_area");
      } catch (e) {
        console.error("迁移选中区域失败:", e);
      }
    }

    // 迁移保存的区域列表
    const savedAreasData = localStorage.getItem("saved_areas");
    if (savedAreasData) {
      try {
        const areas = JSON.parse(savedAreasData);
        await areaStore.saveAreas(areas);
        console.log("保存的区域列表迁移成功");
        localStorage.removeItem("saved_areas");
      } catch (e) {
        console.error("迁移保存的区域列表失败:", e);
      }
    }

    console.log("大结构化数据迁移完成");
    return true;
  } catch (error) {
    console.error("迁移大结构化数据失败:", error);
    return false;
  }
}

// 书籍存储操作
const bookStore = {
  // 获取所有书籍
  getAll: async () => {
    try {
      // 先检查并确保存储存在
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(STORES.BOOKS, "readonly");
          const store = transaction.objectStore(STORES.BOOKS);
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject("获取书籍失败");
        } catch (error) {
          console.error("事务或存储操作失败:", error);
          // 如果存储不存在，返回空数组
          resolve([]);
        }
      });
    } catch (error) {
      console.error("获取书籍时检查存储失败:", error);
      // 出错时返回空数组，避免React组件渲染失败
      return [];
    }
  },

  // 保存书籍
  save: async (book) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.BOOKS, "readwrite");
        const store = transaction.objectStore(STORES.BOOKS);
        const request = store.put(book);

        request.onsuccess = () => resolve(book);
        request.onerror = () => reject("保存书籍失败");
      });
    } catch (error) {
      console.error("保存书籍时检查存储失败:", error);
      throw error;
    }
  },

  // 保存所有书籍
  saveAll: async (books) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.BOOKS, "readwrite");
        const store = transaction.objectStore(STORES.BOOKS);

        let completed = 0;
        const total = books.length;

        books.forEach((book) => {
          const request = store.put(book);
          request.onsuccess = () => {
            completed++;
            if (completed === total) {
              resolve(books);
            }
          };
          request.onerror = () => {
            reject("保存书籍失败");
          };
        });

        if (total === 0) {
          resolve([]);
        }
      });
    } catch (error) {
      console.error("保存所有书籍时检查存储失败:", error);
      throw error;
    }
  },

  // 删除书籍
  delete: async (bookId) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.BOOKS, "readwrite");
        const store = transaction.objectStore(STORES.BOOKS);
        const request = store.delete(bookId);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject("删除书籍失败");
      });
    } catch (error) {
      console.error("删除书籍时检查存储失败:", error);
      throw error;
    }
  },

  // 获取书籍内容
  getContent: async (bookId) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          STORES.BOOK_CONTENTS,
          "readonly",
        );
        const store = transaction.objectStore(STORES.BOOK_CONTENTS);
        const request = store.get(bookId);

        request.onsuccess = () =>
          resolve(request.result ? request.result.content : null);
        request.onerror = () => reject("获取书籍内容失败");
      });
    } catch (error) {
      console.error("获取书籍内容时检查存储失败:", error);
      throw error;
    }
  },

  // 保存书籍内容
  saveContent: async (bookId, content) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          STORES.BOOK_CONTENTS,
          "readwrite",
        );
        const store = transaction.objectStore(STORES.BOOK_CONTENTS);
        const request = store.put({ id: bookId, content });

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject("保存书籍内容失败");
      });
    } catch (error) {
      console.error("保存书籍内容时检查存储失败:", error);
      throw error;
    }
  },

  // 删除书籍内容
  deleteContent: async (bookId) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          STORES.BOOK_CONTENTS,
          "readwrite",
        );
        const store = transaction.objectStore(STORES.BOOK_CONTENTS);
        const request = store.delete(bookId);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject("删除书籍内容失败");
      });
    } catch (error) {
      console.error("删除书籍内容时检查存储失败:", error);
      throw error;
    }
  },

  // 更新书籍进度
  updateProgress: async (bookId, progress) => {
    try {
      await ensureStoresExist();
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES.BOOKS, "readwrite");
        const store = transaction.objectStore(STORES.BOOKS);
        const getRequest = store.get(bookId);

        getRequest.onsuccess = () => {
          const book = getRequest.result;
          if (book) {
            book.progress = progress;
            const putRequest = store.put(book);
            putRequest.onsuccess = () => resolve(book);
            putRequest.onerror = () => reject("更新书籍进度失败");
          } else {
            reject("书籍不存在");
          }
        };
        getRequest.onerror = () => reject("获取书籍失败");
      });
    } catch (error) {
      console.error("更新书籍进度时检查存储失败:", error);
      throw error;
    }
  },
};

// 迁移书籍数据
async function migrateBookData() {
  try {
    console.log("开始迁移书籍数据...");

    // 1. 读取localStorage中的书籍元数据
    const savedMeta = localStorage.getItem("morandi_books_meta");
    if (savedMeta) {
      const books = JSON.parse(savedMeta);

      // 2. 保存书籍元数据到IndexedDB
      await bookStore.saveAll(books);
      console.log("书籍元数据迁移成功:", books.length, "本");

      // 3. 迁移书籍内容
      for (const book of books) {
        const contentKey = `book_content_${book.id}`;
        const content = localStorage.getItem(contentKey);
        if (content) {
          await bookStore.saveContent(book.id, content);
          console.log(`书籍内容迁移成功: ${book.title}`);
          // 清理localStorage中的内容
          localStorage.removeItem(contentKey);
        }
      }

      // 4. 清理localStorage中的元数据
      localStorage.removeItem("morandi_books_meta");
      console.log("书籍数据迁移完成");
      return true;
    } else {
      console.log("未找到localStorage中的书籍数据");
      return false;
    }
  } catch (error) {
    console.error("迁移书籍数据失败:", error);
    return false;
  }
}

// 全量导出备份数据 (IndexedDB t8_chat_db + IndexedDB AppStorage + localStorage)
async function exportAllDatabaseData() {
  try {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);
    const indexedDBData = {};

    // 1. 导出 IndexedDB (t8_chat_db) 所有 Store 数据
    for (const storeName of storeNames) {
      try {
        const records = await new Promise((resolve) => {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
        indexedDBData[storeName] = records;
      } catch (err) {
        console.warn(`导出 store [${storeName}] 异常:`, err);
        indexedDBData[storeName] = [];
      }
    }

    // 2. 导出 IndexedDB (AppStorage) settings store (包含桌面壁纸、锁屏壁纸、折叠卡片壁纸、主题模式、自定义图标、微善堂、统计数据等)
    const appStorageData = {};
    try {
      if (typeof indexedDB !== "undefined") {
        const appDb = await new Promise((resolve) => {
          const req = indexedDB.open("AppStorage", 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (appDb && appDb.objectStoreNames.contains("settings")) {
          const records = await new Promise((resolve) => {
            const tx = appDb.transaction("settings", "readonly");
            const store = tx.objectStore("settings");
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });
          records.forEach((item) => {
            if (item && item.id) {
              appStorageData[item.id] = item.value;
            }
          });
        }
      }
    } catch (e) {
      console.warn("导出 AppStorage 异常:", e);
    }

    // 3. 导出 localStorage 全量键值 (包含长期记忆 t8_memory_config、折叠卡片 t8_foldcard_config、锁屏 t8_lockscreen_config、人设、字体、API配置等)
    const localStorageData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        localStorageData[key] = localStorage.getItem(key);
      }
    }

    // 4. 解析关键统计信息 (长期记忆、设定文档、主题壁纸、锁屏卡片)
    let memoriesCount = 0;
    try {
      const memConfig = JSON.parse(localStorageData["t8_memory_config"] || "{}");
      memoriesCount = Array.isArray(memConfig.memories) ? memConfig.memories.length : 0;
    } catch (e) {}

    const userSettingsList = indexedDBData[STORES.USER_SETTINGS] || [];
    const characterDocsCount = userSettingsList.filter((item) => item && typeof item.key === "string" && item.key.startsWith("character_doc_")).length;
    const hasThemeSettings = !!(appStorageData["home_bg_image"] || appStorageData["app_theme_mode"] || localStorageData["custom_font_url"] || localStorageData["page_background"]);
    const hasLockscreenSettings = !!(appStorageData["lockscreen_bg_image"] || localStorageData["t8_lockscreen_config"]);
    const hasFoldcardSettings = !!(appStorageData["foldcard_bg_image"] || localStorageData["t8_foldcard_config"]);

    // 5. 打包全量元数据
    const backupPayload = {
      meta: {
        appName: "Milvus-Phone",
        version: "2.0",
        dbVersion: DB_VERSION,
        exportTime: new Date().toISOString(),
        timestamp: Date.now(),
        summary: {
          charactersCount: (indexedDBData[STORES.CHAT_CHARACTERS] || []).length,
          chatHistoryCount: (indexedDBData[STORES.CHAT_HISTORY] || []).length,
          avatarsCount: (indexedDBData[STORES.AVATARS] || []).length,
          worldBookCount: (indexedDBData[STORES.WORLD_BOOK] || []).length,
          backpackCount: (indexedDBData[STORES.BACKPACK] || []).length,
          memoriesCount,
          characterDocsCount,
          hasThemeSettings,
          hasLockscreenSettings,
          hasFoldcardSettings,
          localStorageKeysCount: Object.keys(localStorageData).length,
          appStorageKeysCount: Object.keys(appStorageData).length,
        },
      },
      localStorage: localStorageData,
      indexedDB: indexedDBData,
      appStorage: appStorageData,
    };

    return backupPayload;
  } catch (error) {
    console.error("全量导出失败:", error);
    throw error;
  }
}

// 全量导入还原备份数据
async function importAllDatabaseData(backupPayload, mode = "overwrite") {
  try {
    if (!backupPayload || typeof backupPayload !== "object") {
      throw new Error("无效的备份文件格式！");
    }

    const hasIndexedDB =
      backupPayload.indexedDB && typeof backupPayload.indexedDB === "object";
    const hasLocalStorage =
      backupPayload.localStorage &&
      typeof backupPayload.localStorage === "object";
    const hasAppStorage =
      backupPayload.appStorage &&
      typeof backupPayload.appStorage === "object";

    if (!hasIndexedDB && !hasLocalStorage && !hasAppStorage) {
      throw new Error("备份文件中未包含有效的数据内容！");
    }

    // 1. 还原 localStorage (包含长期记忆、折叠卡片配置、锁屏配置、人设、字体、API配置等)
    if (hasLocalStorage) {
      if (mode === "overwrite") {
        localStorage.clear();
      }
      for (const [key, value] of Object.entries(backupPayload.localStorage)) {
        if (value !== null && value !== undefined) {
          localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        }
      }
    }

    // 2. 还原 IndexedDB (t8_chat_db)
    if (hasIndexedDB) {
      const db = await openDB();
      for (const [storeName, records] of Object.entries(
        backupPayload.indexedDB,
      )) {
        if (
          !db.objectStoreNames.contains(storeName) ||
          !Array.isArray(records)
        ) {
          continue;
        }

        await new Promise((resolve) => {
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);

          if (mode === "overwrite") {
            store.clear();
          }

          for (const item of records) {
            try {
              store.put(item);
            } catch (e) {
              console.warn(`写入 store [${storeName}] 记录失败:`, e, item);
            }
          }

          tx.oncomplete = () => resolve();
          tx.onerror = (e) => {
            console.error(`Store [${storeName}] 写入事务失败:`, e);
            resolve();
          };
        });
      }
    }

    // 3. 还原 IndexedDB (AppStorage) (包含桌面壁纸、锁屏壁纸、折叠卡片壁纸、主题模式、图标等)
    if (hasAppStorage && typeof indexedDB !== "undefined") {
      try {
        const appDb = await new Promise((resolve) => {
          const req = indexedDB.open("AppStorage", 1);
          req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains("settings")) {
              db.createObjectStore("settings", { keyPath: "id" });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (appDb && appDb.objectStoreNames.contains("settings")) {
          await new Promise((resolve) => {
            const tx = appDb.transaction("settings", "readwrite");
            const store = tx.objectStore("settings");
            if (mode === "overwrite") {
              store.clear();
            }
            for (const [key, value] of Object.entries(backupPayload.appStorage)) {
              store.put({ id: key, value });
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          });
        }
      } catch (e) {
        console.warn("恢复 AppStorage 异常:", e);
      }
    }

    return {
      success: true,
      restoredStores: hasIndexedDB
        ? Object.keys(backupPayload.indexedDB).length
        : 0,
      restoredLocalStorageKeys: hasLocalStorage
        ? Object.keys(backupPayload.localStorage).length
        : 0,
      restoredAppStorageKeys: hasAppStorage
        ? Object.keys(backupPayload.appStorage).length
        : 0,
    };
  } catch (error) {
    console.error("全量导入恢复失败:", error);
    throw error;
  }
}

// 暴露全局变量，确保在React组件中可用

// ✅ 新增：太疾驰配送订单存储操作对象 (IndexedDB + localStorage 双重同步)
const deliveryOrderStore = {
  getAll: async () => {
    try {
      const raw = localStorage.getItem("tjc_delivery_orders");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("读取太疾驰配送订单失败", e);
      return [];
    }
  },
  saveAll: async (orders) => {
    try {
      localStorage.setItem("tjc_delivery_orders", JSON.stringify(orders || []));
      window.dispatchEvent(new CustomEvent("deliveryOrdersUpdated"));
      return true;
    } catch (e) {
      console.error("保存太疾驰配送订单失败", e);
      return false;
    }
  },
  addOrder: async (orderData) => {
    try {
      const orders = await deliveryOrderStore.getAll();
      const now = Date.now();
      const durationMinutes = orderData.durationMinutes || (Math.floor(Math.random() * 3) + 2);
      const newOrder = {
        id: orderData.id || `TJC_${now}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        orderTime: now,
        estimatedDeliveryTime: now + durationMinutes * 60 * 1000,
        durationMinutes: durationMinutes,
        merchantName: orderData.merchantName || "太疾驰合作商家",
        merchantLocation: orderData.merchantLocation || "洛阳城繁华东市",
        userAddress: orderData.userAddress || "广陵王府·听雨阁",
        courier: orderData.courier || {
          name: "太疾驰快马骑手·戴宗",
          avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=DaiZong",
          vehicle: "神行千里马",
          rating: 4.98,
          phone: "传讯灵佩 #9527"
        },
        items: orderData.items || [],
        totalPriceStr: orderData.totalPriceStr || "0钱",
        totalBase: orderData.totalBase || 0,
        payMethod: orderData.payMethod || "self",
        payerRoleName: orderData.payerRoleName || "",
        status: "delivering", // delivering | delivered | completed
        rushCount: 0,
        ...orderData
      };
      orders.unshift(newOrder);
      await deliveryOrderStore.saveAll(orders);
      return newOrder;
    } catch (e) {
      console.error("新增配送订单失败", e);
      return null;
    }
  },
  completeOrder: async (orderId) => {
    try {
      const orders = await deliveryOrderStore.getAll();
      const target = orders.find(o => o.id === orderId);
      if (target && target.status !== "completed") {
        target.status = "completed";
        target.completedTime = Date.now();
        // 将商品存入背包
        if (window.backpackStore && target.items && target.items.length > 0) {
          await window.backpackStore.addItems(target.items);
        }
        await deliveryOrderStore.saveAll(orders);
        return true;
      }
      return false;
    } catch (e) {
      console.error("确认收货入库失败", e);
      return false;
    }
  },
  rushDelivery: async (orderId) => {
    try {
      const orders = await deliveryOrderStore.getAll();
      const target = orders.find(o => o.id === orderId);
      if (target && target.status === "delivering") {
        target.rushCount = (target.rushCount || 0) + 1;
        // 每次催单加速 35 秒
        target.estimatedDeliveryTime = Math.max(Date.now(), target.estimatedDeliveryTime - 35000);
        await deliveryOrderStore.saveAll(orders);
        return target;
      }
      return null;
    } catch (e) {
      console.error("催单失败", e);
      return null;
    }
  },
  deleteOrder: async (orderId) => {
    try {
      let orders = await deliveryOrderStore.getAll();
      orders = orders.filter(o => o.id !== orderId);
      await deliveryOrderStore.saveAll(orders);
      return true;
    } catch (e) {
      console.error("删除订单失败", e);
      return false;
    }
  },
  checkAutoDelivery: async () => {
    try {
      const orders = await deliveryOrderStore.getAll();
      const now = Date.now();
      let changed = false;
      for (const order of orders) {
        // 倒计时结束后变更为 delivered (已送达·待签收)，依然保留在【待收货】中由主公亲手点击签收
        if (order.status === "delivering" && now >= order.estimatedDeliveryTime) {
          order.status = "delivered";
          order.deliveredTime = now;
          changed = true;
        }
      }
      if (changed) {
        await deliveryOrderStore.saveAll(orders);
      }
    } catch (e) {
      console.error("检查自动配送履约失败", e);
    }
  }
};
window.deliveryOrderStore = deliveryOrderStore;

// ==================== 角色专属长篇人设与记忆文档存储 (characterDocStore) ====================
const characterDocStore = {
  // 获取某个角色的所有专属文档
  getByCharacterId: async (characterId) => {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get(`char_docs_${characterId}`);
        req.onsuccess = () => resolve(req.result?.value || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        console.error("读取角色专属文档失败:", e);
        resolve([]);
      }
    });
  },

  // 保存某个角色的所有文档
  saveDocs: async (characterId, docs) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: `char_docs_${characterId}`, value: docs });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("保存文档失败");
      } catch (e) {
        reject(e);
      }
    });
  },

  // 添加单篇文档
  addDoc: async (characterId, docItem) => {
    const existing = await characterDocStore.getByCharacterId(characterId);
    const updated = [docItem, ...existing.filter((d) => d.id !== docItem.id)];
    await characterDocStore.saveDocs(characterId, updated);
    return updated;
  },

  // 删除单篇文档
  deleteDoc: async (characterId, docId) => {
    const existing = await characterDocStore.getByCharacterId(characterId);
    const updated = existing.filter((d) => d.id !== docId);
    await characterDocStore.saveDocs(characterId, updated);
    return updated;
  },

  // 切换文档启用/停用状态
  toggleDoc: async (characterId, docId) => {
    const existing = await characterDocStore.getByCharacterId(characterId);
    const updated = existing.map((d) =>
      d.id === docId ? { ...d, enabled: !d.enabled } : d
    );
    await characterDocStore.saveDocs(characterId, updated);
    return updated;
  },

  // 获取该角色所有已启用文档拼接文本（供 AI 提示词与互动读取）
  getEnabledDocContext: async (characterId) => {
    if (!characterId) return "";
    try {
      const docs = await characterDocStore.getByCharacterId(characterId);
      const enabledDocs = docs.filter(
        (d) => d.enabled !== false && d.content && d.content.trim()
      );
      if (enabledDocs.length === 0) return "";
      return enabledDocs
        .map(
          (d) =>
            `【角色专属长篇设定/生平档案《${d.name}》】\n${d.content.trim()}`
        )
        .join("\n\n");
    } catch (e) {
      console.error("获取已启用角色文档文本失败:", e);
      return "";
    }
  },
};
window.characterDocStore = characterDocStore;


// ==================== 全量备份导出与恢复引擎 (exportAllDatabaseData / importAllDatabaseData) ====================

// 全量导出备份数据 (IndexedDB + localStorage + 装扮配置)
async function exportAllDatabaseData() {
  try {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);
    const indexedDBData = {};

    // 1. 导出 IndexedDB 所有 Store 数据
    for (const storeName of storeNames) {
      try {
        const records = await new Promise((resolve) => {
          try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
            tx.onerror = () => resolve([]);
            tx.onabort = () => resolve([]);
          } catch (txErr) {
            console.warn(`[导出] 读取 store [${storeName}] 异常:`, txErr);
            resolve([]);
          }
        });
        indexedDBData[storeName] = records;
      } catch (err) {
        console.warn(`导出 store [${storeName}] 异常:`, err);
        indexedDBData[storeName] = [];
      }
    }

    // 2. 导出 localStorage 全量键值
    const localStorageData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        localStorageData[key] = localStorage.getItem(key);
      }
    }

    // 3. 打包元数据
    const backupPayload = {
      meta: {
        appName: "Milvus-Phone",
        version: "2.0",
        dbVersion: DB_VERSION,
        exportTime: new Date().toISOString(),
        timestamp: Date.now(),
        summary: {
          charactersCount: (indexedDBData[STORES.CHAT_CHARACTERS] || []).length,
          chatHistoryCount: (indexedDBData[STORES.CHAT_HISTORY] || []).length,
          avatarsCount: (indexedDBData[STORES.AVATARS] || []).length,
          worldBookCount: (indexedDBData[STORES.WORLD_BOOK] || []).length,
          backpackCount: (indexedDBData[STORES.BACKPACK] || []).length,
          localStorageKeysCount: Object.keys(localStorageData).length,
        },
      },
      localStorage: localStorageData,
      indexedDB: indexedDBData,
    };

    return backupPayload;
  } catch (error) {
    console.error("全量导出失败:", error);
    throw error;
  }
}

// 全量导入还原备份数据
async function importAllDatabaseData(backupPayload, mode = "overwrite") {
  try {
    if (!backupPayload || typeof backupPayload !== "object") {
      throw new Error("无效的备份文件格式！");
    }

    const hasIndexedDB =
      backupPayload.indexedDB && typeof backupPayload.indexedDB === "object";
    const hasLocalStorage =
      backupPayload.localStorage &&
      typeof backupPayload.localStorage === "object";
    const hasAppStorage =
      backupPayload.appStorage &&
      typeof backupPayload.appStorage === "object";

    if (!hasIndexedDB && !hasLocalStorage && !hasAppStorage) {
      throw new Error("备份文件中未包含有效的数据内容！");
    }

    // 1. 还原 localStorage / appStorage
    if (hasLocalStorage) {
      if (mode === "overwrite") {
        localStorage.clear();
      }
      for (const [key, value] of Object.entries(backupPayload.localStorage)) {
        if (value !== null && value !== undefined) {
          try {
            localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
          } catch (e) {}
        }
      }
    }

    if (hasAppStorage) {
      for (const [key, value] of Object.entries(backupPayload.appStorage)) {
        if (value !== null && value !== undefined) {
          try {
            localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
          } catch (e) {}
        }
      }
    }

    // 2. 还原 IndexedDB
    if (hasIndexedDB) {
      const db = await openDB();
      if (mode === "overwrite") {
        // 先清空当前数据库内所有已存在的 store，避免新备份未包含的旧 store（如 userSettings 里的旧密探立绘）残留
        const allStoreNames = Array.from(db.objectStoreNames || []);
        for (const existingStore of allStoreNames) {
          await new Promise((resolve) => {
            let done = false;
            const finishClear = () => {
              if (!done) {
                done = true;
                resolve();
              }
            };
            try {
              const clearTx = db.transaction(existingStore, "readwrite");
              clearTx.objectStore(existingStore).clear();
              clearTx.oncomplete = finishClear;
              clearTx.onerror = finishClear;
              clearTx.onabort = finishClear;
            } catch (e) {
              finishClear();
            }
            setTimeout(finishClear, 3000);
          });
        }
      }
      const storeEntries = Object.entries(backupPayload.indexedDB);

      for (const [storeName, records] of storeEntries) {
        if (
          !db.objectStoreNames.contains(storeName) ||
          !Array.isArray(records)
        ) {
          continue;
        }

        await new Promise((resolve) => {
          let isFinished = false;
          const finish = () => {
            if (!isFinished) {
              isFinished = true;
              resolve();
            }
          };

          try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);

            tx.oncomplete = () => finish();
            tx.onerror = (e) => {
              console.warn(`[导入] Store [${storeName}] 事务异常:`, e);
              finish();
            };
            tx.onabort = () => {
              console.warn(`[导入] Store [${storeName}] 事务中断`);
              finish();
            };

            if (mode === "overwrite") {
              try {
                store.clear();
              } catch (e) {}
            }

            for (const item of records) {
              if (item !== null && item !== undefined) {
                try {
                  if (storeName === STORES.CHAT_HISTORY) {
                    if (!item.characterId || !item.id) continue;
                  }
                  store.put(item);
                } catch (putErr) {
                  console.warn(`[导入] 写入 store [${storeName}] 单条记录失败:`, putErr, item);
                }
              }
            }
          } catch (txCreateErr) {
            console.error(`[导入] 创建 Store [${storeName}] 事务失败:`, txCreateErr);
            finish();
          }

          // 5秒超时安全熔断保底，杜绝转圈死锁
          setTimeout(finish, 5000);
        });
      }
    }

    return {
      success: true,
      restoredStores: hasIndexedDB
        ? Object.keys(backupPayload.indexedDB).length
        : 0,
      restoredLocalStorageKeys: hasLocalStorage
        ? Object.keys(backupPayload.localStorage).length
        : 0,
    };
  } catch (error) {
    console.error("全量导入恢复失败:", error);
    throw error;
  }
}

window.exportAllDatabaseData = exportAllDatabaseData;
window.importAllDatabaseData = importAllDatabaseData;

window.settingsStore = settingsStore;
window.migrateUserData = migrateUserData;
window.chatCharacterStore = chatCharacterStore;
window.chatHistoryStore = chatHistoryStore;
window.migrateChatData = migrateChatData;
window.worldBookStore = worldBookStore;
window.relationshipStore = relationshipStore;
window.calendarStore = calendarStore;
window.areaStore = areaStore;
window.bookStore = bookStore;
window.avatarStore = avatarStore;
window.migrateBookData = migrateBookData;
window.migrateLargeData = migrateLargeData;


// 方天水镜专属 IndexedDB 存储操作
const waterMirrorStore = {
  get: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(parsed);
            } catch (e) {
              resolve(req.result.value);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("waterMirrorStore.get error:", e);
      return null;
    }
  },

  set: async (key, val) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: key, value: val, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("写入水镜数据失败");
      });
    } catch (e) {
      console.error("waterMirrorStore.set error:", e);
    }
  },

  delete: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {
      console.error("waterMirrorStore.delete error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.waterMirrorStore = waterMirrorStore;
}


// 东汉驿路通专属 IndexedDB 存储操作
const yilutongStore = {
  get: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(parsed);
            } catch (e) {
              resolve(req.result.value);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("yilutongStore.get error:", e);
      return null;
    }
  },

  set: async (key, val) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: key, value: val, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("写入驿路通数据失败");
      });
    } catch (e) {
      console.error("yilutongStore.set error:", e);
    }
  },

  delete: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {
      console.error("yilutongStore.delete error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.yilutongStore = yilutongStore;
}


// 谶纬小摊专属 IndexedDB 存储操作
const fortuneStore = {
  getSaves: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("fortune_saves");
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
              resolve(Array.isArray(req.result.value) ? req.result.value : []);
            }
          } else {
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      console.error("fortuneStore.getSaves error:", e);
      return [];
    }
  },

  saveSaves: async (saves) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: "fortune_saves", value: saves, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("保存谶纬记录失败");
      });
    } catch (e) {
      console.error("fortuneStore.saveSaves error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.fortuneStore = fortuneStore;
}


// 沙盘模拟器专属 IndexedDB 存储操作
const sandtableStore = {
  getSaves: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("sandtable_saves");
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
              resolve(Array.isArray(req.result.value) ? req.result.value : []);
            }
          } else {
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      console.error("sandtableStore.getSaves error:", e);
      return [];
    }
  },

  saveSaves: async (saves) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: "sandtable_saves", value: saves, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("保存沙盘战局失败");
      });
    } catch (e) {
      console.error("sandtableStore.saveSaves error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.sandtableStore = sandtableStore;
}


// 相对演绎专属 IndexedDB 存储操作
const deductionStore = {
  getSaves: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("relative_deduction_saves");
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
              resolve(Array.isArray(req.result.value) ? req.result.value : []);
            }
          } else {
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      console.error("deductionStore.getSaves error:", e);
      return [];
    }
  },

  saveSaves: async (saves) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: "relative_deduction_saves", value: saves, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("保存戏折剧本失败");
      });
    } catch (e) {
      console.error("deductionStore.saveSaves error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.deductionStore = deductionStore;
}


// 蝴蝶效应专属 IndexedDB 存储操作
const butterflyStore = {
  getMode: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("butterfly_mode");
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            resolve(req.result.value);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("butterflyStore.getMode error:", e);
      return null;
    }
  },

  setMode: async (mode) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: "butterfly_mode", value: mode, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("保存蝴蝶效应模式失败");
      });
    } catch (e) {
      console.error("butterflyStore.setMode error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.butterflyStore = butterflyStore;
}


// 学习系统专属 IndexedDB 存储操作
const learningStore = {
  get: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(parsed);
            } catch (e) {
              resolve(req.result.value);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("learningStore.get error:", e);
      return null;
    }
  },

  set: async (key, val) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: key, value: val, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("写入学习数据失败");
      });
    } catch (e) {
      console.error("learningStore.set error:", e);
    }
  },

  delete: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {
      console.error("learningStore.delete error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.learningStore = learningStore;
}


// 州郡统计年表专属 IndexedDB 存储操作
const statisticsStore = {
  getData: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("t13_statistics_data_v2");
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(parsed);
            } catch (e) {
              resolve(req.result.value);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("statisticsStore.getData error:", e);
      return null;
    }
  },

  saveData: async (payload) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: "t13_statistics_data_v2", value: payload, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("保存州郡统计年表失败");
      });
    } catch (e) {
      console.error("statisticsStore.saveData error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.statisticsStore = statisticsStore;
}


// 团建活动与金库专属 IndexedDB 存储操作
const teambuildingStore = {
  getCoins: async () => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get("farm_coins");
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            const num = parseInt(req.result.value, 10);
            resolve(isNaN(num) ? 500 : num);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("teambuildingStore.getCoins error:", e);
      return null;
    }
  },

  setCoins: async (coins) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: "farm_coins", value: Number(coins), updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("更新金库余额失败");
      });
    } catch (e) {
      console.error("teambuildingStore.setCoins error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.teambuildingStore = teambuildingStore;
}


// 心纸居专属 IndexedDB 存储操作
const mansionStore = {
  get: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            try {
              const parsed = typeof req.result.value === "string" ? JSON.parse(req.result.value) : req.result.value;
              resolve(parsed);
            } catch (e) {
              resolve(req.result.value);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error("mansionStore.get error:", e);
      return null;
    }
  },

  set: async (key, val) => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.put({ key: key, value: val, updatedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject("写入心纸居数据失败");
      });
    } catch (e) {
      console.error("mansionStore.set error:", e);
    }
  },

  delete: async (key) => {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const store = tx.objectStore(STORES.USER_SETTINGS);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {
      console.error("mansionStore.delete error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.mansionStore = mansionStore;
  window.xinzhiStore = mansionStore;
}

// 朋友圈 / 动态存储引擎 (IndexedDB)
const momentsStore = {
  // 获取全部朋友圈动态
  getMoments: async () => {
    try {
      // 1. 优先尝试从 CHAT_CHARACTERS 获取
      if (typeof window !== "undefined" && window.chatCharacterStore && typeof window.chatCharacterStore.getAll === "function") {
        try {
          const allItems = await window.chatCharacterStore.getAll();
          const momentsItem = (allItems || []).find((item) => item.type === "moments");
          if (momentsItem && momentsItem.data && Array.isArray(momentsItem.data) && momentsItem.data.length > 0) {
            return momentsItem.data;
          }
        } catch (e) {}
      }

      // 2. 尝试从 USER_SETTINGS 获取
      const db = await openDB();
      const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      const req = store.get("t8_moments_data");
      const res = await new Promise((resolve) => {
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            resolve(req.result.value);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
      if (res && Array.isArray(res) && res.length > 0) {
        return res;
      }

      // 3. Fallback: 从旧 localStorage 迁移
      try {
        const local = localStorage.getItem("t8_moments");
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // 异步自动写入 IndexedDB
            momentsStore.saveMoments(parsed).catch(() => {});
            return parsed;
          }
        }
      } catch (e) {}

      return [];
    } catch (e) {
      console.error("momentsStore.getMoments error:", e);
      return [];
    }
  },

  // 保存全部朋友圈动态
  saveMoments: async (moments) => {
    try {
      const db = await openDB();
      // 1. 写入 USER_SETTINGS
      const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      store.put({ key: "t8_moments_data", value: moments, updatedAt: Date.now() });

      // 2. 同步写入 CHAT_CHARACTERS 表 (兼容已有逻辑)
      if (typeof window !== "undefined" && window.chatCharacterStore && typeof window.chatCharacterStore.save === "function") {
        await window.chatCharacterStore.save({
          id: "moments_data",
          type: "moments",
          data: moments,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }

      // 3. 清理 localStorage 中的旧大对象，释放 5MB 配额
      try {
        localStorage.removeItem("t8_moments");
      } catch (err) {}

      // 4. 发送全局更新事件
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("momentsUpdated", { detail: { moments } }));
      }
      return true;
    } catch (e) {
      console.error("momentsStore.saveMoments error:", e);
      return false;
    }
  },

  // 获取朋友圈空间个性化资料（背景图、头像、个性签名等）
  getSpaceProfile: async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      const req = store.get("t8_space_profile");
      const res = await new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result?.value || null);
        req.onerror = () => resolve(null);
      });
      if (res) return res;

      try {
        const local = localStorage.getItem("t8_space_profile");
        if (local) {
          const parsed = JSON.parse(local);
          momentsStore.saveSpaceProfile(parsed).catch(() => {});
          return parsed;
        }
      } catch (e) {}

      return null;
    } catch (e) {
      return null;
    }
  },

  // 保存朋友圈空间个性化资料
  saveSpaceProfile: async (profile) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
      const store = tx.objectStore(STORES.USER_SETTINGS);
      store.put({ key: "t8_space_profile", value: profile, updatedAt: Date.now() });
      try {
        localStorage.removeItem("t8_space_profile");
      } catch (err) {}
      return true;
    } catch (e) {
      console.error("momentsStore.saveSpaceProfile error:", e);
      return false;
    }
  }
};

if (typeof window !== "undefined") {
  window.momentsStore = momentsStore;
}

// ==========================================
// 【关键核心数据保护与自动无损回写引擎】
// ==========================================
const CRITICAL_KEYS_PROTECTED = [
  "user_personas",
  "active_persona_id",
  "messaging_characters",
  "user_name",
  "player_name",
  "t8_user_nickname",
  "user_avatar",
  "t8_user_avatar",
  "t8_user_avatar_frame",
  "minimax_api_config",
  "image_generation_api_config",
  "mcp_servers_config",
  "app_theme",
  "app_font",
  "t8_memory_config"
];

// 启动时自动从 IndexedDB 将身份库与核心配置拉取并安全恢复到 localStorage
async function restoreEssentialDataFromIndexedDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
    const store = tx.objectStore(STORES.USER_SETTINGS);

    for (const key of CRITICAL_KEYS_PROTECTED) {
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result;
        if (res && res.value) {
          const currentLocal = localStorage.getItem(key);
          if (!currentLocal || currentLocal === "[]" || currentLocal === "{}" || currentLocal === "") {
            const valStr = typeof res.value === "string" ? res.value : JSON.stringify(res.value);
            localStorage.setItem(key, valStr);
            console.log(`[Restore] 已从 IndexedDB 成功恢复核心配置: ${key}`);
          }
        }
      };
    }
  } catch(e) {
    console.error("恢复核心配置失败:", e);
  }
}

// 自动瘦身与大对象无损迁移引擎 (仅针对脱机超大立绘/缓存对象，严格保护用户身份库与配置)
async function optimizeLocalStorage() {
  let freedBytes = 0;
  const migratedKeys = [];
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
    const store = tx.objectStore(STORES.USER_SETTINGS);

    // 仅针对确实占用数兆字节的独立立绘图片库
    const ALLOWED_MIGRATION_KEYS = [
      "t8_offline_selected_sprites",
      "t8_teambuilding_selected_sprites",
      "mansion_character_sprites"
    ];

    for (const key of ALLOWED_MIGRATION_KEYS) {
      const val = localStorage.getItem(key);
      if (!val) continue;

      const size = (key.length + val.length) * 2;
      try {
        let parsed = val;
        try { parsed = JSON.parse(val); } catch(e) {}
        store.put({ key: key, value: parsed, updatedAt: Date.now() });
        localStorage.removeItem(key);
        freedBytes += size;
        migratedKeys.push(key);
      } catch(err) {}
    }
  } catch(e) {
    console.error("optimizeLocalStorage error:", e);
  }
  return {
    freedBytes,
    freedKb: (freedBytes / 1024).toFixed(1),
    freedMb: (freedBytes / (1024 * 1024)).toFixed(2),
    migratedKeys
  };
}

// 传讯可视化报告 IndexedDB 存储操作（含 user_settings 降级兜底）
const chatReportStore = {
  _fallbackKey: "chat_reports_fallback",
  _readFallback: async (db) => {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const req = tx.objectStore(STORES.USER_SETTINGS).get("chat_reports_fallback");
        req.onsuccess = () => resolve(Array.isArray(req.result?.value) ? req.result.value : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  },
  _writeFallback: async (db, list) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const req = tx.objectStore(STORES.USER_SETTINGS).put({
          key: "chat_reports_fallback",
          value: list,
          updatedAt: Date.now()
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject("保存报告兜底失败");
      } catch (e) {
        reject(e);
      }
    });
  },
  save: async (report) => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.CHAT_REPORTS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.CHAT_REPORTS, "readwrite");
        const req = tx.objectStore(STORES.CHAT_REPORTS).put(report);
        req.onsuccess = () => resolve(report);
        req.onerror = () => reject("保存聊天报告失败");
      });
    }
    const list = await chatReportStore._readFallback(db);
    const next = [report, ...list.filter((r) => r.id !== report.id)];
    await chatReportStore._writeFallback(db, next);
    return report;
  },
  getAll: async () => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.CHAT_REPORTS)) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.CHAT_REPORTS, "readonly");
        const req = tx.objectStore(STORES.CHAT_REPORTS).getAll();
        req.onsuccess = () => {
          const res = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(res);
        };
        req.onerror = () => resolve([]);
      });
    }
    const list = await chatReportStore._readFallback(db);
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
  getByPeriod: async (periodType) => {
    const all = await chatReportStore.getAll();
    return all.filter((r) => !periodType || r.periodType === periodType);
  },
  delete: async (id) => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.CHAT_REPORTS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.CHAT_REPORTS, "readwrite");
        const req = tx.objectStore(STORES.CHAT_REPORTS).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject("删除聊天报告失败");
      });
    }
    const list = await chatReportStore._readFallback(db);
    await chatReportStore._writeFallback(db, list.filter((r) => r.id !== id));
    return true;
  }
};

// 情侣空间「故事织机」IndexedDB 存储操作（含 user_settings 降级兜底）
const storyLoomStore = {
  _readFallback: async (db) => {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const req = tx.objectStore(STORES.USER_SETTINGS).get("story_loom_fallback");
        req.onsuccess = () => resolve(Array.isArray(req.result?.value) ? req.result.value : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  },
  _writeFallback: async (db, list) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const req = tx.objectStore(STORES.USER_SETTINGS).put({
          key: "story_loom_fallback",
          value: list,
          updatedAt: Date.now()
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject("保存故事织机兜底失败");
      } catch (e) {
        reject(e);
      }
    });
  },
  save: async (story) => {
    const db = await openDB();
    const rec = { ...story, updatedAt: Date.now() };
    if (db.objectStoreNames.contains(STORES.STORY_LOOM)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.STORY_LOOM, "readwrite");
        const req = tx.objectStore(STORES.STORY_LOOM).put(rec);
        req.onsuccess = () => resolve(rec);
        req.onerror = () => reject("保存故事失败");
      });
    }
    const list = await storyLoomStore._readFallback(db);
    await storyLoomStore._writeFallback(db, [rec, ...list.filter((s) => s.id !== rec.id)]);
    return rec;
  },
  getAll: async () => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.STORY_LOOM)) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.STORY_LOOM, "readonly");
        const req = tx.objectStore(STORES.STORY_LOOM).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        req.onerror = () => resolve([]);
      });
    }
    const list = await storyLoomStore._readFallback(db);
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  getByChar: async (charId) => {
    const all = await storyLoomStore.getAll();
    return all.filter((s) => !charId || String(s.charId) === String(charId));
  },
  delete: async (id) => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.STORY_LOOM)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.STORY_LOOM, "readwrite");
        const req = tx.objectStore(STORES.STORY_LOOM).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject("删除故事失败");
      });
    }
    const list = await storyLoomStore._readFallback(db);
    await storyLoomStore._writeFallback(db, list.filter((s) => s.id !== id));
    return true;
  }
};

// 情侣空间「笔墨诗书」IndexedDB 存储操作（含 user_settings 降级兜底）
const inkPoetryStore = {
  _readFallback: async (db) => {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const req = tx.objectStore(STORES.USER_SETTINGS).get("ink_poetry_fallback");
        req.onsuccess = () => resolve(Array.isArray(req.result?.value) ? req.result.value : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  },
  _writeFallback: async (db, list) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const req = tx.objectStore(STORES.USER_SETTINGS).put({
          key: "ink_poetry_fallback",
          value: list,
          updatedAt: Date.now()
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject("保存笔墨诗书兜底失败");
      } catch (e) {
        reject(e);
      }
    });
  },
  save: async (record) => {
    const db = await openDB();
    const rec = { ...record, updatedAt: Date.now() };
    if (db.objectStoreNames.contains(STORES.INK_POETRY)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.INK_POETRY, "readwrite");
        const req = tx.objectStore(STORES.INK_POETRY).put(rec);
        req.onsuccess = () => resolve(rec);
        req.onerror = () => reject("保存作品失败");
      });
    }
    const list = await inkPoetryStore._readFallback(db);
    await inkPoetryStore._writeFallback(db, [rec, ...list.filter((s) => s.id !== rec.id)]);
    return rec;
  },
  getById: async (id) => {
    const all = await inkPoetryStore.getAll();
    return all.find((r) => r.id === id) || null;
  },
  getAll: async () => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.INK_POETRY)) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.INK_POETRY, "readonly");
        const req = tx.objectStore(STORES.INK_POETRY).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        req.onerror = () => resolve([]);
      });
    }
    const list = await inkPoetryStore._readFallback(db);
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  getByCharId: async (charId) => {
    const all = await inkPoetryStore.getAll();
    return all.filter((s) => !charId || String(s.charId) === String(charId));
  },
  delete: async (id) => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.INK_POETRY)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.INK_POETRY, "readwrite");
        const req = tx.objectStore(STORES.INK_POETRY).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject("删除作品失败");
      });
    }
    const list = await inkPoetryStore._readFallback(db);
    await inkPoetryStore._writeFallback(db, list.filter((s) => s.id !== id));
    return true;
  }
};

// 情侣空间「沧海一刻」IndexedDB 存储操作（心情日记 + 习惯定义 + 每日打卡，含 user_settings 降级兜底）
const momentCalendarStore = {
  _readFallback: async (db, key) => {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readonly");
        const req = tx.objectStore(STORES.USER_SETTINGS).get(key);
        req.onsuccess = () => resolve(Array.isArray(req.result?.value) ? req.result.value : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  },
  _writeFallback: async (db, key, list) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.USER_SETTINGS, "readwrite");
        const req = tx.objectStore(STORES.USER_SETTINGS).put({ key, value: list, updatedAt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject("保存沧海一刻兜底失败");
      } catch (e) {
        reject(e);
      }
    });
  },
  saveMood: async (record) => {
    const db = await openDB();
    const rec = { ...record, updatedAt: Date.now() };
    if (db.objectStoreNames.contains(STORES.MOMENT_MOODS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.MOMENT_MOODS, "readwrite");
        const req = tx.objectStore(STORES.MOMENT_MOODS).put(rec);
        req.onsuccess = () => resolve(rec);
        req.onerror = () => reject("保存心情日记失败");
      });
    }
    const list = await momentCalendarStore._readFallback(db, "moment_moods_fallback");
    await momentCalendarStore._writeFallback(db, "moment_moods_fallback", [rec, ...list.filter((r) => r.id !== rec.id)]);
    return rec;
  },
  getMoodsByChar: async (charId) => {
    const db = await openDB();
    let all = [];
    if (db.objectStoreNames.contains(STORES.MOMENT_MOODS)) {
      all = await new Promise((resolve) => {
        const tx = db.transaction(STORES.MOMENT_MOODS, "readonly");
        const req = tx.objectStore(STORES.MOMENT_MOODS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } else {
      all = await momentCalendarStore._readFallback(db, "moment_moods_fallback");
    }
    return all.filter((r) => !charId || String(r.charId) === String(charId));
  },
  saveHabitDef: async (def) => {
    const db = await openDB();
    const rec = { ...def, updatedAt: Date.now() };
    if (db.objectStoreNames.contains(STORES.MOMENT_HABITS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.MOMENT_HABITS, "readwrite");
        const req = tx.objectStore(STORES.MOMENT_HABITS).put(rec);
        req.onsuccess = () => resolve(rec);
        req.onerror = () => reject("保存习惯定义失败");
      });
    }
    const list = await momentCalendarStore._readFallback(db, "moment_habits_fallback");
    await momentCalendarStore._writeFallback(db, "moment_habits_fallback", [rec, ...list.filter((r) => r.id !== rec.id)]);
    return rec;
  },
  getHabitDefsByScope: async (ownerScope) => {
    const db = await openDB();
    let all = [];
    if (db.objectStoreNames.contains(STORES.MOMENT_HABITS)) {
      all = await new Promise((resolve) => {
        const tx = db.transaction(STORES.MOMENT_HABITS, "readonly");
        const req = tx.objectStore(STORES.MOMENT_HABITS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } else {
      all = await momentCalendarStore._readFallback(db, "moment_habits_fallback");
    }
    return all.filter((r) => !ownerScope || r.ownerScope === ownerScope);
  },
  deleteHabitDef: async (id) => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.MOMENT_HABITS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.MOMENT_HABITS, "readwrite");
        const req = tx.objectStore(STORES.MOMENT_HABITS).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject("删除习惯定义失败");
      });
    }
    const list = await momentCalendarStore._readFallback(db, "moment_habits_fallback");
    await momentCalendarStore._writeFallback(db, "moment_habits_fallback", list.filter((r) => r.id !== id));
    return true;
  },
  saveHabitLog: async (log) => {
    const db = await openDB();
    const rec = { ...log, updatedAt: Date.now() };
    if (db.objectStoreNames.contains(STORES.MOMENT_HABIT_LOGS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.MOMENT_HABIT_LOGS, "readwrite");
        const req = tx.objectStore(STORES.MOMENT_HABIT_LOGS).put(rec);
        req.onsuccess = () => resolve(rec);
        req.onerror = () => reject("保存习惯打卡失败");
      });
    }
    const list = await momentCalendarStore._readFallback(db, "moment_habit_logs_fallback");
    await momentCalendarStore._writeFallback(db, "moment_habit_logs_fallback", [rec, ...list.filter((r) => r.id !== rec.id)]);
    return rec;
  },
  getHabitLogsByHabit: async (habitId) => {
    const db = await openDB();
    let all = [];
    if (db.objectStoreNames.contains(STORES.MOMENT_HABIT_LOGS)) {
      all = await new Promise((resolve) => {
        const tx = db.transaction(STORES.MOMENT_HABIT_LOGS, "readonly");
        const req = tx.objectStore(STORES.MOMENT_HABIT_LOGS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } else {
      all = await momentCalendarStore._readFallback(db, "moment_habit_logs_fallback");
    }
    return all.filter((r) => !habitId || r.habitId === habitId);
  },
  deleteHabitLog: async (id) => {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORES.MOMENT_HABIT_LOGS)) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.MOMENT_HABIT_LOGS, "readwrite");
        const req = tx.objectStore(STORES.MOMENT_HABIT_LOGS).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject("删除打卡记录失败");
      });
    }
    const list = await momentCalendarStore._readFallback(db, "moment_habit_logs_fallback");
    await momentCalendarStore._writeFallback(db, "moment_habit_logs_fallback", list.filter((r) => r.id !== id));
    return true;
  }
};

if (typeof window !== "undefined") {
  window.chatReportStore = chatReportStore;
  window.storyLoomStore = storyLoomStore;
  window.inkPoetryStore = inkPoetryStore;
  window.momentCalendarStore = momentCalendarStore;
  window.optimizeLocalStorage = optimizeLocalStorage;
  window.restoreEssentialDataFromIndexedDB = restoreEssentialDataFromIndexedDB;

  // 页面启动立即执行核心数据恢复
  restoreEssentialDataFromIndexedDB();
}
