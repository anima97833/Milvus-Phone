/**
 * Milvus/phantom_touch_engine.js
 * 智能蓝牙/云端体感外设桥接独立引擎（Phase 0，借鉴 Kristenkristen/Chemtrails 双路线设计）
 * - 100% 独立零冲突 IndexedDB 持久化（milvus_mcp_vault_idb），零 localStorage 占用
 * - 路线一（Cloud WS 中继）：支持 MonsterParty 协议（安可尼/谜姬/醉清风等单/双马达设备），全平台浏览器可用
 * - 路线二（Web Bluetooth）：纯前端浏览器直连自定义 GATT UUID，无需后端（Android/PC Chrome/Edge HTTPS）
 * - 代码级安全红线：最大强度上限钳位 + 单次最长时长自动归零 + 全局常驻 🛑 一键急停按钮 + 未连线零挂载
 */
(function (global) {
  "use strict";

  const VAULT_DB_NAME = "milvus_mcp_vault_idb";
  const VAULT_STORE = "kv";
  const IDB_PREFS_KEY = "milvus_phantom_prefs_v1";

  const DEFAULT_PREFS = {
    route: "cloud_ws",            // "cloud_ws" | "web_ble"
    bridgeUrl: "http://127.0.0.1:8766",
    dualMotor: false,             // true = 双马达（如 AKN_DS_SUCKEGG：[吸力, 震, 震, 震, 震, 0..0]）
    keyType: "vib",               // "vib" | "suck"
    maxIntensity: 60,             // 用户安全上限 (10..100)
    maxDurationSec: 15,           // 单次最长持续秒数 (1..60)
    bleServiceUuid: "",           // 路线二：GATT Service UUID
    bleCharUuid: "",              // 路线二：GATT Write Characteristic UUID
    bleCmdTemplate: "{level}"     // 路线二：十六进制/文本模板，如 "01 {hex}" 或 "{level}"
  };

  let _vaultDbPromise = null;
  let _prefsCache = { ...DEFAULT_PREFS };
  let _hydratePromise = null;
  let _dirtyByUser = false;

  // 运行时连接状态（不持久化分享 Token，刷新即清更安全）
  let _state = {
    connected: false,
    route: "cloud_ws",
    deviceName: "",
    dualMotor: false,
    lastIntensity: 0,
    lastError: ""
  };
  let _bleDevice = null;
  let _bleChar = null;
  let _activeTimers = [];

  function openVaultDB() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (_vaultDbPromise) return _vaultDbPromise;
    _vaultDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(VAULT_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(VAULT_STORE)) {
            db.createObjectStore(VAULT_STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          _vaultDbPromise = null;
          resolve(null);
        };
      } catch (e) {
        _vaultDbPromise = null;
        resolve(null);
      }
    });
    return _vaultDbPromise;
  }

  async function idbRead(key) {
    const vdb = await openVaultDB();
    if (!vdb) return null;
    try {
      return await new Promise((resolve) => {
        const tx = vdb.transaction([VAULT_STORE], "readonly");
        const req = tx.objectStore(VAULT_STORE).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function idbWrite(key, value) {
    const vdb = await openVaultDB();
    if (!vdb) return false;
    try {
      return await new Promise((resolve) => {
        const tx = vdb.transaction([VAULT_STORE], "readwrite");
        tx.objectStore(VAULT_STORE).put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  function emitStateChange() {
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-phantom-state-changed", { detail: { ..._state } }));
    }
  }

  function hydrate(force = false) {
    if (_hydratePromise && !force) return _hydratePromise;
    const p = (async () => {
      const saved = await idbRead(IDB_PREFS_KEY);
      if (saved && typeof saved === "object" && (!_dirtyByUser || force)) {
        _prefsCache = { ...DEFAULT_PREFS, ...saved };
      } else if (!saved) {
        _hydratePromise = null;
      }
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-phantom-prefs-changed", { detail: _prefsCache }));
      }
      return _prefsCache;
    })();
    _hydratePromise = p;
    return p;
  }

  if (typeof window !== "undefined") {
    hydrate(true);
  }

  function getPrefs() {
    return { ...DEFAULT_PREFS, ..._prefsCache };
  }

  function savePrefs(patch) {
    _dirtyByUser = true;
    _prefsCache = { ...getPrefs(), ...(patch || {}) };
    idbWrite(IDB_PREFS_KEY, _prefsCache);
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-phantom-prefs-changed", { detail: _prefsCache }));
    }
    return getPrefs();
  }

  function resetForTest() {
    clearTimers();
    _prefsCache = { ...DEFAULT_PREFS };
    _state = { connected: false, route: "cloud_ws", deviceName: "", dualMotor: false, lastIntensity: 0, lastError: "" };
    _bleDevice = null;
    _bleChar = null;
  }

  function isConnected() {
    return Boolean(_state.connected);
  }

  function getState() {
    return { ..._state };
  }

  function clearTimers() {
    for (const t of _activeTimers) clearTimeout(t);
    _activeTimers = [];
  }

  // ==========================================
  // 1. 核心安全钳位与 MonsterParty 10 位数组映射
  // ==========================================
  function extractTokenFromInput(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    // 支持直接粘贴完整链接 https://www.monsterparty.cn/remote/<TOKEN> 或 ?s=<TOKEN>
    const m1 = s.match(/\/remote\/([A-Za-z0-9_\-]+)/i);
    if (m1 && m1[1]) return m1[1];
    const m2 = s.match(/[?&]s=([A-Za-z0-9_\-]+)/i);
    if (m2 && m2[1]) return m2[1];
    return s;
  }

  function clampControlParams(params = {}, prefsOverride = null) {
    const prefs = prefsOverride ? { ...getPrefs(), ...prefsOverride } : getPrefs();
    const capI = Math.max(10, Math.min(100, Number(prefs.maxIntensity) || 60));
    const capD = Math.max(1, Math.min(60, Number(prefs.maxDurationSec) || 15));

    const intensity = Math.max(0, Math.min(capI, Math.round(Number(params.intensity) || 0)));
    const intensity2 =
      params.intensity2 !== undefined && params.intensity2 !== null
        ? Math.max(0, Math.min(capI, Math.round(Number(params.intensity2) || 0)))
        : intensity;
    const durationSec = Math.max(0.5, Math.min(capD, Number(params.durationSec || params.duration) || 3));
    return { intensity, intensity2, durationSec, capI, capD };
  }

  function buildVibArray(intensity, intensity2, dualMotor) {
    const v1 = Math.max(0, Math.min(100, Math.round(Number(intensity) || 0)));
    const v2 = Math.max(0, Math.min(100, Math.round(Number(intensity2 ?? intensity) || 0)));
    if (dualMotor) {
      // AKN_DS_SUCKEGG 实测双马达映射：[吸力, 震动, 震动, 震动, 震动, 0, 0, 0, 0, 0]
      return [v1, v2, v2, v2, v2, 0, 0, 0, 0, 0];
    }
    return [v1, v1, v1, v1, v1, v1, v1, v1, v1, v1];
  }

  function encodeBlePayload(template, intensity) {
    const level = Math.max(0, Math.min(100, Math.round(Number(intensity) || 0)));
    const hexByte = level.toString(16).padStart(2, "0");
    const filled = String(template || "{level}")
      .replace(/\{level\}/gi, String(level))
      .replace(/\{hex\}/gi, hexByte)
      .trim();

    // 若全部为十六进制字节（如 "01 3c" 或 "a0,ff"），转为 Uint8Array 字节流；否则 UTF-8 编码
    if (/^[0-9a-fA-F]{2}([\s,:-]+[0-9a-fA-F]{2})*$/.test(filled)) {
      const bytes = filled.split(/[\s,:-]+/).map((h) => parseInt(h, 16));
      return new Uint8Array(bytes);
    }
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(filled);
    }
    return new Uint8Array(Array.from(filled).map((c) => c.charCodeAt(0) & 0xff));
  }

  // ==========================================
  // 2. 双路线传输驱动：Cloud WS 中继 & Web Bluetooth
  // ==========================================
  async function sendRawIntensity(intensity, intensity2) {
    const prefs = getPrefs();
    _state.lastIntensity = Math.max(intensity, intensity2 || 0);
    emitStateChange();

    if (_state.route === "web_ble") {
      if (!_bleChar) throw new Error("蓝牙特征值未连接");
      const payload = encodeBlePayload(prefs.bleCmdTemplate, intensity);
      if (typeof _bleChar.writeValueWithoutResponse === "function") {
        await _bleChar.writeValueWithoutResponse(payload);
      } else {
        await _bleChar.writeValue(payload);
      }
      return;
    }

    // Cloud WS 中继
    const base = String(prefs.bridgeUrl || DEFAULT_PREFS.bridgeUrl).trim().replace(/\/+$/, "");
    const vib = buildVibArray(intensity, intensity2, Boolean(_state.dualMotor || prefs.dualMotor));
    const res = await fetch(`${base}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vib, keyType: prefs.keyType || "vib" })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`中继发送失败 (${res.status}): ${txt.slice(0, 100)}`);
    }
  }

  async function connectCloudWs(rawTokenInput) {
    const prefs = getPrefs();
    const token = extractTokenFromInput(rawTokenInput);
    if (!token) throw new Error("请先粘贴设备 App 生成的远程分享链接或 Token");
    const base = String(prefs.bridgeUrl || DEFAULT_PREFS.bridgeUrl).trim().replace(/\/+$/, "");

    const res = await fetch(`${base}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `连接中继失败 (${res.status})`);
    }
    _state = {
      connected: true,
      route: "cloud_ws",
      deviceName: data.pid || "云端远程外设",
      dualMotor: Boolean(data.is_ds || prefs.dualMotor),
      lastIntensity: 0,
      lastError: ""
    };
    emitStateChange();
    return { ..._state };
  }

  async function connectWebBle() {
    if (typeof navigator === "undefined" || !navigator.bluetooth) {
      throw new Error("当前浏览器不支持 Web Bluetooth（请使用 Android/PC 版 Chrome 或 Edge，且页面需为 HTTPS 或 localhost；iPhone 请使用路线一）");
    }
    const prefs = getPrefs();
    const svcUuid = String(prefs.bleServiceUuid || "").trim().toLowerCase();
    const charUuid = String(prefs.bleCharUuid || "").trim().toLowerCase();
    if (!svcUuid || !charUuid) {
      throw new Error("请先填写设备的 GATT Service UUID 与 Write Characteristic UUID");
    }
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [svcUuid]
    });
    device.addEventListener("gattserverdisconnected", () => {
      clearTimers();
      _bleChar = null;
      _state = { ..._state, connected: false, lastIntensity: 0 };
      emitStateChange();
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(svcUuid);
    const ch = await service.getCharacteristic(charUuid);
    _bleDevice = device;
    _bleChar = ch;
    _state = {
      connected: true,
      route: "web_ble",
      deviceName: device.name || "BLE 蓝牙外设",
      dualMotor: Boolean(prefs.dualMotor),
      lastIntensity: 0,
      lastError: ""
    };
    emitStateChange();
    return { ..._state };
  }

  async function emergencyStop(disconnectAfter = false) {
    clearTimers();
    try {
      if (_state.connected) {
        if (_state.route === "cloud_ws") {
          const base = String(getPrefs().bridgeUrl || DEFAULT_PREFS.bridgeUrl).trim().replace(/\/+$/, "");
          await fetch(`${base}/${disconnectAfter ? "disconnect" : "stop"}`, { method: "POST" }).catch(() => {});
        } else {
          await sendRawIntensity(0, 0).catch(() => {});
          if (disconnectAfter && _bleDevice && _bleDevice.gatt && _bleDevice.gatt.connected) {
            _bleDevice.gatt.disconnect();
          }
        }
      }
    } finally {
      _state.lastIntensity = 0;
      if (disconnectAfter) {
        _state.connected = false;
        _bleChar = null;
      }
      emitStateChange();
    }
    return { stopped: true, disconnected: disconnectAfter };
  }

  // ==========================================
  // 3. 波形安全调度器 & MCP 统一入口
  // ==========================================
  async function executeControl(args = {}) {
    if (!_state.connected) {
      return { status: "disconnected", error: "设备尚未连接，请先在「设置 → MCP → 智能体感外设桥接」完成连接。" };
    }
    const mode = String(args.mode || "steady").toLowerCase();
    clearTimers();

    if (mode === "stop") {
      await emergencyStop(false);
      return { status: "success", mode: "stop", message: "已停止所有马达输出。" };
    }

    const { intensity, intensity2, durationSec, capI } = clampControlParams(args);

    if (mode === "wave") {
      // 渐强渐弱 4 段波浪，结束后自动归零
      const steps = [0.4, 0.75, 1.0, 0.55];
      const stepMs = Math.max(400, Math.round((durationSec * 1000) / steps.length));
      await sendRawIntensity(Math.round(intensity * steps[0]), Math.round(intensity2 * steps[0]));
      for (let i = 1; i < steps.length; i++) {
        _activeTimers.push(
          setTimeout(() => {
            sendRawIntensity(Math.round(intensity * steps[i]), Math.round(intensity2 * steps[i])).catch(() => {});
          }, stepMs * i)
        );
      }
      _activeTimers.push(
        setTimeout(() => {
          sendRawIntensity(0, 0).catch(() => {});
        }, stepMs * steps.length)
      );
    } else if (mode === "pulse") {
      // 间歇脉冲，结束后自动归零
      const pulseMs = 700;
      const count = Math.max(1, Math.min(8, Math.floor((durationSec * 1000) / (pulseMs * 2))));
      for (let i = 0; i < count; i++) {
        const onAt = i * pulseMs * 2;
        const offAt = onAt + pulseMs;
        if (i === 0) await sendRawIntensity(intensity, intensity2);
        else _activeTimers.push(setTimeout(() => sendRawIntensity(intensity, intensity2).catch(() => {}), onAt));
        _activeTimers.push(setTimeout(() => sendRawIntensity(0, 0).catch(() => {}), offAt));
      }
    } else {
      // steady 恒定输出 + 到点强制归零
      await sendRawIntensity(intensity, intensity2);
      _activeTimers.push(
        setTimeout(() => {
          sendRawIntensity(0, 0).catch(() => {});
        }, Math.round(durationSec * 1000))
      );
    }

    return {
      status: "success",
      mode,
      appliedIntensity: intensity,
      appliedIntensity2: intensity2,
      durationSec,
      safetyCap: capI,
      message: `已执行 ${mode}（强度 ${intensity}%，持续 ${durationSec} 秒后自动归零）。`
    };
  }

  async function handleToolCall(args = {}) {
    try {
      return await executeControl(args);
    } catch (err) {
      return { status: "error", error: err.message || "体感外设控制失败" };
    }
  }

  // ==========================================
  // 4. React UI：设置配置卡 + 全局常驻 🛑 一键急停浮窗
  // ==========================================
  function ZhouZhongPhantomGuideModal({ isOpen, onClose }) {
    if (!isOpen || typeof React === "undefined") return null;
    const h = React.createElement;

    const sections = [
      {
        title: "一、先挑哪条路？别瞎忙活累着自己",
        voice:
          "哈欠……殿下别皱眉嘛，其实统共就两条路，看你手头拿的是什么机器、什么玩具，挑最省力的那条躺平走便是……",
        bullets: [
          "📱 路线一（云端 WS 中继）：只要你的玩具 App 能点出「邀请好友远程控制」的分享链接（比如安可尼、谜姬、醉清风等），选这条！苹果 iPhone、安卓、电脑全都能用。",
          "🔵 路线二（Web BLE 蓝牙直连）：如果玩具只有普通蓝牙、没有远程链接，或者你懒得开中继，选这条！但必须用 Android / 电脑的 Chrome 或 Edge 打开 HTTPS 网页（苹果 Safari 原生不支持网页蓝牙）。"
        ]
      },
      {
        title: "二、别人常说的「网关 VPS」到底是啥？",
        voice:
          "听着挺唬人，说白了呀，VPS 就是花十几块钱租一台「24 小时永远不关机、带公网门牌号的云端小电脑」。蝶部在幽州留的暗桩，也不过是这个意思呢……",
        bullets: [
          "💻 免费偷懒法（自己电脑当网关）：只在家里用电脑玩时，根本不用买 VPS！直接在自己电脑跑一下本机脚本（http://127.0.0.1:8766），一分钱不花。",
          "☁️ 进阶全天候法（租台 VPS 当网关）：如果想关掉自家电脑、出门在外用手机也能随时连，就买一台最便宜的云端 VPS（如阿里云/腾讯云/雨云等），把项目里的 phantom_gateway/ws_bridge.js 放上去常驻运行，配好 HTTPS 域名填进这里的「中继地址」，以后躺哪儿都能连啦。"
        ]
      },
      {
        title: "三、路线一（云端中继）纯小白三步走",
        voice:
          "这步连我这种整日抱着枕头犯困的废人都能一步弄妥，殿下这么聪明，闭着眼都成……",
        bullets: [
          "第 1 步：在项目目录打开终端，先装一次依赖：npm install ws",
          "第 2 步：启动中继网关：node phantom_gateway/ws_bridge.js（看到提示监听 127.0.0.1:8766 就行，别关黑框）。",
          "第 3 步：打开玩具官方 App → 点「邀请好友远程控制」生成一次性链接 → 整条复制粘进本卡片的输入框 → 点「🔗 连接云端中继」，亮绿标即可！"
        ]
      },
      {
        title: "四、路线二（Web BLE 纯蓝牙直连）纯小白三步走",
        voice:
          "不想走品牌服务器、想让蝴蝶直接贴身传信？那得先拿把小尺子量出蓝牙的「暗门编号（UUID）」……",
        bullets: [
          "第 1 步：手机装一个免费的调试 App「nRF Connect」，打开玩具电源并扫描连接它。",
          "第 2 步：在 nRF Connect 里找到带 Write（写入）权限的服务，抄下它的 Service UUID 与 Characteristic UUID，填进本卡片。",
          "第 3 步：用 Android 或电脑的 Chrome / Edge 打开小手机（HTTPS），点「🔵 选择并连接蓝牙设备」配对成功即可。"
        ]
      },
      {
        title: "五、保命规矩（殿下千万记牢）",
        voice:
          "生路与乐子，终归都要攥在自己手里才安稳呀……这几道锁我都替你扣死了，谁也越不过去。",
        bullets: [
          "平时未连线时，AI 完全看不到这个工具，绝不会乱触发、也不占群聊任何事。",
          "先把「安全强度上限」拉到 40%~60%、「单次最长」设 10~15 秒，到点自动归零；而且连线后屏幕右下角会常驻一枚红色「🛑 急停断开」按钮，随时一指按停！"
        ]
      }
    ];

    const modalNode = h(
      "div",
      {
        onClick: onClose,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(24, 20, 28, 0.68)",
          backdropFilter: "blur(5px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 12px",
          boxSizing: "border-box"
        }
      },
      h(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "min(93vw, 398px)",
            maxHeight: "85vh",
            background: "#FAF8F6",
            borderRadius: "18px",
            border: "1.5px solid #D3C5D8",
            boxShadow: "0 20px 50px rgba(34, 20, 44, 0.38)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "#36303B"
          }
        },
        // 顶栏：蝶部密匣 · 周忠
        h(
          "div",
          {
            style: {
              padding: "14px 16px 12px",
              background: "linear-gradient(135deg, #4B3A57 0%, #6D547D 100%)",
              color: "#FAF6FC",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            h(
              "div",
              {
                style: {
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(227, 198, 245, 0.22)",
                  border: "1.5px solid #DFC4F2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0
                }
              },
              "🦋"
            ),
            h(
              "div",
              null,
              h("div", { style: { fontSize: "14.5px", fontWeight: "800", letterSpacing: "0.5px" } }, "蝶部密匣 · 周忠手把手教学"),
              h("div", { style: { fontSize: "11px", color: "#E4D3F0", marginTop: "1px" } }, "纯小白零基础看懂外设桥接与网关 VPS")
            )
          ),
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: {
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "none",
                background: "rgba(255,255,255,0.18)",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                flexShrink: 0
              }
            },
            "✕"
          )
        ),

        // 滚动正文
        h(
          "div",
          {
            style: {
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "12px 14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "11px"
            }
          },
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                borderLeft: "3px solid #7B5A91",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "12.5px",
                lineHeight: 1.68,
                color: "#43384A"
              }
            },
            "「哈欠……殿下怎么又把前辈从枕头上摇醒啦？哦呀，原来是想学怎么连这件稀奇玩意儿呀……谁不好色、谁不爱寻些快活呢？来，坐近些，我慢慢说给你听，一点儿也不难的。」"
          ),

          sections.map((sec, idx) =>
            h(
              "div",
              {
                key: idx,
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #E9E2ED",
                  borderRadius: "13px",
                  padding: "12px 13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }
              },
              h("div", { style: { fontSize: "13px", fontWeight: "800", color: "#4D375C" } }, sec.title),
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#675475",
                    lineHeight: 1.62,
                    background: "#F7F3FA",
                    padding: "7px 10px",
                    borderRadius: "8px"
                  }
                },
                `「${sec.voice}」`
              ),
              h(
                "ul",
                {
                  style: {
                    margin: 0,
                    paddingLeft: "17px",
                    fontSize: "12px",
                    color: "#3C3542",
                    lineHeight: 1.66,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }
                },
                sec.bullets.map((b, bi) => h("li", { key: bi }, b))
              )
            )
          ),

          h(
            "div",
            {
              style: {
                background: "#F5EFF9",
                border: "1px dashed #C7B3D6",
                borderRadius: "11px",
                padding: "10px 12px",
                fontSize: "11.5px",
                color: "#5C476B",
                lineHeight: 1.65
              }
            },
            "「好啦，全数交代干净了……前辈我有点困，得抱枕头回去眯一会儿了。要是哪天没事务的时候，殿下想试新花样，也可以先拿『⚡ 测试 1 秒』轻轻试一下呀……记得保暖，别着凉了。」"
          )
        )
      )
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(modalNode, document.body);
    }
    return modalNode;
  }

  function PhantomTouchConfigCard() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    const [prefs, setPrefs] = useState(() => getPrefs());
    const [st, setSt] = useState(() => getState());
    const [expanded, setExpanded] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [tokenInput, setTokenInput] = useState("");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      hydrate(true).then((p) => setPrefs({ ...p }));
      const onP = () => setPrefs(getPrefs());
      const onS = () => setSt(getState());
      global.addEventListener("milvus-phantom-prefs-changed", onP);
      global.addEventListener("milvus-phantom-state-changed", onS);
      return () => {
        global.removeEventListener("milvus-phantom-prefs-changed", onP);
        global.removeEventListener("milvus-phantom-state-changed", onS);
      };
    }, []);

    const update = (patch) => setPrefs(savePrefs(patch));

    const handleConnect = async () => {
      setBusy(true);
      setMsg("正在建立连接...");
      try {
        if (prefs.route === "web_ble") {
          const res = await connectWebBle();
          setMsg(`✅ 蓝牙已连线：${res.deviceName}`);
        } else {
          const res = await connectCloudWs(tokenInput);
          setMsg(`✅ 云端中继已连线：${res.deviceName}`);
        }
      } catch (err) {
        setMsg(`❌ ${err.message || err}`);
      } finally {
        setBusy(false);
      }
    };

    const handleTest = async () => {
      try {
        const res = await executeControl({ mode: "steady", intensity: Math.min(30, prefs.maxIntensity), durationSec: 1.2 });
        setMsg(res.status === "success" ? "✅ 已发送 1.2 秒轻度测试脉冲" : `❌ ${res.error}`);
      } catch (err) {
        setMsg(`❌ ${err.message}`);
      }
    };

    return h(
      "div",
      {
        style: {
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "14px 16px",
          border: "1px solid #E5DFD3",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      h(
        "div",
        {
          onClick: () => setExpanded(!expanded),
          style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }
        },
        h(
          "div",
          null,
          h(
            "div",
            { style: { fontSize: "13px", fontWeight: "700", color: "#3B4235", display: "flex", alignItems: "center", gap: "6px" } },
            "📡 智能体感外设桥接（云端 WS / Web BLE）",
            h(
              "span",
              {
                style: {
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  background: st.connected ? "#EEF6F1" : "#F5F3ED",
                  color: st.connected ? "#2F6B48" : "#8E9485",
                  border: st.connected ? "1px solid #CFE5D7" : "1px solid #E5DFD3"
                }
              },
              st.connected ? "已连线" : "未连线"
            )
          ),
          h("div", { style: { fontSize: "11px", color: "#8E9485", marginTop: "2px" } }, "仅私聊且已连线时生效；内置强度上限、超时归零与一键急停")
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h(
            "button",
            {
              type: "button",
              title: "周忠手把手教你连外设与看懂网关 VPS",
              onClick: (e) => {
                e.stopPropagation();
                setGuideOpen(true);
              },
              style: {
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                border: "1px solid #D3C3DC",
                background: "#F7F1FA",
                color: "#6A4C7D",
                fontSize: "12px",
                fontWeight: "800",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                lineHeight: 1
              }
            },
            "?"
          ),
          h("span", { style: { fontSize: "12px", color: "#6F7668", fontWeight: "700" } }, expanded ? "收起 ▲" : "展开配置 ▼")
        )
      ),
      h(ZhouZhongPhantomGuideModal, {
        isOpen: guideOpen,
        onClose: () => setGuideOpen(false)
      }),

      expanded &&
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "9px", paddingTop: "8px", borderTop: "1px solid #F1EEE6" } },
          // 路线切换
          h(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" } },
            [
              { id: "cloud_ws", label: "路线一：云端 WS 中继" },
              { id: "web_ble", label: "路线二：Web BLE 直连" }
            ].map((opt) => {
              const act = prefs.route === opt.id;
              return h(
                "button",
                {
                  key: opt.id,
                  type: "button",
                  onClick: () => update({ route: opt.id }),
                  style: {
                    padding: "7px 6px",
                    borderRadius: "8px",
                    border: act ? "1.5px solid #4E7E8E" : "1px solid #DCD7CC",
                    background: act ? "#EDF5F7" : "#FAF8F4",
                    color: act ? "#2E5B69" : "#7B8072",
                    fontSize: "11.5px",
                    fontWeight: act ? "700" : "500",
                    cursor: "pointer"
                  }
                },
                opt.label
              );
            })
          ),

          prefs.route === "cloud_ws"
            ? h(
                React.Fragment,
                null,
                h("input", {
                  type: "text",
                  value: prefs.bridgeUrl || "",
                  onChange: (e) => update({ bridgeUrl: e.target.value }),
                  placeholder: "中继地址，默认 http://127.0.0.1:8766",
                  style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
                }),
                h("input", {
                  type: "password",
                  value: tokenInput,
                  onChange: (e) => setTokenInput(e.target.value),
                  placeholder: "粘贴设备 App 的一次性远程控制链接或 Token",
                  style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
                }),
                h(
                  "label",
                  { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", color: "#5A6254" } },
                  h("span", null, "双马达设备（如 AKN_DS_SUCKEGG 吸力+震动）"),
                  h("input", { type: "checkbox", checked: Boolean(prefs.dualMotor), onChange: (e) => update({ dualMotor: e.target.checked, keyType: e.target.checked ? "suck" : "vib" }) })
                )
              )
            : h(
                React.Fragment,
                null,
                h("input", {
                  type: "text",
                  value: prefs.bleServiceUuid || "",
                  onChange: (e) => update({ bleServiceUuid: e.target.value }),
                  placeholder: "GATT Service UUID（如 0000fff0-0000-1000-8000-00805f9b34fb）",
                  style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "11.5px", boxSizing: "border-box" }
                }),
                h("input", {
                  type: "text",
                  value: prefs.bleCharUuid || "",
                  onChange: (e) => update({ bleCharUuid: e.target.value }),
                  placeholder: "GATT Write Characteristic UUID",
                  style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "11.5px", boxSizing: "border-box" }
                }),
                h("input", {
                  type: "text",
                  value: prefs.bleCmdTemplate || "",
                  onChange: (e) => update({ bleCmdTemplate: e.target.value }),
                  placeholder: "控制指令模板（如 01 {hex} 或 Vibrate:{level};）",
                  style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "11.5px", boxSizing: "border-box" }
                })
              ),

          // 安全上限调节
          h(
            "div",
            { style: { display: "flex", gap: "10px", fontSize: "11.5px", color: "#5A6254" } },
            h(
              "div",
              { style: { flex: 1 } },
              h("div", null, `安全强度上限：${prefs.maxIntensity}%`),
              h("input", { type: "range", min: 10, max: 100, step: 5, value: prefs.maxIntensity, onChange: (e) => update({ maxIntensity: Number(e.target.value) }), style: { width: "100%" } })
            ),
            h(
              "div",
              { style: { flex: 1 } },
              h("div", null, `单次最长：${prefs.maxDurationSec} 秒`),
              h("input", { type: "range", min: 3, max: 60, step: 1, value: prefs.maxDurationSec, onChange: (e) => update({ maxDurationSec: Number(e.target.value) }), style: { width: "100%" } })
            )
          ),

          h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            !st.connected
              ? h(
                  "button",
                  {
                    type: "button",
                    disabled: busy,
                    onClick: handleConnect,
                    style: { flex: 1, padding: "8px", borderRadius: "9px", border: "none", background: "#4E7E8E", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }
                  },
                  busy ? "连接中..." : prefs.route === "web_ble" ? "🔵 选择并连接蓝牙设备" : "🔗 连接云端中继"
                )
              : h(
                  React.Fragment,
                  null,
                  h("button", { type: "button", onClick: handleTest, style: { flex: 1, padding: "8px", borderRadius: "9px", border: "1px solid #C8D9DF", background: "#EEF5F7", color: "#2F5866", fontSize: "12px", fontWeight: "700", cursor: "pointer" } }, "⚡ 测试 1 秒"),
                  h("button", { type: "button", onClick: () => emergencyStop(true), style: { flex: 1, padding: "8px", borderRadius: "9px", border: "none", background: "#B84A4A", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" } }, "🛑 停止并断开")
                )
          ),

          msg &&
            h(
              "div",
              { style: { fontSize: "11.5px", padding: "7px 9px", borderRadius: "8px", background: msg.startsWith("✅") ? "#EEF6F1" : msg.startsWith("❌") ? "#FDEFEF" : "#FAF7F0", color: msg.startsWith("✅") ? "#2F6B48" : msg.startsWith("❌") ? "#A63D3D" : "#6B5A45" } },
              msg
            )
        )
    );
  }

  function PhantomEmergencyStopHost() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [st, setSt] = useState(() => getState());

    useEffect(() => {
      const onS = () => setSt(getState());
      global.addEventListener("milvus-phantom-state-changed", onS);
      return () => global.removeEventListener("milvus-phantom-state-changed", onS);
    }, []);

    if (!st.connected) return null;

    const pill = h(
      "button",
      {
        type: "button",
        onClick: () => emergencyStop(true),
        title: "立即停止外设输出并断开连接",
        style: {
          position: "fixed",
          right: "14px",
          bottom: "82px",
          zIndex: 99999,
          padding: "8px 13px",
          borderRadius: "999px",
          border: "1.5px solid #FFDFDF",
          background: "linear-gradient(135deg, #D14747, #A82E2E)",
          color: "#FFFFFF",
          fontSize: "12px",
          fontWeight: "800",
          boxShadow: "0 6px 18px rgba(168, 46, 46, 0.42)",
          cursor: "pointer"
        }
      },
      `🛑 急停断开 (${st.lastIntensity || 0}%)`
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(pill, document.body);
    }
    return pill;
  }

  const api = {
    hydrate,
    getPrefs,
    savePrefs,
    resetForTest,
    isConnected,
    getState,
    extractTokenFromInput,
    clampControlParams,
    buildVibArray,
    encodeBlePayload,
    connectCloudWs,
    connectWebBle,
    emergencyStop,
    executeControl,
    handleToolCall,
    PhantomTouchConfigCard,
    PhantomEmergencyStopHost
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.PhantomTouchEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

