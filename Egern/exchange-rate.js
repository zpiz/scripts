export default async function(ctx) {
  // 请求基础汇率数据
  const apiUrl = "https://api.exchangerate-api.com/v4/latest/USD";
  
  let rates = {};
  let isError = false;

  try {
    const resp = await ctx.http.get(apiUrl, { timeout: 5000 });
    const data = await resp.json();
    const cny = data.rates.CNY;
    
    rates = {
      USD: cny.toFixed(2),
      EUR: (cny / data.rates.EUR).toFixed(2),
      GBP: (cny / data.rates.GBP).toFixed(2),
      JPY: ((cny / data.rates.JPY) * 100).toFixed(2),
      HKD: (cny / data.rates.HKD).toFixed(2)
    };
  } catch (e) {
    isError = true;
  }

  const family = ctx.widgetFamily || "systemSmall";

  // ====== 锁屏小组件逻辑保持不变 ======
  if (family === "accessoryInline") {
    return { type: "widget", children: [{ type: "text", text: isError ? "获取失败" : `🇺🇸${rates.USD} 🇪🇺${rates.EUR} 🇯🇵${rates.JPY}` }] };
  }
  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "网络请求失败" }] };
    return {
      type: "widget", gap: 4,
      children: [
        { type: "text", text: `🇺🇸 USD: ${rates.USD}`, font: { size: "headline", weight: "bold" } },
        { type: "text", text: `🇪🇺 EUR: ${rates.EUR}`, font: { size: "headline", weight: "bold" } },
        { type: "text", text: `🇯🇵 JPY: ${rates.JPY}`, font: { size: "headline", weight: "bold" } }
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
            { type: "image", src: "sf-symbol:dollarsign.circle", width: 18, height: 18 },
            { type: "text", text: rates.USD, font: { size: "caption1", weight: "bold" } }
          ]
        }
      ]
    };
  }

  // ====== 主屏幕小组件 (动态排版核心逻辑) ======
  const isSmall = family === "systemSmall";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";

  // 1. 根据尺寸动态分配间距和内边距
  // 小号尺寸大幅压缩行距避免溢出；中号保持舒适；大号尽量舒展
  const rowSpacing = isLarge ? 24 : (isSmall ? 4 : 12);
  const titleSpacing = isLarge ? 28 : (isSmall ? 8 : 16);
  const paddingVal = isLarge ? 24 : 16;
  
  // 2. 动态调整标题长度避免在小号组件中被截断
  const titleText = isSmall ? "汇率 (CNY)" : "汇率看板 (CNY)";

  const currencyRows = [];
  if (!isError) {
    const list = [
      { name: "🇺🇸 USD", rate: rates.USD },
      { name: "🇪🇺 EUR", rate: rates.EUR },
      { name: "🇬🇧 GBP", rate: rates.GBP },
      { name: "🇯🇵 JPY(100)", rate: rates.JPY },
      { name: "🇭🇰 HKD", rate: rates.HKD }
    ];

    list.forEach((item, index) => {
      currencyRows.push({
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          // 减小小号尺寸的字体大小，确保即使是稍微长一点的数字也能完整显示
          { type: "text", text: item.name, font: { size: isSmall ? "footnote" : "subheadline", weight: "medium" }, textColor: "#FFFFFF", flex: 1 },
          { type: "text", text: item.rate, font: { size: isSmall ? "footnote" : "subheadline", weight: "bold" }, textColor: "#34C759" }
        ]
      });
      // 插入动态高度的间距
      if (index < list.length - 1) {
        currencyRows.push({ type: "spacer", length: rowSpacing });
      }
    });
  } else {
    currencyRows.push({ type: "text", text: "网络请求失败", textColor: "#FF3B30", font: { size: "subheadline" } });
  }

  // 构建最终配置
  const widgetConfig = {
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
      ...currencyRows,
      { type: "spacer" }, // 这个会自动吃掉剩余的弹性空间，将下面的时间推到底部
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

  if (isLarge) {
    // 你的背景图 Base64 预留位
    const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    widgetConfig.backgroundImage = base64Image;
  }

  return widgetConfig;
}
