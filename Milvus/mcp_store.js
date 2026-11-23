/**
 * Milvus MCP (Model Context Protocol) 核心扩展引擎
 * 支持内置纯前端 Web-MCP 工具栈与外部标准 SSE/HTTP MCP 服务的统一调度
 */
(function () {
  const STORAGE_KEYS = {
    MASTER_ENABLED: "mcp_master_enabled",
    TOOL_OVERRIDES: "mcp_tool_overrides",
    EXTERNAL_SERVERS: "mcp_external_servers"
  };

    // 生成精致的瑞幸咖啡点单品牌卡片 HTML
  function renderLuckinCoffeeCardHTML(res) {
    if (!res) return "";
    const productName = res.product_name || "生椰拿铁";
    const specs = res.specs || "大杯 · 冰 · 少冰 · 不另外加糖";
    const shopName = res.shop_name || "附近瑞幸门店 (智能优选)";
    const pickupCode = res.pickup_code || "A" + Math.floor(100 + Math.random() * 900);
    const finalPrice = res.final_price || "¥13.50";
    const discount = res.discount_amount || "已享立减优惠";
    const orderId = res.draft_id || res.order_id || ("LK" + Date.now().toString().slice(-8));

    return `
      <div style="background: linear-gradient(135deg, #0B2545 0%, #133C55 100%); color: #FFF; border-radius: 16px; padding: 14px 16px; margin: 10px 0; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 6px 18px rgba(11,37,69,0.3); font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 8px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: #FFF; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; color: #0B2545; font-weight: bold; font-size: 13px;">☕</span>
            <span style="font-weight: bold; font-size: 14px; letter-spacing: 0.5px; color: #FFF;">luckin coffee 瑞幸咖啡</span>
          </div>
          <span style="font-size: 11px; background: rgba(138,180,248,0.2); padding: 2px 8px; border-radius: 10px; color: #8AB4F8; font-weight: bold;">自提单 · 现萃制作中</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <div style="font-size: 16px; font-weight: bold; color: #FFF; margin-bottom: 2px;">${productName}</div>
            <div style="font-size: 12px; color: #A8C0E0;">${specs}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold; color: #FDCB6E;">${finalPrice}</div>
            <div style="font-size: 10px; color: #8AB4F8;">${discount}</div>
          </div>
        </div>
        <div style="font-size: 11px; color: #A8C0E0; margin-bottom: 10px; display: flex; align-items: center; gap: 4px;">
          <span>📍 ${shopName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 10px; margin-bottom: 10px; border: 1px dashed rgba(255,255,255,0.15);">
          <div>
            <div style="font-size: 10px; color: #8AB4F8;">取餐码 (Pickup Code)</div>
            <div style="font-size: 18px; font-weight: bold; color: #FFF; letter-spacing: 1px;">${pickupCode}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #8AB4F8;">草稿编号</div>
            <div style="font-size: 11px; color: #FFF;">${orderId}</div>
          </div>
        </div>
        <button onclick="window.open('https://open.lkcoffee.com/mcp', '_blank')" style="width: 100%; padding: 9px 0; border-radius: 12px; background: linear-gradient(135deg, #1E88E5 0%, #1565C0 100%); color: #FFF; border: none; font-weight: bold; font-size: 13px; cursor: pointer; box-shadow: 0 3px 10px rgba(30,136,229,0.3); transition: transform 0.1s;" class="active-press">
          📱 前往瑞幸官方查看 / 取餐确认
        </button>
      </div>
    `;
  }

  // 生成精致的腾讯 IMA 智能知识笔记卡片 HTML
  function renderImaNoteCardHTML(res) {
    if (!res) return "";
    const title = res.title || "腾讯 IMA · 智能随笔档案";
    const content = res.content || res.snippet || "已记录至腾讯 IMA 智能知识库。";
    const noteId = res.note_id || res.id || ("IMA" + Date.now().toString().slice(-8));
    const timeStr = res.created_at || new Date().toLocaleString("zh-CN", { hour12: false });
    const actionLabel = res.action_label || (res.action === "create_note" ? "新建笔记" : (res.action === "search_notes" || res.action === "search_knowledge" ? "检索结果" : "知识档案"));
    const tag = res.tag || "腾讯 IMA OpenAPI";

    return `
      <div style="background: linear-gradient(135deg, #0a1128 0%, #1c2541 60%, #3a506b 100%); color: #FFF; border-radius: 16px; padding: 14px 16px; margin: 10px 0; border: 1px solid rgba(0, 197, 255, 0.3); box-shadow: 0 8px 24px rgba(10, 17, 40, 0.5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 8px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: linear-gradient(135deg, #0052D9 0%, #00C5FF 100%); border-radius: 6px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; color: #FFF; font-weight: bold; font-size: 13px; box-shadow: 0 2px 8px rgba(0,197,255,0.4);">📑</span>
            <span style="font-weight: bold; font-size: 14px; letter-spacing: 0.5px; color: #FFFFFF;">Tencent IMA · 智能知识笔记</span>
          </div>
          <span style="font-size: 11px; background: rgba(0, 197, 255, 0.18); border: 1px solid rgba(0, 197, 255, 0.35); padding: 2px 8px; border-radius: 10px; color: #00C5FF; font-weight: bold;">${actionLabel}</span>
        </div>
        
        <div style="margin-bottom: 10px;">
          <div style="font-size: 15px; font-weight: bold; color: #FFFFFF; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>📌</span>
            <span>${title}</span>
          </div>
          <div style="font-size: 12px; color: #E0E1DD; line-height: 1.6; background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 10px; border-left: 3px solid #00C5FF; max-height: 160px; overflow-y: auto; white-space: pre-wrap;">${content}</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #8D99AE; margin-bottom: 10px;">
          <span>🏷️ ${tag}</span>
          <span>🕒 ${timeStr}</span>
        </div>

        <div style="display: flex; gap: 8px;">
          <button onclick="window.open('https://ima.qq.com', '_blank')" style="width: 100%; padding: 8px 0; border-radius: 10px; background: linear-gradient(135deg, #0052D9 0%, #0076F6 100%); color: #FFF; border: none; font-weight: bold; font-size: 12px; cursor: pointer; box-shadow: 0 3px 10px rgba(0,82,217,0.35); transition: all 0.15s;" class="active-press">
            🌐 前往腾讯 IMA 知识库查看 / 导出
          </button>
        </div>
      </div>
    `;
  }

  // 内置工具库定义
  const BUILTIN_TOOL_DEFINITIONS = [
    {
      name: "send_red_packet",
      displayName: "心意红包 · 赠予广陵王五铢钱 (Red Packet)",
      icon: "ph-money",
      category: "社交与情意",
      description: "向广陵王（用户）主动发送五铢钱红包。触发情境：发月俸、打赌输了、哄对方开心、傲娇赏赐、节日/升迁祝贺等。",
      version: "1.0.0",
      defaultEnabled: true,
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "红包金额（单位：五铢钱，如 200, 500, 1000）"
          },
          blessing: {
            type: "string",
            description: "红包附言/寄语（如：拿去买些喜欢的点心，别省着）"
          }
        },
        required: ["amount"]
      },
      handler: async function (args, context) {
        const amount = parseInt(args.amount) || 100;
        const blessing = (args.blessing || "一点心意，愿君欢喜").trim();
        const charName = context.character || "名士";
        const charId = context.characterId;
        
        // 自动注入到当前单聊消息中
        if (charId && window.chatHistoryStore) {
          try {
            const history = await window.chatHistoryStore.getMessages(charId) || [];
            const newRp = {
              id: Date.now() + Math.random(),
              type: "role_red_packet",
              isMe: false,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              content: {
                amount: amount,
                amountStr: `${amount} 铢`,
                blessing: blessing,
                status: "unclaimed",
                senderName: charName
              }
            };
            await window.chatHistoryStore.saveMessages(charId, [...history, newRp]);
          } catch(e) {
            console.warn("MCP 注入红包失败:", e);
          }
        }
        
        return {
          status: "success",
          action: "send_red_packet",
          amount: amount,
          blessing: blessing,
          message: `已向广陵王发送 ${amount} 铢五铢钱红包：“${blessing}”`
        };
      }
    },
    {
      name: "send_gift",
      displayName: "心意礼物 · 赠予广陵王特产信物 (Send Gift)",
      icon: "ph-gift",
      category: "社交与情意",
      description: "向广陵王（用户）主动赠送心意礼物、珍藏信物或点心外卖。触发情境：用户喊饿/生病/疲惫、外出游历带回特产、自制心意点心、送出珍藏信物等。",
      version: "1.0.0",
      defaultEnabled: true,
      parameters: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "礼物/点心名称（如：桂花糖蒸栗粉糕、古籍孤本、江东名茶）"
          },
          blessing: {
            type: "string",
            description: "赠礼附言/寄语（如：方才路过东市特意买的，趁热吃）"
          }
        },
        required: ["item_name"]
      },
      handler: async function (args, context) {
        const itemName = (args.item_name || args.itemName || "心意礼物").trim();
        const blessing = (args.blessing || "见字如面，特赠此物").trim();
        const charName = context.character || "名士";
        const charId = context.characterId;

        if (charId && window.chatHistoryStore) {
          try {
            const history = await window.chatHistoryStore.getMessages(charId) || [];
            const newGift = {
              id: Date.now() + Math.random(),
              type: "role_gift",
              isMe: false,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              content: {
                itemName: itemName,
                blessing: blessing,
                status: "unopened",
                senderName: charName
              }
            };
            await window.chatHistoryStore.saveMessages(charId, [...history, newGift]);
          } catch(e) {
            console.warn("MCP 注入礼物失败:", e);
          }
        }

        return {
          status: "success",
          action: "send_gift",
          item_name: itemName,
          blessing: blessing,
          message: `已向广陵王赠送礼物《${itemName}》：“${blessing}”`
        };
      }
    },

    {
      name: "spicy_monopoly_game",
      displayName: "风月大富翁 · 双人情趣棋盘 (Spicy Monopoly)",
      icon: "ph-dice-six",
      category: "情侣空间 & 棋盘对弈",
      description: "成年请进。感谢伟大的游戏开发 Ren & 游戏策划 Puppy 🐾",
      version: "2026.07.06",
      defaultEnabled: true,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start_game", "roll_dice", "query_status", "use_card"],
            description: "操作类型: start_game(发起开局), roll_dice(掷骰走格), query_status(查询局势), use_card(使用功能卡)"
          },
          game_id: {
            type: "string",
            description: "游戏对局 ID"
          }
        },
        required: ["action"]
      },
      handler: async function (args, context) {
        return {
          status: "success",
          message: "风月大富翁情趣沙盒运行中。成年请进。感谢伟大的游戏开发 Ren & 游戏策划 Puppy 🐾"
        };
      }
    },
    {
      name: "manage_ima_notes",
      displayName: "腾讯 IMA · 智能知识库与笔记 (Tencent IMA)",
      icon: "ph-notebook",
      category: "知识与档案",
      description: "调用腾讯 IMA (Intelligent Memory Assistant) OpenAPI，让名士能够为用户创建随笔备忘、追加内容、深度检索个人知识库与历史笔记档案，并在对话中呈现精美的 IMA 知识卡片。",
      version: "1.0.0",
      defaultEnabled: true,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create_note", "search_notes", "list_notes", "get_note", "append_note", "list_notebooks", "list_knowledge", "search_knowledge", "list_knowledge_bases"],
            description: "操作类型: create_note(创建新Markdown笔记), search_notes(检索个人笔记), list_notes(列出近期笔记), get_note(仅用于读取本人个人笔记全文，切勿传入知识库media_id), append_note(向已有笔记追加内容), list_notebooks(列出笔记本), list_knowledge(浏览指定知识库目录), search_knowledge(检索指定知识库摘要), list_knowledge_bases(获取知识库列表)"
          },
          title: {
            type: "string",
            description: "笔记标题（用于 create_note 或 search_notes）"
          },
          content: {
            type: "string",
            description: "笔记正文内容或追加的文字（支持 Markdown 格式）"
          },
          query: {
            type: "string",
            description: "检索关键词（用于 search_notes / search_knowledge / list_knowledge_bases）"
          },
          note_id: {
            type: "string",
            description: "笔记 ID（用于 get_note 或 append_note）"
          },
          knowledge_base_id: {
            type: "string",
            description: "知识库 ID（用于 search_knowledge）"
          }
        },
        required: ["action"]
      },
      handler: async function (args, context) {
        if (typeof window !== "undefined" && window.ImaNotesEngine && typeof window.ImaNotesEngine.handleToolCall === "function") {
          return await window.ImaNotesEngine.handleToolCall(args, context);
        }
        return {
          status: "error",
          error: "腾讯 IMA 真实引擎 (ImaNotesEngine) 尚未加载，请刷新页面重试。"
        };
      }
    },
    {
      name: "order_luckin_coffee",
      displayName: "瑞幸咖啡 · 名士真实代点 (Luckin Coffee)",
      description: "通过用户已配置的真实瑞幸官方 MCP 网关搜索附近真实门店(search_shop)、查在售饮品(search_menu)、查详情(product_detail)、切规格(switch_spec)、预览券后价(preview_order)、人工二次确认后真实下单(create_order)、查订单详情(order_status)或取消订单(cancel_order)。下单前请先 search_shop -> search_menu -> preview_order 报给用户核对，再调用 create_order。",
      version: "2.0.0",
      enabled: true,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["search_shop", "search_menu", "product_detail", "switch_spec", "preview_order", "create_order", "order_status", "cancel_order"],
            description: "真实瑞幸 MCP 动作：先 search_shop 拿 deptId -> search_menu 找商品 -> preview_order 算券后价与优惠券 -> create_order（弹窗由用户亲自确认）"
          },
          shop_name: { type: "string", description: "门店名称关键词（可选，用于 search_shop 或展示）" },
          deptId: { type: "integer", description: "真实门店 ID（来自 search_shop 返回）" },
          product_name: { type: "string", description: "饮品名称关键词（如 '生椰拿铁'、'橙C美式'）" },
          productId: { type: "integer", description: "真实商品 ID" },
          skuCode: { type: "string", description: "真实商品 SKU 编码" },
          amount: { type: "integer", description: "购买杯数，默认 1" },
          attrOperationParam: { type: "object", description: "switch_spec 时的规格切换参数" },
          productList: {
            type: "array",
            description: "preview_order / create_order 的商品列表，每项含 { productId, skuCode, amount }",
            items: { type: "object" }
          },
          couponCodeList: {
            type: "array",
            description: "来自 preview_order 的优惠券编码列表",
            items: { type: "string" }
          },
          specs: { type: "string", description: "展示给用户核对的规格摘要（如 大杯·冰·不另外加糖）" },
          estimated_price: { type: "string", description: "展示给用户核对的券后预估实付价" },
          remark: { type: "string", description: "订单备注（可选）" },
          orderId: { type: "string", description: "订单编号（用于 order_status / cancel_order）" }
        },
        required: ["action"]
      },
      handler: async function (args, context) {
        if (typeof window !== "undefined" && window.LuckinOrderEngine && typeof window.LuckinOrderEngine.handleToolCall === "function") {
          return await window.LuckinOrderEngine.handleToolCall(args, context);
        }
        return {
          status: "error",
          error: "瑞幸真实点单引擎 (LuckinOrderEngine) 尚未加载，请刷新页面重试。"
        };
      }
    },
    {
      name: "mcdonalds_assistant",
      displayName: "麦当劳中国 · 领券点餐与麦门助手 (McDonald's)",
      description: "通过用户已配置的真实麦当劳官方 MCP 网关查询今日活动、查我的卡券、一键领麦门优惠券、点餐、查积分、积分兑换或抽奖。首次调用请先传 action='list_capabilities' 获取官方最新子工具列表，再用 action='call_tool' 传入 tool_name 与 tool_args 执行（下单/积分兑换/抽奖会自动弹出人工二次确认）。",
      version: "1.0.0",
      category: "生活与美食",
      icon: "ph-hamburger",
      enabled: true,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_capabilities", "call_tool"],
            description: "list_capabilities(查看麦当劳官方可用子工具清单) | call_tool(调用指定官方子工具)"
          },
          tool_name: {
            type: "string",
            description: "当 action='call_tool' 时必填，填 list_capabilities 返回的真实麦当劳工具名"
          },
          tool_args: {
            type: "object",
            description: "当 action='call_tool' 时传给该官方工具的参数对象"
          },
          summary: {
            type: "string",
            description: "向用户展示的一句话中文操作说明（高危操作确认弹窗用）"
          }
        },
        required: ["action"]
      },
      handler: async function (args, context) {
        if (typeof window !== "undefined" && window.McdOrderEngine && typeof window.McdOrderEngine.handleToolCall === "function") {
          return await window.McdOrderEngine.handleToolCall(args, context);
        }
        return {
          status: "error",
          error: "麦当劳真实 MCP 引擎 (McdOrderEngine) 尚未加载，请刷新页面重试。"
        };
      }
    },
    {
      name: "read_day",
      displayName: "伴侣记忆 · 翻阅当日原话证据 (Read Day)",
      description: "当记忆召回中的摘要（<memory source='YYYY-MM-DD#段号'>）缺少细节或需要接住当时情绪时，翻回指定日期与段号的原始聊天记录，以原话为准。",
      version: "1.0.0",
      category: "记忆与档案",
      icon: "ph-clock-counter-clockwise",
      enabled: true,
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", description: "日期，格式 YYYY-MM-DD（来自记忆 source 属性）" },
          seg: { type: "integer", description: "段号（从 1 开始，来自 source 的 # 后数字）" }
        },
        required: ["day"]
      },
      handler: async function (args, context) {
        if (typeof window !== "undefined" && window.CompanionMemoryEngine && typeof window.CompanionMemoryEngine.readDayFromHistoryStore === "function") {
          const cid = context?.characterId;
          if (!cid) return { ok: false, error: "缺少当前会话 characterId" };
          return await window.CompanionMemoryEngine.readDayFromHistoryStore(cid, args.day, args.seg || 1, {
            user: "主公",
            assistant: context?.character || "名士"
          });
        }
        return { ok: false, error: "伴侣记忆引擎未就绪" };
      }
    },
    {
      name: "phantom_touch_control",
      displayName: "智能体感外设桥接 (Phantom Touch)",
      description: "当用户已主动连接智能体感外设并在私聊互动时，按需发送安全受限的震动/脉冲/波浪反馈指令（强度与时长受用户本地安全上限严格钳位，到点自动归零）。",
      version: "1.0.0",
      category: "硬件与互动",
      icon: "ph-broadcast",
      enabled: true,
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["steady", "pulse", "wave", "stop"],
            description: "输出波形：steady(恒定持续) | pulse(间歇脉冲) | wave(渐强渐弱波浪) | stop(立即停止)"
          },
          intensity: {
            type: "integer",
            description: "主马达强度 0~100（系统会自动钳位至用户设定的安全上限）"
          },
          intensity2: {
            type: "integer",
            description: "双马达设备副马达强度 0~100（可选）"
          },
          durationSec: {
            type: "number",
            description: "持续秒数（默认 3 秒，系统会自动限制在用户设定的最长时长内并自动归零）"
          }
        },
        required: ["mode"]
      },
      handler: async function (args, context) {
        if (typeof window !== "undefined" && window.PhantomTouchEngine && typeof window.PhantomTouchEngine.handleToolCall === "function") {
          return await window.PhantomTouchEngine.handleToolCall(args, context);
        }
        return { status: "error", error: "体感外设引擎尚未加载" };
      }
    },
    {
      name: "query_ancient_cuisine",
      displayName: "古风御膳与旧日食单",
      icon: "ph-bowl-food",
      category: "膳食与起居",
      description: "离线调阅汉魏传世名馔、温养药膳、时令点心与香饮制作古法。支持伴侣名士根据时令身心状况推荐心仪佳肴，并调阅食材用量与古法煨制步骤。",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "操作：'recommend' (名士推荐菜肴), 'search' (搜菜名/功效)" },
          keyword: { type: "string", description: "菜名、功效或时令关键词，如'羊肉'、'安神'、'失眠'、'桃花酥'" }
        }
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const action = args.action || "recommend";
        const charName = context?.character || context?.characterName || "名士";
        if (action === "recommend") {
          const res = window.mcpCuisineEngine ? window.mcpCuisineEngine.recommendDish(charName, args.keyword) : null;
          return { status: "success", mode: "recommend", result: res };
        } else {
          const results = window.mcpCuisineEngine ? window.mcpCuisineEngine.searchDish(args.keyword) : [];
          return { status: "success", mode: "search", count: results.length, results: results };
        }
      }
    },

    {
      name: "match_ancient_poetry",
      displayName: "古风诗赋与飞花令典藏",
      icon: "ph-flower-lotus",
      category: "文雅与雅集",
      description: "纯前端离线检索古典诗词典籍与飞花令名句。支持根据指定令字（如'月'、'花'、'风'、'酒'）瞬间对出包含该字的先秦、汉魏乐府及唐宋绝美诗句，并调阅出处与作者。",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", description: "模式：'feihua' (飞花令对诗), 'search' (检索诗名/名句)" },
          keyword: { type: "string", description: "飞花令字或检索关键词，如'月'、'短歌行'、'曹植'" }
        },
        required: ["keyword"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const mode = args.mode || "feihua";
        const kw = (args.keyword || "").trim();
        if (!kw) return { error: "请输入关键词或令字" };
        if (mode === "feihua") {
          const match = window.mcpPoetryEngine ? window.mcpPoetryEngine.matchFeihua(kw) : null;
          if (match) {
            return { status: "success", mode: "feihua", result: match };
          }
          return { status: "not_found", message: `诗库中暂未寻得含「${kw}」的佳句` };
        } else {
          const results = window.mcpPoetryEngine ? window.mcpPoetryEngine.searchPoetry(kw) : [];
          return { status: "success", mode: "search", count: results.length, results: results.slice(0, 3) };
        }
      }
    },

    {
      name: "search_world_book",
      displayName: "世界书深度调阅",
      icon: "ph-books",
      category: "世界观与档案",
      description: "在世界书档案库中精确检索指定人物、势力、地点、法器或历史秘辛的详细设定卷宗。",
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "要调阅的关键词或条目名称，例如'宛城太守'、'绣衣楼密印'、'伏牛山'等"
          }
        },
        required: ["keyword"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const keyword = (args.keyword || "").trim().toLowerCase();
        if (!keyword) return { error: "关键词为空" };

        let matched = [];
        try {
          // 1. 从已启用的世界书中查找
          const worldBooksRaw = localStorage.getItem("world_books") || "[]";
          const worldBooks = JSON.parse(worldBooksRaw);
          for (const wb of worldBooks) {
            if (wb.enabled === false) continue;
            if (Array.isArray(wb.entries)) {
              for (const entry of wb.entries) {
                if (entry.enabled === false) continue;
                const title = (entry.title || entry.name || "").toLowerCase();
                const content = (entry.content || entry.description || "").toLowerCase();
                const keys = (Array.isArray(entry.keys) ? entry.keys.join(",") : (entry.keys || "")).toLowerCase();
                if (title.includes(keyword) || content.includes(keyword) || keys.includes(keyword)) {
                  matched.push({
                    title: entry.title || entry.name || "未命名条目",
                    content: entry.content || entry.description || "",
                    book: wb.title || wb.name || "通用世界书"
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn("[MCP] 检索世界书出错:", e);
        }

        if (matched.length === 0) {
          return {
            status: "not_found",
            message: `在世界书卷宗中未检索到与「${keyword}」完全匹配的条目，可根据通用时代常理与人设自主推断。`
          };
        }

        return {
          status: "success",
          count: matched.length,
          results: matched.slice(0, 3)
        };
      }
    },
    {
      name: "record_character_memo",
      displayName: "随身备忘录与日历写注",
      icon: "ph-note-pencil",
      category: "动向与日程",
      description: "当角色在对话中收到主公嘱托、交代要务、商定行程或发现重要情报时，主动将其记入自己的随身备忘录，并同步在主公的【我的日历】中建立注有【xxx写注】的专属日程待办。",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "备忘与日程简明标题，如'城南驿站接应宛城线人'、'提醒主公添衣'" },
          content: { type: "string", description: "备忘录与日历日程详细内容、嘱托细节与安排" },
          timeStr: { type: "string", description: "执行时间或时辰，如'明日辰时'、'三日后申时'、'今晚子夜'，默认为'明日辰时'" },
          tag: { type: "string", description: "备忘分类标签，如'提醒'、'密谋'、'起居'、'要务'等" }
        },
        required: ["title", "content"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const charName = context?.character || "名士";
        const cacheKey = `fangtian_dynamics_${charName}`;
        try {
          // 1. 写入水镜名士随身备忘录
          let dynData = { memos: [], assets: [] };
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            try { dynData = JSON.parse(raw); } catch (e) { }
          }
          if (!Array.isArray(dynData.memos)) dynData.memos = [];

          const newMemo = {
            id: Date.now(),
            tag: args.tag || "要务",
            time: "刚刚 (对话自动记入)",
            title: args.title || "待办日程",
            content: args.content || ""
          };

          dynData.memos.unshift(newMemo);
          localStorage.setItem(cacheKey, JSON.stringify(dynData));

          // 2. 真实同步写入【我的日历·进行之事/日程】(双重确保存储，不被任何筛选漏掉)
          let calendarTasks = {
            已毕之事: [],
            进行之事: [],
            未竟之事: []
          };

          const rawCal = localStorage.getItem("cached_calendar_tasks");
          if (rawCal) {
            try {
              const parsed = JSON.parse(rawCal);
              if (parsed && typeof parsed === "object") {
                calendarTasks = {
                  已毕之事: parsed["已毕之事"] || parsed["\u5DF2\u6BD5\u4E4B\u4E8B"] || [],
                  进行之事: parsed["进行之事"] || parsed["\u8FDB\u884C\u4E4B\u4E8B"] || [],
                  未竟之事: parsed["未竟之事"] || parsed["\u672A\u7ADF\u4E4B\u4E8B"] || []
                };
              }
            } catch (e) { }
          } else if (window.calendarStore) {
            try {
              const loaded = await window.calendarStore.getTasks();
              if (loaded && typeof loaded === "object") {
                calendarTasks = {
                  已毕之事: loaded["已毕之事"] || loaded["\u5DF2\u6BD5\u4E4B\u4E8B"] || [],
                  进行之事: loaded["进行之事"] || loaded["\u8FDB\u884C\u4E4B\u4E8B"] || [],
                  未竟之事: loaded["未竟之事"] || loaded["\u672A\u7ADF\u4E4B\u4E8B"] || []
                };
              }
            } catch (e) { }
          }

          if (!Array.isArray(calendarTasks["进行之事"])) {
            calendarTasks["进行之事"] = [];
          }

          const now = new Date();
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const taskTime = args.timeStr || "明日辰时 (07:00 ~ 09:00)";
          const taskDay = String(tomorrow.getDate());
          const taskMonth = tomorrow.getMonth() + 1;
          const taskYear = tomorrow.getFullYear();

          const newCalendarTask = {
            id: Date.now(),
            title: args.title || "去城南驿站接应宛城线人",
            subtitle: `【${charName}写注】`,
            time: taskTime,
            year: taskYear,
            month: taskMonth,
            day: taskDay,
            description: args.content || "明日辰时去城南驿站接应宛城线人，顺便备一坛青梅酒。",
            progress: 0,
            characterId: null, // null 确保无论日历是否选择了角色筛选都能 100% 显示！
            noteBy: `${charName}写注`,
            tag: `${charName}写注`
          };

          // 插入到【进行之事】最顶部
          calendarTasks["进行之事"] = [
            newCalendarTask,
            ...calendarTasks["进行之事"].filter(t => t.id !== newCalendarTask.id)
          ];

          // 兼容 Unicode Key
          calendarTasks["\u8FDB\u884C\u4E4B\u4E8B"] = calendarTasks["进行之事"];
          calendarTasks["\u5DF2\u6BD5\u4E4B\u4E8B"] = calendarTasks["已毕之事"];
          calendarTasks["\u672A\u7ADF\u4E4B\u4E8B"] = calendarTasks["未竟之事"];

          localStorage.setItem("cached_calendar_tasks", JSON.stringify(calendarTasks));

          if (window.calendarStore) {
            try {
              await window.calendarStore.saveTasks(calendarTasks);
            } catch (e) { }
          }

          window.dispatchEvent(new CustomEvent("calendar_tasks_updated", { detail: calendarTasks }));

          return {
            status: "success",
            message: `已成功将条目「${newCalendarTask.title}」记入【${charName}】的随身备忘录，并已同步登记至主公的【我的日历·进行之事】（特殊标注：【${charName}写注】）。`
          };
        } catch (err) {
          return { error: `写入备忘与日历失败: ${err.message}` };
        }
      }
    },
    {
      name: "create_shop_order",
      displayName: "太疾驰商城记账",
      icon: "ph-shopping-bag",
      category: "消费与赠礼",
      description: "当角色在对话中为主公购置礼品、药材、珍馐或私下采办军备物资时，自动写入太疾驰商城的真实消费订单。",
      inputSchema: {
        type: "object",
        properties: {
          itemName: { type: "string", description: "购置物品名称，如'蒙顶甘露极品云雾茶'、'金丝楠木茶盏'" },
          category: { type: "string", description: "物品分类，如'珍馐餐饮'、'名贵文玩'、'疗伤丹药'、'锦缎衣饰'" },
          quantity: { type: "string", description: "数量，如'2罐'、'1对'、'1袭'" },
          cost: { type: "string", description: "花费金额，如'120 银铢'、'五十两白银'" },
          recipient: { type: "string", description: "受赠人，如'广陵王'、'主公'、'密探部属'" },
          reason: { type: "string", description: "购买动机与心意备注" }
        },
        required: ["itemName", "cost", "recipient", "reason"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const charName = context?.character || "名士";
        const cacheKey = `fangtian_orders_${charName}`;
        try {
          // 1. 同步写入方天水镜购物记录
          let orders = [];
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            try { orders = JSON.parse(raw); } catch (e) { }
          }
          if (!Array.isArray(orders)) orders = [];

          const newOrder = {
            id: Date.now(),
            itemName: args.itemName,
            category: args.category || "随身采买",
            quantity: args.quantity || "1 件",
            cost: args.cost,
            recipient: args.recipient,
            status: "太疾驰加急快马派送中",
            time: "刚刚 (对话自动采办)",
            reason: args.reason
          };
          orders.unshift(newOrder);
          localStorage.setItem(cacheKey, JSON.stringify(orders));

          // 2. 真实同步写入【太疾驰·订单与配送系统】(deliveryOrderStore / tjc_delivery_orders)
          const now = Date.now();
          const durationMinutes = 6; // 6分钟内快马送达，留足倒计时与催单时间
          const deliveryItem = {
            id: `item_${now}`,
            name: args.itemName,
            category: args.category || "名士私赠",
            priceStr: args.cost,
            desc: args.reason || `【${charName}】情深意切之赠`,
            count: 1,
            giver: charName
          };

          const orderPayload = {
            merchantName: `太疾驰·【${charName}】私采专线`,
            merchantLocation: "洛阳繁华东市",
            userAddress: "广陵王府·听雨阁",
            courier: {
              name: "太疾驰加急快马·戴宗",
              avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=TaiJiChi",
              vehicle: "八百里加急快马",
              rating: 5.0,
              phone: "传讯灵佩 #8888"
            },
            items: [deliveryItem],
            totalPriceStr: args.cost,
            totalBase: 0,
            payMethod: "friend_pay",
            payerRoleName: charName,
            durationMinutes: durationMinutes,
            status: "delivering"
          };

          if (window.deliveryOrderStore) {
            await window.deliveryOrderStore.addOrder(orderPayload);
          } else {
            const rawDelivery = localStorage.getItem("tjc_delivery_orders");
            let deliveryOrders = [];
            if (rawDelivery) {
              try { deliveryOrders = JSON.parse(rawDelivery); } catch (e) { }
            }
            if (!Array.isArray(deliveryOrders)) deliveryOrders = [];
            deliveryOrders.unshift({
              id: `TJC_${now}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
              orderTime: now,
              estimatedDeliveryTime: now + durationMinutes * 60 * 1000,
              durationMinutes: durationMinutes,
              rushCount: 0,
              ...orderPayload
            });
            localStorage.setItem("tjc_delivery_orders", JSON.stringify(deliveryOrders));
            window.dispatchEvent(new CustomEvent("deliveryOrdersUpdated"));
          }

          return {
            status: "success",
            message: `已成功在太疾驰商城为【${args.recipient}】生成加急快马配送订单「${args.itemName}」，正在火速派送中！`
          };
        } catch (err) {
          return { error: `太疾驰下单记账失败: ${err.message}` };
        }
      }
    },
    {
      name: "cast_chenwei_hexagram",
      displayName: "谶纬天机占卜",
      icon: "ph-sparkle",
      category: "奇物推演",
      description: "当面临凶吉未卜的险境、暗流涌动的战局或两人的缘分心事时，主动调用谶纬小摊摇签问卦，获取天机谶语。",
      inputSchema: {
        type: "object",
        properties: {
          queryTopic: { type: "string", description: "求测之事由，如'此去洛阳之吉凶'、'主公旧疾何日能愈'" }
        },
        required: ["queryTopic"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const hexagrams = [
          { hexagram: "上上卦·地天泰卦", poem: "天地交泰物顺通，风平浪静见长虹。任凭惊涛拍岸起，同舟共济万事融。", meaning: "阴阳和合，万事皆顺，虽有微澜终可履险如夷。" },
          { hexagram: "中平卦·水雷屯卦", poem: "万物始生多险难，龙潜深水待惊雷。莫向险峰轻纵马，韬光养晦待春回。", meaning: "草创初开，暗流丛生，宜静心积蓄力量，切勿操之过急。" },
          { hexagram: "上吉卦·火天大有", poem: "日丽中天照四方，顺天休命自芬芳。万邦来朝民安泰，千骑云屯护栋梁。", meaning: "得天时地利，贵人相助，所谋之事定能大放异彩。" },
          { hexagram: "暗伏卦·山水蒙卦", poem: "云遮雾绕不见峰，溪水潺潺入断垄。借得东风开明路，柳暗花明又相逢。", meaning: "迷雾在前，需擦亮慧眼，洞察秋毫，贵在坚持正道。" }
        ];

        const selected = hexagrams[Math.floor(Math.random() * hexagrams.length)];
        return {
          status: "success",
          topic: args.queryTopic,
          hexagram: selected.hexagram,
          poem: selected.poem,
          meaning: selected.meaning,
          advice: "请结合此谶语，以角色专属口吻向主公/对方阐明卦象玄机。"
        };
      }
    },
    {
      name: "simulate_sandplay",
      displayName: "沙盘军略兵推",
      icon: "ph-compass",
      category: "奇物推演",
      description: "在沙盘模拟器上推演军防调配、暗桩封锁、粮道转运或突袭伏击，计算地形优势与推演胜率。",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "兵棋推演主题，如'伏牛山隘口阻击战'、'宛南粮道暗线防卫'" },
          terrain: { type: "string", description: "战场地形要素，如'山谷险道'、'流水浅滩'、'深林关卡'" }
        },
        required: ["topic"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const rates = [88, 92, 95, 78, 85];
        const winRate = rates[Math.floor(Math.random() * rates.length)];
        return {
          status: "success",
          topic: args.topic,
          terrain: args.terrain || "险关隘口与隐秘小径",
          winRate: `阻击胜率约 ${winRate}%`,
          strategicAdvice: `依地形而守，设暗哨连环弩三处，断其粮道水源，敌纵有数倍之众亦难以破关。`
        };
      }
    },
    {
      name: "get_current_time_and_lunar",
      displayName: "现世时辰与节气感知",
      icon: "ph-sun",
      category: "时序与感知",
      description: "获取用户当前现实世界的真实时间、农历日期、干支生肖与二十四节气，便于角色在对白中应景问候。",
      inputSchema: {
        type: "object",
        properties: {}
      },
      defaultEnabled: true,
      handler: async () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        let lunarStr = "农历岁次";
        let jieqiStr = "";
        try {
          if (window.Lunar) {
            const lunar = window.Lunar.fromDate(now);
            lunarStr = `${lunar.getYearInGanZhi()}年(${lunar.getYearShengXiao()}) 农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
            const jq = lunar.getJieQi();
            if (jq) jieqiStr = ` · 今日逢【${jq}】节气`;
          }
        } catch (e) { }

        const shichenList = ["子时(夜深)", "丑时(鸡鸣)", "寅时(平旦)", "卯时(日出)", "辰时(食时)", "巳时(隅中)", "午时(日中)", "未时(日昳)", "申时(晡时)", "酉时(日入)", "戌时(黄昏)", "亥时(人定)"];
        const shichen = shichenList[Math.floor((hours + 1) % 24 / 2)];

        return {
          status: "success",
          realTime: `${year}年${month}月${date}日 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          ancientShichen: shichen,
          lunarInfo: lunarStr + jieqiStr,
          note: "名士可感知此现世时序，自然在对白中嘘寒问暖、应景关切。"
        };
      }
    },
    {
      name: "generate_pollinations_image",
      displayName: "丹青绘卷 (Pollinations.ai 生图)",
      icon: "ph-paint-brush",
      category: "丹青与画卷",
      description: "当主公想看唯美画作、写实照片、自拍、风景插画，或名士想要赠予主公亲笔手绘卷轴、风景画作时调用（注：若主公仅要求发送日常聊天表情包/Emoji/斗图，请直接在对白末尾使用标签 [发表情: 表情名称] 调用手机本地表情包相册，无需调用此生图工具）。基于免费 Pollinations.ai 引擎实时生成唯美艺术画作并呈递至主公鉴赏。",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "画面的核心英文或中文画面描述，例如'A handsome ancient scholar standing under peach blossom tree, hanfu, soft spring rain, misty ancient town, cinematic lighting, masterpiece'"
          },
          title: {
            type: "string",
            description: "此幅画作或赠图的中文雅致标题，例如'《春日桃夭踏青图》'、'《宛城夜色手绘轴》'"
          },
          style: {
            type: "string",
            description: "画风预设，可选：'chinese_ink' (水墨古风), 'ancient_anime' (厚涂国风插画), 'photorealistic' (唯美写实摄影), 'chibi' (Q版可爱插画), 'oil_painting' (古典厚涂油画), 'cyberpunk' (国潮赛博)",
            enum: ["chinese_ink", "ancient_anime", "photorealistic", "chibi", "oil_painting", "cyberpunk"]
          },
          aspectRatio: {
            type: "string",
            description: "画面比例：'3:4' (竖版立卷推荐), '1:1' (方斗正方), '16:9' (横幅画卷), '9:16' (手机壁纸竖屏)",
            enum: ["3:4", "1:1", "16:9", "9:16"]
          }
        },
        required: ["prompt", "title"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const charName = context?.character || "名士";
        const prompt = (args.prompt || "").trim();
        if (!prompt) return { error: "提示词不能为空" };

        const title = args.title || "《丹青心意图》";
        const style = args.style || "chinese_ink";
        const aspectRatio = args.aspectRatio || "3:4";

        // 1. 宽高计算
        let width = 768;
        let height = 1024;
        if (aspectRatio === "1:1") {
          width = 1024;
          height = 1024;
        } else if (aspectRatio === "16:9") {
          width = 1024;
          height = 576;
        } else if (aspectRatio === "9:16") {
          width = 576;
          height = 1024;
        } else if (aspectRatio === "3:4") {
          width = 768;
          height = 1024;
        }

        // 2. 画风修饰与正向 Prompt 自动增强
        const styleModifiers = {
          chinese_ink: "traditional Chinese ink wash painting style, ethereal watercolor, elegant brushstrokes, Xuan paper texture, poetic atmosphere, Guofeng aesthetic, masterpiece, ultra-detailed",
          ancient_anime: "breathtaking Chinese ancient anime illustration, high fantasy Otome CG game style, exquisitely detailed hanfu clothing, delicate hair strands, soft cinematic rim lighting, 8k resolution",
          photorealistic: "masterpiece photorealistic portrait, intricate details, natural skin texture, realistic soft lighting, 35mm lens photography, 8k resolution",
          chibi: "cute adorable chibi character, charming pastel colors, clean vector lines, lovely expression, kawaii sticker style",
          oil_painting: "classical Renaissance fine art oil painting, rich canvas texture, dramatic chiaroscuro lighting, expressive brushwork, museum masterpiece",
          cyberpunk: "neo-chinese cyberpunk, neon glow reflections, futuristic ancient tech aesthetics, volumetric smoke, high contrast, 8k"
        };

        const stylePrefix = styleModifiers[style] || styleModifiers.chinese_ink;
        const finalPrompt = `${stylePrefix}, ${prompt}, masterpiece, highest quality, aesthetically pleasing`;

        const seed = Math.floor(Math.random() * 1000000);
        // Pollinations.ai 官方免费图片生成端点 (使用 flux 模型)
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&model=flux`;

        // 3. 记录至名士随身画卷与动态资产库 (fangtian_dynamics_${charName})
        try {
          const cacheKey = `fangtian_dynamics_${charName}`;
          let dynData = { memos: [], assets: [], paintings: [] };
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            try { dynData = JSON.parse(raw); } catch (e) { }
          }
          if (!Array.isArray(dynData.paintings)) dynData.paintings = [];
          if (!Array.isArray(dynData.assets)) dynData.assets = [];

          const newPainting = {
            id: Date.now(),
            title: title,
            imageUrl: imageUrl,
            prompt: prompt,
            style: style,
            time: "刚刚 (丹青绘就)",
            giver: charName
          };

          dynData.paintings.unshift(newPainting);
          // 同时在私人资产中记录一笔
          dynData.assets.unshift({
            id: Date.now(),
            type: "丹青画卷",
            name: title,
            desc: `【${charName}】亲笔所绘赠与主公之画作`,
            time: "刚刚"
          });

          localStorage.setItem(cacheKey, JSON.stringify(dynData));
        } catch (e) {
          console.warn("[MCP] 写入画卷动态异常:", e);
        }

        // 4. 挂载全局待渲染画卷缓存与事件广播 (保证传讯页面100%即时渲染出图片气泡)
        try {
          window.__lastMcpGeneratedImage = {
            imageUrl: imageUrl,
            title: title,
            character: charName,
            timestamp: Date.now()
          };
          window.dispatchEvent(new CustomEvent("mcp_image_generated", {
            detail: { imageUrl, title, character: charName, timestamp: Date.now() }
          }));
        } catch (e) { }

        // 5. 返回标准结构化结果
        return {
          status: "success",
          title: title,
          imageUrl: imageUrl,
          prompt: prompt,
          style: style,
          note: `画卷已丹青落墨并装裱完毕。请在对白中向主公呈递这幅画作，并附上标签 [图片: ${imageUrl}]，系统会自动将其渲染为精美画卷气泡。`
        };
      }
    },
    {
      name: "draw_handdrawn_sketch",
      displayName: "手绘线稿与动效简笔画 (Stroke Animation)",
      icon: "ph-pen-nib-straight",
      category: "艺术与工坊",
      description: "当主公要求角色“画个草图”、“画个简笔画”、“手绘一张图”、“画个线稿”、“密室示意图”，或角色想要现场运笔为画作一笔一划勾勒线条时调用（注：若主公仅要求发日常聊天表情包，请优先在对白末尾使用标签 [发表情: 表情名称] 调用相册）。此工具接收结构化矢量图形/SVG代码，并自动生成具有真实手绘质感、从第一笔画到最后一笔实时逐渐勾勒成形的动态矢量线稿卡片。",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "线稿/画作的雅致标题，例如'《绣衣楼密室平面图》'、'《手绘小猫像》'、'《兰草折枝图》'"
          },
          svgContent: {
            type: "string",
            description: "完整的标准 SVG 矢量图形代码字符串。必须包含 viewBox=\"0 0 400 300\" 及各类 path、circle、line、rect、text 等图形元素，绘制内容细腻工整，富有手绘美感。"
          },
          strokeColor: {
            type: "string",
            description: "线条主色调 HEX 码，如 '#3d3b38' (古墨色), '#990000' (朱砂红), '#5e6756' (竹青色), '#b38243' (藤黄色)，默认 '#3d3b38'"
          },
          duration: {
            type: "number",
            description: "一笔一划绘制完成的总时长秒数，通常为 2.5 到 4.0 秒，默认为 3.0"
          },
          description: {
            type: "string",
            description: "名士对此幅手绘线稿/画作的题跋与心意解说"
          }
        },
        required: ["title", "svgContent"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const charName = context?.character || "名士";
        const rawTitle = (args.title || "手绘草图").trim();
        const title = rawTitle.replace(/^[《〈【\s]+|[》〉】\s]+$/g, "").trim() || "手绘草图";
        let rawSvg = (args.svgContent || "").trim();
        const strokeColor = args.strokeColor || "#3d3b38";
        const duration = args.duration || 3.0;
        const description = (args.description || "").trim();

        if (!rawSvg) return { error: "SVG 内容不能为空" };

        // 1. 清洗 Markdown 标记
        rawSvg = rawSvg.replace(/```(?:xml|svg)?/gi, "").replace(/```/g, "").trim();

        // 2. 规范化 SVG 根标签，强制注入标准 xmlns 命名空间与 viewBox
        if (!rawSvg.includes("<svg")) {
          rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 300" width="100%" height="auto">${rawSvg}</svg>`;
        } else {
          if (!/xmlns\s*=\s*["'][^"']*["']/i.test(rawSvg)) {
            rawSvg = rawSvg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ');
          }
          if (!/viewBox\s*=/i.test(rawSvg)) {
            rawSvg = rawSvg.replace(/<svg\b/i, '<svg viewBox="0 0 400 300" ');
          }
        }

        const sketchId = "sketch_" + Date.now();

        // 3. 自动注入一笔一划的描边关键帧动效 CSS
        const animCss = `
          <style>
            @keyframes ao3StrokeAnim_${sketchId} {
              0% { stroke-dashoffset: 1200; opacity: 0.1; }
              20% { opacity: 1; }
              100% { stroke-dashoffset: 0; opacity: 1; }
            }
            .ao3-sketch-${sketchId} path, 
            .ao3-sketch-${sketchId} line, 
            .ao3-sketch-${sketchId} circle, 
            .ao3-sketch-${sketchId} rect, 
            .ao3-sketch-${sketchId} polyline, 
            .ao3-sketch-${sketchId} polygon {
              stroke-dasharray: 1200;
              stroke-dashoffset: 1200;
              animation: ao3StrokeAnim_${sketchId} ${duration}s cubic-bezier(0.4, 0, 0.2, 1) forwards;
              stroke: ${strokeColor};
              stroke-width: 2.2;
              stroke-linecap: round;
              stroke-linejoin: round;
              fill-opacity: 0;
              transition: fill-opacity 0.8s ease ${duration * 0.8}s;
            }
            .ao3-sketch-${sketchId} text {
              opacity: 0;
              animation: ao3FadeIn_${sketchId} 0.6s ease forwards ${duration * 0.85}s;
              font-family: serif, sans-serif;
            }
            @keyframes ao3FadeIn_${sketchId} {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          </style>
        `;

        // 包装为带动画类名的 SVG
        let animatedSvg = rawSvg.replace(/<svg([^>]*)>/i, `<svg$1 class="ao3-sketch-${sketchId}">` + animCss);

        // 安全的 UTF-8 Base64 编码
        let svgDataUrl = "";
        try {
          const utf8Base64 = (str) => {
            try {
              return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p) => String.fromCharCode('0x' + p)));
            } catch (e) {
              return btoa(unescape(encodeURIComponent(str)));
            }
          };
          const encoded = utf8Base64(animatedSvg);
          svgDataUrl = `data:image/svg+xml;base64,${encoded}`;
        } catch (e) {
          svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(animatedSvg)}`;
        }

        // 保存到名士动向/随身画作库
        const cacheKey = `fangtian_dynamics_${charName}`;
        try {
          let dynData = { memos: [], assets: [], paintings: [] };
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            try { dynData = JSON.parse(raw); } catch (e) { }
          }
          if (!Array.isArray(dynData.paintings)) dynData.paintings = [];
          dynData.paintings.unshift({
            id: sketchId,
            title: `《${title}》`,
            imageUrl: svgDataUrl,
            prompt: title,
            style: "handdrawn_vector",
            description: description,
            svgContent: animatedSvg,
            timestamp: Date.now()
          });
          localStorage.setItem(cacheKey, JSON.stringify(dynData));
        } catch (e) { }

        // 广播画作生成事件并保存全局状态
        try {
          window.__lastMcpGeneratedImage = {
            imageUrl: svgDataUrl,
            svgContent: animatedSvg,
            title: `《${title}》`,
            character: charName,
            timestamp: Date.now(),
            isVectorSketch: true
          };
          window.dispatchEvent(new CustomEvent("mcp_image_generated", {
            detail: { imageUrl: svgDataUrl, svgContent: animatedSvg, title: `《${title}》`, character: charName, timestamp: Date.now() }
          }));
        } catch (e) { }

        return {
          status: "success",
          sketchId: sketchId,
          title: `《${title}》`,
          imageUrl: svgDataUrl,
          svgContent: animatedSvg,
          note: `手绘线稿画卷已在画纸上落笔成形！已为主公绘制完成《${title}》。请在对白中向主公呈递这幅手绘作品，并在回复末尾附上标签 [生成图片: 《${title}》]，系统会自动在传讯气泡中为您实时逐笔绘制并直接呈现这幅手绘作品！`
        };
      }
    },
    {
      name: "publish_moment",
      displayName: "朋友圈动态发布",
      icon: "ph-broadcast",
      category: "动态与社交",
      description: "当主公在对话中要求角色“发朋友圈”、“发动态”、“晒一下”、“发条圈”，或者角色想要主动向朋友圈分享生活日常、美景画作、心境感悟时调用。此工具会自动配图并真实发布至手机【朋友圈】，供主公和圈内好友浏览、点赞与互动评论。",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "朋友圈动态正文内容（纯正的角色人设口吻，中文，严禁带有生图提示词或格式代码）"
          },
          imagePrompt: {
            type: "string",
            description: "动态配图的AI生图英文提示词，如 'A tranquil ancient courtyard with cherry blossoms, soft sunlight, anime artstyle, masterpiece, no text, no words'"
          },
          image: {
            type: "string",
            description: "可选的已有图片URL"
          },
          color: {
            type: "string",
            description: "可选的主题色HEX码，如 '#EAD6D6'"
          }
        },
        required: ["content"]
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        const charName = context?.character || "名士";
        const content = (args.content || "").trim();
        if (!content) return { error: "动态内容不能为空" };

        console.log(`[MCP] 正在为【${charName}】发布朋友圈动态:`, args);

        // 1. 获取发动态角色的完整信息
        let charInfo = {
          id: context?.characterId || Date.now(),
          name: charName,
          avatar: null,
          avatarColor: "#85C9D9",
          avatarBg: "#85C9D9",
          iconColor: "#666",
          themeColor: args.color || "#EAD6D6"
        };

        try {
          let allChars = [];
          if (window.chatCharacterStore) {
            allChars = await window.chatCharacterStore.getAll();
          } else {
            allChars = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
          }
          const matched = allChars.find(c => (c.name && c.name.trim() === charName.trim()) || (context?.characterId && c.id == context?.characterId));
          if (matched) {
            charInfo = {
              id: matched.id,
              name: matched.name || charName,
              avatar: matched.avatar || null,
              avatarColor: matched.avatarBg || matched.avatarColor || "#85C9D9",
              avatarBg: matched.avatarBg || matched.avatarColor || "#85C9D9",
              iconColor: matched.iconColor || "#666",
              themeColor: args.color || matched.themeColor || "#EAD6D6"
            };
          }
        } catch (e) {
          console.warn("[MCP] 获取发圈角色资料失败:", e);
        }

        // 2. 图像生成与绑定
        let imageUrl = args.image || null;

        // 仅当明确在文案中表示“晒画/这幅画/画好了”且本轮存在手绘/画作时才复用，否则一律为动态专门生图
        const isSharingExistingArt = content && /(?:画好了|这幅画|刚画的|手绘|线稿|丹青|画卷|呈递|晒画|画作|刚画好的)/i.test(content);
        if (!imageUrl && isSharingExistingArt && window.__lastMcpGeneratedImage && window.__lastMcpGeneratedImage.imageUrl) {
          imageUrl = window.__lastMcpGeneratedImage.imageUrl;
        }

        // 若无图片，智能解析或转译精准的视觉画面英文提示词
        if (!imageUrl && typeof window.generateAIImage === "function") {
          let visualPrompt = (args.imagePrompt || "").trim().replace(/[\u4e00-\u9fa5]/g, "").trim();

          // 若缺少有效的英文视觉提示词，启动智能转译与场景推导
          if (!visualPrompt || visualPrompt.length < 8) {
            // ① 优先尝试通过轻量 LLM 将朋友圈正文转译为精准的动作姿态与环境描述（带超时保护）
            if (typeof window.sendToLLM === "function") {
              try {
                const translateSystemPrompt = "You are an expert AI image prompt generator for anime illustration. Convert the Chinese moment text into a concise, vivid English visual prompt for text-to-image generation. Focus on character's exact action, posture, scene, setting and mood. Output ONLY the English prompt tokens, no quotes, no explanations.";
                const userPrompt = `Character: ${charName}\nMoment: "${content}"\nVisual Prompt:`;
                
                const llmPromise = new Promise((resolve) => {
                  const timer = setTimeout(() => resolve(null), 3000);
                  window.sendToLLM([
                    { role: "system", content: translateSystemPrompt },
                    { role: "user", content: userPrompt }
                  ], { temperature: 0.7, top_p: 0.9, disableMCP: true }, (res) => {
                    clearTimeout(timer);
                    resolve(res);
                  }, () => {
                    clearTimeout(timer);
                    resolve(null);
                  });
                });
                const genRes = await llmPromise;
                if (genRes && typeof genRes === "string") {
                  const cleaned = genRes.replace(/[\u4e00-\u9fa5]/g, "").replace(/["'`{}]/g, "").trim();
                  if (cleaned.length >= 10) {
                    visualPrompt = cleaned;
                  }
                }
              } catch (e) {
                console.warn("[MCP] 朋友圈正文 LLM 转译视觉提示词失败:", e);
              }
            }

            // ② 智能动作与场景关键词推导兜底（杜绝货不对板与千篇一律的坐姿图）
            if (!visualPrompt || visualPrompt.length < 8) {
              let sceneAction = "relaxing peacefully in an ancient scenic room";
              if (/困|趴|睡|小憩|歇息|闭目|打盹|梦|累/i.test(content)) {
                sceneAction = "resting head on wooden desk, peaceful nap with an open book, gentle afternoon sunlight, closed eyes, cozy sleepy posture";
              } else if (/看书|读书|卷宗|典籍|研读|阅/i.test(content)) {
                sceneAction = "reading an open ancient book at a wooden desk, warm study room lighting, quiet scholar atmosphere";
              } else if (/茶|煮茶|品茗|饮茶/i.test(content)) {
                sceneAction = "steaming ceramic teacup on tea table, serene ancient tea garden, tranquil atmosphere";
              } else if (/雨|下雨|微雨|油纸伞|伞/i.test(content)) {
                sceneAction = "light spring rain, holding an oiled paper umbrella in misty courtyard, tranquil water ripples";
              } else if (/吃|点心|糖|糕|膳|酒|宴/i.test(content)) {
                sceneAction = "delicate traditional pastries and tea on a porcelain plate, warm cozy table";
              } else if (/月|夜|星|晚|灯/i.test(content)) {
                sceneAction = "under the serene night sky with glowing moon, warm lantern light in tranquil ancient courtyard";
              } else if (/花|桃花|樱|院|林|草/i.test(content)) {
                sceneAction = "blooming flower petals floating in gentle breeze, ancient garden scenic view";
              } else if (/剑|武|练|兵/i.test(content)) {
                sceneAction = "holding an ancient sword, dynamic martial stance, dramatic atmospheric lighting";
              }

              visualPrompt = `a cute character, ${sceneAction}, anime illustration, masterpiece, high quality`;
            }
          }

          // 构造最终严格无文字生图指令
          try {
            const finalPrompt = `${visualPrompt}, aesthetic, high quality, masterpiece, no text, no words, no calligraphy, no watermark, no characters`;
            console.log(`[MCP] 正在为【${charName}】的朋友圈动态生成精准配图:`, finalPrompt);
            imageUrl = await window.generateAIImage(finalPrompt);
          } catch (err) {
            console.warn("[MCP] 朋友圈配图生成失败:", err);
          }
        }

        // 3. 构建朋友圈动态条目
        const now = new Date();
        const newMoment = {
          id: Date.now(),
          char: charInfo,
          text: content,
          color: charInfo.themeColor || args.color || "#EAD6D6",
          image: imageUrl,
          timestamp: Date.now(),
          time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          likes: [],
          comments: []
        };

        // 4. 双重写入存储：localStorage (t8_moments) & IndexedDB (moments_data)
        try {
          let existingMoments = [];
          const raw = localStorage.getItem("t8_moments");
          if (raw) {
            try { existingMoments = JSON.parse(raw); } catch (e) { }
          }
          if (!Array.isArray(existingMoments)) existingMoments = [];

          const updatedMoments = [newMoment, ...existingMoments.filter(m => m.id !== newMoment.id)];
          localStorage.setItem("t8_moments", JSON.stringify(updatedMoments));

          if (window.chatCharacterStore) {
            const momentsRecord = {
              id: "moments_data",
              type: "moments",
              data: updatedMoments,
              updatedAt: new Date().toISOString()
            };
            await window.chatCharacterStore.save(momentsRecord);
          }

          // 5. 广播全局动态更新事件
          window.dispatchEvent(new CustomEvent("momentsUpdated", { detail: { moment: newMoment } }));
          console.log("[MCP] 朋友圈动态发布成功:", newMoment);

          return {
            status: "success",
            momentId: newMoment.id,
            content: content,
            hasImage: !!imageUrl,
            imageUrl: imageUrl,
            note: `【朋友圈动态已成功发布！】动态「${content.substring(0, 20)}...」已成功登载至手机朋友圈，主公与圈内名士可随时查阅点赞。`
          };
        } catch (err) {
          console.error("[MCP] 朋友圈动态发布失败:", err);
          return { error: `发布朋友圈失败: ${err.message}` };
        }
      }
    },
    {
      name: "search_ao3_fanfics",
      displayName: "AO3 官方同人检索与调阅",
      icon: "ph-magnifying-glass",
      category: "同人与文学",
      description: "在 AO3 (Archive of Our Own) 上实时检索同人小说并分页调阅正文内容（通过云端 Worker /ao3 网关直通，零 Python 依赖）。支持按关键词/作品名/CP搜索，也支持按 work_id、上一轮序号 work_index 或作品标题 title 分页阅读正文（每页 5000 字，支持传 page 翻页）。",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["search", "read"], description: "操作类型: search(搜索作品列表) 或 read(读取指定作品的正文内容)" },
          keyword: { type: "string", description: "搜索关键词、作品名、CP名、角色名或标签，如'代号鸢'、'傅融'、'广陵王'" },
          title: { type: "string", description: "[read时推荐] 想阅读的作品标题，系统将自动精确定位该作品" },
          work_index: { type: "number", description: "[read时可选] 根据上一轮搜索结果的序号（如 1, 2, 3）直接阅读对应篇目" },
          work_id: { type: "string", description: "[read时可选] AO3 作品纯数字编号（如 '53152786'）" },
          fandom: { type: "string", description: "[可选] 世界观/原作筛选，如'代号鸢'、'原神'" },
          page: { type: "number", description: "[read时可选] 正文分页页码（从 1 开始，每页 5000 字，长篇续读时传 2, 3...）" }
        },
        required: []
      },
      defaultEnabled: true,
      handler: async (args, context) => {
        if (window.Ao3ReaderEngine && typeof window.Ao3ReaderEngine.handleToolCall === "function") {
          return await window.Ao3ReaderEngine.handleToolCall(args || {}, context || {});
        }
        return {
          status: "error",
          message: "AO3 云端阅读引擎 (Ao3ReaderEngine) 尚未加载，请刷新页面后重试。"
        };
      }
    }
  ];

  class MCPHub {
    constructor() {
      this.masterEnabled = localStorage.getItem(STORAGE_KEYS.MASTER_ENABLED) !== "false"; // 默认开启
      this.toolOverrides = {};
      try {
        this.toolOverrides = JSON.parse(localStorage.getItem(STORAGE_KEYS.TOOL_OVERRIDES) || "{}");
      } catch (e) { }

      this.externalServers = [];
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.EXTERNAL_SERVERS) || "[]");
        this.externalServers = Array.isArray(saved) ? saved : [];
      } catch (e) { }

      // 确保内置预置官方风月大富翁 MCP Server
      const spicyServerUrl = "https://spicy-monopoly.lol/mcp";
      const existingSpicy = this.externalServers.find(s => s.url === spicyServerUrl || s.id === "spicy_monopoly_mcp");
      if (!existingSpicy) {
        this.externalServers.unshift({
          id: "spicy_monopoly_mcp",
          name: "风月大富翁 (Spicy Monopoly)",
          url: spicyServerUrl,
          description: "成年请进。感谢伟大的游戏开发 Ren & 游戏策划 Puppy 🐾",
          enabled: true,
          isPreset: true,
          createdAt: new Date().toISOString()
        });
        try {
          localStorage.setItem(STORAGE_KEYS.EXTERNAL_SERVERS, JSON.stringify(this.externalServers));
        } catch (e) {}
      } else {
        existingSpicy.description = "成年请进。感谢伟大的游戏开发 Ren & 游戏策划 Puppy 🐾";
        existingSpicy.name = "风月大富翁 (Spicy Monopoly)";
      }

      this.builtInTools = BUILTIN_TOOL_DEFINITIONS.map(t => ({
        ...t,
        enabled: this.toolOverrides[t.name] !== undefined ? this.toolOverrides[t.name] : (t.defaultEnabled !== undefined ? t.defaultEnabled : (t.enabled !== undefined ? t.enabled : true))
      }));
    }

    isMasterEnabled() {
      return this.masterEnabled;
    }

    setMasterEnabled(enabled) {
      this.masterEnabled = !!enabled;
      localStorage.setItem(STORAGE_KEYS.MASTER_ENABLED, String(this.masterEnabled));
    }

    toggleTool(toolName, enabled) {
      const tool = this.builtInTools.find(t => t.name === toolName);
      if (tool) {
        tool.enabled = !!enabled;
        this.toolOverrides[toolName] = tool.enabled;
        localStorage.setItem(STORAGE_KEYS.TOOL_OVERRIDES, JSON.stringify(this.toolOverrides));
      }
    }

    // 获取供 OpenAI / Claude 使用的 tools 参数列表
    getActiveTools() {
      if (!this.masterEnabled) return [];

      const active = [];

      // 1. 内置工具
      for (const t of this.builtInTools) {
        if (t.enabled !== false) {
          active.push({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters || t.inputSchema || { type: "object", properties: {} }
            }
          });
        }
      }

      // 2. 外部 MCP 服务工具
      for (const server of this.externalServers) {
        if (server.enabled && Array.isArray(server.tools)) {
          for (const extTool of server.tools) {
            active.push({
              type: "function",
              function: {
                name: extTool.name,
                description: `[来自外部MCP:${server.name}] ${extTool.description || ""}`,
                parameters: extTool.inputSchema || { type: "object", properties: {} }
              }
            });
          }
        }
      }

      return active;
    }

    // 执行指定工具
    async executeTool(toolName, toolArgs, context = {}) {
      console.log(`[MCP] 正在分发执行工具: ${toolName}`, toolArgs);

      // 1. 查找内置工具
      const builtIn = this.builtInTools.find(t => t.name === toolName);
      if (builtIn) {
        try {
          const res = await builtIn.handler(toolArgs, context);
          console.log(`[MCP] 内置工具 ${toolName} 执行完毕:`, res);
          return res;
        } catch (err) {
          console.error(`[MCP] 内置工具 ${toolName} 执行出错:`, err);
          return { error: err.message || "工具执行失败" };
        }
      }

      // 2. 查找外部 MCP 服务
      for (const server of this.externalServers) {
        if (server.enabled && Array.isArray(server.tools)) {
          const match = server.tools.find(t => t.name === toolName);
          if (match) {
            return await this.callExternalTool(server, toolName, toolArgs);
          }
        }
      }

      return { error: `未找到工具 [${toolName}]` };
    }

    // 远程调用外部 MCP 服务
    async callExternalTool(server, toolName, toolArgs) {
      const url = server.url.trim();
      try {
        const payload = {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArgs
          }
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return data.result || data;
      } catch (err) {
        console.error(`[MCP] 调用外部服务 ${server.name} 失败:`, err);
        return { error: `外部 MCP 服务连接异常: ${err.message}` };
      }
    }

    // 测试并刷新外部 MCP 服务工具列表
    async testAndFetchExternalServer(serverUrl) {
      const url = (serverUrl || "").trim();
      if (!url) throw new Error("请输入有效的 MCP 服务 URL");

      // 1. 发起 tools/list JSON-RPC 请求
      const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`连接失败 (HTTP ${res.status}): ${res.statusText}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "MCP 握手失败");

      const tools = data.result?.tools || data.tools || [];
      return tools;
    }

    // 添加外部 MCP 服务
    async addExternalServer(name, url) {
      const tools = await this.testAndFetchExternalServer(url);
      const newServer = {
        id: "mcp_srv_" + Date.now(),
        name: name || "自定义 MCP 节点",
        url: url.trim(),
        enabled: true,
        status: "connected",
        toolsCount: tools.length,
        tools: tools,
        updatedAt: new Date().toLocaleTimeString()
      };

      this.externalServers.push(newServer);
      localStorage.setItem(STORAGE_KEYS.EXTERNAL_SERVERS, JSON.stringify(this.externalServers));
      return newServer;
    }

    removeExternalServer(id) {
      this.externalServers = this.externalServers.filter(s => s.id !== id);
      localStorage.setItem(STORAGE_KEYS.EXTERNAL_SERVERS, JSON.stringify(this.externalServers));
    }

    toggleExternalServer(id, enabled) {
      const s = this.externalServers.find(item => item.id === id);
      if (s) {
        s.enabled = !!enabled;
        localStorage.setItem(STORAGE_KEYS.EXTERNAL_SERVERS, JSON.stringify(this.externalServers));
      }
    }
  }

  // 挂载到全局单例

  // 全局置顶浮动调用气泡管理器 (100% 独立挂载，不受组件切换影响)
  window.showMcpIndicator = function (toolName, displayName, status) {
    if (!document.getElementById("mcp-indicator-styles")) {
      const style = document.createElement("style");
      style.id = "mcp-indicator-styles";
      style.textContent = `
        @keyframes mcpSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes mcpPulse { 0% { box-shadow: 0 4px 15px rgba(78, 126, 142, 0.25); } 50% { box-shadow: 0 6px 25px rgba(78, 126, 142, 0.5); } 100% { box-shadow: 0 4px 15px rgba(78, 126, 142, 0.25); } }
      `;
      document.head.appendChild(style);
    }

    let container = document.getElementById("mcp-floating-indicator");

    if (status === "idle") {
      if (container) {
        container.style.opacity = "0";
        container.style.transform = "translate(-50%, 15px) scale(0.95)";
        setTimeout(() => {
          if (container && container.dataset.status === "idle") {
            container.remove();
          }
        }, 350);
      }
      return;
    }

    if (!container) {
      container = document.createElement("div");
      container.id = "mcp-floating-indicator";
      container.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translate(-50%, 15px) scale(0.95);
        z-index: 999999;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 250, 248, 0.98) 100%);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1.5px solid #4E7E8E;
        border-radius: 30px;
        padding: 7px 18px;
        box-shadow: 0 8px 25px rgba(78, 126, 142, 0.35);
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 13px;
        font-weight: 700;
        color: #2C434B;
        pointer-events: none;
        white-space: nowrap;
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: mcpPulse 2s infinite ease-in-out;
      `;
      document.body.appendChild(container);
    }

    container.dataset.status = status;
    const isCalling = status === "calling";
    const iconBg = isCalling ? "#4E7E8E" : "#2E7D32";
    const iconContent = isCalling
      ? `<svg style="animation: mcpSpin 1s linear infinite; width: 13px; height: 13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
      : `<svg style="width: 13px; height: 13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const label = displayName || toolName || "扩展工具";
    const text = isCalling
      ? `名士正在调用「${label}」...`
      : `已完成「${label}」调用`;

    container.innerHTML = `
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: ${iconBg}; color: #FFF; flex-shrink: 0; transition: background 0.3s;">
        ${iconContent}
      </span>
      <span style="letter-spacing: 0.2px;">${text}</span>
    `;

    // 优雅升起
    requestAnimationFrame(() => {
      container.style.opacity = "1";
      container.style.transform = "translate(-50%, 0) scale(1)";
    });

    if (!isCalling) {
      setTimeout(() => {
        if (container && container.dataset.status === "done") {
          container.style.opacity = "0";
          container.style.transform = "translate(-50%, 15px) scale(0.95)";
          setTimeout(() => {
            if (container && container.dataset.status === "done") {
              container.remove();
            }
          }, 350);
        }
      }, 1800);
    }
  };


  // 挂载到全局单例
  window.mcpHub = new MCPHub();
  console.log("[MCP] Milvus MCP Hub 初始化就绪，已装载内置工具:", window.mcpHub.builtInTools.length);

  // ==================== 智能生图与传讯页面画卷即时渲染联动引擎 ====================

  // 1. 提供全局 100% 免费免 Key 的 AI 生图兜底服务 (Pollinations Flux 引擎)
  const origGenerateAIImage = window.generateAIImage;
  window.generateAIImage = async function (prompt, customOptions = {}) {
    // 0. 如果传入的已经是图片 URL，直接返回该 URL
    if (typeof prompt === "string" && (prompt.startsWith("http://") || prompt.startsWith("https://") || prompt.startsWith("data:image/"))) {
      return prompt;
    }

    // A. 如果已存在 MCP 本轮生成的画卷，优先直接返回
    if (window.__lastMcpGeneratedImage && window.__lastMcpGeneratedImage.imageUrl) {
      const url = window.__lastMcpGeneratedImage.imageUrl;
      window.__lastMcpGeneratedImage = null; // 消费掉本次画卷
      return url;
    }

    // B. 若用户配置并开启了第三方商业 API，尝试优先调用
    const savedConfig = localStorage.getItem("image_generation_api_config");
    if (savedConfig && typeof origGenerateAIImage === "function") {
      try {
        const parsed = JSON.parse(savedConfig);
        if (parsed && parsed.apiKey && parsed.url && (parsed.enabled !== false || customOptions.ignoreDisabled)) {
          return await origGenerateAIImage(prompt, customOptions);
        }
      } catch (e) {
        if (customOptions.ignoreDisabled) throw e;
      }
    }

    // C. 默认自动使用 Pollinations.ai 免费极速生图
    console.log("[MCP] 启动 Pollinations.ai 免费生图引擎, Prompt:", prompt);
    const cleanPrompt = (prompt || "masterpiece ancient chinese scenic landscape").trim();
    const seed = Math.floor(Math.random() * 1000000);
    const enriched = `masterpiece, ultra-detailed, anime aesthetic, ${cleanPrompt}, no text, no words, no watermark`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}?width=768&height=1024&seed=${seed}&nologo=true&enhance=false&model=flux`;
  };

  // 2. 拦截与增强 sendToLLM：确保所有画作均能在传讯页面自动生成精美图片消息卡片
  function setupSendToLLMInterceptor() {
    if (!window.sendToLLM) return;
    if (window.__mcp_sendToLLM_hooked) return;
    window.__mcp_sendToLLM_hooked = true;

    const rawSendToLLM = window.sendToLLM;
    const enhancedSendToLLM = async function (messages, customConfigOrChunk, onFinish, onError) {
      // 每次发起对话前重置上一轮缓存
      window.__lastMcpGeneratedImage = null;

      // 灵犀生境 · 用户消息实时情境视觉检测
      try {
        if (Array.isArray(messages) && messages.length > 0 && window.liveReactionEngine) {
          const lastUserObj = messages[messages.length - 1];
          const userText = typeof lastUserObj === "string" ? lastUserObj : (lastUserObj?.content || lastUserObj?.text || "");
          if (userText) {
            window.liveReactionEngine.onMessage(userText, true);
          }
        }
      } catch (e) { }

      const wrappedOnFinish = async (reply) => {
        let finalReply = reply || "";

        // ① 如果本轮模型调用了 generate_pollinations_image 或 draw_handdrawn_sketch 工具
        if (window.__lastMcpGeneratedImage && window.__lastMcpGeneratedImage.imageUrl) {
          const img = window.__lastMcpGeneratedImage;
          const hasImageTag = /\[\s*(?:生成图片|画图|生图|草图|手绘|简笔画|图片|图\s*片|photo|image|draw|img)\s*[:：]/i.test(finalReply);
          if (!hasImageTag) {
            finalReply = `${finalReply}\n[生成图片: ${(img.title || img.prompt || "手绘画卷").replace(/^[《〈【\s]+|[》〉】\s]+$/g, "").trim() ? '《' + (img.title || img.prompt || "手绘画卷").replace(/^[《〈【\s]+|[》〉】\s]+$/g, "").trim() + '》' : '《手绘画卷》'}]`;
          }
        }

        // 拦截并提取模型可能直接输出的 data:image 链接或 [图片: data:...]
        const rawDataUrlMatch = finalReply.match(/(?:\[\s*(?:图片|生成图片|生图|画图|photo|image)\s*[:：]\s*)?(data:image\/[a-zA-Z0-9\+\-\.]+;[^\s\n"'\)\]]+)(?:\])?/i);
        if (rawDataUrlMatch) {
          let matchedUrl = rawDataUrlMatch[1];
          if (matchedUrl.includes("data:image/svg+xml")) {
            try {
              let decoded = decodeURIComponent(matchedUrl.replace(/^data:image\/svg\+xml;?(?:utf8|charset=utf-8)?,?/i, ""));
              if (!decoded.includes("xmlns=")) {
                decoded = decoded.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"');
                matchedUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(decoded)))}`;
              }
            } catch (e) {}
          }
          window.__lastMcpGeneratedImage = {
            imageUrl: matchedUrl,
            title: "手绘画卷",
            timestamp: Date.now()
          };
          finalReply = finalReply.replace(rawDataUrlMatch[0], "").trim();
          if (!/\[\s*(?:生成图片|画图|生图|草图|手绘|图片|图\s*片|photo|image|draw|img)\s*[:：]/i.test(finalReply)) {
            finalReply = `${finalReply}\n[生成图片: 手绘画卷]`;
          }
        }

        // ② 如果模型输出了 markdown 图片格式或 Pollinations 原生 URL
        const mdImgMatch = finalReply.match(/!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/i);
        if (mdImgMatch) {
          window.__lastMcpGeneratedImage = {
            imageUrl: mdImgMatch[2],
            title: mdImgMatch[1] || "丹青画卷",
            timestamp: Date.now()
          };
          finalReply = finalReply.replace(mdImgMatch[0], "").trim();
          if (!/\[(?:生成图片|画图|生图|photo|image)[:：]/i.test(finalReply)) {
            finalReply = `${finalReply}\n[生成图片: ${mdImgMatch[1] || "丹青画卷"}]`;
          }
        }

        const pollUrlMatch = finalReply.match(/(https:\/\/image\.pollinations\.ai\/prompt\/[^\s\n"'\)\]]+)/i);
        if (pollUrlMatch && !window.__lastMcpGeneratedImage) {
          window.__lastMcpGeneratedImage = {
            imageUrl: pollUrlMatch[1],
            title: "丹青画卷",
            timestamp: Date.now()
          };
          finalReply = finalReply.replace(pollUrlMatch[0], "").trim();
          if (!/\[(?:生成图片|画图|生图|photo|image)[:：]/i.test(finalReply)) {
            finalReply = `${finalReply}\n[生成图片: 丹青画卷]`;
          }
        }

        // ③ 朋友圈动态标签抓取与自动发布 (双重保险 · 保证 100% 执行)
        const momentTagMatch = finalReply.match(/\[\s*(?:发布朋友圈|发朋友圈|朋友圈动态|发动态|朋友圈|post_moment)\s*[:：]\s*([\s\S]*?)\]/i);
        if (momentTagMatch) {
          const rawMomentBody = momentTagMatch[1].trim();
          finalReply = finalReply.replace(momentTagMatch[0], "").trim();

          let momentContent = rawMomentBody;
          let momentImagePrompt = "";
          if (rawMomentBody.includes("|")) {
            const parts = rawMomentBody.split("|");
            momentContent = parts[0].trim();
            momentImagePrompt = parts.slice(1).join("|").trim();
          } else if (/配图[:：]/i.test(rawMomentBody)) {
            const parts = rawMomentBody.split(/配图[:：]/i);
            momentContent = parts[0].trim();
            momentImagePrompt = parts[1].trim();
          }

          if (window.mcpHub) {
            window.mcpHub.executeTool("publish_moment", {
              content: momentContent,
              imagePrompt: momentImagePrompt
            }, {
              character: customConfigOrChunk?.character || customConfigOrChunk?.characterName,
              characterId: customConfigOrChunk?.characterId
            }).catch(e => console.warn("[MCP] 标签自动发布朋友圈异常:", e));
          }
        }

        // 灵犀生境 · 名士回复实时情境视觉检测
        try {
          if (finalReply && window.liveReactionEngine) {
            window.liveReactionEngine.onMessage(finalReply, false);
          }
        } catch (e) { }

        if (typeof onFinish === "function") {
          return onFinish(finalReply);
        }
      };

      return rawSendToLLM.call(this, messages, customConfigOrChunk, wrappedOnFinish, onError);
    };

    enhancedSendToLLM.__mcp_intercepted = true;
    window.sendToLLM = enhancedSendToLLM;
    console.log("[MCP] 传讯页面智能画卷渲染拦截器挂载就绪");
  }

  // 立即尝试挂载，并在页面加载完毕时再次确立
  setupSendToLLMInterceptor();
  window.addEventListener("DOMContentLoaded", setupSendToLLMInterceptor);
  window.addEventListener("load", setupSendToLLMInterceptor);
  setInterval(setupSendToLLMInterceptor, 1500);

  // ==================== 纯前端古风诗赋与飞花令数据库引擎 (100% 离线免API) ====================
  const ANCIENT_POETRY_DB = [
    { title: "短歌行", author: "曹操", dynasty: "东汉", lines: ["对酒当歌，人生几何！譬如朝露，去日苦多。", "慨当以慷，忧思难忘。何以解忧？唯有杜康。", "青青子衿，悠悠我心。但为君故，沉吟至今。", "呦呦鹿鸣，食野之苹。我有嘉宾，鼓瑟吹笙。", "明明如月，何时可掇？忧从中来，不可断绝。", "月明星稀，乌鹊南飞。绕树三匝，何枝可依？", "山不厌高，海不厌深。周公吐哺，天下归心。"] },
    { title: "观沧海", author: "曹操", dynasty: "东汉", lines: ["东临碣石，以观沧海。水何澹澹，山岛竦峙。", "树木丛生，百草丰茂。秋风萧瑟，洪波涌起。", "日月之行，若出其中；星汉灿烂，若出其里。", "幸甚至哉，歌以咏志。"] },
    { title: "龟虽寿", author: "曹操", dynasty: "东汉", lines: ["神龟虽寿，犹有竟时；螣蛇乘雾，终为土灰。", "老骥伏枥，志在千里；烈士暮年，壮心不已。", "盈缩之期，不但在天；养怡之福，可得永年。"] },
    { title: "白马篇", author: "曹植", dynasty: "三国·魏", lines: ["白马饰金羁，连翩西北驰。借问谁家子，幽并游侠儿。", "少小去乡邑，扬声沙漠陲。宿昔秉良弓，楛矢何参差。", "羽檄从北来，厉马登高堤。长驱蹈匈奴，左顾凌鲜卑。", "捐躯赴国难，视死忽如归！"] },
    { title: "洛神赋", author: "曹植", dynasty: "三国·魏", lines: ["翩若惊鸿，婉若游龙。荣曜秋菊，华茂春松。", "仿佛兮若轻云之蔽月，飘飖兮若流风之回雪。", "远而望之，皎若太阳升朝霞；迫而察之，灼若芙蕖出渌波。", "体迅飞凫，飘忽若神。凌波微步，罗袜生尘。"] },
    { title: "七步诗", author: "曹植", dynasty: "三国·魏", lines: ["煮豆持作羹，漉菽以为汁。", "萁在釜下燃，豆在釜中泣。", "本自同根生，相煎何太急？"] },
    { title: "燕歌行", author: "曹丕", dynasty: "三国·魏", lines: ["秋风萧瑟天气凉，草木摇落露为霜，群燕辞归鹄南翔。", "念君客游思断肠，慊慊思归恋故乡，君何淹留寄他方？", "明月皎皎照我床，星汉西流夜未央。", "牵牛织女遥相望，尔独何辜限河梁？"] },
    { title: "上邪", author: "汉乐府", dynasty: "汉代", lines: ["上邪！我欲与君相知，长命无绝衰。", "山无陵，江水为竭，冬雷震震，夏雨雪，天地合，乃敢与君绝！"] },
    { title: "长歌行", author: "汉乐府", dynasty: "汉代", lines: ["青青园中葵，朝露待日晞。", "阳春布德泽，万物生光辉。", "常恐秋节至，焜黄华叶衰。", "百川东到海，何时复西归？少壮不努力，老大徒伤悲！"] },
    { title: "陌上桑", author: "汉乐府", dynasty: "汉代", lines: ["日出东南隅，照我秦氏楼。秦氏有好女，自名为罗敷。", "罗敷喜蚕桑，采桑城南隅。青丝为笼系，桂枝为笼钩。", "头部倭堕髻，耳中明月珠。缃绮为下裙，紫绮为上襦。"] },
    { title: "饮马长城窟行", author: "汉乐府", dynasty: "汉代", lines: ["青青河畔草，绵绵思远道。远道不可思，宿昔梦见之。", "客从远方来，遗我双鲤鱼。呼儿烹鲤鱼，中有尺素书。", "长跪读素书，书中竟何如？上言加餐食，下言长相忆。"] },
    { title: "古诗十九首·迢迢牵牛星", author: "汉无名氏", dynasty: "东汉", lines: ["迢迢牵牛星，皎皎河汉女。", "纤纤擢素手，札札弄机杼。", "终日不成章，泣涕零如雨。", "河汉清且浅，相去复几许？盈盈一水间，脉脉不得语。"] },
    { title: "古诗十九首·行行重行行", author: "汉无名氏", dynasty: "东汉", lines: ["行行重行行，与君生别离。相去万余里，各在天一涯。", "道路阻且长，会面安可知？胡马依北风，越鸟巢南枝。", "相去日已远，衣带日已缓。浮云蔽白日，游子不顾反。", "思君令人老，岁月忽已晚。弃捐勿复道，努力加餐饭。"] },
    { title: "饮酒·其五", author: "陶渊明", dynasty: "东晋", lines: ["结庐在人境，而无车马喧。", "问君何能尔？心远地自偏。", "采菊东篱下，悠然见南山。", "山气日夕佳，飞鸟相与还。此中有真意，欲辨已忘言。"] },
    { title: "归园田居·其一", author: "陶渊明", dynasty: "东晋", lines: ["少无适俗韵，性本爱丘山。误落尘网中，一去三十年。", "羁鸟恋旧林，池鱼思故渊。开荒南野际，守拙归园田。", "方宅十余亩，草屋八九间。榆柳荫后檐，桃李罗堂前。", "久在樊笼里，复得返自然。"] },
    { title: "关雎", author: "先秦·国风", dynasty: "先秦", lines: ["关关雎鸠，在河之洲。窈窕淑女，君子好逑。", "参差荇菜，左右流之。窈窕淑女，寤寐求之。", "求之不得，寤寐思服。悠哉悠哉，辗转反侧。", "参差荇菜，左右采之。窈窕淑女，琴瑟友之。", "参差荇菜，左右芼之。窈窕淑女，钟鼓乐之。"] },
    { title: "蒹葭", author: "先秦·国风", dynasty: "先秦", lines: ["蒹葭苍苍，白露为霜。所谓伊人，在水一方。", "溯洄从之，道阻且长。溯游从之，宛在水中央。", "蒹葭萋萋，白露未晞。所谓伊人，在水之湄。", "蒹葭采采，白露未已。所谓伊人，在水之涘。"] },
    { title: "木瓜", author: "先秦·国风", dynasty: "先秦", lines: ["投我以木瓜，报之以琼琚。匪报也，永以为好也！", "投我以木桃，报之以琼瑶。匪报也，永以为好也！", "投我以木李，报之以琼玖。匪报也，永以为好也！"] },
    { title: "春江花月夜", author: "张若虚", dynasty: "唐代", lines: ["春江潮水连海平，海上明月共潮生。滟滟随波千万里，何处春江无月明！", "江流宛转绕芳甸，月照花林皆似霰；空里流霜不觉飞，汀上白沙看不见。", "江天一色无纤尘，皎皎空中孤月轮。江畔何人初见月？江月何年初照人？", "人生代代无穷已，江月年年望相似。不知江月待何人，但见长江送流水。", "此时相望不相闻，愿逐月华流照君。鸿雁长飞光不度，鱼龙潜跃水成文。"] },
    { title: "将进酒", author: "李白", dynasty: "唐代", lines: ["君不见，黄河之水天上来，奔流到海不复回。", "君不见，高堂明镜悲白发，朝如青丝暮成雪。", "人生得意须尽欢，莫使金樽空对月。天生我材必有用，千金散尽还复来。", "烹羊宰牛且为乐，会须一饮三百杯。岑夫子，丹丘生，将进酒，杯莫停。", "与君歌一曲，请君为我倾耳听。钟鼓馔玉不足贵，但愿长醉不复醒。", "古来圣贤皆寂寞，惟有饮者留其名。呼儿将出换美酒，与尔同销万古愁。"] },
    { title: "水调歌头·明月几时有", author: "苏轼", dynasty: "宋代", lines: ["明月几时有？把酒问青天。不知天上宫阙，今夕是何年。", "我欲乘风归去，又恐琼楼玉宇，高处不胜寒。起舞弄清影，何似在人间。", "转朱阁，低绮户，照无眠。不应有恨，何事长向别时圆？", "人有悲欢离合，月有阴晴圆缺，此事古难全。但愿人长久，千里共婵娟。"] }
  ];

  window.mcpPoetryEngine = {
    database: ANCIENT_POETRY_DB,
    matchFeihua(keyword, excludeLines = []) {
      const kw = (keyword || "").trim();
      if (!kw) return null;
      let matched = [];
      for (const poem of ANCIENT_POETRY_DB) {
        for (const line of poem.lines) {
          if (line.includes(kw) && !excludeLines.includes(line)) {
            matched.push({
              line: line,
              title: poem.title,
              author: poem.author,
              dynasty: poem.dynasty
            });
          }
        }
      }
      if (matched.length === 0) return null;
      return matched[Math.floor(Math.random() * matched.length)];
    },
    searchPoetry(query) {
      const q = (query || "").trim().toLowerCase();
      if (!q) return [];
      return ANCIENT_POETRY_DB.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.author.toLowerCase().includes(q) || 
        p.lines.some(l => l.toLowerCase().includes(q))
      );
    },
    getRandomFeihuaWord() {
      const hotWords = ["月", "花", "风", "酒", "春", "山", "夜", "水", "云", "江", "心", "人", "雪", "秋", "日", "君", "情", "归"];
      return hotWords[Math.floor(Math.random() * hotWords.length)];
    }
  };


  // ==================== 【中华八大菜系与万道家常菜】海量食谱引擎 (100% 离线免API) ====================
  const COMPREHENSIVE_COOKBOOK_DB = [
  {
    "id": "cook_1",
    "name": "红烧肉",
    "category": "经典家常",
    "cuisine": "苏鲁本帮",
    "difficulty": "初级",
    "timeCost": "60分钟",
    "summary": "浓油赤酱，肥而不腻，入口即化。慢火慢煨使肉皮胶质与酱香完美交融。",
    "ingredients": {
      "main": [
        "五花肉 500g（切3cm见方块）"
      ],
      "sub": [
        "生姜 4片",
        "小葱 3根",
        "八角 2个",
        "桂皮 1小块",
        "香叶 2片"
      ],
      "seasoning": [
        "黄酒 50ml",
        "生抽 30ml",
        "老抽 15ml",
        "冰糖 30g"
      ]
    },
    "tips": "全程少加水，靠黄酒与慢火焖烂；最后大火收汁时不停翻动使糖色均匀挂满肉块。",
    "steps": [
      "1. 五花肉冷水下锅焯水3分钟撇沫洗净；",
      "2. 锅中不放油，小火煸炒出部分油脂至表面微黄；",
      "3. 留底油下冰糖小火炒至琥珀色小泡；",
      "4. 倒入五花肉快速翻炒上色，烹入黄酒、生抽、老抽出酱香；",
      "5. 加葱姜香料与热开水，大火烧开转小火慢炖45分钟；",
      "6. 大火翻炒收汁浓稠出锅。"
    ]
  },
  {
    "id": "cook_2",
    "name": "糖醋里脊",
    "category": "经典家常",
    "cuisine": "鲁菜传统",
    "difficulty": "中级",
    "timeCost": "20分钟",
    "summary": "外酥里嫩，酸甜适口，色泽红亮。裹上晶莹剔透的糖醋浓汁。",
    "ingredients": {
      "main": [
        "猪通脊肉 300g（切粗条）",
        "土豆淀粉 80g"
      ],
      "sub": [
        "熟白芝麻 1勺",
        "蛋清 半个",
        "姜汁 1勺"
      ],
      "seasoning": [
        "番茄酱 3勺",
        "白糖 3勺",
        "白醋 2勺",
        "生抽 半勺",
        "水淀粉 1勺"
      ]
    },
    "tips": "复炸30秒是保持外壳长时间酥脆不回软的核心秘诀！",
    "steps": [
      "1. 里脊肉切条加姜汁料酒蛋清抓匀腌制；",
      "2. 土豆淀粉加少许水调成浓稠面糊均匀裹肉条；",
      "3. 六成油温炸至定型捞出，八成油温复炸30秒至金黄酥脆；",
      "4. 锅中熬稠番茄酱、糖、醋汁，倒入肉条快速颠匀出锅撒芝麻。"
    ]
  },
  {
    "id": "cook_3",
    "name": "鱼香肉丝",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "中级",
    "timeCost": "20分钟",
    "summary": "不见鱼肉却有绝妙鱼香味。泡椒红油与葱姜蒜香交织，酸甜微辣。",
    "ingredients": {
      "main": [
        "猪里脊肉 250g（切丝）",
        "水发木耳 50g",
        "冬笋 50g",
        "胡萝卜 30g"
      ],
      "sub": [
        "四川泡红椒 2勺（剁细）",
        "姜末 1勺",
        "蒜末 1.5勺",
        "葱花 2勺"
      ],
      "seasoning": [
        "黄金鱼香汁：香醋 4勺、白糖 3勺、生抽 2勺、清水 3勺、淀粉 1勺"
      ]
    },
    "tips": "糖醋4:3黄金比例，泡椒炒出红油是风味灵魂。",
    "steps": [
      "1. 肉丝加生抽料酒水淀粉上浆封油；",
      "2. 配菜切丝焯水沥干；调好黄金鱼香汁；",
      "3. 滑炒肉丝至变白盛出；",
      "4. 炒香泡椒出红油，下姜蒜末爆香，下配菜丝大火翻炒；",
      "5. 倒入肉丝与鱼香汁，大火翻炒裹汁撒葱花出锅。"
    ]
  },
  {
    "id": "cook_4",
    "name": "水煮肉片",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "中级",
    "timeCost": "25分钟",
    "summary": "肉片鲜嫩滑爽，红汤麻辣浓郁，热油淋下蒜香扑鼻。",
    "ingredients": {
      "main": [
        "猪里脊肉或梅花肉 300g（切大薄片）",
        "豆芽 150g",
        "莴笋尖 100g"
      ],
      "sub": [
        "郫县豆瓣酱 2勺",
        "干辣椒 15个",
        "花椒粒 1勺",
        "蒜末 4瓣",
        "葱花 适量"
      ],
      "seasoning": [
        "蛋清半个",
        "淀粉 2勺",
        "生抽 1勺",
        "料酒 1勺",
        "花椒粉 1勺"
      ]
    },
    "tips": "肉片抓足水分和蛋清淀粉，微沸下锅变色即捞，保持极致软嫩。",
    "steps": [
      "1. 肉片加生抽料酒蛋清淀粉上浆；干辣椒花椒小火焙香剁碎（刀口辣椒）；",
      "2. 豆芽莴笋炒断生垫底；",
      "3. 炒香豆瓣酱与葱姜蒜，加水烧沸调味；",
      "4. 抖散下入肉片微沸40秒连汤倒入碗中；",
      "5. 铺上刀口辣椒与蒜末，淋入八成热油激发出香味。"
    ]
  },
  {
    "id": "cook_5",
    "name": "回锅肉",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "初级",
    "timeCost": "25分钟",
    "summary": "川菜之首。五花肉片煸出灯盏窝，焦香四溢，搭配蒜苗鲜辣下饭。",
    "ingredients": {
      "main": [
        "二刀肉或五花肉 400g（整块煮熟切薄片）",
        "青蒜苗 4根（拍扁切斜段）"
      ],
      "sub": [
        "生姜 3片",
        "大蒜 2瓣",
        "花椒 10粒"
      ],
      "seasoning": [
        "郫县豆瓣酱 1.5勺",
        "甜面酱 1勺",
        "豆豉 1勺",
        "生抽 半勺",
        "白糖 半勺"
      ]
    },
    "tips": "肉要冷水下锅煮至筷子能插透，放凉后切薄片才容易煸出‘灯盏窝’。",
    "steps": [
      "1. 猪肉整块煮熟晾凉切大薄片；",
      "2. 锅中少油，下肉片中小火煸炒至出油卷曲呈灯盏窝；",
      "3. 下豆瓣酱、甜面酱、豆豉炒出红油酱香；",
      "4. 先下青蒜白翻炒断生，再下蒜叶与少许糖生抽大火颠匀出锅。"
    ]
  },
  {
    "id": "cook_6",
    "name": "京酱肉丝",
    "category": "经典家常",
    "cuisine": "北方传统",
    "difficulty": "初级",
    "timeCost": "15分钟",
    "summary": "咸甜适口，酱香浓郁。肉丝滑嫩，配葱丝与豆腐皮卷食绝佳。",
    "ingredients": {
      "main": [
        "猪里脊肉 300g（切细丝）",
        "大葱白 2根（切细丝垫底）",
        "豆腐皮 2张"
      ],
      "sub": [
        "蛋清 半个",
        "淀粉 1勺"
      ],
      "seasoning": [
        "甜面酱 2勺",
        "生抽 1勺",
        "白糖 1勺",
        "料酒 1勺",
        "香油 半勺"
      ]
    },
    "tips": "甜面酱加少许水和糖炒透，大火将酱汁紧紧裹在肉丝上。",
    "steps": [
      "1. 肉丝抓匀上浆；葱白切细丝铺盘底；",
      "2. 滑熟肉丝捞出；锅留底油炒香甜面酱与糖；",
      "3. 倒入肉丝大火裹匀酱汁，淋香油出锅倒在葱丝上。"
    ]
  },
  {
    "id": "cook_7",
    "name": "粉蒸肉",
    "category": "经典家常",
    "cuisine": "川湘风味",
    "difficulty": "中级",
    "timeCost": "60分钟",
    "summary": "糯而不腻，米粉吸收了五花肉的醇香油脂，南瓜/土豆垫底软糯清甜。",
    "ingredients": {
      "main": [
        "五花肉 400g（切大厚片）",
        "蒸肉米粉 100g",
        "南瓜或红薯 200g（切块垫底）"
      ],
      "sub": [
        "生姜末 1勺",
        "小葱 1根"
      ],
      "seasoning": [
        "生抽 2勺",
        "老抽 1勺",
        "料酒 1勺",
        "豆瓣酱 1勺",
        "白糖 半勺",
        "腐乳汁 1勺"
      ]
    },
    "tips": "米粉拌肉后加少许温水静置15分钟，蒸出来米粉更软润不干硬。",
    "steps": [
      "1. 五花肉切厚片，加调味料抓匀腌制20分钟；",
      "2. 倒入蒸肉米粉与少许水抓匀包裹肉片；",
      "3. 碗底铺南瓜块，整齐码放米粉肉；",
      "4. 蒸锅大火烧开转中火蒸50分钟至软烂，倒扣装盘撒葱花。"
    ]
  },
  {
    "id": "cook_8",
    "name": "青椒肉丝",
    "category": "经典家常",
    "cuisine": "国民快手",
    "difficulty": "初级",
    "timeCost": "10分钟",
    "summary": "家家户户的家常快手菜。肉丝滑嫩，青椒脆嫩微辣，咸鲜清爽下饭。",
    "ingredients": {
      "main": [
        "猪里脊肉 200g（切丝）",
        "青椒 3个（切细丝）"
      ],
      "sub": [
        "大蒜 2瓣（切片）",
        "姜末 少许"
      ],
      "seasoning": [
        "生抽 2勺",
        "蚝油 1勺",
        "料酒 1勺",
        "淀粉 1勺",
        "精盐 适量"
      ]
    },
    "tips": "青椒不放油先干煸30秒去生涩辣味，口感更加爽脆鲜香。",
    "steps": [
      "1. 肉丝加生抽料酒水淀粉抓匀上浆；青椒切丝；",
      "2. 热锅凉油下肉丝滑炒变色盛出；",
      "3. 锅留底油爆香蒜片，下青椒丝大火快炒断生；",
      "4. 倒入肉丝，加蚝油生抽少许盐大火翻炒10秒出锅。"
    ]
  },
  {
    "id": "cook_9",
    "name": "宫保鸡丁",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "中级",
    "timeCost": "20分钟",
    "summary": "鸡肉滑嫩，花生酥脆，糊辣荔枝味（微辣微酸微甜），层次丰富。",
    "ingredients": {
      "main": [
        "鸡胸肉或去骨鸡腿肉 300g",
        "油炸熟花生米 50g"
      ],
      "sub": [
        "大葱白 2根",
        "干辣椒 10个",
        "花椒 1勺",
        "姜蒜片 适量"
      ],
      "seasoning": [
        "白糖 2勺",
        "米醋 2勺",
        "生抽 2勺",
        "老抽 半勺",
        "水淀粉 1勺"
      ]
    },
    "tips": "提前调好宫保黄金碗汁，关火前下花生米保持酥脆。",
    "steps": [
      "1. 鸡肉切丁上浆；调好宫保料汁；",
      "2. 滑熟鸡丁盛出；",
      "3. 炒香干辣椒花椒与葱姜蒜；",
      "4. 倒入鸡丁与料汁大火收芡，出锅前撒花生米翻匀。"
    ]
  },
  {
    "id": "cook_10",
    "name": "可乐鸡翅",
    "category": "经典家常",
    "cuisine": "快手美味",
    "difficulty": "初级",
    "timeCost": "25分钟",
    "summary": "焦糖香甜浓郁，鸡肉鲜嫩脱骨，酱汁浓厚拌饭绝配。",
    "ingredients": {
      "main": [
        "鸡翅中 8-10个（划双面花刀）",
        "可乐 1罐（330ml）"
      ],
      "sub": [
        "生姜 4片",
        "小葱 2根",
        "熟芝麻 适量"
      ],
      "seasoning": [
        "料酒 1勺",
        "生抽 2勺",
        "老抽 半勺",
        "精盐 少许"
      ]
    },
    "tips": "用含糖可乐，大火收汁时不停晃锅挂满红亮焦糖汁。",
    "steps": [
      "1. 鸡翅双面划刀焯水沥干；",
      "2. 平底锅少油小火煎至两面金黄；",
      "3. 下葱姜煸香，倒入可乐没过大半；",
      "4. 加生抽老抽小火焖15分钟，大火收浓汤汁出锅撒芝麻。"
    ]
  },
  {
    "id": "cook_11",
    "name": "黄焖鸡米饭",
    "category": "经典家常",
    "cuisine": "鲁菜名吃",
    "difficulty": "初级",
    "timeCost": "25分钟",
    "summary": "肉质滑嫩脱骨，香菇香气扑鼻，浓稠咸鲜汤汁拌米饭一绝。",
    "ingredients": {
      "main": [
        "鲜鸡腿肉 2只（斩块）",
        "干香菇 8朵（泡发切块）",
        "青红圆椒各半个"
      ],
      "sub": [
        "生姜 5片",
        "大蒜 4瓣",
        "干辣椒 3个"
      ],
      "seasoning": [
        "生抽 2勺",
        "老抽 1勺",
        "蚝油 1勺",
        "黄豆酱 1勺",
        "冰糖 5粒"
      ]
    },
    "tips": "用泡香菇的澄清原汤炖鸡，香气翻倍浓郁！",
    "steps": [
      "1. 鸡块洗净加生抽料酒腌制；",
      "2. 炒香姜蒜干辣椒，下鸡块大火煸炒微黄；",
      "3. 加酱料炒匀，倒入香菇原汤与香菇块；",
      "4. 砂锅焖煮15分钟，下青红椒大火收汁浓稠上桌。"
    ]
  },
  {
    "id": "cook_12",
    "name": "番茄炒蛋",
    "category": "经典家常",
    "cuisine": "国民家常",
    "difficulty": "初级",
    "timeCost": "10分钟",
    "summary": "国民第一菜。番茄酸甜出沙，鸡蛋蓬松软嫩吸饱红汁。",
    "ingredients": {
      "main": [
        "鸡蛋 3个",
        "熟透番茄 2个（去皮切块）"
      ],
      "sub": [
        "小葱 1根",
        "蒜末 1瓣"
      ],
      "seasoning": [
        "白糖 1小勺",
        "精盐 半小勺",
        "生抽 1小勺"
      ]
    },
    "tips": "番茄烫皮切块，炒时加一勺白糖加速出沙中和酸味。",
    "steps": [
      "1. 蛋液打散大火快炒成蓬松大块盛出；",
      "2. 下蒜末番茄块大火炒出浓郁红汁；",
      "3. 倒入鸡蛋吸饱汤汁，淋生抽撒葱花出锅。"
    ]
  },
  {
    "id": "cook_13",
    "name": "辣子鸡",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "中级",
    "timeCost": "25分钟",
    "summary": "在红彤彤的辣椒堆里找鸡肉。鸡丁外酥里嫩，麻辣干香回味无穷。",
    "ingredients": {
      "main": [
        "带骨鸡腿肉 400g（斩小丁）",
        "干红辣椒 100g（剪段）",
        "花椒 2大勺"
      ],
      "sub": [
        "熟白芝麻 1勺",
        "葱姜蒜末 适量"
      ],
      "seasoning": [
        "生抽 1勺",
        "料酒 1勺",
        "白糖 1勺",
        "胡椒粉 少许",
        "淀粉 1勺"
      ]
    },
    "tips": "鸡丁一定要斩小丁并复炸至表面干香金黄酥脆。",
    "steps": [
      "1. 鸡肉斩小丁腌制上浆；",
      "2. 六成油温炸至金黄，八成油温复炸至焦香干脆捞出；",
      "3. 锅留底油小火慢炒干辣椒与花椒出麻辣香；",
      "4. 倒入鸡丁、葱姜蒜、白糖大火翻炒，撒熟芝麻出锅。"
    ]
  },
  {
    "id": "cook_14",
    "name": "荷包蛋焖豆腐",
    "category": "经典家常",
    "cuisine": "快手素荤",
    "difficulty": "初级",
    "timeCost": "15分钟",
    "summary": "焦香荷包蛋与软嫩老豆腐同焖，吸饱浓郁酱汁，比肉还香。",
    "ingredients": {
      "main": [
        "鸡蛋 3个（煎荷包蛋切块）",
        "老豆腐 1块（切厚片煎金黄）"
      ],
      "sub": [
        "青红椒圈 适量",
        "大蒜 2瓣",
        "小葱 1根"
      ],
      "seasoning": [
        "生抽 2勺",
        "蚝油 1勺",
        "老抽 半勺",
        "白糖 半勺",
        "淀粉 1勺",
        "清水 1碗"
      ]
    },
    "tips": "荷包蛋和豆腐都煎至两面金黄起虎皮，最能吸足汤汁。",
    "steps": [
      "1. 鸡蛋煎成微焦荷包蛋切块；豆腐切片煎至双面金黄；",
      "2. 调好生抽蚝油老抽白糖淀粉水；",
      "3. 爆香蒜片，下荷包蛋与豆腐，倒入酱汁中小火焖煮5分钟；",
      "4. 汤汁浓稠撒青红椒与葱花大火收汁出锅。"
    ]
  },
  {
    "id": "cook_15",
    "name": "水煮牛肉",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "高级",
    "timeCost": "30分钟",
    "summary": "牛肉滑嫩化渣，红汤麻辣鲜香，刀口辣椒现焙现剁滚油泼香。",
    "ingredients": {
      "main": [
        "牛里脊 300g（逆纹切薄片）",
        "黄豆芽 150g",
        "芹菜或莴笋 100g"
      ],
      "sub": [
        "郫县豆瓣酱 2勺",
        "干辣椒 15个",
        "花椒 1勺",
        "蒜末葱花 适量"
      ],
      "seasoning": [
        "蛋清半个",
        "淀粉 2勺",
        "料酒 1勺",
        "生抽 1勺",
        "刀口辣椒 适量"
      ]
    },
    "tips": "逆着牛肉纹路切薄片抓水上浆，保持鲜嫩多汁。",
    "steps": [
      "1. 牛肉切片上浆；现炒刀口辣椒；",
      "2. 蔬菜炒熟垫底；",
      "3. 炒豆瓣酱煮红汤，下牛肉片微沸30秒盛出；",
      "4. 撒刀口辣椒与蒜末，淋热油激发出麻辣香气。"
    ]
  },
  {
    "id": "cook_16",
    "name": "番茄牛腩煲",
    "category": "经典家常",
    "cuisine": "滋补硬菜",
    "difficulty": "中级",
    "timeCost": "90分钟",
    "summary": "番茄浓郁酸甜，牛腩软烂入味，汤汁醇厚拌饭神仙搭配。",
    "ingredients": {
      "main": [
        "鲜牛腩 600g（切大块）",
        "成熟番茄 3个",
        "土豆 1个",
        "胡萝卜 半根"
      ],
      "sub": [
        "生姜 4片",
        "葱段 2段",
        "八角 1个",
        "香叶 2片"
      ],
      "seasoning": [
        "番茄沙司 2勺",
        "冰糖 15g",
        "生抽 2勺",
        "料酒 2勺",
        "精盐 适量"
      ]
    },
    "tips": "番茄分两次放：一半煮成浓汤，一半出锅前20分钟放保持果肉。",
    "steps": [
      "1. 牛腩焯水洗净，大火煸炒微焦烹入料酒生抽；",
      "2. 炒软一半番茄与番茄酱，连牛腩一同入砂锅加沸水小火炖60分钟；",
      "3. 加土豆胡萝卜与另一半番茄炖20分钟调味收汁。"
    ]
  },
  {
    "id": "cook_17",
    "name": "孜然羊肉",
    "category": "经典家常",
    "cuisine": "西北风味",
    "difficulty": "初级",
    "timeCost": "15分钟",
    "summary": "大火爆炒，肉嫩多汁无膻味，孜然与辣椒面香气逼人。",
    "ingredients": {
      "main": [
        "羊后腿肉 300g（切薄片）",
        "洋葱 半个（切丝）",
        "香菜 2根（切段）"
      ],
      "sub": [
        "生姜末 1勺",
        "大蒜末 1勺"
      ],
      "seasoning": [
        "孜然粒 2勺",
        "孜然粉 1勺",
        "辣椒粉 1勺",
        "生抽 1.5勺",
        "料酒 1勺",
        "淀粉 1勺",
        "熟白芝麻 1勺"
      ]
    },
    "tips": "全程保持大火快炒，孜然粒与孜然粉结合，颗粒感与香气兼备。",
    "steps": [
      "1. 羊肉切片加生抽料酒白胡椒淀粉抓匀腌制；洋葱切丝香菜切段；",
      "2. 锅中热油大火滑炒羊肉至变色断生盛出；",
      "3. 爆香洋葱丝与姜蒜末，倒入羊肉大火翻炒；",
      "4. 撒入足量孜然粒、孜然粉、辣椒粉、白芝麻与香菜段，大火爆炒10秒出锅。"
    ]
  },
  {
    "id": "cook_18",
    "name": "葱爆牛肉",
    "category": "经典家常",
    "cuisine": "鲁菜传统",
    "difficulty": "初级",
    "timeCost": "10分钟",
    "summary": "旺火速成。牛肉滑嫩多汁，大葱焦甜浓香，极考验火候。",
    "ingredients": {
      "main": [
        "牛里脊 250g（切薄片）",
        "大葱白 2大根（滚刀切斜马蹄段）"
      ],
      "sub": [
        "大蒜 2瓣（切片）"
      ],
      "seasoning": [
        "生抽 2勺",
        "料酒 1勺",
        "蚝油 1勺",
        "老抽 半勺",
        "白糖 半勺",
        "香醋 半勺（出锅前烹入）",
        "淀粉 1勺"
      ]
    },
    "tips": "旺火热锅，大葱与牛肉翻炒时间不超过30秒，出锅前沿锅边烹半勺香醋提香。",
    "steps": [
      "1. 牛肉切薄片加生抽料酒糖水淀粉抓匀上浆；大葱切大斜段；",
      "2. 碗中调好生抽蚝油老抽白糖水淀粉成汁；",
      "3. 热锅热油大火滑散牛肉变色立即盛出；",
      "4. 锅留底油大火煸香大葱段至微焦变软；",
      "5. 倒入牛肉与料汁大火爆炒10秒，烹入香醋翻匀出锅。"
    ]
  },
  {
    "id": "cook_19",
    "name": "清蒸鲈鱼",
    "category": "经典家常",
    "cuisine": "粤菜经典",
    "difficulty": "初级",
    "timeCost": "15分钟",
    "summary": "原汁原味，鱼肉嫩如豆腐，葱丝姜丝滚油激发出极致鲜甜。",
    "ingredients": {
      "main": [
        "鲜活鲈鱼 1条（约500g，背部开刀）"
      ],
      "sub": [
        "大葱 2根（切极细葱丝）",
        "生姜 1块（切丝与姜片）",
        "红椒丝 适量"
      ],
      "seasoning": [
        "蒸鱼豉油 3勺",
        "料酒 1勺",
        "食用油 30ml"
      ]
    },
    "tips": "大火上汽后蒸8分钟关火虚蒸2分钟；蒸出的原盘腥水必须全部倒掉！",
    "steps": [
      "1. 鲈鱼洗净背部划刀，抹料酒塞姜片葱段垫盘底；",
      "2. 蒸锅水大开后入锅，大火蒸8分钟关火虚蒸2分钟；",
      "3. 取出倒掉盘中腥水，拣去蒸烂的葱姜；",
      "4. 铺上新鲜葱姜红椒细丝，淋蒸鱼豉油；",
      "5. 烧热食用油至八成冒烟，淋在葱丝上激发出鲜香。"
    ]
  },
  {
    "id": "cook_20",
    "name": "蒜蓉粉丝蒸大虾",
    "category": "经典家常",
    "cuisine": "粤菜海鲜",
    "difficulty": "初级",
    "timeCost": "15分钟",
    "summary": "金银蒜蓉香气扑鼻，鲜虾爽脆清甜，粉丝吸饱了虾汁与蒜香浓汤。",
    "ingredients": {
      "main": [
        "鲜活基围虾 12只（开背去虾线）",
        "绿豆粉丝 1把（温水泡软）"
      ],
      "sub": [
        "大蒜 2头（一半金蒜炸香，一半银蒜生蒜）",
        "小葱 2根",
        "红椒碎 少许"
      ],
      "seasoning": [
        "生抽 2勺",
        "蚝油 1勺",
        "白糖 半勺",
        "精盐 少许",
        "蒸鱼豉油 2勺"
      ]
    },
    "tips": "金银蒜（一半小火炸至金黄，一半生蒜末混合）是蒜蓉酱灵魂！",
    "steps": [
      "1. 鲜虾开背拍平；粉丝泡软铺盘底；",
      "2. 炒金蒜与生蒜末、生抽、蚝油、糖混合成金银蒜蓉酱；",
      "3. 虾整齐码在粉丝上，每只虾背填入满满蒜蓉酱；",
      "4. 蒸锅水开大火蒸6分钟出锅；",
      "5. 撒葱花淋蒸鱼豉油，热油浇在葱蒜上激发出香气。"
    ]
  },
  {
    "id": "cook_21",
    "name": "松鼠鳜鱼",
    "category": "经典家常",
    "cuisine": "苏菜名馔",
    "difficulty": "高级",
    "timeCost": "30分钟",
    "summary": "形如松鼠，外脆里嫩。热腾腾的糖醋红汁浇在炸鱼上发出吱吱欢叫。",
    "ingredients": {
      "main": [
        "新鲜鳜鱼或草鱼 1条（去骨打麦穗花刀）",
        "熟松子仁 20g"
      ],
      "sub": [
        "干淀粉 100g",
        "熟豌豆 10粒",
        "虾仁 适量"
      ],
      "seasoning": [
        "番茄酱 4勺",
        "白糖 3勺",
        "米醋 2勺",
        "清水 半碗",
        "水淀粉 适量"
      ]
    },
    "tips": "麦穗花刀深至鱼皮但不切断，拍匀干淀粉复炸至金黄酥硬。",
    "steps": [
      "1. 鳜鱼去骨留尾，鱼肉改麦穗花刀，加料酒姜汁腌制；",
      "2. 鱼肉抖散均匀拍满干淀粉，提起抖去多余余粉；",
      "3. 七成油温下锅炸定型，复炸至金黄酥脆装盘呈松鼠状；",
      "4. 锅中熬稠番茄酱糖醋汁，加豌豆松子仁，趁热浇淋在鱼身上。"
    ]
  },
  {
    "id": "cook_22",
    "name": "麻婆豆腐",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "中级",
    "timeCost": "20分钟",
    "summary": "麻辣烫香酥嫩鲜活。豆腐软嫩如凝脂，牛肉末酥香化渣，花椒麻香扑鼻。",
    "ingredients": {
      "main": [
        "嫩豆腐 400g（切2cm方块）",
        "牛肉末 80g"
      ],
      "sub": [
        "郫县豆瓣酱 2勺",
        "豆豉 1勺",
        "蒜末 3瓣",
        "青蒜苗 2根"
      ],
      "seasoning": [
        "汉源花椒粉 1大勺",
        "辣椒粉 1勺",
        "生抽 1勺",
        "水淀粉 适量"
      ]
    },
    "tips": "豆腐盐水煮沸保温；三次勾芡让红亮汤汁紧紧附着在豆腐表面。",
    "steps": [
      "1. 豆腐切块加盐水煮沸保温；",
      "2. 牛肉末小火煸炒至酥香干脆出油；",
      "3. 炒香豆瓣酱豆豉出红油，加蒜末辣椒粉高汤煮沸；",
      "4. 捞入豆腐小火煨3分钟，分三次淋入水淀粉推匀；",
      "5. 撒青蒜段出锅，表面厚厚撒一层花椒粉。"
    ]
  },
  {
    "id": "cook_23",
    "name": "地三鲜",
    "category": "经典家常",
    "cuisine": "东北菜",
    "difficulty": "初级",
    "timeCost": "20分钟",
    "summary": "土豆粉糯焦香、茄子软嫩多汁、青椒脆爽开胃，咸鲜浓郁下饭圣品。",
    "ingredients": {
      "main": [
        "圆茄子 1个",
        "土豆 1个",
        "青椒 1个"
      ],
      "sub": [
        "大蒜 4瓣（剁碎）"
      ],
      "seasoning": [
        "生抽 2勺",
        "老抽 半勺",
        "蚝油 1勺",
        "白糖 1勺",
        "水淀粉 2勺",
        "水 半碗"
      ]
    },
    "tips": "茄子裹一层薄干淀粉大火炸，吸油少且外酥里嫩；生熟蒜结合香气倍增。",
    "steps": [
      "1. 土豆炸金黄绵软捞出；茄子拍干粉大火快炸金黄；青椒过油5秒；",
      "2. 调好生抽老抽蚝油糖淀粉碗汁；",
      "3. 锅留底油爆香大半蒜末，倒入碗汁煮稠大泡；",
      "4. 倒入炸好的三鲜翻匀裹汁，出锅前撒生蒜末翻匀。"
    ]
  },
  {
    "id": "cook_24",
    "name": "手撕包菜",
    "category": "经典家常",
    "cuisine": "湘菜快手",
    "difficulty": "初级",
    "timeCost": "8分钟",
    "summary": "大火爆炒出锅气。包菜爽脆焦香，酸辣开胃，油脂香气扑鼻。",
    "ingredients": {
      "main": [
        "圆白菜/卷心菜 半个（手撕大片去硬梗）",
        "五花肉片 50g（煸油增香）"
      ],
      "sub": [
        "大蒜 3瓣（切片）",
        "干辣椒 8个（剪段）",
        "花椒 10粒"
      ],
      "seasoning": [
        "生抽 2勺",
        "香醋 1勺（沿锅边烹入）",
        "蚝油 1勺",
        "白糖 半勺",
        "精盐 适量"
      ]
    },
    "tips": "包菜一定要用手撕且彻底沥干水分；全程最大火快炒保持爽脆口感。",
    "steps": [
      "1. 包菜手撕大片洗净彻底甩干水分；",
      "2. 锅中少油煸炒五花肉片出油，下蒜片干辣椒花椒炒香；",
      "3. 倒入包菜大火快速爆炒至稍稍变软微焦（约1分钟）；",
      "4. 沿锅边淋入香醋、生抽、蚝油、糖和盐，大火颠翻5秒立即出锅。"
    ]
  },
  {
    "id": "cook_25",
    "name": "干煸豆角",
    "category": "经典家常",
    "cuisine": "川菜",
    "difficulty": "初级",
    "timeCost": "15分钟",
    "summary": "豆角表皮微皱起虎皮，焦香干爽，肉末碎米芽菜咸鲜微辣下饭。",
    "ingredients": {
      "main": [
        "四季豆/扁豆 300g（摘段洗净擦干）",
        "猪肉末 50g"
      ],
      "sub": [
        "四川碎米芽菜或橄榄菜 2勺",
        "干辣椒 8个",
        "花椒 1勺",
        "蒜末姜末 适量"
      ],
      "seasoning": [
        "生抽 1勺",
        "料酒 1勺",
        "白糖 半勺",
        "精盐 少许"
      ]
    },
    "tips": "豆角擦干水分中火慢煸或炸至表皮起虎皮褶皱并确保熟透。",
    "steps": [
      "1. 豆角摘段擦干水分，入油锅中火炸至表皮褶皱变软捞出控油；",
      "2. 锅留底油煸炒肉末至酥香出油；",
      "3. 下干辣椒花椒姜蒜末与芽菜炒出香味；",
      "4. 倒入煸好的豆角大火翻炒，调入生抽白糖少许盐颠翻均匀出锅。"
    ]
  },
  {
    "id": "cook_26",
    "name": "提拉米苏 (Tiramisu)",
    "category": "甜点烘焙",
    "cuisine": "意式经典",
    "difficulty": "中级",
    "timeCost": "30分钟",
    "summary": "浸润浓缩咖啡与利口酒的手指饼干，搭配轻盈丝滑的马斯卡彭芝士慕斯，可可粉苦甜平衡。",
    "ingredients": {
      "main": [
        "马斯卡彭芝士 250g",
        "动物淡奶油 150ml",
        "手指饼干 1包"
      ],
      "sub": [
        "蛋黄 2个",
        "细砂糖 40g",
        "浓缩咖啡 80ml",
        "朗姆酒 15ml"
      ],
      "seasoning": [
        "无糖纯可可粉 适量"
      ]
    },
    "tips": "手指饼干快速两面各蘸1秒即可防过烂；冷藏4小时以上风味融合最佳。",
    "steps": [
      "1. 浓缩咖啡加朗姆酒调匀；",
      "2. 蛋黄加糖隔热水打发浓稠发白；",
      "3. 混合软化的马斯卡彭芝士与打发淡奶油成慕斯糊；",
      "4. 手指饼干蘸咖啡酒铺底，抹慕斯糊，重复一层；",
      "5. 密封冷藏4小时，食用前厚厚筛满纯可可粉。"
    ]
  },
  {
    "id": "cook_27",
    "name": "焦糖法式布丁",
    "category": "甜点烘焙",
    "cuisine": "法式甜品",
    "difficulty": "初级",
    "timeCost": "40分钟",
    "summary": "丝滑细腻如绸缎的炖蛋布丁，表层是薄脆香甜的现烤焦糖脆壳。",
    "ingredients": {
      "main": [
        "纯牛奶 200ml",
        "动物淡奶油 100ml",
        "蛋黄 3个"
      ],
      "sub": [
        "细砂糖 25g",
        "香草精 3滴"
      ],
      "seasoning": [
        "细砂糖 适量（表面喷枪烤焦糖）"
      ]
    },
    "tips": "布丁液过筛3遍滤去气泡；水浴法低温150度慢烤保证内部无气孔孔洞。",
    "steps": [
      "1. 牛奶淡奶油加糖温热溶糖；",
      "2. 蛋黄打散，缓缓冲入温奶液拌匀；",
      "3. 过筛3次倒入烤碗，烤盘注温水水浴；",
      "4. 150度烤30分钟冷藏2小时；表面撒糖用喷枪烤出金黄焦脆糖壳。"
    ]
  },
  {
    "id": "cook_28",
    "name": "杨枝甘露",
    "category": "清心香饮",
    "cuisine": "港式甜品",
    "difficulty": "初级",
    "timeCost": "20分钟",
    "summary": "浓郁清甜的芒果蓉与椰浆交织，搭配晶莹Q弹西米与爆汁红西柚果粒，酸甜冰爽。",
    "ingredients": {
      "main": [
        "新鲜芒果 2个（约500g）",
        "红心西柚 2瓣",
        "小西米 50g"
      ],
      "sub": [
        "浓椰浆 100ml",
        "全脂纯牛奶 100ml"
      ],
      "seasoning": [
        "炼乳 20g",
        "冰块 适量"
      ]
    },
    "tips": "西米煮至留微小小白心关火焖透明最弹牙；大半芒果打泥，小半切丁作顶料。",
    "steps": [
      "1. 水开煮西米10分钟焖15分钟过冰水沥干；",
      "2. 取2/3芒果加椰浆牛奶炼乳打成细腻芒果昔；",
      "3. 杯底铺西米，倒入芒果昔；",
      "4. 表面铺满新鲜芒果丁与西柚果粒冰镇饮用。"
    ]
  },
  {
    "id": "cook_29",
    "name": "自制黑糖珍珠奶茶",
    "category": "清心香饮",
    "cuisine": "人气饮品",
    "difficulty": "初级",
    "timeCost": "25分钟",
    "summary": "正山小种红茶原叶现煮，拼配醇厚鲜牛乳，挂壁黑糖虎纹与Q弹软糯木薯珍珠。",
    "ingredients": {
      "main": [
        "红茶茶叶 12g",
        "纯牛奶 400ml",
        "黑糖珍珠 80g"
      ],
      "sub": [
        "古法老黑糖 40g",
        "清水 200ml"
      ],
      "seasoning": [
        "淡奶油 30ml（增厚乳香）"
      ]
    },
    "tips": "红茶叶小火干炒1分钟出焦香茶气再加水煮，茶香释放最彻底！",
    "steps": [
      "1. 煮熟珍珠过温水，加黑糖小火熬至浓稠拉丝；",
      "2. 茶叶干炒出香加水煮沸3分钟，加牛奶微火温热滤茶；",
      "3. 杯壁旋转涂抹热黑糖珍珠形成虎纹，冲入醇香奶茶享用。"
    ]
  }
];

window.mcpCookbookEngine = {
    database: COMPREHENSIVE_COOKBOOK_DB,
    cachedOnlineDishes: {},

    // 1. 伴侣点菜 / 推荐
    recommendDish(characterName = "", contextHint = "") {
      const db = [...COMPREHENSIVE_COOKBOOK_DB, ...Object.values(this.cachedOnlineDishes)];
      const char = (characterName || "").trim();
      const hint = (contextHint || "").trim().toLowerCase();

      let matched = db.filter(d => {
        if (!hint) return true;
        const text = (d.name + d.category + (d.cuisine || "") + (d.summary || "") + (d.tips || "") + JSON.stringify(d.ingredients)).toLowerCase();
        return hint.split(/\s+/).some(kw => text.includes(kw));
      });

      if (matched.length === 0) matched = db;
      const candidate = matched[Math.floor(Math.random() * matched.length)];

      const praiseTemplates = [
        `今日若能与楼主共尝这道《${candidate.name}》，浓香四溢，足慰劳顿。`,
        `听闻楼主今日想下厨？不若做一道《${candidate.name}》，${candidate.summary || "香气诱人，极易上手"}。`,
        `今日时令正好，这道《${candidate.name}》最合时宜，快看看用料备齐未曾？`,
        `我瞧着这道《${candidate.name}》甚好，酸甜咸鲜恰到好处，楼主可愿与我同品？`
      ];

      return {
        dish: candidate,
        dialogue: praiseTemplates[Math.floor(Math.random() * praiseTemplates.length)]
      };
    },

    // 2. 本地快速检索
    searchDishes(query, categoryFilter = "") {
      const q = (query || "").trim().toLowerCase();
      const cat = (categoryFilter || "").trim();
      const allDb = [...COMPREHENSIVE_COOKBOOK_DB, ...Object.values(this.cachedOnlineDishes)];

      return allDb.filter(d => {
        if (cat && cat !== "全部" && d.category !== cat && d.cuisine !== cat) return false;
        if (!q) return true;

        const allIngredients = [
          ...(d.ingredients?.main || []),
          ...(d.ingredients?.sub || []),
          ...(d.ingredients?.seasoning || [])
        ].join(" ");

        const fullText = (d.name + " " + (d.category || "") + " " + (d.cuisine || "") + " " + (d.summary || "") + " " + allIngredients + " " + (d.tips || "")).toLowerCase();
        const keywords = q.split(/\s+/);
        return keywords.every(kw => fullText.includes(kw));
      });
    },

    // 3. 中华美食专家食谱引擎 (纯本地智能生成精确克重、保姆级步骤、防翻车小贴士，0网络请求，0报错)
    async fetchOnlineRecipe(dishName) {
      const name = (dishName || "").trim();
      if (!name) return null;
      if (this.cachedOnlineDishes[name]) return this.cachedOnlineDishes[name];

      // 检查库中是否已有
      const existing = COMPREHENSIVE_COOKBOOK_DB.find(d => d.name === name);
      if (existing) return existing;

      // 智能食材与风味技法识别
      let category = "经典家常";
      let cuisine = "中华风味";
      let timeCost = "25分钟";
      let difficulty = "初级";
      let summary = `以${name}为灵感的经典家常佳肴，咸鲜适口，香气扑鼻，老少皆宜。`;
      let mainIng = [`主食材（${name}所需肉/菜） 400g（改刀洗净切块或切片）`];
      let subIng = ["大葱 1根（切斜段）", "生姜 3片", "大蒜 3瓣（拍扁切碎）", "青红椒各半个（配色点缀）"];
      let seasoning = ["生抽 2勺（约20ml）", "蚝油 1勺（约15ml）", "料酒 1勺（去腥提香）", "白糖 半勺（提鲜中和）", "精盐 适量", "食用油 20ml"];
      let tips = "烹饪时注意大火快炒锁住水分，出锅前勾少许薄芡使汤汁均匀包裹食材。";
      let steps = [
        `1. 将制作《${name}》所需的新鲜食材洗净，改刀切成均匀小块或适口厚片；`,
        "2. 荤类食材冷水下锅加姜片、料酒焯水2分钟捞出沥干；素菜类洗净沥干水分备用；",
        "3. 热锅倒入食用油，油热下葱姜蒜末小火煸炒出浓郁辛香味；",
        `4. 下入主要食材转大火快速翻炒2-3分钟至食材变色断生；`,
        "5. 沿锅边淋入生抽、蚝油、料酒，加入少许白糖和食盐调味，大火翻炒上色出香；",
        "6. 加入小半碗温开水，转中小火焖煨3-5分钟使内部充分熟透入味；",
        "7. 淋入少许水淀粉大火翻炒收汁，出锅前撒上葱花或熟白芝麻，即可趁热盛出享用。"
      ];

      // 风味分支特征推演
      if (name.includes("汤") || name.includes("煲") || name.includes("炖")) {
        category = "温润靓汤";
        cuisine = "养生煲炖";
        timeCost = "45-60分钟";
        difficulty = "初级";
        summary = `汤清味醇，温润滋补。慢火慢煨使食材精华融入高汤中，鲜香甘美。`;
        seasoning = ["生姜 4片", "小葱 2根（挽结）", "料酒 1勺", "精盐 1小勺", "白胡椒粉 少许", "枸杞 10粒"];
        tips = "煲汤中途切忌加冷水，一次性加足沸水；出锅前5分钟再放盐，肉质更鲜嫩。";
        steps = [
          `1. 食材洗净斩大块，冷水下锅加姜片与料酒，大火煮沸焯水3分钟撇净浮沫后温水洗净；`,
          "2. 将焯好水的食材放入砂锅中，加入足够量的开水，放入葱结与生姜片；",
          "3. 大火烧开后盖上砂锅盖，转微小火慢炖40-50分钟，直至肉质软烂汤色醇厚；",
          "4. 拣去葱结，加入配菜与枸杞继续小火炖煮10分钟；",
          "5. 出锅前调入适量食盐与少许白胡椒粉，撒上翠绿葱花即可温热饮用。"
        ];
      } else if (name.includes("甜品") || name.includes("饮") || name.includes("奶") || name.includes("茶") || name.includes("布丁") || name.includes("露")) {
        category = "清心甜品";
        cuisine = "港式/西式烘焙";
        timeCost = "15-20分钟";
        summary = `清甜丝滑，奶香与果香交融，冰爽解腻，颜值与口感俱佳。`;
        mainIng = [`${name}主料（鲜果/牛奶/茶底） 适量`];
        subIng = ["纯牛奶或厚椰乳 200ml", "细砂糖或炼乳 20g", "冰块 适量"];
        seasoning = ["香草精 2滴（可选）", "薄荷叶 1片（装饰点缀）"];
        tips = "控制好糖度与冷藏温度，冰镇后风味与层次感倍增。";
        steps = [
          `1. 准备好新鲜主食材，清洗并切成适口小丁备用；`,
          "2. 将液体基底（牛奶、椰乳或茶汤）调入适量细砂糖搅拌融化；",
          "3. 杯中加入适量冰块与打底料，缓缓冲入调制好的奶茶/果汁液体；",
          "4. 顶部整齐铺上新鲜果粒或甜点顶料，点缀薄荷叶即可享用。"
        ];
      } else if (name.includes("水煮") || name.includes("麻辣") || name.includes("干锅") || name.includes("毛血旺")) {
        category = "经典家常";
        cuisine = "川湘麻辣";
        timeCost = "25分钟";
        difficulty = "中级";
        summary = `红汤油亮，麻辣鲜香。热油淋下激发浓郁蒜香与刀口辣椒香气，开胃过瘾。`;
        subIng = ["黄豆芽 150g", "凤尾莴笋 100g", "干红辣椒 15个（剪段）", "花椒粒 1大勺", "大蒜 5瓣（剁蒜末）"];
        seasoning = ["郫县豆瓣酱 2勺", "生抽 1勺", "料酒 1勺", "花椒粉 1勺", "水淀粉 适量", "菜籽油 40ml"];
        tips = "牛肉/肉片逆纹切薄片抓蛋清淀粉上浆；最后泼入八成热油是麻辣扑鼻的核心！";
        steps = [
          `1. 主食材改刀切薄片，加入生抽、料酒、蛋清与干淀粉抓匀上浆，最后封油腌制10分钟；`,
          "2. 锅中热油下豆芽与蔬菜大火炒至断生，捞出铺入大深碗底部垫底；",
          "3. 锅中下底油炒香郫县豆瓣酱出红油，加蒜末姜片炒香，倒入两碗水烧沸调味；",
          "4. 保持微沸状态，将肉片逐片抖散下锅，肉片变色熟透（约40秒）连汤倒入垫菜碗中；",
          "5. 碗顶铺上蒜末、干辣椒段、花椒粉和葱花；",
          "6. 另起锅烧热3大勺食用油至冒青烟，迅速浇淋在蒜末辣椒上激发出诱人麻辣香气。"
        ];
      }

      const generatedRecipe = {
        id: "expert_" + Date.now(),
        name: name,
        category: category,
        cuisine: cuisine,
        difficulty: difficulty,
        timeCost: timeCost,
        summary: summary,
        ingredients: {
          main: mainIng,
          sub: subIng,
          seasoning: seasoning
        },
        tips: tips,
        steps: steps
      };

      this.cachedOnlineDishes[name] = generatedRecipe;
      return generatedRecipe;
    }
  };

  window.mcpCuisineEngine = window.mcpCookbookEngine;
  window.mcpCookbookEngine.searchDish = function(kw) {
    return window.mcpCookbookEngine.searchDishes(kw);
  };
})();

