export default async function(ctx) {
  const qbUrl = (ctx.env.QB_URL || "").replace(/\/$/, "");
  const qbUser = ctx.env.QB_USER || "";
  const qbPass = ctx.env.QB_PASS || "";

  let transferInfo = { dl_info_speed: 0, up_info_speed: 0 };
  let isError = false;
  let errorMsg = "网络或认证失败";

  // 工具函数：格式化网速 (Bytes/s 转 KB/s 或 MB/s)
  const formatSpeed = (bytes) => {
    if (bytes === 0) return "0 KB/s";
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  try {
    // 1. 登录获取 Cookie (qBittorrent API 规范)
    const loginResp = await ctx.http.post(`${qbUrl}/api/v2/auth/login`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(qbUser)}&password=${encodeURIComponent(qbPass)}`,
      timeout: 5000
    });

    const cookieHeader = loginResp.headers.get("set-cookie") || loginResp.headers["set-cookie"];
    let sid = "";
    if (Array.isArray(cookieHeader)) {
      const match = cookieHeader.find(c => c.includes("SID="));
      if (match) sid = match.split(";")[0];
    } else if (typeof cookieHeader === "string") {
      sid = cookieHeader.split(";")[0];
    }

    if (!sid) throw new Error("登录失败，未获取到 SID");

    // 2. 获取全局传输速率数据
    const transferResp = await ctx.http.get(`${qbUrl}/api/v2/transfer/info`, {
      headers: { "Cookie": sid },
      timeout: 5000
    });
    
    transferInfo = await transferResp.json();
    
  } catch (e) {
    isError = true;
    if (e.message) errorMsg = e.message;
  }

  // ====== 自适应颜色配置 ======
  const colorMainText = { light: "#000000", dark: "#FFFFFF" };
  const colorSubText = { light: "#8E8E93", dark: "#888888" };
  const colorBgStart = { light: "#FFFFFF", dark: "#1A1A2E" };
  const colorBgEnd = { light: "#F2F2F7", dark: "#16213E" };
  const colorDl = "#34C759"; // 绿色下载
  const colorUp = "#007AFF"; // 蓝色上传

  const family = ctx.widgetFamily || "systemSmall";

  // ====== 1. 锁屏小组件逻辑 ======
  if (family === "accessoryInline") {
    return { type: "widget", children: [{ type: "text", text: isError ? "qB 连接失败" : `⬇️ ${formatSpeed(transferInfo.dl_info_speed)} | ⬆️ ${formatSpeed(transferInfo.up_info_speed)}` }] };
  }

  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "qBittorrent 离线" }] };
    return {
      type: "widget", gap: 4,
      children: [
        { type: "text", text: "qBittorrent 状态", font: { size: "headline", weight: "bold" } },
        { type: "text", text: `⬇️ 下载: ${formatSpeed(transferInfo.dl_info_speed)}`, font: { size: "subheadline", weight: "bold" } },
        { type: "text", text: `⬆️ 上传: ${formatSpeed(transferInfo.up_info_speed)}`, font: { size: "subheadline", weight: "bold" } }
      ]
    };
  }

  // ====== 2. 主屏幕小组件排版 ======
  const isSmall = family === "systemSmall";
  const paddingVal = 16;
  const dlSpeed = formatSpeed(transferInfo.dl_info_speed);
  const upSpeed = formatSpeed(transferInfo.up_info_speed);

  const speedContent = isError 
    ? { type: "text", text: errorMsg, textColor: "#FF3B30", font: { size: "subheadline" } }
    : {
        type: "stack", direction: "column", gap: isSmall ? 8 : 16,
        children: [
          // 下载行
          {
            type: "stack", direction: "row", alignItems: "center",
            children: [
              { type: "image", src: "sf-symbol:arrow.down.circle.fill", color: colorDl, width: 24, height: 24 },
              { type: "spacer", length: 12 },
              { type: "stack", direction: "column", flex: 1, children: [
                { type: "text", text: "下载速率 (DL)", font: { size: "caption1" }, textColor: colorSubText },
                { type: "text", text: dlSpeed, font: { size: "title3", weight: "bold" }, textColor: colorMainText }
              ]}
            ]
          },
          // 上传行
          {
            type: "stack", direction: "row", alignItems: "center",
            children: [
              { type: "image", src: "sf-symbol:arrow.up.circle.fill", color: colorUp, width: 24, height: 24 },
              { type: "spacer", length: 12 },
              { type: "stack", direction: "column", flex: 1, children: [
                { type: "text", text: "上传速率 (UP)", font: { size: "caption1" }, textColor: colorSubText },
                { type: "text", text: upSpeed, font: { size: "title3", weight: "bold" }, textColor: colorMainText }
              ]}
            ]
          }
        ]
      };

  return {
    type: "widget",
    url: qbUrl, // 点击小组件直接跳转到 qBittorrent Web UI
    backgroundGradient: {
      type: "linear",
      colors: [colorBgStart, colorBgEnd],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    padding: paddingVal,
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: "sf-symbol:arrow.triangle.2.circlepath", color: "#AF52DE", width: 16, height: 16 },
          { type: "text", text: "PT 刷流面板", font: { size: "headline", weight: "bold" }, textColor: colorMainText }
        ]
      },
      { type: "spacer", length: isSmall ? 16 : 24 },
      speedContent,
      { type: "spacer" },
      {
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "text", text: "刷新于", font: { size: "caption2" }, textColor: colorSubText },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: "caption2" }, textColor: colorSubText }
        ]
      }
    ]
  };
}
