// 免费的汇率接口 (以美元为基础基准)
const url = "https://api.exchangerate-api.com/v4/latest/USD";

// 面板初始化默认结构
let tile = {
    title: "实时汇率",
    icon: "dollarsign.circle.fill", // 苹果原生图标：带圆圈的美元符号
    backgroundColor: "#FF9500", // 橙色背景，适合金融类数据
    content: "正在获取汇率..."
};

$httpClient.get(url, function(error, response, data) {
    if (error) {
        tile.content = "获取汇率失败 / 网络离线";
        tile.backgroundColor = "#FF3B30"; // 红色告警
        $done(tile);
        return;
    }

    try {
        let res = JSON.parse(data);
        let rates = res.rates;
        
        // 计算各种货币对人民币 (CNY) 的汇率
        let usdToCny = rates["CNY"].toFixed(2);
        // 日元通常看100日元兑换多少人民币
        let jpyToCny = ((rates["CNY"] / rates["JPY"]) * 100).toFixed(2); 
        // 港币对人民币
        let hkdToCny = (rates["CNY"] / rates["HKD"]).toFixed(4);

        // 排版显示的内容 (支持使用 \n 换行，在 Stash 宽面板下表现极佳)
        tile.content = `🇺🇸 USD / CNY :  ${usdToCny}\n🇯🇵 100JPY / CNY :  ${jpyToCny}\n🇭🇰 HKD / CNY :  ${hkdToCny}`;
        
        // 点击面板直接跳转到浏览器查汇率（可选）
        tile.url = "https://www.google.com/finance/quote/USD-CNY";
        
        $done(tile);
    } catch (e) {
        tile.content = "接口数据解析异常";
        tile.backgroundColor = "#8E8E93"; // 灰色
        $done(tile);
    }
});
