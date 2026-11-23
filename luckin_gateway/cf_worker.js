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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, ima-openapi-clientid, ima-openapi-apikey, ima-openapi-ctx, X-Target-Embed-Url, xi-api-key, model, X-MiniMax-Region, X-MiniMax-Group-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Content-Type",
  "Access-Control-Max-Age": "86400"
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
  }
};
