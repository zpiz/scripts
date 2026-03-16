export default async function(ctx) {
  // 从环境变量获取探测地址，如果没填则提供默认提示占位符
  const nasUrl = ctx.env.NAS_URL || "https://127.0.0.1";
  const macUrl = ctx.env.MAC_URL || "https://127.0.0.1";

  // 核心探测函数：发送 GET 请求并计算耗时
  const pingDevice = async (url) => {
    const start = Date.now();
    try {
      // 设定极短的超时时间，3秒没连上就判定为离线
      const resp = await ctx.http.get(url, { timeout: 3000 });
      const latency = Date.now() - start;
      // 只要服务器有 HTTP 响应（哪怕是 401 未授权或 403 禁止访问），都算设备在线
      return { online: true, latency: latency, status: resp.status };
    } catch (e) {
      return { online: false, latency: '--', status: 0 };
    }
  };

  // 并发探测，不浪费一丝加载时间
  const [nasRes, macRes] = await Promise.all([
    pingDevice(nasUrl),
    pingDevice(macUrl)
  ]);

  // ====== 自适应颜色配置 ======
  const colorMainText = { light: "#000000", dark: "#FFFFFF" };
  const colorSubText = { light: "#8E8E93", dark: "#888888" };
  const colorBgStart = { light: "#FFFFFF", dark: "#1A1A2E" };
  const colorBgEnd = { light: "#F2F2F7", dark: "#16213E" };
  const colorOnline = "#34C759";  // 绿灯
  const colorOffline = "#FF3B30"; // 红灯
  const colorIcon = "#007AFF";    // 设备图标统一用科技蓝

  // 设备状态展示数据封装
  const devices = [
    { 
      name: "绿联 NAS", 
      icon: "server.rack", // 服务器机架图标
      online: nasRes.online, 
      latency: nasRes.online ? `${nasRes.latency} ms` : "Offline"
    },
    { 
      name: "Mac mini", 
      icon: "macmini.fill", // 苹果官方 Mac mini 图标
      online: macRes.online, 
      latency: macRes.online ? `${macRes.latency} ms` : "Offline"
    }
  ];

  const family = ctx.widgetFamily || "systemSmall";

  // ====== 1. 锁屏小组件逻辑 ======
  if (family === "accessoryInline") {
    const text = `NAS: ${nasRes.online ? '🟢' : '🔴'} | Mac: ${macRes.online ? '🟢' : '🔴'}`;
    return { type: "widget", children: [{ type: "text", text: text }] };
  }

  if (family === "accessoryRectangular") {
    return {
      type: "widget", gap: 4,
      children: devices.map(d => ({
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "image", src: `sf-symbol:${d.online ? 'checkmark.circle.fill' : 'xmark.circle.fill'}`, width: 12, height: 12, color: d.online ? colorOnline : colorOffline },
          { type: "text", text: `${d.name}: ${d.latency}`, font: { size: "subheadline", weight: "bold" } }
        ]
      }))
    };
  }

  if (family === "accessoryCircular") {
    // 锁屏圆形组件只显示最重要的 NAS 状态
    return {
      type: "widget",
      children: [
        {
          type: "stack", direction: "column", alignItems: "center", gap: 2,
          children: [
            { type: "image", src: "sf-symbol:server.rack", width: 16, height: 16 },
            { type: "image", src: `sf-symbol:${nasRes.online ? 'circle.fill' : 'xmark.circle.fill'}`, width: 10, height: 10, color: nasRes.online ? colorOnline : colorOffline }
          ]
        }
      ]
    };
  }

  // ====== 2. 主屏幕小组件逻辑 ======
  const isSmall = family === "systemSmall";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";

  const paddingVal = isLarge ? 24 : 16;
  const titleText = isSmall ? "网络探针" : "HomeLab 监控面板";

  // 构建单个设备面板的 UI (左侧图标+名称，右侧状态灯+延迟)
  const buildDeviceRow = (device) => {
    return {
      type: "stack",
      direction: "row",
      alignItems: "center",
      children: [
        {
          type: "stack", direction: "row", alignItems: "center", gap: 8, flex: 1,
          children: [
            { type: "image", src: `sf-symbol:${device.icon}`, color: colorIcon, width: 20, height: 20 },
            { type: "text", text: device.name, font: { size: "subheadline", weight: "semibold" }, textColor: colorMainText }
          ]
        },
        {
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: "sf-symbol:circle.fill", color: device.online ? colorOnline : colorOffline, width: 8, height: 8 },
            { type: "text", text: device.latency, font: { size: "subheadline", weight: "bold" }, textColor: colorMainText }
          ]
        }
      ]
    };
  };

  const contentChildren = [];
  
  if (family === "systemMedium") {
    // 中尺寸：左右并排显示
    contentChildren.push({
      type: "stack", direction: "row", alignItems: "center",
      children: [
        { type: "stack", direction: "column", children: [buildDeviceRow(devices[0])], flex: 1 },
        { type: "spacer", length: 24 },
        { type: "stack", direction: "column", children: [buildDeviceRow(devices[1])], flex: 1 }
      ]
    });
  } else {
    // 小尺寸/大尺寸：上下列表显示
    contentChildren.push(buildDeviceRow(devices[0]));
    contentChildren.push({ type: "spacer", length: isLarge ? 24 : 16 });
    contentChildren.push(buildDeviceRow(devices[1]));
  }

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
          { type: "image", src: "sf-symbol:network", color: "#AF52DE", width: 16, height: 16 }, // 紫色网络图标
          { type: "text", text: titleText, font: { size: "headline", weight: "bold" }, textColor: colorMainText }
        ]
      },
      { type: "spacer", length: isLarge ? 28 : (isSmall ? 16 : 20) },
      ...contentChildren,
      { type: "spacer" },
      {
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "text", text: "最后检测", font: { size: "caption2" }, textColor: colorSubText },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: "caption2" }, textColor: colorSubText }
        ]
      }
    ]
  };
}
