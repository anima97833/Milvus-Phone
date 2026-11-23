/**
 * luckin_gateway/luckin_proxy.js
 * 多品牌官方 MCP / OpenAPI 本机零依赖 Node.js 转发代理（路线 B）
 *
 * 启动方式：
 *   node luckin_gateway/luckin_proxy.js
 * 支持路由：
 *   - 瑞幸：    http://127.0.0.1:8765/mcp/luckin （或根路径 /）
 *   - 麦当劳：  http://127.0.0.1:8765/mcd
 *   - 腾讯 IMA：http://127.0.0.1:8765/ima
 *   - 高德：    http://127.0.0.1:8765/amap?key=你的高德Key
 */
const http = require("http");

const PORT = Number(process.env.LUCKIN_PROXY_PORT || 8765);

const ROUTES = {
  luckin: { target: "https://gwmcp.lkcoffee.com/order/user/mcp", envKey: "LUCKIN_MCP_TOKEN", authType: "bearer" },
  mcd: { target: "https://mcp.mcd.cn", envKey: "MCD_MCP_TOKEN", authType: "bearer" },
  amap: { target: "https://mcp.amap.com/mcp", envKey: "AMAP_KEY", authType: "query_key" }
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, ima-openapi-clientid, ima-openapi-apikey, ima-openapi-ctx, xi-api-key, model, X-MiniMax-Region, X-MiniMax-Group-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Content-Type"
};

function resolveRoute(pathname) {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  const lower = p.toLowerCase();
  if (lower === "/voice" || lower.startsWith("/voice/")) {
    return { id: "voice", authType: "voice_proxy", subPath: lower.slice(6) || "/" };
  }
  if (lower === "/ao3" || lower.startsWith("/ao3/")) {
    return { id: "ao3", authType: "ao3_proxy", subPath: p.slice(4) || "/" };
  }
  if (lower === "/mcd" || lower.startsWith("/mcd/")) return { id: "mcd", ...ROUTES.mcd };
  if (lower === "/amap" || lower.startsWith("/amap/")) return { id: "amap", ...ROUTES.amap };
  if (lower === "/ima" || lower.startsWith("/ima/")) {
    return { id: "ima", authType: "ima_openapi", subPath: p.slice(4).replace(/^\/+/, "") };
  }
  return { id: "luckin", ...ROUTES.luckin };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const route = resolveRoute(parsedUrl.pathname);

  if (route.id === "voice") {
    const sub = String(route.subPath || "/");
    if (req.method === "GET" && (sub === "/" || sub === "")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: true, service: "milvus-voice-local-proxy" }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }
    const vChunks = [];
    req.on("data", (c) => vChunks.push(c));
    req.on("end", async () => {
      try {
        const rawBuf = Buffer.concat(vChunks);
        const upHeaders = {};
        if (req.headers["content-type"]) upHeaders["Content-Type"] = req.headers["content-type"];
        let upUrl = "";
        if (sub === "/fish/tts" || sub === "/fish/stt") {
          upHeaders["Authorization"] = req.headers["authorization"] || "";
          upHeaders["model"] = parsedUrl.searchParams.get("model") || req.headers["model"] || (sub === "/fish/tts" ? "s2.1-pro" : "transcribe-1-pro");
          upUrl = sub === "/fish/tts" ? "https://api.fish.audio/v1/tts" : "https://api.fish.audio/v1/asr";
        } else if (sub === "/minimax/t2a" || sub === "/minimax/stt") {
          const region = (parsedUrl.searchParams.get("region") || req.headers["x-minimax-region"] || "domestic").toLowerCase();
          const base = region === "overseas" ? "https://api.minimax.io" : "https://api.minimaxi.com";
          upHeaders["Authorization"] = req.headers["authorization"] || "";
          upUrl = sub === "/minimax/t2a" ? `${base}/v1/t2a_v2` : `${base}/v1/speech_to_text`;
        } else if (sub === "/elevenlabs/tts" || sub === "/elevenlabs/stt") {
          upHeaders["xi-api-key"] = req.headers["xi-api-key"] || String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
          if (sub === "/elevenlabs/tts") {
            const vid = (parsedUrl.searchParams.get("voice_id") || "").trim();
            const fmt = (parsedUrl.searchParams.get("output_format") || "mp3_44100_128").replace(/[^a-z0-9_]/gi, "");
            upHeaders["Accept"] = "audio/mpeg";
            upUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}?output_format=${encodeURIComponent(fmt)}`;
          } else {
            upUrl = "https://api.elevenlabs.io/v1/speech-to-text";
          }
        } else {
          res.writeHead(404, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: "Unknown voice route" }));
          return;
        }
        const up = await fetch(upUrl, { method: "POST", headers: upHeaders, body: rawBuf });
        const respBuf = Buffer.from(await up.arrayBuffer());
        res.writeHead(up.status, {
          "Content-Type": up.headers.get("content-type") || "application/octet-stream",
          ...CORS_HEADERS
        });
        res.end(respBuf);
      } catch (err) {
        res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ error: err.message || "Voice local proxy failed" }));
      }
    });
    return;
  }

  if (route.id === "ao3") {
    const sub = String(route.subPath || "/");
    if (sub === "/" || sub === "") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: true, service: "ao3-local-proxy" }));
      return;
    }
    if (!sub.startsWith("/works") || sub.includes("..")) {
      res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "Only /works paths allowed" }));
      return;
    }
    try {
      const up = await fetch(`https://archiveofourown.org${sub}${parsedUrl.search || ""}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"
        }
      });
      const html = await up.text();
      res.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "text/html; charset=utf-8", ...CORS_HEADERS });
      res.end(html);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message || "AO3 proxy failed" }));
    }
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS });
    res.end(JSON.stringify({ ok: true, service: "milvus-local-mcp-proxy", activeRoute: route.id }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const bodyStr = Buffer.concat(chunks).toString("utf8");
      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      };
      if (req.headers["mcp-session-id"]) headers["Mcp-Session-Id"] = req.headers["mcp-session-id"];

      let targetUrl = route.target || "";
      if (route.authType === "ima_openapi") {
        const sub = String(route.subPath || "");
        if (!sub.startsWith("openapi/") || sub.includes("..")) {
          res.writeHead(400, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: "Invalid IMA OpenAPI path" }));
          return;
        }
        const cid = req.headers["ima-openapi-clientid"] || process.env.IMA_CLIENT_ID || "";
        const key = req.headers["ima-openapi-apikey"] || process.env.IMA_API_KEY || "";
        if (!cid || !key) {
          res.writeHead(401, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: "缺少 IMA Client ID 或 API Key" }));
          return;
        }
        targetUrl = `https://ima.qq.com/${sub}`;
        headers["ima-openapi-clientid"] = cid;
        headers["ima-openapi-apikey"] = key;
        headers["ima-openapi-ctx"] = req.headers["ima-openapi-ctx"] || "skill_version=1.1.10";
      } else if (route.authType === "bearer") {
        const authHeader =
          req.headers["authorization"] ||
          (process.env[route.envKey] ? `Bearer ${process.env[route.envKey]}` : "");
        if (!authHeader) {
          res.writeHead(401, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: `缺少 Authorization Bearer Token (${route.id})` }));
          return;
        }
        headers["Authorization"] = authHeader;
      } else if (route.authType === "query_key") {
        const key = parsedUrl.searchParams.get("key") || process.env[route.envKey] || "";
        if (!key) {
          res.writeHead(401, { "Content-Type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ error: "缺少高德 key 参数" }));
          return;
        }
        targetUrl = `${route.target}?key=${encodeURIComponent(key)}`;
      }

      const upstream = await fetch(targetUrl, { method: "POST", headers, body: bodyStr });
      const respHeaders = {
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        ...CORS_HEADERS
      };
      const upSession = upstream.headers.get("mcp-session-id");
      if (upSession) respHeaders["Mcp-Session-Id"] = upSession;

      const respText = await upstream.text();
      res.writeHead(upstream.status, respHeaders);
      res.end(respText);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: err.message || "转发官方服务失败" }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n☕🍟📓 多品牌官方 MCP / OpenAPI 本地转发网关已启动！`);
  console.log(`   瑞幸网关：    http://127.0.0.1:${PORT}/mcp/luckin`);
  console.log(`   麦当劳网关：  http://127.0.0.1:${PORT}/mcd`);
  console.log(`   腾讯 IMA 网关：http://127.0.0.1:${PORT}/ima`);
  console.log(`   按 Ctrl+C 停止服务。\n`);
});
