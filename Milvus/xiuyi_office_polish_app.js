/**
 * Milvus/xiuyi_office_polish_app.js
 * 绣衣楼 · 部门审批短词库优化 + 工资单毛绒果冻阶梯升级 + 俸禄直发传讯 独立模块化引擎（P0）
 * - 零数据库版本升级，极简埋点接入 app.min.js
 */
(function (global) {
  "use strict";

  // ==========================================
  // 1. 部门审批 AI 短词库引擎（还原经典版一句冷幽默）
  // ==========================================
  const APPROVAL_CACHE_KEY = "xiuyi_approval_concise_pool_v1";
  const APPROVAL_STYLE_KEY = "xiuyi_approval_style_v1";
  const SALARY_LEDGER_KEY = "xiuyi_salary_ledger_v1";
  const LEDGER_EVENT = "milvus-salary-ledger-updated";

  const APPROVAL_STYLES = [
    { id: "mix", label: "全混搭（推荐）", hint: "正经谍报公文、离谱摸鱼借口、暴躁催账与市井琐事全部混合，反差感拉满" },
    { id: "funny", label: "纯离谱", hint: "冷幽默、反差萌、密探离谱摸鱼脑洞" },
    { id: "formal", label: "纯正经", hint: "克制典雅古风、正经谍报军情与楼内政务" },
    { id: "urgent", label: "暴躁催账", hint: "经费告急、傅融血压飙升、急件催款与预算拉锯" }
  ];

  // 无放回洗牌抽卡队列（彻底杜绝同一审批单或连续几单出现重复词）
  const _deckQueues = {};
  function pickUniqueFromPool(pool, count, deckKey) {
    const unique = Array.from(new Set((Array.isArray(pool) ? pool : []).filter(Boolean)));
    if (unique.length === 0) return [];
    const key = deckKey || "default";
    if (!Array.isArray(_deckQueues[key]) || _deckQueues[key].length < count) {
      const shuffled = [...unique];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      _deckQueues[key] = shuffled;
    }
    const picked = [];
    while (picked.length < count && _deckQueues[key].length > 0) {
      picked.push(_deckQueues[key].pop());
    }
    return picked;
  }

  function getApprovalStyle() {
    try {
      return localStorage.getItem(APPROVAL_STYLE_KEY) || "mix";
    } catch (e) {
      return "mix";
    }
  }

  function setApprovalStyle(styleId) {
    try {
      localStorage.setItem(APPROVAL_STYLE_KEY, styleId || "funny");
    } catch (e) {}
  }

  const salaryLedgerStore = {
    getAll: () => {
      try {
        const list = JSON.parse(localStorage.getItem(SALARY_LEDGER_KEY) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    },
    add: (entry) => {
      const list = salaryLedgerStore.getAll();
      const rec = { id: `sl_${Date.now()}`, issuedAt: Date.now(), ...entry };
      const next = [rec, ...list].slice(0, 60);
      try {
        localStorage.setItem(SALARY_LEDGER_KEY, JSON.stringify(next));
        global.dispatchEvent(new CustomEvent(LEDGER_EVENT));
      } catch (e) {}
      return rec;
    },
    clear: () => {
      try {
        localStorage.removeItem(SALARY_LEDGER_KEY);
        global.dispatchEvent(new CustomEvent(LEDGER_EVENT));
      } catch (e) {}
    }
  };

  const FALLBACK_CONCISE_POOL = {
    leaveEvents: [
      "被自己帅晕", "猫踩翻砚台", "吃撑走不动", "宿醉头疼", "迷路回不来",
      "旧疾复发", "军中突发急事", "预约医师复诊", "被窝封印起不来", "睫毛太长压眼皮",
      "帮邻居抓鹅", "家中屋顶漏雨", "昨夜梦游摔伤", "老友远道来访", "算账算到眼花",
      "感染风寒高热不退", "昨夜值守受凉落枕", "奉命护送家眷归乡", "城外田庄秋收缺人",
      "族中长辈大寿赴宴", "暗伤复发需静养换药", "昨日夜巡扭伤脚踝", "赴洛阳故友之约",
      "进山采药辨识草木", "昨夜数钱数到手抽筋", "猫主子压住衣摆不让出门", "算账算到灵魂出窍",
      "喝茶呛着需卧床平复", "起床太猛看见太奶招手", "梦见副官扣月俸吓病了",
      "走路左脚绊右脚摔进花坛", "昨日赌输把官服当了", "帮隔壁阿婆满城追大鹅",
      "头发打结解了一上午", "照镜子陷入自我欣赏无法自拔", "误食未熟梅子酸到闭麦",
      "蹲坑太久双腿失去知觉", "听八卦听得心神不宁", "与楼里大黄狗吵架落败",
      "昨夜失眠数羊数到天亮", "刚洗的衣裳被鸟精准命中", "算命先生说今日不宜上班",
      "练习轻功一头撞上房梁", "被楼里新来的厨子毒倒"
    ],
    fundActivities: [
      "广陵厨艺赛", "楼内猜谜会", "冬日涮锅局", "密探演武赛", "中秋博饼会",
      "绣衣诗文雅集", "年度团建踏青", "地宫寻宝演练", "广陵风物展", "端午包粽赛",
      "冬季御寒茶会", "密探吐槽大会", "汉末谍报研讨会", "广陵丝绸商贸展",
      "各州暗桩述职大会", "冬季御寒物资募捐", "密探轻功比武大会", "绣衣楼书画品鉴会",
      "江东水师联谊茶话会", "边境驿站修缮庆典", "药理毒术交流沙龙", "广陵夜市花灯巡游",
      "绣衣楼首届吐槽大会", "密探摸鱼技巧大赛", "谁是楼里最能吃争霸赛", "副官夸夸主题晚会",
      "熬夜黑眼圈选美大赛", "广陵火锅涮肉狂欢节", "绣衣楼匿名八卦茶会", "密探变装潜行剧本杀",
      "抢救发际线养生座谈会", "广陵第一麻将雀神赛", "讨薪维权模拟辩论赛",
      "密探厨艺翻车品鉴会", "绣衣楼好声音歌咏赛", "论如何从副官手里抠钱峰会"
    ],
    outingReasons: [
      "暗访城南茶楼", "追讨陈年欠银", "帮小猫找主人", "核查粮草旧账", "买街口刚出炉烧饼",
      "下乡安抚流民", "传递机密军令", "查验工坊器械", "拜访江东故交", "桃花开怕误花期",
      "腰带断了怕失礼", "寻找遗失密函", "核对商铺月账", "去码头接应暗线", "替副官买润喉糖",
      "核查当地粮仓实数", "秘密接应潜伏暗线", "追查私盐走私旧案", "押运机密密函卷宗",
      "巡视沿途驿站马匹", "暗访世家大族动向", "采购稀有解毒药材", "核验新造军械账目",
      "查探流民安置实情", "联络当地商帮掌柜", "听说当地烧鸡全天下第一", "追讨三年前借出的十文钱",
      "帮楼主去求一支上上签", "去找一只会算账的橘猫", "听说那边茶楼说书特精彩",
      "逃避副官本月的绩效面谈", "替楼里姐妹代购胭脂水粉", "听说当地温泉治腰酸背痛",
      "去围观隔壁州府的热闹八卦", "实地考察哪种瓜子最好嗑", "寻找传说中的绝版话本",
      "顺路去看看老相好过得好不好", "听说那边风水上佳去转转运", "帮迷路的信鸽找回家路",
      "躲避楼内大扫除"
    ],
    expenseItems: [
      "夜行炭火", "修补靴底", "御寒姜汤", "灯油蜡烛", "打磨短刃",
      "驿站食宿", "马匹草料", "密信封蜡", "茶水点心", "雨具蓑衣",
      "伪装衣袍", "药膏纱布", "修补车轴", "笔墨宣纸", "绳索抓钩",
      "密信火漆", "易容脂粉", "驿站马料", "过桥渡船费", "暗语密码本",
      "防潮油布", "探路竹杖", "急救金疮药", "夜间更夫打点", "修补车轮",
      "街头糖炒栗子", "茶楼瓜子花生", "精神损失茶水费", "熬夜护眼菊花茶", "喂流浪猫小鱼干",
      "副官润喉胖大海", "潜伏伪装糖葫芦", "算命香火钱", "被狗追撕破的裤脚", "躲雨蹭的胡辣汤",
      "情绪价值桂花糕", "话本租借押金", "防晒油纸伞", "夜间壮胆小烧酒"
    ],
    purchaseItems: [
      "青瓷茶盏", "防潮竹席", "加厚锦褥", "防风油灯", "新毛笔",
      "上等松烟墨", "防虫樟木箱", "厚实炭盆", "便携干粮", "屏风帘幔",
      "磨刀青石", "急救金疮药", "铜锁铁链", "算盘账簿", "暖手铜炉",
      "宣城澄心堂纸", "防虫樟木书箱", "铜制算盘", "密室防风油灯", "加厚棉帘",
      "便携压缩干粮", "精钢锁头", "记账硬壳册", "午休专用懒人软垫", "隔音耳塞（防副官念经）",
      "全自动摇摇椅", "巨型毛绒暖手抱枕", "防秃头生发姜汁", "绣衣楼定制保温茶壶",
      "超大号摸鱼遮挡屏风", "进口猫薄荷（贿赂楼猫）", "铜制小火锅（值夜宵夜用）",
      "豪华实木麻将桌", "闪亮亮记功小红花印章", "静音软底绣花鞋（溜班专用）"
    ],
    trainingEffects: [
      "查账提速三成", "潜行悄无声息", "摸鱼不被发现", "暗杀失手减半", "公文一字不差",
      "易容真假难辨", "夜行脚程翻倍", "审讯一针见血", "反侦察滴水不漏", "省钱意识大涨",
      "潜行步法悄无声息", "易容伪装真假难辨", "密文破译提速五成", "审讯套话一针见血",
      "算账对数零差错", "夜行脚程日行千里", "飞鸽传书精准投递", "毒理辨识百毒不侵",
      "摸鱼姿势优雅不被发现", "被副官骂时左耳进右耳出", "一秒精准识别谁在画大饼",
      "报销单写得滴水不漏", "熬夜三天依然面色红润", "抢食堂红烧肉手速翻倍",
      "甩锅功力登峰造极", "听墙角耳力提升三倍", "装病请假演技逼真动人",
      "从副官口袋抠出经费概率+10%"
    ]
  };

  function hashShort(str) {
    let h = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function cleanPhrase(raw, maxLen) {
    let s = String(raw || "")
      .replace(/^["'「『【]+|["'」』】]+$/g, "")
      .replace(/[。！!？?；;，,]+$/g, "")
      .replace(/^(因为|因|为了|为|申请|想要|需要|由于)\s*/, "")
      .replace(/(发起请假|请假申请|申请经费|报销费用|采购物资)$/g, "")
      .trim();
    if (!s) return "";
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function sanitizeApprovalPool(parsed) {
    const limits = {
      leaveEvents: 12,
      fundActivities: 8,
      outingReasons: 12,
      expenseItems: 6,
      purchaseItems: 6,
      trainingEffects: 10
    };
    const out = {};
    Object.keys(limits).forEach((key) => {
      const arr = Array.isArray(parsed?.[key]) ? parsed[key] : [];
      const cleaned = arr
        .map((item) => cleanPhrase(item, limits[key]))
        .filter((item) => item.length >= 2);
      // 将 AI 生成词条与精选本地混搭词库合并去重，彻底扩大词库体量（每类 20~28 条不重样）
      const merged = Array.from(new Set([...cleaned, ...(FALLBACK_CONCISE_POOL[key] || [])]));
      out[key] = merged;
    });
    return out;
  }

  async function generateConciseApprovalPool(options = {}) {
    if (typeof global.sendToLLM !== "function") {
      throw new Error("未配置 AI 接口");
    }
    const styleId = options.style || getApprovalStyle();
    const styleMeta = APPROVAL_STYLES.find((s) => s.id === styleId) || APPROVAL_STYLES[0];
    let worldBookContext = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        worldBookContext = String((await global.getWorldBookContext()) || "").trim();
      }
    } catch (e) {}

    const wbHash = hashShort(`${styleId}_${worldBookContext.slice(0, 1200)}`);
    if (!options.forceRefresh) {
      try {
        const cached = JSON.parse(localStorage.getItem(APPROVAL_CACHE_KEY) || "null");
        if (cached && cached.wbHash === wbHash && Date.now() - (cached.ts || 0) < 24 * 3600 * 1000 && cached.pool) {
          return cached.pool;
        }
      } catch (e) {}
    }

    const prompt = `你是《代号鸢》绣衣楼的日常事务词库策划，要为“一句话随机组合审批单”提供极简短语词库。
【当前风格】：${styleMeta.label}（${styleMeta.hint}）
【世界书参考】：
${worldBookContext ? worldBookContext.slice(0, 1000) : "东汉末年乱世，广陵王掌管绣衣楼，傅融把控公账，密探们日常爱摸鱼又爱提交离谱审批。"}

【极其严格的字数与词性规范——违反作废】
所有词条将会直接拼进固定句式（如：“傅融因【请假短语】发起请假(3)天申请。”），因此严禁写长句子、严禁带角色名、严禁带“因为/申请/请假”、严禁带句号！
请输出严格 JSON（每类必须给足 12 条，正经公文、离谱摸鱼、市井琐事与经费吐槽交错混搭，彼此绝不重复）：
{
  "leaveEvents": ["12条 4~10字无主语短语，如：被自己帅晕 / 军中突发急事 / 猫踩翻砚台 / 吃撑走不动"],
  "fundActivities": ["12条 4~7字活动名词，如：广陵厨艺赛 / 边关慰问礼 / 冬日涮锅局"],
  "outingReasons": ["12条 4~10字动宾短语，如：暗访城南茶楼 / 追讨陈年欠银 / 帮小猫找妈"],
  "expenseItems": ["12条 2~5字名词，如：夜行炭火 / 修补靴底 / 密信封蜡"],
  "purchaseItems": ["12条 2~5字实物名词，如：青瓷茶盏 / 加厚锦褥 / 算盘账簿"],
  "trainingEffects": ["12条 4~8字短语，如：查账提速三成 / 摸鱼不被发现 / 审讯一针见血"]
}`;

    const raw = await new Promise((resolve, reject) => {
      global.sendToLLM(
        [
          { role: "system", content: "你只输出严格合法的 JSON 对象，不输出任何解释或 Markdown 代码块。每个词条必须是极简短语，绝不能写成完整句子。" },
          { role: "user", content: prompt }
        ],
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "生成失败"))
      );
    });

    const cleanedStr = String(raw || "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const first = cleanedStr.indexOf("{");
    const last = cleanedStr.lastIndexOf("}");
    if (first === -1 || last === -1) throw new Error("AI 返回格式异常");
    const parsed = JSON.parse(cleanedStr.slice(first, last + 1));
    const pool = sanitizeApprovalPool(parsed);

    try {
      localStorage.setItem(APPROVAL_CACHE_KEY, JSON.stringify({ wbHash, ts: Date.now(), pool }));
    } catch (e) {}
    return pool;
  }

  // ==========================================
  // 2. 俸禄直发传讯服务 + 传讯俸禄条气泡 + LLM 协议
  // ==========================================
  async function loadChatCharacters() {
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        const list = await global.chatCharacterStore.getAll();
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {}
    try {
      const ls = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      if (Array.isArray(ls)) return ls;
    } catch (e) {}
    return [];
  }

  async function sendSalaryPayoutToChat(targetChar, { amount, layers, maxCombo, note, originalName }) {
    if (!targetChar || targetChar.id === undefined) throw new Error("未选择有效的传讯角色");
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const amt = Math.max(0, Number(amount) || 0);
    const msg = {
      id: now,
      type: "salary_payout_card",
      isMe: true,
      sender: "me",
      timestamp: now,
      time: timeStr,
      text: `[绣衣楼俸禄条] 已向 ${targetChar.name} 发放俸禄 ${amt} 钱`,
      content: {
        amount: amt,
        layers: Number(layers) || 0,
        maxCombo: Number(maxCombo) || 0,
        recipientName: targetChar.name,
        originalName: originalName || targetChar.name,
        note: String(note || "").trim() || "本月辛苦，拿去买点喜欢的。",
        issuedAt: now
      }
    };

    let saved = false;
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
        await global.chatHistoryStore.saveMessage(targetChar.id, msg);
        saved = true;
      }
    } catch (e) {}
    if (!saved) {
      try {
        const key = "t8_chat_history_" + targetChar.id;
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push(msg);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (e) {}
    }

    try {
      const rawList = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      if (Array.isArray(rawList)) {
        const updated = rawList.map((c) =>
          c && String(c.id) === String(targetChar.id)
            ? { ...c, lastMessage: msg.text, lastTime: timeStr, timestamp: now }
            : c
        );
        localStorage.setItem("t8_chat_list", JSON.stringify(updated));
      }
    } catch (e) {}

    salaryLedgerStore.add({
      recipientName: targetChar.name,
      amount: amt,
      layers: Number(layers) || 0,
      maxCombo: Number(maxCombo) || 0,
      note: msg.content.note,
      sentToChat: true
    });

    return msg;
  }

  function formatSalaryPayoutCardForLLM(msg) {
    const c = msg?.content || {};
    const amt = Number(c.amount) || 0;
    const tierHint =
      amt >= 1500
        ? "这是一笔相当丰厚的巨额俸禄/赏银！"
        : amt >= 500
        ? "这是一笔体面宽裕的月俸。"
        : amt > 0
        ? "这笔俸禄略微寒酸/手紧，可以结合你的人设打趣、委屈、调侃或体谅。"
        : "居然是 0 钱（发薪翻车了！），可以结合你的人设吐槽或笑话广陵王手滑。";
    return {
      role: msg.isMe ? "user" : "assistant",
      content: `【绣衣楼俸禄发放单】
用户刚刚在「绣衣楼 → 工资单」为你亲自堆叠果冻金库，向你发放了本月俸禄：
- 实发金额：${amt} 钱
- 堆叠战绩：共堆叠 ${c.layers || 0} 层（最高完美连击 ${c.maxCombo || 0} 次）
- 老板附言：“${c.note || "本月辛苦"}”
（提示：${tierHint} 请完全贴合你的角色性格、与用户的关系，做出生动鲜活的收薪反应！）`
    };
  }

  const SalaryPayoutCardBubble = ({ msg }) => {
    const h = React.createElement;
    const c = msg?.content || {};
    const amt = Number(c.amount) || 0;
    return h(
      "div",
      {
        style: {
          width: "238px",
          maxWidth: "74vw",
          background: "linear-gradient(145deg, #FFF9EE 0%, #FFEED6 100%)",
          border: "1.5px solid #F0CFA2",
          borderRadius: "18px",
          padding: "12px 13px",
          boxShadow: "0 6px 16px rgba(214, 146, 68, 0.16)",
          display: "flex",
          flexDirection: "column",
          gap: "7px",
          textAlign: "left",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        h(
          "span",
          { style: { fontSize: "10.5px", fontWeight: 700, color: "#B56A22", background: "rgba(255,255,255,0.75)", padding: "2px 8px", borderRadius: "999px" } },
          "💰 绣衣楼俸禄条"
        ),
        h("span", { style: { fontSize: "10.5px", color: "#A47E53" } }, `堆叠 ${c.layers || 0} 层`)
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline", gap: "4px", marginTop: "2px" } },
        h("span", { style: { fontSize: "24px", fontWeight: 800, color: "#D6724B", lineHeight: 1 } }, amt),
        h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#9C6D3B" } }, "钱")
      ),
      c.note &&
        h(
          "div",
          { style: { fontSize: "11.5px", color: "#6E5439", background: "rgba(255,255,255,0.68)", borderRadius: "10px", padding: "6px 8px", lineHeight: 1.45 } },
          `“${c.note}”`
        ),
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10.5px", color: "#9E7C56", paddingTop: "3px", borderTop: "1px dashed rgba(196,154,104,0.35)" } },
        h("span", null, `领薪人：${c.recipientName || "名士"}`),
        h("span", { style: { color: "#C87A2B", fontWeight: 700 } }, c.maxCombo > 1 ? `🔥 连击 x${c.maxCombo}` : "已入账 ✓")
      )
    );
  };

  // ==========================================
  // 3. 毛茸茸 × Q 弹果冻阶梯工资单小游戏组件
  // ==========================================
  const JELLY_PLUSH_PALETTES = [
    { name: "抹茶奶冻", top: "#CFE8D9", mid: "#9ECDB5", bottom: "#76AD92", glow: "rgba(158, 205, 181, 0.55)", rim: "rgba(255,255,255,0.78)" },
    { name: "蜜桃布丁", top: "#FCE0D2", mid: "#F3B69D", bottom: "#D98E72", glow: "rgba(243, 182, 157, 0.55)", rim: "rgba(255,255,255,0.78)" },
    { name: "奶油芋泥", top: "#E9E0F7", mid: "#C6B5E8", bottom: "#9D88C7", glow: "rgba(198, 181, 232, 0.55)", rim: "rgba(255,255,255,0.78)" },
    { name: "海盐苏打", top: "#D6ECF8", mid: "#9BC9E5", bottom: "#71A5C7", glow: "rgba(155, 201, 229, 0.55)", rim: "rgba(255,255,255,0.78)" },
    { name: "草莓大福", top: "#FADAE3", mid: "#F2A8BE", bottom: "#D47F9A", glow: "rgba(242, 168, 190, 0.55)", rim: "rgba(255,255,255,0.78)" },
    { name: "焦糖蛋奶", top: "#FCF0CC", mid: "#F2D28B", bottom: "#D6AE5A", glow: "rgba(242, 210, 139, 0.55)", rim: "rgba(255,255,255,0.82)" }
  ];

  function getSkyGradient(level) {
    if (level < 5) return "linear-gradient(180deg, #FFF6EB 0%, #FBE9DC 55%, #F5E1D4 100%)";
    if (level < 10) return "linear-gradient(180deg, #E8F4FC 0%, #F2F7FA 55%, #F9EFE6 100%)";
    if (level < 16) return "linear-gradient(180deg, #F7DCE4 0%, #FBE6D6 58%, #FCEFD9 100%)";
    return "linear-gradient(180deg, #2D3250 0%, #525B84 55%, #9B88A9 100%)";
  }

  const FluffyJellySalaryGame = ({ selectedCharacter, onBackToSelect }) => {
    const h = React.createElement;
    const BASE_WIDTH = 136;
    const BASE_HEIGHT = 42;
    const JUMP_MS = 460;

    const [baseMoney, setBaseMoney] = React.useState(80);
    const [totalMoney, setTotalMoney] = React.useState(0);
    const [combo, setCombo] = React.useState(0);
    const [maxCombo, setMaxCombo] = React.useState(0);
    const [level, setLevel] = React.useState(0);
    const [gameState, setGameState] = React.useState("playing"); // "playing" | "jumping" | "gameover"
    const [showResult, setShowResult] = React.useState(false);
    const [stackedBoxes, setStackedBoxes] = React.useState([]);
    const [movingBox, setMovingBox] = React.useState({
      x: -140,
      direction: 1,
      width: BASE_WIDTH,
      paletteIdx: 1,
      speed: 145
    });
    const [cameraOffset, setCameraOffset] = React.useState(0);
    const [floatingText, setFloatingText] = React.useState(null);
    const [sparkles, setSparkles] = React.useState([]);
    const [landPulseTick, setLandPulseTick] = React.useState(0);

    // 传讯直发状态
    const [chatChars, setChatChars] = React.useState([]);
    const [targetChatId, setTargetChatId] = React.useState("");
    const [payoutNote, setPayoutNote] = React.useState("");
    const [payoutSent, setPayoutSent] = React.useState(false);
    const [sendingPayout, setSendingPayout] = React.useState(false);

    const movingRef = React.useRef(movingBox);
    movingRef.current = movingBox;
    const gameStateRef = React.useRef(gameState);
    gameStateRef.current = gameState;
    const rafRef = React.useRef(null);
    const lastTsRef = React.useRef(0);

    const initGame = React.useCallback(() => {
      const initBase = Math.floor(Math.random() * 50) + 60;
      setBaseMoney(initBase);
      setTotalMoney(0);
      setCombo(0);
      setMaxCombo(0);
      setLevel(0);
      setCameraOffset(0);
      setShowResult(false);
      setPayoutSent(false);
      setPayoutNote("");
      setSparkles([]);
      setStackedBoxes([
        { id: "base", x: 0, width: BASE_WIDTH + 10, paletteIdx: 0, isPerfect: false }
      ]);
      setMovingBox({
        x: -155,
        direction: 1,
        width: BASE_WIDTH,
        paletteIdx: 1,
        speed: 148
      });
      setGameState("playing");
    }, []);

    React.useEffect(() => {
      initGame();
    }, [initGame, selectedCharacter]);

    React.useEffect(() => {
      (async () => {
        const list = await loadChatCharacters();
        setChatChars(list || []);
        const exact = (list || []).find((c) => c && c.name === selectedCharacter);
        if (exact) setTargetChatId(String(exact.id));
        else if (list && list[0]) setTargetChatId(String(list[0].id));
      })();
    }, [selectedCharacter]);

    // 60fps delta-time 物理驱动（兼容 60Hz/120Hz 屏幕）
    React.useEffect(() => {
      lastTsRef.current = performance.now();
      const loop = (ts) => {
        const dt = Math.min(40, Math.max(0, ts - lastTsRef.current)) / 1000;
        lastTsRef.current = ts;
        if (gameStateRef.current === "playing") {
          setMovingBox((prev) => {
            let nx = prev.x + prev.speed * prev.direction * dt;
            let nd = prev.direction;
            if (nx > 148) {
              nx = 148;
              nd = -1;
            } else if (nx < -148) {
              nx = -148;
              nd = 1;
            }
            return { ...prev, x: nx, direction: nd };
          });
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    const handleTap = () => {
      if (gameStateRef.current !== "playing") return;
      const snapX = movingRef.current.x;
      const snapW = movingRef.current.width;
      const snapPalette = movingRef.current.paletteIdx;
      setGameState("jumping");

      setTimeout(() => {
        const diff = Math.abs(snapX);
        const limit = snapW / 2 + 12;
        if (diff > limit) {
          setGameState("gameover");
          setFloatingText({ text: "哎呀滑掉了！", color: "#E06D6D", id: Date.now() });
          setTimeout(() => setShowResult(true), 750);
          return;
        }

        const isPerfect = diff <= snapW * 0.24;
        const nextCombo = isPerfect ? combo + 1 : 0;
        const gained = isPerfect ? baseMoney * 2 : baseMoney;
        setCombo(nextCombo);
        setMaxCombo((m) => Math.max(m, nextCombo));
        setTotalMoney((prev) => prev + gained);
        setFloatingText({
          text: isPerfect ? `✨ 软弹完美 +${gained}` : `+${gained} 钱`,
          color: isPerfect ? "#E59A2B" : "#5A6B5C",
          id: Date.now()
        });

        if (isPerfect) {
          const burst = Array.from({ length: 8 }).map((_, i) => ({
            id: `${Date.now()}_${i}`,
            angle: (i * 45 * Math.PI) / 180,
            dist: 36 + Math.random() * 24,
            emoji: i % 2 === 0 ? "✦" : "✧"
          }));
          setSparkles(burst);
          setTimeout(() => setSparkles([]), 650);
        }

        const nextLevel = level + 1;
        setStackedBoxes((prev) => [
          ...prev,
          { id: Date.now(), x: isPerfect ? 0 : snapX, width: snapW, paletteIdx: snapPalette, isPerfect }
        ]);
        setLandPulseTick((t) => t + 1);
        setCameraOffset((prev) => prev + BASE_HEIGHT);
        setLevel(nextLevel);

        const nextW = nextLevel > 10 ? Math.max(96, BASE_WIDTH * 0.82) : BASE_WIDTH;
        const nextDir = Math.random() > 0.5 ? 1 : -1;
        setMovingBox({
          x: nextDir === 1 ? -155 : 155,
          direction: nextDir,
          width: nextW,
          paletteIdx: (nextLevel + 1) % JELLY_PLUSH_PALETTES.length,
          speed: Math.min(310, 148 + Math.floor(nextLevel / 2) * 18)
        });
        setGameState("playing");
      }, JUMP_MS);
    };

    const handleSendToChat = async () => {
      if (sendingPayout || payoutSent) return;
      const target = chatChars.find((c) => String(c.id) === String(targetChatId));
      if (!target) {
        alert("传讯通讯录中暂无可选角色，请先前往「传讯」添加角色。");
        return;
      }
      setSendingPayout(true);
      try {
        await sendSalaryPayoutToChat(target, {
          amount: totalMoney,
          layers: level,
          maxCombo,
          note: payoutNote,
          originalName: selectedCharacter
        });
        setPayoutSent(true);
      } catch (err) {
        alert("发放失败：" + (err?.message || err));
      } finally {
        setSendingPayout(false);
      }
    };

    const isNight = level >= 16;

    const renderFluffyJellyBlock = (box, idx, isMoving) => {
      const pal = JELLY_PLUSH_PALETTES[box.paletteIdx % JELLY_PLUSH_PALETTES.length];
      const distFromTop = stackedBoxes.length - 1 - idx;
      const animName =
        !isMoving && landPulseTick > 0
          ? distFromTop === 0
            ? "pfJellySquash 520ms cubic-bezier(0.22, 1.4, 0.36, 1)"
            : distFromTop === 1 || distFromTop === 2
            ? `pfJellyRipple 460ms ease-out ${distFromTop * 55}ms`
            : "none"
          : "none";

      return h(
        "div",
        {
          key: isMoving ? "moving" : `${box.id}_${distFromTop <= 2 ? landPulseTick : 0}`,
          style: {
            position: "absolute",
            bottom: `${104 + idx * BASE_HEIGHT}px`,
            left: "50%",
            marginLeft: -box.width / 2 + box.x,
            width: `${box.width}px`,
            height: `${BASE_HEIGHT}px`,
            borderRadius: "18px",
            // 毛绒柔光外晕 + 果冻半透明主体 + 晶莹厚底折射
            background: `linear-gradient(180deg, ${pal.top}F2 0%, ${pal.mid}E8 58%, ${pal.bottom}EE 100%)`,
            border: `2px solid ${pal.rim}`,
            boxShadow: `0 0 0 3px ${pal.glow}, 0 8px 18px ${pal.glow}, inset 0 -6px 10px rgba(0,0,0,0.12), inset 0 6px 10px rgba(255,255,255,0.68)`,
            zIndex: isMoving ? 4 : 2,
            overflow: "hidden",
            animation: animName,
            transformOrigin: "center bottom"
          }
        },
        // 毛茸茸微绒点阵纹理层（纯 GPU 轻量渐变，60fps 无掉帧）
        h("div", {
          style: {
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.28) 1px, transparent 1px)",
            backgroundSize: "7px 7px",
            backgroundPosition: "0 0, 3.5px 3.5px",
            pointerEvents: "none"
          }
        }),
        // 顶部果冻糖霜高光条
        h("div", {
          style: {
            position: "absolute",
            top: "4px",
            left: "12%",
            right: "12%",
            height: "7px",
            borderRadius: "999px",
            background: "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0.2) 100%)",
            pointerEvents: "none"
          }
        }),
        // 完美落点金色微光点缀
        box.isPerfect &&
          !isMoving &&
          h("div", {
            style: {
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              color: "rgba(255,255,255,0.92)",
              fontWeight: 700,
              letterSpacing: "2px",
              pointerEvents: "none"
            }
          }, "✦ ✦")
      );
    };

    return h(
      "div",
      {
        onClick: handleTap,
        style: {
          width: "100%",
          flex: 1,
          minHeight: 0,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: getSkyGradient(level),
          transition: "background 0.9s ease",
          userSelect: "none",
          cursor: "pointer"
        }
      },
      // 柔和漂浮云朵装饰
      h("div", { style: { position: "absolute", top: "18%", left: "8%", width: "76px", height: "26px", borderRadius: "999px", background: isNight ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.68)", filter: "blur(1px)", pointerEvents: "none" } }),
      h("div", { style: { position: "absolute", top: "28%", right: "10%", width: "92px", height: "30px", borderRadius: "999px", background: isNight ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.6)", filter: "blur(1px)", pointerEvents: "none" } }),

      // 顶部计分 HUD
      h(
        "div",
        { style: { position: "absolute", top: "16px", left: "16px", right: "16px", zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "flex-start", pointerEvents: "none" } },
        h(
          "div",
          {
            style: {
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(10px)",
              padding: "9px 15px",
              borderRadius: "20px",
              border: "1.5px solid rgba(255,255,255,0.9)",
              boxShadow: "0 6px 18px rgba(120,100,80,0.1)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }
          },
          h("span", { style: { fontSize: "12px", color: "#7B7F6E" } }, `给 ${selectedCharacter}`),
          h("span", { style: { fontSize: "18px", fontWeight: 800, color: "#D6724B" } }, `${totalMoney} 钱`)
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px" } },
          h(
            "span",
            { style: { background: "rgba(255,255,255,0.82)", padding: "5px 11px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700, color: "#5E7B6D" } },
            `第 ${level} 层`
          ),
          combo > 1 &&
            h(
              "span",
              { style: { background: "linear-gradient(135deg, #F5B841 0%, #E58A3C 100%)", color: "#FFFFFF", padding: "3px 10px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700, boxShadow: "0 4px 10px rgba(229,138,60,0.35)" } },
              `🔥 果冻连击 x${combo}`
            )
        )
      ),

      // 飘字反馈
      floatingText &&
        h(
          "div",
          {
            key: floatingText.id,
            style: {
              position: "absolute",
              top: "36%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: floatingText.color,
              fontSize: "21px",
              fontWeight: 800,
              animation: "pfFloatUp 0.85s ease-out forwards",
              zIndex: 60,
              textShadow: "0 2px 8px rgba(255,255,255,0.85)",
              pointerEvents: "none"
            }
          },
          floatingText.text
        ),

      // 完美落点星芒粒子
      sparkles.length > 0 &&
        h(
          "div",
          { style: { position: "absolute", bottom: "160px", left: "50%", zIndex: 55, pointerEvents: "none" } },
          sparkles.map((sp) =>
            h(
              "span",
              {
                key: sp.id,
                style: {
                  position: "absolute",
                  color: "#F3B53F",
                  fontSize: "15px",
                  transform: `translate(${Math.cos(sp.angle) * sp.dist}px, ${Math.sin(sp.angle) * sp.dist}px)`,
                  animation: "pfSparklePop 0.6s ease-out forwards"
                }
              },
              sp.emoji
            )
          )
        ),

      // 堆叠舞台
      h(
        "div",
        { style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-end" } },
        // 底部奶油毛绒圆垫底座
        h("div", {
          style: {
            position: "absolute",
            bottom: "18px",
            width: "276px",
            height: "112px",
            background: "radial-gradient(ellipse at center, #FFFDF9 0%, #EFE5D8 75%, #E2D4C3 100%)",
            borderRadius: "50%",
            boxShadow: "0 12px 30px rgba(130,108,88,0.16), inset 0 4px 10px rgba(255,255,255,0.9)",
            border: "4px solid rgba(255,255,255,0.85)",
            zIndex: 0
          }
        }),
        // 镜头跟随容器
        h(
          "div",
          {
            style: {
              position: "absolute",
              inset: 0,
              transform: `translateY(${cameraOffset}px)`,
              transition: "transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
            }
          },
          stackedBoxes.map((b, idx) => renderFluffyJellyBlock(b, idx, false)),
          gameState !== "gameover" && renderFluffyJellyBlock(movingBox, stackedBoxes.length, true)
        ),

        // 萌系毛绒小元宝/钱袋跳跃主角
        h(
          "div",
          {
            style: {
              position: "absolute",
              bottom: "146px",
              left: "50%",
              marginLeft: "-18px",
              width: "36px",
              height: "32px",
              borderRadius: "16px 16px 14px 14px",
              background: "linear-gradient(180deg, #FFF7DB 0%, #F9DC96 65%, #E7BA62 100%)",
              border: "2.5px solid #FFFFFF",
              boxShadow: "0 4px 12px rgba(214, 152, 58, 0.35), inset 0 3px 5px rgba(255,255,255,0.85)",
              zIndex: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              animation: gameState === "jumping" ? `pfJumperHop ${JUMP_MS}ms cubic-bezier(0.3, 0.85, 0.4, 1) forwards` : "pfIdleBreath 1.8s ease-in-out infinite",
              transformOrigin: "center bottom"
            }
          },
          h("span", { style: { width: "4px", height: "4px", borderRadius: "50%", background: "#5B4327" } }),
          h("span", { style: { width: "4px", height: "4px", borderRadius: "50%", background: "#5B4327" } })
        )
      ),

      // 底部操作提示
      !showResult &&
        h(
          "div",
          { style: { position: "absolute", bottom: "18px", left: 0, right: 0, textAlign: "center", fontSize: "12px", color: isNight ? "rgba(255,255,255,0.72)" : "#8C7F6D", pointerEvents: "none", zIndex: 20 } },
          "轻点屏幕起跳，稳稳落在毛绒果冻阶梯中央赚双倍俸禄~"
        ),

      // 结算与「直发传讯」弹窗
      showResult &&
        h(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              position: "absolute",
              inset: 0,
              background: "rgba(38, 34, 30, 0.56)",
              backdropFilter: "blur(5px)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px"
            }
          },
          h(
            "div",
            {
              style: {
                background: "#FFFDF9",
                borderRadius: "24px",
                padding: "22px 20px",
                width: "100%",
                maxWidth: "335px",
                textAlign: "center",
                border: "1.5px solid #EFE4D2",
                boxShadow: "0 18px 46px rgba(0,0,0,0.24)",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }
            },
            h("div", { style: { fontSize: "42px", lineHeight: 1 } }, "🍮"),
            h("div", { style: { fontSize: "18px", fontWeight: 800, color: "#4A5140" } }, "俸禄核发完成"),
            h("div", { style: { fontSize: "12.5px", color: "#8C917B" } }, `给 ${selectedCharacter} 的本月俸禄（共 ${level} 层 · 最高连击 x${maxCombo}）`),
            h("div", { style: { fontSize: "38px", fontWeight: 800, color: "#D6724B", lineHeight: 1.1 } }, `${totalMoney} 钱`),

            // 直发传讯区域
            h(
              "div",
              {
                style: {
                  background: "#FAF5EB",
                  border: "1px solid #EFE0C6",
                  borderRadius: "16px",
                  padding: "11px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  textAlign: "left"
                }
              },
              h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#7B5B34" } }, "💸 传递给传讯中的角色"),
              chatChars.length === 0
                ? h("div", { style: { fontSize: "11.5px", color: "#9C8A70" } }, "传讯通讯录中暂无角色，请先在传讯添加角色。")
                : h(
                    React.Fragment,
                    null,
                    h(
                      "select",
                      {
                        value: targetChatId,
                        disabled: payoutSent,
                        onChange: (e) => setTargetChatId(e.target.value),
                        style: {
                          width: "100%",
                          padding: "7px 9px",
                          borderRadius: "10px",
                          border: "1px solid #E2D1B4",
                          background: "#FFFFFF",
                          fontSize: "12.5px",
                          color: "#3F4536"
                        }
                      },
                      chatChars.map((c) => h("option", { key: c.id, value: String(c.id) }, `${c.name}${c.name === selectedCharacter ? "（同名匹配）" : ""}`))
                    ),
                    h("input", {
                      value: payoutNote,
                      disabled: payoutSent,
                      onChange: (e) => setPayoutNote(e.target.value),
                      placeholder: "发薪附言（选填，如：本月辛苦，拿去买糖）",
                      style: {
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "7px 9px",
                        borderRadius: "10px",
                        border: "1px solid #E2D1B4",
                        background: "#FFFFFF",
                        fontSize: "12px",
                        color: "#3F4536"
                      }
                    }),
                    h(
                      "button",
                      {
                        type: "button",
                        disabled: sendingPayout || payoutSent,
                        onClick: handleSendToChat,
                        style: {
                          width: "100%",
                          padding: "9px",
                          borderRadius: "12px",
                          border: "none",
                          background: payoutSent
                            ? "#8FA99D"
                            : "linear-gradient(135deg, #EBA157 0%, #D6724B 100%)",
                          color: "#FFFFFF",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: payoutSent ? "default" : "pointer",
                          boxShadow: payoutSent ? "none" : "0 4px 12px rgba(214,114,75,0.32)"
                        }
                      },
                      payoutSent ? "已发送俸禄条至传讯 ✓" : sendingPayout ? "发送中…" : "💸 发放到传讯"
                    )
                  )
            ),

            h(
              "div",
              { style: { display: "flex", gap: "8px", marginTop: "2px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: onBackToSelect,
                  style: { flex: 1, padding: "10px", borderRadius: "13px", border: "1px solid #DDD8CE", background: "#F9F7F5", color: "#6A7060", fontSize: "13px", fontWeight: 600, cursor: "pointer" }
                },
                "换人发俸"
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: initGame,
                  style: { flex: 1, padding: "10px", borderRadius: "13px", border: "none", background: "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, cursor: "pointer" }
                },
                "再来一局"
              )
            )
          )
        ),

      // 果冻与毛绒弹性关键帧
      h(
        "style",
        null,
        `
        @keyframes pfJellySquash {
          0%   { transform: scale(1.16, 0.74); }
          35%  { transform: scale(0.92, 1.12); }
          65%  { transform: scale(1.05, 0.95); }
          100% { transform: scale(1, 1); }
        }
        @keyframes pfJellyRipple {
          0%   { transform: scale(1, 1); }
          40%  { transform: scale(1.06, 0.92); }
          75%  { transform: scale(0.98, 1.03); }
          100% { transform: scale(1, 1); }
        }
        @keyframes pfJumperHop {
          0%   { transform: translateY(0) scale(1.12, 0.86); }
          38%  { transform: translateY(-108px) scale(0.92, 1.14); }
          78%  { transform: translateY(-4px) scale(1.14, 0.82); }
          100% { transform: translateY(0) scale(1, 1); }
        }
        @keyframes pfIdleBreath {
          0%, 100% { transform: scale(1, 1); }
          50%      { transform: scale(1.04, 0.95); }
        }
        @keyframes pfFloatUp {
          0%   { transform: translate(-50%, -40%) scale(0.7); opacity: 0; }
          35%  { transform: translate(-50%, -90%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -155%) scale(1); opacity: 0; }
        }
        @keyframes pfSparklePop {
          0%   { opacity: 1; transform: scale(0.6); }
          100% { opacity: 0; transform: scale(1.35); }
        }
      `
      )
    );
  };

  // ==========================================
  // 4. P1 组件：发薪流水小账本 + 审批风格与换批工具条
  // ==========================================
  const SalaryPayoutLedgerBar = () => {
    const h = React.createElement;
    const [records, setRecords] = React.useState(() => salaryLedgerStore.getAll());
    const [expanded, setExpanded] = React.useState(false);

    React.useEffect(() => {
      const sync = () => setRecords(salaryLedgerStore.getAll());
      global.addEventListener(LEDGER_EVENT, sync);
      return () => global.removeEventListener(LEDGER_EVENT, sync);
    }, []);

    if (!records || records.length === 0) return null;
    const totalIssued = records.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    return h(
      "div",
      {
        style: {
          marginTop: "16px",
          background: "#FFFDF9",
          border: "1px solid #EAE2D3",
          borderRadius: "16px",
          padding: "10px 12px",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      h(
        "div",
        {
          onClick: () => setExpanded((v) => !v),
          style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h("span", { style: { fontSize: "12.5px", fontWeight: 700, color: "#5a5f4d" } }, `📜 发薪流水（${records.length} 笔）`),
          h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#D6724B" } }, `共 ${totalIssued} 钱`)
        ),
        h("span", { style: { fontSize: "11px", color: "#8C917B" } }, expanded ? "收起 ▲" : "展开 ▼")
      ),
      expanded &&
        h(
          "div",
          { style: { marginTop: "10px", display: "flex", flexDirection: "column", gap: "7px", maxHeight: "180px", overflowY: "auto" } },
          records.map((r) => {
            const dt = new Date(r.issuedAt || Date.now());
            const ts = `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
            return h(
              "div",
              {
                key: r.id,
                style: {
                  background: "#FAF6EE",
                  borderRadius: "10px",
                  padding: "7px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px"
                }
              },
              h(
                "div",
                { style: { minWidth: 0 } },
                h(
                  "div",
                  { style: { fontWeight: 700, color: "#4A5140" } },
                  `${r.recipientName} `,
                  r.sentToChat && h("span", { style: { fontSize: "10px", color: "#4E7866", background: "#EBF4EF", padding: "1px 5px", borderRadius: "999px" } }, "已发传讯")
                ),
                h("div", { style: { fontSize: "11px", color: "#8A8D80", marginTop: "2px" } }, `${ts}${r.note ? ` · ${r.note}` : ""}`)
              ),
              h("span", { style: { fontWeight: 800, color: "#D6724B", flexShrink: 0 } }, `${r.amount} 钱`)
            );
          }),
          h(
            "button",
            {
              type: "button",
              onClick: () => {
                if (window.confirm("确定清空发薪流水记录吗？")) salaryLedgerStore.clear();
              },
              style: { alignSelf: "flex-end", border: "none", background: "transparent", color: "#B4534B", fontSize: "11px", cursor: "pointer", padding: "2px 4px" }
            },
            "清空流水"
          )
        )
    );
  };

  const ApprovalStyleControlBar = ({ isAIMode, isGenerating, onRefreshPool }) => {
    const h = React.createElement;
    const [styleId, setStyleId] = React.useState(() => getApprovalStyle());
    if (!isAIMode) return null;

    return h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px",
          padding: "6px 16px 2px",
          flexWrap: "wrap",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "5px" } },
        APPROVAL_STYLES.map((st) => {
          const active = styleId === st.id;
          return h(
            "button",
            {
              key: st.id,
              type: "button",
              disabled: isGenerating,
              onClick: () => {
                setStyleId(st.id);
                setApprovalStyle(st.id);
                if (typeof onRefreshPool === "function") onRefreshPool(st.id, false);
              },
              style: {
                border: active ? "1px solid #8FA99D" : "1px solid #E2DDD2",
                background: active ? "#EEF6F2" : "#FFFFFF",
                color: active ? "#3F5D50" : "#7A826F",
                fontSize: "11px",
                fontWeight: active ? 700 : 500,
                padding: "3px 9px",
                borderRadius: "999px",
                cursor: isGenerating ? "not-allowed" : "pointer"
              }
            },
            st.label
          );
        })
      ),
      h(
        "button",
        {
          type: "button",
          disabled: isGenerating,
          onClick: () => {
            if (typeof onRefreshPool === "function") onRefreshPool(styleId, true);
          },
          style: {
            border: "1px dashed #B8C7BE",
            background: "#FFFFFF",
            color: "#5E8475",
            fontSize: "11px",
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: "999px",
            cursor: isGenerating ? "not-allowed" : "pointer"
          }
        },
        isGenerating ? "生成中…" : "🔄 换一批词库"
      )
    );
  };

  // ==========================================
  // 5. 已批阅审批单留档 + 静默转发传讯 + 朱批公文卡片 + 五维 LLM 协议
  // ==========================================
  const APPROVED_RECORDS_KEY = "xiuyi_approved_records_v1";
  const APPROVED_EVENT = "milvus-xiuyi-approved-updated";
  const _pendingDecisionsByType = {};

  const approvalRecordStore = {
    resetType: (type) => {
      if (type) _pendingDecisionsByType[type] = [];
    },

    recordDecision: (type, reqObj, action) => {
      if (!type || !reqObj) return;
      if (!Array.isArray(_pendingDecisionsByType[type])) _pendingDecisionsByType[type] = [];
      const desc = String(reqObj.desc || reqObj.title || "").trim();
      if (!desc) return;
      _pendingDecisionsByType[type].push({
        char: String(reqObj.char || reqObj.applicant || "").trim() || "楼内密探",
        desc,
        decision: action === "approve" ? "approved" : "rejected"
      });
    },

    getAll: () => {
      try {
        const list = JSON.parse(localStorage.getItem(APPROVED_RECORDS_KEY) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    },

    finalizeApproval: (item) => {
      if (!item) return null;
      const type = item.type || "部门审批";
      const captured = Array.isArray(_pendingDecisionsByType[type]) && _pendingDecisionsByType[type].length > 0
        ? _pendingDecisionsByType[type]
        : [{ char: "楼内密探", desc: `${item.title || type} 已由楼主特批快速通过。`, decision: "approved" }];
      _pendingDecisionsByType[type] = [];

      const approvedCount = captured.filter((e) => e.decision === "approved").length;
      const rejectedCount = captured.filter((e) => e.decision === "rejected").length;
      const record = {
        id: item.id || `ap_${Date.now()}`,
        type,
        title: item.title || type,
        date: item.date || new Date().toLocaleDateString(),
        status: rejectedCount === 0 ? "已准奏" : approvedCount === 0 ? "已驳回" : `准${approvedCount}·驳${rejectedCount}`,
        approvedCount,
        rejectedCount,
        entries: captured,
        completedAt: Date.now()
      };

      const prev = approvalRecordStore.getAll();
      const next = [record, ...prev.filter((r) => String(r.id) !== String(record.id))].slice(0, 60);
      try {
        localStorage.setItem(APPROVED_RECORDS_KEY, JSON.stringify(next));
        global.dispatchEvent(new CustomEvent(APPROVED_EVENT));
      } catch (e) {}
      return record;
    },

    clearAll: () => {
      try {
        localStorage.removeItem(APPROVED_RECORDS_KEY);
        global.dispatchEvent(new CustomEvent(APPROVED_EVENT));
      } catch (e) {}
    }
  };

  async function forwardApprovalToChat(targetChar, { record, selectedEntries, note }) {
    if (!targetChar || targetChar.id === undefined) throw new Error("未选择传讯角色");
    const entries = Array.isArray(selectedEntries) && selectedEntries.length > 0
      ? selectedEntries
      : Array.isArray(record?.entries) ? record.entries : [];
    const approvedCount = entries.filter((e) => e.decision === "approved").length;
    const rejectedCount = entries.filter((e) => e.decision === "rejected").length;
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const summaryTag =
      rejectedCount === 0 ? `全准(${approvedCount})` : approvedCount === 0 ? `全驳(${rejectedCount})` : `准${approvedCount}·驳${rejectedCount}`;

    const msg = {
      id: now,
      type: "approval_forward_card",
      isMe: true,
      sender: "me",
      timestamp: now,
      time: timeStr,
      text: `[绣衣楼批文] ${record?.title || record?.type || "部门审批"}（${summaryTag}）`,
      content: {
        approvalId: String(record?.id || now),
        type: record?.type || "部门审批",
        title: record?.title || record?.type || "部门审批",
        date: record?.date || new Date().toLocaleDateString(),
        approvedCount,
        rejectedCount,
        entries,
        note: String(note || "").trim()
      }
    };

    // 静默写入传讯聊天主线，绝不自动触发 AI 回复
    let saved = false;
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
        await global.chatHistoryStore.saveMessage(targetChar.id, msg);
        saved = true;
      }
    } catch (e) {}
    if (!saved) {
      try {
        const key = "t8_chat_history_" + targetChar.id;
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push(msg);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (e) {}
    }

    try {
      const rawList = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      if (Array.isArray(rawList)) {
        const updated = rawList.map((c) =>
          c && String(c.id) === String(targetChar.id)
            ? { ...c, lastMessage: msg.text, lastTime: timeStr, timestamp: now }
            : c
        );
        localStorage.setItem("t8_chat_list", JSON.stringify(updated));
      }
    } catch (e) {}

    return msg;
  }

  function formatApprovalForwardCardForLLM(msg, chatData) {
    const c = msg?.content || {};
    const entries = Array.isArray(c.entries) ? c.entries : [];
    const charName = chatData?.name || "";
    const involvesSelf = Boolean(
      charName &&
      entries.some((e) => (e.char && e.char.includes(charName)) || (e.desc && e.desc.includes(charName)))
    );

    const lines = entries.map((e, i) => {
      const stamp = e.decision === "approved" ? "【准奏】" : "【驳回】";
      return `${i + 1}. ${stamp} ${e.desc}`;
    });

    const relationHint = involvesSelf
      ? `注意：这份批文中明确涉及【你自己（${charName}）】的申请！请结合你的角色人设（MBTI、星座、语言风格、性格与背景）、用户身份设定、当前开启的世界书以及你们的传讯上下文，针对被准奏或被驳回的事实做出极其生动真实的反应。`
      : `注意：这是广陵王（用户）把绣衣楼批阅完的公文转发给你看/商议/分享吃瓜。请结合你的角色人设、用户身份设定、开启的世界书及你们的传讯上下文，对批文内容与楼主的批阅决定发表贴合人设的点评或吐槽。`;

    return {
      role: msg.isMe ? "user" : "assistant",
      content: `【绣衣楼朱批公文卡片】
公文类别：${c.type || "部门审批"}
公文编号：${c.title || ""}（${c.date || ""}）
批阅结果：准奏 ${c.approvedCount || 0} 条 / 驳回 ${c.rejectedCount || 0} 条
批文详情：
${lines.join("\n")}
${c.note ? `楼主转发附言：“${c.note}”\n` : ""}（提示：${relationHint}）`
    };
  }

  const ApprovalForwardCardBubble = ({ msg }) => {
    const h = React.createElement;
    const [showFull, setShowFull] = React.createElement ? React.useState(false) : [false, () => {}];
    const c = msg?.content || {};
    const entries = Array.isArray(c.entries) ? c.entries : [];
    const preview = entries.slice(0, 3);
    const allApproved = (c.rejectedCount || 0) === 0;
    const allRejected = (c.approvedCount || 0) === 0;
    const stampText = allApproved ? "朱批·准" : allRejected ? "朱批·驳" : "朱批·阅";
    const stampColor = allApproved ? "#2E7554" : allRejected ? "#B8473F" : "#A66A2E";
    const stampBg = allApproved ? "#E8F5EE" : allRejected ? "#FDEEEB" : "#FAF0DF";

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          onClick: () => setShowFull(true),
          style: {
            width: "250px",
            maxWidth: "76vw",
            background: "linear-gradient(160deg, #FCF8EE 0%, #F5ECDA 100%)",
            border: "1.5px solid #DECAA4",
            borderRadius: "16px",
            padding: "11px 12px",
            boxShadow: "0 5px 14px rgba(110, 86, 52, 0.14)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            textAlign: "left",
            fontFamily: "system-ui, -apple-system, sans-serif",
            position: "relative"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
          h("span", { style: { fontSize: "10.5px", fontWeight: 700, color: "#7B5B34", letterSpacing: "0.5px" } }, "📜 绣衣楼批文"),
          h(
            "span",
            {
              style: {
                fontSize: "10px",
                fontWeight: 800,
                color: stampColor,
                background: stampBg,
                border: `1px solid ${stampColor}55`,
                padding: "1px 7px",
                borderRadius: "6px"
              }
            },
            stampText
          )
        ),
        h(
          "div",
          { style: { fontSize: "13.5px", fontWeight: 700, color: "#423424", borderBottom: "1px dashed #DFCFAF", paddingBottom: "5px" } },
          c.title || c.type || "部门审批"
        ),
        preview.map((item, idx) => {
          const ok = item.decision === "approved";
          return h(
            "div",
            {
              key: idx,
              style: {
                background: "rgba(255,255,255,0.75)",
                borderRadius: "8px",
                padding: "5px 8px",
                fontSize: "11.5px",
                lineHeight: 1.45,
                color: "#4E4133",
                display: "flex",
                alignItems: "flex-start",
                gap: "5px"
              }
            },
            h(
              "span",
              {
                style: {
                  fontSize: "10px",
                  fontWeight: 700,
                  color: ok ? "#2E7554" : "#B8473F",
                  background: ok ? "#E8F5EE" : "#FDEEEB",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  flexShrink: 0,
                  marginTop: "1px"
                }
              },
              ok ? "准" : "驳"
            ),
            h("span", { style: { flex: 1 } }, item.desc)
          );
        }),
        c.note &&
          h(
            "div",
            { style: { fontSize: "11px", color: "#7E5D38", background: "rgba(235,214,178,0.4)", borderRadius: "8px", padding: "5px 8px" } },
            `楼主附言：${c.note}`
          ),
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10.5px", color: "#968062", paddingTop: "2px" } },
          h("span", null, `共 ${entries.length} 条 · 准${c.approvedCount || 0} 驳${c.rejectedCount || 0}`),
          h("span", { style: { color: "#8A5A30", fontWeight: 600 } }, "展卷查看 ›")
        )
      ),
      showFull &&
        h(
          "div",
          {
            style: { position: "fixed", inset: 0, zIndex: 14200, background: "rgba(38,31,22,0.52)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
            onClick: (e) => { if (e.target === e.currentTarget) setShowFull(false); }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "380px", maxHeight: "80vh", background: "#FAF5E8", borderRadius: "20px", border: "1px solid #DECAA4", overflow: "hidden", display: "flex", flexDirection: "column" } },
            h(
              "div",
              { style: { padding: "13px 16px", background: "#F3E8D0", borderBottom: "1px solid #E5D4B3", display: "flex", alignItems: "center", justifyContent: "space-between" } },
              h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#4A3A28" } }, `📜 ${c.title || c.type}`),
              h("button", { type: "button", onClick: () => setShowFull(false), style: { border: "none", background: "rgba(90,74,53,0.12)", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" } }, "✕")
            ),
            h(
              "div",
              { style: { flex: 1, overflowY: "auto", padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: "8px" } },
              entries.map((item, idx) => {
                const ok = item.decision === "approved";
                return h(
                  "div",
                  { key: idx, style: { background: "#FFFDF7", borderRadius: "12px", padding: "9px 11px", border: "1px solid #E8DBC0", display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12.5px", color: "#4A3C2C", lineHeight: 1.55 } },
                  h("span", { style: { fontSize: "10.5px", fontWeight: 700, color: ok ? "#2E7554" : "#B8473F", background: ok ? "#E8F5EE" : "#FDEEEB", padding: "2px 6px", borderRadius: "6px", flexShrink: 0 } }, ok ? "准奏" : "驳回"),
                  h("span", null, item.desc)
                );
              }),
              c.note &&
                h("div", { style: { background: "#F5ECD6", borderRadius: "10px", padding: "9px 11px", fontSize: "12px", color: "#6E5231" } }, `楼主批注：${c.note}`)
            )
          )
        )
    );
  };

  const ApprovalForwardModal = ({ record, onClose }) => {
    const h = React.createElement;
    const [chatChars, setChatChars] = React.useState([]);
    const [targetId, setTargetId] = React.useState("");
    const [selectedIdxList, setSelectedIdxList] = React.useState([]);
    const [note, setNote] = React.useState("");
    const [sending, setSending] = React.useState(false);

    const entries = Array.isArray(record?.entries) ? record.entries : [];

    React.useEffect(() => {
      if (!record) return;
      setSelectedIdxList(entries.map((_, i) => i));
      setNote("");
      (async () => {
        const list = await loadChatCharacters();
        const involvedNames = new Set(entries.map((e) => e.char).filter(Boolean));
        const sorted = [...(list || [])].sort((a, b) => {
          const ia = involvedNames.has(a?.name) ? 1 : 0;
          const ib = involvedNames.has(b?.name) ? 1 : 0;
          return ib - ia;
        });
        setChatChars(sorted);
        if (sorted[0]) setTargetId(String(sorted[0].id));
      })();
    }, [record]);

    if (!record) return null;

    const involvedNames = new Set(entries.map((e) => e.char).filter(Boolean));
    const toggleIdx = (i) => {
      setSelectedIdxList((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
    };

    const handleSend = async () => {
      const target = chatChars.find((c) => String(c.id) === String(targetId));
      if (!target) {
        alert("传讯通讯录中暂无可选名士，请先前往「传讯」添加角色。");
        return;
      }
      const chosen = selectedIdxList.sort((a, b) => a - b).map((i) => entries[i]).filter(Boolean);
      if (chosen.length === 0) {
        alert("请至少勾选 1 条批文明细");
        return;
      }
      setSending(true);
      try {
        await forwardApprovalToChat(target, { record, selectedEntries: chosen, note });
        onClose();
        alert(`已将朱批公文卡片静默送达【${target.name}】的传讯主线！\n前往传讯点击触发 AI 回复后，${target.name}就会回应这份批文。`);
      } catch (err) {
        alert("转发失败：" + (err?.message || err));
      } finally {
        setSending(false);
      }
    };

    return h(
      "div",
      {
        style: { position: "fixed", inset: 0, zIndex: 13800, background: "rgba(38,34,28,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", fontFamily: "system-ui, -apple-system, sans-serif" },
        onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
      },
      h(
        "div",
        { style: { width: "100%", maxWidth: "380px", maxHeight: "84vh", background: "#FAF6EE", borderRadius: "20px", border: "1px solid #E2D3B5", padding: "16px", display: "flex", flexDirection: "column", gap: "11px", overflow: "hidden" } },
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#4A3C2C" } }, "📨 转发批文至传讯"),
          h("button", { type: "button", onClick: onClose, style: { border: "none", background: "rgba(90,74,53,0.12)", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" } }, "✕")
        ),
        h("div", { style: { fontSize: "11.5px", color: "#8A775D" } }, "仅发送公文卡片至聊天主线，不会自动触发 AI 扣费；到传讯点击回复后角色再回应。"),
        h(
          "select",
          {
            value: targetId,
            onChange: (e) => setTargetId(e.target.value),
            style: { width: "100%", padding: "9px 10px", borderRadius: "10px", border: "1px solid #DECAA4", background: "#FFFFFF", fontSize: "13px", color: "#3F352A" }
          },
          chatChars.map((c) => h("option", { key: c.id, value: String(c.id) }, `${c.name}${involvedNames.has(c.name) ? "（批文当事人）" : ""}`))
        ),
        entries.length > 0 &&
          h(
            "div",
            { className: "no-scrollbar", style: { maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" } },
            entries.map((item, idx) => {
              const checked = selectedIdxList.includes(idx);
              const ok = item.decision === "approved";
              return h(
                "label",
                {
                  key: idx,
                  style: {
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "7px",
                    background: checked ? "#FFFDF7" : "#F3EDE0",
                    border: checked ? "1px solid #D9C39A" : "1px solid transparent",
                    borderRadius: "10px",
                    padding: "7px 9px",
                    fontSize: "12px",
                    color: "#4A3C2C",
                    cursor: "pointer"
                  }
                },
                h("input", { type: "checkbox", checked, onChange: () => toggleIdx(idx), style: { marginTop: "2px" } }),
                h("span", { style: { fontSize: "10px", fontWeight: 700, color: ok ? "#2E7554" : "#B8473F", background: ok ? "#E8F5EE" : "#FDEEEB", padding: "1px 5px", borderRadius: "4px", flexShrink: 0 } }, ok ? "准" : "驳"),
                h("span", { style: { lineHeight: 1.45 } }, item.desc)
              );
            })
          ),
        h("input", {
          value: note,
          onChange: (e) => setNote(e.target.value),
          placeholder: "楼主附言（选填，如：你看看你写的什么请假理由）",
          style: { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "10px", border: "1px solid #DECAA4", background: "#FFFFFF", fontSize: "12.5px" }
        }),
        h(
          "div",
          { style: { display: "flex", gap: "8px" } },
          h("button", { type: "button", onClick: onClose, style: { flex: 1, padding: "9px", borderRadius: "12px", border: "1px solid #DDD2BC", background: "#FFFFFF", color: "#6E5D48", fontSize: "13px", cursor: "pointer" } }, "取消"),
          h(
            "button",
            {
              type: "button",
              disabled: sending || chatChars.length === 0,
              onClick: handleSend,
              style: { flex: 2, padding: "9px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, cursor: sending ? "not-allowed" : "pointer" }
            },
            sending ? "发送中…" : "确认转发到传讯"
          )
        )
      )
    );
  };

  const ApprovedRecordsListView = ({ legacyList }) => {
    const h = React.createElement;
    const [records, setRecords] = React.useState(() => approvalRecordStore.getAll());
    const [expandedId, setExpandedId] = React.useState(null);
    const [forwardTargetRecord, setForwardTargetRecord] = React.useState(null);

    React.useEffect(() => {
      const sync = () => setRecords(approvalRecordStore.getAll());
      global.addEventListener(APPROVED_EVENT, sync);
      return () => global.removeEventListener(APPROVED_EVENT, sync);
    }, []);

    // 合并内存中本次已审批但尚未持久化的旧项
    const displayList = React.useMemo(() => {
      const seen = new Set(records.map((r) => String(r.id)));
      const merged = [...records];
      (legacyList || []).forEach((item) => {
        if (item && !seen.has(String(item.id))) {
          merged.push({
            ...item,
            approvedCount: 1,
            rejectedCount: 0,
            entries: [{ char: "楼内密探", desc: `${item.title || item.type} 已批阅。`, decision: "approved" }]
          });
        }
      });
      return merged;
    }, [records, legacyList]);

    if (displayList.length === 0) {
      return h("div", { style: { textAlign: "center", color: "#B8BDB4", marginTop: "48px", fontSize: "13px" } }, "暂无已批阅公文，去「待审批」批几份吧~");
    }

    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "24px", fontFamily: "system-ui, -apple-system, sans-serif" } },
      displayList.map((rec) => {
        const isOpen = expandedId === rec.id;
        const entries = Array.isArray(rec.entries) ? rec.entries : [];
        return h(
          "div",
          {
            key: rec.id,
            style: {
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "13px 14px",
              border: "1px solid #EAE5DC",
              borderLeft: "4px solid #A8C8BA",
              boxShadow: "0 3px 10px rgba(90,95,77,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }
          },
          h(
            "div",
            {
              onClick: () => setExpandedId(isOpen ? null : rec.id),
              style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", cursor: "pointer" }
            },
            h(
              "div",
              { style: { minWidth: 0, flex: 1 } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#4A5140" } }, rec.type),
                h(
                  "span",
                  { style: { fontSize: "10.5px", padding: "1px 7px", borderRadius: "999px", background: "#EEF6F2", color: "#4E7866", fontWeight: 600 } },
                  rec.status || "已批阅"
                )
              ),
              h("div", { style: { fontSize: "11.5px", color: "#9AA190", marginTop: "2px" } }, `${rec.title} · ${entries.length} 条明细 ${isOpen ? "▲" : "▼"}`)
            ),
            h(
              "button",
              {
                type: "button",
                onClick: (e) => {
                  e.stopPropagation();
                  setForwardTargetRecord(rec);
                },
                style: {
                  border: "1px solid #BDD2C6",
                  background: "#EEF6F2",
                  color: "#3F5D50",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "6px 11px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  flexShrink: 0
                }
              },
              "📨 转发传讯"
            )
          ),
          isOpen &&
            entries.length > 0 &&
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "5px", paddingTop: "6px", borderTop: "1px dashed #ECE7DE" } },
              entries.map((item, idx) => {
                const ok = item.decision === "approved";
                return h(
                  "div",
                  { key: idx, style: { fontSize: "12px", color: "#5A5F4D", background: "#FAF8F4", borderRadius: "8px", padding: "6px 8px", display: "flex", gap: "6px", alignItems: "flex-start", lineHeight: 1.45 } },
                  h("span", { style: { fontSize: "10px", fontWeight: 700, color: ok ? "#2E7554" : "#B8473F", background: ok ? "#E8F5EE" : "#FDEEEB", padding: "1px 5px", borderRadius: "4px", flexShrink: 0 } }, ok ? "准" : "驳"),
                  h("span", null, item.desc)
                );
              })
            )
        );
      }),
      forwardTargetRecord && h(ApprovalForwardModal, { record: forwardTargetRecord, onClose: () => setForwardTargetRecord(null) })
    );
  };

  global.XIUYI_CLASSIC_POOL_EXTRA = FALLBACK_CONCISE_POOL;
  global.approvalRecordStore = approvalRecordStore;
  global.forwardApprovalToChat = forwardApprovalToChat;
  global.formatApprovalForwardCardForLLM = formatApprovalForwardCardForLLM;
  global.ApprovalForwardCardBubble = ApprovalForwardCardBubble;
  global.ApprovalForwardModal = ApprovalForwardModal;
  global.ApprovedRecordsListView = ApprovedRecordsListView;
  global.generateConciseApprovalPool = generateConciseApprovalPool;
  global.pickUniqueFromPool = pickUniqueFromPool;
  global.sendSalaryPayoutToChat = sendSalaryPayoutToChat;
  global.formatSalaryPayoutCardForLLM = formatSalaryPayoutCardForLLM;
  global.SalaryPayoutCardBubble = SalaryPayoutCardBubble;
  global.FluffyJellySalaryGame = FluffyJellySalaryGame;
  global.SalaryPayoutLedgerBar = SalaryPayoutLedgerBar;
  global.ApprovalStyleControlBar = ApprovalStyleControlBar;
})(typeof window !== "undefined" ? window : globalThis);
