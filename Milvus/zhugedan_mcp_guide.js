/**
 * Milvus/zhugedan_mcp_guide.js
 * 设置 · MCP 瑞幸/麦当劳「诸葛诞（青丘坊主·阿休）搭建指引」独立模块
 * - 零改动 Milvus/app.min.js，零 localStorage 占用
 * - 内置完整多路由 Cloudflare Worker 转发代码一键复制，瑞幸篇 / 麦当劳篇自由切换
 * - 通过 ReactDOM.createPortal(..., document.body) 挂载在 zIndex: 99999，手机端顺滑不裁切
 */
(function (global) {
  "use strict";

  const CF_WORKER_CODE = `const ROUTES = {
  luckin: { target: "https://gwmcp.lkcoffee.com/order/user/mcp", envKey: "LUCKIN_MCP_TOKEN", authType: "bearer" },
  mcd:    { target: "https://mcp.mcd.cn", envKey: "MCD_MCP_TOKEN", authType: "bearer" },
  amap:   { target: "https://mcp.amap.com/mcp", envKey: "AMAP_KEY", authType: "query_key" }
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, ima-openapi-clientid, ima-openapi-apikey, ima-openapi-ctx",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400"
};
function resolveRoute(pathname) {
  const p = String(pathname || "/").replace(/\\/+$/, "") || "/";
  const lower = p.toLowerCase();
  if (lower === "/mcd" || lower.startsWith("/mcd/")) return { id: "mcd", ...ROUTES.mcd };
  if (lower === "/amap" || lower.startsWith("/amap/")) return { id: "amap", ...ROUTES.amap };
  if (lower === "/ima" || lower.startsWith("/ima/")) return { id: "ima", authType: "ima_openapi", subPath: p.slice(4).replace(/^\\/+/, "") };
  return { id: "luckin", ...ROUTES.luckin };
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const reqUrl = new URL(request.url);
    const route = resolveRoute(reqUrl.pathname);
    if (request.method === "GET") {
      return new Response(JSON.stringify({ ok: true, activeRoute: route.id }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
    }
    let targetUrl = route.target || "";
    const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
    const sid = request.headers.get("Mcp-Session-Id");
    if (sid) headers["Mcp-Session-Id"] = sid;
    if (route.authType === "ima_openapi") {
      const sub = String(route.subPath || "");
      if (!sub.startsWith("openapi/") || sub.includes("..")) return new Response(JSON.stringify({ error: "Invalid IMA path" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
      const cid = request.headers.get("ima-openapi-clientid") || (env && env.IMA_CLIENT_ID) || "";
      const key = request.headers.get("ima-openapi-apikey") || (env && env.IMA_API_KEY) || "";
      if (!cid || !key) return new Response(JSON.stringify({ error: "Missing IMA credentials" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS } });
      targetUrl = "https://ima.qq.com/" + sub;
      headers["ima-openapi-clientid"] = cid;
      headers["ima-openapi-apikey"] = key;
      headers["ima-openapi-ctx"] = request.headers.get("ima-openapi-ctx") || "skill_version=1.1.10";
    } else if (route.authType === "bearer") {
      const auth = request.headers.get("Authorization") || (env && env[route.envKey] ? "Bearer " + env[route.envKey] : "");
      if (!auth) return new Response(JSON.stringify({ error: "Missing Bearer Token" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS } });
      headers["Authorization"] = auth;
    } else if (route.authType === "query_key") {
      const key = reqUrl.searchParams.get("key") || (env && env[route.envKey]) || "";
      if (!key) return new Response(JSON.stringify({ error: "Missing key" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS } });
      targetUrl = route.target + "?key=" + encodeURIComponent(key);
    }
    const upstream = await fetch(targetUrl, { method: "POST", headers, body: await request.text() });
    const respHeaders = { "Content-Type": upstream.headers.get("Content-Type") || "application/json", ...CORS };
    const upSid = upstream.headers.get("Mcp-Session-Id");
    if (upSid) respHeaders["Mcp-Session-Id"] = upSid;
    return new Response(await upstream.text(), { status: upstream.status, headers: respHeaders });
  }
};`;

  const GUIDE_CONTENT = {
    luckin: {
      tabLabel: "☕ 瑞幸咖啡篇",
      intro:
        "咕咕……贵人可算点开这枚问号了！怎么，想让小手机里的诸位替你真去买杯生椰拿铁，却被浏览器那套死板的「跨域家法」拦在门外了？莫急——行乐才是正道！本坊主教你借 Cloudflare 搭座免费的「云端戏台」替你传话，三步开锣，天王老子管不着！",
      steps: [
        {
          title: "第一折 · 去瑞幸官府领块「令牌」",
          voice:
            "没凭没据，人家咖啡铺子凭什么听你的？先去瑞幸开放平台把你自己的 MCP 令牌领到手——记得把底下那行协议勾上，不然登录键灰得像块木头，戳穿屏幕也进不去！",
          actions: [
            "打开瑞幸官方 MCP 入口：https://open.lkcoffee.com/mcp",
            "点右上角「登录」→ 填本人瑞幸手机号与 6 位短信验证码 → 勾选用户协议 → 登录。",
            "复制页面代码块里 Bearer 后面的那一长串字符（不含 Bearer 本身），约 1 个月有效。"
          ],
          note: "公休嘱咐：这令牌连着你的真实瑞幸号，比我兄长藏着的辟雍考卷还金贵，切莫发给旁人或传上 GitHub！只填在小手机里，存在你本机 IndexedDB 暗格中。",
          link: { label: "前往瑞幸 MCP 平台 ↗", url: "https://open.lkcoffee.com/mcp" }
        },
        {
          title: "第二折 · 借 Cloudflare 搭座免费「传话戏台」",
          voice:
            "浏览器这老古董守着跨域规矩，咱们就去 Cloudflare 白嫖个 Worker 当传话筒。戏台代码本坊主都替你写妥了，点一下抄走粘贴便是——一个戏台，瑞幸和麦当劳两家都能唱！",
          actions: [
            "登录 Cloudflare（https://dash.cloudflare.com）→ 左侧 Workers & Pages → Create → Create Worker。",
            "起个名（如 luckin-mcp）→ 点 Deploy → 再点 Edit code。",
            "清空默认代码，点下方「一键复制多路由 Worker 代码」粘进去 → 点右上角 Deploy。",
            "复制生成的 Worker 网址（如 https://luckin-mcp.你的子域.workers.dev）。"
          ],
          note: "偷懒暗门：也可以在 Worker 的 Settings → Variables and Secrets 里加条 Secret 叫 LUCKIN_MCP_TOKEN，小手机里连令牌栏都能空着，干净利落！",
          showCopyWorker: true,
          link: { label: "打开 Cloudflare 控制台 ↗", url: "https://dash.cloudflare.com" }
        },
        {
          title: "第三折 · 回小手机落座开点（绝不乱扣银子）",
          voice:
            "戏台搭好了，回到配置卡把 Worker 网址和令牌填进去，再点一下「📍 定位」叫它认得你身在何处，最后点「🔍 测试真实连通性」——亮了绿字，这出戏便开锣啦！",
          actions: [
            "瑞幸转发网关地址填：https://你的Worker域名（根路径 / 或 /luckin 皆可）。",
            "点「📍 定位」自动填入经纬度 → 点「🔍 测试真实连通性」，见到 ✅ 已发现 8 个官方工具 即大功告成。",
            "防坑保证：名士只会先查真门店、算券后价报给你；真要下单前必定弹出二次确认窗，必须你亲手点确认才会提交！"
          ]
        }
      ]
    },
    mcd: {
      tabLabel: "🍟 麦当劳篇",
      intro:
        "咕咕……咖啡喝完了，不来份薯条麦乐鸡垫垫肚子？麦当劳这边的规矩同瑞幸一般无二，只是登录时会跳去个独门别院，贵人可别以为走错了道儿——搭好了叫名士天天顺手替你领麦门神券！",
      steps: [
        {
          title: "第一折 · 去金拱门领你的「麦门令牌」",
          voice:
            "去麦当劳 MCP 平台激活一串专属令牌，记得点进「控制台」再去点「激活」，别在首页干瞪眼瞧着！",
          actions: [
            "打开麦当劳官方 MCP 平台：https://open.mcd.cn/mcp/doc",
            "点右上角「登录」（会跳去独立登录页）→ 填手机号 + 验证码 + 勾选协议登录。",
            "回到首页点右上角「控制台」→ 在 Token 栏点「激活」→ 同意协议 → 一键复制你的 MCD_MCP_TOKEN。"
          ],
          note: "公休嘱咐：此令牌代表你的麦当劳会员身份与积分，严禁分享或提交到公开仓库！",
          link: { label: "前往麦当劳 MCP 平台 ↗", url: "https://open.mcd.cn/mcp/doc" }
        },
        {
          title: "第二折 · 复用同一个 Cloudflare 戏台（不用重搭！）",
          voice:
            "既然瑞幸那座戏台已经搭好了，何必费劲再盖第二座？拿本坊主这份多路由 Worker 代码覆盖部署一次，这台子便自动认得 /mcd 这条暗道，瑞幸麦当劳双戏同台！",
          actions: [
            "打开你已有的 Cloudflare Worker → Edit code → 点下方「一键复制多路由 Worker 代码」覆盖旧代码 → Deploy。",
            "你先前填好的瑞幸根路径 / 完全不受影响，无需改动。",
            "（可选）在 Worker Secrets 里添加 MCD_MCP_TOKEN，小手机里即可免填 Token。"
          ],
          showCopyWorker: true,
          link: { label: "打开 Cloudflare 控制台 ↗", url: "https://dash.cloudflare.com" }
        },
        {
          title: "第三折 · 一键复用地址，坐等名士替你领神券",
          voice:
            "回到麦当劳配置卡，点一下右上角那枚「⚡ 一键复用瑞幸 Worker (/mcd)」，填好令牌点「🔍 测试连通性并同步麦当劳工具」——以后懒得翻券，只管在私聊里唤一声便是！",
          actions: [
            "麦当劳网关地址填：https://你的Worker域名/mcd（点一键复用自动填）。",
            "测试连通并自动同步官方工具后，私聊提及「麦当劳 / 麦门 / 汉堡 / 薯条 / 领券」即自动按需挂载。",
            "安全兜底：查活动、查券、免费领券顺滑直出；涉及真实点餐、积分兑换、抽奖、退单，一律强制弹出二次确认窗！"
          ]
        }
      ]
    },
    ima: {
      tabLabel: "📓 腾讯 IMA 篇",
      intro:
        "咕咕……贵人连书房卷宗都要搬上云端啦？好眼光！腾讯 IMA 这套卷宗库其实走的是极清净的 OpenAPI，压根不用在电脑上装什么 Go 编译——还是咱们那座 Cloudflare 戏台，添一条 /ima 暗道，名士便能直接替你搜笔记、翻知识库、落笔存文！",
      steps: [
        {
          title: "第一折 · 去腾讯 IMA 领一对「双印」",
          voice:
            "人家卷宗库讲究双印合璧，点进「我的」寻着「claw配置」，把你的 Client ID 与 API Key 双双抄下，可别漏了哪半块！",
          actions: [
            "打开腾讯 IMA（https://ima.qq.com）→ 点击「我的」→ 点击「claw配置」。",
            "生成并复制你的个人 Client ID（IMA_OPENAPI_CLIENTID）与 API Key（IMA_OPENAPI_APIKEY）。"
          ],
          note: "公休嘱咐：双印直连你的个人笔记与知识库，严禁外泄或提交进 GitHub；填在小手机里只存你本机 IndexedDB。",
          link: { label: "前往腾讯 IMA ↗", url: "https://ima.qq.com" }
        },
        {
          title: "第二折 · 升级同一个 Cloudflare 戏台（三合一！）",
          voice:
            "还是原来那座 Cloudflare Worker，把本坊主刚更新的三合一代码盖上去一部署——瑞幸、麦当劳、腾讯 IMA 三出大戏同台唱，谁也不耽误谁！",
          actions: [
            "打开你已有的 Cloudflare Worker → Edit code → 点下方「一键复制多路由 Worker 代码」覆盖旧代码 → Deploy。",
            "（可选）在 Worker Secrets 里添加 IMA_CLIENT_ID 与 IMA_API_KEY，小手机里即可免填。"
          ],
          showCopyWorker: true,
          link: { label: "打开 Cloudflare 控制台 ↗", url: "https://dash.cloudflare.com" }
        },
        {
          title: "第三折 · 一键复用 /ima，随口吩咐名士记笔记",
          voice:
            "回到腾讯 IMA 配置卡，点一下「⚡ 一键复用 Worker (/ima)」，填妥双印点测试——往后私聊里说一句『把刚才聊的存进我的 IMA 笔记』，名士便真的替你落笔归档啦！",
          actions: [
            "IMA 网关地址填：https://你的Worker域名/ima（点一键复用自动填）。",
            "点「🔍 测试腾讯 IMA 真实连通性」，见 ✅ 连通成功 即打通搜笔记、读笔记、新建/追加 Markdown 笔记与浏览/检索知识库！"
          ],
          note: "公休提个醒：腾讯官府定有规矩——只有你自己写的「个人笔记」能直接拉取全文；若是他人共享的知识库或 PDF/外部文档，名士只能替你翻看检索摘要，拉不到原文（210005）可莫怪他们偷懒呀！"
        }
      ]
    }
  };

  function copyTextRobust(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
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

  // 全局单弹窗状态派发（无需在 app.min.js 单独挂载宿主）
  let _guideOpenState = { open: false, tab: "luckin" };
  let _hostMountedCount = 0;

  function openGuide(tab = "luckin") {
    const validTab = tab === "mcd" || tab === "ima" ? tab : "luckin";
    _guideOpenState = { open: true, tab: validTab };
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-zhugedan-guide-changed", { detail: { ..._guideOpenState } }));
    }
  }

  function closeGuide() {
    _guideOpenState = { ..._guideOpenState, open: false };
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-zhugedan-guide-changed", { detail: { ..._guideOpenState } }));
    }
  }

  function ZhugedanGuideModal() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    const [state, setState] = useState(() => ({ ..._guideOpenState }));
    const [copied, setCopied] = useState(false);
    const [showCode, setShowCode] = useState(false);

    useEffect(() => {
      const onChange = (e) => {
        if (e && e.detail) setState({ ...e.detail });
      };
      global.addEventListener("milvus-zhugedan-guide-changed", onChange);
      return () => global.removeEventListener("milvus-zhugedan-guide-changed", onChange);
    }, []);

    if (!state.open) return null;

    const cur = GUIDE_CONTENT[state.tab] || GUIDE_CONTENT.luckin;

    const handleCopy = () => {
      copyTextRobust(CF_WORKER_CODE).then((ok) => {
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
        }
      });
    };

    const modalNode = h(
      "div",
      {
        onClick: closeGuide,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(24, 22, 20, 0.64)",
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
            width: "min(92vw, 390px)",
            maxHeight: "85vh",
            background: "#FAF8F2",
            borderRadius: "18px",
            border: "1.5px solid #D9C9AE",
            boxShadow: "0 20px 48px rgba(18, 14, 10, 0.38)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "#38322B"
          }
        },
        // 顶栏：青丘坊主 · 诸葛诞
        h(
          "div",
          {
            style: {
              padding: "14px 16px 12px",
              background: "linear-gradient(135deg, #F4EFE3 0%, #EFE8D8 100%)",
              borderBottom: "1px solid #E4D8C1",
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
                  background: "linear-gradient(135deg, #C85A48, #8E372D)",
                  color: "#FFF9EE",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  boxShadow: "0 2px 6px rgba(142, 55, 45, 0.28)",
                  flexShrink: 0
                }
              },
              "🦊"
            ),
            h(
              "div",
              null,
              h("div", { style: { fontSize: "14.5px", fontWeight: "800", color: "#342A22" } }, "青丘戏坊 · 公休搭台指引"),
              h("div", { style: { fontSize: "11px", color: "#7F6A52" } }, "诸葛诞手把手教你搭真点单网关")
            )
          ),
          h(
            "button",
            {
              type: "button",
              onClick: closeGuide,
              style: {
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "none",
                background: "rgba(120, 96, 68, 0.14)",
                color: "#524334",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                flexShrink: 0
              }
            },
            "✕"
          )
        ),

        // 瑞幸 / 麦当劳 / 腾讯 IMA 三篇切换胶囊
        h(
          "div",
          {
            style: {
              padding: "10px 14px 6px",
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "6px",
              flexShrink: 0
            }
          },
          ["luckin", "mcd", "ima"].map((k) => {
            const active = state.tab === k;
            return h(
              "button",
              {
                key: k,
                type: "button",
                onClick: () => setState({ ...state, tab: k }),
                style: {
                  padding: "7px 4px",
                  borderRadius: "10px",
                  border: active ? "1.5px solid #4E7E8E" : "1px solid #DFD5C3",
                  background: active ? "#EDF5F7" : "#FFFFFF",
                  color: active ? "#2B5664" : "#7A6F62",
                  fontSize: "11.5px",
                  fontWeight: active ? "800" : "600",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }
              },
              GUIDE_CONTENT[k].tabLabel
            );
          })
        ),

        // 可滚动正文区
        h(
          "div",
          {
            style: {
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "8px 14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "11px"
            }
          },
          // 开场戏词
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                borderLeft: "3px solid #B85241",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "12.5px",
                lineHeight: 1.68,
                color: "#4A3C31",
                boxShadow: "0 1px 4px rgba(60, 45, 30, 0.04)"
              }
            },
            cur.intro
          ),

          // 三折步骤卡
          cur.steps.map((step, idx) =>
            h(
              "div",
              {
                key: idx,
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #E7DFCF",
                  borderRadius: "13px",
                  padding: "12px 13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }
              },
              h("div", { style: { fontSize: "13px", fontWeight: "800", color: "#2F4E5A" } }, step.title),
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#6C5643",
                    lineHeight: 1.6,
                    fontStyle: "italic",
                    background: "#FBF8F1",
                    padding: "7px 9px",
                    borderRadius: "8px"
                  }
                },
                `「${step.voice}」`
              ),
              h(
                "ol",
                {
                  style: {
                    margin: "0",
                    paddingLeft: "18px",
                    fontSize: "12px",
                    color: "#3E3832",
                    lineHeight: 1.68,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }
                },
                step.actions.map((act, i) => h("li", { key: i }, act))
              ),
              step.showCopyWorker &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" } },
                  h(
                    "div",
                    { style: { display: "flex", gap: "6px" } },
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: handleCopy,
                        style: {
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: "9px",
                          border: "none",
                          background: copied ? "#3B7A57" : "#4E7E8E",
                          color: "#FFFFFF",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer"
                        }
                      },
                      copied ? "✅ 已抄妥 Worker 代码，去粘贴部署吧！" : "📋 一键复制多路由 Worker 代码"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => setShowCode(!showCode),
                        style: {
                          padding: "8px 10px",
                          borderRadius: "9px",
                          border: "1px solid #D8CEBC",
                          background: "#FAF8F2",
                          color: "#6A5D4D",
                          fontSize: "11.5px",
                          fontWeight: "600",
                          cursor: "pointer"
                        }
                      },
                      showCode ? "收起" : "看代码"
                    )
                  ),
                  showCode &&
                    h(
                      "pre",
                      {
                        style: {
                          margin: 0,
                          padding: "8px",
                          borderRadius: "8px",
                          background: "#262320",
                          color: "#EFE9DC",
                          fontSize: "10px",
                          lineHeight: 1.45,
                          maxHeight: "150px",
                          overflow: "auto",
                          whiteSpace: "pre"
                        }
                      },
                      CF_WORKER_CODE
                    )
                ),
              step.link &&
                h(
                  "a",
                  {
                    href: step.link.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: {
                      alignSelf: "flex-start",
                      fontSize: "11.5px",
                      fontWeight: "700",
                      color: "#3F6F80",
                      textDecoration: "none",
                      background: "#EDF5F7",
                      border: "1px solid #CBE0E6",
                      padding: "4px 10px",
                      borderRadius: "999px"
                    }
                  },
                  step.link.label
                ),
              step.note &&
                h(
                  "div",
                  {
                    style: {
                      fontSize: "11px",
                      color: "#8B4A3A",
                      background: "#FDF3F0",
                      border: "1px solid #F1D3CA",
                      borderRadius: "8px",
                      padding: "6px 9px",
                      lineHeight: 1.55
                    }
                  },
                  step.note
                )
            )
          ),

          // 收尾彩蛋
          h(
            "div",
            {
              style: {
                background: "linear-gradient(135deg, #FBF4E5 0%, #F6EAD2 100%)",
                border: "1px dashed #D6BC8D",
                borderRadius: "12px",
                padding: "10px 12px",
                fontSize: "11.5px",
                color: "#6B4E2E",
                lineHeight: 1.65
              }
            },
            "「行啦，戏文唱到这儿，该教的都掏干净了。要是哪步卡壳了——别慌，先点测试看报错提示；实在不行，你就说是我诸葛公休干的！贵人若真喝上了冰拿铁、吃上了热薯条，记得赏本坊主两坛好酒啊——哎呀，吱富宝到账最好！」"
          )
        )
      )
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(modalNode, document.body);
    }
    return modalNode;
  }

  /**
   * 极简圆形 ? 问号按钮（内置单实例弹窗宿主，零改动 app.min.js）
   */
  function GuideHelpButton({ tab = "luckin" }) {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [isHostOwner, setIsHostOwner] = useState(false);

    useEffect(() => {
      if (_hostMountedCount === 0) {
        _hostMountedCount += 1;
        setIsHostOwner(true);
        return () => {
          _hostMountedCount = Math.max(0, _hostMountedCount - 1);
        };
      }
      return undefined;
    }, []);

    return h(
      React.Fragment,
      null,
      h(
        "button",
        {
          type: "button",
          title: "诸葛诞教你一步步搭建网关",
          onClick: (e) => {
            e.stopPropagation();
            openGuide(tab);
          },
          style: {
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            border: "1px solid #D3C3A3",
            background: "#FBF6EA",
            color: "#8A5E2E",
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
      isHostOwner && h(ZhugedanGuideModal, null)
    );
  }

  const api = {
    CF_WORKER_CODE,
    openGuide,
    closeGuide,
    GuideHelpButton,
    ZhugedanGuideModal
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ZhugedanMcpGuide = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

