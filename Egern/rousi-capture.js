const STORAGE_KEY = "rousipro_data";

export default async function (ctx) {
  const authorization = ctx.request?.headers?.get("authorization") || "";
  const token = normalizeToken(authorization);
  if (!token) return;

  let userName = decodeJwtName(token) || "Rousi";
  try {
    const body = await ctx.response.json();
    const data = body?.data?.stats || body?.data || body || {};
    userName = data.username || data.nickname || userName;
  } catch (_) {
    // Response body is only used to make the notification friendlier.
  }

  const accounts = normalizeAccounts(ctx.storage.getJSON(STORAGE_KEY));
  const next = { token, userName };
  const index = accounts.findIndex((item) => item.token === token || item.userName === userName);
  if (index >= 0) accounts[index] = next;
  else accounts.push(next);

  ctx.storage.setJSON(STORAGE_KEY, accounts);
  ctx.notify({
    title: "Rousi Pro",
    body: `获取账号成功：${userName}`,
  });
}

function normalizeAccounts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeAccount).filter(Boolean);
  if (typeof raw === "object") return [normalizeAccount(raw)].filter(Boolean);
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
  return { token, userName: account.userName || account.username || decodeJwtName(token) || "" };
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
    return json.username || json.name || null;
  } catch (_) {
    return null;
  }
}
