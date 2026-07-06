/*
------------------------------------------
@Description: PTTime (NexusPHP) 自动签到
@Author: AI
------------------------------------------
@Description:
脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，青龙
new Env("PTTime")
cron 10 8 * * * pttime.js

[rewrite_local]
^https:\/\/www\.pttime\.org\/(index|attendance)\.php url script-request-header https://raw.githubusercontent.com/your-repo/pttime.js

[MITM]
hostname = www.pttime.org

QingLong env:
- pttime_cookie: 填入你的Cookie，多个账号用换行 / @ / & 隔开。格式如 c_secure_uid=xxx; c_secure_pass=xxx;
- Optional: BARK_PUSH or BARK_URL for Bark notification; BARK_SERVER defaults to https://api.day.app
------------------------------------------
*/

const $ = new Env("PTTime");
const ckName = "pttime_cookie";
const altCkNames = ["PTTIME_COOKIE", "pttime_data"];
const isRequest = typeof $request !== "undefined";
let notifyMsg = [];
let successCount = 0;
let userCookie = loadAccounts();

const BASE_URL = "https://www.pttime.org";

function buildHeaders(cookie, extra) {
  return {
    "Cookie": cookie,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": defaultUA(),
    "Connection": "keep-alive",
    "Referer": `${BASE_URL}/index.php`,
    ...(extra || {})
  };
}

async function apiRequest(cookie, options) {
  const url = options.url.startsWith("http") ? options.url : `${BASE_URL}${options.url}`;
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? options.body : undefined;
  
  const response = await $.request({
    url,
    method,
    headers: buildHeaders(cookie, options.headers),
    body,
    timeout: 15000
  });
  
  const statusCode = response.statusCode || response.status || 0;
  if (statusCode >= 400) {
    throw new Error(`HTTP Error ${statusCode}`);
  }
  return response.body || "";
}

class PTTime {
  constructor(cookieStr, index) {
    this.index = index;
    this.cookie = cookieStr;
    this.userName = `Account${index}`;
  }

  log(message) {
    $.log(`「${this.userName}」${message}`);
  }

  request(options) {
    return apiRequest(this.cookie, options);
  }

  async run() {
    try {
      // 1. 访问首页获取状态和真实签到链接
      const indexHtml = await this.request({ url: "/index.php" });
      
      // 判断是否处于登录状态
      if (!indexHtml.includes("logout.php")) {
        throw new Error("Cookie已失效或未登录");
      }

      // 尝试提取用户名
      const userMatch = indexHtml.match(/class="User_Name[^>]*><b>([^<]+)<\/b>/i) || indexHtml.match(/href="userdetails.php\?id=\d+"[^>]*><b>([^<]+)<\/b><\/a>/i);
      if (userMatch) {
        this.userName = userMatch[1];
      }

      // 2. 检查是否已经签到
      // 根据 HAR 文件分析，已签到通常不显示[签到领魔力]，或者显示为补签等其他状态
      const signLinkMatch = indexHtml.match(/href="(attendance\.php\?type=sign[^"]*)"/);
      
      if (!signLinkMatch) {
        const message = "今日已签到或未找到签到入口";
        this.log(`⛔️ ${message}`);
        notifyMsg.push(`「${this.userName}」${message}`);
        return;
      }

      // 3. 发起签到请求
      const signUrl = "/" + signLinkMatch[1].replace(/&amp;/g, "&");
      const signHtml = await this.request({ url: signUrl });

      // 4. 解析签到结果
      if (signHtml.includes("这是您的第") || signHtml.includes("签到已得") || signHtml.includes("获得")) {
        const bonusMatch = signHtml.match(/获得\s*<b>\s*(\d+)\s*<\/b>\s*魔力值/);
        const bonus = bonusMatch ? bonusMatch[1] : "?";
        
        this.log(`✅ 签到成功，本次获得 ${bonus} 魔力值`);
        notifyMsg.push(`「${this.userName}」签到成功，获得 ${bonus} 魔力值`);
        successCount++;
      } else if (signHtml.includes("您今天已经签到过了")) {
        this.log(`⛔️ 今日已签到`);
      } else {
        throw new Error("签到结果未达预期，可能是触发了 Cloudflare 盾或页面改变");
      }
    } catch (e) {
      const message = e?.message || String(e);
      this.log(`❌ 执行失败: ${message}`);
      notifyMsg.push(`「${this.userName}」执行失败: ${message}`);
    }
  }
}

async function getCookie() {
  if (!isRequest || $request.method === "OPTIONS") return;
  const headers = lowerHeaders($request.headers || {});
  const cookie = headers.cookie || "";
  
  if (!cookie || !cookie.includes("c_secure_uid=")) {
    return;
  }
  
  if (userCookie.includes(cookie)) {
    return; // 已经存过该 Cookie
  }

  userCookie.push(cookie);
  $.setdata(userCookie.join("\n"), ckName);
  $.msg($.name, "🎉 获取PTTime Cookie成功", "可前往脚本日志查看");
}

async function main() {
  if (!userCookie.length) {
    notifyMsg.push("未找到账号，青龙请配置环境变量 pttime_cookie，或使用重写获取");
    return;
  }
  $.log(`共找到 ${userCookie.length} 个账号`);
  for (let i = 0; i < userCookie.length; i++) {
    const user = new PTTime(userCookie[i], i + 1);
    await user.run();
    if (i < userCookie.length - 1) await $.wait(randomInt(1500, 4000));
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
  // 支持多账号分隔符
  return raw.split(/\n|@|&/).map(item => item.trim()).filter(Boolean);
}

function lowerHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
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
    $.log(`脚本异常: ${message}`);
    notifyMsg.push(`脚本异常: ${message}`);
  })
  .finally(async () => {
    if (!isRequest && notifyMsg.length) {
      await sendNotify($.name, `共${userCookie.length || 0}个账号，成功${successCount}个`, notifyMsg.join("\n"));
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
    } catch (e) {}
    await sendBark(title, content).catch(() => false);
  } else {
    $.msg(title, subtitle, message);
  }
}

function loadQingLongNotifyConfig() {
  if (!$.isNode()) return;
  try {
    const fs = require("fs");
    const paths = ["/ql/data/config/config.sh", "/ql/config/config.sh"].filter(Boolean);
    for (const file of paths) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf8");
        for (const rawLine of content.split(/\r?\n/)) {
          const match = rawLine.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
          if (match && /^(BARK|PUSH_KEY|TG_|DD_)/.test(match[1])) {
            process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n");
          }
        }
        break;
      }
    }
  } catch (e) {}
}

async function sendBark(title, body) {
  if (!$.isNode() || !(process.env.BARK_PUSH || process.env.BARK_URL)) return false;
  const barkPush = process.env.BARK_PUSH || process.env.BARK_URL;
  const server = (process.env.BARK_SERVER || "https://api.day.app").replace(/\/$/, "");
  const url = /^https?:\/\//i.test(barkPush) ? barkPush.replace(/\/$/, "") : `${server}/${barkPush}`;
  
  const params = new URLSearchParams({ title, body });
  if (process.env.BARK_GROUP) params.set("group", process.env.BARK_GROUP);
  
  try {
    const mod = url.startsWith("https") ? require("https") : require("http");
    return new Promise(resolve => {
      const req = mod.request(`${url}?${params.toString()}`, { method: "GET" }, res => resolve(res.statusCode < 400));
      req.on("error", () => resolve(false)).end();
    });
  } catch (e) { return false; }
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
    getdata(key) {
      if (this.isNode()) {
        const envValue = process.env[key];
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
        this.data[key] = value;
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
          const mod = options.url.startsWith("https") ? require("https") : require("http");
          const req = mod.request(options.url, { method: options.method || "GET", headers: options.headers }, res => {
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
          });
          req.on("error", reject);
          if (options.body) req.write(options.body);
          req.end();
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
