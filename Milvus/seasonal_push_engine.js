/**
 * Milvus/seasonal_push_engine.js
 * 独立引擎（阶段一）：二十四节气天文历法 + 重大纪念日多源探测 + IndexedDB 持久层 + 队列计算
 *
 * 架构特性：
 * - 零新增 localStorage 键：全部配置、自定义纪念日、今日已读记录、AI 寄语缓存存于独立 IndexedDB (milvus_seasonal_push_idb)
 * - 零 Emoji：全纯文本与矢量徽章标识
 * - 2000-2099 年二十四节气天文寿星公式（精确到日）+ 2025-2030 传统佳节公历表
 * - 自动联动情侣空间 (couple-space-db -> anniversary) 实时校准相伴天数并探测里程碑
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_SEASONAL_PUSH_ENGINE_LOADED__) return;
  global.__MILVUS_SEASONAL_PUSH_ENGINE_LOADED__ = true;

  const DB_NAME = "milvus_seasonal_push_idb";
  const DB_VERSION = 1;
  const STORE_NAME = "seasonal_store";

  const DEFAULT_PREFS = {
    solarEnabled: true,
    solarAdvanceDay: false, // 是否在节气前一天也发轻预告
    anniversaryEnabled: true,
    festivalEnabled: true,
    aiNoteEnabled: false,
    signatureName: "广陵 · 你的小手机"
  };

  // ===================== 6 套手账治愈色盘（对应参考图棋盘格与主卡配色） =====================
  const THEME_PALETTES = {
    spring: {
      id: "spring",
      label: "春樱奶霜",
      checkerA: "#F2DCE4",
      checkerB: "#E8CCD7",
      underPaper: "#FCE8B2",
      underLine: "rgba(214, 168, 92, 0.25)",
      cardBg: "#FFFBF5",
      cardBorder: "#D98E73",
      gridLine: "rgba(217, 142, 115, 0.13)",
      laceColor: "#F2C6D2",
      ribbonBg: "#FCE5A6",
      ribbonBorder: "#D8A65E",
      ribbonText: "#6E4831",
      pillBg: "#EA9A8D",
      pillText: "#FFFFFF",
      clipColor: "#A993C9",
      textMain: "#6A4738",
      textSub: "#9B7B6B",
      accent: "#E07E78"
    },
    summer: {
      id: "summer",
      label: "夏荷薄荷",
      checkerA: "#DCEEE6",
      checkerB: "#CDE4DA",
      underPaper: "#FAF0B8",
      underLine: "rgba(182, 168, 92, 0.24)",
      cardBg: "#FDFFF9",
      cardBorder: "#7BB09B",
      gridLine: "rgba(123, 176, 155, 0.14)",
      laceColor: "#C5E4D6",
      ribbonBg: "#E6F4CF",
      ribbonBorder: "#8FB87A",
      ribbonText: "#3C5E46",
      pillBg: "#7CB8A0",
      pillText: "#FFFFFF",
      clipColor: "#7AAED0",
      textMain: "#375647",
      textSub: "#6F8E7E",
      accent: "#5D9E83"
    },
    autumn: {
      id: "autumn",
      label: "秋枫暖杏",
      checkerA: "#F2E3D4",
      checkerB: "#E8D4C0",
      underPaper: "#F8E1A6",
      underLine: "rgba(196, 148, 76, 0.26)",
      cardBg: "#FFFBF4",
      cardBorder: "#CE8A5C",
      gridLine: "rgba(206, 138, 92, 0.14)",
      laceColor: "#F0CFB2",
      ribbonBg: "#F9DFA8",
      ribbonBorder: "#CF9654",
      ribbonText: "#694225",
      pillBg: "#DC9166",
      pillText: "#FFFFFF",
      clipColor: "#B38A6E",
      textMain: "#633F26",
      textSub: "#947158",
      accent: "#C97A4B"
    },
    winter: {
      id: "winter",
      label: "冬雪雾蓝",
      checkerA: "#DDE6F2",
      checkerB: "#CEDCEE",
      underPaper: "#F7E9C4",
      underLine: "rgba(186, 164, 114, 0.25)",
      cardBg: "#FCFDFE",
      cardBorder: "#83A0C2",
      gridLine: "rgba(131, 160, 194, 0.14)",
      laceColor: "#CEDDF0",
      ribbonBg: "#E6EFFA",
      ribbonBorder: "#8DA8C8",
      ribbonText: "#3B526E",
      pillBg: "#84A3C7",
      pillText: "#FFFFFF",
      clipColor: "#8F8AC4",
      textMain: "#3A4E66",
      textSub: "#71859C",
      accent: "#6B8DB5"
    },
    anniversary: {
      id: "anniversary",
      label: "薰衣草玫瑰",
      checkerA: "#E8D9E6",
      checkerB: "#DEC9DC",
      underPaper: "#FBE5AE",
      underLine: "rgba(206, 164, 88, 0.26)",
      cardBg: "#FFFBF3",
      cardBorder: "#D98A6C",
      gridLine: "rgba(208, 152, 132, 0.14)",
      laceColor: "#F2C9CE",
      ribbonBg: "#FCE3A4",
      ribbonBorder: "#D6A15C",
      ribbonText: "#6D4732",
      pillBg: "#E8988A",
      pillText: "#FFFFFF",
      clipColor: "#9D8EC4",
      textMain: "#6A4636",
      textSub: "#99786A",
      accent: "#D97F76"
    },
    birthday: {
      id: "birthday",
      label: "蜜桃奶黄",
      checkerA: "#F6E2DA",
      checkerB: "#EED4CA",
      underPaper: "#FCE8AC",
      underLine: "rgba(212, 166, 84, 0.25)",
      cardBg: "#FFFCF6",
      cardBorder: "#E08E79",
      gridLine: "rgba(224, 142, 121, 0.14)",
      laceColor: "#F7CFC8",
      ribbonBg: "#FFE6AD",
      ribbonBorder: "#DBA25B",
      ribbonText: "#72472E",
      pillBg: "#EB9582",
      pillText: "#FFFFFF",
      clipColor: "#A68FC8",
      textMain: "#6C4534",
      textSub: "#9E7868",
      accent: "#E37B6D"
    }
  };

  // ===================== 24 节气天文系数与完整诗意数据库 =====================
  // 按公历月份排列（1月小寒起至12月冬至），使用 21 世纪寿星天文 C 值与极少数年份例外修正
  const SOLAR_TERMS_DATA = [
    {
      id: "xiaohan",
      order: 23,
      month: 1,
      c21: 5.4055,
      exceptions: { 2019: -1 },
      name: "小寒",
      alias: "岁暮初寒",
      season: "winter",
      badgeType: "lantern",
      greeting: "小寒已至，朔风渐紧。窗外虽寒，愿你手边常有温茶，衣襟常存暖意，不必急着赶路，先把自己照顾好。",
      tip: "早晚温差大，出门记得护好脖颈与手腕。"
    },
    {
      id: "dahan",
      order: 24,
      month: 1,
      c21: 20.12,
      exceptions: { 2082: 1 },
      name: "大寒",
      alias: "冬尽春近",
      season: "winter",
      badgeType: "plum",
      greeting: "大寒是岁末最后一段霜雪，熬过这一程，便是满目新绿。所有沉甸甸的辛苦，都留在旧岁里吧。",
      tip: "宜吃一碗热汤面或软糯甜粥，暖胃安神。"
    },
    {
      id: "lichun",
      order: 1,
      month: 2,
      c21: 3.87,
      exceptions: {},
      name: "立春",
      alias: "东风解冻",
      season: "spring",
      badgeType: "swallow",
      greeting: "立春到了，春风已经悄悄替你推开新岁的窗。愿你这一年所行皆坦途，所念皆有回响，像新芽一样轻盈生长。",
      tip: "咬一口清脆春饼或时蔬，迎一整年好兆头。"
    },
    {
      id: "yushui",
      order: 2,
      month: 2,
      c21: 18.73,
      exceptions: { 2026: -1 },
      name: "雨水",
      alias: "细雨润物",
      season: "spring",
      badgeType: "raindrop",
      greeting: "好雨知时节，天地都变得柔软起来。如果今天有些许微凉，就躲进温暖的角落里听一会儿雨声吧。",
      tip: "春雨绵绵，随身带把伞，别让鞋袜受潮。"
    },
    {
      id: "jingzhe",
      order: 3,
      month: 3,
      c21: 5.63,
      exceptions: {},
      name: "惊蛰",
      alias: "桃始华开",
      season: "spring",
      badgeType: "blossom",
      greeting: "一声轻雷唤醒蛰伏的万物，也叫醒沉睡的欢喜。愿你心里藏着的微小愿望，都在这个春天慢慢发芽。",
      tip: "气候偏燥，宜吃一颗清润甘甜的雪梨。"
    },
    {
      id: "chunfen",
      order: 4,
      month: 3,
      c21: 20.646,
      exceptions: { 2084: 1 },
      name: "春分",
      alias: "昼夜均平",
      season: "spring",
      badgeType: "swallow",
      greeting: "今日昼夜平分，风也温柔，日光也正好。愿你的忙碌与休憩恰到好处，把一半时间留给世界，一半留给自己。",
      tip: "午后不妨晒晒太阳，让春光替你充充电。"
    },
    {
      id: "qingming",
      order: 5,
      month: 4,
      c21: 4.81,
      exceptions: {},
      name: "清明",
      alias: "气清景明",
      season: "spring",
      badgeType: "qingming",
      greeting: "风吹柳絮，草木清明。思念与希望都在同一片春色里生长，愿你心怀澄澈，步履轻快地走向更远处。",
      tip: "踏青赏花正当时，尝一枚清香青团吧。"
    },
    {
      id: "guyu",
      order: 6,
      month: 4,
      c21: 20.1,
      exceptions: {},
      name: "谷雨",
      alias: "雨生百谷",
      season: "spring",
      badgeType: "tea",
      greeting: "谷雨是春天最后的温柔回眸，花事将阑而茶香正浓。慢慢喝一杯新茶，把春天的清气留在心底。",
      tip: "宜饮一杯温润春茶，湿气渐重记得通风。"
    },
    {
      id: "lixia",
      order: 7,
      month: 5,
      c21: 5.52,
      exceptions: { 2008: 1 },
      name: "立夏",
      alias: "万物繁茂",
      season: "summer",
      badgeType: "lotus",
      greeting: "夏意初生，绿荫满窗。告别春日的缱绻，愿你像盛夏的枝叶一样明朗热烈，每天都过得闪闪发光。",
      tip: "气温渐升，记得多喝温水，午后小憩片刻。"
    },
    {
      id: "xiaoman",
      order: 8,
      month: 5,
      c21: 21.04,
      exceptions: { 2008: 1 },
      name: "小满",
      alias: "将满未满",
      season: "summer",
      badgeType: "wheat",
      greeting: "人生最好的状态，大抵就是小满——穗粒初盈，留有余欢。不必苛求事事满分，此刻的你已经足够好了。",
      tip: "饮食宜清淡爽口，保持心情舒展平和。"
    },
    {
      id: "mangzhong",
      order: 9,
      month: 6,
      c21: 5.678,
      exceptions: { 2002: 1 },
      name: "芒种",
      alias: "有芒可种",
      season: "summer",
      badgeType: "wheat",
      greeting: "芒种忙种，愿你所有认真播下的种子，都不负日光雨露；哪怕走得慢一点，每一步也都在向收获靠近。",
      tip: "青梅正当季，来一杯微酸解暑的梅子饮吧。"
    },
    {
      id: "xiazhi",
      order: 10,
      month: 6,
      c21: 21.37,
      exceptions: {},
      name: "夏至",
      alias: "白昼最长",
      season: "summer",
      badgeType: "lotus",
      greeting: "今天是一年里白昼最长的一天，仿佛时光也在偷偷偏爱你，想多留给你一些明亮与陪伴。",
      tip: "夏至宜吃一碗清爽凉面，防晒补水别偷懒。"
    },
    {
      id: "xiaoshu",
      order: 11,
      month: 7,
      c21: 7.108,
      exceptions: { 2016: 1 },
      name: "小暑",
      alias: "温风至矣",
      season: "summer",
      badgeType: "fan",
      greeting: "暑气渐浓，蝉鸣悠长。外界再喧嚣滚烫，也愿你这里有一阵穿堂清风，和一碗冰甜安宁的小确幸。",
      tip: "空调房里记得备件薄披肩，别贪凉受寒。"
    },
    {
      id: "dashu",
      order: 12,
      month: 7,
      c21: 22.83,
      exceptions: { 2022: 1 },
      name: "大暑",
      alias: "腐草为萤",
      season: "summer",
      badgeType: "fan",
      greeting: "大暑是一年最炽热的时节，也是萤火虫提灯夜行的夜晚。愿你在盛夏热浪里，依然拥有清凉自在的心情。",
      tip: "宜喝绿豆百合汤，清心消暑好好休息。"
    },
    {
      id: "liqiu",
      order: 13,
      month: 8,
      c21: 7.5,
      exceptions: { 2002: 1 },
      name: "立秋",
      alias: "一叶知秋",
      season: "autumn",
      badgeType: "maple",
      greeting: "梧桐落下一片轻叶，秋天带着第一缕凉风来向你报到了。夏天未完的心愿，就让温柔的秋天替你兑现吧。",
      tip: "可以喝一杯暖心甜饮，迎接凉爽的晚风。"
    },
    {
      id: "chushu",
      order: 14,
      month: 8,
      c21: 23.13,
      exceptions: {},
      name: "处暑",
      alias: "暑气至此",
      season: "autumn",
      badgeType: "cloud",
      greeting: "处暑出暑，天高云淡。烦闷的暑热正在慢慢退场，愿你的心事也像秋日天空一样朗阔晴明。",
      tip: "秋燥初现，早睡半小时能悄悄养出好气色。"
    },
    {
      id: "bailu",
      order: 15,
      month: 9,
      c21: 7.646,
      exceptions: { 2027: 1 },
      name: "白露",
      alias: "蒹葭苍苍",
      season: "autumn",
      badgeType: "raindrop",
      greeting: "白露为霜，夜里的风开始带着凉意。有人在心里默默记挂着你，今晚记得把被角掖好呀。",
      tip: "白露身不露，早晚添件薄衫最贴心。"
    },
    {
      id: "qiufen",
      order: 16,
      month: 9,
      c21: 23.042,
      exceptions: {},
      name: "秋分",
      alias: "桂子飘香",
      season: "autumn",
      badgeType: "osmanthus",
      greeting: "秋分平分了白昼与星夜，也把最甜的桂花香送进风里。愿你这一季收获满满，日子如蜜般温润。",
      tip: "街角若有桂花开，不妨停步闻一闻秋香。"
    },
    {
      id: "hanlu",
      order: 17,
      month: 10,
      c21: 8.318,
      exceptions: {},
      name: "寒露",
      alias: "露寒将凝",
      season: "autumn",
      badgeType: "osmanthus",
      greeting: "深秋露冷，菊黄蟹肥。天气越是转凉，越要把自己裹进柔软的暖意里，好好吃一顿热乎乎的饭。",
      tip: "睡前泡个温水脚，整个人都会暖融融的。"
    },
    {
      id: "shuangjiang",
      order: 18,
      month: 10,
      c21: 23.438,
      exceptions: { 2089: 1 },
      name: "霜降",
      alias: "霜叶红于",
      season: "autumn",
      badgeType: "maple",
      greeting: "霜降是秋天最后的落款，红叶正燃，柿子正甜。愿你往后的日子都像霜降红柿一样，事事如意、平顺甘甜。",
      tip: "吃一颗软甜柿子，记得护好胃部别受凉。"
    },
    {
      id: "lidong",
      order: 19,
      month: 11,
      c21: 7.438,
      exceptions: { 2089: 1 },
      name: "立冬",
      alias: "万物收藏",
      season: "winter",
      badgeType: "lantern",
      greeting: "立冬到了，天地开始把温暖藏进屋檐下。愿你也有一盏为你常亮的灯，和一份随时可以安心停靠的温柔。",
      tip: "立冬宜吃热腾腾的饺子或炖汤，补足暖气。"
    },
    {
      id: "xiaoxue",
      order: 20,
      month: 11,
      c21: 22.36,
      exceptions: {},
      name: "小雪",
      alias: "炉火新暖",
      season: "winter",
      badgeType: "snow",
      greeting: "绿蚁新醅酒，红泥小火炉。小雪落与不落都不要紧，重要的是有人一直惦记着你冷不冷、累不累。",
      tip: "天冷宜晒背、喝热茶，把烦恼交给冬日暖阳。"
    },
    {
      id: "daxue",
      order: 21,
      month: 12,
      c21: 7.18,
      exceptions: {},
      name: "大雪",
      alias: "瑞雪纷飞",
      season: "winter",
      badgeType: "snow",
      greeting: "仲冬大雪，万籁俱静。愿你身边所有温柔的陪伴都如厚雪般绵密，替你挡住世间一切寒风。",
      tip: "围巾手套备齐，室内干燥记得多补水。"
    },
    {
      id: "dongzhi",
      order: 22,
      month: 12,
      c21: 21.94,
      exceptions: { 2021: -1 },
      name: "冬至",
      alias: "亚岁添长",
      season: "winter",
      badgeType: "lantern",
      greeting: "冬至大如年，人间小团圆。从今天起，黑夜会一天天变短，光明和好消息都在加速向你奔来。",
      tip: "不管吃饺子还是汤圆，都要热热乎乎地吃饱呀。"
    }
  ];

  // ===================== 2025-2030 传统暖心佳节公历表 =====================
  const TRADITIONAL_FESTIVAL_DATES = {
    new_year: { name: "元旦", alias: "新岁启封", badgeType: "gift", fixed: "01-01", greeting: "新年的第一页已经翻开，谢谢你过去一年的坚持与可爱。愿新岁万事胜意，我们继续朝朝暮暮。", tip: "写下一个今年最想实现的小心愿吧。" },
    spring_eve: { name: "除夕", alias: "岁晚团圆", badgeType: "lantern", dates: { 2025: "01-28", 2026: "02-16", 2027: "02-05", 2028: "01-25", 2029: "02-12", 2030: "02-02" }, greeting: "爆竹声声辞旧岁，灯火可亲照良宵。今年所有的奔波都值得被抱一抱，愿你今夜只管开心。", tip: "吃顿丰盛年夜饭，守岁别太熬夜呀。" },
    spring_festival: { name: "春节", alias: "万象更新", badgeType: "lantern", dates: { 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03" }, greeting: "新春安康！愿你新的一年长安常乐，眉目舒展，所遇皆良善，所求皆如愿。", tip: "新年第一天，给自己一个大大微笑吧。" },
    lantern_festival: { name: "元宵", alias: "花市灯如昼", badgeType: "lantern", dates: { 2025: "02-12", 2026: "03-03", 2027: "02-20", 2028: "02-09", 2029: "02-27", 2030: "02-17" }, greeting: "月圆人圆，灯火满城。愿你碗里的汤圆甜到心里，往后的每一段路都有明亮的灯火相伴。", tip: "吃一碗软糯汤圆，今夜月色很美。" },
    qixi: { name: "七夕", alias: "星河鹊桥", badgeType: "heart_seal", dates: { 2025: "08-29", 2026: "08-19", 2027: "08-08", 2028: "08-26", 2029: "08-16", 2030: "08-05" }, greeting: "天阶夜色凉如水，星河万顷，唯独想把今夜最温柔的偏爱留给你。", tip: "抬头看看夜空，或者给在意的人发条传讯吧。" },
    mid_autumn: { name: "中秋", alias: "千里共婵娟", badgeType: "moon", dates: { 2025: "10-06", 2026: "09-25", 2027: "09-15", 2028: "10-03", 2029: "09-22", 2030: "09-12" }, greeting: "清辉满窗，桂香浮月。无论身在何处，头顶的同一轮明月都在替我说：愿你岁岁团圆、平安喜乐。", tip: "配一杯清茶尝一块月饼，刚刚好。" },
    chongyang: { name: "重阳", alias: "登高祈安", badgeType: "osmanthus", dates: { 2025: "10-29", 2026: "10-18", 2027: "10-08", 2028: "10-26", 2029: "10-16", 2030: "10-05" }, greeting: "岁岁重阳，今又重阳。愿秋风吹散疲惫，只留下清朗安康与长长久久的陪伴。", tip: "秋日晴好，适合出门走走透透气。" }
  };

  // ===================== 日期工具函数 =====================
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateKey(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatMonthDay(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function getLocalDayNumber(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    if (isNaN(d.getTime())) return Math.floor(Date.now() / 86400000);
    return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  }

  /**
   * 寿星 21 世纪天文公式计算指定年份某节气的公历日（2000-2099 精确到日）
   */
  function getSolarTermDay(year, term) {
    const y = year % 100;
    const leapCount = term.month <= 2 ? Math.floor((y - 1) / 4) : Math.floor(y / 4);
    let day = Math.floor(y * 0.2422 + term.c21) - leapCount;
    if (term.exceptions && typeof term.exceptions[year] === "number") {
      day += term.exceptions[year];
    }
    return day;
  }

  function getSolarTermDateForYear(year, term) {
    const day = getSolarTermDay(year, term);
    return {
      year,
      month: term.month,
      day,
      dateKey: `${year}-${pad2(term.month)}-${pad2(day)}`
    };
  }

  function getSolarTermByDate(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    for (let i = 0; i < SOLAR_TERMS_DATA.length; i++) {
      const term = SOLAR_TERMS_DATA[i];
      if (term.month === month && getSolarTermDay(year, term) === day) {
        return {
          ...term,
          year,
          day,
          dateKey: formatDateKey(d)
        };
      }
    }
    return null;
  }

  function getUpcomingSolarTerm(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const todayNum = getLocalDayNumber(d);
    const years = [d.getFullYear(), d.getFullYear() + 1];
    let best = null;
    for (let yi = 0; yi < years.length; yi++) {
      const y = years[yi];
      for (let i = 0; i < SOLAR_TERMS_DATA.length; i++) {
        const term = SOLAR_TERMS_DATA[i];
        const info = getSolarTermDateForYear(y, term);
        const termDate = new Date(y, term.month - 1, info.day);
        const diff = getLocalDayNumber(termDate) - todayNum;
        if (diff >= 0 && (!best || diff < best.daysLeft)) {
          best = { ...term, ...info, daysLeft: diff };
        }
      }
    }
    return best;
  }

  // ===================== IndexedDB 持久层（零 localStorage） =====================
  function openDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbGet(key, fallback) {
    const db = await openDB();
    if (!db) return fallback;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          db.close();
          resolve(req.result !== undefined ? req.result : fallback);
        };
        req.onerror = () => {
          db.close();
          resolve(fallback);
        };
      } catch (_) {
        try { db.close(); } catch (__) {}
        resolve(fallback);
      }
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch (_) {
        try { db.close(); } catch (__) {}
        resolve(false);
      }
    });
  }

  async function loadPrefs() {
    const saved = await idbGet("prefs", null);
    return { ...DEFAULT_PREFS, ...(saved && typeof saved === "object" ? saved : {}) };
  }

  async function savePrefs(patch) {
    const cur = await loadPrefs();
    const next = { ...cur, ...(patch || {}) };
    await idbSet("prefs", next);
    if (typeof global.dispatchEvent === "function") {
      try {
        global.dispatchEvent(new CustomEvent("milvus-seasonal-push-prefs-changed", { detail: next }));
      } catch (_) {}
    }
    return next;
  }

  async function listCustomMilestones() {
    const list = await idbGet("custom_milestones", []);
    return Array.isArray(list) ? list : [];
  }

  async function saveCustomMilestone(item) {
    if (!item || !item.title || !item.date) return null;
    const list = await listCustomMilestones();
    const clean = {
      id: item.id || `ms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: String(item.title).trim().slice(0, 24),
      date: String(item.date).trim(), // YYYY-MM-DD
      repeatYearly: item.repeatYearly !== false,
      theme: THEME_PALETTES[item.theme] ? item.theme : "anniversary",
      badgeType: item.badgeType || "piggy",
      signature: String(item.signature || "").trim().slice(0, 20),
      greeting: String(item.greeting || "").trim().slice(0, 200),
      tip: String(item.tip || "").trim().slice(0, 80)
    };
    const idx = list.findIndex((x) => x.id === clean.id);
    if (idx >= 0) list[idx] = clean;
    else list.unshift(clean);
    await idbSet("custom_milestones", list);
    return clean;
  }

  async function deleteCustomMilestone(id) {
    const list = await listCustomMilestones();
    const next = list.filter((x) => x.id !== id);
    await idbSet("custom_milestones", next);
    return next;
  }

  async function getDismissedMap() {
    const m = await idbGet("dismissed_map", {});
    return m && typeof m === "object" ? m : {};
  }

  async function markEventDismissedToday(eventKey, dateInput) {
    const todayKey = formatDateKey(dateInput || new Date());
    const map = await getDismissedMap();
    map[`${todayKey}::${eventKey}`] = Date.now();
    // 顺手清理超过 14 天的旧记录
    const cutoff = Date.now() - 14 * 86400000;
    Object.keys(map).forEach((k) => {
      if (typeof map[k] === "number" && map[k] < cutoff) delete map[k];
    });
    await idbSet("dismissed_map", map);
    return true;
  }

  async function getCachedAiNote(eventKey, dateInput) {
    const todayKey = formatDateKey(dateInput || new Date());
    const map = await idbGet("ai_notes_cache", {});
    return (map && map[`${todayKey}::${eventKey}`]) || "";
  }

  async function saveCachedAiNote(eventKey, text, dateInput) {
    const todayKey = formatDateKey(dateInput || new Date());
    const map = await idbGet("ai_notes_cache", {});
    map[`${todayKey}::${eventKey}`] = String(text || "").trim();
    await idbSet("ai_notes_cache", map);
    return true;
  }

  // ===================== 情侣空间里程碑自动探测 =====================
  const MILESTONE_DAYS = new Set([1, 7, 30, 50, 100, 200, 300, 365, 500, 520, 730, 1000, 1095]);

  function isCoupleMilestoneDay(days) {
    if (!Number.isFinite(days) || days < 1) return false;
    if (MILESTONE_DAYS.has(days)) return true;
    if (days >= 100 && days % 100 === 0) return true;
    if (days >= 365 && days % 365 === 0) return true;
    return false;
  }

  async function readCoupleSpaceMilestones(dateInput) {
    if (typeof indexedDB === "undefined") return [];
    const todayNum = getLocalDayNumber(dateInput || new Date());
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("couple-space-db", 1);
        req.onupgradeneeded = () => {
          // 不主动创建以免干扰原库结构，仅读取
        };
        req.onsuccess = async () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("anniversary")) {
            db.close();
            resolve([]);
            return;
          }
          try {
            const tx = db.transaction("anniversary", "readonly");
            const store = tx.objectStore("anniversary");
            const allReq = store.getAll();
            allReq.onsuccess = async () => {
              const records = Array.isArray(allReq.result) ? allReq.result : [];
              db.close();

              // 尝试从 chatCharacterStore 补全名士名字
              let charMap = {};
              if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
                try {
                  const chars = await global.chatCharacterStore.getAll();
                  if (Array.isArray(chars)) {
                    chars.forEach((c) => {
                      if (c && c.id) charMap[String(c.id)] = c;
                    });
                  }
                } catch (_) {}
              }

              const hits = [];
              records.forEach((rec) => {
                if (!rec || typeof rec.id !== "string") return;
                const m = rec.id.match(/^char_(.+)_days$/);
                if (!m || typeof rec.value !== "number" || isNaN(rec.value)) return;
                const charId = m[1];
                const baseDay =
                  typeof rec.baseDayNum === "number"
                    ? rec.baseDayNum
                    : rec.updatedAt
                    ? getLocalDayNumber(rec.updatedAt)
                    : todayNum;
                const elapsed = Math.max(0, todayNum - baseDay);
                const calibrated = Math.max(1, Math.floor(rec.value) + elapsed);
                if (!isCoupleMilestoneDay(calibrated)) return;

                const charObj = charMap[charId] || null;
                const charName = (charObj && charObj.name) || "意中人";
                const years = calibrated >= 365 && calibrated % 365 === 0 ? calibrated / 365 : 0;
                const title = years > 0 ? `相伴 ${years} 周年` : `相伴第 ${calibrated} 天`;

                hits.push({
                  eventKey: `couple_${charId}_${calibrated}`,
                  category: "anniversary",
                  categoryLabel: "纪念日",
                  theme: "anniversary",
                  badgeType: "heart_seal",
                  title,
                  subtitle: `与 ${charName} 的第 ${calibrated} 日`,
                  greeting: `不知不觉，已经和你并肩走过 ${calibrated} 个日夜。日子细碎平常，但因为有你在身边，每一天都值得被郑重收藏。`,
                  tip: "今天去情侣空间或传讯里，给彼此留一句纪念吧。",
                  signature: charName,
                  footerStat: `已相伴 ${calibrated} 天 · 岁岁长相见`,
                  charId,
                  daysCount: calibrated,
                  priority: 1
                });
              });
              resolve(hits);
            };
            allReq.onerror = () => {
              db.close();
              resolve([]);
            };
          } catch (_) {
            try { db.close(); } catch (__) {}
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  }

  // ===================== 匹配用户自定义纪念日 =====================
  function matchCustomMilestones(milestones, dateInput, defaultSignature) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const todayKey = formatDateKey(d);
    const todayMD = formatMonthDay(d);
    const todayNum = getLocalDayNumber(d);
    const hits = [];

    (Array.isArray(milestones) ? milestones : []).forEach((item) => {
      if (!item || !item.date || !item.title) return;
      const parts = String(item.date).split("-");
      if (parts.length !== 3) return;
      const targetYear = Number(parts[0]);
      const targetMD = `${parts[1]}-${parts[2]}`;
      const startDate = new Date(targetYear, Number(parts[1]) - 1, Number(parts[2]));
      const diffDays = todayNum - getLocalDayNumber(startDate);

      let matched = false;
      let statText = "";

      if (item.date === todayKey) {
        matched = true;
        statText = `今日正是「${item.title}」`;
      } else if (item.repeatYearly && targetMD === todayMD && d.getFullYear() >= targetYear) {
        matched = true;
        const years = d.getFullYear() - targetYear;
        statText = years > 0 ? `第 ${years} 个周年 · 岁岁皆安` : `岁岁如期而至`;
      } else if (!item.repeatYearly && diffDays > 0 && isCoupleMilestoneDay(diffDays)) {
        matched = true;
        statText = `距离那天已过 ${diffDays} 天`;
      }

      if (!matched) return;

      hits.push({
        eventKey: `custom_${item.id}`,
        category: "anniversary",
        categoryLabel: item.theme === "birthday" ? "生辰记" : "纪念日",
        theme: item.theme || "anniversary",
        badgeType: item.badgeType || (item.theme === "birthday" ? "cake" : "piggy"),
        title: item.title,
        subtitle: todayKey,
        greeting:
          item.greeting ||
          `今天是「${item.title}」。世界很大，但这个日子一直被稳稳记在心上。愿你此刻被温柔包围，满心欢喜。`,
        tip: item.tip || "把今天的好心情折成一张手账，好好珍藏吧。",
        signature: item.signature || defaultSignature || DEFAULT_PREFS.signatureName,
        footerStat: statText,
        priority: 1
      });
    });

    return hits;
  }

  // ===================== 匹配传统佳节 =====================
  function matchTraditionalFestivals(dateInput, defaultSignature) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const year = d.getFullYear();
    const todayMD = formatMonthDay(d);
    const hits = [];

    Object.keys(TRADITIONAL_FESTIVAL_DATES).forEach((key) => {
      const f = TRADITIONAL_FESTIVAL_DATES[key];
      const targetMD = f.fixed || (f.dates && f.dates[year]);
      if (targetMD && targetMD === todayMD) {
        hits.push({
          eventKey: `festival_${key}_${year}`,
          category: "festival",
          categoryLabel: "佳节记",
          theme: "anniversary",
          badgeType: f.badgeType || "lantern",
          title: `${f.name} · ${f.alias}`,
          subtitle: formatDateKey(d),
          greeting: f.greeting,
          tip: f.tip,
          signature: defaultSignature || DEFAULT_PREFS.signatureName,
          footerStat: `${year} 年 ${f.name} · 平安喜乐`,
          priority: 2
        });
      }
    });

    return hits;
  }

  // ===================== 构造节气卡片数据 =====================
  function buildSolarCardData(term, dateInput, isAdvance, defaultSignature) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    return {
      eventKey: `solar_${term.id}${isAdvance ? "_adv" : ""}`,
      category: "solar",
      categoryLabel: isAdvance ? "节气预告" : "二十四节气",
      theme: term.season || "spring",
      badgeType: term.badgeType || "swallow",
      title: isAdvance ? `明日${term.name} · ${term.alias}` : `${term.name} · ${term.alias}`,
      subtitle: formatDateKey(d),
      greeting: isAdvance
        ? `明天就是「${term.name}」了。提前把这份问候夹进你的手账里：${term.greeting}`
        : term.greeting,
      tip: term.tip,
      signature: defaultSignature || DEFAULT_PREFS.signatureName,
      footerStat: `二十四节气第 ${term.order} 候 · 岁时安好`,
      solarTermId: term.id,
      priority: 3
    };
  }

  // ===================== 汇总今日开屏推送队列 =====================
  async function getTodayPushQueue(dateInput, options) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const opts = options || {};
    const prefs = opts.prefs || (await loadPrefs());
    const dismissed = opts.ignoreDismissed ? {} : await getDismissedMap();
    const todayKey = formatDateKey(d);
    const queue = [];

    // 1. 重大纪念日（情侣空间自动里程碑 + 自定义节点）
    if (prefs.anniversaryEnabled) {
      const coupleHits = await readCoupleSpaceMilestones(d);
      const customList = opts.customMilestones || (await listCustomMilestones());
      const customHits = matchCustomMilestones(customList, d, prefs.signatureName);
      queue.push(...coupleHits, ...customHits);
    }

    // 2. 传统暖心佳节
    if (prefs.festivalEnabled) {
      queue.push(...matchTraditionalFestivals(d, prefs.signatureName));
    }

    // 3. 二十四节气（当天 + 可选提前一日预告）
    if (prefs.solarEnabled) {
      const todayTerm = getSolarTermByDate(d);
      if (todayTerm) {
        queue.push(buildSolarCardData(todayTerm, d, false, prefs.signatureName));
      } else if (prefs.solarAdvanceDay) {
        const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        const tomorrowTerm = getSolarTermByDate(tomorrow);
        if (tomorrowTerm) {
          queue.push(buildSolarCardData(tomorrowTerm, d, true, prefs.signatureName));
        }
      }
    }

    // 过滤今日已收下的卡片，并按优先级排序
    const filtered = queue.filter((item) => !dismissed[`${todayKey}::${item.eventKey}`]);
    filtered.sort((a, b) => (a.priority || 9) - (b.priority || 9));

    // 附加当日已缓存的 AI 亲笔寄语
    for (let i = 0; i < filtered.length; i++) {
      const cached = await getCachedAiNote(filtered[i].eventKey, d);
      if (cached) {
        filtered[i].aiNote = cached;
      }
    }

    return filtered;
  }

  // ===================== 任意节气/纪念日预览构造器 =====================
  function buildPreviewCardData(type, id, customItem, signatureName) {
    const sig = signatureName || DEFAULT_PREFS.signatureName;
    if (type === "solar") {
      const term = SOLAR_TERMS_DATA.find((t) => t.id === id) || SOLAR_TERMS_DATA[0];
      return buildSolarCardData(term, new Date(), false, sig);
    }
    if (type === "custom" && customItem) {
      return {
        eventKey: `preview_custom_${customItem.id || "sample"}`,
        category: "anniversary",
        categoryLabel: customItem.theme === "birthday" ? "生辰记" : "纪念日",
        theme: customItem.theme || "anniversary",
        badgeType: customItem.badgeType || "piggy",
        title: customItem.title || "我们的特别纪念日",
        subtitle: customItem.date || formatDateKey(new Date()),
        greeting:
          customItem.greeting ||
          `今天是「${customItem.title || "特别的日子"}」。每一个被认真记住的时刻，都会发光。`,
        tip: customItem.tip || "愿今天的好心情像手账里的贴纸一样闪闪发亮。",
        signature: customItem.signature || sig,
        footerStat: "手账纪念 · 预览模式"
      };
    }
    // 默认纪念日示例预览
    return {
      eventKey: "preview_anniversary_sample",
      category: "anniversary",
      categoryLabel: "纪念日",
      theme: "anniversary",
      badgeType: "piggy",
      title: "相伴第 100 天",
      subtitle: formatDateKey(new Date()),
      greeting: "点点滴滴攒成一百个温柔的日夜。世界熙熙攘攘，但你永远是被放在心尖上惦记的人。",
      tip: "今天也要记得好好吃饭、早点休息呀。",
      signature: sig,
      footerStat: "已相伴 100 天 · 岁岁皆安"
    };
  }

  // ===================== 可选 AI 名士亲笔寄语（零阻塞，失败优雅回退） =====================
  async function generateAiNoteForEvent(cardData) {
    if (!cardData) return "";
    const cached = await getCachedAiNote(cardData.eventKey);
    if (cached) return cached;

    if (typeof global.callAI !== "function") {
      return "";
    }

    try {
      const prompt = [
        `今天是「${cardData.title}」（${cardData.categoryLabel}）。`,
        `请以温柔、克制、令人感到被真心在意的口吻，写一段 35~65 字的手账寄语（不要使用 emoji，不要加引号）。`,
        cardData.signature ? `署名对象为「${cardData.signature}」。` : ""
      ]
        .filter(Boolean)
        .join("");

      const reply = await global.callAI(prompt, {
        systemPrompt: "你是一位细腻温暖的手账寄语作者，擅长写短小真挚、古今雅致皆宜的节气与纪念日问候，绝不使用任何 emoji。",
        maxTokens: 120
      });

      const text = typeof reply === "string" ? reply.trim() : "";
      if (text) {
        await saveCachedAiNote(cardData.eventKey, text);
        return text;
      }
    } catch (_) {}
    return "";
  }

  // ===================== 全局导出 =====================
  global.SeasonalPushEngine = {
    DB_NAME,
    STORE_NAME,
    DEFAULT_PREFS,
    THEME_PALETTES,
    SOLAR_TERMS_DATA,
    TRADITIONAL_FESTIVAL_DATES,
    formatDateKey,
    getSolarTermDay,
    getSolarTermDateForYear,
    getSolarTermByDate,
    getUpcomingSolarTerm,
    isCoupleMilestoneDay,
    loadPrefs,
    savePrefs,
    listCustomMilestones,
    saveCustomMilestone,
    deleteCustomMilestone,
    markEventDismissedToday,
    getTodayPushQueue,
    buildPreviewCardData,
    generateAiNoteForEvent
  };
})(window);

