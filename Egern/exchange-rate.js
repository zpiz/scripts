export default async function(ctx) {
  const currentUrl = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

  let currentData = null;
  let yesterdayData = null;
  let isError = false;
  let isUsingCache = false; // 新增：标记是否在使用缓存

  try {
    const respCurr = await ctx.http.get(currentUrl, { timeout: 5000 });
    currentData = await respCurr.json();
    
    if (currentData && currentData.date) {
      const apiDate = new Date(currentData.date);
      const prevDate = new Date(apiDate.getTime() - 86400000);
      
      const yyyy = prevDate.getFullYear();
      const mm = String(prevDate.getMonth() + 1).padStart(2, '0');
      const dd = String(prevDate.getDate()).padStart(2, '0');
      const prevDateStr = `${yyyy}-${mm}-${dd}`;
      
      const prevUrl = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${prevDateStr}/v1/currencies/usd.json`;
      const respPrev = await ctx.http.get(prevUrl, { timeout: 5000 });
      yesterdayData = await respPrev.json();

      // ==========================================
      // 核心优化 1：网络请求成功，将数据写入本地缓存
      // ==========================================
      if (ctx.cache) {
        ctx.cache.set("cached_currency_current", JSON.stringify(currentData));
        ctx.cache.set("cached_currency_yesterday", JSON.stringify(yesterdayData));
        ctx.cache.set("cached_currency_time", new Date().toISOString());
      }
    } else {
      throw new Error("Invalid API Data");
    }
  } catch (e) {
    // ==========================================
    // 核心优化 2：网络请求失败，尝试读取本地缓存进行降级
    // ==========================================
    if (ctx.cache) {
      const cachedCurr = ctx.cache.get("cached_currency_current");
      const cachedYest = ctx.cache.get("cached_currency_yesterday");
      
      if (cachedCurr && cachedYest) {
        currentData = JSON.parse(cachedCurr);
        yesterdayData = JSON.parse(cachedYest);
        isUsingCache = true; // 标记正在使用旧的缓存数据
      } else {
        isError = true; // 连缓存都没有，只能认命报错了
      }
    } else {
      isError = true;
    }
  }

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

  // ====== 定义自适应颜色 (白天/夜间模式) ======
  const colorMainText = { light: "#000000", dark: "#FFFFFF" };
  const colorSubText = { light: "#8E8E93", dark: "#888888" };
  const colorBgStart = { light: "#FFFFFF", dark: "#1A1A2E" };
  const colorBgEnd = { light: "#F2F2F7", dark: "#16213E" };
  const colorTrendFlat = { light: "#8E8E93", dark: "#888888" };
  const colorTrendUp = "#FF3B30";   
  const colorTrendDown = "#34C759"; 

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

  const listData = currencyConfigs.map(c => {
    const curr = getRate(currentData, c.id);
    const yest = getRate(yesterdayData, c.id);
    
    let symbol = "-";
    let color = colorTrendFlat; 
    
    if (curr && yest) {
      const currVal = Number(curr.toFixed(4));
      const yestVal = Number(yest.toFixed(4));

      if (currVal > yestVal) {
        symbol = "↑";
        color = colorTrendUp;
      } else if (currVal < yestVal) {
        symbol = "↓";
        color = colorTrendDown;
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
    let txt = isError ? "获取失败" : listData.slice(0,3).map(d => `${d.name.substring(0,2)}${d.rate}${d.trendSymbol}`).join(" ");
    if (isUsingCache) txt += " ⚠️"; // 锁屏提示缓存状态
    return { type: "widget", children: [{ type: "text", text: txt }] };
  }
  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "网络请求失败且无缓存" }] };
    return {
      type: "widget", gap: 4,
      children: listData.slice(0,3).map((d, index) => {
        let textStr = `${d.name}: ${d.rate} ${d.trendSymbol}`;
        if (index === 0 && isUsingCache) textStr += " (离线缓存)";
        return {
          type: "text", 
          text: textStr, 
          font: { size: "headline", weight: "bold" }, 
          textColor: d.trendSymbol === "-" ? undefined : d.trendColor
        };
      })
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
            { type: "text", text: `${listData[0].rate}${listData[0].trendSymbol}${isUsingCache ? '⚠️' : ''}`, font: { size: "caption1", weight: "bold" } }
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

  const buildColItem = (item, isSmallFont) => {
    return {
      type: "stack",
      direction: "row",
      alignItems: "center",
      children: [
        { type: "text", text: item.name, font: { size: isSmallFont ? "footnote" : "subheadline", weight: "medium" }, textColor: colorMainText, flex: 1 },
        { 
          type: "stack", 
          direction: "row", 
          alignItems: "center",
          gap: 4, 
          children: [
            { type: "text", text: item.rate, font: { size: isSmallFont ? "footnote" : "subheadline", weight: "bold" }, textColor: colorMainText },
            { type: "text", text: item.trendSymbol, font: { size: isSmallFont ? "caption2" : "footnote", weight: "bold" }, textColor: item.trendColor }
          ]
        }
      ]
    };
  };

  const contentChildren = [];

  if (!isError) {
    if (isSmall) {
      listData.forEach((item, index) => {
        contentChildren.push(buildColItem(item, true));
        if (index < listData.length - 1) contentChildren.push({ type: "spacer", length: rowSpacing });
      });
    } else {
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
          { type: "spacer", length: 20 },
          { type: "stack", direction: "column", children: rightCol, flex: 1 }
        ]
      });
    }
  } else {
    contentChildren.push({ type: "text", text: "网络且缓存解析均失败", textColor: colorTrendUp, font: { size: "subheadline" } });
  }

  // 计算缓存的真实生成时间
  let displayTime = new Date().toISOString();
  if (isUsingCache && ctx.cache) {
      const cachedTime = ctx.cache.get("cached_currency_time");
      if (cachedTime) displayTime = cachedTime;
  }
  
  // 如果使用缓存，在底部时间前加个离线提示
  const timePrefixText = isUsingCache ? "⚠️ 离线缓存于" : "更新于";

  return {
    type: "widget",
    refreshAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 建议系统 1 小时后刷新
    backgroundGradient: {
      type: "linear",
      colors: [colorBgStart, colorBgEnd],
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
          { type: "text", text: titleText, font: { size: "headline", weight: "bold" }, textColor: colorMainText }
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
          // 优化 3：更新底部时间戳逻辑，如果使用缓存，显示的是“上次成功获取数据的时间”
          { type: "text", text: timePrefixText, font: { size: "caption2" }, textColor: isUsingCache ? "#FF9500" : colorSubText },
          { type: "date", date: displayTime, format: "time", font: { size: "caption2" }, textColor: isUsingCache ? "#FF9500" : colorSubText }
        ]
      }
    ]
  };
}
