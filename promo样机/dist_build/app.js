const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

/* ================= 每个画面的顶部字幕与底部快捷卖点 ================= */
const SCREEN_META = {
  lock: {
    tag: "锁屏 · 第一面",
    title: "如果，你的手机里<br>住着一个会回你消息的袁基？",
    sub: "可点击：右上角「···」进入装扮台 ｜ 点击袁基通知进聊天 ｜ 底部解锁桌面",
    tags: [
      {t:"🎨 点右上角 ··· 装扮锁屏", to:"lock_guide"},
      {t:"💌 点通知直接找袁基聊天", to:"chat"},
      {t:"🔓 解锁进入主屏幕", to:"home1"}
    ]
  },
  lock_guide: {
    tag: "锁屏装扮 · 交互引导",
    title: "名士手把手带你逛装扮台<br>滑块一动，锁屏实时生效",
    sub: "点击弹窗中的「下一步」或「跳过」进入锁屏装扮面板",
    tags: [
      {t:"👉 点击「下一步」进入装扮面板", to:"lock_diy1"},
      {t:"🔙 返回锁屏", to:"lock"}
    ]
  },
  lock_diy1: {
    tag: "锁屏装扮 · 背景壁纸",
    title: "四套莫兰迪/青黛/海棠/墨玉预设<br>支持上传全屏自定义壁纸",
    sub: "可点击顶部页签切换：「背景壁纸」「元素透明度」「自定义CSS」",
    tags: [
      {t:"🎨 背景壁纸（当前）", to:"lock_diy1"},
      {t:"🎚️ 切到「元素透明度」", to:"lock_diy2"},
      {t:"💻 切到「自定义CSS」", to:"lock_diy3"}
    ]
  },
  lock_diy2: {
    tag: "锁屏装扮 · 元素与字体",
    title: "时钟颜色 · 大小 · 垂直偏移<br>古风宋楷与文字阴影随心调",
    sub: "点击顶部「自定义CSS」页签或底部「完成并保存」",
    tags: [
      {t:"🎨 切回「背景壁纸」", to:"lock_diy1"},
      {t:"🎚️ 元素透明度（当前）", to:"lock_diy2"},
      {t:"💻 切到「自定义CSS」", to:"lock_diy3"}
    ]
  },
  lock_diy3: {
    tag: "锁屏装扮 · 自定义 CSS",
    title: "独立作用域 CSS 编辑器<br>一键插入锁屏专属类名",
    sub: "点击底部绿色「完成并保存」进入主屏幕桌面",
    tags: [
      {t:"🎨 背景壁纸", to:"lock_diy1"},
      {t:"🎚️ 元素透明度", to:"lock_diy2"},
      {t:"✅ 完成并进入桌面", to:"home1"}
    ]
  },
  home1: {
    tag: "主屏幕 · 桌面布局",
    title: "折叠式天气卡片 × 桌面第 1 页全亮<br>12 款应用图标已 100% 接入真实交互！",
    sub: "绣衣楼、杏林、情侣空间、天气、论坛、日历、传讯、阅读、太疾驰、音乐、观影、游戏全部可点",
    tags: [
      {t:"🗣️ 论坛超话", to:"lt1"},
      {t:"📅 袁基日历", to:"rl1"},
      {t:"📖 今日阅读", to:"yd1"},
      {t:"🎵 共听音乐", to:"yy"},
      {t:"🎬 傩·观影", to:"ngy"},
      {t:"🕹️ 傩·游戏", to:"nyx"}
    ]
  },
  home1_expand: {
    tag: "主屏幕 · 折叠式卡片展开",
    title: "展开就是一整段名士专属叮嘱<br>“冷得像冰一样，快回屋陪我”",
    sub: "再次点击卡片即可收起，或直接点击下方露出的应用图标",
    tags: [
      {t:"👆 点击收起卡片", to:"home1"},
      {t:"🏛️ 打开绣衣楼", to:"xyl1"},
      {t:"💗 打开情侣空间", to:"cp1"}
    ]
  },
  home2: {
    tag: "主屏幕 · 第 2 页",
    title: "傩·电台 · 修业 · 掌机 · 云镜<br>今日学宫与 OC 点单全在掌中",
    sub: "支持自由留白与拖拽收纳；点击各个图标查看介绍，或点圆点翻回第 1 页",
    tags: [
      {t:"👈 翻回桌面第 1 页", to:"home1"},
      {t:"⚡ 打开太疾驰", to:"tjc1"},
      {t:"💬 打开传讯", to:"chat"}
    ]
  },
  xyl1: {
    tag: "绣衣楼 · 工作台",
    title: "楼主办公重地 · 九格楼务总览<br>“优化伙食支出，推动降本增效”",
    sub: "点击顶部密报或九宫格查看详情，点底部「消息」「通讯录」「我的」切换页签",
    tags: [
      {t:"🏛️ 工作台（当前）", to:"xyl1"},
      {t:"💬 切到「消息」", to:"xyl2"},
      {t:"📒 切到「通讯录」", to:"xyl3"},
      {t:"👤 切到「我的」", to:"xyl4"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  xyl2: {
    tag: "绣衣楼 · 楼内消息",
    title: "心纸君与飞鸢送达的加密回信<br>联动世界书设定，一对一密谈",
    sub: "点击张修消息卡查看详情，或点底部「通讯录」「我的」继续浏览",
    tags: [
      {t:"🏛️ 工作台", to:"xyl1"},
      {t:"💬 消息（当前）", to:"xyl2"},
      {t:"📒 切到「通讯录」", to:"xyl3"},
      {t:"👤 切到「我的」", to:"xyl4"}
    ]
  },
  xyl3: {
    tag: "绣衣楼 · 通讯录",
    title: "楼内联系人 · 星标心腹 · 四部群组<br>可替每位密探改小传、换画像",
    sub: "点击四张名录卡片查看功能，或点底部「我的」查看身份与私库钱包",
    tags: [
      {t:"🏛️ 工作台", to:"xyl1"},
      {t:"💬 消息", to:"xyl2"},
      {t:"📒 通讯录（当前）", to:"xyl3"},
      {t:"👤 切到「我的」", to:"xyl4"}
    ]
  },
  xyl4: {
    tag: "绣衣楼 · 楼主档案与私库",
    title: "官职名号全楼同步 · 一键切换马甲<br>四位密码核验私库钱包",
    sub: "点击「切换配置库身份」或「我的钱包」，点左上角 < 返回主屏幕",
    tags: [
      {t:"🏛️ 工作台", to:"xyl1"},
      {t:"💬 消息", to:"xyl2"},
      {t:"📒 通讯录", to:"xyl3"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  xl1: {
    tag: "杏林济生 · 诊疗咨询",
    title: "“你好，病患。请问哪里需要医治？”<br>八大症候辨症，名医在线坐诊",
    sub: "点击任意病症胶囊（头痛/精神萎靡/心理疾病等）或底部「选好了 >」立即挂号",
    tags: [
      {t:"💊 点击「选好了 >」挂号", to:"xl2"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  xl2: {
    tag: "杏林济生 · 华佗坐诊排表",
    title: "挂号成功 #48 · 当前坐诊：华佗<br>蒯良、士燮、程普、张修同堂候诊",
    sub: "点击排表卡片查看煎药台联动说明，或点底部「返回重新选择」",
    tags: [
      {t:"↩ 返回重新选择病症", to:"xl1"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  cp1: {
    tag: "情侣空间 · 第一页八宫格",
    title: "今天是我与【袁基】相伴第 1 天<br>陪伴 · 拆解 · 记账 · 心愿 · 飞花令",
    sub: "点击八宫格任意卡片查看玩法，点底部小圆点（或右侧翻页球）翻到第 2 页",
    tags: [
      {t:"💗 第1页八宫格（当前）", to:"cp1"},
      {t:"👉 翻到第2页（捉迷藏/手账/风月）", to:"cp2"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  cp2: {
    tag: "情侣空间 · 第二页重头戏",
    title: "府邸捉迷藏 · 14页物理翻页手账<br>还有双人掷骰对弈「风月传说」",
    sub: "点击三张修长卡片查看详情，点底部圆点可切回第 1 页",
    tags: [
      {t:"👈 切回第1页八宫格", to:"cp1"},
      {t:"💗 第2页三大玩法（当前）", to:"cp2"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  weather: {
    tag: "天气 · 双城物候连线",
    title: "广陵 10°C × 袁基·洛阳市<br>异地天气与日落时刻（17:25）同屏守候",
    sub: "点击「袁基·洛阳市」或日落看板查看互动细节，点左上角 < 返回主屏幕",
    tags: [
      {t:"🏠 返回主屏幕", to:"home1"},
      {t:"💌 去桌面看折叠天气卡片", to:"home1_expand"},
      {t:"💬 去传讯提醒袁基添衣", to:"chat"}
    ]
  },
  tjc1: {
    tag: "太疾驰 · 餐饮外送",
    title: "福券卡包 · 结算单一键汇总<br>点底部四个标签可真实切页",
    sub: "试试点击底部：「餐饮」「购物」「二手」「抢票」或中间绿色的「元」字结算钮",
    tags: [
      {t:"🍜 餐饮（当前）", to:"tjc1"},
      {t:"🛍️ 切到「购物」", to:"tjc2"},
      {t:"🏺 切到「二手」", to:"tjc3"},
      {t:"🎟️ 切到「抢票」", to:"tjc4"}
    ]
  },
  tjc2: {
    tag: "太疾驰 · 同城购物",
    title: "华佗本草 · 青州蜜饯 · 医药美妆<br>名士开店，评语全是梗",
    sub: "点击底部「二手」「抢票」继续逛，或点中间「元」找袁基代付",
    tags: [
      {t:"🍜 餐饮", to:"tjc1"},
      {t:"🛍️ 购物（当前）", to:"tjc2"},
      {t:"🏺 切到「二手」", to:"tjc3"},
      {t:"🎟️ 切到「抢票」", to:"tjc4"}
    ]
  },
  tjc3: {
    tag: "太疾驰 · 二手集市",
    title: "每日三选一财神红包必掉五铢钱<br>名士亲售闲置，还能挂出去吆喝",
    sub: "点击顶部红包看锦囊详情，或点底部「抢票」去戏楼锁座",
    tags: [
      {t:"🍜 餐饮", to:"tjc1"},
      {t:"🛍️ 购物", to:"tjc2"},
      {t:"🏺 二手（当前）", to:"tjc3"},
      {t:"🎟️ 切到「抢票」", to:"tjc4"}
    ]
  },
  tjc4: {
    tag: "太疾驰 · 戏楼抢票",
    title: "宵始日 · 荧惑日 · 角抵幻术乐舞<br>锁座自动写入桌面日历",
    sub: "点击底部正中央绿色的「元」按钮，体验找袁基飞鸽代付！",
    tags: [
      {t:"🍜 餐饮", to:"tjc1"},
      {t:"🛍️ 购物", to:"tjc2"},
      {t:"🏺 二手", to:"tjc3"},
      {t:"🧾 点「元」找袁基代付", modal:"pay"}
    ]
  },
  lt1: {
    tag: "论坛 · 主页一览",
    title: "广陵八卦广场 × 寻找你的兴趣圈<br>宠兽观察员、话题榜与超话一网打尽",
    sub: "点击底部 4 个图标可在「主页」「名人榜」「关系网」「超话圈」之间自由切换",
    tags: [
      {t:"🏠 主页（当前）", to:"lt1"},
      {t:"🔥 话题名人榜", to:"lt2"},
      {t:"🕸️ 动态关系网", to:"lt3"},
      {t:"# 袁基超话圈", to:"lt4"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  lt2: {
    tag: "论坛 · 话题名人榜",
    title: "关系网实时触发全城热搜<br>张绣 98.6万「爆」· 甘宁急求面脂方",
    sub: "点击任意热搜条看八卦详情，或点底部图标切到「关系网」与「超话圈」",
    tags: [
      {t:"🏠 主页", to:"lt1"},
      {t:"🔥 名人榜（当前）", to:"lt2"},
      {t:"🕸️ 切到「关系网」", to:"lt3"},
      {t:"# 切到「袁基超话」", to:"lt4"}
    ]
  },
  lt3: {
    tag: "论坛 · 可视化关系网",
    title: "广陵王人际星图 · 关系变动触发热搜<br>支持居中、导入、AI 刷新与手动编辑",
    sub: "点击下方的「袁基」头像节点，直达袁基专属超话圈！",
    tags: [
      {t:"🏠 论坛主页", to:"lt1"},
      {t:"🔥 话题名人榜", to:"lt2"},
      {t:"# 去「袁基超话圈」", to:"lt4"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  lt4: {
    tag: "论坛 · 袁基超话圈",
    title: "“救命，谁懂‘殿下，偶遇’的杀伤力！”<br>颜粉头子与考据党齐聚一堂",
    sub: "点击热帖点赞互动，或点左上角 < 返回主屏幕",
    tags: [
      {t:"🏠 论坛主页", to:"lt1"},
      {t:"🔥 话题名人榜", to:"lt2"},
      {t:"🕸️ 关系网", to:"lt3"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  rl1: {
    tag: "日历 · 袁基的 AI 日程",
    title: "天干地支纪年 × 名士私密排期<br>点开标记日期，偷看袁基都在忙什么",
    sub: "点击日历中的「1日」「10日」「18日」，分别查看已毕、进行与未竟之事！",
    tags: [
      {t:"1日 · 已毕之事", to:"rl2"},
      {t:"10日 · 进行之事", to:"rl3"},
      {t:"18日 · 未竟之事", to:"rl4"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  rl2: {
    tag: "日历 · 已毕之事",
    title: "1日 05:30 整肃车驾赴朝会<br>“依旧作温良退让模样，顺手收拢各家消息”",
    sub: "点击顶部三个页签在「已毕之事」「进行之事」「未竟之事」之间切换",
    tags: [
      {t:"已毕之事（当前）", to:"rl2"},
      {t:"👉 进行之事（夜烛密信）", to:"rl3"},
      {t:"未竟之事（雅集抚琴）", to:"rl4"},
      {t:"📅 回月历总览", to:"rl1"}
    ]
  },
  rl3: {
    tag: "日历 · 进行之事",
    title: "10日 23:00 客舍夜烛批阅密信<br>“既被殿下抓个正着，殿下此刻又缘何未眠？”",
    sub: "底下还有「陪殿下起早出游」，点击顶部「未竟之事」继续翻看",
    tags: [
      {t:"已毕之事", to:"rl2"},
      {t:"进行之事（当前）", to:"rl3"},
      {t:"👉 未竟之事（温泉夜弈）", to:"rl4"},
      {t:"📅 回月历总览", to:"rl1"}
    ]
  },
  rl4: {
    tag: "日历 · 未竟之事",
    title: "18日 19:00 雅集抚琴与验看弓弦<br>“议事走神时，忍不住在纸角摹画殿下小像”",
    sub: "点击顶部页签切换状态，或点左上角 < 返回主屏幕",
    tags: [
      {t:"已毕之事", to:"rl2"},
      {t:"进行之事", to:"rl3"},
      {t:"📅 回月历总览", to:"rl1"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  yd1: {
    tag: "阅读 · 今日阅读书架",
    title: "导入本地 EPUB / TXT 典籍<br>四色护眼纸笺 × 名士窗外掌灯伴读",
    sub: "点击顶部「今日阅读 ∨」或右下紫色星标，切到「天下书城」逛同人话本！",
    tags: [
      {t:"📖 今日阅读（当前）", to:"yd1"},
      {t:"📚 去逛「天下书城」", to:"yd2"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  yd2: {
    tag: "阅读 · 天下书城",
    title: "《绣衣楼风华录》《无毒不丈夫：贾诩》<br>支持换一批、在线试读与收藏入藏书阁",
    sub: "点击底部「藏书阁」切回今日阅读，或点左上角 < 返回主屏幕",
    tags: [
      {t:"📖 回「藏书阁」", to:"yd1"},
      {t:"📚 天下书城（当前）", to:"yd2"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  yy: {
    tag: "音乐 · 与袁基共听",
    title: "正在播放《金杯共饮 - 代号鸢》<br>边听歌边发弹幕，支持歌词微调与贴词",
    sub: "点击右侧「袁基」气泡触发共听回应，或点左上角 < 返回主屏幕",
    tags: [
      {t:"🏠 返回主屏幕", to:"home1"},
      {t:"💬 去传讯继续聊", to:"chat"},
      {t:"🎬 去傩·观影看片", to:"ngy"}
    ]
  },
  ngy: {
    tag: "傩·观影 · 时光放映室",
    title: "听听「袁基」看什么 · 胶卷票根评《罗生门》<br>“可愿陪在下在这雨夜破庙，再赌一回人心真假？”",
    sub: "已放映 6 部 · 均分 9.3；点击「听听袁基看什么」或《罗生门》票根看详情",
    tags: [
      {t:"🕹️ 去看看「傩·游戏」", to:"nyx"},
      {t:"🎵 去「共听音乐」", to:"yy"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  nyx: {
    tag: "傩·游戏 · 复古卡带游戏仓",
    title: "袁基在玩《全面战争：三国》137.5h（9.1分）<br>“殿下，偶遇。此局权谋，唯恐失了先手”",
    sub: "藏卡 10 款 · 累计 672.5h；点击卡片或「看看袁基在玩什么」查看详情",
    tags: [
      {t:"🎬 回到「傩·观影」", to:"ngy"},
      {t:"⚡ 去逛「太疾驰」", to:"tjc1"},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  },
  sz1: {
    tag: "设置 · 核心配置",
    title: "广陵王档案 · API 配置 · 世界书<br>一键直达锁屏装扮设置",
    sub: "点击「锁屏装扮设置」可直达装扮面板，点底部「下滑」看主题与长期记忆",
    tags: [
      {t:"🎨 直达锁屏装扮", to:"lock_diy1"},
      {t:"↓ 进阶配置（长期记忆）", to:"sz2"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  sz2: {
    tag: "设置 · 进阶配置",
    title: "字体 · 主题 · 长期记忆引擎<br>自定义通知横幅与主动消息状态",
    sub: "点击「长期记忆」或「通知与状态」查看说明，点底部回到设置顶部",
    tags: [
      {t:"↑ 回到设置顶部", to:"sz1"},
      {t:"🎨 锁屏装扮", to:"lock_diy1"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  yx1: {
    tag: "休闲一刻 · 游戏合集",
    title: "修武扬文 · 十五种东汉小游戏<br>木桩、蹴鞠、射箭、音律、2048 应有尽有",
    sub: "点击顶部「游戏」「工具」「其他」三个大类自由切换！",
    tags: [
      {t:"🎮 游戏（当前）", to:"yx1"},
      {t:"🔧 切到「工具」", to:"yx2"},
      {t:"✨ 切到「其他」", to:"yx3"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  yx2: {
    tag: "休闲一刻 · 东汉工具箱",
    title: "州郡统计年表 × 东汉驿路通<br>看粮储赋税，游历天下郡县触发奇遇",
    sub: "点击「州郡统计年表」「东汉驿路通」查看详情，或切到「其他」页签",
    tags: [
      {t:"🎮 游戏", to:"yx1"},
      {t:"🔧 工具（当前）", to:"yx2"},
      {t:"✨ 切到「其他」", to:"yx3"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  yx3: {
    tag: "休闲一刻 · 奇趣观测",
    title: "献帝晴雨表 × 列星星象图<br>还有蝴蝶效应沙盘推演与方天水镜",
    sub: "点击顶部页签切换分类，或点左上角 < 返回主屏幕",
    tags: [
      {t:"🎮 游戏", to:"yx1"},
      {t:"🔧 工具", to:"yx2"},
      {t:"✨ 其他（当前）", to:"yx3"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  sc1: {
    tag: "商城 · 琳琅货架",
    title: "自由收纳桌面图标 · 一键放回桌面<br>把不常用的应用收进货架留出壁纸空间",
    sub: "点击顶部「琳琅货架」「桌面管理」「+ 导入/新建」切换三大功能页",
    tags: [
      {t:"🛍️ 琳琅货架（当前）", to:"sc1"},
      {t:"📱 切到「桌面管理」", to:"sc2"},
      {t:"🧩 切到「导入/新建」", to:"sc3"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  sc2: {
    tag: "商城 · 桌面管理 (18)",
    title: "18 款主屏幕应用席位一目了然<br>随时一键收纳至商城",
    sub: "点击顶部「+ 导入/新建」体验沙盒自制 HTML 微应用！",
    tags: [
      {t:"🛍️ 琳琅货架", to:"sc1"},
      {t:"📱 桌面管理（当前）", to:"sc2"},
      {t:"🧩 切到「导入/新建」", to:"sc3"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  sc3: {
    tag: "商城 · 自制或导入微应用",
    title: "粘贴标准 HTML，独立沙盒运行<br>无限扩展你的专属微应用生态！",
    sub: "支持自定义应用名称、简介与图标样式并上架桌面，点左上角 < 返回第 2 页",
    tags: [
      {t:"🛍️ 琳琅货架", to:"sc1"},
      {t:"📱 桌面管理", to:"sc2"},
      {t:"👉 回桌面第 2 页", to:"home2"}
    ]
  },
  nyj: {
    tag: "傩·云镜 · 袁基私密搜索足迹",
    title: "“初次赠送贴身手作是否失礼轻浮”<br>“受惊后的鸢雀怎样喂养才肯靠近人手”",
    sub: "偷看 INFJ 袁基的私密搜索与密录便签（香囊上的鸢鸟已绣了七日……）！",
    tags: [
      {t:"📻 去「傩·电台」", to:"ndt"},
      {t:"🎮 去「傩·掌机」", to:"nzj"},
      {t:"👈 回桌面第 2 页", to:"home2"}
    ]
  },
  nzj: {
    tag: "傩·掌机 · NUO BOY",
    title: "1:1 复古 Game Boy 拟物掌机<br>Ruffle WASM 引擎，SWF 卡带即插即玩",
    sub: "点击掌机上的方向键 / 空格 / A / B 按键或顶部「卡带」按钮互动！",
    tags: [
      {t:"🔎 去「傩·云镜」", to:"nyj"},
      {t:"📻 去「傩·电台」", to:"ndt"},
      {t:"👈 回桌面第 2 页", to:"home2"}
    ]
  },
  ndt: {
    tag: "傩·电台 · 复古木质收音机",
    title: "FM 101.7 · 与袁基同听中<br>象牙旋钮自动锁频，退后台继续播",
    sub: "点击象牙 TUNER 旋钮、同听胶囊或底部「重新编排袁基全天收听日程」",
    tags: [
      {t:"🎮 去「傩·掌机」", to:"nzj"},
      {t:"🔎 去「傩·云镜」", to:"nyj"},
      {t:"👈 回桌面第 2 页", to:"home2"}
    ]
  },
  xg1: {
    tag: "今日学宫 · 辟雍校园",
    title: "辰时晨读 · 洛南茗社招贤启<br>礼乐系首席学长袁基全程伴读",
    sub: "点击底部 5 个页签，畅游「校园」「服务」「学宫圈」「讯息」「我的」",
    tags: [
      {t:"🏫 校园（当前）", to:"xg1"},
      {t:"🏛️ 服务", to:"xg2"},
      {t:"💬 学宫圈", to:"xg3"},
      {t:"✉️ 讯息", to:"xg4"},
      {t:"👤 我的", to:"xg5"}
    ]
  },
  xg2: {
    tag: "今日学宫 · 常用教务服务",
    title: "申请离校 · 古籍借阅 · 马车时刻<br>通行符牒与查看空教室一应俱全",
    sub: "点击底部「学宫圈」看袁基在校园热搜上的锐评！",
    tags: [
      {t:"🏫 校园", to:"xg1"},
      {t:"🏛️ 服务（当前）", to:"xg2"},
      {t:"💬 去「学宫圈」", to:"xg3"},
      {t:"✉️ 讯息", to:"xg4"},
      {t:"👤 我的", to:"xg5"}
    ]
  },
  xg3: {
    tag: "今日学宫 · 学宫圈热榜",
    title: "#辟雍晨读点卯捉逃风波#（4.2万热度）<br>袁基学长：“不知某位昨夜迟睡的贵客……”",
    sub: "点击底部「讯息」偷看袁基和教务管事们的私下往来！",
    tags: [
      {t:"🏫 校园", to:"xg1"},
      {t:"🏛️ 服务", to:"xg2"},
      {t:"💬 学宫圈（当前）", to:"xg3"},
      {t:"✉️ 去「讯息处」", to:"xg4"},
      {t:"👤 我的", to:"xg5"}
    ]
  },
  xg4: {
    tag: "今日学宫 · 学宫讯息处",
    title: "桂花酪浆留膳 · 古籍借还 · 演武场借弓<br>管事、主簿、夫子全在替袁基打点你的日常",
    sub: "点击底部「我的」查看袁基太学掌仪个人档案与分身切换",
    tags: [
      {t:"🏫 校园", to:"xg1"},
      {t:"🏛️ 服务", to:"xg2"},
      {t:"💬 学宫圈", to:"xg3"},
      {t:"✉️ 讯息（当前）", to:"xg4"},
      {t:"👤 去「我的」", to:"xg5"}
    ]
  },
  xg5: {
    tag: "今日学宫 · 袁基个人中心",
    title: "礼乐系·首席学长 · 太学掌仪<br>已修学分 48.0 · 符牒余额 ¥5200.0",
    sub: "支持右上角一键「切换分身」体验不同名士的学宫视角，点左上角 < 返回桌面第 2 页",
    tags: [
      {t:"🏫 校园", to:"xg1"},
      {t:"🏛️ 服务", to:"xg2"},
      {t:"💬 学宫圈", to:"xg3"},
      {t:"👈 回桌面第 2 页", to:"home2"}
    ]
  },
  dd1: {
    tag: "OC点单 · 旗舰店首页",
    title: "宛城狼营 × 绣衣楼 联名特供<br>军营面交 / 信使送达 · AI 一键全域建店",
    sub: "点击底部「首页」「点单」「会员」「订单」完整体验 OC 专属门店！",
    tags: [
      {t:"🏠 首页（当前）", to:"dd1"},
      {t:"📋 去「点单」", to:"dd2"},
      {t:"👑 会员", to:"dd3"},
      {t:"📦 订单", to:"dd4"}
    ]
  },
  dd2: {
    tag: "OC点单 · 联名新品菜单",
    title: "飞云同款狗粮礼盒 × 狼毛大氅典藏款<br>选规格下单，立享狼营特惠券包",
    sub: "点击底部「会员」查看狼营青铜/白银权益卡与军饷储值中心",
    tags: [
      {t:"🏠 首页", to:"dd1"},
      {t:"📋 点单（当前）", to:"dd2"},
      {t:"👑 去「会员」", to:"dd3"},
      {t:"📦 订单", to:"dd4"}
    ]
  },
  dd3: {
    tag: "OC点单 · VIP 会员中心",
    title: "绣衣楼 VIP · 狼营青铜卡 / 白银卡<br>储值军饷赠狼毛挂件与狼牙吊坠",
    sub: "点击底部「订单」查看进行中的安全屋交接凭证！",
    tags: [
      {t:"🏠 首页", to:"dd1"},
      {t:"📋 点单", to:"dd2"},
      {t:"👑 会员（当前）", to:"dd3"},
      {t:"📦 去「订单」", to:"dd4"}
    ]
  },
  dd4: {
    tag: "OC点单 · 安全屋订单追踪",
    title: "单号 #A227 · 契约成立·进行中<br>请凭单号前往安全屋交接，支持评价与凭证小票",
    sub: "点底部按钮返回桌面第 2 页，或切换其他页签",
    tags: [
      {t:"🏠 首页", to:"dd1"},
      {t:"📋 点单", to:"dd2"},
      {t:"👑 会员", to:"dd3"},
      {t:"👈 回桌面第 2 页", to:"home2"}
    ]
  },
  xw1: {
    tag: "修武扬文 · 第 1 页",
    title: "木桩训练 · 蹴鞠 · 射箭 · 敏捷训练<br>十余款东汉解压小游戏内置即玩",
    sub: "点击顶部橙色圆点或右侧箭头翻看第 2 页、第 3 页小游戏！",
    tags: [
      {t:"第 1 页（当前）", to:"xw1"},
      {t:"👉 第 2 页（音律/2048）", to:"xw2"},
      {t:"第 3 页（消消/矿工）", to:"xw3"},
      {t:"‹ 回休闲一刻", to:"yx1"}
    ]
  },
  xw2: {
    tag: "修武扬文 · 第 2 页",
    title: "音律训练 · 二零四八 · 记忆 · 东汉尼拔<br>文武双全，随时随地来一局",
    sub: "点击圆点或左右箭头翻页",
    tags: [
      {t:"第 1 页", to:"xw1"},
      {t:"第 2 页（当前）", to:"xw2"},
      {t:"👉 第 3 页（广陵消消）", to:"xw3"},
      {t:"‹ 回休闲一刻", to:"yx1"}
    ]
  },
  xw3: {
    tag: "修武扬文 · 第 3 页",
    title: "广陵消消 × 黄巾矿工<br>摸鱼解压停不下来",
    sub: "点击左上角 < 返回主屏幕，或点 < 返回休闲一刻",
    tags: [
      {t:"第 1 页", to:"xw1"},
      {t:"第 2 页", to:"xw2"},
      {t:"‹ 回休闲一刻", to:"yx1"},
      {t:"🏠 返回桌面", to:"home1"}
    ]
  },
  chat: {
    tag: "传讯 · 袁基活人感引擎",
    title: "不只是文字回复——<br>会斗图、有构造气泡、有灵犀花瓣动效",
    sub: "点击聊天框底部的 3 条预设台词，亲自触发袁基的实时回应",
    tags: [
      {t:"🍵 台词 1：不想批公文", chat:0},
      {t:"🧾 台词 2：太疾驰代付道谢", chat:1},
      {t:"🌸 台词 3：茶里放了什么", chat:2},
      {t:"🏠 返回主屏幕", to:"home1"}
    ]
  }
};

let currentScreen = "lock";
let stickerUrl = null;
let toastTimer = null;

function showToast(title, desc) {
  const el = $("#toast");
  el.innerHTML = `<b style="font-family:var(--serif);font-size:14px;color:#e8dfc5;display:block;margin-bottom:4px">${title}</b><span>${desc}</span>`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2700);
}

function goScreen(id) {
  if (!SCREEN_META[id]) return;
  currentScreen = id;
  $$(".screen-layer").forEach(el => el.classList.toggle("active", el.dataset.screen === id));
  $("#pay-modal").classList.remove("open");
  $("#toast").classList.remove("show");
  if (id !== "chat") $("#petals").classList.remove("on");

  const m = SCREEN_META[id];
  $("#cap-tag").textContent = m.tag;
  $("#cap-title").innerHTML = m.title;
  $("#cap-sub").textContent = m.sub;
  const cap = $("#caption");
  cap.classList.remove("cap-anim"); void cap.offsetWidth; cap.classList.add("cap-anim");

  // 底部卖点胶囊
  const row = $("#tagrow");
  row.innerHTML = "";
  (m.tags || []).forEach(item => {
    const s = document.createElement("span");
    s.className = "tg";
    s.textContent = item.t;
    s.onclick = () => {
      stopAuto();
      if (item.to) goScreen(item.to);
      if (item.modal === "pay") openPayModal();
      if (typeof item.chat === "number") triggerChat(item.chat);
    };
    row.appendChild(s);
  });

  // 导演栏高亮
  $$(".pill").forEach(b => {
    const j = b.dataset.jump;
    const match = (j === id) ||
      (j === "lock" && id.startsWith("lock")) ||
      (j === "home1" && (id === "home1_expand" || id === "home2")) ||
      (j === "xyl1" && id.startsWith("xyl")) ||
      (j === "xl1" && id.startsWith("xl")) ||
      (j === "cp1" && id.startsWith("cp")) ||
      (j === "lt1" && id.startsWith("lt")) ||
      (j === "rl1" && id.startsWith("rl")) ||
      (j === "yd1" && id.startsWith("yd")) ||
      (j === "sz1" && id.startsWith("sz")) ||
      (j === "yx1" && (id.startsWith("yx") || id.startsWith("xw"))) ||
      (j === "xg1" && id.startsWith("xg")) ||
      (j === "dd1" && id.startsWith("dd")) ||
      (j === "sc1" && id.startsWith("sc")) ||
      (j === "tjc1" && id.startsWith("tjc"));
    b.classList.toggle("on", match);
  });
}

/* ================= 太疾驰结算与袁基代付弹窗 ================= */
function openPayModal() {
  $("#pay-status").classList.remove("show");
  $("#pay-modal").classList.add("open");
}
$("#pay-close").onclick = () => $("#pay-modal").classList.remove("open");
$("#btn-self-pay").onclick = () => {
  const st = $("#pay-status");
  st.innerHTML = "✅ <b>五铢钱支付成功（-219 钱）</b><br>🐎 太疾驰骑手已纵马飞驰！送达签收后可存入背包或一键「🎁 送给TA」。";
  st.classList.add("show");
};
$("#btn-ta-pay").onclick = () => {
  const st = $("#pay-status");
  st.innerHTML = "🕊️ <b>代付飞鸽已送达【袁基】</b><br>袁基秒批了账单并附言：<i>“殿下在集市玩得尽兴便好，这点银钱，袁某还是出得起的。”</i>";
  st.classList.add("show");
};

/* ================= 袁基可交互聊天剧本 ================= */
const CHAT_SCRIPTS = [
  {
    me: "今天公文好多，不想批了……",
    state: "✨ 构造状态：放下茶盏，替你把案上奏折拢到一旁",
    replies: [
      {type:"text", text:"那便不批了。殿下且过来歇着，余下的交给袁某便是。"},
      {type:"sticker", emo:"🍵😌", cap:"[递茶 · 温润但暗藏私心]"}
    ],
    petals: false
  },
  {
    me: "刚才太疾驰的账单，谢谢袁公子报销~",
    state: "✨ 构造状态：听到你道谢，眼底笑意加深 · 心率微扬",
    replies: [
      {type:"text", text:"殿下同袁某还需这般客气么？"},
      {type:"text", text:"看到账单上有青州杏子蜜饯与岁星日的戏票……殿下锁的那两席雅座，另一席可是留给袁某的？"}
    ],
    petals: true
  },
  {
    me: "这茶里不会又放了什么奇怪的东西吧？",
    state: "✨ 构造状态：正在偷偷看你 · 唇角微扬（触发灵犀生境落花）",
    replies: [
      {type:"text", text:"殿下多虑了，不过是几片今年的新春茶……"},
      {type:"text", text:"外加袁某的一点私心罢了。殿下可要尝尝？"}
    ],
    petals: true
  }
];

function appendMsg(html, isMe = false) {
  const box = $("#chat-msgs");
  const row = document.createElement("div");
  row.className = "msg" + (isMe ? " me" : "");
  row.innerHTML = html;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

let chatTimers = [];
function clearChatTimers() { chatTimers.forEach(clearTimeout); chatTimers = []; }

function initChatDefault() {
  clearChatTimers();
  $("#chat-msgs").innerHTML = "";
  const av = getAvatarHtml();
  appendMsg(`${av}<div class="bub ta">殿下今日批完公文了吗？桌上的茶，可还温着。</div>`, false);
}

function getAvatarHtml() {
  const u = window.__YUANJI_AV;
  return `<div class="av" data-avatar="yuanji" style="width:30px;height:30px;font-size:13px">${u ? `<img src="${u}">` : "基"}</div>`;
}

function getUserAvatarHtml() {
  const u = window.__USER_AV;
  return `<div class="av me-av" data-avatar="user" style="width:30px;height:30px;font-size:13px">${u ? `<img src="${u}">` : "我"}</div>`;
}

function triggerChat(idx) {
  const sc = CHAT_SCRIPTS[idx];
  if (!sc) return;
  clearChatTimers();
  appendMsg(`${getUserAvatarHtml()}<div class="bub me">${sc.me}</div>`, true);
  $("#construct-bar").textContent = sc.state;
  if (sc.petals) $("#petals").classList.add("on");

  sc.replies.forEach((rep, i) => {
    const t = setTimeout(() => {
      const av = getAvatarHtml();
      if (rep.type === "text") {
        appendMsg(`${av}<div class="bub ta">${rep.text}</div>`, false);
      } else if (rep.type === "sticker") {
        const inner = stickerUrl
          ? `<img src="${stickerUrl}"><div class="cap">${rep.cap}</div>`
          : `<div class="emo">${rep.emo}</div><div class="cap">${rep.cap}</div>`;
        appendMsg(`${av}<div class="sticker-card">${inner}</div>`, false);
      }
    }, 650 + i * 950);
    chatTimers.push(t);
  });
}

$$("[data-chat]").forEach(btn => {
  btn.onclick = () => {
    stopAuto();
    triggerChat(Number(btn.dataset.chat));
  };
});

/* ================= 全局热区点击绑定 ================= */
$$("[data-action]").forEach(el => {
  el.addEventListener("click", (e) => {
    if (e.isTrusted) stopAuto();
    const act = el.dataset.action;
    if (act.startsWith("goto:")) {
      const target = act.slice(5);
      if (target === "chat" && $("#chat-msgs").children.length === 0) initChatDefault();
      goScreen(target);
    } else if (act.startsWith("modal:pay")) {
      openPayModal();
    } else if (act.startsWith("app:")) {
      const parts = act.split(":");
      showToast(parts[1], parts.slice(2).join(":"));
    }
  });
});

/* ================= 自动演示巡礼模式（串联全部 21 张截图 + 聊天） ================= */
const AUTO_STEPS = [
  // 1. 锁屏与装扮
  {wait:900, tap:[89, 7], next:() => goScreen("lock_guide")},
  {wait:1300, tap:[82, 49], next:() => goScreen("lock_diy1")},
  {wait:1400, tap:[38, 17], next:() => goScreen("lock_diy2")},
  {wait:1400, tap:[64, 17], next:() => goScreen("lock_diy3")},
  {wait:1400, tap:[65, 92], next:() => goScreen("home1")},
  // 2. 桌面折叠卡片
  {wait:1200, tap:[50, 17], next:() => goScreen("home1_expand")},
  {wait:1800, tap:[50, 38], next:() => goScreen("home1")},
  // 3. 绣衣楼四页签
  {wait:1100, tap:[17, 32], next:() => goScreen("xyl1")},
  {wait:1500, tap:[36, 92], next:() => goScreen("xyl2")},
  {wait:1400, tap:[60, 92], next:() => goScreen("xyl3")},
  {wait:1400, tap:[84, 92], next:() => goScreen("xyl4")},
  {wait:1400, tap:[10, 5], next:() => goScreen("home1")},
  // 4. 杏林济生挂号
  {wait:1100, tap:[40, 32], next:() => goScreen("xl1")},
  {wait:1500, tap:[50, 85], next:() => goScreen("xl2")},
  {wait:1800, tap:[12, 5], next:() => goScreen("home1")},
  // 5. 情侣空间双页
  {wait:1100, tap:[62, 32], next:() => goScreen("cp1")},
  {wait:1600, tap:[50, 96], next:() => goScreen("cp2")},
  {wait:1800, tap:[12, 5], next:() => goScreen("home1")},
  // 6. 天气双城连线
  {wait:1100, tap:[85, 32], next:() => goScreen("weather")},
  {wait:1600, tap:[10, 4], next:() => goScreen("home1")},
  // 7. 论坛（主页 -> 名人榜 -> 关系网 -> 袁基超话）
  {wait:1000, tap:[17, 49], next:() => goScreen("lt1")},
  {wait:1400, tap:[37, 92], next:() => goScreen("lt2")},
  {wait:1500, tap:[62, 92], next:() => goScreen("lt3")},
  {wait:1600, tap:[41, 90], next:() => goScreen("lt4")},
  {wait:1800, tap:[8, 4], next:() => goScreen("home1")},
  // 8. 日历（袁基日程 -> 已毕 -> 进行 -> 未竟）
  {wait:1000, tap:[40, 49], next:() => goScreen("rl1")},
  {wait:1400, tap:[16, 78], next:() => goScreen("rl2")},
  {wait:1500, tap:[50, 14], next:() => goScreen("rl3")},
  {wait:1500, tap:[80, 14], next:() => goScreen("rl4")},
  {wait:1700, tap:[10, 4], next:() => goScreen("home1")},
  // 9. 阅读（今日阅读 -> 天下书城）
  {wait:1000, tap:[85, 49], next:() => goScreen("yd1")},
  {wait:1400, tap:[50, 4], next:() => goScreen("yd2")},
  {wait:1500, tap:[10, 3], next:() => goScreen("home1")},
  // 10. 共听音乐 & 傩·观影 & 傩·游戏
  {wait:1000, tap:[40, 66], next:() => goScreen("yy")},
  {wait:1800, tap:[8, 3], next:() => goScreen("home1")},
  {wait:1000, tap:[62, 66], next:() => goScreen("ngy")},
  {wait:1900, tap:[8, 3], next:() => goScreen("home1")},
  {wait:1000, tap:[85, 66], next:() => goScreen("nyx")},
  {wait:1900, tap:[8, 3], next:() => goScreen("home1")},
  // 11. 桌面第2页（电台 -> 掌机 -> 云镜 -> 今日学宫 -> OC点单 -> 商城三页签）
  {wait:1000, tap:[50, 76], next:() => goScreen("home2")},
  {wait:1100, tap:[40, 32], next:() => goScreen("ndt")},
  {wait:1600, tap:[8, 4], next:() => goScreen("home2")},
  {wait:900, tap:[85, 32], next:() => goScreen("nzj")},
  {wait:1600, tap:[6, 3], next:() => goScreen("home2")},
  {wait:900, tap:[40, 49], next:() => goScreen("nyj")},
  {wait:1800, tap:[6, 4], next:() => goScreen("home2")},
  {wait:900, tap:[17, 49], next:() => goScreen("xg1")},
  {wait:1200, tap:[29, 91], next:() => goScreen("xg2")},
  {wait:1200, tap:[48, 91], next:() => goScreen("xg3")},
  {wait:1200, tap:[67, 91], next:() => goScreen("xg4")},
  {wait:1200, tap:[86, 91], next:() => goScreen("xg5")},
  {wait:1400, tap:[7, 4], next:() => goScreen("home2")},
  {wait:900, tap:[62, 49], next:() => goScreen("dd1")},
  {wait:1200, tap:[37, 92], next:() => goScreen("dd2")},
  {wait:1200, tap:[62, 92], next:() => goScreen("dd3")},
  {wait:1200, tap:[86, 92], next:() => goScreen("dd4")},
  {wait:1400, tap:[50, 82], next:() => goScreen("home2")},
  {wait:900, tap:[17, 32], next:() => goScreen("sc1")},
  {wait:1200, tap:[46, 14], next:() => goScreen("sc2")},
  {wait:1200, tap:[78, 14], next:() => goScreen("sc3")},
  {wait:1400, tap:[10, 4], next:() => goScreen("home1")},
  // 11B. 休闲一刻游戏厅（含修武扬文 3 页） & 设置
  {wait:900, tap:[62, 91], next:() => goScreen("yx1")},
  {wait:1200, tap:[45, 62], next:() => goScreen("xw1")},
  {wait:1200, tap:[90, 58], next:() => goScreen("xw2")},
  {wait:1200, tap:[94, 58], next:() => goScreen("xw3")},
  {wait:1200, tap:[12, 15], next:() => goScreen("yx1")},
  {wait:1100, tap:[48, 38], next:() => goScreen("yx2")},
  {wait:1100, tap:[78, 16], next:() => goScreen("yx3")},
  {wait:1200, tap:[10, 4], next:() => goScreen("home1")},
  {wait:1000, tap:[41, 91], next:() => goScreen("sz1")},
  {wait:1300, tap:[50, 94], next:() => goScreen("sz2")},
  {wait:1400, tap:[10, 4], next:() => goScreen("home1")},
  // 12. 太疾驰四页签 + 袁基代付
  {wait:1100, tap:[17, 66], next:() => goScreen("tjc1")},
  {wait:1400, tap:[28, 91], next:() => goScreen("tjc2")},
  {wait:1400, tap:[68, 91], next:() => goScreen("tjc3")},
  {wait:1400, tap:[87, 91], next:() => goScreen("tjc4")},
  {wait:1300, tap:[48, 87], next:() => openPayModal()},
  {wait:1200, tap:[72, 82], next:() => $("#btn-ta-pay").click()},
  {wait:2200, tap:[12, 4], next:() => goScreen("home1")},
  // 9. 传讯袁基活人感聊天
  {wait:1100, tap:[62, 49], next:() => { initChatDefault(); goScreen("chat"); }},
  {wait:1300, tap:[35, 90], next:() => triggerChat(0)},
  {wait:2600, tap:[45, 93], next:() => triggerChat(1)},
  {wait:2800, tap:[55, 96], next:() => triggerChat(2)},
  {wait:3200, tap:[8, 4], next:() => goScreen("lock")}
];

let autoRunning = false;
let autoTimer = null;
let autoIdx = 0;

function spawnRipple(xPct, yPct) {
  const r = document.createElement("div");
  r.className = "ripple";
  r.style.left = xPct + "%";
  r.style.top = yPct + "%";
  $("#view").appendChild(r);
  setTimeout(() => r.remove(), 650);
}

function runNextAutoStep() {
  if (!autoRunning) return;
  if (autoIdx >= AUTO_STEPS.length) {
    stopAuto();
    return;
  }
  const step = AUTO_STEPS[autoIdx++];
  const curEl = $("#cursor");
  curEl.classList.add("show");

  autoTimer = setTimeout(() => {
    if (!autoRunning) return;
    curEl.style.left = step.tap[0] + "%";
    curEl.style.top = step.tap[1] + "%";

    autoTimer = setTimeout(() => {
      if (!autoRunning) return;
      curEl.classList.add("tap");
      spawnRipple(step.tap[0], step.tap[1]);
      setTimeout(() => curEl.classList.remove("tap"), 180);
      step.next();
      runNextAutoStep();
    }, 560);
  }, step.wait);
}

function startAuto() {
  autoRunning = true;
  autoIdx = 0;
  $("#bAuto").textContent = "⏸ 暂停演示";
  $("#cap-mode").textContent = "🎬 自动演示中";
  $("#cap-mode").classList.remove("free");
  goScreen("lock");
  runNextAutoStep();
}

function stopAuto() {
  if (!autoRunning) return;
  autoRunning = false;
  clearTimeout(autoTimer);
  $("#cursor").classList.remove("show");
  $("#bAuto").textContent = "▶ 自动演示";
  $("#cap-mode").textContent = "🖐️ 可交互试玩";
  $("#cap-mode").classList.add("free");
}

$("#bAuto").onclick = () => autoRunning ? stopAuto() : startAuto();

$$(".pill").forEach(btn => {
  btn.onclick = () => {
    stopAuto();
    const target = btn.dataset.jump;
    if (target === "chat" && $("#chat-msgs").children.length === 0) initChatDefault();
    goScreen(target);
  };
});

$("#bDebug").onclick = () => document.body.classList.toggle("debug-hotspots");
const toggleRec = () => { document.body.classList.toggle("record-mode"); fit(); };
$("#bRec").onclick = toggleRec;

addEventListener("keydown", e => {
  if (e.code === "Space") { e.preventDefault(); autoRunning ? stopAuto() : startAuto(); }
  if (e.key === "d" || e.key === "D") document.body.classList.toggle("debug-hotspots");
  if (e.key === "h" || e.key === "H") toggleRec();
});

/* 自适应缩放：优先使用 Chromium 原生矢量级 zoom 缩放，彻底消除 transform:scale 导致的位图二次重采样发糊 */
function fit() {
  const r = document.body.classList.contains("record-mode");
  const h = innerHeight - (r ? 0 : 68), w = innerWidth, s = Math.min(h / 960, w / 540), sc = $("#scaler");
  if ("zoom" in sc.style) {
    sc.style.transform = "none";
    sc.style.zoom = s;
    sc.style.margin = r ? "0" : "0 0 68px 0";
  } else {
    sc.style.transform = `scale(${s})`;
    sc.style.margin = `${(960 * s - 960) / 2}px ${(540 * s - 540) / 2}px`;
    if (!r) sc.style.marginBottom = `${(960 * s - 960) / 2 + 68}px`;
  }
}
addEventListener("resize", fit); fit();

/* 自动探测袁基头像、用户头像、表情包（优先中文文件名，兼容英文文件名） */
const EXTS = ["png","jpg","jpeg","webp","gif"];
function probe(name, i = 0) {
  return new Promise(res => {
    if (i >= EXTS.length) return res(null);
    const u = `assets/${encodeURIComponent(name)}.${EXTS[i]}`;
    const im = new Image();
    im.onload = () => res(u);
    im.onerror = () => res(probe(name, i + 1));
    im.src = u;
  });
}
async function probeAny(names) {
  for (const n of names) {
    const u = await probe(n);
    if (u) return u;
  }
  return null;
}
(async () => {
  const [avUrl, userUrl, stUrl] = await Promise.all([
    probeAny(["yuanji_avatar"]),
    probeAny(["user_avatar"]),
    probeAny(["sticker"])
  ]);
  if (avUrl) {
    window.__YUANJI_AV = avUrl;
    $$('[data-avatar="yuanji"]').forEach(el => el.innerHTML = `<img src="${avUrl}">`);
  }
  if (userUrl) {
    window.__USER_AV = userUrl;
    $$('[data-avatar="user"]').forEach(el => el.innerHTML = `<img src="${userUrl}">`);
  }
  if (stUrl) stickerUrl = stUrl;
  initChatDefault();
  goScreen("lock");
})();