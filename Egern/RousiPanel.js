const SITE = "https://rousi.pro";
const SESSION_COOKIE_KEY = "__Host-peergo_session";
// 站点 limit 上限为 50，超过会被判 400 契约错误
const TRAFFIC_LIMIT = 50;

export default async function (ctx) {
  try {
    const account = loadAccount(ctx);
    if (!account.cookie) {
      return renderMessage(
        "Rousi",
        "未找到登录态。请先打开 Rousi Pro 触发抓取，或在 Env 中填写 ROUSIPRO_DATA（Cookie）。旧版 Bearer token 已随站点改版失效，需重新抓取。",
      );
    }

    const [sessionRes, trafficRes, economyRes, attendanceRes] = await Promise.all([
      fetchJSON(ctx, `${SITE}/api/v1/session`, account.cookie),
      fetchJSON(ctx, `${SITE}/api/v1/me/traffic?limit=${TRAFFIC_LIMIT}`, account.cookie).catch(() => null),
      fetchJSON(ctx, `${SITE}/api/v1/me/economy?limit=1`, account.cookie).catch(() => null),
      fetchJSON(ctx, `${SITE}/api/v1/me/attendance`, account.cookie).catch(() => null),
    ]);

    if (sessionRes.status === 401 || sessionRes.status === 403) {
      return renderMessage("Rousi", "登录已过期，请重新抓取登录态");
    }

    // 未登录时 /api/v1/session 返回 204 空体（不是 401），
    // 而 /api/v1/me/* 会返回 401 session_required —— 两处都要兜住
    const session = sessionRes.data || {};
    const meStatuses = [trafficRes, economyRes, attendanceRes]
      .map((res) => res?.status)
      .filter((status) => typeof status === "number");
    const sessionExpired =
      !session?.user ||
      sessionRes.status === 204 ||
      (meStatuses.length > 0 && meStatuses.every((status) => status === 401 || status === 403));

    if (sessionExpired) {
      return renderMessage("Rousi", "登录已过期，请重新抓取登录态");
    }

    if (sessionRes.status && (sessionRes.status < 200 || sessionRes.status >= 300)) {
      return renderMessage("Rousi", `请求失败：${errorText(sessionRes.data) || `HTTP ${sessionRes.status}`}`);
    }

    const username = session.user.display_name || session.user.username || account.userName || "";
    const stats = normalizeStats(trafficRes?.data, economyRes?.data, attendanceRes?.data);

    return renderStats(stats, username);
  } catch (error) {
    return renderMessage("Rousi", `刷新失败：${error.message || error}`);
  }
}

async function fetchJSON(ctx, url, cookie) {
  const res = await ctx.http.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: cookie,
      Origin: SITE,
      Referer: `${SITE}/account/economy?tab=attendance`,
    },
    timeout: 15000,
  });
  return {
    status: res.statusCode || res.status || 0,
    data: await responseJSON(res),
  };
}

async function responseJSON(res) {
  // 401/错误响应体可能为空，解析失败必须吞掉，否则会把「登录过期」盖成 JSON 解析错误
  try {
    if (typeof res.json === "function") return await res.json();
    return parseJSON(res.body || res.data || res);
  } catch (_) {
    return {};
  }
}

// 站点错误体为 RFC 7807：{code,title,detail,status}
function errorText(payload) {
  if (!payload || typeof payload !== "object") return "";
  return [payload.title, payload.detail].filter(Boolean).join("：");
}

function loadAccount(ctx) {
  const stored = ctx.storage.getJSON("rousipro_data") || ctx.storage.getJSON("ROUSIPRO_DATA");
  const fromStorage = normalizeAccounts(stored)[0];
  if (fromStorage) return fromStorage;

  const envRaw =
    ctx.env.ROUSIPRO_DATA ||
    ctx.env.ROUSI_COOKIE ||
    ctx.env.ROUSIPRO_COOKIE ||
    ctx.env.ROUSI_TOKEN ||
    ctx.env.TOKEN ||
    "";
  return normalizeAccounts(envRaw)[0] || { cookie: "" };
}

function normalizeAccounts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeAccount).filter(Boolean);
  if (typeof raw === "object") return [normalizeAccount(raw)].filter(Boolean);
  const parsed = parseJSON(raw);
  if (parsed && parsed !== raw) return normalizeAccounts(parsed);
  return String(raw)
    .split(/\n|@|&/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((cookie) => normalizeAccount({ cookie }))
    .filter(Boolean);
}

function normalizeAccount(account) {
  if (!account) return null;
  if (typeof account === "string") account = { cookie: account };
  const cookie = normalizeCookie(account.cookie || account.ck || account.Cookie || "");
  if (!cookie) return null;
  return { cookie, userName: account.userName || account.username || "" };
}

// 接受完整 Cookie 串 / 只有 session 值 / 带 "Cookie:" 前缀三种输入；
// 旧版 Bearer token 会被识别为无效（返回空串），由调用方给出重新抓取提示。
function normalizeCookie(input) {
  let value = String(input || "").trim();
  if (!value) return "";
  value = value.replace(/^cookie\s*:\s*/i, "").trim();
  if (value.includes(SESSION_COOKIE_KEY + "=")) {
    const match = value.match(new RegExp(`${SESSION_COOKIE_KEY}=([^;\\s]+)`));
    return match ? `${SESSION_COOKIE_KEY}=${match[1]}` : "";
  }
  const session = value.split(";")[0].trim();
  if (/^[A-Za-z0-9_\-]+$/.test(session)) return `${SESSION_COOKIE_KEY}=${session}`;
  return "";
}

function parseJSON(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(body);
  } catch (_) {
    return body;
  }
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeStats(traffic, economy, attendance) {
  const totals = traffic?.totals || {};
  // 站点计费口径：credited 上传 / charged 下载
  const uploaded = toNumber(totals.credited_uploaded_bytes);
  const downloaded = toNumber(totals.charged_downloaded_bytes);
  const ratio = downloaded > 0
    ? uploaded / downloaded
    : uploaded > 0
      ? Infinity
      : 0;

  // traffic.torrent_activity 是「最近有结算记录」的种子，已完成的视为在保种
  const activity = Array.isArray(traffic?.torrent_activity) ? traffic.torrent_activity : [];
  const seedingRows = activity.filter((row) => row?.completed === true);

  const progress = economy?.progress || {};

  return {
    ratio,
    uploaded,
    downloaded,
    level: progress.level ?? "-",
    experience: toNumber(progress.experience),
    magic: toNumber(economy?.magic_balance),
    seedingCount: seedingRows.length,
    seedingSize: seedingRows.reduce((sum, row) => sum + toNumber(row.total_size_bytes), 0),
    claimedToday: attendance?.claimed_today === true,
    streak: toNumber(attendance?.current_streak),
    totalDays: toNumber(attendance?.total_days),
  };
}

function formatRatio(value) {
  if (value === Infinity) return "∞";
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(3);
}

function formatBytes(bytes) {
  const n = toNumber(bytes);
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = n;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 1 : 2).replace(/\.0$/, "")} ${units[index]}`;
}

function compactNumber(value) {
  const n = toNumber(value);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}W`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.00$/, "");
}

function renderStats(stats, username) {
  const colors = themeColors();
  const streakText = stats.claimedToday ? `${stats.streak}天✓` : `${stats.streak}天`;

  const rows = [
    [
      item("分享率", formatRatio(stats.ratio), "#3478F6"),
      item("等级", `Lv.${stats.level}`, "#F6B500"),
      item("经验", compactNumber(stats.experience), "#0EA5E9"),
    ],
    [
      item("上传", formatBytes(stats.uploaded), "#22C55E"),
      item("下载", formatBytes(stats.downloaded), "#EF4444"),
      item("魔力值", compactNumber(stats.magic), "#A855F7"),
    ],
    [
      item("保种数", compactNumber(stats.seedingCount), colors.mutedIcon),
      item("保种体积", formatBytes(stats.seedingSize), colors.mutedIcon),
      item("连签", streakText, "#F97316"),
    ],
  ];

  return {
    type: "widget",
    backgroundGradient: {
      type: "linear",
      colors: [
        { light: "#F8FBFF", dark: "#0F172A" },
        { light: "#EEF7F1", dark: "#102A2A" },
        { light: "#FFF7ED", dark: "#2A1C12" },
      ],
      stops: [0, 0.55, 1],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    padding: [10, 14, 10, 14],
    url: SITE,
    children: rows.map((row) => ({
      type: "stack",
      direction: "row",
      alignItems: "center",
      gap: 12,
      children: row.map(renderTile),
    })),
    gap: 8,
  };
}

function item(label, value, color) {
  return { label, value, color };
}

function renderTile(entry) {
  const colors = themeColors();
  return {
    type: "stack",
    direction: "column",
    alignItems: "center",
    width: 0,
    flex: 1,
    gap: 2,
    children: [
      {
        type: "text",
        text: entry.label,
        font: { size: "caption2" },
        textColor: colors.label,
        textAlign: "center",
        maxLines: 1,
        minScale: 0.75,
      },
      {
        type: "text",
        text: String(entry.value),
        font: { size: "caption1", weight: "semibold" },
        textColor: entry.color,
        textAlign: "center",
        maxLines: 1,
        minScale: 0.75,
      },
    ],
  };
}

function renderMessage(title, message) {
  const colors = themeColors();
  return {
    type: "widget",
    backgroundGradient: {
      type: "linear",
      colors: [
        { light: "#F8FBFF", dark: "#0F172A" },
        { light: "#F1F5F9", dark: "#111827" },
      ],
      stops: [0, 1],
    },
    padding: 14,
    gap: 8,
    children: [
      {
        type: "text",
        text: title,
        font: { size: "headline", weight: "semibold" },
        textColor: colors.title,
      },
      {
        type: "text",
        text: message,
        font: { size: "caption2" },
        textColor: colors.label,
        maxLines: 3,
      },
    ],
  };
}

function themeColors() {
  return {
    title: { light: "#111827", dark: "#F8FAFC" },
    label: { light: "#475569", dark: "#CBD5E1" },
    mutedIcon: { light: "#64748B", dark: "#94A3B8" },
  };
}
