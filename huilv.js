export default async function(ctx) {
  // 请求基础汇率数据（以美元为基准）
  const apiUrl = "https://api.exchangerate-api.com/v4/latest/USD";
  
  let rates = {};
  let isError = false;

  try {
    const resp = await ctx.http.get(apiUrl, { timeout: 5000 });
    const data = await resp.json();
    const cny = data.rates.CNY;
    
    // 计算各货币对人民币的交叉汇率
    rates = {
      USD: cny.toFixed(2),
      EUR: (cny / data.rates.EUR).toFixed(2),
      GBP: (cny / data.rates.GBP).toFixed(2),
      JPY: ((cny / data.rates.JPY) * 100).toFixed(2), // 日元通常展示 100 JPY = ? CNY
      HKD: (cny / data.rates.HKD).toFixed(2)
    };
  } catch (e) {
    isError = true;
  }

  // 动态构建货币列表行
  const currencyRows = [];
  if (!isError) {
    const list = [
      { name: "🇺🇸 USD", rate: rates.USD },
      { name: "🇪🇺 EUR", rate: rates.EUR },
      { name: "🇬🇧 GBP", rate: rates.GBP },
      { name: "🇯🇵 JPY(100)", rate: rates.JPY },
      { name: "🇭🇰 HKD", rate: rates.HKD }
    ];

    list.forEach(item => {
      currencyRows.push({
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          // flex: 1 会自动占满左侧剩余空间，实现两端对齐
          { type: "text", text: item.name, font: { size: "subheadline", weight: "medium" }, textColor: "#FFFFFF", flex: 1 },
          { type: "text", text: item.rate, font: { size: "subheadline", weight: "bold" }, textColor: "#34C759" }
        ]
      });
    });
  } else {
    currencyRows.push({
      type: "text",
      text: "网络请求失败，请检查连接",
      textColor: "#FF3B30",
      font: { size: "subheadline" }
    });
  }

  // 返回最终的小组件 DSL 结构
  return {
    type: "widget",
    backgroundGradient: {
      type: "linear",
      colors: ["#1A1A2E", "#16213E"], // 深色护眼背景
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    padding: 16,
    gap: 6, // 控制每一行之间的间距
    children: [
      // 头部标题区
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
      { type: "spacer", length: 4 }, // 标题和列表的间距
      
      // 展开注入之前生成的汇率列表
      ...currencyRows,
      
      { type: "spacer" }, // 将底部时间推到最下边
      
      // 底部更新时间区
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
