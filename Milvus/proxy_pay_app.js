/**
 * Milvus/proxy_pay_app.js
 * 太疾驰「他人代付」→ 传讯 · 代付账单卡片与名士自主付款/拒付独立引擎（P0）
 * - window.sendProxyPayCardToChat：将结算单打包为 type: "proxy_pay_card" 投递至名士传讯主线（不偷跑 AI）
 * - window.ProxyPayCardBubble：传讯聊天流中的极简代付账单卡片（左下同意代付 / 右下拒绝代付，点击展开清单明细）
 * - window.ProxyPayDetailModal：完整购物清单与派送状态详情弹窗
 * - window.formatProxyPayCardForLLM & window.applyProxyPayActionsToChat：传讯四维上下文协议 + 骑手自动幂等派单
 */
(function (global) {
  "use strict";

  const COURIERS = [
    { name: "太疾驰快马骑手·戴宗", vehicle: "神行千里马", rating: 4.98, phone: "传讯灵佩 #9527", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=DaiZong" },
    { name: "疾风专送·赵小六", vehicle: "追风赤兔马", rating: 4.95, phone: "千里金铃 #108", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=XiaoLiu" },
    { name: "神行驿使·阿飞", vehicle: "踏雪乌骓", rating: 4.99, phone: "风行符印 #777", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=AFei" },
    { name: "云步斥候·李四", vehicle: "神行木牛流马", rating: 4.92, phone: "飞鸽信筒 #002", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=LiSi" }
  ];

  // 对齐 傩·观影 NuoAvatar 的异步头像解析组件（供太疾驰「选择代付人」使用）
  function ProxyPayAvatar({ avatar, name = "名", size = 48, bgColor = "#A8C8BA" }) {
    const h = React.createElement;
    const [src, setSrc] = React.useState("");
    const [hasError, setHasError] = React.useState(false);

    React.useEffect(() => {
      let alive = true;
      setHasError(false);
      if (!avatar) {
        setSrc("");
        return;
      }
      if (
        typeof avatar === "string" &&
        (avatar.startsWith("data:image") ||
          avatar.startsWith("http://") ||
          avatar.startsWith("https://") ||
          avatar.startsWith("blob:") ||
          avatar.startsWith("/") ||
          avatar.startsWith("./") ||
          /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(avatar))
      ) {
        setSrc(avatar);
        return;
      }
      (async () => {
        try {
          if (typeof global.resolveAvatarUrl === "function") {
            const res = await global.resolveAvatarUrl(avatar, "");
            if (alive && res) {
              setSrc(res);
              return;
            }
          }
          const store = global.avatarStore || (typeof avatarStore !== "undefined" ? avatarStore : null);
          if (store && typeof store.get === "function") {
            const item = await store.get(avatar);
            const url = item && (item.avatarData || item.data || item.url || "");
            if (alive && url) {
              setSrc(url);
              return;
            }
          }
        } catch (e) {}
        if (alive) setSrc("");
      })();
      return () => {
        alive = false;
      };
    }, [avatar]);

    return h(
      "div",
      {
        className: "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-inner overflow-hidden",
        style: {
          width: size + "px",
          height: size + "px",
          backgroundColor: bgColor,
          flexShrink: 0
        }
      },
      src && !hasError
        ? h("img", {
            src,
            alt: name,
            onError: () => setHasError(true),
            style: { width: "100%", height: "100%", objectFit: "cover", display: "block" }
          })
        : String(name || "?").charAt(0)
    );
  }
  global.ProxyPayAvatar = ProxyPayAvatar;

  function showProxyPayToast(message) {
    if (typeof document === "undefined" || !message) return;
    try {
      const prev = document.getElementById("milvus-proxypay-toast");
      if (prev) prev.remove();
      const el = document.createElement("div");
      el.id = "milvus-proxypay-toast";
      el.textContent = String(message);
      Object.assign(el.style, {
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "99999",
        maxWidth: "90vw",
        padding: "10px 16px",
        borderRadius: "999px",
        background: "rgba(41, 37, 36, 0.95)",
        color: "#FFFBEB",
        fontSize: "12.5px",
        fontWeight: "600",
        boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
        pointerEvents: "none",
        textAlign: "center",
        transition: "opacity 0.3s ease"
      });
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => {
          try {
            el.remove();
          } catch (e) {}
        }, 320);
      }, 3400);
    } catch (e) {}
  }

  // 投递太疾驰代付账单卡片至传讯主线（不自动调用 AI）
  async function sendProxyPayCardToChat(targetRole, { selectedGoods, totalPriceStr, note, sourceIds }) {
    if (!targetRole || !targetRole.id) {
      throw new Error("未找到目标名士");
    }
    const items = Array.isArray(selectedGoods) ? selectedGoods : [];
    const firstName = items[0]?.name || "精选好物";
    const title = items.length > 1 ? `${firstName} 等 ${items.length} 件` : firstName;
    const merchantName = items[0]?.merchant || "太疾驰精选商坊";
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const cardMsg = {
      id: now,
      type: "proxy_pay_card",
      isMe: true,
      sender: "user",
      time: timeStr,
      timestamp: now,
      text: `【太疾驰代付账单】${title} · 总计 ${totalPriceStr}`,
      content: {
        title,
        merchantName,
        totalPriceStr: String(totalPriceStr || "0钱"),
        items: items.map((g) => ({
          name: String(g.name || "商品"),
          merchant: String(g.merchant || "太疾驰商坊"),
          price: String(g.price || "0钱")
        })),
        sourceIds: sourceIds || { settlement: [], shopping: [], secondHand: [], ticket: [] },
        payerRoleId: String(targetRole.id),
        payerRoleName: String(targetRole.name || "名士"),
        note: String(note || "").trim().slice(0, 100),
        cardStatus: "pending", // "pending" | "paid" | "rejected"
        delivered: false,
        courierName: "",
        durationMinutes: 0,
        statusUpdatedAt: null,
        actionBy: ""
      }
    };

    if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
      await global.chatHistoryStore.saveMessage(targetRole.id, cardMsg);
    } else if (global.chatHistoryStore && typeof global.chatHistoryStore.getMessages === "function") {
      const res = await global.chatHistoryStore.getMessages(targetRole.id);
      const hist = res && Array.isArray(res.messages) ? res.messages : [];
      await global.chatHistoryStore.saveMessages(targetRole.id, [...hist, cardMsg]);
    }

    try {
      const lsKey = `t8_chat_history_${targetRole.id}`;
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.push(cardMsg);
          localStorage.setItem(lsKey, JSON.stringify(arr));
        }
      }
    } catch (e) {}

    try {
      const listRaw = localStorage.getItem("t8_chat_list");
      if (listRaw) {
        const list = JSON.parse(listRaw);
        if (Array.isArray(list)) {
          const next = list.map((c) =>
            String(c.id) === String(targetRole.id)
              ? { ...c, lastMessage: `[太疾驰代付] ${totalPriceStr} · ${title}`, lastTime: timeStr, time: timeStr, updatedAt: now }
              : c
          );
          localStorage.setItem("t8_chat_list", JSON.stringify(next));
        }
      }
    } catch (e) {}

    try {
      global.dispatchEvent(new CustomEvent("reloadChats"));
    } catch (e) {}

    return cardMsg;
  }

  // 名士同意代付后的幂等骑手派单履约
  function fulfillProxyPayDelivery(cardContent, payerName) {
    const items = Array.isArray(cardContent?.items) ? cardContent.items : [];
    const shopName = cardContent?.merchantName || items[0]?.merchant || "太疾驰精选商坊";
    const shopLoc = shopName + "总店(东市坊街)";
    let userAddr = "广陵王府·听雨阁";
    try {
      const savedPersonas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      if (activeId) {
        const activeUser = savedPersonas.find((p) => String(p.id) === String(activeId));
        if (activeUser && activeUser.name) userAddr = `${activeUser.name}府邸·正殿`;
      }
    } catch (e) {}

    const courier = COURIERS[Math.floor(Math.random() * COURIERS.length)];
    const durationMinutes = Math.floor(Math.random() * 3) + 2;

    if (global.deliveryOrderStore && typeof global.deliveryOrderStore.addOrder === "function" && items.length > 0) {
      global.deliveryOrderStore.addOrder({
        merchantName: shopName,
        merchantLocation: shopLoc,
        userAddress: userAddr,
        courier,
        items: items.map((g) => ({
          name: g.name,
          merchant: g.merchant,
          price: g.price,
          type: "goods"
        })),
        totalPriceStr: cardContent?.totalPriceStr || "0钱",
        totalBase: 0,
        payMethod: "role",
        payerRoleName: payerName || cardContent?.payerRoleName || "名士",
        durationMinutes,
        status: "delivering"
      });
    }

    const paidPayload = {
      sourceIds: cardContent?.sourceIds || { settlement: [], shopping: [], secondHand: [], ticket: [] },
      items,
      totalPriceStr: cardContent?.totalPriceStr || "",
      payerName: payerName || cardContent?.payerRoleName || "名士"
    };

    // 写入待清理队列，即使太疾驰当前未打开，下次进入时也会自动清理已代付商品
    try {
      const qKey = "milvus_proxypay_paid_queue_v1";
      const prevQ = JSON.parse(localStorage.getItem(qKey) || "[]");
      prevQ.push({ ...paidPayload, ts: Date.now() });
      localStorage.setItem(qKey, JSON.stringify(prevQ.slice(-20)));
    } catch (e) {}

    try {
      global.dispatchEvent(new CustomEvent("milvus-proxypay-paid", { detail: paidPayload }));
    } catch (e) {}

    showProxyPayToast(
      `🐎 「${payerName || "名士"}」已帮你代付 ${cardContent?.totalPriceStr || ""}！骑手【${courier.name}】预计 ${durationMinutes} 分钟送达`
    );

    return { courierName: courier.name, durationMinutes };
  }

  // ==========================================
  // 1. 代付账单完整清单详情弹窗（点击卡片展开）
  // ==========================================
  const ProxyPayDetailModal = ({ content, onClose }) => {
    const h = React.createElement;
    const [liveOrderStatus, setLiveOrderStatus] = React.useState("");

    React.useEffect(() => {
      let alive = true;
      if (!content || !content.delivered || !global.deliveryOrderStore) return;
      (async () => {
        try {
          if (typeof global.deliveryOrderStore.checkAutoDelivery === "function") {
            await global.deliveryOrderStore.checkAutoDelivery();
          }
          const all = await global.deliveryOrderStore.getAll();
          const matched = (all || []).find(
            (o) =>
              o &&
              o.payMethod === "role" &&
              o.totalPriceStr === content.totalPriceStr &&
              (!content.courierName || o.courier?.name === content.courierName)
          );
          if (alive && matched) {
            setLiveOrderStatus(
              matched.status === "delivered" || matched.status === "signed"
                ? "已送达府邸 ✓"
                : `快马派送中（预计 ${matched.durationMinutes || content.durationMinutes || 3} 分钟）`
            );
          }
        } catch (e) {}
      })();
      return () => {
        alive = false;
      };
    }, [content]);

    if (!content) return null;
    const items = Array.isArray(content.items) ? content.items : [];
    const status = content.cardStatus || "pending";
    const isPaid = status === "paid";
    const isRejected = status === "rejected";

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 12000,
          background: "rgba(28, 25, 23, 0.52)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
        },
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        }
      },
      h(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: "390px",
            maxHeight: "82vh",
            background: "#FAF8F5",
            borderRadius: "20px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.24)",
            border: "1px solid #EAE2D6"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "13px 16px",
              background: "#FFF9EB",
              borderBottom: "1px solid #F3E5C2",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#92400E" } }, "🛍️ 太疾驰 · 代付账单明细")
          ),
          h(
            "button",
            {
              onClick: onClose,
              style: {
                border: "none",
                background: "#F5EBD6",
                color: "#78350F",
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                cursor: "pointer"
              }
            },
            "✕"
          )
        ),
        // 主体清单
        h(
          "div",
          {
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }
          },
          // 金额总览卡片
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EFEAE2",
                borderRadius: "16px",
                padding: "16px",
                textAlign: "center"
              }
            },
            h("div", { style: { fontSize: "11.5px", color: "#8C857B", marginBottom: "4px" } }, "代付总计金额"),
            h(
              "div",
              { style: { fontSize: "24px", fontWeight: 800, color: isRejected ? "#9CA3AF" : "#B45309", letterSpacing: "0.02em" } },
              content.totalPriceStr || "0钱"
            ),
            h(
              "div",
              {
                style: {
                  marginTop: "8px",
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: isPaid ? "#EAF5EF" : isRejected ? "#FDECEC" : "#FFF8EB",
                  color: isPaid ? "#2E6B50" : isRejected ? "#B33E38" : "#B45309"
                }
              },
              isPaid
                ? `✓ ${content.actionBy || content.payerRoleName || "名士"} 已爽快代付`
                : isRejected
                ? `✕ ${content.actionBy || content.payerRoleName || "名士"} 已拒绝代付`
                : `⏳ 等待 ${content.payerRoleName || "名士"} 确认代付`
            ),
            content.delivered &&
              h(
                "div",
                {
                  style: {
                    marginTop: "10px",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    background: "#F4FBF7",
                    border: "1px solid #CBE0D6",
                    fontSize: "11.5px",
                    color: "#2E6B50"
                  }
                },
                `🐎 太疾驰骑手${content.courierName ? `【${content.courierName}】` : ""}${liveOrderStatus ? ` · ${liveOrderStatus}` : "已接单派送，可在太疾驰结算单查看进度"}`
              )
          ),

          // 商品逐项清单
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EFEAE2",
                borderRadius: "16px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }
            },
            h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#57534E" } }, `购物清单（${items.length} 件）`),
            items.map((it, idx) =>
              h(
                "div",
                {
                  key: idx,
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: idx > 0 ? "8px" : "0",
                    borderTop: idx > 0 ? "1px dashed #F0EAE0" : "none",
                    gap: "10px"
                  }
                },
                h(
                  "div",
                  { style: { minWidth: 0 } },
                  h("div", { style: { fontSize: "13px", fontWeight: 600, color: "#292524" } }, it.name),
                  h("div", { style: { fontSize: "11px", color: "#A8A29E", marginTop: "2px" } }, it.merchant)
                ),
                h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#B45309", flexShrink: 0 } }, it.price)
              )
            )
          ),

          content.note &&
            h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #EFEAE2",
                  borderLeft: "3px solid #D97706",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  fontSize: "12px",
                  color: "#57534E"
                }
              },
              `附言：「${content.note}」`
            )
        )
      )
    );
  };

  // ==========================================
  // 2. 传讯聊天流中的「太疾驰代付账单卡片」气泡组件
  // ==========================================
  const ProxyPayCardBubble = ({ msg, chatData, onResetCardStatus }) => {
    const h = React.createElement;
    const [showDetail, setShowDetail] = React.useState(false);
    const [btnTip, setBtnTip] = React.useState("");

    const content = msg?.content || {};
    const status = content.cardStatus || "pending"; // "pending" | "paid" | "rejected"
    const isPaid = status === "paid";
    const isRejected = status === "rejected";
    const charName = chatData?.name || content.payerRoleName || "名士";
    const statusTimeStr = content.statusUpdatedAt
      ? new Date(content.statusUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    const handleActionBtnHint = (e, label) => {
      e.stopPropagation();
      const tip =
        status === "pending"
          ? `「${label}」由 ${charName} 在触发 AI 回复时自主决定`
          : isPaid
          ? `${charName} 已同意代付，骑手已出发`
          : `${charName} 已拒绝代付`;
      setBtnTip(tip);
      setTimeout(() => setBtnTip(""), 2200);
    };

    const handleResend = (e) => {
      e.stopPropagation();
      if (typeof onResetCardStatus === "function") {
        onResetCardStatus(msg.id, "pending");
        setBtnTip(`已重新递给 ${charName}，触发 AI 回复后即可再次决定`);
        setTimeout(() => setBtnTip(""), 2400);
      }
    };

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          onClick: () => setShowDetail(true),
          style: {
            width: "256px",
            maxWidth: "75vw",
            background: "#FFFDF9",
            borderRadius: "16px",
            border: isRejected
              ? "1px solid #E5CFCB"
              : isPaid
              ? "1px solid #CBE0D6"
              : "1px solid #F2DEC0",
            boxShadow: "0 4px 14px rgba(44, 40, 37, 0.08)",
            overflow: "hidden",
            cursor: "pointer",
            textAlign: "left",
            userSelect: "none"
          }
        },
        // 顶部报头
        h(
          "div",
          {
            style: {
              padding: "8px 12px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: isRejected ? "#FBF4F3" : isPaid ? "#F1F9F5" : "#FFF8EB",
              borderBottom: isPaid ? "1px solid #DCEDE4" : "1px solid #F4E6CC"
            }
          },
          h("span", { style: { fontSize: "10.5px", fontWeight: 700, color: "#B45309", letterSpacing: "0.04em" } }, "🛍️ 太疾驰 · 代付账单"),
          h(
            "span",
            {
              style: {
                fontSize: "10px",
                color: isPaid ? "#2E6B50" : isRejected ? "#B33E38" : "#A16207",
                fontWeight: isPaid || isRejected ? 700 : 500
              }
            },
            isPaid
              ? `已代付${statusTimeStr ? ` · ${statusTimeStr}` : ""}`
              : isRejected
              ? `已拒付${statusTimeStr ? ` · ${statusTimeStr}` : ""}`
              : "待代付"
          )
        ),

        // 主体：商品名 + 醒目总价 + 清单明细入口
        h(
          "div",
          { style: { padding: "12px 13px 11px" } },
          h(
            "div",
            {
              style: {
                fontSize: "13.5px",
                fontWeight: 700,
                color: isRejected ? "#8C8279" : "#292524",
                lineHeight: "1.4",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: isRejected ? "line-through" : "none"
              }
            },
            content.title || "太疾驰商品订单"
          ),
          h(
            "div",
            {
              style: {
                marginTop: "8px",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between"
              }
            },
            h(
              "span",
              { style: { fontSize: "16px", fontWeight: 800, color: isRejected ? "#A8A29E" : "#C2410C" } },
              content.totalPriceStr || "0钱"
            ),
            h("span", { style: { fontSize: "10.5px", color: "#B45309" } }, "清单明细 ›")
          )
        ),

        // 底部双按钮栏：左下角「同意代付」，右下角「拒绝代付」
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px 9px",
              borderTop: "1px dashed #EFE8DC",
              background: "#FFFFFF",
              gap: "6px"
            }
          },
          h(
            "button",
            {
              type: "button",
              onClick: (e) => handleActionBtnHint(e, "同意代付"),
              style: {
                border: isPaid ? "1px solid #4F8A6E" : "1px solid #E5DFD6",
                background: isPaid ? "#EAF5EF" : "#FAF8F5",
                color: isPaid ? "#2E6B50" : isRejected ? "#C7C1B9" : "#78716C",
                fontSize: "11px",
                fontWeight: isPaid ? 700 : 500,
                padding: "3px 10px",
                borderRadius: "999px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }
            },
            isPaid ? "已代付 ✓" : "同意代付"
          ),
          isRejected &&
            typeof onResetCardStatus === "function" &&
            h(
              "button",
              {
                type: "button",
                onClick: handleResend,
                style: {
                  border: "1px dashed #D6A77A",
                  background: "#FFF9F0",
                  color: "#9A5B13",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "999px",
                  cursor: "pointer"
                }
              },
              "再求代付"
            ),
          h(
            "button",
            {
              type: "button",
              onClick: (e) => handleActionBtnHint(e, "拒绝代付"),
              style: {
                border: isRejected ? "1px solid #C85A53" : "1px solid #E5DFD6",
                background: isRejected ? "#FDECEC" : "#FAF8F5",
                color: isRejected ? "#B33E38" : isPaid ? "#C7C1B9" : "#78716C",
                fontSize: "11px",
                fontWeight: isRejected ? 700 : 500,
                padding: "3px 10px",
                borderRadius: "999px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }
            },
            isRejected ? "已拒付 ✕" : "拒绝代付"
          )
        ),

        btnTip &&
          h(
            "div",
            {
              style: {
                padding: "4px 10px 6px",
                fontSize: "10px",
                color: "#9A6B3F",
                background: "#FFF9EE",
                textAlign: "center",
                borderTop: "1px solid #F5EAD6"
              }
            },
            btnTip
          )
      ),
      showDetail &&
        h(ProxyPayDetailModal, {
          content,
          onClose: () => setShowDetail(false)
        })
    );
  };

  // ==========================================
  // 3. 传讯 AI 上下文序列化 & 自主「同意代付 / 拒绝代付」决策协议
  // ==========================================
  function formatProxyPayCardForLLM(msg) {
    const c = msg?.content || {};
    const title = String(c.title || "太疾驰订单");
    const total = String(c.totalPriceStr || "0钱");
    const status = c.cardStatus || "pending";
    const cardId = String(msg?.id || "");

    if (status === "paid") {
      return {
        role: msg?.isMe === false ? "assistant" : "user",
        content: `【历史事件】我曾向你发送太疾驰代付账单（${title}，总计 ${total}），你已点选「同意代付」，太疾驰骑手已接单派送。`
      };
    }

    if (status === "rejected") {
      return {
        role: msg?.isMe === false ? "assistant" : "user",
        content: `【历史事件】我曾向你发送太疾驰代付账单（${title}，总计 ${total}），但你当时选择了「拒绝代付」。`
      };
    }

    const items = Array.isArray(c.items) ? c.items : [];
    const itemsText =
      items.length > 0
        ? items.map((g) => `- ${g.name}（${g.merchant}）：${g.price}`).join("\n")
        : `- ${title}：${total}`;

    return {
      role: msg?.isMe === false ? "assistant" : "user",
      content: `【系统事件·太疾驰代付账单卡片（cardId: ${cardId}）】
我在太疾驰商城选好了以下商品，向你发送了代付账单卡片：
${itemsText}
总计需要：${total}${c.note ? `\n我附言说：「${c.note}」` : ""}

【名士自主决策指令（务必严格遵守）】
账单卡片左下角有「同意代付」按钮，右下角有「拒绝代付」按钮。请你结合你的完整角色配置（姓名/ID、MBTI、星座、语言风格、性格特点、个人背景与财力状况）、用户身份设定、开启的世界书，以及刚才我们的聊天氛围自主决定：
1. 如果你愿意帮我付这笔钱（无论是爽快宠溺、还是嘴上吐槽肉疼但依然买单）：请在回复最开头输出隐藏标记 [PROXY_PAY:APPROVE:${cardId}]（用户看不到此标记），随后用你本人的口吻自然回应。
2. 如果你觉得太贵、本身抠门守财、或者刚才我们聊得不太愉快不想买单：请在回复最开头输出隐藏标记 [PROXY_PAY:REJECT:${cardId}]，随后按你的性格婉拒、嘲讽、吐槽或讲条件。`
    };
  }

  function applyProxyPayActionsToChat(baseMessages, newAiMsgs, chatData) {
    if (!Array.isArray(baseMessages) || !Array.isArray(newAiMsgs) || newAiMsgs.length === 0) {
      return baseMessages;
    }

    const explicitActions = {}; // { cardId: "paid" | "rejected" }
    let wildcardAction = null;
    const tagRegex = /\[PROXY_PAY\s*[:：]\s*(APPROVE|PAID|REJECT)(?:\s*[:：]\s*([^\]]+))?\]/gi;

    newAiMsgs.forEach((am) => {
      if (!am || typeof am.text !== "string") return;
      am.text = am.text
        .replace(tagRegex, (_, rawAct, rawId) => {
          const upper = String(rawAct || "").toUpperCase();
          const act = upper === "REJECT" ? "rejected" : "paid";
          const cid = String(rawId || "").trim();
          if (cid) explicitActions[cid] = act;
          else wildcardAction = act;
          return "";
        })
        .trim();
    });

    const pendingIndices = [];
    baseMessages.forEach((m, idx) => {
      if (m && m.type === "proxy_pay_card" && (m.content?.cardStatus || "pending") === "pending") {
        pendingIndices.push(idx);
      }
    });
    if (pendingIndices.length === 0) return baseMessages;

    const combinedReply = newAiMsgs.map((m) => String(m?.text || "")).join(" ");
    const rejectRegex = /(拒绝代付|不付|不帮.*付|不掏钱|自己付|没钱|不买单|休想|驳回|不给付)/;
    const approveRegex = /(同意代付|帮你付|我付了|付过了|已付|买单|包在我身上|算我的|给你付|替你付|转过去了)/;
    let inferredFallback = null;
    if (rejectRegex.test(combinedReply) && !approveRegex.test(combinedReply)) inferredFallback = "rejected";
    else if (approveRegex.test(combinedReply)) inferredFallback = "paid";

    const charName = chatData?.name || chatData?.profile?.name || "名士";
    const nextMessages = [...baseMessages];
    const now = Date.now();

    pendingIndices.forEach((idx) => {
      const card = nextMessages[idx];
      const cid = String(card.id || "");
      const decided = explicitActions[cid] || wildcardAction || inferredFallback;
      if (!decided) return;

      const nextContent = {
        ...(card.content || {}),
        cardStatus: decided,
        statusUpdatedAt: now,
        actionBy: charName
      };

      // 幂等履约：仅在首次转为 paid 且尚未派单时，触发太疾驰骑手送货
      if (decided === "paid" && !nextContent.delivered) {
        const deliveryInfo = fulfillProxyPayDelivery(nextContent, charName);
        nextContent.delivered = true;
        nextContent.courierName = deliveryInfo.courierName;
        nextContent.durationMinutes = deliveryInfo.durationMinutes;
      }

      nextMessages[idx] = { ...card, content: nextContent };
    });

    return nextMessages;
  }

  global.sendProxyPayCardToChat = sendProxyPayCardToChat;
  global.ProxyPayDetailModal = ProxyPayDetailModal;
  global.ProxyPayCardBubble = ProxyPayCardBubble;
  global.formatProxyPayCardForLLM = formatProxyPayCardForLLM;
  global.applyProxyPayActionsToChat = applyProxyPayActionsToChat;
})(typeof window !== "undefined" ? window : globalThis);
