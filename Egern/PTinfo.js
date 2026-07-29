const SITE = "https://rousi.pro";

export default async function (ctx) {
  try {
    const account = loadAccount(ctx);
    const token = account.token;
    if (!token) {
      return renderMessage("Rousi", "请先打开 Rousi 触发抓取，或在 Env 中填写 ROUSI_TOKEN");
    }

    const [userRes, balanceRes] = await Promise.all([
      fetchJSON(ctx, `${SITE}/api/me`, token),
      fetchJSON(ctx, `${SITE}/api/points/balance`, token).catch(() => null),
    ]);

    if (userRes.status === 401 || userRes.status === 403) {
      return renderMessage("Rousi", "登录已过期，请重新抓取登录态");
    }

    if (userRes.status && (userRes.status < 200 || userRes.status >= 300)) {
      return renderMessage("Rousi", `请求失败：HTTP ${userRes.status}`);
    }

    const userData = unwrap(userRes.data);
    const balanceData = balanceRes ? unwrap(balanceRes.data) : {};
    const stats = normalizeStats({ ...userData, ...balanceData });

    return renderStats(stats);
  } catch (error) {
    return renderMessage("Rousi", `刷新失败：${error.message || error}`);
  }
}

async function fetchJSON(ctx, url, token) {
  const res = await ctx.http.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: normalizeToken(token),
      Origin: SITE,
      Referer: `${SITE}/points`,
    },
    timeout: 15000,
  });
  return {
    status: res.statusCode || res.status || 0,
    data: await responseJSON(res),
  };
}

async function responseJSON(res) {
  if (typeof res.json === "function") return await res.json();
  return parseJSON(res.body || res.data || res);
}

function loadAccount(ctx) {
  const stored = ctx.storage.getJSON("rousipro_data") || ctx.storage.getJSON("ROUSIPRO_DATA");
  const fromStorage = normalizeAccounts(stored)[0];
  if (fromStorage) return fromStorage;

  const envRaw = ctx.env.ROUSIPRO_DATA || ctx.env.ROUSI_TOKEN || ctx.env.TOKEN || "";
  return normalizeAccounts(envRaw)[0] || { token: "" };
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
    .map((token) => normalizeAccount({ token }))
    .filter(Boolean);
}

function normalizeAccount(account) {
  if (!account) return null;
  if (typeof account === "string") return { token: normalizeToken(account) };
  const token = normalizeToken(account.token || account.Authorization || account.authorization || "");
  if (!token) return null;
  return { token, userName: account.userName || account.username || "" };
}

function normalizeToken(token) {
  token = String(token || "").trim();
  if (!token) return "";
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
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

function unwrap(payload) {
  if (payload && typeof payload === "object" && payload.data) return payload.data;
  return payload || {};
}

function pick(obj, keys, fallback = undefined) {
  for (const key of keys) {
    const value = getPath(obj, key);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, key)) return acc[key];
    return undefined;
  }, obj);
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeStats(data) {
  const uploaded = toNumber(pick(data, ["uploaded", "upload", "traffic.uploaded", "user.uploaded"], 0));
  const downloaded = toNumber(pick(data, ["downloaded", "download", "traffic.downloaded", "user.downloaded"], 0));
  const ratioValue = pick(data, ["ratio", "share_ratio", "traffic.ratio"], null);
  const ratio = ratioValue !== null ? Number(ratioValue) : downloaded > 0 ? uploaded / downloaded : uploaded > 0 ? Infinity : 0;

  return {
    ratio,
    uploaded,
    downloaded,
    seedingSize: toNumber(pick(data, [
      "seeding_size",
      "seed_size",
      "seed_volume",
      "seeding_volume",
      "active_seeding_size",
      "tasks.seeding_size",
      "stats.seeding_size",
    ], 0)),
    seedingCount: toNumber(pick(data, [
      "seeding_count",
      "seed_count",
      "seeders",
      "seeding",
      "active_seeding_count",
      "tasks.seeding_count",
      "stats.seeding_count",
    ], 0)),
    leechingCount: toNumber(pick(data, [
      "leeching_count",
      "download_count",
      "leech_count",
      "leechers",
      "leeching",
      "active_leeching_count",
      "tasks.leeching_count",
      "stats.leeching_count",
    ], 0)),
    level: pick(data, ["level", "user_level", "user.level", "level.current"], 1),
    karma: toNumber(pick(data, ["karma", "bonus", "bonus_points", "magic", "magic_points", "user.karma"], 0)),
    credits: toNumber(pick(data, ["credits", "points", "pt", "pt_coin", "pt_coins", "user.credits"], 0)),
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

function renderStats(stats) {
  const rows = [
    [
      item("↗", "分享率", formatRatio(stats.ratio), "#3478F6"),
      item("◼", "做种体积", formatBytes(stats.seedingSize), "#6B7280"),
      item("☆", "等级", `Lv.${stats.level}`, "#F6B500"),
    ],
    [
      item("↑", "上传", formatBytes(stats.uploaded), "#22C55E"),
      item("◦", "做种数", compactNumber(stats.seedingCount), "#6B7280"),
      item("♨", "魔力值", compactNumber(stats.karma), "#A855F7"),
    ],
    [
      item("↓", "下载", formatBytes(stats.downloaded), "#EF4444"),
      item("◦", "下载数", compactNumber(stats.leechingCount), "#6B7280"),
      item("♧", "PT币", compactNumber(stats.credits), "#F97316"),
    ],
  ];

  return {
    type: "widget",
    backgroundColor: "#F9FAFB",
    padding: [8, 10, 8, 10],
    children: rows.map((row) => ({
      type: "stack",
      direction: "row",
      alignItems: "center",
      gap: 10,
      children: row.map(renderItem),
    })),
    gap: 5,
  };
}

function item(icon, label, value, color) {
  return { icon, label, value, color };
}

function renderItem(entry) {
  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    flex: 1,
    gap: 4,
    children: [
      {
        type: "text",
        text: entry.icon,
        font: { size: "caption2", weight: "semibold" },
        textColor: entry.color,
      },
      {
        type: "text",
        text: entry.label,
        font: { size: "caption2" },
        textColor: "#475569",
      },
      {
        type: "spacer",
      },
      {
        type: "text",
        text: String(entry.value),
        font: { size: "caption2", weight: "medium" },
        textColor: entry.color,
        maxLines: 1,
        minScale: 0.75,
      },
    ],
  };
}

function renderMessage(title, message) {
  return {
    type: "widget",
    backgroundColor: "#F9FAFB",
    padding: 14,
    gap: 8,
    children: [
      {
        type: "text",
        text: title,
        font: { size: "headline", weight: "semibold" },
        textColor: "#111827",
      },
      {
        type: "text",
        text: message,
        font: { size: "caption2" },
        textColor: "#64748B",
        maxLines: 3,
      },
    ],
  };
}
