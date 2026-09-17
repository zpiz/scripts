/*
------------------------------------------
@Date: 2026.09.17 适配站点 API 迁移：/api/points/* -> /api/v1/* ；
                 认证由 Authorization: Bearer <JWT> 改为 Cookie(__Host-peergo_session) + x-csrf-token
@Date: 2026.07.06 修改请求逻辑，优化变量内容
@Date: 2026.05.15
@Description: PT-rousi 签到
@Author: zpiz
------------------------------------------
@Description:
脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，青龙
new Env("Rousi Pro")
cron 10 8 * * * rousipro.js

[rewrite_local]
^https:\/\/rousi\.pro\/api\/v1\/session url script-response-body https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Quantumultx/rousipro.js

[MITM]
hostname = rousi.pro

QingLong env:
- rousipro_data: Cookie 串，形如 __Host-peergo_session=xxxxxxxx
  （也可整体粘贴浏览器里复制出来的 Cookie；只填 session 值时会自动补键名）
- 多账号：JSON 数组 [{"cookie":"__Host-peergo_session=xxx","userName":"name"}]，
  或换行 / @ / & 分隔的多条 Cookie
- 可选：ROUSI_MODE=fixed|random（默认 random，random 期望值 150.5 > fixed 100）
- 可选：BARK_PUSH 或 BARK_URL 用于 Bark 通知；BARK_SERVER 默认 https://api.day.app

注意：老版本存的 Bearer token 已随站点改版失效，需要重新抓 Cookie。
------------------------------------------
*/

const $ = new Env("Rousi Pro");
const ckName = "rousipro_data";
const altCkNames = ["ROUSIPRO_DATA", "ROUSI_COOKIE", "rousi_cookie", "ROUSIPRO_COOKIE", "rousi_data"];
const SESSION_COOKIE_KEY = "__Host-peergo_session";
const isRequest = typeof $request !== "undefined";
let notifyMsg = [];
let successCount = 0;
let userCookie = loadAccounts();

// ------------------------------------------------------------
// 请求封装
// 站点已改为「Session Cookie + CSRF」双因子：
//   1) GET  /api/v1/session  取 csrf_token 与当前用户
//   2) 写操作 (POST) 必须携带 x-csrf-token，并带 Origin 通过同源校验
// 账号数据（rousipro_data）里只需要 Cookie。
// ------------------------------------------------------------
const BASE_URL = "https://rousi.pro";
const API = {
  session: "/api/v1/session",
  attendance: "/api/v1/me/attendance",
  economy: "/api/v1/me/economy?limit=30"
};

function buildHeaders(cookie, extra) {
  return {
    "Cookie": cookie,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Origin": BASE_URL,
    "Referer": `${BASE_URL}/account/economy?tab=attendance`,
    "User-Agent": defaultUA(),
    ...(extra || {})
  };
}

// 站点错误体为 RFC 7807 Problem Details：{code,title,detail,status}
function pickError(data, body, statusCode) {
  if (data && typeof data === "object") {
    const detail = data.error ?? data.message ?? data.detail ?? data.reason;
    const detailText = detail && typeof detail === "object"
      ? (detail.message || JSON.stringify(detail))
      : (detail ? String(detail) : "");
    const text = [data.title, detailText].filter(Boolean).join("\uff1a");
    if (text) return text;
  }
  return typeof body === "string" && body ? body.slice(0, 200) : `HTTP ${statusCode}`;
}

// POST 写操作要求携带幂等键，缺失会被判为契约错误（400 contract_validation_failed）
function uuidv4() {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.random() * 4 | 0) + 8];
    else out += hex[Math.random() * 16 | 0];
  }
  return out;
}

class RousiPro {
  constructor(user, index) {
    if (typeof user === "string") user = { cookie: user };
    this.index = index;
    this.cookie = normalizeCookie(user.cookie || user.ck || user.Cookie || "");
    this.userName = user.userName || user.username || `Account${index}`;
    this.csrfToken = "";
  }

  log(message) {
    $.log(`\u300c${this.userName}\u300d${message}`);
  }

  async request(options) {
    const url = options.url.startsWith("http") ? options.url : `${BASE_URL}${options.url}`;
    const method = (options.method || "GET").toUpperCase();
    const headers = buildHeaders(this.cookie, options.headers);
    if (method !== "GET" && method !== "HEAD") {
      // 写操作三件套：JSON Content-Type + CSRF + 幂等键，缺任意一项都会被判 400 契约错误
      headers["Content-Type"] = "application/json";
      if (this.csrfToken) headers["x-csrf-token"] = this.csrfToken;
      headers["idempotency-key"] = uuidv4();
    }
    const response = await $.request({
      url,
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000
    });
    const statusCode = response.statusCode || response.status || 0;
    const raw = response.body;
    const data = $.toObj(raw, raw);
    if (statusCode >= 400) {
      const error = new Error(pickError(data, raw, statusCode));
      error.statusCode = statusCode;
      error.code = data && typeof data === "object" ? data.code || "" : "";
      error.data = data;
      throw error;
    }
    return data;
  }

  // 拉取会话：验证 Cookie 有效性 + 获取 csrf_token + 用户名
  async session() {
    const res = await this.request({ url: API.session });
    this.csrfToken = res?.csrf_token || "";
    if (!this.csrfToken) throw new Error("未取得 csrf_token，Cookie 可能已失效");
    const name = res?.user?.display_name || res?.user?.username;
    if (name && (!this.userName || /^Account\d+$/.test(this.userName))) this.userName = name;
    return res || {};
  }

  async attendance() {
    const res = await this.request({ url: API.attendance });
    return res || {};
  }

  async claim() {
    // QuanX/Surge 等环境没有 process，必须做存在性判断
    const mode = (typeof process !== "undefined" && process.env?.ROUSI_MODE) || "random";
    return await this.request({
      url: API.attendance,
      method: "POST",
      body: { mode }
    });
  }

  async economy() {
    const res = await this.request({ url: API.economy });
    return res || {};
  }

  async run() {
    // 1) 会话校验（同时刷新 csrf_token）
    await this.session();

    // 2) 签到状态判断：claimed_today 为布尔，替代旧版 attended_dates 比对
    const forceClaim = $.isNode() && process.env.ROUSI_DEBUG_FORCE === "1";
    const before = forceClaim ? {} : await this.attendance();
    if (before.claimed_today) {
      const message = "今日已签到";
      this.log(`\u26d4\ufe0f ${message}`);
      notifyMsg.push(`\u300c${this.userName}\u300d${message}，连续${before.current_streak || 0}天，累计${before.total_days || 0}天`);
      return;
    }

    // 3) 签到
    let record;
    try {
      record = await this.claim();
    } catch (e) {
      const message = e?.message || String(e);
      if (e?.statusCode === 409 || e?.code === "attendance_already_claimed" || /已签到|已经签到|already/i.test(message)) {
        this.log(`\u26d4\ufe0f ${message}`);
        notifyMsg.push(`\u300c${this.userName}\u300d${message}`);
        return;
      }
      throw e;
    }

    const baseReward = toNumber(record?.base_reward);
    const streakReward = toNumber(record?.streak_reward);
    const expReward = toNumber(record?.experience_reward);
    const totalReward = toNumber(record?.total_reward);

    // 4) 余额 / 等级（economy 内一并返回）
    const economy = await this.economy().catch(() => ({}));
    const magic = toNumber(economy?.magic_balance);
    const experience = toNumber(economy?.progress?.experience);
    const level = economy?.progress?.level ?? "-";

    this.log(`\u5f53\u524d\u9b54\u529b\u503c: ${formatNumber(magic)}\uff0c\u7ecf\u9a8c: ${formatNumber(experience)}\uff0c\u7b49\u7ea7: ${level}`);
    this.log(`\u7b7e\u5230\u7edf\u8ba1: \u8fde\u7eed${record?.current_streak || 0}\u5929\uff0c\u7d2f\u8ba1${record?.total_days || 0}\u5929`);
    if (streakReward > 0) this.log(`\ud83c\udf89 \u8fde\u7eed\u7b7e\u5230\u91cc\u7a0b\u7891\u5956\u52b1 +${formatNumber(streakReward)} \u9b54\u529b\u503c`);

    const gained = formatNumber(totalReward || (baseReward + streakReward));
    notifyMsg.push(
      `\u300c${this.userName}\u300d\u7b7e\u5230\u6210\u529f\uff0c\u672c\u6b21\u83b7\u5f97:${gained}\u9b54\u529b\u503c` +
      (expReward ? `(+${formatNumber(expReward)}\u7ecf\u9a8c)` : "") +
      `\uff0c\u5f53\u524d\u9b54\u529b\u503c:${formatNumber(magic)}\uff0c\u8fde\u7eed\u7b7e\u5230:${record?.current_streak || 0}\u5929\uff0c\u7d2f\u8ba1\u7b7e\u5230:${record?.total_days || 0}\u5929`
    );
    successCount++;
  }
}

// ------------------------------------------------------------
// 抓 Cookie：命中 /api/v1/session 时从请求头取 __Host-peergo_session
// ------------------------------------------------------------
async function getCookie() {
  if (!isRequest || $request.method === "OPTIONS") return;
  const headers = lowerHeaders($request.headers || {});
  const cookie = extractSessionCookie(headers.cookie || headers.Cookie || "");
  if (!cookie) {
    $.msg($.name, "\u83b7\u53d6 Cookie \u5931\u8d25", `\u5f53\u524d\u8bf7\u6c42\u672a\u643a\u5e26 ${SESSION_COOKIE_KEY}`);
    return;
  }
  const body = $.toObj($response?.body, {}) || {};
  const userName = body?.user?.display_name || body?.user?.username || `Account${userCookie.length + 1}`;
  const newData = { cookie, userName };
  const index = userCookie.findIndex(item => item.cookie === cookie);
  if (index >= 0) userCookie[index] = newData;
  else userCookie.push(newData);
  $.setjson(userCookie, ckName);
  $.msg($.name, "\ud83c\udf89 \u83b7\u53d6\u8d26\u53f7\u6210\u529f", `\u8d26\u53f7: ${userName}`);
}

async function main() {
  if (!userCookie.length) {
    notifyMsg.push("\u672a\u627e\u5230\u8d26\u53f7\uff0c\u9752\u9f99\u8bf7\u914d\u7f6e\u73af\u5883\u53d8\u91cf rousipro_data\uff08Cookie\uff09");
    return;
  }
  $.log(`\u5171\u627e\u5230 ${userCookie.length} \u4e2a\u8d26\u53f7`);
  for (let i = 0; i < userCookie.length; i++) {
    const user = new RousiPro(userCookie[i], i + 1);
    try {
      await user.run();
    } catch (e) {
      const message = e?.message || String(e);
      if (e?.statusCode === 401 || /登录|login|unauthor/i.test(message)) {
        user.log(`\u26d4\ufe0f Cookie \u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u6293\u5305\u66f4\u65b0: ${message}`);
        notifyMsg.push(`\u300c${user.userName}\u300dCookie \u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u6293\u5305\u66f4\u65b0`);
      } else if (/已签到|already|claimed/i.test(message)) {
        user.log(`\u26d4\ufe0f ${message}`);
        notifyMsg.push(`\u300c${user.userName}\u300d${message}`);
      } else {
        user.log(`\u26d4\ufe0f \u6267\u884c\u5931\u8d25: ${message}`);
        notifyMsg.push(`\u300c${user.userName}\u300d\u6267\u884c\u5931\u8d25: ${message}`);
      }
    }
    if (i < userCookie.length - 1) await $.wait(randomInt(1000, 3000));
  }
}

function loadAccounts() {
  let raw = "";
  if ($.isNode()) {
    raw = [ckName, ...altCkNames].map(name => process.env[name]).find(Boolean) || "";
  } else {
    raw = $.getdata(ckName) || "";
  }
  if (!raw) return [];
  const parsed = $.toObj(raw, null);
  if (Array.isArray(parsed)) return parsed.map(normalizeAccount).filter(Boolean);
  if (parsed && typeof parsed === "object") return [normalizeAccount(parsed)].filter(Boolean);
  return raw.split(/\n|@|&/).map(item => item.trim()).filter(Boolean).map(item => normalizeAccount({ cookie: item })).filter(Boolean);
}

function normalizeAccount(account) {
  if (!account) return null;
  if (typeof account === "string") account = { cookie: account };
  const cookie = normalizeCookie(account.cookie || account.ck || account.Cookie || "");
  if (!cookie) return null;
  const userName = account.userName || account.username || undefined;
  return { cookie, userName };
}

// 支持三种输入：完整 Cookie 串 / 只有 session 值 / 带 "Cookie:" 前缀
function normalizeCookie(input) {
  let value = String(input || "").trim();
  if (!value) return "";
  value = value.replace(/^cookie\s*:\s*/i, "").trim();
  if (value.includes(SESSION_COOKIE_KEY + "=")) {
    const match = value.match(new RegExp(`${SESSION_COOKIE_KEY}=([^;\\s]+)`));
    return match ? `${SESSION_COOKIE_KEY}=${match[1]}` : "";
  }
  // 只有 session 值（无键名）时自动补全
  const session = value.split(";")[0].trim();
  if (/^[A-Za-z0-9_\-]+$/.test(session)) return `${SESSION_COOKIE_KEY}=${session}`;
  return "";
}

function extractSessionCookie(cookieHeader) {
  const match = String(cookieHeader).match(new RegExp(`${SESSION_COOKIE_KEY}=([^;\\s]+)`));
  return match ? `${SESSION_COOKIE_KEY}=${match[1]}` : "";
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatNumber(value) {
  if (value === undefined || value === null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(2).replace(/\.00$/, "");
}

function lowerHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function defaultUA() {
  return "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
}

function randomInt(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

!(async () => {
  if (isRequest) await getCookie();
  else await main();
})()
  .catch(e => {
    const message = e?.message || String(e);
    $.log(`\u811a\u672c\u5f02\u5e38: ${message}`);
    notifyMsg.push(`\u811a\u672c\u5f02\u5e38: ${message}`);
  })
  .finally(async () => {
    if (!isRequest && notifyMsg.length) {
      await sendNotify($.name, `\u5171${userCookie.length || 0}\u4e2a\u8d26\u53f7\uff0c\u6210\u529f${successCount}\u4e2a`, notifyMsg.join("\n"));
    }
    $.done();
  });

async function sendNotify(title, subtitle, message) {
  const content = subtitle ? `${subtitle}\n${message || ""}` : (message || "");
  if ($.isNode()) {
    loadQingLongNotifyConfig();
    try {
      const qlNotify = require("./sendNotify");
      if (qlNotify?.sendNotify) return await qlNotify.sendNotify(title, content);
    } catch (e) {
      $.log(`QingLong sendNotify unavailable: ${e?.message || e}`);
    }
    const barkSent = await sendBark(title, content).catch(e => {
      $.log(`Bark push failed: ${e?.message || e}`);
      return false;
    });
    if (barkSent) return;
  }
  $.msg(title, subtitle, message);
}

function loadQingLongNotifyConfig() {
  if (!$.isNode()) return;
  try {
    const fs = require("fs");
    const paths = [
      process.env.QL_DIR ? `${process.env.QL_DIR}/config/config.sh` : "",
      "/ql/data/config/config.sh",
      "/ql/config/config.sh",
      "/ql/config/config.sh.sample"
    ].filter(Boolean);
    for (const file of paths) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;
        const key = match[1];
        if (!/^(BARK|PUSH_KEY|PUSH_PLUS|TG_|DD_|QYWX|FSKEY|GOBOT|GOTIFY|IGOT|PUSHDEER|AIBOTK|SMTP|PUSHME)/.test(key)) continue;
        let value = match[2].trim();
        value = value.replace(/^['"]|['"]$/g, "");
        value = value.replace(/\\n/g, "\n");
        if (value && !process.env[key]) process.env[key] = value;
      }
      break;
    }
  } catch (e) {
    $.log(`Load QingLong notify config failed: ${e?.message || e}`);
  }
}

async function sendBark(title, body) {
  if (!$.isNode()) return false;
  const barkPush = process.env.BARK_PUSH || process.env.BARK_URL || "";
  if (!barkPush) return false;
  let url;
  if (/^https?:\/\//i.test(barkPush)) {
    url = barkPush.replace(/\/$/, "");
  } else {
    const server = (process.env.BARK_SERVER || "https://api.day.app").replace(/\/$/, "");
    url = `${server}/${barkPush}`;
  }
  const params = new URLSearchParams();
  params.set("title", title);
  params.set("body", body);
  if (process.env.BARK_GROUP) params.set("group", process.env.BARK_GROUP);
  if (process.env.BARK_SOUND) params.set("sound", process.env.BARK_SOUND);
  const resp = await httpRequest({ url: `${url}?${params.toString()}`, method: "GET", timeout: 15000 });
  return (resp.statusCode || resp.status || 0) < 400;
}

async function httpRequest(options) {
  if (typeof fetch === "function") {
    const res = await fetch(options.url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout ? AbortSignal.timeout(options.timeout || 15000) : undefined
    });
    return { statusCode: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
  }
  const mod = options.url.startsWith("https") ? require("https") : require("http");
  return new Promise((resolve, reject) => {
    const req = mod.request(options.url, { method: options.method || "GET", headers: options.headers || {}, timeout: options.timeout || 15000 }, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (options.body) req.write(options.body);
    req.end();
  });
}

function Env(name) {
  return new class {
    constructor(name) {
      this.name = name;
      this.startTime = Date.now();
      this.data = null;
      this.dataFile = "box.dat";
      this.log(`\ud83d\udd14${this.name}, \u5f00\u59cb!`);
    }
    isNode() { return typeof module !== "undefined" && !!module.exports; }
    isQuanX() { return typeof $task !== "undefined"; }
    isSurge() { return typeof $httpClient !== "undefined" && typeof $loon === "undefined"; }
    isLoon() { return typeof $loon !== "undefined"; }
    isShadowrocket() { return typeof $rocket !== "undefined"; }
    log(...args) { console.log(args.join("\n")); }
    toObj(str, fallback = null) { try { return JSON.parse(str); } catch (_) { return fallback; } }
    toStr(obj, fallback = null) { try { return JSON.stringify(obj); } catch (_) { return fallback; } }
    getjson(key, fallback) { const value = this.getdata(key); return value ? this.toObj(value, fallback) : fallback; }
    setjson(value, key) { return this.setdata(this.toStr(value), key); }
    getdata(key) {
      if (this.isNode()) {
        const envValue = [key, key.toUpperCase(), ...altCkNames].map(name => process.env[name]).find(Boolean);
        if (envValue) return envValue;
        this.fs = this.fs || require("fs");
        this.path = this.path || require("path");
        const file = this.path.resolve(this.dataFile);
        if (!this.fs.existsSync(file)) return "";
        this.data = this.data || this.toObj(this.fs.readFileSync(file, "utf8"), {});
        return key.split(".").reduce((obj, part) => obj && obj[part], this.data) || "";
      }
      if (this.isQuanX()) return $prefs.valueForKey(key) || "";
      if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || "";
      return "";
    }
    setdata(value, key) {
      if (this.isNode()) {
        this.fs = this.fs || require("fs");
        this.path = this.path || require("path");
        const file = this.path.resolve(this.dataFile);
        this.data = this.fs.existsSync(file) ? this.toObj(this.fs.readFileSync(file, "utf8"), {}) : {};
        const keys = key.split(".");
        let obj = this.data;
        while (keys.length > 1) {
          const k = keys.shift();
          obj[k] = obj[k] || {};
          obj = obj[k];
        }
        obj[keys[0]] = value;
        this.fs.writeFileSync(file, this.toStr(this.data, "{}"));
        return true;
      }
      if (this.isQuanX()) return $prefs.setValueForKey(value, key);
      if (typeof $persistentStore !== "undefined") return $persistentStore.write(value, key);
      return false;
    }
    request(options) {
      return new Promise((resolve, reject) => {
        if (this.isQuanX()) {
          $task.fetch(options).then(resolve, reject);
        } else if (this.isSurge() || this.isLoon() || this.isShadowrocket()) {
          const method = (options.method || "GET").toLowerCase();
          $httpClient[method](options, (err, resp, body) => err ? reject(err) : resolve({ ...resp, body }));
        } else if (this.isNode()) {
          httpRequest(options).then(resolve, reject);
        } else reject(new Error("Unsupported runtime"));
      });
    }
    wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    msg(title = this.name, subtitle = "", message = "") {
      if (this.isQuanX()) $notify(title, subtitle, message);
      else if (this.isSurge() || this.isLoon() || this.isShadowrocket()) $notification.post(title, subtitle, message);
      else this.log(`${title}\n${subtitle}\n${message}`);
    }
    done(value = {}) {
      this.log(`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${(Date.now() - this.startTime) / 1000} \u79d2`);
      if (typeof $done !== "undefined") $done(value);
    }
  }(name);
}
