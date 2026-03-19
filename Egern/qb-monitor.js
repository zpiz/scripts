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
        "Referer": qbUrl,
        // 伪装一个常规浏览器的 UA，降低被反代 WAF 拦截的概率
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1"
      },
      body: `username=${encodeURIComponent(qbUser)}&password=${encodeURIComponent(qbPass)}`,
      timeout: 5000
    });

    // 读取真实的 HTTP 状态码和响应体，用于精准排错
    const statusCode = loginResp.status;
    const resText = await loginResp.text();

    // 如果状态码不是 200，说明连 qB 的大门都没碰到，直接被反向代理拦截了
    if (statusCode !== 200) {
      throw new Error(`反代拦截: HTTP ${statusCode}`);
    }

    // qB 如果账号密码错误，状态码也是 200，但正文是 Fails.
    if (resText === "Fails.") {
      throw new Error("qB 拒绝登录: 账号或密码错误");
    }

    // 2. 多重保险的 Cookie (SID) 提取逻辑
    let sid = "";
    
    // 方法 A：尝试通过标准的 headers.get 获取
    const cookieHeader = loginResp.headers.get ? loginResp.headers.get("set-cookie") : null;
    if (cookieHeader && typeof cookieHeader === 'string') {
      const match = cookieHeader.match(/SID=([^;,]+)/);
      if (match) sid = `SID=${match[1]}`;
    }

    // 方法 B：如果方法 A 失败，回退到暴力正则遍历全部 Headers
    if (!sid) {
      const rawHeaders = JSON.stringify(loginResp.headers);
      const sidMatch = rawHeaders.match(/SID=([^;,"]+)/); 
      if (sidMatch) sid = `SID=${sidMatch[1]}`;
    }

    if (!sid) {
      // 走到这里说明状态码是 200，但死活没有 SID。大概率是请求被 WAF 透明劫持了
      throw new Error(`无 SID, 响应体前20字: ${resText.substring(0, 20)}`);
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
    errorMsg = e.message || "未知错误";
  }

  // ====== 以下 UI 渲染逻辑保持原样，仅针对 errorMsg 做了适配 ======
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

  if (family === "accessoryInline") {
    let text = isError ? "qB 异常" : `⬇️${formatSpeed(transferInfo.dl_info_speed)} ⬆️${formatSpeed(transferInfo.up_info_speed)}`;
    if (!isError && activeTorrents.length > 0) text += ` | ${activeTorrents[0].name.substring(0, 8)}...`;
    return { type: "widget", children: [{ type: "text", text: text }] };
  }

  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: errorMsg, maxLines: 2 }] };
    return {
      type: "widget", gap: 4,
      children: [
        { type: "text", text: `⬇️ ${formatSpeed(transferInfo.dl_info_speed)}  ⬆️ ${formatSpeed(transferInfo.up_info_speed)}`, font: { size: "subheadline", weight: "bold" } },
        { type: "text", text: activeTorrents.length > 0 ? `正在下载: ${activeTorrents.length} 个任务` : "做种中...", font: { size: "caption1" } },
        { type: "text", text: activeTorrents.length > 0 ? activeTorrents[0].name : "", font: { size: "caption1" }, maxLines: 1 }
      ]
    };
  }

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

  const nextRefreshTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  if (isError) {
    return {
      type: "widget", padding: paddingVal,
      refreshAfter: nextRefreshTime,
      backgroundGradient: { type: "linear", colors: [colorBgStart, colorBgEnd], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
      // 错误信息显示区
      children: [
        { type: "text", text: "qBittorrent 监控异常", font: { size: "headline", weight: "bold" }, textColor: "#FF3B30" },
        { type: "spacer", length: 8 },
        { type: "text", text: errorMsg, textColor: colorMainText, font: { size: "caption1" }, maxLines: 4 }
      ]
    };
  }

  return {
    type: "widget",
    url: qbUrl, 
    refreshAfter: nextRefreshTime,
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
          { type: "text", text: "PT 面板", font: { size: "headline", weight: "bold" }, textColor: colorMainText }
        ]
      },
      { type: "spacer", length: 8 },
      {
        type: "stack", direction: "row", alignItems: "center", gap: 12,
        children: [
          { type: "text", text: `⬇️ ${formatSpeed(transferInfo.dl_info_speed)}`, font: { size: "subheadline", weight: "bold" }, textColor: colorDl },
          { type: "text", text: `⬆️ ${formatSpeed(transferInfo.up_info_speed)}`, font: { size: "subheadline", weight: "bold" }, textColor: colorUp }
        ]
      },
      { type: "spacer", length: isSmall ? 8 : 12 },
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
