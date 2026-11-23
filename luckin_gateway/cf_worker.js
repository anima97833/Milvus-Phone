/**
 * luckin_gateway/cf_worker.js
 * 多品牌官方 MCP / OpenAPI 专属 Cloudflare Worker 白名单跨域转发网关（路线 A：手机 + 电脑随时免费可用）
 *
 * 支持路由（100% 向下兼容已有瑞幸与麦当劳配置）：
 *   - POST /         或 /luckin          -> 瑞幸咖啡官方 MCP (https://gwmcp.lkcoffee.com/order/user/mcp)
 *   - POST /mcd                          -> 麦当劳中国官方 MCP (https://mcp.mcd.cn)
 *   - POST /ima/openapi/<subpath>        -> 腾讯 IMA 官方 OpenAPI (https://ima.qq.com/openapi/<subpath>)
 *   - POST /amap                         -> 高德地图官方 MCP (https://mcp.amap.com/mcp)
 *
 * 可选安全 Secrets（在 Cloudflare Worker -> Settings -> Variables and Secrets 中配置后，前端可免填凭证）：
 *   LUCKIN_MCP_TOKEN / MCD_MCP_TOKEN / IMA_CLIENT_ID / IMA_API_KEY / AMAP_KEY
 */
const ROUTES = {
  luckin: {
    target: "https://gwmcp.lkcoffee.com/order/user/mcp",
    envKey: "LUCKIN_MCP_TOKEN",
    authType: "bearer"
  },
  mcd: {
    target: "https://mcp.mcd.cn",
    envKey: "MCD_MCP_TOKEN",
    authType: "bearer"
  },
  amap: {
    target: "https://mcp.amap.com/mcp",
    envKey: "AMAP_KEY",
    authType: "query_key"
  }
};

const EMBED_ALLOWED_HOSTS = new Set([
  "api.siliconflow.cn",
  "api.openai.com",
  "dashscope.aliyuncs.com",
  "open.bigmodel.cn",
  "api.jina.ai"
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, ima-openapi-clientid, ima-openapi-apikey, ima-openapi-ctx, X-Target-Embed-Url, xi-api-key, model, X-MiniMax-Region, X-MiniMax-Group-Id, X-Proactive-Secret",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Content-Type",
  "Access-Control-Max-Age": "86400"
};

function resolveRoute(pathname) {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  const lower = p.toLowerCase();
  if (lower === "/proactive" || lower.startsWith("/proactive/")) {
    return { id: "proactive", authType: "proactive_cloud", subPath: lower.slice(10) || "/" };
  }
  if (lower === "/voice" || lower.startsWith("/voice/")) {
    return { id: "voice", authType: "voice_proxy", subPath: lower.slice(6) || "/" };
  }
  if (lower === "/ao3" || lower.startsWith("/ao3/")) {
    return { id: "ao3", authType: "ao3_proxy", subPath: p.slice(4) || "/" };
  }
  if (lower === "/embed" || lower.startsWith("/embed/")) return { id: "embed", authType: "embed_proxy" };
  if (lower === "/mcd" || lower.startsWith("/mcd/")) return { id: "mcd", ...ROUTES.mcd };
  if (lower === "/amap" || lower.startsWith("/amap/")) return { id: "amap", ...ROUTES.amap };
  if (lower === "/ima" || lower.startsWith("/ima/")) {
    const sub = p.slice(4).replace(/^\/+/, "");
    return { id: "ima", authType: "ima_openapi", subPath: sub };
  }
  return { id: "luckin", ...ROUTES.luckin };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const reqUrl = new URL(request.url);
    const route = resolveRoute(reqUrl.pathname);

    // ========================================================
    // 鸿雁传书 Phase 2：云端离线主动发消息 & 锁屏推送路由 (/proactive/*)
    // 依赖：在 Cloudflare Worker 绑定 KV 命名空间 PROACTIVE_KV + 开启 Cron Trigger (*/5 * * * *)
    // ========================================================
    if (route.id === "proactive") {
      const jsonResp = (obj, status = 200) =>
        new Response(JSON.stringify(obj), {
          status,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });

      // 可选口令保护（若在 Worker 环境变量配置了 PROACTIVE_SECRET，则校验请求头）
      if (env && env.PROACTIVE_SECRET) {
        const provided = request.headers.get("X-Proactive-Secret") || "";
        if (provided !== String(env.PROACTIVE_SECRET)) {
          return jsonResp({ ok: false, error: "Unauthorized: X-Proactive-Secret 不匹配" }, 401);
        }
      }

      const sub = String(route.subPath || "/");
      const kv = env && env.PROACTIVE_KV;

      if (request.method === "GET" && (sub === "/" || sub === "/status")) {
        if (!kv) {
          return jsonResp({ ok: true, kvBound: false, message: "尚未在 Cloudflare Worker 绑定 PROACTIVE_KV 命名空间" });
        }
        const tasks = (await kv.get("proactive:tasks", "json")) || {};
        const inbox = (await kv.get("proactive:inbox", "json")) || [];
        return jsonResp({
          ok: true,
          kvBound: true,
          hasSecret: Boolean(env && env.PROACTIVE_SECRET),
          taskCount: Object.keys(tasks).length,
          inboxCount: Array.isArray(inbox) ? inbox.length : 0
        });
      }

      if (!kv) {
        return jsonResp({ ok: false, error: "请在 Cloudflare Worker 设置中绑定名为 PROACTIVE_KV 的 KV 命名空间" }, 500);
      }

      if (request.method === "POST" && sub === "/sync") {
        const body = await request.json().catch(() => null);
        if (!body || !body.chatId) return jsonResp({ ok: false, error: "缺少 chatId" }, 400);
        const tasks = (await kv.get("proactive:tasks", "json")) || {};
        if (body.enabled === false) {
          delete tasks[String(body.chatId)];
        } else {
          tasks[String(body.chatId)] = {
            ...body,
            chatId: String(body.chatId),
            updatedAt: Date.now()
          };
        }
        await kv.put("proactive:tasks", JSON.stringify(tasks));
        return jsonResp({ ok: true, taskCount: Object.keys(tasks).length });
      }

      if (request.method === "GET" && sub === "/inbox") {
        const inbox = (await kv.get("proactive:inbox", "json")) || [];
        return jsonResp({ ok: true, items: Array.isArray(inbox) ? inbox : [] });
      }

      if (request.method === "POST" && sub === "/ack") {
        const body = await request.json().catch(() => ({}));
        const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
        const inbox = (await kv.get("proactive:inbox", "json")) || [];
        const remaining = Array.isArray(inbox) ? inbox.filter((it) => !ids.has(String(it.id))) : [];
        await kv.put("proactive:inbox", JSON.stringify(remaining));
        return jsonResp({ ok: true, remaining: remaining.length });
      }

      if (request.method === "POST" && sub === "/test-push") {
        const body = await request.json().catch(() => ({}));
        const pushUrl = String(body.pushUrl || "").trim();
        if (!pushUrl) return jsonResp({ ok: false, error: "请先填写 Bark 或 ntfy 推送地址" }, 400);
        const pushRes = await sendCloudNotification(
          pushUrl,
          body.title || "🕊️ 鸿雁传书测试",
          body.body || "云端锁屏推送通道已连通！即使关闭网页也能收到名士来信。"
        );
        return jsonResp(pushRes, pushRes.ok ? 200 : 502);
      }

      return jsonResp({ ok: false, error: "Unknown /proactive route" }, 404);
    }

    // 语音 TTS/STT 白名单代理（Fish Audio / MiniMax / ElevenLabs）
    if (route.id === "voice") {
      const sub = String(route.subPath || "/");
      if (request.method === "GET" && (sub === "/" || sub === "")) {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "milvus-voice-cors-gateway",
            routes: [
              "/voice/fish/tts",
              "/voice/fish/stt",
              "/voice/minimax/t2a",
              "/voice/minimax/stt",
              "/voice/elevenlabs/tts",
              "/voice/elevenlabs/stt"
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      try {
        let upUrl = "";
        const upHeaders = {};
        const contentType = request.headers.get("Content-Type") || "";
        if (contentType) upHeaders["Content-Type"] = contentType;

        if (sub === "/fish/tts" || sub === "/fish/stt") {
          const auth = request.headers.get("Authorization") || (env && env.FISH_API_KEY ? `Bearer ${env.FISH_API_KEY}` : "");
          if (!auth) {
            return new Response(JSON.stringify({ error: "Missing Fish Audio API Key" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS }
            });
          }
          upHeaders["Authorization"] = auth;
          upHeaders["model"] = reqUrl.searchParams.get("model") || request.headers.get("model") || (sub === "/fish/tts" ? "s2.1-pro" : "transcribe-1-pro");
          upUrl = sub === "/fish/tts" ? "https://api.fish.audio/v1/tts" : "https://api.fish.audio/v1/asr";
        } else if (sub === "/minimax/t2a" || sub === "/minimax/stt") {
          const auth = request.headers.get("Authorization") || (env && env.MINIMAX_API_KEY ? `Bearer ${env.MINIMAX_API_KEY}` : "");
          if (!auth) {
            return new Response(JSON.stringify({ error: "Missing MiniMax API Key" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS }
            });
          }
          const region = (reqUrl.searchParams.get("region") || request.headers.get("X-MiniMax-Region") || "domestic").toLowerCase();
          const base = region === "overseas" ? "https://api.minimax.io" : "https://api.minimaxi.com";
          upHeaders["Authorization"] = auth;
          upUrl = sub === "/minimax/t2a" ? `${base}/v1/t2a_v2` : `${base}/v1/speech_to_text`;
        } else if (sub === "/elevenlabs/tts" || sub === "/elevenlabs/stt") {
          const rawAuth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
          const xiKey = request.headers.get("xi-api-key") || rawAuth || (env && env.ELEVENLABS_API_KEY) || "";
          if (!xiKey) {
            return new Response(JSON.stringify({ error: "Missing ElevenLabs API Key" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS }
            });
          }
          upHeaders["xi-api-key"] = xiKey;
          if (sub === "/elevenlabs/tts") {
            const vid = (reqUrl.searchParams.get("voice_id") || "").trim();
            if (!/^[A-Za-z0-9_-]{6,64}$/.test(vid)) {
              return new Response(JSON.stringify({ error: "Missing or invalid voice_id" }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS }
              });
            }
            const fmt = (reqUrl.searchParams.get("output_format") || "mp3_44100_128").replace(/[^a-z0-9_]/gi, "");
            upHeaders["Accept"] = "audio/mpeg";
            upUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}?output_format=${encodeURIComponent(fmt)}`;
          } else {
            upUrl = "https://api.elevenlabs.io/v1/speech-to-text";
          }
        } else {
          return new Response(JSON.stringify({ error: "Unknown voice route" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        const rawBuf = await request.arrayBuffer();
        const up = await fetch(upUrl, { method: "POST", headers: upHeaders, body: rawBuf });
        const respBuf = await up.arrayBuffer();
        return new Response(respBuf, {
          status: up.status,
          headers: {
            "Content-Type": up.headers.get("Content-Type") || "application/octet-stream",
            ...CORS_HEADERS
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Voice upstream failed" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    // AO3 白名单 GET 代理（仅允许 /works 与 /works/... 路径）
    if (route.id === "ao3") {
      const sub = String(route.subPath || "/");
      if (sub === "/" || sub === "") {
        return new Response(JSON.stringify({ ok: true, service: "ao3-cors-gateway" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      if (!sub.startsWith("/works") || sub.includes("..")) {
        return new Response(JSON.stringify({ error: "Only /works paths are allowed for AO3 proxy" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const ao3Url = `https://archiveofourown.org${sub}${reqUrl.search || ""}`;
      try {
        const up = await fetch(ao3Url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
          },
          redirect: "follow"
        });
        const html = await up.text();
        return new Response(html, {
          status: up.status,
          headers: {
            "Content-Type": up.headers.get("Content-Type") || "text/html; charset=utf-8",
            ...CORS_HEADERS
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "AO3 upstream failed" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "milvus-life-mcp-cors-gateway",
          activeRoute: route.id,
          routes: ["/", "/luckin", "/mcd", "/ima/openapi/*", "/amap"]
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }

    let targetUrl = route.target || "";
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };

    const sessionId = request.headers.get("Mcp-Session-Id");
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    if (route.authType === "embed_proxy") {
      const targetRaw = request.headers.get("X-Target-Embed-Url") || "https://api.siliconflow.cn/v1/embeddings";
      let parsedTarget = null;
      try {
        parsedTarget = new URL(targetRaw);
      } catch (e) {}
      if (!parsedTarget || parsedTarget.protocol !== "https:" || !EMBED_ALLOWED_HOSTS.has(parsedTarget.hostname.toLowerCase())) {
        return new Response(JSON.stringify({ error: "Target embed host not in whitelist" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const auth = request.headers.get("Authorization") || (env && env.EMBED_API_KEY ? `Bearer ${env.EMBED_API_KEY}` : "");
      if (!auth) {
        return new Response(JSON.stringify({ error: "Missing Authorization Bearer Token for embed" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      targetUrl = parsedTarget.toString();
      headers["Authorization"] = auth;
    } else if (route.authType === "ima_openapi") {
      const sub = String(route.subPath || "");
      if (!sub.startsWith("openapi/") || sub.includes("..")) {
        return new Response(JSON.stringify({ error: "Invalid IMA OpenAPI path (must start with openapi/)" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const clientId = request.headers.get("ima-openapi-clientid") || (env && env.IMA_CLIENT_ID) || "";
      const apiKey = request.headers.get("ima-openapi-apikey") || (env && env.IMA_API_KEY) || "";
      if (!clientId || !apiKey) {
        return new Response(JSON.stringify({ error: "Missing IMA Client ID or API Key" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      targetUrl = `https://ima.qq.com/${sub}`;
      headers["ima-openapi-clientid"] = clientId;
      headers["ima-openapi-apikey"] = apiKey;
      headers["ima-openapi-ctx"] = request.headers.get("ima-openapi-ctx") || "skill_version=1.1.10";
    } else if (route.authType === "bearer") {
      const clientAuth = request.headers.get("Authorization");
      const envToken = env && env[route.envKey] ? `Bearer ${env[route.envKey]}` : "";
      const authHeader = clientAuth || envToken;
      if (!authHeader) {
        return new Response(JSON.stringify({ error: `Missing Authorization Bearer Token for ${route.id}` }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      headers["Authorization"] = authHeader;
    } else if (route.authType === "query_key") {
      const key = reqUrl.searchParams.get("key") || (env && env[route.envKey]) || "";
      if (!key) {
        return new Response(JSON.stringify({ error: "Missing key parameter for amap" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      targetUrl = `${route.target}?key=${encodeURIComponent(key)}`;
    }

    try {
      const bodyText = await request.text();
      const upstream = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: bodyText
      });

      const respHeaders = {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        ...CORS_HEADERS
      };
      const upSession = upstream.headers.get("Mcp-Session-Id");
      if (upSession) respHeaders["Mcp-Session-Id"] = upSession;

      const respText = await upstream.text();
      return new Response(respText, { status: upstream.status, headers: respHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || "Upstream request failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
  },

  // ========================================================
  // Cloudflare Cron Trigger：离线云端巡检 & 锁屏推送
  // 推荐 Cron 表达式：*/5 * * * * （每 5 分钟检查一次）
  // ========================================================
  async scheduled(event, env, ctx) {
    if (!env || !env.PROACTIVE_KV) return;
    ctx.waitUntil(runCloudProactiveCron(env));
  }
};

function parseCloudHHMM(str) {
  const m = String(str || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isCloudQuietHours(localDate, startStr, endStr) {
  const s = parseCloudHHMM(startStr);
  const e = parseCloudHHMM(endStr);
  if (s === null || e === null || s === e) return false;
  const cur = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

async function sendCloudNotification(pushUrl, title, body) {
  try {
    const raw = String(pushUrl || "").trim();
    if (!/^https?:\/\//i.test(raw)) {
      return { ok: false, error: "推送地址必须以 http:// 或 https:// 开头" };
    }
    let u;
    try {
      u = new URL(raw);
    } catch (e) {
      return { ok: false, error: "推送地址格式无效，请检查是否有多余空格或中文符号" };
    }

    // 1. Bark 协议（自动兼容直接从 Bark App 复制的带中文示例尾巴的链接，如 https://api.day.app/KEY/这里改成你自己的推送内容）
    if (/api\.day\.app|bark/i.test(u.hostname + u.pathname)) {
      const segs = u.pathname.split("/").filter(Boolean);
      const deviceKey = segs[0] || "";
      if (!deviceKey) {
        return { ok: false, error: "Bark 地址缺少设备 Key（应为 https://api.day.app/你的Key）" };
      }
      const endpoint = `${u.origin}/${encodeURIComponent(deviceKey)}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ title: String(title || "鸿雁传书"), body: String(body || ""), group: "AnoPhone" })
      });
      if (!r.ok) {
        const errDetail = (await r.text().catch(() => "")).slice(0, 200);
        return { ok: false, status: r.status, error: `Bark 返回 HTTP ${r.status}: ${errDetail || "请检查 Bark Key 是否正确"}` };
      }
      return { ok: true, status: r.status, provider: "bark" };
    }

    // 2. ntfy 协议（避免 HTTP Header 中出现非 ASCII 字符被拒，中文标题与正文均放 UTF-8 Body）
    const cleanTarget = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    const r = await fetch(cleanTarget, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Title": "Ano-Phone"
      },
      body: `${title}\n${body}`
    });
    if (!r.ok) {
      const errDetail = (await r.text().catch(() => "")).slice(0, 200);
      return { ok: false, status: r.status, error: `ntfy 返回 HTTP ${r.status}: ${errDetail || "请检查主题链接是否正确"}` };
    }
    return { ok: true, status: r.status, provider: "ntfy" };
  } catch (err) {
    return { ok: false, error: `云端推送网络异常: ${err.message || "Push failed"}` };
  }
}

async function runCloudProactiveCron(env) {
  const kv = env.PROACTIVE_KV;
  const tasks = (await kv.get("proactive:tasks", "json")) || {};
  const entries = Object.values(tasks);
  if (entries.length === 0) return;

  const nowMs = Date.now();
  const inbox = (await kv.get("proactive:inbox", "json")) || [];
  let tasksDirty = false;
  let inboxDirty = false;

  for (const task of entries) {
    if (!task || !task.enabled || !task.llmEndpoint || !task.llmApiKey) continue;
    const tzOffsetMin = Number(task.tzOffsetMinutes ?? 480); // 默认东八区 UTC+8
    const localDate = new Date(nowMs + tzOffsetMin * 60000);
    const todayStr = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(localDate.getUTCDate()).padStart(2, "0")}`;

    if (isCloudQuietHours(localDate, task.quietStart || "23:30", task.quietEnd || "07:30")) continue;

    const sentToday = task.sentTodayDate === todayStr ? Number(task.sentTodayCount) || 0 : 0;
    if (sentToday >= (Number(task.dailyLimit) || 6)) continue;
    if ((Number(task.unansweredCount) || 0) >= (Number(task.maxUnanswered) || 2)) continue;

    // 检查是否到定点或间隔
    let dueKind = "";
    let matchedSlot = "";
    const curMin = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const firedSlots = task.sentTodayDate === todayStr && Array.isArray(task.firedDailySlots) ? task.firedDailySlots : [];

    if (task.mode === "daily" || task.mode === "hybrid") {
      for (const slot of Array.isArray(task.dailyTimes) ? task.dailyTimes : []) {
        if (firedSlots.includes(slot)) continue;
        const sm = parseCloudHHMM(slot);
        if (sm !== null && curMin >= sm && curMin - sm <= 15) {
          dueKind = "daily";
          matchedSlot = slot;
          break;
        }
      }
    }
    if (!dueKind && (task.mode === "interval" || task.mode === "hybrid")) {
      const intervalMs = Math.max(15, Number(task.intervalMinutes) || 60) * 60000;
      const lastAt = Number(task.lastFiredAt) || Number(task.updatedAt) || 0;
      if (nowMs - lastAt >= intervalMs) dueKind = "interval";
    }
    if (!dueKind) continue;

    // 云端调用用户自己的 LLM 生成主动消息
    try {
      const timeLabel = `${String(localDate.getUTCHours()).padStart(2, "0")}:${String(localDate.getUTCMinutes()).padStart(2, "0")}`;
      const sysPrompt = `你是【${task.charName || "名士"}】，现在是 ${todayStr} ${timeLabel}。请给【${task.userName || "主公"}】主动发 1~2 句简短自然的日常传讯（15~65 字），贴合人设：${task.personality || "温柔自然"}。不要加旁白或前缀。`;
      const usrPrompt = task.recentContext
        ? `【近期对话】\n${task.recentContext}\n\n请自然主动发一句消息。`
        : "你忽然想起了对方，主动发一句问候或分享此刻正在做的事。";

      const llmRes = await fetch(task.llmEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${task.llmApiKey}`
        },
        body: JSON.stringify({
          model: task.llmModel || "gpt-4o-mini",
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: usrPrompt }
          ],
          temperature: 0.82,
          max_tokens: 180
        })
      });
      if (!llmRes.ok) continue;
      const llmJson = await llmRes.json();
      const rawContent = (llmJson?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!rawContent) continue;

      const msgItem = {
        id: `cloud_${task.chatId}_${nowMs}`,
        chatId: task.chatId,
        charName: task.charName || "名士",
        text: rawContent,
        time: timeLabel,
        createdAt: nowMs
      };
      inbox.push(msgItem);
      inboxDirty = true;

      task.lastFiredAt = nowMs;
      task.unansweredCount = (Number(task.unansweredCount) || 0) + 1;
      task.sentTodayDate = todayStr;
      task.sentTodayCount = sentToday + 1;
      task.firedDailySlots = matchedSlot ? [...firedSlots, matchedSlot] : firedSlots;
      tasksDirty = true;

      if (task.pushUrl) {
        await sendCloudNotification(task.pushUrl, `${task.charName || "名士"}发来传讯`, rawContent);
      }
      // 每次 Cron 最多触发 1 个角色，防止多角色同时刷屏与超时
      break;
    } catch (e) {
      // 静默跳过单次失败
    }
  }

  if (tasksDirty) await kv.put("proactive:tasks", JSON.stringify(tasks));
  if (inboxDirty) await kv.put("proactive:inbox", JSON.stringify(inbox.slice(-50)));
}
