/**
 * phantom_gateway/ws_bridge.js
 * 路线一：MonsterParty 云端 WebSocket 远程控制本机中继网关（监听 127.0.0.1:8766）
 *
 * 依赖说明：需要 Node.js 18+ 以及 `ws` 包（用于自定义 Origin: https://www.monsterparty.cn 握手头）：
 *   npm install ws
 *   node phantom_gateway/ws_bridge.js
 */
const http = require("http");

let WebSocketImpl = null;
try {
  WebSocketImpl = require("ws");
} catch (e) {
  console.error("\n❌ 缺少 ws 依赖包，请先在项目目录运行：npm install ws\n");
  process.exit(1);
}

const PORT = Number(process.env.PHANTOM_BRIDGE_PORT || 8766);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

let activeWs = null;
let heartbeatTimer = null;
let sessionState = {
  connected: false,
  ready: false,
  sender_fd: null,
  pid: "",
  is_ds: false,
  key_type: "vib"
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
}

function sendStopToUpstream() {
  if (activeWs && activeWs.readyState === WebSocketImpl.OPEN && sessionState.sender_fd !== null) {
    try {
      activeWs.send(
        JSON.stringify({
          op: 3,
          vib: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          fd: sessionState.sender_fd,
          keyType: sessionState.key_type || "vib"
        })
      );
    } catch (e) {}
  }
}

function teardownWs() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  sendStopToUpstream();
  if (activeWs) {
    try {
      activeWs.close();
    } catch (e) {}
    activeWs = null;
  }
  sessionState = { connected: false, ready: false, sender_fd: null, pid: "", is_ds: false, key_type: "vib" };
}

async function connectMonsterParty(token) {
  teardownWs();

  const metaRes = await fetch(`https://api.monsterparty.cc/main/v1/remote?s=${encodeURIComponent(token)}`);
  const metaJson = await metaRes.json();
  const data = metaJson && metaJson.data;
  if (!data || !data.socket_url || !data.id) {
    throw new Error(metaJson?.msg || "分享 Token 无效或已过期，请在 App 重新生成远程控制链接");
  }

  return await new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(data.socket_url, {
      headers: { Origin: "https://www.monsterparty.cn" },
      perMessageDeflate: false
    });
    activeWs = ws;

    const timeout = setTimeout(() => {
      reject(new Error("等待设备握手超时（12秒），请确认设备已开机且 App 在线"));
    }, 12000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          op: 2,
          id: 8899001,
          gender: "male",
          remoteID: data.id,
          senderID: data.user_id,
          avatar: "",
          nickname: "remote",
          lat: 0,
          lng: 0,
          area: ""
        })
      );
      // 禁用底层 ping，只用应用层 op:8 心跳（每 9 秒）
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocketImpl.OPEN) {
          ws.send(JSON.stringify({ op: 8 }));
        }
      }, 9000);
    });

    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString("utf8"));
        if (msg.op === 6 && msg.sender && msg.sender.fd !== undefined) {
          sessionState.sender_fd = msg.sender.fd;
          sessionState.key_type = msg.isSuck ? "suck" : "vib";
          sessionState.connected = true;
        } else if (msg.op === 15) {
          sessionState.ready = Boolean(msg.conn);
          sessionState.pid = msg.pid || "";
          sessionState.is_ds = /SUCKEGG|_DS_/i.test(sessionState.pid);
          if (sessionState.is_ds) sessionState.key_type = "suck";
          if (sessionState.connected) {
            clearTimeout(timeout);
            resolve({ ...sessionState });
          }
        }
      } catch (e) {}
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error("WebSocket 连接出错: " + err.message));
    });

    ws.on("close", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      sessionState.connected = false;
      sessionState.ready = false;
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    return sendJson(res, 200, sessionState);
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch (e) {}

    try {
      if (req.method === "POST" && req.url === "/connect") {
        const st = await connectMonsterParty(String(body.token || "").trim());
        return sendJson(res, 200, st);
      }
      if (req.method === "POST" && req.url === "/command") {
        if (!activeWs || activeWs.readyState !== WebSocketImpl.OPEN || sessionState.sender_fd === null) {
          return sendJson(res, 400, { error: "设备未就绪或已断线" });
        }
        const vib = Array.isArray(body.vib) && body.vib.length === 10
          ? body.vib.map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))))
          : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        activeWs.send(
          JSON.stringify({
            op: 3,
            vib,
            fd: sessionState.sender_fd,
            keyType: body.keyType || sessionState.key_type || "vib"
          })
        );
        return sendJson(res, 200, { ok: true, vib });
      }
      if (req.method === "POST" && req.url === "/stop") {
        sendStopToUpstream();
        return sendJson(res, 200, { ok: true, stopped: true });
      }
      if (req.method === "POST" && req.url === "/disconnect") {
        teardownWs();
        return sendJson(res, 200, { ok: true, disconnected: true });
      }
      return sendJson(res, 404, { error: "Not Found" });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || "Bridge Error" });
    }
  });
});

process.on("SIGINT", () => {
  teardownWs();
  process.exit(0);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n📡 智能体感外设云端 WS 中继已启动：http://127.0.0.1:${PORT}`);
  console.log(`   按 Ctrl+C 停止（会自动发送归零急停指令）。\n`);
});

