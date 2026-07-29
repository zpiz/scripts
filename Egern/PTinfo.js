const SITE = "https://rousi.pro";

export default async function (ctx) {
  try {
    const account = loadAccount(ctx);
    const token = account.token;
    if (!token) {
      return renderMessage("Rousi", "请先打开 Rousi 触发抓取，或在 Env 中填写 ROUSI_TOKEN");
    }

    const userRes = await fetchJSON(ctx, `${SITE}/api/me`, token);

    if (userRes.status === 401 || userRes.status === 403) {
      return renderMessage("Rousi", "登录已过期，请重新抓取登录态");
    }

    if (userRes.status && (userRes.status < 200 || userRes.status >= 300)) {
      return renderMessage("Rousi", `请求失败：HTTP ${userRes.status}`);
    }

    const meData = unwrap(userRes.data);
    const username = getUsername(meData) || decodeJwtName(token) || account.userName;
    const profileUrl = username ? `${SITE}/api/user/${encodeURIComponent(username)}` : "";
    const peersUrl = username ? `${profileUrl}/peers` : "";

    const [profileRes, peersRes, balanceRes, accountStatsRes] = await Promise.all([
      profileUrl ? fetchJSON(ctx, profileUrl, token).catch(() => null) : null,
      peersUrl ? fetchJSON(ctx, peersUrl, token).catch(() => null) : null,
      fetchJSON(ctx, `${SITE}/api/points/balance`, token).catch(() => null),
      fetchJSON(ctx, `${SITE}/api/account/stats`, token).catch(() => null),
    ]);

    const profileData = profileRes ? unwrap(profileRes.data) : {};
    const peersData = peersRes ? unwrap(peersRes.data) : {};
    const balanceData = balanceRes ? unwrap(balanceRes.data) : {};
    const accountStatsData = accountStatsRes ? unwrap(accountStatsRes.data) : {};
    const stats = normalizeStats(
      mergeObjects(meData, accountStatsData, profileData, balanceData),
      summarizePeers(peersData),
    );

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

function decodeJwtName(token) {
  try {
    const payload = token.replace(/^Bearer\s+/i, "").split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized));
    return json.username || json.name || "";
  } catch (_) {
    return "";
  }
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

function mergeObjects(...items) {
  return items.reduce((acc, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      Object.assign(acc, item);
    }
    return acc;
  }, {});
}

function getUsername(data) {
  return pick(data, [
    "username",
    "userName",
    "name",
    "stats.username",
    "user.username",
    "profile.username",
  ], "");
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

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = toNumber(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(data, keys) {
  for (const key of keys) {
    const value = numberOrNull(getPath(data, key));
    if (value !== null) return value;
  }
  return null;
}

function normalizeStats(data, peerSummary) {
  const uploaded = toNumber(pick(data, [
    "uploaded",
    "upload",
    "stats.uploaded",
    "traffic.uploaded",
    "user.uploaded",
  ], 0));
  const downloaded = toNumber(pick(data, [
    "downloaded",
    "download",
    "stats.downloaded",
    "traffic.downloaded",
    "user.downloaded",
  ], 0));
  const ratioValue = pick(data, [
    "ratio",
    "share_ratio",
    "stats.ratio",
    "traffic.ratio",
  ], null);
  const ratio = ratioValue !== null ? Number(ratioValue) : downloaded > 0 ? uploaded / downloaded : uploaded > 0 ? Infinity : 0;
  const seedingVolumeGB = firstNumber(data, [
    "seeding_detail.base_reward.volume",
    "seeding_detail.total_volume",
    "seeding_detail.volume",
    "seed_reward.volume",
  ]);
  const seedingSize = seedingVolumeGB !== null
    ? seedingVolumeGB * 1024 * 1024 * 1024
    : toNumber(pick(data, [
        "seeding_size",
        "seed_size",
        "seed_volume",
        "seeding_volume",
        "active_seeding_size",
        "stats.seeding_size",
        "stats.seed_size",
        "tasks.seeding_size",
      ], peerSummary.seedingSize || 0));

  return {
    ratio,
    uploaded,
    downloaded,
    seedingSize,
    seedingCount: toNumber(pick(data, [
      "seeding_count",
      "seed_count",
      "seeders",
      "seeding",
      "active_seeding_count",
      "tasks.seeding_count",
      "stats.seeding_count",
    ], peerSummary.seedingCount || 0)),
    leechingCount: toNumber(pick(data, [
      "leeching_count",
      "download_count",
      "leech_count",
      "leechers",
      "leeching",
      "active_leeching_count",
      "tasks.leeching_count",
      "stats.leeching_count",
    ], peerSummary.leechingCount || 0)),
    level: pick(data, ["level", "user_level", "stats.level", "user.level", "level.current"], 1),
    karma: toNumber(pick(data, ["karma", "bonus", "bonus_points", "magic", "magic_points", "stats.karma", "user.karma"], 0)),
    credits: toNumber(pick(data, ["credits", "points", "pt", "pt_coin", "pt_coins", "stats.credits", "user.credits"], 0)),
  };
}

function summarizePeers(data) {
  const peers = Array.isArray(data) ? data : Array.isArray(data.peers) ? data.peers : [];
  const torrents = new Map();

  peers.forEach((peer, index) => {
    const key = peer.info_hash || peer.torrent_uuid || peer.uuid || peer.torrent_id || peer.id || `peer-${index}`;
    const current = torrents.get(key) || { seeding: false, leeching: false, size: 0 };
    const seeding = peer.seeding === true || peer.status === "seeding" || peer.type === "seeding";
    const leeching = peer.seeding === false || peer.status === "leeching" || peer.type === "leeching";
    current.seeding = current.seeding || seeding;
    current.leeching = current.leeching || leeching;
    current.size = Math.max(current.size, toNumber(pick(peer, [
      "size",
      "torrent_size",
      "torrent.size",
      "metadata.size",
    ], 0)));
    torrents.set(key, current);
  });

  const rows = Array.from(torrents.values());
  return {
    seedingCount: rows.filter((row) => row.seeding).length,
    leechingCount: rows.filter((row) => !row.seeding && row.leeching).length,
    seedingSize: rows.filter((row) => row.seeding).reduce((sum, row) => sum + row.size, 0),
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
  const colors = themeColors();
  const columns = [
    [
      item("↗", "分享率", formatRatio(stats.ratio), "#3478F6"),
      item("◦", "做种数", compactNumber(stats.seedingCount), colors.mutedIcon),
      item("◦", "下载数", compactNumber(stats.leechingCount), colors.mutedIcon),
    ],
    [
      item("☆", "等级", `Lv.${stats.level}`, "#F6B500"),
      item("↑", "上传", formatBytes(stats.uploaded), "#22C55E"),
      item("↓", "下载", formatBytes(stats.downloaded), "#EF4444"),
    ],
    [
      item("◼", "做种体积", formatBytes(stats.seedingSize), colors.mutedIcon, true),
      item("♨", "魔力值", compactNumber(stats.karma), "#A855F7"),
      item("♧", "PT币", compactNumber(stats.credits), "#F97316"),
    ],
  ];
  const flexes = [1, 1.08, 1.28];

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
    padding: [10, 12, 10, 12],
    url: SITE,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 9,
        children: columns.map((column, index) => ({
          type: "stack",
          direction: "column",
          alignItems: "start",
          flex: flexes[index],
          gap: 8,
          children: column.map(renderItem),
        })),
      },
    ],
    gap: 0,
  };
}

function item(icon, label, value, color, stacked = false) {
  return { icon, label, value, color, stacked };
}

function renderItem(entry) {
  const colors = themeColors();
  if (entry.stacked) {
    return {
      type: "stack",
      direction: "column",
      alignItems: "start",
      width: 0,
      flex: 1,
      gap: 1,
      children: [
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
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
              textColor: colors.label,
              maxLines: 1,
              minScale: 0.8,
            },
          ],
        },
        {
          type: "text",
          text: String(entry.value),
          font: { size: "caption1", weight: "medium" },
          textColor: entry.color,
          maxLines: 1,
          minScale: 0.75,
        },
      ],
    };
  }

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    width: 0,
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
        textColor: colors.label,
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
