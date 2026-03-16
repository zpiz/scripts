export default async function(ctx) {
  // 1. 动态计算今天和昨天的日期 (用于获取趋势对比)
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterday.getDate()).padStart(2, '0');
  const yesterdayStr = `${yyyy}-${mm}-${dd}`;

  // 使用支持历史数据查询的免费开源 API
  const currentUrl = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
  const yesterdayUrl = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${yesterdayStr}/v1/currencies/usd.json`;

  let currentData = null;
  let yesterdayData = null;
  let isError = false;

  try {
    // 并发请求今天和昨天的汇率数据
    const [respCurr, respYest] = await Promise.all([
      ctx.http.get(currentUrl, { timeout: 5000 }).catch(() => null),
      ctx.http.get(yesterdayUrl, { timeout: 5000 }).catch(() => null)
    ]);
    
    if (respCurr) currentData = await respCurr.json();
    if (respYest) yesterdayData = await respYest.json();
    
    if (!currentData || !currentData.usd) isError = true;
  } catch (e) {
    isError = true;
  }

  // 计算指定货币对人民币的交叉汇率
  const getRate = (data, id) => {
    if (!data || !data.usd || !data.usd.cny || !data.usd[id]) return null;
    const cny = data.usd.cny;
    const target = data.usd[id];
    return id === 'jpy' ? (cny / target) * 100 : (cny / target);
  };

  const family = ctx.widgetFamily || "systemSmall";
  const isSmall = family === "systemSmall";
  const isMedium = family === "systemMedium";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";

  // 2. 根据组件尺寸动态分配要显示的货币种类
  // 小尺寸显示 5 种，中/大尺寸显示 8 种以保证左右对称 (4对4)
  const currencyConfigs = isSmall 
    ? [
        { id: "usd", name: "🇺🇸 USD" }, { id: "eur", name: "🇪🇺 EUR" }, 
        { id: "gbp", name: "🇬🇧 GBP" }, { id: "jpy", name: "🇯🇵 JPY(100)" }, 
        { id: "hkd", name: "🇭🇰 HKD" }
      ]
    : [
        { id: "usd", name: "🇺🇸 USD" }, { id: "eur", name: "🇪🇺 EUR" }, 
        { id: "gbp", name: "🇬🇧 GBP" }, { id: "jpy", name: "🇯🇵 JPY(100)" }, 
        { id: "hkd", name: "🇭🇰 HKD" }, { id: "aud", name: "🇦🇺 AUD" }, 
        { id: "cad", name: "🇨🇦 CAD" }, { id: "sgd", name: "🇸🇬 SGD" }
      ];

  // 3. 组装包含趋势的数据列表
  const listData = currencyConfigs.map(c => {
    const curr = getRate(currentData, c.id);
    const yest = getRate(yesterdayData, c.id);
    
    let symbol = "";
    let color = "#FFFFFF"; // 默认白色
    
    if (curr && yest) {
      if (curr > yest) {
        symbol = "↑";
        color = "#FF3B30"; // 红色：代表汇率较昨天变大（若习惯国际市场绿涨，可与下面互换）
      } else if (curr < yest) {
        symbol = "↓";
        color = "#34C759"; // 绿色：代表汇率较昨天变小
      } else {
        symbol = "-";
        color = "#888888"; // 灰色：持平
      }
    }

    return {
      name: c.name,
      rate: curr ? curr.toFixed(2) : "--",
      trendSymbol: symbol,
      trendColor: color
    };
  });

  // ====== 锁屏小组件逻辑 ======
  if (family === "accessoryInline") {
    const txt = isError ? "获取失败" : listData.slice(0,3).map(d => `${d.name.substring(0,2)}${d.rate}${d.trendSymbol}`).join(" ");
    return { type: "widget", children: [{ type: "text", text: txt }] };
  }
  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "网络请求失败" }] };
    return {
      type: "widget", gap: 4,
      children: listData.slice(0,3).map(d => ({
        type: "text", text: `${d.name}: ${d.rate} ${d.trendSymbol}`, font: { size: "headline", weight: "bold" }, textColor: d.trendColor === "#FFFFFF" ? "#FFFFFF" : d.trendColor
      }))
    };
  }
  if (family === "accessoryCircular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "Error" }] };
    return {
      type: "widget",
      children: [
        {
          type: "stack", direction: "column", alignItems: "center", gap: 2,
          children: [
            { type: "image", src: "sf-symbol:dollarsign.circle", width: 18, height: 18 },
            { type: "text", text: `${listData[0].rate}${listData[0].trendSymbol}`, font: { size: "caption1", weight: "bold" } }
          ]
        }
      ]
    };
  }

  // ====== 主屏幕小组件排版逻辑 ======
  const rowSpacing = isLarge ? 24 : (isSmall ? 4 : 8);
  const titleSpacing = isLarge ? 28 : (isSmall ? 8 : 12);
  const paddingVal = isLarge ? 24 : 16;
  const titleText = isSmall ? "汇率 (CNY)" : "汇率看板 (CNY)";

  // 构建每一行货币UI的通用函数
  const buildColItem = (item, isSmallFont) => {
    return {
      type: "stack",
      direction: "row",
      alignItems: "center",
      children: [
        { type: "text", text: item.name, font: { size: isSmallFont ? "footnote" : "subheadline", weight: "medium" }, textColor: "#FFFFFF", flex: 1 },
        { 
          type: "stack", 
          direction: "row", 
          alignItems: "center",
          gap: 4, // 汇率数值和箭头之间的间距
          children: [
            { type: "text", text: item.rate, font: { size: isSmallFont ? "footnote" : "subheadline", weight: "bold" }, textColor: "#FFFFFF" },
            { type: "text", text: item.trendSymbol, font: { size: isSmallFont ? "caption2" : "footnote", weight: "bold" }, textColor: item.trendColor }
          ]
        }
      ]
    };
  };

  const contentChildren = [];

  if (!isError) {
    if (isSmall) {
      // 小尺寸：单列排版
      listData.forEach((item, index) => {
        contentChildren.push(buildColItem(item, true));
        if (index < listData.length - 1) contentChildren.push({ type: "spacer", length: rowSpacing });
      });
    } else {
      // 中、大尺寸：左右双列对称排版 (各4种)
      const leftCol = [];
      const rightCol = [];
      const half = Math.ceil(listData.length / 2);
      
      listData.slice(0, half).forEach((item, index) => {
        leftCol.push(buildColItem(item, false));
        if (index < half - 1) leftCol.push({ type: "spacer", length: rowSpacing });
      });
      
      listData.slice(half).forEach((item, index) => {
        rightCol.push(buildColItem(item, false));
        if (index < half - 1) rightCol.push({ type: "spacer", length: rowSpacing });
      });

      contentChildren.push({
        type: "stack",
        direction: "row",
        alignItems: "start",
        children: [
          { type: "stack", direction: "column", children: leftCol, flex: 1 },
          { type: "spacer", length: 20 }, // 左右两列之间的列间距
          { type: "stack", direction: "column", children: rightCol, flex: 1 }
        ]
      });
    }
  } else {
    contentChildren.push({ type: "text", text: "网络或数据解析失败", textColor: "#FF3B30", font: { size: "subheadline" } });
  }

  // 最终的 Widget DSL
  return {
    type: "widget",
    backgroundGradient: {
      type: "linear",
      colors: ["#1A1A2E", "#16213E"],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    padding: paddingVal,
    gap: 0,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          { type: "image", src: "sf-symbol:banknote.fill", color: "#FF9500", width: 16, height: 16 },
          { type: "text", text: titleText, font: { size: "headline", weight: "bold" }, textColor: "#FFFFFF" }
        ]
      },
      { type: "spacer", length: titleSpacing },
      ...contentChildren,
      { type: "spacer" }, 
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          { type: "text", text: "更新于", font: { size: "caption2" }, textColor: "#888888" },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: "caption2" }, textColor: "#888888" }
        ]
      }
    ]
  };
}
