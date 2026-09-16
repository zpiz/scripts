/*
------------------------------------------
@Date: 2026.09.16
@Description: 中国移动 App「设备指纹登录」请求体抓取
============================================================
【Quantumult X 模板】直接复制到 QX 的 [rewrite_local] / [MITM]
============================================================
[rewrite_local]
^https:\/\/client\.app\.coc\.10086\.cn\/biz-orange\/LN\/uamrandcodelogin\/fingerprintLogin url script-request-body https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Quantumultx/cmcc.js

[MITM]
hostname = client.app.coc.10086.cn

============================================================
【Surge / Loon / Shadowrocket 模板】二选一，用不上就删掉
============================================================
[Script]
中国移动指纹登录 = type=http-request,pattern=^https:\/\/client\.app\.coc\.10086\.cn\/biz-orange\/LN\/uamrandcodelogin\/fingerprintLogin,requires-body=1,max-size=0,script-path=https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Quantumultx/cmcc.js

[MITM]
hostname = client.app.coc.10086.cn

============================================================
【使用步骤】
1. 把上面的模板里的脚本地址换成你自己的 raw 地址（Gist / 仓库均可）；
2. 打开 QX 的 MITM 开关，信任证书；
3. 打开「中国移动」App 触发一次指纹/免密登录；
4. QX 会弹通知，数据已落盘：
     cmcc_data         —— 请求体原文（AES-CBC 加密后的 base64），青龙变量名同此
     cmcc_data_dec     —— 解密后的 JSON 明文（含 tel / xk / devToken / ctid 等）
     cmcc_data_headers —— 同期请求头（x-sign / x-token / xs / x-time / x-nonce / Cookie）
5. 在 QX 的「数据」里查看，或复制到青龙环境变量。
============================================================
⚠️【免责声明】
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的设备中完全删除。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
------------------------------------------
*/
const $ = new Env("中国移动-指纹登录");
const ckName = "cmcc_data";                 // 请求体原文
const ckNameDec = "cmcc_data_dec";          // 解密后明文
const ckNameHdr = "cmcc_data_headers";      // 同期请求头

// App 原生请求体加解密常量（与 cmcc_applottory.py 的 encrypt_payload/decrypt_payload 一致）
const REQ_KEY_B64 = "dFZrZGFSV1JZMFprVjFWcg==";   // b97 base64 -> "tVkdaRWRY0ZkV1Vr"
const REQ_IV_B64 = "VmpGU1ExWnRWa1F4UlRsUQ==";    // base64 -> "VjFSQ1ZtVkQxRTlQ"

/* ==========================================================================
 * 一、AES-128-CBC 纯 JS 实现（QX 无 crypto 模块，表由代码生成，避免手抄错）
 * ========================================================================== */

// GF(2^8) 乘法表
const GF_MUL = (function () {
    const table = [];
    for (let a = 0; a < 256; a++) {
        const row = new Array(256);
        for (let x = 0; x < 256; x++) {
            let res = 0, m = a, n = x;
            for (let i = 0; i < 8; i++) {
                if (n & 1) res ^= m;
                const hi = m & 0x80;
                m = (m << 1) & 0xff;
                if (hi) m ^= 0x1b;
                n >>= 1;
            }
            row[x] = res;
        }
        table.push(row);
    }
    return table;
})();

// S 盒 / 逆 S 盒（仿射变换生成）
const SBOX = (function () {
    const inv = new Array(256).fill(0);
    for (let a = 1; a < 256; a++) {
        for (let b = 1; b < 256; b++) {
            if (GF_MUL[a][b] === 1) { inv[a] = b; break; }
        }
    }
    const s = new Array(256);
    for (let a = 0; a < 256; a++) {
        const x = inv[a];
        let y = 0;
        for (let b = 0; b < 8; b++) {
            const bit = ((x >> b) & 1) ^ ((x >> ((b + 4) % 8)) & 1) ^ ((x >> ((b + 5) % 8)) & 1)
                ^ ((x >> ((b + 6) % 8)) & 1) ^ ((x >> ((b + 7) % 8)) & 1) ^ ((0x63 >> b) & 1);
            y |= bit << b;
        }
        s[a] = y & 0xff;
    }
    return s;
})();
const INV_SBOX = (function () {
    const r = new Array(256);
    for (let i = 0; i < 256; i++) r[SBOX[i]] = i;
    return r;
})();

const RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function expandKey(key) {
    const Nk = 4, Nr = 10;
    const w = [];
    for (let i = 0; i < Nk; i++) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
    for (let i = Nk; i < 4 * (Nr + 1); i++) {
        let t = w[i - 1].slice();
        if (i % Nk === 0) {
            t = [t[1], t[2], t[3], t[0]].map(v => SBOX[v]);
            t[0] ^= RCON[i / Nk];
        }
        w.push(w[i - Nk].map((v, j) => v ^ t[j]));
    }
    return w;
}

// 轮密钥展开成 state 布局：rk[4c + r] = w[4*round + c][r]
function roundKey(w, round) {
    const rk = new Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) rk[4 * c + r] = w[4 * round + c][r];
    }
    return rk;
}

function addRK(s, rk) { for (let i = 0; i < 16; i++) s[i] ^= rk[i]; }

function subBytes(s) { for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]; }
function invSubBytes(s) { for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; }

function shiftRows(s) {
    const t = s.slice();
    for (let r = 1; r < 4; r++) {
        for (let c = 0; c < 4; c++) s[4 * c + r] = t[4 * ((c + r) % 4) + r];
    }
}
function invShiftRows(s) {
    const t = s.slice();
    for (let r = 1; r < 4; r++) {
        for (let c = 0; c < 4; c++) s[4 * c + r] = t[4 * ((c - r + 4) % 4) + r];
    }
}

function mixColumns(s) {
    for (let c = 0; c < 4; c++) {
        const a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
        s[4 * c] = GF_MUL[2][a0] ^ GF_MUL[3][a1] ^ a2 ^ a3;
        s[4 * c + 1] = a0 ^ GF_MUL[2][a1] ^ GF_MUL[3][a2] ^ a3;
        s[4 * c + 2] = a0 ^ a1 ^ GF_MUL[2][a2] ^ GF_MUL[3][a3];
        s[4 * c + 3] = GF_MUL[3][a0] ^ a1 ^ a2 ^ GF_MUL[2][a3];
    }
}
function invMixColumns(s) {
    for (let c = 0; c < 4; c++) {
        const a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
        s[4 * c] = GF_MUL[14][a0] ^ GF_MUL[11][a1] ^ GF_MUL[13][a2] ^ GF_MUL[9][a3];
        s[4 * c + 1] = GF_MUL[9][a0] ^ GF_MUL[14][a1] ^ GF_MUL[11][a2] ^ GF_MUL[13][a3];
        s[4 * c + 2] = GF_MUL[13][a0] ^ GF_MUL[9][a1] ^ GF_MUL[14][a2] ^ GF_MUL[11][a3];
        s[4 * c + 3] = GF_MUL[11][a0] ^ GF_MUL[13][a1] ^ GF_MUL[9][a2] ^ GF_MUL[14][a3];
    }
}

function encryptBlock(input, w) {
    const s = input.slice();
    addRK(s, roundKey(w, 0));
    for (let round = 1; round <= 9; round++) {
        subBytes(s); shiftRows(s); mixColumns(s); addRK(s, roundKey(w, round));
    }
    subBytes(s); shiftRows(s); addRK(s, roundKey(w, 10));
    return s;
}

function decryptBlock(input, w) {
    const s = input.slice();
    addRK(s, roundKey(w, 10));
    for (let round = 9; round >= 1; round--) {
        invShiftRows(s); invSubBytes(s); addRK(s, roundKey(w, round)); invMixColumns(s);
    }
    invShiftRows(s); invSubBytes(s); addRK(s, roundKey(w, 0));
    return s;
}

/* ---------------- 编解码工具 ---------------- */

const B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64ToBytes(str) {
    const s = String(str || '').replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
        const v = B64C.indexOf(s[i]);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
    }
    return out;
}

function bytesToB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        out += B64C[b0 >> 2];
        out += B64C[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
        out += b1 === undefined ? '=' : B64C[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
        out += b2 === undefined ? '=' : B64C[b2 & 63];
    }
    return out;
}

function utf8ToBytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(++i);
            c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
            out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
}

function bytesToUtf8(bytes) {
    let s = '', i = 0;
    while (i < bytes.length) {
        const b = bytes[i++];
        if (b < 0x80) s += String.fromCharCode(b);
        else if (b < 0xe0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (b < 0xf0) s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else {
            const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
            const u = cp - 0x10000;
            s += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
        }
    }
    return s;
}

/* ---------------- 对外：加解密 ---------------- */

// AES-128-CBC 解密 -> 明文字符串（PKCS7 去填充）
function decryptPayload(base64Text) {
    const key = b64ToBytes(REQ_KEY_B64);
    const iv = b64ToBytes(REQ_IV_B64);
    const ct = b64ToBytes(String(base64Text || '').trim());
    if (ct.length < 16 || ct.length % 16 !== 0) throw new Error("密文长度非法: " + ct.length);
    const w = expandKey(key);
    let prev = iv, out = [];
    for (let i = 0; i < ct.length; i += 16) {
        const block = ct.slice(i, i + 16);
        const plain = decryptBlock(block, w);
        for (let j = 0; j < 16; j++) out.push(plain[j] ^ prev[j]);
        prev = block;
    }
    const padLen = out[out.length - 1];
    if (padLen >= 1 && padLen <= 16 && out.length >= padLen) out = out.slice(0, out.length - padLen);
    return bytesToUtf8(out);
}

// AES-128-CBC 加密（供改造后重放使用）
function encryptPayload(plainText) {
    const key = b64ToBytes(REQ_KEY_B64);
    const iv = b64ToBytes(REQ_IV_B64);
    let data = utf8ToBytes(String(plainText));
    const padLen = 16 - (data.length % 16);
    for (let i = 0; i < padLen; i++) data.push(padLen);
    const w = expandKey(key);
    let prev = iv;
    const out = [];
    for (let i = 0; i < data.length; i += 16) {
        const block = data.slice(i, i + 16).map((v, j) => v ^ prev[j]);
        const ct = encryptBlock(block, w);
        for (let j = 0; j < 16; j++) out.push(ct[j]);
        prev = ct;
    }
    return bytesToB64(out);
}

/* ==========================================================================
 * 二、抓取逻辑（参考 blueDash.js 的 getCookie 写法）
 * ========================================================================== */
async function getCookie() {
    try {
        if ($request && $request.method === 'OPTIONS') return;   // 预检请求直接跳过

        // ---- 1. 取请求体原文 ----
        let body = $request?.body;
        if (body == null) body = $request?.['body'];
        if (body && typeof body !== 'string') body = $.toStr(body) || '';
        body = String(body || '').trim();
        if (body.length < 16) throw new Error("未捕获到 fingerprintLogin 请求体（body 为空）");

        // ---- 2. 同期请求头（重算签名时需要对照） ----
        const h = ObjectKeys2LowerCase($request?.headers || {});
        const headers = {
            'content-type': h['content-type'] || 'application/json',
            'x-sign': h['x-sign'] || '',
            'x-time': h['x-time'] || '',
            'xs': h['xs'] || '',
            'x-qen': h['x-qen'] || '',
            'x-nonce': h['x-nonce'] || '',
            'x-token': h['x-token'] || '',
            'cookie': h['cookie'] || ''
        };

        // ---- 3. 解密，便于直接阅读 ----
        let dec = null, decText = '', tel = '', xk = '';
        try {
            decText = decryptPayload(body);
            dec = $.toObj(decText);
            tel = dec?.tel || dec?.reqBody?.cellNum || '';
            xk = dec?.xk || '';
        } catch (e) {
            decText = '';
            dec = null;
            $.log(`[warn] 解密失败（不影响原文保存）: ${e.message || e}`);
        }

        // ---- 4. 落盘到变量 ----
        $.setdata(body, ckName);
        $.setdata(decText, ckNameDec);
        $.setjson(headers, ckNameHdr);

        // ---- 5. 输出 ----
        if (dec) {
            $.log(`\n--- 解密后的请求体 ---\n${JSON.stringify(dec, null, 2)}\n`);
        }
        $.msg($.name,
            `✅ 已捕获请求体（${body.length} 字节）`,
            [
                tel ? `手机号: ${tel}` : '',
                xk ? `xk: ${xk.slice(0, 24)}...` : '',
                dec ? '解密: 成功' : '解密: 失败',
                `已写入变量: ${ckName} / ${ckNameDec} / ${ckNameHdr}`
            ].filter(Boolean).join('\n')
        );
    } catch (e) {
        throw e;
    }
}

// 作为定时任务运行时：只展示已捕获的数据
async function main() {
    const raw = $.getdata(ckName) || '';
    const dec = $.getdata(ckNameDec) || '';
    if (!raw) {
        $.log(`未找到变量 ${ckName}，请先按脚本头部注释配置 QX 抓取。`);
        $.msg($.name, `⚠️ 尚未捕获数据`, `变量 ${ckName} 为空`);
        return;
    }
    $.log(`\n--- ${ckName}（${raw.length} 字节）---\n${raw}\n`);
    if (dec) $.log(`--- ${ckNameDec} ---\n${dec}\n`);
    $.msg($.name, `当前缓存数据`, `原文 ${raw.length} 字节；解密${dec ? '成功' : '为空'}`);
}

/* ==========================================================================
 * 三、入口
 * ========================================================================== */
!(async () => {
    if (typeof $request != "undefined") {
        await getCookie();
    } else {
        await main();
    }
})()
    .catch((e) => { $.logErr(e), $.msg($.name, `⛔️ 运行出错`, e.message || String(e)) })
    .finally(() => $.done());

/** ---------------------------------固定不动区域----------------------------------------- */
function ObjectKeys2LowerCase(obj) {
    return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [String(k).toLowerCase(), v]));
}

//From chavyleung's Env.js（精简版，够本脚本使用）
function Env(name, opts) {
    class Http {
        constructor(env) { this.env = env }
        send(options, method = 'GET') {
            options = typeof options === 'string' ? { url: options } : options;
            const fn = method.toUpperCase() === 'POST' ? this.post : this.get;
            return new Promise((resolve, reject) => {
                fn.call(this, options, (err, resp, data) => err ? reject(err) : resolve(data));
            });
        }
        get(options) { return this.send.call(this.env, options) }
        post(options) { return this.send.call(this.env, options, 'POST') }
    }
    return new (class {
        constructor(name, option) {
            this.name = name;
            this.http = new Http(this);
            this.data = null;
            this.logs = [];
            this.isMute = false;
            Object.assign(this, option);
            this.log("", `🔔 ${this.name}, 开始!`);
        }
        getEnv() {
            if (typeof $environment !== 'undefined' && $environment['surge-version']) return 'Surge';
            if (typeof $environment !== 'undefined' && $environment['stash-version']) return 'Stash';
            if (typeof module !== 'undefined' && module.exports) return 'Node.js';
            if (typeof $task !== 'undefined') return 'Quantumult X';
            if (typeof $loon !== 'undefined') return 'Loon';
            if (typeof $rocket !== 'undefined') return 'Shadowrocket';
            return undefined;
        }
        isNode() { return this.getEnv() === 'Node.js' }
        isQuanX() { return this.getEnv() === 'Quantumult X' }
        isSurge() { return this.getEnv() === 'Surge' }
        isLoon() { return this.getEnv() === 'Loon' }
        isShadowrocket() { return this.getEnv() === 'Shadowrocket' }
        toObj(str, def = null) { try { return JSON.parse(str) } catch (e) { return def } }
        toStr(obj, def = null) { try { return JSON.stringify(obj) } catch (e) { return def } }
        log(...args) { const s = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '); this.logs.push(s); console.log(s) }
        logErr(err) { this.log('ERROR:', err?.message || err) }
        wait(ms) { return new Promise(r => setTimeout(r, ms)) }
        setdata(val, key) {
            const value = String(val);
            if (this.isQuanX()) return $prefs.setValueForKey(value, key);
            if (this.isNode()) {
                // 与 chavyleung Env.js 保持一致：以工作目录为存储位置
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const file = path.resolve(process.cwd(), 'box.dat');
                    let box = {};
                    try { box = JSON.parse(fs.readFileSync(file, 'utf8')) || {} } catch (e) { }
                    box[key] = value;
                    fs.writeFileSync(file, JSON.stringify(box), 'utf8');
                    return true;
                } catch (e) { return false }
            }
            if (typeof $persistentStore !== 'undefined') return $persistentStore.write(value, key);
            return false;
        }
        getdata(key) {
            if (this.isQuanX()) return $prefs.valueForKey(key);
            if (this.isNode()) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const box = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'box.dat'), 'utf8')) || {};
                    return box[key];
                } catch (e) { return null }
            }
            if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key);
            return null;
        }
        setjson(val, key) { return this.setdata(this.toStr(val), key) }
        getjson(key, def = null) { try { return JSON.parse(this.getdata(key)) } catch (e) { return def } }
        msg(title = this.name, subtitle = '', content = '') {
            if (this.isNode()) { console.log(`\n${title}\n${subtitle}\n${content}\n`); return }
            const t = String(title), s = String(subtitle), c = String(content);
            if (this.isQuanX()) $notify(t, s, c);
            else if (typeof $notification !== 'undefined') $notification.post(t, s, c);
        }
        done(value = {}) {
            if (this.isNode()) process.exit(0);
            if (typeof $done !== 'undefined') $done(value);
        }
    })(name, opts);
}
