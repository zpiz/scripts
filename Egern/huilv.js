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

  // ====== 1. 锁屏小组件：内联文字 (accessoryInline) ======
  if (family === "accessoryInline") {
    return {
      type: "widget",
      children: [{ type: "text", text: isError ? "汇率获取失败" : `🇺🇸${rates.USD} 🇪🇺${rates.EUR} 🇯🇵${rates.JPY}` }]
    };
  }

  // ====== 2. 锁屏小组件：矩形面板 (accessoryRectangular) ======
  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "网络请求失败" }] };
    return {
      type: "widget",
      gap: 4,
      children: [
        { type: "text", text: `🇺🇸 USD: ${rates.USD}`, font: { size: "headline", weight: "bold" } },
        { type: "text", text: `🇪🇺 EUR: ${rates.EUR}`, font: { size: "headline", weight: "bold" } },
        { type: "text", text: `🇯🇵 JPY: ${rates.JPY}`, font: { size: "headline", weight: "bold" } }
      ]
    };
  }

  // ====== 3. 锁屏小组件：圆形表盘 (accessoryCircular) ======
  if (family === "accessoryCircular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "Error" }] };
    return {
      type: "widget",
      children: [
        {
          type: "stack",
          direction: "column",
          alignItems: "center",
          gap: 2,
          children: [
            { type: "image", src: "sf-symbol:dollarsign.circle", width: 18, height: 18 },
            { type: "text", text: rates.USD, font: { size: "caption1", weight: "bold" } }
          ]
        }
      ]
    };
  }

  // ====== 4. 主屏幕小组件 (常规与大号) ======
  
  // 针对大号组件 (systemLarge) 动态调整更宽的行距
  const rowSpacing = (family === "systemLarge" || family === "systemExtraLarge") ? 24 : 12;
  const titleSpacing = (family === "systemLarge" || family === "systemExtraLarge") ? 28 : 16;

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
          { type: "text", text: item.name, font: { size: "subheadline", weight: "medium" }, textColor: "#FFFFFF", flex: 1 },
          { type: "text", text: item.rate, font: { size: "subheadline", weight: "bold" }, textColor: "#34C759" }
        ]
      });
      if (index < list.length - 1) {
        currencyRows.push({ type: "spacer", length: rowSpacing });
      }
    });
  } else {
    currencyRows.push({ type: "text", text: "网络请求失败", textColor: "#FF3B30", font: { size: "subheadline" } });
  }

  // 基础 Widget 配置
  const widgetConfig = {
    type: "widget",
    backgroundGradient: {
      type: "linear",
      colors: ["#1A1A2E", "#16213E"],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    padding: (family === "systemLarge" || family === "systemExtraLarge") ? 24 : 16,
    gap: 0,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          { type: "image", src: "sf-symbol:banknote.fill", color: "#FF9500", width: 16, height: 16 },
          { type: "text", text: "汇率看板 (CNY)", font: { size: "headline", weight: "bold" }, textColor: "#FFFFFF" }
        ]
      },
      { type: "spacer", length: titleSpacing },
      ...currencyRows,
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

  // 如果是大尺寸，覆盖 backgroundGradient，注入背景图片
  if (family === "systemLarge" || family === "systemExtraLarge") {
    // ⚠️ 此处目前为一个透明占位图，你需要将其替换为你自己图片的 Base64
    const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    widgetConfig.backgroundImage = base64Image;
  }

  return widgetConfig;
}
