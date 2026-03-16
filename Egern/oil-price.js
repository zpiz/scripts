export default async function(ctx) {
  const province = ctx.env.PROVINCE || "河北";
  const cacheKey = `oil_price_cache_${province}`;
  
  // 引入主备双路 API 机制，提升可用性
  const primaryUrl = `http://m.qiyoujiage.com/${encodeURIComponent(province)}.shtml`;
  //const primaryUrl = `https://tenapi.cn/v2/oil?province=${encodeURIComponent(province)}`;
  const backupUrl = `https://api.vvhan.com/api/oil?prov=${encodeURIComponent(province)}`;
  
  let oilData = {};
  let updateTime = new Date().toISOString().split('T')[0];
  let isError = false;
  let isCached = false;

  // 强兼容的数据解析器：抹平不同 API 返回字段的差异
  const parseData = (json) => {
    if (!json) return null;
    let d = json.data;
    if (Array.isArray(d)) d = d[0];
    if (!d) return null;
    
    return {
      p92: d.p92 || d["92"] || d["92h"] || "--",
      p95: d.p95 || d["95"] || d["95h"] || "--",
      p98: d.p98 || d["98"] || d["98h"] || "--",
      p0:  d.p0  || d["0"]  || d["0h"]  || "--",
      time: d.time || d.updateTime || d.date || updateTime
    };
  };

  try {
    let resJson = null;
    try {
      // 1. 优先探测主节点
      const resp = await ctx.http.get(primaryUrl, { timeout: 4000 });
      resJson = await resp.json();
    } catch (err) {
      // 2. 主节点超时或 502，无缝切换到备用节点
      const resp2 = await ctx.http.get(backupUrl, { timeout: 4000 });
      resJson = await resp2.json();
    }

    const parsed = parseData(resJson);
    if (parsed && parsed.p92 !== "--") {
      oilData = parsed;
      updateTime = parsed.time;
      // 请求成功，覆盖本地缓存
      ctx.storage.setJSON(cacheKey, { data: oilData, time: updateTime });
    } else {
      throw new Error("API 数据结构异常");
    }
  } catch (e) {
    // 3. 主备双双阵亡，触发本地离线缓存降级
    const cachedData = ctx.storage.getJSON(cacheKey);
    if (cachedData && cachedData.data) {
      oilData = cachedData.data;
      updateTime = cachedData.time;
      isCached = true;
    } else {
      isError = true;
    }
  }

  // ====== 定义自适应颜色 (白天/夜间模式) ======
  const colorMainText = { light: "#000000", dark: "#FFFFFF" };
  const colorSubText = { light: "#8E8E93", dark: "#888888" };
  const colorBgStart = { light: "#FFFFFF", dark: "#1A1A2E" };
  const colorBgEnd = { light: "#F2F2F7", dark: "#16213E" };
  const colorHighlight = "#FF9500"; 
  const colorCacheWarning = "#FF9500";

  // 组装油价展示数据
  const listData = [
    { name: "92# 汽油", price: oilData.p92 || "--", color: "#34C759" },
    { name: "95# 汽油", price: oilData.p95 || "--", color: "#FF3B30" }, 
    { name: "98# 汽油", price: oilData.p98 || "--", color: "#AF52DE" }, 
    { name: "0# 柴油", price: oilData.p0  || "--", color: "#007AFF" }  
  ];

  const family = ctx.widgetFamily || "systemSmall";

  // ====== 1. 锁屏小组件逻辑 ======
  if (family === "accessoryInline") {
    let txt = "";
    if (isError) {
      txt = "油价获取失败";
    } else {
      txt = `${province} 92# ${oilData.p92} | 95# ${oilData.p95}`;
      if (isCached) txt += " (离线)";
    }
    return { type: "widget", children: [{ type: "text", text: txt }] };
  }
  
  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "无网络且无本地缓存" }] };
    return {
      type: "widget", gap: 4,
      children: [
        { type: "text", text: `⛽️ ${province}油价${isCached ? " (离线)" : ""}`, font: { size: "headline", weight: "bold" } },
        { type: "text", text: `92# 汽油: ¥${oilData.p92}`, font: { size: "subheadline", weight: "semibold" } },
        { type: "text", text: `95# 汽油: ¥${oilData.p95}`, font: { size: "subheadline", weight: "semibold" } }
      ]
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
            { type: "image", src: "sf-symbol:fuelpump.fill", width: 16, height: 16 },
            { type: "text", text: oilData.p95, font: { size: "caption1", weight: "bold" }, textColor: isCached ? colorCacheWarning : undefined }
          ]
        }
      ]
    };
  }

  // ====== 2. 主屏幕小组件排版逻辑 ======
  const isSmall = family === "systemSmall";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";

  const rowSpacing = isLarge ? 24 : (isSmall ? 8 : 12);
  const titleSpacing = isLarge ? 28 : (isSmall ? 12 : 16);
  const paddingVal = isLarge ? 24 : 16;
  const titleText = isSmall ? `${province}油价` : `今日油价 (${province})`;

  const buildColItem = (item, isSmallFont) => {
    return {
      type: "stack", direction: "row", alignItems: "center",
      children: [
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 6, flex: 1,
          children: [
            { type: "image", src: "sf-symbol:fuelpump.circle.fill", color: item.color, width: isSmallFont ? 16 : 20, height: isSmallFont ? 16 : 20 },
            { type: "text", text: item.name, font: { size: isSmallFont ? "footnote" : "subheadline", weight: "medium" }, textColor: colorMainText }
          ]
        },
        { 
          type: "stack", direction: "row", alignItems: "baseline", gap: 2,
          children: [
            { type: "text", text: "¥", font: { size: "caption2", weight: "semibold" }, textColor: item.color },
            { type: "text", text: item.price, font: { size: isSmallFont ? "subheadline" : "title3", weight: "bold" }, textColor: colorMainText }
          ]
        }
      ]
    };
  };

  const contentChildren = [];

  if (!isError) {
    if (family === "systemMedium") {
      const leftCol = [buildColItem(listData[0], false), { type: "spacer", length: rowSpacing }, buildColItem(listData[1], false)];
      const rightCol = [buildColItem(listData[2], false), { type: "spacer", length: rowSpacing }, buildColItem(listData[3], false)];

      contentChildren.push({
        type: "stack", direction: "row", alignItems: "start",
        children: [
          { type: "stack", direction: "column", children: leftCol, flex: 1 },
          { type: "spacer", length: 24 },
          { type: "stack", direction: "column", children: rightCol, flex: 1 }
        ]
      });
    } else {
      listData.forEach((item, index) => {
        contentChildren.push(buildColItem(item, isSmall));
        if (index < listData.length - 1) contentChildren.push({ type: "spacer", length: rowSpacing });
      });
    }
  } else {
    contentChildren.push({ type: "text", text: "无网络且无本地缓存数据", textColor: "#FF3B30", font: { size: "subheadline" } });
  }

  const timeText = isCached ? `${updateTime} (离线缓存)` : updateTime;
  const timeColor = isCached ? colorCacheWarning : colorSubText;

  return {
    type: "widget",
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
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: "sf-symbol:car.fill", color: colorHighlight, width: 16, height: 16 },
          { type: "text", text: titleText, font: { size: "headline", weight: "bold" }, textColor: colorMainText }
        ]
      },
      { type: "spacer", length: titleSpacing },
      ...contentChildren,
      { type: "spacer" }, 
      {
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "text", text: "发改委调价", font: { size: "caption2" }, textColor: colorSubText },
          { type: "text", text: timeText, font: { size: "caption2" }, textColor: timeColor }
        ]
      }
    ]
  };
}
