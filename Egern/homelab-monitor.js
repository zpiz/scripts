/*
------------------------------------------
@Date: 2026.10.14 优化UI
@Description: NAS状态监控
@Author: zpiz
------------------------------------------
@Description:
*/

export default async function(ctx) {
  const env = ctx.env || {};
  const nasUrl = (env.NAS_URL || "").trim();
  const macUrl = (env.MAC_URL || "").trim();
  const refreshAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const probe = async (url) => {
    if (!url) return { state: "unconfigured", latency: null };
    if (!/^https?:\/\//i.test(url)) return { state: "invalid", latency: null };
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        await ctx.http.get(url, { timeout: 2500, redirect: "manual" });
        return { state: "online", latency: Date.now() - started };
      } catch (_) {}
    }
    return { state: "unreachable", latency: null };
  };

  const [nas, mac] = await Promise.all([probe(nasUrl), probe(macUrl)]);
  const colors = {
    main: { light: "#000000", dark: "#FFFFFF" },
    sub: { light: "#8E8E93", dark: "#888888" },
    bgStart: { light: "#FFFFFF", dark: "#1A1A2E" },
    bgEnd: { light: "#F2F2F7", dark: "#16213E" },
    online: "#34C759",
    warning: "#FF9500",
    muted: "#8E8E93",
    icon: "#007AFF"
  };
  const stateColor = (state) => state === "online" ? colors.online
    : state === "unreachable" ? colors.warning : colors.muted;
  const stateText = (result) => result.state === "online" ? `${result.latency} ms`
    : result.state === "unconfigured" ? "未配置"
    : result.state === "invalid" ? "地址错误" : "暂不可达";
  const stateIcon = (state) => state === "online" ? "🟢"
    : state === "unreachable" ? "🟠" : "⚪";
  const devices = [
    { name: "绿联 NAS", icon: "server.rack", result: nas },
    { name: "Mac mini", icon: "macmini.fill", result: mac }
  ];

  const family = ctx.widgetFamily || "systemSmall";
  if (family === "accessoryInline") {
    return {
      type: "widget", refreshAfter,
      children: [{ type: "text", text: `NAS: ${stateIcon(nas.state)} | Mac: ${stateIcon(mac.state)}` }]
    };
  }
  if (family === "accessoryRectangular") {
    return {
      type: "widget", refreshAfter, gap: 4,
      children: devices.map(device => ({
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "image", src: "sf-symbol:circle.fill", width: 10, height: 10, color: stateColor(device.result.state) },
          { type: "text", text: `${device.name}: ${stateText(device.result)}`, font: { size: "subheadline", weight: "bold" }, maxLines: 1, minScale: 0.7 }
        ]
      }))
    };
  }
  if (family === "accessoryCircular") {
    return {
      type: "widget", refreshAfter,
      children: [{
        type: "stack", direction: "column", alignItems: "center", gap: 2,
        children: [
          { type: "image", src: "sf-symbol:server.rack", width: 16, height: 16 },
          { type: "image", src: "sf-symbol:circle.fill", width: 10, height: 10, color: stateColor(nas.state) }
        ]
      }]
    };
  }

  const isSmall = family === "systemSmall";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";
  const buildDeviceRow = (device) => ({
    type: "stack", direction: "row", alignItems: "center", gap: 8,
    children: [
      { type: "image", src: `sf-symbol:${device.icon}`, color: colors.icon, width: 20, height: 20 },
      { type: "text", text: device.name, font: { size: "subheadline", weight: "semibold" }, textColor: colors.main, maxLines: 1, minScale: 0.7 },
      { type: "spacer" },
      { type: "image", src: "sf-symbol:circle.fill", color: stateColor(device.result.state), width: 8, height: 8 },
      { type: "text", text: stateText(device.result), font: { size: "subheadline", weight: "bold" }, textColor: colors.main, maxLines: 1, minScale: 0.7 }
    ]
  });

  return {
    type: "widget",
    refreshAfter,
    backgroundGradient: {
      type: "linear", colors: [colors.bgStart, colors.bgEnd],
      startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }
    },
    padding: isLarge ? 24 : 16,
    gap: 0,
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: "sf-symbol:network", color: "#AF52DE", width: 16, height: 16 },
          { type: "text", text: isSmall ? "网络探针" : "HomeLab 监控面板", font: { size: "headline", weight: "bold" }, textColor: colors.main }
        ]
      },
      { type: "spacer", length: isLarge ? 18 : isSmall ? 10 : 12 },
      buildDeviceRow(devices[0]),
      { type: "spacer", length: isLarge ? 22 : isSmall ? 14 : 18 },
      buildDeviceRow(devices[1]),
      { type: "spacer" },
      {
        type: "stack", direction: "row", alignItems: "center", gap: 4,
        children: [
          { type: "text", text: "最后检测", font: { size: "caption2" }, textColor: colors.sub },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: "caption2" }, textColor: colors.sub }
        ]
      }
    ]
  };
}
