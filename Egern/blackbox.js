/*
 * 小黑盒签到与分享任务 - 多平台版
 *
 * 参考:
 * https://raw.githubusercontent.com/wqe134/xiaoheihe-autosign/refs/heads/main/%E5%B0%8F%E9%BB%91%E7%9B%92%E7%AD%BE%E5%88%B0.js
 *
 * 青龙变量:
 * BLACKBOX_COOKIE="heybox_id#pkey=xxxx;x_xhh_tokenid=xxxx"
 * 多账号可用换行或 & 分隔。
 * 可选:
 * XHH_HKEY_SERVER="http://ip:port/hkey"
 * XHH_USE_CAPTURED_DEVICE=1
 * BLACKBOX_DEVICE='{"os_type":"iOS","x_os_type":"iOS","version":"1.3.376","device_id":"..."}'
 *
 * Quantumult X:
 * [rewrite_local]
 * ^https:\/\/(?:api|data)\.xiaoheihe\.cn\/.+ url script-request-header https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/blackbox.js
 * [MITM]
 * hostname = api.xiaoheihe.cn, data.xiaoheihe.cn
 *
 * Surge / Loon / Stash:
 * [scripts]
 * http-request ^https:\/\/(?:api|data)\.xiaoheihe\.cn\/.+ script-path=https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/blackbox.js, tag=小黑盒获取Cookie
 *
 * Egern:
 * scriptings:
 *   - http_request:
 *       name: 小黑盒获取Cookie
 *       match: ^https:\/\/(?:api|data)\.xiaoheihe\.cn\/.+
 *       script_url: 本脚本地址
 *
 * [MITM]
 * hostname = api.xiaoheihe.cn, data.xiaoheihe.cn
 */

"use strict";

const $ = new Env("小黑盒签到");

const CK_NAME = "BLACKBOX_COOKIE";
const DEVICE_KEY = "BLACKBOX_DEVICE";
const HKEY_SERVER = readEnv("XHH_HKEY_SERVER") || "http://47.120.39.109:9900/hkey";
const USE_CAPTURED_DEVICE = readEnv("XHH_USE_CAPTURED_DEVICE") === "1";
const BASE_APP_REFERER = "http://api.maxjia.com/";
const API_HOST = "api.xiaoheihe.cn";
const DATA_HOST = "data.xiaoheihe.cn";
const USER_AGENT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML like Gecko) Chrome/41.0.2272.118 Safari/537.36 ApiMaxJia/1.0";
const REPORT_USER_AGENT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 Safari/537.36 ApiMaxJia/1.0";

const DEVICE_QUERY =
  "&imei=4187fb55b1be198a&device_info=XiaoMi%2013%E7%A7%81%E4%BA%BA%E8%AE%A2%E5%88%B6%E7%89%88";
const APP_VERSION = "1.3.347";
const APP_BUILD = "916";
const SIGN_APP_VERSION = "1.3.332";
const SIGN_APP_BUILD = "871";
const COMMON_QUERY =
  `&os_type=Android&x_os_type=Android&x_client_type=mobile&os_version=9&version=${APP_VERSION}&build=${APP_BUILD}&_time=`;
const SIGN_COMMON_QUERY =
  `&os_type=Android&x_os_type=Android&x_client_type=mobile&os_version=9&version=${SIGN_APP_VERSION}&build=${SIGN_APP_BUILD}&_time=`;
const APP_QUERY = "&dw=428&channel=heybox_xiaomi&x_app=heybox";
const DEVICE_PROFILE_KEYS = [
  "lang",
  "device_info",
  "device_id",
  "x_app",
  "os_type",
  "x_os_type",
  "x_client_type",
  "os_version",
  "version",
  "dw",
  "time_zone",
  "channel",
  "build",
  "imei",
];

const TASK_ACTIONS = [
  {
    label: "分享帖子",
    taskName: "shareArticle",
    titlePattern: /(分享|发布|发帖).*(帖子|贴子|内容)|发布内容|发帖/,
  },
  {
    label: "分享游戏详情",
    taskName: "shareGameDetail",
    titlePattern: /(分享|前往).*(游戏详情|发布内容)|游戏详情/,
  },
  {
    label: "分享游戏评价",
    taskName: "shareGameComment",
    titlePattern: /(分享|发表|发布).*(游戏评价|评论)|游戏评价|评论/,
  },
  {
    label: "游戏榜单停留10s",
    taskName: "visitGameRank",
    titlePattern: /(游戏榜单|榜单|前往榜单).*(10s|停留10秒|停留10s)|停留10s|visitGameRank/,
  },
];

function readEnv(key) {
  if (typeof process !== "undefined" && process.env) return process.env[key] || "";
  return $.getdata(key) || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function queryStr(obj) {
  return Object.entries(obj || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function randomString(length = 32) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let value = "";
  for (let index = 0; index < length; index++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function randomHex(length = 8) {
  const chars = "0123456789ABCDEF";
  let value = "";
  for (let index = 0; index < length; index++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function getUrlParams(url) {
  const params = {};
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((value, key) => {
      if (params[key] === undefined) params[key] = value;
    });
  } catch {
    String(url || "")
      .replace(/^[^?]*\?/, "")
      .split("&")
      .forEach((item) => {
        const [key, value = ""] = item.split("=");
        if (key && params[key] === undefined) params[key] = decodeURIComponent(value);
      });
  }
  return params;
}

function getStoredDeviceProfile() {
  const raw = readEnv("XHH_DEVICE_PROFILE") || readEnv(DEVICE_KEY);
  const profile = safeJsonParse(raw, {});
  if (!profile || typeof profile !== "object") return {};

  const overrides = {
    device_id: readEnv("XHH_DEVICE_ID"),
    device_info: readEnv("XHH_DEVICE_INFO"),
    os_type: readEnv("XHH_OS_TYPE"),
    x_os_type: readEnv("XHH_X_OS_TYPE"),
    os_version: readEnv("XHH_OS_VERSION"),
    version: readEnv("XHH_VERSION"),
    dw: readEnv("XHH_DW"),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value) profile[key] = value;
  }
  return profile;
}

function getActiveDeviceProfile() {
  if (!USE_CAPTURED_DEVICE) return null;
  const profile = getStoredDeviceProfile();
  const hasUsefulValue = ["device_id", "device_info", "version", "os_type"].some((key) => profile[key]);
  if (!hasUsefulValue) return null;
  return {
    lang: "zh-cn",
    x_app: "heybox",
    x_client_type: "mobile",
    time_zone: "Asia/Shanghai",
    ...profile,
  };
}

function buildSignedQuery(hkeyInfo, options = {}) {
  const profile = getActiveDeviceProfile();
  if (profile) {
    const params = {};
    for (const key of DEVICE_PROFILE_KEYS) {
      if (profile[key] !== undefined && profile[key] !== null && String(profile[key]) !== "") {
        params[key] = profile[key];
      }
    }
    params._rnd = `14:${randomHex(8)}`;
    params.nonce = options.nonce || randomString(32);
    params.hkey = hkeyInfo.hkey;
    params._time = hkeyInfo.timestamp;
    return `&${queryStr(params)}`;
  }

  const commonQuery = options.sign ? SIGN_COMMON_QUERY : COMMON_QUERY;
  return `${DEVICE_QUERY}&nonce=${options.nonce || randomString(32)}&hkey=${hkeyInfo.hkey}` +
    `${commonQuery}${hkeyInfo.timestamp}${APP_QUERY}`;
}

function saveDeviceProfileFromUrl(url) {
  const params = getUrlParams(url);
  const profile = {};
  for (const key of DEVICE_PROFILE_KEYS) {
    if (params[key]) profile[key] = params[key];
  }
  if (!profile.device_id && !profile.device_info && !profile.version && !profile.os_type) return null;

  const previous = safeJsonParse($.getdata(DEVICE_KEY), {}) || {};
  const next = { ...previous, ...profile };
  $.setdata(JSON.stringify(next), DEVICE_KEY);
  return next;
}

function getHeader(headers, name) {
  const lower = name.toLowerCase();
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === lower);
  return key ? headers[key] : "";
}

function getCookieItem(cookie, key) {
  const match = String(cookie || "").match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  return match ? match[1] : "";
}

function getHeyboxIdFromUrl(url) {
  const match = String(url || "").match(/[?&]heybox_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function normalizeAccount(account) {
  const text = String(account || "").trim();
  if (!text || !text.includes("#")) return "";
  const [heyboxId, cookie] = text.split("#");
  const pkey = getCookieItem(cookie, "pkey");
  const tokenId = getCookieItem(cookie, "x_xhh_tokenid");
  if (!heyboxId || !pkey || !tokenId) return "";
  return `${heyboxId}#pkey=${pkey};x_xhh_tokenid=${tokenId}`;
}

function parseAccounts(raw) {
  return String(raw || "")
    .split(/\n|&/)
    .map(normalizeAccount)
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function getTaskState(taskList, taskAction) {
  const groups = taskList?.result?.task_list ?? [];
  for (const group of groups) {
    for (const task of group.tasks ?? []) {
      if (typeof task.title === "string" && taskAction.titlePattern.test(task.title)) return task.state;
    }
  }
  return null;
}

function getBatteryText(data) {
  const direct = data?.result?.user?.battery ?? data?.user?.battery;
  if (direct !== undefined && direct !== null) return String(direct);
  const finalUser = data?.result?.user;
  if (finalUser?.level_info?.coin !== undefined) return String(finalUser.level_info.coin);
  return "未知";
}

function getSignText(signResult) {
  if (!signResult) return "签到失败";
  if (signResult.result?.state === "ignore") return "今日已签到";
  if (signResult.msg === "请重新登录") return "Cookie过期";
  if (signResult.status === "ok" || signResult.result) return "签到请求成功";
  return signResult.msg || "签到成功";
}

function getSignStateText(signState, fallback) {
  if (!signState) return fallback;
  if (signState.msg) return signState.msg;
  const result = signState.result || {};
  if (result.state === "ok") {
    const coin = Number(result.sign_in_coin || 0);
    const exp = Number(result.sign_in_exp || 0);
    const streak = Number(result.sign_in_streak || 0);
    const parts = ["签到成功"];
    if (coin) parts.push(`+${coin}H币`);
    if (exp) parts.push(`+${exp}经验`);
    if (streak) parts.push(`连续${streak}天`);
    return parts.join(" ");
  }
  if (result.state === "ignore" || result.state === "finish") return "今日已签到";
  if (result.state === "waiting") return fallback || "签到等待确认";
  return fallback || "签到状态未知";
}

async function getSignStateWithRetry(account, retries = 2) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await getSignState(account);
    const state = last?.result?.state;
    if (last?.msg || state === "ok" || state === "ignore" || state === "finish") return last;
    if (attempt < retries) await sleep(1200);
  }
  return last;
}

async function request(options) {
  const method = (options.method || (options.body === undefined ? "GET" : "POST")).toUpperCase();
  const headers = options.headers || {};
  const timeout = options.timeout || 10000;
  const body = options.body;

  if ($.isNode()) {
    return nodeRequest(options.url, { method, headers, body, timeout });
  }

  return new Promise((resolve) => {
    const req = { url: options.url, headers, timeout };
    if (body !== undefined) req.body = body;
    const cb = (err, resp, data) => {
      if (err) {
        $.log(`[${method}] ${options.url} 请求失败: ${err}`);
        resolve(null);
        return;
      }
      resolve(safeJsonParse(data || resp?.body, data || resp?.body || null));
    };
    if (method === "GET") $.get(req, cb);
    else $.post(req, cb);
  });
}

async function nodeRequest(url, { method, headers, body, timeout }) {
  if (typeof fetch === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      return safeJsonParse(text, text);
    } catch (error) {
      $.log(`[${method}] ${url} 请求失败: ${error.message || error}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const lib = url.startsWith("https:") ? require("https") : require("http");
  return new Promise((resolve) => {
    const req = lib.request(url, { method, headers, timeout }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(safeJsonParse(data, data)));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function getHkey(heyboxId, type, taskName = "null") {
  const result = await request({
    url: HKEY_SERVER,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ heyboxId, type, taskName }),
    timeout: 8000,
  });
  if (!result?.hkey) $.log(`获取 hkey 失败 type=${type} taskName=${taskName}`);
  return result?.hkey ? result : null;
}

function appHeaders(cookie, host = API_HOST, userAgent = USER_AGENT, extra = {}) {
  return {
    Referer: BASE_APP_REFERER,
    "User-Agent": userAgent,
    Host: host,
    Connection: "Keep-Alive",
    Accept: "*/*",
    Cookie: cookie,
    ...extra,
  };
}

async function follow(account) {
  const [heyboxId, cookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 3);
  if (!hkeyInfo) return null;

  const url =
    `https://${API_HOST}/bbs/app/profile/follow/user?heybox_id=${heyboxId}` +
    buildSignedQuery(hkeyInfo, { nonce: "l7iQ8IQMHzj3hSydLxxsQMSzjnCvkiY3" });
  return request({
    url,
    method: "POST",
    headers: appHeaders(cookie),
    body: "following_id=12318034",
  });
}

async function getTaskList(account) {
  const [heyboxId, cookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 2);
  if (!hkeyInfo) return null;

  const url =
    `https://${API_HOST}/task/list_v2/?heybox_id=${heyboxId}` +
    buildSignedQuery(hkeyInfo, { nonce: "tb6e1k7WqQCIHToyzWzI8Ogq9d0EIgpb" });
  return request({ url, headers: appHeaders(cookie) });
}

async function signIn(account) {
  const [heyboxId, cookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 1);
  if (!hkeyInfo) return null;

  const url =
    `https://${API_HOST}/task/sign_v3/sign?heybox_id=${heyboxId}` +
    buildSignedQuery(hkeyInfo, { sign: true, nonce: "tb6e1k7WqQCIHToyzWzI8Ogq9d0EIgpb" });
  return request({ url, headers: appHeaders(cookie) });
}

async function getSignState(account) {
  const [heyboxId, cookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 1);
  if (!hkeyInfo) return null;

  const url =
    `https://${API_HOST}/task/sign_v3/get_sign_state?heybox_id=${heyboxId}` +
    buildSignedQuery(hkeyInfo, { sign: true });
  return request({ url, headers: appHeaders(cookie) });
}

async function doTask(account, taskName) {
  const [heyboxId, cookie] = account.split("#");
  const hkeyInfo = await getHkey(heyboxId, 5, taskName);
  if (!hkeyInfo) return null;

  const body = queryStr({
    data: hkeyInfo.data,
    key: hkeyInfo.key,
    sid: hkeyInfo.sid,
  });
  const time = hkeyInfo.timestamp;
  const url =
    `https://${DATA_HOST}/account/data_report/?type=104&time_=${time}` +
    `&session_id=77ee4fea-46d9-4a53-b5ce-5df9cf056b7e&heybox_id=${heyboxId}` +
    buildSignedQuery(hkeyInfo, { nonce: "fSz04CwxvcWzG737aFNKKxNeGZDFOqJ1" });
  return request({
    url,
    method: "POST",
    headers: appHeaders(cookie, DATA_HOST, REPORT_USER_AGENT, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Encoding": "gzip",
    }),
    body,
  });
}

async function refreshTaskList(account, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const taskList = await getTaskList(account);
    if (taskList?.result?.task_list) return taskList;
    if (attempt < retries) await sleep(1000);
  }
  return null;
}

async function runTaskWithVerify(account, taskAction, accountNo) {
  const before = await refreshTaskList(account);
  if (!before) return "任务列表失败";
  const beforeState = getTaskState(before, taskAction);
  if (beforeState === null) return "无此任务";
  if (beforeState === "finish") return "已完成";

  await doTask(account, taskAction.taskName);
  for (let index = 0; index < 3; index++) {
    await sleep(1200);
    const after = await refreshTaskList(account);
    if (getTaskState(after, taskAction) === "finish") {
      $.log(`账号${accountNo} -> ${taskAction.label}完成`);
      return "完成";
    }
  }
  return "未确认";
}

async function captureCookie() {
  const url = $request.url || "";
  const headers = $request.headers || {};
  const deviceProfile = saveDeviceProfileFromUrl(url);
  const cookie = getHeader(headers, "Cookie");
  const heyboxId = getHeyboxIdFromUrl(url);
  const pkey = getCookieItem(cookie, "pkey");
  const tokenId = getCookieItem(cookie, "x_xhh_tokenid");

  if (!heyboxId || !pkey || !tokenId) {
    $.msg($.name, "获取失败", "未在请求中找到 heybox_id / pkey / x_xhh_tokenid");
    return;
  }

  const newAccount = `${heyboxId}#pkey=${pkey};x_xhh_tokenid=${tokenId}`;
  const accounts = parseAccounts(readEnv(CK_NAME));
  const next = [newAccount, ...accounts.filter((item) => item.split("#")[0] !== heyboxId)];
  $.setdata(next.join("&"), CK_NAME);
  const deviceText = deviceProfile
    ? `\n设备: ${deviceProfile.os_type || "-"} ${deviceProfile.version || "-"} ${deviceProfile.device_info || ""}`
    : "";
  $.msg($.name, "获取成功", `账号 ${heyboxId} 已保存${deviceText}`);
}

async function sendNotify(title, content) {
  if (!content) return;
  if ($.isNode()) {
    const candidates = [
      "./sendNotify",
      "./sendNotify.js",
      "/ql/scripts/sendNotify",
      "/ql/scripts/sendNotify.js",
      "/ql/data/scripts/sendNotify",
      "/ql/data/scripts/sendNotify.js",
    ];
    for (const candidate of candidates) {
      try {
        const mod = require(candidate);
        const fn = typeof mod === "function" ? mod : mod.sendNotify || mod.default;
        if (typeof fn === "function") {
          await Promise.resolve(fn(title, content));
          return;
        }
      } catch {}
    }
    $.log("未找到青龙 sendNotify.js，仅输出日志");
    return;
  }
  $.msg(title, "", content);
}

async function main() {
  const accounts = parseAccounts(readEnv(CK_NAME));
  if (!accounts.length) {
    throw new Error(`未找到账号，请先配置 ${CK_NAME} 或通过代理抓包获取`);
  }

  $.log(`找到 ${accounts.length} 个账号`);
  if (USE_CAPTURED_DEVICE) {
    const profile = getActiveDeviceProfile();
    $.log(profile ? `使用捕获设备参数: ${profile.os_type || "-"} ${profile.version || "-"} ${profile.device_info || ""}` : "已开启捕获设备参数，但未找到可用 BLACKBOX_DEVICE");
  }
  const notifyBlocks = [];

  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index];
    const accountNo = index + 1;
    const accountLines = [`账号${accountNo}`];

    $.log(`\n---------- 账号${accountNo} ----------`);
    await follow(account).catch(() => null);

    const signResult = await signIn(account);
    const signState = await getSignStateWithRetry(account);
    const signText = getSignStateText(signState, getSignText(signResult));
    $.log(`账号${accountNo} -> ${signText}`);
    accountLines.push(`签到: ${signText}`);

    const taskList = await refreshTaskList(account);
    if (!taskList) {
      accountLines.push("任务列表: 获取失败");
      notifyBlocks.push(accountLines.join("\n"));
      continue;
    }

    const username = taskList.result?.user?.username || `账号${accountNo}`;
    const beforeBattery = getBatteryText(taskList);
    accountLines[0] = username;

    for (const taskAction of TASK_ACTIONS) {
      const taskText = await runTaskWithVerify(account, taskAction, accountNo);
      accountLines.push(`${taskAction.label}: ${taskText}`);
    }

    const finalTaskList = (await refreshTaskList(account)) || taskList;
    const finalBattery = getBatteryText(finalTaskList);
    accountLines.push(`盒电: ${finalBattery}`);
    if (finalBattery !== beforeBattery) accountLines.push(`变化: ${beforeBattery} -> ${finalBattery}`);
    notifyBlocks.push(accountLines.join("\n"));

    if (index < accounts.length - 1) await sleep(1500);
  }

  await sendNotify("小黑盒签到任务结果", notifyBlocks.join("\n\n"));
}

!(async () => {
  if (typeof $request !== "undefined" && $request?.url) {
    await captureCookie();
  } else {
    await main();
  }
})()
  .catch((error) => {
    $.logErr(error);
    $.msg($.name, "脚本异常", error.message || String(error));
  })
  .finally(() => $.done());

function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.startTime = Date.now();
      this.log(`\n${this.name}, 开始!`);
    }
    getEnv() {
      if (typeof Egern !== "undefined") return "Egern";
      if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge";
      if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash";
      if (typeof module !== "undefined" && module.exports) return "Node.js";
      if (typeof $task !== "undefined") return "Quantumult X";
      if (typeof $loon !== "undefined") return "Loon";
      if (typeof $rocket !== "undefined") return "Shadowrocket";
      return "Unknown";
    }
    isNode() {
      return this.getEnv() === "Node.js";
    }
    isQuanX() {
      return this.getEnv() === "Quantumult X";
    }
    log(...args) {
      console.log(args.map((item) => (item === undefined ? "" : String(item))).join("\n"));
    }
    logErr(error) {
      this.log(`${this.name}, 错误!`, error?.stack || error?.message || String(error));
    }
    getdata(key) {
      if (this.isNode()) return "";
      if (this.isQuanX()) return $prefs.valueForKey(key);
      return $persistentStore.read(key);
    }
    setdata(value, key) {
      if (this.isNode()) return false;
      if (this.isQuanX()) return $prefs.setValueForKey(value, key);
      return $persistentStore.write(value, key);
    }
    get(options, callback) {
      if (this.isQuanX()) {
        $task.fetch({ ...options, method: "GET" }).then(
          (resp) => callback(null, resp, resp.body),
          (err) => callback(err),
        );
      } else {
        $httpClient.get(options, callback);
      }
    }
    post(options, callback) {
      if (this.isQuanX()) {
        $task.fetch({ ...options, method: "POST" }).then(
          (resp) => callback(null, resp, resp.body),
          (err) => callback(err),
        );
      } else {
        $httpClient.post(options, callback);
      }
    }
    msg(title, subtitle = "", body = "") {
      if (this.isNode()) return;
      if (this.isQuanX()) $notify(title, subtitle, body);
      else $notification.post(title, subtitle, body);
    }
    done(value = {}) {
      this.log(`${this.name}, 结束! ${(Date.now() - this.startTime) / 1000} 秒`);
      if (this.isNode()) return;
      $done(value);
    }
  })(name);
}
