export default async function(ctx) {
  const qbUrl = (ctx.env.QB_URL || "").replace(/\/$/, "");
  const qbUser = ctx.env.QB_URL ? (ctx.env.QB_USER || "") : "";
  const qbPass = ctx.env.QB_URL ? (ctx.env.QB_PASS || "") : "";

  let transferInfo = { dl_info_speed: 0, up_info_speed: 0 };
  let activeTorrents = [];
  let isError = false;
  let errorMsg = "网络或认证失败";

  // 工具函数：格式化网速
  const formatSpeed = (bytes) => {
    if (!bytes || bytes === 0) return "0 KB/s";
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  try {
    if (!qbUrl) throw new Error("请在模块配置中填写 QB_URL");

    // 1. 登录获取 Cookie
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
    if (!sid) throw new Error("登录验证失败");

    // 2. 并发获取全局速率与正在下载的任务列表
    const [transferResp, torrentsResp] = await Promise.all([
      ctx.http.get(`${qbUrl}/api/v2/transfer/info`, { headers: { "Cookie": sid }, timeout: 5000 }),
      ctx.http.get(`${qbUrl}/api/v2/torrents/info?filter=downloading`, { headers: { "Cookie": sid }, timeout: 5000 })
    ]);
    
    transferInfo = await transferResp.json();
    const torrentsData = await torrentsResp.json();
    if (Array.isArray(torrentsData)) {
      // 按下载速度降序排列任务，把跑得最快的放在前面
      activeTorrents = torrentsData.sort((a, b) => b.dlspeed - a.dlspeed);
    }
    
  } catch (e) {
    isError = true;
    if (e.message) errorMsg = e.message;
  }

  // ====== 自适应颜色配置 ======
  const colorMainText = { light: "#000000", dark: "#FFFFFF" };
  const colorSubText = { light: "#8E8E93", dark: "#888888" };
  const colorBgStart = { light: "#FFFFFF", dark: "#1A1A2E" };
  const colorBgEnd = { light: "#F2F2F7", dark: "#16213E" };
  const colorDl = "#34C759"; 
  const colorUp = "#007AFF"; 
  const colorProgress = "#AF52DE"; // 紫色进度百分比

  const family = ctx.widgetFamily || "systemSmall";
  const isSmall = family === "systemSmall";
  const paddingVal = isSmall ? 12 : 16;

  // ====== 1. 锁屏小组件逻辑 ======
  if (family === "accessoryInline") {
    let text = isError ? "qB 连接失败" : `⬇️${formatSpeed(transferInfo.dl_info_speed)} ⬆️${formatSpeed(transferInfo.up_info_speed)}`;
    if (!isError && activeTorrents.length > 0) {
      // 锁屏内联如果空间够，顺便加上第一个任务的名字截断
      text += ` | ${activeTorrents[0].name.substring(0, 8)}...`;
    }
    return { type: "widget", children: [{ type: "text", text: text }] };
  }

  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "qBittorrent 离线" }] };
    return {
      type: "widget", gap: 4,
      children: [
        { type: "text", text: `⬇️ ${formatSpeed(transferInfo.dl_info_speed)}  ⬆️ ${formatSpeed(transferInfo.up_info_speed)}`, font: { size: "subheadline", weight: "bold" } },
        { type: "text", text: activeTorrents.length > 0 ? `正在下载: ${activeTorrents.length} 个任务` : "做种中...", font: { size: "caption1" } },
        { type: "text", text: activeTorrents.length > 0 ? activeTorrents[0].name : "", font: { size: "caption1" }, maxLines: 1 }
      ]
    };
  }

  // ====== 2. 主屏幕任务列表构建逻辑 ======
  // 构建单行任务 UI
  const buildTaskRow = (task) => {
    const progressPercent = (task.progress * 100).toFixed(1);
    const speed = formatSpeed(task.dlspeed);
    return {
      type: "stack", direction: "column", gap: 4,
      children: [
        // 任务名 (限制1行自动省略号)
        { type: "text", text: task.name, font: { size: "caption1", weight: "medium" }, textColor: colorMainText, maxLines: 1 },
        // 进度与速率区
        {
          type: "stack", direction: "row", alignItems: "center",
          children: [
            { type: "image", src: "sf-symbol:arrow.down.circle.fill", color: colorDl, width: 12, height: 12 },
            { type: "spacer", length: 4 },
            { type: "text", text: speed, font: { size: "caption2", weight: "semibold" }, textColor: colorSubText },
            { type: "spacer" },
            { type: "text", text: `${progressPercent}%`, font: { size: "caption2", weight: "bold" }, textColor: colorProgress }
          ]
        }
      ]
    };
  };

  const tasksContent = [];
  if (activeTorrents.length > 0) {
    // 小号组件只展示 1 个，中/大号展示最多 3 个
    const maxTasks = isSmall ? 1 : 3;
    const tasksToShow = activeTorrents.slice(0, maxTasks);
    
    tasksToShow.forEach((task, index) => {
      tasksContent.push(buildTaskRow(task));
      if (index < tasksToShow.length - 1) {
        tasksContent.push({ type: "spacer", length: 8 });
      }
    });
  } else {
    // 没有下载任务时的占位
    tasksContent.push({
      type: "stack", direction: "row", alignItems: "center", gap: 6,
      children: [
        { type: "image", src: "sf-symbol:checkmark.seal.fill", color: colorDl, width: 16, height: 16 },
        { type: "text", text: "队列清空，静默做种中", font: { size: "caption1", weight: "medium" }, textColor: colorSubText }
      ]
    });
  }

  // ====== 3. 主屏幕最终组合 ======
  if (isError) {
    return {
      type: "widget", padding: paddingVal,
      backgroundGradient: { type: "linear", colors: [colorBgStart, colorBgEnd], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
      children: [{ type: "text", text: errorMsg, textColor: "#FF3B30", font: { size: "subheadline" } }]
    };
  }

  return {
    type: "widget",
    url: qbUrl, 
    backgroundGradient: {
      type: "linear",
      colors: [colorBgStart, colorBgEnd],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    padding: paddingVal,
    children: [
      // 头部：标题与全局速率
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          { type: "image", src: "sf-symbol:server.rack", color: "#AF52DE", width: 16, height: 16 },
          { type: "spacer", length: 6 },
          { type: "text", text: "PT 面板", font: { size: "headline", weight: "bold" }, textColor: colorMainText },
          { type: "spacer" },
          // 右上角精简显示全局速率
          { type: "stack", direction: "row", alignItems: "center", gap: 4, children: [
            { type: "text", text: `⬇️${formatSpeed(transferInfo.dl_info_speed)}`, font: { size: "caption2", weight: "bold" }, textColor: colorDl }
          ]}
        ]
      },
      { type: "spacer", length: isSmall ? 12 : 16 },
      
      // 中间：任务列表
      ...tasksContent,
      
      { type: "spacer" },
      
      // 底部：更新时间
      {
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "text", text: "更新于", font: { size: "caption2" }, textColor: colorSubText },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: "caption2" }, textColor: colorSubText }
        ]
      }
    ]
  };
}
