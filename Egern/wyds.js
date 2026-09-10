/**
 * @Author: Minis
 * @Name: 网易大神会员外卖券
 * @Type: 签到/领券
 * @Desc: 网易大神 (vip.ds.163.com) 会员超级券 — 外卖券自动领取
 * @Compatible: Surge / QuantumultX / Loon
 *
 * ============== Surge ==============
 * [Script]
 * 网易大神会员外卖券 = type=cron,cronexp=30 8 * * *,timeout=300,script-path=https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/wyds.js
 *
 * [MITM]
 * hostname = inf.ds.163.com, vip.ds.163.com
 *
 * ============== QuantumultX ==============
 * [task_local]
 * 30 8 * * * https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/wyds.js, tag=网易大神会员外卖券, enabled=true
 *
 * [rewrite_local]
 * ^https://inf\.ds\.163\.com/v1/web/base/mine/userInfo url script-request-header https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/wyds.js

 *
 * [mitm]
 * hostname = inf.ds.163.com, vip.ds.163.com
 *
 * ============== Loon ==============
 * [Script]
 * cron "30 8 * * *" script-path=https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/wyds.js, tag=网易大神会员外卖券
 *
 * [MITM]
 * hostname = inf.ds.163.com, vip.ds.163.com
 *
 * ============== 环境变量 ==============
 * wyds_data = [{"userId":"...","token":"...","userName":"...","xsrfToken":"...","deviceId":"...","cookie":"..."}]
 *   userId    -> GL-Uid 头
 *   token     -> cookie JSESSIONID 值 (只填值)
 *   userName  -> 备注名 (仅日志显示)
 *   xsrfToken -> (可选) getCookie 自动捕获
 *   deviceId  -> (可选) getCookie 自动捕获
 *   cookie    -> (可选) getCookie 自动捕获完整 Cookie, 含 NTES_YD_PASSPORT 等
 *
 * ============== 获取Cookie ==============
 * 手机登录网易大神网页版会员中心 (vip.ds.163.com), 浏览触发 userInfo 请求即可自动捕获
 *
 * ============== 签名算法 (逆向自 umi.1e89078b.js) ==============
 *   GL-XSRF-TOKEN = 首次请求服务端 Set-Cookie 下发, 脚本首请求自动捕获, 全程复用
 *   GL-CheckSum   = SHA1_hex( JSON.stringify(body) + xsrfToken )
 *   GL-DeviceId   = 每账号随机 uuidv4, 一次生成全程复用
 *   GL-Uid        = env 里的 userId
 *   GL-ClientType = 60 (web 固定)
 *   认证: cookie 只需 JSESSIONID
 */

// ======================== SHA1 (纯 JS 实现) ========================
function sha1_hex(msg) {
    function rl(n, s) { return (n << s) | (n >>> (32 - s)); }
    function hx(val) {
        var s = "";
        for (var i = 7; i >= 0; i--) s += ((val >>> (i * 4)) & 0x0f).toString(16);
        return s;
    }
    function utf8(str) {
        str = str.replace(/\r\n/g, "\n");
        var u = "";
        for (var n = 0; n < str.length; n++) {
            var c = str.charCodeAt(n);
            if (c < 128) u += String.fromCharCode(c);
            else if (c < 2048) { u += String.fromCharCode((c >> 6) | 192); u += String.fromCharCode((c & 63) | 128); }
            else { u += String.fromCharCode((c >> 12) | 224); u += String.fromCharCode(((c >> 6) & 63) | 128); u += String.fromCharCode((c & 63) | 128); }
        }
        return u;
    }
    var W = new Array(80);
    var H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
    var A, B, C, D, E, T;
    msg = utf8(msg);
    var len = msg.length, wa = [];
    for (var i = 0; i < len - 3; i += 4) wa.push(msg.charCodeAt(i) << 24 | msg.charCodeAt(i + 1) << 16 | msg.charCodeAt(i + 2) << 8 | msg.charCodeAt(i + 3));
    switch (len % 4) {
        case 0: i = 0x080000000; break;
        case 1: i = msg.charCodeAt(len - 1) << 24 | 0x0800000; break;
        case 2: i = msg.charCodeAt(len - 2) << 24 | msg.charCodeAt(len - 1) << 16 | 0x08000; break;
        case 3: i = msg.charCodeAt(len - 3) << 24 | msg.charCodeAt(len - 2) << 16 | msg.charCodeAt(len - 1) << 8 | 0x80; break;
    }
    wa.push(i);
    while (wa.length % 16 != 14) wa.push(0);
    wa.push(len >>> 29); wa.push((len << 3) & 0x0fffffff);
    for (var bs = 0; bs < wa.length; bs += 16) {
        for (i = 0; i < 16; i++) W[i] = wa[bs + i];
        for (i = 16; i <= 79; i++) W[i] = rl(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
        A = H0; B = H1; C = H2; D = H3; E = H4;
        for (i = 0; i <= 19; i++) { T = (rl(A, 5) + ((B & C) | (~B & D)) + E + W[i] + 0x5A827999) & 0x0ffffffff; E = D; D = C; C = rl(B, 30); B = A; A = T; }
        for (i = 20; i <= 39; i++) { T = (rl(A, 5) + (B ^ C ^ D) + E + W[i] + 0x6ED9EBA1) & 0x0ffffffff; E = D; D = C; C = rl(B, 30); B = A; A = T; }
        for (i = 40; i <= 59; i++) { T = (rl(A, 5) + ((B & C) | (B & D) | (C & D)) + E + W[i] + 0x8F1BBCDC) & 0x0ffffffff; E = D; D = C; C = rl(B, 30); B = A; A = T; }
        for (i = 60; i <= 79; i++) { T = (rl(A, 5) + (B ^ C ^ D) + E + W[i] + 0xCA62C1D6) & 0x0ffffffff; E = D; D = C; C = rl(B, 30); B = A; A = T; }
        H0 = (H0 + A) & 0x0ffffffff; H1 = (H1 + B) & 0x0ffffffff; H2 = (H2 + C) & 0x0ffffffff; H3 = (H3 + D) & 0x0ffffffff; H4 = (H4 + E) & 0x0ffffffff;
    }
    return hx(H0) + hx(H1) + hx(H2) + hx(H3) + hx(H4);
}

// ======================== Env.js (兼容 Surge/QuantumultX/Loon) ========================
function Env(t) {
    return new (class {
        constructor(t) {
            this.name = t;
            this.startTime = new Date().getTime();
            this.notifyMsg = [];
            // 平台检测
            this.isNode = typeof module !== "undefined" && !!module.exports;
            this.isSurge = typeof $httpClient !== "undefined" && typeof $surge !== "undefined";
            this.isQuanX = typeof $task !== "undefined";
            this.isLoon = typeof $loon !== "undefined";
            // HTTP 客户端 — QX 用 $task.fetch, Surge/Loon 用 $httpClient
            if (this.isQuanX) {
                this.http = {
                    get: (opts) => this._taskFetch("GET", opts),
                    post: (opts) => this._taskFetch("POST", opts),
                };
            } else {
                this.http = {
                    get: (opts) => this._httpClient("GET", opts),
                    post: (opts) => this._httpClient("POST", opts),
                };
            }
        }

        // QuantumultX: $task.fetch
        _taskFetch(method, opts) {
            return new Promise((resolve, reject) => {
                $task.fetch(Object.assign({}, opts, { method: method })).then(
                    (response) => resolve({ status: response.statusCode, headers: response.headers, body: response.body }),
                    (reason) => reject(reason)
                );
            });
        }

        // Surge / Loon: $httpClient
        _httpClient(method, opts) {
            return new Promise((resolve, reject) => {
                var handler = (error, response, body) => {
                    if (error) return reject(error);
                    resolve({ status: response.status, headers: response.headers, body: body });
                };
                if (method === "GET") $httpClient.get(opts, handler);
                else $httpClient.post(opts, handler);
            });
        }

        log(...t) { console.log(t.map(t => t).join("\n")); }
        info(...t) { console.log(t.map(t => t).join("\n")); }
        error(...t) { console.log(`❗️ ${t.map(t => t).join("\n")}`); }
        msg(t, s, i, o) {
            if (this.isSurge || this.isLoon) { $notification.post(t, s, i, o); }
            else if (this.isQuanX) { $notify(t, s, i, o); }
            else { console.log(`${t}\n${s}\n${i || ""}`); }
        }
        logErr(e) { console.log(`❗️ ${this.name} 运行错误: ${(e && e.message) ? e.message : String(e)}`); }
        toObj(t, e = null) { try { return JSON.parse(t); } catch { return e; } }
        toStr(t, e = null) { try { return JSON.stringify(t); } catch { return e; } }
        queryStr(t) {
            if (!t) return "";
            var r = [];
            for (var k in t) { var v = t[k]; if (v != null && v !== "") r.push(k + "=" + encodeURIComponent(v)); }
            return r.join("&");
        }
        setdata(t, e) {
            try { if (typeof $persistentStore != "undefined" && $persistentStore) { var r = $persistentStore.write(t, e); if (r) return r; } } catch (err) {}
            try { if (typeof $prefs != "undefined" && $prefs) { return $prefs.setValueForKey(t, e); } } catch (err) {}
            return false;
        }
        getdata(e) {
            try { if (typeof $persistentStore != "undefined" && $persistentStore) { var v = $persistentStore.read(e); if (v) return v; } } catch (err) {}
            if (typeof $prefs != "undefined" && $prefs) {
                var methods = ["stringForKey", "objectForKey", "getValueForKey", "valueForKey"];
                for (var i = 0; i < methods.length; i++) {
                    try { var v = $prefs[methods[i]](e); if (v) return v; } catch (err) {}
                }
            }
            return null;
        }
        setjson(t, e) { return this.setdata(JSON.stringify(t), e); }
        getjson(e, t = null) { var s = this.getdata(e); return s ? this.toObj(s, t) : t; }
        wait(t) { return new Promise(e => setTimeout(e, t)); }
        done(t = {}) { if (typeof $done != "undefined") $done(t); }
    })(t);
}

const $ = new Env("网易大神会员外卖券");

// ======================== 常量 ========================
const UA = "Mozilla/5.0 (iPad; CPU OS 17_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/133.0.6943.120 Mobile/15E148 Safari/604.1";
const BASE_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://vip.ds.163.com",
    "Referer": "https://vip.ds.163.com/",
    "GL-ClientType": "60",
    "Content-Type": "application/json;charset=UTF-8",
};
const INFO_URL = "https://inf.ds.163.com/v1/web/exp-vip/external/super-coupon/info";
const GRANT_URL = "https://inf.ds.163.com/v1/web/exp-vip/external/super-coupon/grant";
const GRANT_STATUS_URL = "https://inf.ds.163.com/v1/web/exp-vip/external/super-coupon/grant-status";
const USERINFO_URL = "https://inf.ds.163.com/v1/web/base/mine/userInfo";
const KEYWORD = "外卖券";
const TIMEOUT = 15000;
const ckName = "wyds_data";
const userCookie = $.getjson(ckName, []);

// ======================== 工具函数 ========================
function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function nowTs() {
    var d = new Date();
    var p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(msg) { console.log(`[${nowTs()}] ${msg}`); }

function glChecksum(body, token) {
    return sha1_hex(JSON.stringify(body) + token);
}

// 大小写无关地读取 header 值 (兼容 HTTP/1 Pascal-Case / HTTP/2 lowercase)
function getHeader(headers, name) {
    if (!headers) return "";
    var lower = name.toLowerCase();
    var keys = Object.keys(headers);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === lower) return headers[keys[i]] || "";
    }
    return "";
}

// 从响应头提取 Set-Cookie 中的 GL-XSRF-TOKEN
function extractXsrf(headers) {
    if (!headers) return null;
    var setCookie = "";
    var keys = Object.keys(headers);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === "set-cookie") { setCookie = headers[keys[i]]; break; }
    }
    if (Array.isArray(setCookie)) setCookie = setCookie.join("; ");
    var m = String(setCookie).match(/GL-XSRF-TOKEN=([^;]+)/i);
    return m ? m[1] : null;
}

// ======================== getCookie (从请求头捕获) ========================
async function getCookie() {
    try {
        if ($request && $request.method === "OPTIONS") return;

        var rawHeaders = ($request && $request.headers) ? $request.headers : {};
        var cookie = getHeader(rawHeaders, "cookie");
        var jsidMatch = cookie.match(/JSESSIONID=([^;]+)/);
        var userId = getHeader(rawHeaders, "gl-uid");
        var xsrfToken = getHeader(rawHeaders, "gl-x-xsrf-token");
        if (!xsrfToken) {
            var xsrfMatch = cookie.match(/GL-XSRF-TOKEN=([^;]+)/);
            if (xsrfMatch) xsrfToken = xsrfMatch[1];
        }
        var deviceId = getHeader(rawHeaders, "gl-deviceid");

        if (!jsidMatch || !userId) throw new Error("获取Cookie失败！参数缺失 (需 JSESSIONID + GL-Uid)");

        var token = jsidMatch[1];
        var userName = userId.slice(0, 6) + "..";
        var newData = { userId: userId, token: token, userName: userName };
        if (xsrfToken) newData.xsrfToken = xsrfToken;
        if (deviceId) newData.deviceId = deviceId;
        // 存储完整 Cookie (含 NTES_YD_PASSPORT 等, 领券接口需要)
        if (cookie) newData.cookie = cookie;

        var index = userCookie.findIndex(function (e) { return e.userId === newData.userId; });
        if (index >= 0) {
            newData = Object.assign({}, userCookie[index], newData);
            userCookie[index] = newData;
        } else {
            userCookie.push(newData);
        }

        $.setjson(userCookie, ckName);
        $.msg($.name, `🎉账号[${userName}]更新Cookie成功!`, ``);
        log(`捕获 Cookie: userId=${userId}, JSESSIONID=${token.slice(0, 8)}...` + (xsrfToken ? `, XSRF=${xsrfToken.slice(0, 8)}...` : "") + (deviceId ? `, DeviceId=${deviceId.slice(0, 8)}...` : ""));
    } catch (e) {
        $.logErr(e);
        $.msg($.name, "❌ 获取Cookie失败", e.message || String(e));
    }
}

// ======================== 单账号客户端 ========================
class WydsClient {
    constructor(userId, jsessionid, name, xsrfToken, deviceId, fullCookie) {
        this.userId = userId;
        this.name = name || userId;
        this.jsessionid = jsessionid;
        this.deviceId = deviceId || uuidv4();
        this.xsrfToken = xsrfToken || null;
        // 优先使用完整 Cookie (含 NTES_YD_PASSPORT 等), 否则只用 JSESSIONID
        this.baseCookie = fullCookie || `JSESSIONID=${jsessionid}`;
        this.headers = Object.assign({}, BASE_HEADERS, {
            "GL-DeviceId": this.deviceId,
            "GL-Uid": userId,
            "Cookie": this.baseCookie,
        });
        if (this.xsrfToken) {
            this.headers["GL-X-XSRF-TOKEN"] = this.xsrfToken;
            // 确保 Cookie 中包含最新的 XSRF token
            this.headers["Cookie"] = this._mergeXsrfCookie(this.baseCookie, this.xsrfToken);
        }
    }

    _mergeXsrfCookie(cookie, token) {
        // 替换或追加 GL-XSRF-TOKEN 到 cookie 字符串
        if (cookie.indexOf("GL-XSRF-TOKEN=") >= 0) {
            return cookie.replace(/GL-XSRF-TOKEN=[^;]*/, "GL-XSRF-TOKEN=" + token);
        }
        return cookie + "; GL-XSRF-TOKEN=" + token;
    }

    captureXsrf(headers) {
        var token = extractXsrf(headers);
        if (token) {
            this.xsrfToken = token;
            this.headers["GL-X-XSRF-TOKEN"] = token;
            this.headers["Cookie"] = this._mergeXsrfCookie(this.baseCookie, token);
        }
    }

    async bootstrap() {
        try {
            var res = await $.http.get({ url: USERINFO_URL, headers: this.headers, timeout: TIMEOUT });
        } catch (e) { log(`  ✗ 网络异常: ${e}`); return false; }
        this.captureXsrf(res.headers);
        if (!this.xsrfToken) { log("  ✗ 未捕获到 GL-XSRF-TOKEN (Set-Cookie 缺失)"); return false; }
        var data = $.toObj(res.body);
        if (!data) { log(`  ✗ userInfo 响应非 JSON (HTTP ${res.status})`); return false; }
        if (data.code !== 200) { log(`  ✗ 登录态失效: code=${data.code} ${data.errmsg || ""}`); return false; }
        var nick = ((data.result || {}).user || {}).nick || "-";
        log(`  ✓ 会话有效 (昵称: ${nick})`);
        return true;
    }

    async postSigned(url, body) {
        this.headers["GL-CheckSum"] = glChecksum(body, this.xsrfToken || "");
        try {
            var res = await $.http.post({ url: url, headers: this.headers, body: JSON.stringify(body), timeout: TIMEOUT });
        } catch (e) { return { error: String(e), status: 0, headers: {}, body: "" }; }
        if (res.headers) this.captureXsrf(res.headers);
        return res;
    }

    async fetchCouponInfo() {
        var res = await this.postSigned(INFO_URL, {});
        if (res.error || !res.status || res.status !== 200) return [null, `HTTP ${res.status || res.error}`];
        var data = $.toObj(res.body);
        if (!data) return [null, "响应非 JSON"];
        if (data.code !== 200) return [null, `code=${data.code} ${data.errmsg || ""}`];
        return [data.result || {}, null];
    }

    async grant(brandId, couponId) {
        // phoneBizType 必填, 配合完整 Cookie (含 P_INFO 手机号) 不会触发绑定验证
        var body = { brandId: brandId, superCouponId: couponId, phoneBizType: "VIP" };
        var res = await this.postSigned(GRANT_URL, body);
        if (res.error || !res.status || res.status !== 200) return { ok: false, msg: `HTTP ${res.status || res.error}` };
        var data = $.toObj(res.body);
        if (!data) return { ok: false, msg: "响应非 JSON" };
        var code = data.code;
        if (code === 200) return { ok: true, msg: "领取成功" };
        var errmsg = data.errmsg || String(code);
        if (code === 60001 || errmsg.indexOf("已抢光") >= 0) return { ok: false, msg: "库存已抢光" };
        if (errmsg.indexOf("已领取") >= 0 || code === 60002) return { ok: true, msg: "今日已领取" };
        return { ok: false, msg: errmsg };
    }

    // 查询券领取状态 (抓包: POST grant-status, body={"superCouponIds":["id1","id2"]})
    async checkGrantStatus(couponIds) {
        if (!couponIds || couponIds.length === 0) return {};
        var body = { superCouponIds: couponIds };
        var res = await this.postSigned(GRANT_STATUS_URL, body);
        if (res.error || !res.status || res.status !== 200) return {};
        var data = $.toObj(res.body);
        if (!data || data.code !== 200) return {};
        // 返回 { couponId: status, ... }
        var statusMap = {};
        var list = (data.result || {}).superCoupons || data.result || [];
        if (Array.isArray(list)) {
            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                if (item.superCouponId) statusMap[item.superCouponId] = item;
            }
        }
        return statusMap;
    }
}

// ======================== 主流程 ========================
async function runAccount(idx, acc, stats) {
    var userId = String(acc.userId || "").trim();
    var token = String(acc.token || "").trim();
    var name = String(acc.userName || "").trim() || (userId ? userId.slice(0, 6) + ".." : `账号${idx}`);
    log(`── 账号${idx} [${name}] ──`);
    if (!userId || !token) {
        log("  ✗ 缺少 userId/token, 跳过");
        stats.push({ name: name, got: 0, detail: "配置缺失" });
        return;
    }
    var cli = new WydsClient(userId, token, name, acc.xsrfToken, acc.deviceId, acc.cookie);
    log(`  Cookie: ${cli.headers["Cookie"].slice(0, 60)}...`);
    if (!await cli.bootstrap()) {
        stats.push({ name: name, got: 0, detail: "登录失效" });
        return;
    }
    var info = await cli.fetchCouponInfo();
    if (info[1]) {
        log(`  ✗ 券信息查询失败: ${info[1]}`);
        stats.push({ name: name, got: 0, detail: `查询失败:${info[1]}` });
        return;
    }
    info = info[0];
    var coupons = [];
    for (var bi = 0; bi < (info.brands || []).length; bi++) {
        var brand = info.brands[bi];
        for (var ci = 0; ci < (brand.superCoupons || []).length; ci++) {
            coupons.push({ brand: brand, coupon: brand.superCoupons[ci] });
        }
    }
    var targets = coupons.filter(function (item) { return (item.coupon.couponName || "").indexOf(KEYWORD) >= 0; });
    log(`  共 ${coupons.length} 张券, 含'${KEYWORD}' ${targets.length} 张`);

    // 查询已领取状态, 跳过已领的券
    var targetIds = targets.map(function (t) { return t.coupon.couponId; });
    var statusMap = {};
    if (targetIds.length > 0) {
        statusMap = await cli.checkGrantStatus(targetIds);
    }

    var got = 0;
    var detail = [];
    for (var ti = 0; ti < targets.length; ti++) {
        var brand = targets[ti].brand;
        var c = targets[ti].coupon;
        var cname = c.couponName || "";
        var cid = c.couponId || "";

        // 检查是否已领取
        var st = statusMap[cid];
        if (st && (st.grantStatus === 1 || st.received)) {
            got++;
            detail.push(`✓ ${cname}(已领)`);
            log(`  ⊙ 已领取: ${cname}`);
            continue;
        }

        log(`  → 领取: ${cname}`);
        var result = await cli.grant(brand.brandId, cid);
        if (result.ok) {
            got++;
            detail.push(`✓ ${cname}`);
            log(`    ${result.msg}`);
        } else {
            detail.push(`✗ ${cname}(${result.msg})`);
            log(`    ✗ ${result.msg}`);
        }
        await $.wait(1000);
    }
    stats.push({ name: name, got: got, detail: detail });
    log(`  小计: 成功 ${got}/${targets.length}`);
}

async function main() {
    if (!userCookie || userCookie.length === 0) {
        log("未读取到账号, 请配置环境变量 wyds_data 或通过 MITM 捕获 Cookie");
        $.msg($.name, "❌ 未配置账号", "请配置环境变量 wyds_data 或通过 MITM 捕获 Cookie");
        return;
    }
    log(`开始执行, 共 ${userCookie.length} 个账号`);
    var stats = [];
    for (var i = 0; i < userCookie.length; i++) {
        try {
            await runAccount(i + 1, userCookie[i], stats);
        } catch (e) {
            log(`  ✗ 账号${i + 1} 异常: ${e}`);
            stats.push({ name: `账号${i + 1}`, got: 0, detail: [`异常:${e}`] });
        }
    }
    var lines = [];
    var totalGot = 0;
    var totalTargets = 0;
    for (var si = 0; si < stats.length; si++) {
        var s = stats[si];
        totalGot += s.got;
        var d = s.detail;
        if (Array.isArray(d)) {
            totalTargets += d.length;
            d = d.length > 0 ? d.join("\n  ") : "无目标券";
        }
        lines.push(`【${s.name}】${s.got}张\n  ${d}`);
    }
    var summary = lines.join("\n\n");
    log("执行完成");
    $.msg($.name, `✅ 成功${totalGot}张`, summary);
}

// ======================== 捕获 grant 请求体 (调试用) ========================
async function captureGrant() {
    try {
        if ($request && $request.method === "OPTIONS") return;
        var url = ($request && $request.url) || "";
        var body = ($request && $request.body) || "";
        var rawHeaders = ($request && $request.headers) ? $request.headers : {};
        // 打印完整的 grant 请求信息
        console.log(`\n========== [GRANT 捕获] ==========`);
        console.log(`URL: ${url}`);
        console.log(`Method: ${($request && $request.method) || "?"}`);
        console.log(`Body: ${body}`);
        // 打印所有 GL-* 头
        var keys = Object.keys(rawHeaders);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase().indexOf("gl-") === 0) {
                console.log(`Header: ${keys[i]}: ${rawHeaders[keys[i]]}`);
            }
        }
        console.log(`===================================\n`);
        $.msg($.name, "📋 grant 请求已捕获", "请查看日志中的 Body 内容");
    } catch (e) {
        console.log(`捕获 grant 异常: ${e}`);
    }
}

// ======================== 入口 ========================
!(async () => {
    if (typeof $request !== "undefined" && $request && $request.headers) {
        var reqUrl = ($request && $request.url) || "";
        if (reqUrl.indexOf("super-coupon/grant") >= 0) {
            // 捕获 grant 请求体
            await captureGrant();
        } else {
            // 捕获 userInfo 请求头 → getCookie
            await getCookie();
        }
    } else {
        await main();
    }
})()
    .catch((e) => { $.logErr(e); $.msg($.name, "❌ script run error!", (e && e.message) ? e.message : String(e)); })
    .finally(() => $.done());
