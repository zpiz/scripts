export default async function(ctx) {
  const qbUrl = (ctx.env.QB_URL || "").replace(/\/$/, "");
  const qbUser = ctx.env.QB_URL ? (ctx.env.QB_USER || "") : "";
  const qbPass = ctx.env.QB_URL ? (ctx.env.QB_PASS || "") : "";

  let transferInfo = { dl_info_speed: 0, up_info_speed: 0 };
  let activeTorrents = [];
  let isError = false;
  let errorMsg = "网络或认证失败";

  const formatSpeed = (bytes) => {
    if (!bytes || bytes === 0) return "0 KB/s";
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  try {
    if (!qbUrl || !qbUser) throw new Error("请在模块配置中填写账号与地址");

    // 1. 发送登录验证请求
    const loginResp = await ctx.http.post(`${qbUrl}/api/v2/auth/login`, {
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": qbUrl // 部分高版本 qB 开启了 CSRF 防护，需要带上 Referer
      },
      body: `username=${encodeURIComponent(qbUser)}&password=${encodeURIComponent(qbPass)}`,
      timeout: 5000
    });

    // 2. 暴力且精准的 Cookie (SID) 提取逻辑
    let sid = "";
    const rawHeaders = JSON.stringify(loginResp.headers);
    // 使用正则直接在所有的 Header 字符串中强行匹配 SID 的值
    const sidMatch = rawHeaders.match(/SID=([^;,"]+)/); 
    
    if (sidMatch) {
      sid = `SID=${sidMatch[1]}`;
    }

    if (!sid) {
      // 进一步排查：如果账号密码错误，qB 会返回 200 OK，但 body 是 "Fails."
      const resText = await loginResp.text();
      if (resText === "Fails.") throw new Error("账号或密码错误");
      throw new Error("未能获取 SID，检查反代配置");
    }

    // 3. 并发获取数据
    const [transferResp, torrentsResp] = await Promise.all([
      ctx.http.get(`${qbUrl}/api/v2/transfer/info`, { headers: { "Cookie": sid }, timeout: 5000 }),
      ctx.http.get(`${qbUrl}/api/v2/torrents/info?filter=downloading`, { headers: { "Cookie": sid }, timeout: 5000 })
    ]);
    
    transferInfo = await transferResp.json();
    const torrentsData = await torrentsResp.json();
    if (Array.isArray(torrentsData)) {
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
  const colorProgress = "#AF52DE"; 

  const family = ctx.widgetFamily || "systemSmall";
  const isSmall = family === "systemSmall";
  const paddingVal = isSmall ? 12 : 16;

  // ====== 1. 锁屏小组件逻辑 ======
  if (family === "accessoryInline") {
    let text = isError ? "qB 连接失败" : `⬇️${formatSpeed(transferInfo.dl_info_speed)} ⬆️${formatSpeed(transferInfo.up_info_speed)}`;
    if (!isError && activeTorrents.length > 0) text += ` | ${activeTorrents[0].name.substring(0, 8)}...`;
    return { type: "widget", children: [{ type: "text", text: text }] };
  }

  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: errorMsg }] };
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
  const buildTaskRow = (task) => {
    const progressPercent = (task.progress * 100).toFixed(1);
    const speed = formatSpeed(task.dlspeed);
    return {
      type: "stack", direction: "column", gap: 4,
      children: [
        { type: "text", text: task.name, font: { size: "caption1", weight: "medium" }, textColor: colorMainText, maxLines: 1 },
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
    const maxTasks = isSmall ? 1 : 3;
    const tasksToShow = activeTorrents.slice(0, maxTasks);
    
    tasksToShow.forEach((task, index) => {
      tasksContent.push(buildTaskRow(task));
      if (index < tasksToShow.length - 1) tasksContent.push({ type: "spacer", length: 8 });
    });
  } else {
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
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          { type: "image", src: "sf-symbol:server.rack", color: "#AF52DE", width: 16, height: 16 },
          { type: "spacer", length: 6 },
          { type: "text", text: "PT 面板", font: { size: "headline", weight: "bold" }, textColor: colorMainText },
          { type: "spacer" },
          { type: "stack", direction: "row", alignItems: "center", gap: 4, children: [
            { type: "text", text: `⬇️${formatSpeed(transferInfo.dl_info_speed)}`, font: { size: "caption2", weight: "bold" }, textColor: colorDl }
          ]}
        ]
      },
      { type: "spacer", length: isSmall ? 12 : 16 },
      ...tasksContent,
      { type: "spacer" },
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
