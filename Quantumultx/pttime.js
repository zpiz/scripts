/*
------------------------------------------
@Date: 2026.07.07
@Description: PT-pttime 签到
@Author: zpiz
------------------------------------------
@Description:
脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，青龙
new Env("PTTime")
cron 15 8 * * * pttime.js

[rewrite_local]
^https:\/\/www\.pttime\.org\/(index|attendance)\.php url script-response-body https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Quantumultx/pttime.js

[MITM]
hostname = www.pttime.org

QingLong env:
- pttime_data: 完整 Cookie 字符串（浏览器抓包拿到的那一串，包含 c_secure_uid/c_secure_pass/cf_clearance 等），
  或 JSON 数组 [{"cookie":"完整cookie字符串","userName":"name"}]，多账号用换行 / @ 分隔。
  uid 会自动从 cookie 里的 c_secure_uid 解出来，不用单独填。
- Optional: BARK_PUSH or BARK_URL for Bark notification; BARK_SERVER defaults to https://api.day.app

重要提醒：
1. cf_clearance 是 Cloudflare 人机验证发的通行令牌，是有有效期的（一般数小时到一天，具体看站点配置），
   一旦过期这个脚本就会拿到 Cloudflare 的验证页而不是真正的签到结果。出现这种情况需要用真实浏览器/App
   重新打开一次网站，让下面的 [rewrite_local] 重新抓一份新鲜的 cf_clearance 存进 pttime_data。
2. 抓 cookie 时请保证是"登录状态下打开 index.php 或点了签到"这一次的请求，MITM 只对这两个路径生效。
------------------------------------------
*/

const $ = new Env("PTTime");
const ckName = "pttime_data";
const altCkNames = ["PTTIME_DATA", "PTT_DATA", "ptt_data", "pttime_cookie"];
const isRequest = typeof $request !== "undefined";
let notifyMsg = [];
let successCount = 0;
let userCookie = loadAccounts();

// ------------------------------------------------------------
// 请求封装：固定请求头（UA/Referer/Sec-Fetch-* 等）统一在这里维护，
// 账号数据（pttime_data）里只保留 cookie / userName，UA 不需要存进变量，
// uid 也不用存——每次直接从 cookie 里的 c_secure_uid 解出来。
// ------------------------------------------------------------
const BASE_URL = "https://www.pttime.org";
const COOKIE_KEYS = [
  "cf_clearance",
  "logged_in",
  "c_secure_login",
  "c_secure_pass",
  "c_secure_ssl",
  "c_secure_tracker_ssl",
  "c_secure_uid",
  "c_lang_folder"
];

function buildHeaders(cookie, extra) {
  return {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Referer": `${BASE_URL}/index.php`,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": defaultUA(),
    "Cookie": cookie,
    ...(extra || {})
  };
}

async function apiRequest(cookie, options) {
  const url = options.url.startsWith("http") ? options.url : `${BASE_URL}${options.url}`;
  const method = (options.method || "GET").toUpperCase();
  const response = await $.request({
    url,
    method,
    headers: buildHeaders(cookie, options.headers),
    timeout: 15000
  });
  const statusCode = response.statusCode || response.status || 0;
  if (statusCode >= 400) throw new Error(`HTTP ${statusCode}`);
  return response.body || "";
}

class PTTime {
  constructor(account, index) {
    if (typeof account === "string") account = { cookie: account };
    this.index = index;
    this.cookie = normalizeCookie(account.cookie || account.Cookie || "");
    this.uid = extractUid(this.cookie);
    this.userName = account.userName || account.username || `Account${index}`;
  }

  log(message) {
    $.log(`\u300c${this.userName}\u300d${message}`);
  }

  request(options) {
    return apiRequest(this.cookie, options);
  }

  async signin() {
    if (!this.uid) {
      throw new Error("\u65e0\u6cd5\u4ece Cookie \u4e2d\u89e3\u6790\u51fa uid\uff08c_secure_uid\uff09\uff0c\u8bf7\u91cd\u65b0\u6293\u5305\u83b7\u53d6\u5b8c\u6574 Cookie");
    }
    const html = await this.request({ url: `/attendance.php?type=sign&uid=${this.uid}` });
    return parseAttendancePage(html);
  }

  async run() {
    const result = await this.signin();

    if (result.cfChallenge) {
      throw new Error("Cloudflare \u6821\u9a8c\u5df2\u5931\u6548\uff08cf_clearance \u8fc7\u671f\uff09\uff0c\u8bf7\u7528\u771f\u5b9e\u6d4f\u89c8\u5668/App \u91cd\u65b0\u6253\u5f00\u7ad9\u70b9\u4ee5\u91cd\u65b0\u6293\u53d6 Cookie");
    }
    if (result.notLoggedIn) {
      throw new Error("Cookie \u5df2\u5931\u6548\u6216\u672a\u767b\u5f55\uff0c\u8bf7\u91cd\u65b0\u6293\u5305\u83b7\u53d6\u767b\u5f55 Cookie");
    }
    if (result.already) {
      this.log(`\u26d4\ufe0f ${result.message}\uff0c\u5f53\u524d\u9b54\u529b\u503c: ${result.karma ?? "-"}`);
      notifyMsg.push(`\u300c${this.userName}\u300d${result.message}\uff0c\u5f53\u524d\u9b54\u529b\u503c:${result.karma ?? "-"}`);
      return;
    }
    if (!result.success) {
      throw new Error(result.message || "\u7b7e\u5230\u5931\u8d25\uff0c\u672a\u80fd\u8bc6\u522b\u9875\u9762\u5185\u5bb9");
    }

    this.log(`\u2705 \u7b7e\u5230\u6210\u529f\uff0c\u7b2c${result.totalCount}\u6b21\u7b7e\u5230\uff0c\u8fde\u7eed${result.streak}\u5929\uff0c\u672c\u6b21\u83b7\u5f97${result.bonus}\u9b54\u529b\u503c\uff0c\u5f53\u524d\u9b54\u529b\u503c: ${result.karma ?? "-"}`);
    notifyMsg.push(`\u300c${this.userName}\u300d\u7b7e\u5230\u6210\u529f\uff0c\u672c\u6b21\u83b7\u5f97${result.bonus}\u9b54\u529b\u503c\uff0c\u8fde\u7eed${result.streak}\u5929\uff0c\u5f53\u524d\u9b54\u529b\u503c:${result.karma ?? "-"}`);
    successCount++;
  }
}

// ------------------------------------------------------------
// 页面解析：从 attendance.php 返回的 HTML 里抠出签到结果和魔力值余额
// ------------------------------------------------------------
function parseAttendancePage(html) {
  if (/Just a moment|cf-chl|challenge-platform|id=["']challenge-form["']/i.test(html)) {
    return { cfChallenge: true };
  }
  if (/name=["']login-username["']|takelogin\.php/i.test(html) && !/logout\.php/i.test(html)) {
    return { notLoggedIn: true };
  }

  const karmaMatch = html.match(/\u4f7f\u7528&\u8bf4\u660e<\/a>\]:\s*([\d,.]+)/);
  const karma = karmaMatch ? karmaMatch[1] : null;

  const successMatch = html.match(
    /\u4eca\u65e5\u7b7e\u5230\u6210\u529f[\s\S]{0,200}?\u7b2c\s*<b>(\d+)<\/b>\s*\u6b21\u7b7e\u5230[\s\S]{0,20}?\u8fde\u7eed\u7b7e\u5230\s*<b>(\d+)<\/b>\s*\u5929[\s\S]{0,20}?\u83b7\u5f97\s*<b>([\d.]+)<\/b>\s*\u4e2a\u9b54\u529b\u503c/
  );
  if (successMatch) {
    return {
      success: true,
      totalCount: successMatch[1],
      streak: successMatch[2],
      bonus: successMatch[3],
      karma
    };
  }

  const alreadyMatch = html.match(/(\u4f60|\u60a8)?\u4eca\u5929(\u5df2\u7ecf|\u5df2)\u7b7e\u5230[^<]*|\u91cd\u590d\u7b7e\u5230[^<]*/);
  if (alreadyMatch) {
    return { already: true, message: alreadyMatch[0].trim(), karma };
  }

  return { success: false, message: extractErrorHint(html) };
}

function extractErrorHint(html) {
  const m = html.match(/<title>(.*?)<\/title>/i);
  return m ? m[1].trim() : "\u672a\u77e5\u54cd\u5e94\uff0c\u7b7e\u5230\u5931\u8d25";
}

// ------------------------------------------------------------
// Cookie 工具：解析 / 过滤 / 从 c_secure_uid 解出 uid
// ------------------------------------------------------------
function parseCookiePairs(raw) {
  const map = {};
  String(raw || "").split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) map[key] = value;
  });
  return map;
}

function normalizeCookie(raw) {
  const map = parseCookiePairs(raw);
  return COOKIE_KEYS.filter(k => map[k] !== undefined)
    .map(k => `${k}=${map[k]}`)
    .join("; ");
}

function extractUid(cookie) {
  const map = parseCookiePairs(cookie);
  const raw = map.c_secure_uid;
  if (!raw) return "";
  try {
    const decoded = atobCompat(decodeURIComponent(raw));
    return /^\d+$/.test(decoded) ? decoded : "";
  } catch (_) {
    return "";
  }
}

// ------------------------------------------------------------
// MITM 抓取：从浏览到的 index.php / attendance.php 请求里拿完整 Cookie，
// 用户名从欢迎栏（PowerUser_Name）里解析，不需要额外手动填。
// ------------------------------------------------------------
async function getCookie() {
  if (!isRequest || $request.method === "OPTIONS") return;
  const headers = lowerHeaders($request.headers || {});
  const cookie = normalizeCookie(headers.cookie || "");
  const uid = extractUid(cookie);
  if (!cookie || !uid) {
    $.msg($.name, "\u83b7\u53d6 Cookie \u5931\u8d25", "\u5f53\u524d\u8bf7\u6c42\u672a\u643a\u5e26\u6709\u6548\u767b\u5f55 Cookie\uff08\u7f3a c_secure_uid\uff09");
    return;
  }
  const body = $response?.body || "";
  const nameMatch = body.match(/PowerUser_Name['"]><b>([^<]+)<\/b>/);
  const userName = (nameMatch && nameMatch[1]) || `Account${userCookie.length + 1}`;
  const newData = { cookie, userName };
  const index = userCookie.findIndex(item => extractUid(item.cookie) === uid);
  if (index >= 0) userCookie[index] = newData;
  else userCookie.push(newData);
  $.setjson(userCookie, ckName);
  $.msg($.name, "\ud83c\udf89 \u83b7\u53d6\u8d26\u53f7\u6210\u529f", `\u8d26\u53f7: ${userName}`);
}

async function main() {
  if (!userCookie.length) {
    notifyMsg.push("\u672a\u627e\u5230\u8d26\u53f7\uff0c\u9752\u9f99\u8bf7\u914d\u7f6e\u73af\u5883\u53d8\u91cf pttime_data");
    return;
  }
  $.log(`\u5171\u627e\u5230 ${userCookie.length} \u4e2a\u8d26\u53f7`);
  for (let i = 0; i < userCookie.length; i++) {
    const user = new PTTime(userCookie[i], i + 1);
    try {
      await user.run();
    } catch (e) {
      const message = e?.message || String(e);
      user.log(`\u26d4\ufe0f \u6267\u884c\u5931\u8d25: ${message}`);
      notifyMsg.push(`\u300c${user.userName}\u300d\u6267\u884c\u5931\u8d25: ${message}`);
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
  return raw.split(/\n|@/).map(item => item.trim()).filter(Boolean).map(cookie => normalizeAccount({ cookie }));
}

function normalizeAccount(account) {
  if (!account) return null;
  if (typeof account === "string") {
    const cookie = normalizeCookie(account);
    return cookie ? { cookie } : null;
  }
  const cookie = normalizeCookie(account.cookie || account.Cookie || "");
  if (!cookie) return null;
  // 只保留 cookie / userName，uid 不落地存储，运行时从 cookie 里的 c_secure_uid 解析。
  return { cookie, userName: account.userName || account.username || undefined };
}

function lowerHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function atobCompat(str) {
  if (typeof atob === "function") return atob(str);
  return Buffer.from(str, "base64").toString("utf8");
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
