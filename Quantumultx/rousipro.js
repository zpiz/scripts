/*
------------------------------------------
@Date: 2026.05.15
@Description: PT-rousi签到
@Author: zpiz
------------------------------------------
@Description:
脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，青龙
new Env("Rousi Pro")
cron 10 8 * * * rousipro.js

[rewrite_local]
^https:\/\/rousi\.pro\/api\/(me|points\/init|points\/balance|points\/attendance\/stats) url script-response-body https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Quantumultx/rousipro.js

[MITM]
hostname = rousi.pro

QingLong env:
- rousipro_data: Bearer token, or JSON array [{"token":"Bearer xxx","userName":"name"}], or multiple tokens separated by newline / @ / &
- Optional: BARK_PUSH or BARK_URL for Bark notification; BARK_SERVER defaults to https://api.day.app
------------------------------------------
*/

const $ = new Env("Rousi Pro");
const ckName = "rousipro_data";
const altCkNames = ["ROUSIPRO_DATA", "ROUSIPRO_TOKEN", "rousi_data", "rousi_token"];
const isRequest = typeof $request !== "undefined";
let notifyMsg = [];
let successCount = 0;
let userCookie = loadAccounts();

class RousiPro {
  constructor(user, index) {
    if (typeof user === "string") user = { token: user };
    this.index = index;
    this.token = normalizeToken(user.token || user.Authorization || user.authorization || "");
    this.userName = user.userName || user.username || decodeJwtName(this.token) || `Account${index}`;
    this.userAgent = user.userAgent || user.ua || defaultUA();
    this.baseUrl = "https://rousi.pro";
    this.headers = {
      "Authorization": this.token,
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "Origin": "https://rousi.pro",
      "Referer": "https://rousi.pro/points",
      "User-Agent": this.userAgent
    };
  }

  log(message) {
    $.log(`\u300c${this.userName}\u300d${message}`);
  }

  async request(options) {
    const url = options.url.startsWith("http") ? options.url : `${this.baseUrl}${options.url}`;
    const method = (options.method || "GET").toUpperCase();
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const response = await $.request({
      url,
      method,
      headers: { ...this.headers, ...(options.headers || {}) },
      body,
      timeout: 15000
    });
    const statusCode = response.statusCode || response.status || 0;
    const data = $.toObj(response.body, response.body);
    if (statusCode >= 400) {
      const message = data?.message || response.body || `HTTP ${statusCode}`;
      throw new Error(message);
    }
    return data;
  }

  async init() {
    const res = await this.request({ url: "/api/points/init" });
    if (res?.code !== 0) throw new Error(res?.message || "init failed");
    return res.data || {};
  }

  async signin() {
    try {
      const res = await this.request({
        url: "/api/points/attendance",
        method: "POST",
        body: { mode: "random" }
      });
      if (res?.code === 0) {
        const data = res.data || {};
        const bonus = extractSigninBonus(data, res);
        this.log(`\u2705 \u7b7e\u5230\u6210\u529f\uff0c\u672c\u6b21\u7b7e\u5230\u83b7\u5f97 ${formatNumber(bonus)} \u9b54\u529b\u503c`);
        return { ...data, bonus };
      }
      const message = res?.message || "signin failed";
      if (message.includes("\u4eca\u65e5\u5df2\u7b7e\u5230")) {
        this.log(`\u26d4\ufe0f ${message}`);
        return { already: true, message };
      }
      throw new Error(message);
    } catch (e) {
      const message = e?.message || String(e);
      if (message.includes("\u4eca\u65e5\u5df2\u7b7e\u5230")) {
        this.log(`\u26d4\ufe0f ${message}`);
        return { already: true, message };
      }
      throw e;
    }
  }

  async balance() {
    const res = await this.request({ url: "/api/points/balance" });
    if (res?.code !== 0) throw new Error(res?.message || "balance query failed");
    return res.data || {};
  }

  async stats() {
    const res = await this.request({ url: "/api/points/attendance/stats" });
    if (res?.code !== 0) throw new Error(res?.message || "attendance stats query failed");
    return res.data || {};
  }

  async run() {
    const before = await this.init().catch(() => null);
    const today = before?.attendance?.server_today;
    const attendedDates = before?.attendance?.attended_dates || [];
    if (today && attendedDates.includes(today)) {
      const message = "\u4eca\u65e5\u5df2\u7b7e\u5230";
      this.log(`\u26d4\ufe0f ${message}`);
      notifyMsg.push(`\u300c${this.userName}\u300d${message}`);
      return;
    }

    const signin = await this.signin();
    if (signin?.already) {
      notifyMsg.push(`\u300c${this.userName}\u300d${signin.message || "\u4eca\u65e5\u5df2\u7b7e\u5230"}`);
      return;
    }

    const [balance, stats] = await Promise.all([
      this.balance().catch(() => ({})),
      this.stats().catch(() => ({}))
    ]);
    this.log(`\u5f53\u524d\u9b54\u529b\u503c: ${formatNumber(balance.karma)}\uff0cPT\u5e01: ${formatNumber(balance.credits)}\uff0c\u7b49\u7ea7: ${balance.level ?? "-"}`);
    this.log(`\u7b7e\u5230\u7edf\u8ba1: \u8fde\u7eed${stats.current_streak || 0}\u5929\uff0c\u7d2f\u8ba1${stats.total_days || 0}\u5929`);
    notifyMsg.push(`\u300c${this.userName}\u300d\u7b7e\u5230\u6210\u529f\uff0c\u672c\u6b21\u83b7\u5f97:${formatNumber(signin.bonus)}\u9b54\u529b\u503c\uff0c\u5f53\u524d\u9b54\u529b\u503c:${formatNumber(balance.karma)}\uff0c\u7d2f\u8ba1\u7b7e\u5230:${stats.total_days || 0}\u5929`);
    successCount++;
  }
}

async function getCookie() {
  if (!isRequest || $request.method === "OPTIONS") return;
  const headers = lowerHeaders($request.headers || {});
  const token = normalizeToken(headers.authorization || "");
  if (!token) {
    $.msg($.name, "\u83b7\u53d6 Authorization \u5931\u8d25", "\u5f53\u524d\u8bf7\u6c42\u672a\u643a\u5e26 Bearer token");
    return;
  }
  const body = $.toObj($response?.body, {});
  const stats = body?.data?.stats || body?.data || {};
  const userName = stats.username || stats.nickname || decodeJwtName(token) || `Account${userCookie.length + 1}`;
  const userAgent = headers["user-agent"] || defaultUA();
  const newData = { token, userName, userAgent };
  const index = userCookie.findIndex(item => item.token === token || item.userName === userName);
  if (index >= 0) userCookie[index] = newData;
  else userCookie.push(newData);
  $.setjson(userCookie, ckName);
  $.msg($.name, "\ud83c\udf89 \u83b7\u53d6\u8d26\u53f7\u6210\u529f", `\u8d26\u53f7: ${userName}`);
}

async function main() {
  if (!userCookie.length) {
    notifyMsg.push("\u672a\u627e\u5230\u8d26\u53f7\uff0c\u9752\u9f99\u8bf7\u914d\u7f6e\u73af\u5883\u53d8\u91cf rousipro_data");
    return;
  }
  $.log(`\u5171\u627e\u5230 ${userCookie.length} \u4e2a\u8d26\u53f7`);
  for (let i = 0; i < userCookie.length; i++) {
    const user = new RousiPro(userCookie[i], i + 1);
    try {
      await user.run();
    } catch (e) {
      const message = e?.message || String(e);
      if (message.includes("\u4eca\u65e5\u5df2\u7b7e\u5230")) {
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
  return raw.split(/\n|@|&/).map(item => item.trim()).filter(Boolean).map(token => normalizeAccount({ token }));
}

function normalizeAccount(account) {
  if (!account) return null;
  if (typeof account === "string") return { token: normalizeToken(account) };
  const token = normalizeToken(account.token || account.Authorization || account.authorization || "");
  if (!token) return null;
  return { ...account, token, userName: account.userName || account.username || decodeJwtName(token) };
}

function normalizeToken(token) {
  token = String(token || "").trim();
  if (!token) return "";
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

function formatNumber(value) {
  if (value === undefined || value === null || value === "") return "-";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2).replace(/\.00$/, "") : String(value);
}

function extractSigninBonus(data, res) {
  const candidates = [
    data?.bonus,
    data?.karma,
    data?.points,
    data?.reward,
    data?.amount,
    data?.value,
    data?.delta,
    data?.gained,
    data?.gain,
    data?.attendance_reward,
    data?.reward_points,
    res?.bonus,
    res?.points
  ];
  const value = candidates.find(item => item !== undefined && item !== null && item !== "");
  if (value !== undefined) return value;
  const message = [data?.message, res?.message].filter(Boolean).join(" ");
  const match = message.match(/(?:\u83b7\u5f97|\u5956\u52b1|\u589e\u52a0)\s*([+-]?\d+(?:\.\d+)?)/) || message.match(/([+-]?\d+(?:\.\d+)?)\s*(?:\u9b54\u529b|\u9b54\u529b\u503c|karma|points)/i);
  return match ? match[1] : 0;
}
function lowerHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function decodeJwtName(token) {
  try {
    const payload = token.replace(/^Bearer\s+/i, "").split(".")[1];
    const json = JSON.parse(atobCompat(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.username;
  } catch (_) {
    return null;
  }
}

function atobCompat(str) {
  if (typeof atob === "function") return atob(str);
  return Buffer.from(str, "base64").toString("utf8");
}

function defaultUA() {
  return "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1";
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
