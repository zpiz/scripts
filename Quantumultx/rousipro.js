/*
------------------------------------------
new Env("Rousi Pro")
cron 10 8 * * * rousipro.js

[rewrite_local]
^https:\/\/rousi\.pro\/api\/(me|points\/init|points\/balance|points\/attendance\/stats) url script-response-body https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Quantumultx/rousipro.js

[MITM]
hostname = rousi.pro

说明：打开 rousi.pro 并进入个人/积分页面即可抓取 Authorization。
------------------------------------------
*/

const $ = new Env("Rousi Pro");
const ckName = "rousipro_data";
const notify = $.isNode() ? require("./sendNotify") : "";

let userCookie = $.getjson(ckName, []);
let notifyMsg = [];
let successCount = 0;

class RousiPro {
  constructor(user, index) {
    this.index = index;
    this.token = user.token || user;
    this.userName = user.userName || user.username || `账号${index}`;
    this.baseUrl = "https://rousi.pro";
    this.headers = {
      "Authorization": this.token,
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "Origin": "https://rousi.pro",
      "Referer": "https://rousi.pro/points",
      "User-Agent": user.userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1"
    };
  }

  log(message) {
    $.log(`「${this.userName}」${message}`);
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
    const data = $.toObj(response.body, response.body);
    if (response.statusCode >= 400) throw new Error(`HTTP ${response.statusCode}: ${response.body || ""}`);
    return data;
  }

  async init() {
    const res = await this.request({ url: "/api/points/init" });
    if (res?.code !== 0) throw new Error(res?.message || "初始化失败");
    return res.data;
  }

  async signin() {
    const res = await this.request({
      url: "/api/points/attendance",
      method: "POST",
      body: { mode: "random" }
    });
    if (res?.code === 0) {
      const data = res.data || {};
      this.log(`✅ 签到成功: ${data.message || `获得 ${data.bonus || 0} 魔力值`}`);
      return data;
    }
    const message = res?.message || "签到失败";
    this.log(`⛔️ 签到失败: ${message}`);
    throw new Error(message);
  }

  async balance() {
    const res = await this.request({ url: "/api/points/balance" });
    if (res?.code !== 0) throw new Error(res?.message || "查询余额失败");
    return res.data || {};
  }

  async stats() {
    const res = await this.request({ url: "/api/points/attendance/stats" });
    if (res?.code !== 0) throw new Error(res?.message || "查询签到统计失败");
    return res.data || {};
  }

  async run() {
    this.log("开始执行任务");
    const before = await this.init().catch(() => null);
    const today = before?.attendance?.server_today;
    const attendedDates = before?.attendance?.attended_dates || [];
    if (today && attendedDates.includes(today)) {
      this.log(`✅ 今日已签到: 连续${before.attendance.current_streak || 0}天，累计${before.attendance.total_days || 0}天`);
    } else {
      await this.signin();
    }

    const [balance, stats] = await Promise.all([
      this.balance().catch(() => ({})),
      this.stats().catch(() => ({}))
    ]);
    this.log(`当前魔力值: ${formatNumber(balance.karma)}，PT币: ${formatNumber(balance.credits)}，等级: ${balance.level ?? "-"}`);
    this.log(`签到统计: 连续${stats.current_streak || 0}天，累计${stats.total_days || 0}天`);
    notifyMsg.push(`「${this.userName}」执行成功，魔力值:${formatNumber(balance.karma)}，累计签到:${stats.total_days || 0}天`);
    successCount++;
  }
}

async function getCookie() {
  if (typeof $request === "undefined") return;
  if ($request.method === "OPTIONS") return;
  const headers = lowerHeaders($request.headers || {});
  const token = headers.authorization;
  if (!token || !/^Bearer\s+/i.test(token)) {
    $.msg($.name, "获取 Authorization 失败", "当前请求未携带 Bearer token");
    return;
  }
  const body = $.toObj($response?.body, {});
  const stats = body?.data?.stats || body?.data || {};
  const userName = stats.username || stats.nickname || decodeJwtName(token) || `账号${userCookie.length + 1}`;
  const userAgent = headers["user-agent"];
  const newData = { token, userName, userAgent };
  const index = userCookie.findIndex(item => item.token === token || item.userName === userName);
  if (index >= 0) userCookie[index] = newData;
  else userCookie.push(newData);
  $.setjson(userCookie, ckName);
  $.msg($.name, "🎉 获取账号成功", `账号: ${userName}`);
}

async function main() {
  if (!Array.isArray(userCookie)) userCookie = $.toObj(userCookie, []);
  if (!userCookie.length) {
    notifyMsg.push("未找到账号，请先打开 rousi.pro 抓取 Authorization");
    return;
  }
  $.log(`共找到 ${userCookie.length} 个账号`);
  for (let i = 0; i < userCookie.length; i++) {
    const user = new RousiPro(userCookie[i], i + 1);
    try {
      await user.run();
    } catch (e) {
      const message = e?.message || e;
      user.log(`⛔️ 执行失败: ${message}`);
      notifyMsg.push(`「${user.userName}」执行失败: ${message}`);
    }
    if (i < userCookie.length - 1) await $.wait(randomInt(1000, 3000));
  }
}

function formatNumber(value) {
  if (value === undefined || value === null || value === "") return "-";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2).replace(/\.00$/, "") : String(value);
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

function randomInt(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

!(async () => {
  if (typeof $request !== "undefined") await getCookie();
  else await main();
})()
  .catch(e => {
    const message = e?.message || e;
    $.log(`脚本异常: ${message}`);
    notifyMsg.push(`脚本异常: ${message}`);
  })
  .finally(async () => {
    if (typeof $request === "undefined" && notifyMsg.length) {
      await sendNotify($.name, `共${userCookie.length || 0}个账号，成功${successCount}个`, notifyMsg.join("\n"));
    }
    $.done();
  });

async function sendNotify(title, subtitle, message) {
  if ($.isNode() && notify) return notify.sendNotify(title, `${subtitle}\n${message}`);
  $.msg(title, subtitle, message);
}

function Env(name) {
  return new class {
    constructor(name) {
      this.name = name;
      this.startTime = Date.now();
      this.data = null;
      this.dataFile = "box.dat";
      this.log(`🔔${this.name}, 开始!`);
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
        this.fs = this.fs || require("fs");
        this.path = this.path || require("path");
        const file = this.path.resolve(this.dataFile);
        if (!this.fs.existsSync(file)) return "";
        this.data = this.data || this.toObj(this.fs.readFileSync(file, "utf8"), {});
        return key.split(".").reduce((obj, part) => obj && obj[part], this.data) || "";
      }
      return $persistentStore.read(key) || "";
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
      return $persistentStore.write(value, key);
    }
    request(options) {
      return new Promise((resolve, reject) => {
        if (this.isQuanX()) {
          $task.fetch(options).then(resolve, reject);
        } else if (this.isSurge() || this.isLoon() || this.isShadowrocket()) {
          const method = (options.method || "GET").toLowerCase();
          $httpClient[method](options, (err, resp, body) => err ? reject(err) : resolve({ ...resp, body }));
        } else if (this.isNode()) {
          const got = require("got");
          got(options.url, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            timeout: { request: options.timeout || 15000 },
            throwHttpErrors: false
          }).then(resp => resolve({ statusCode: resp.statusCode, headers: resp.headers, body: resp.body }), reject);
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
      this.log(`🔔${this.name}, 结束! 🕛 ${(Date.now() - this.startTime) / 1000} 秒`);
      if (typeof $done !== "undefined") $done(value);
    }
  }(name);
}

