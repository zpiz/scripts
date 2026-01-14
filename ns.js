/*
------------------------------------------
@Author: Sliverkiss
@Date: 2024.04.13 20:34:33
@Description:nodeseek签到 感谢@KeQing提供的账号
------------------------------------------
2024.07.03 更新内容：
- 将请求头转换为小写，尝试兼容loon的h2

重写：
- 登录网站后点击个人名称，查看个人名片信息。
- 可在boxjs设置是否领取随机鸡腿，默认固定鸡腿。考虑到严格的审核机制，脚本仅有签到功能。

[Script]
http-response ^https:\/\/www\.nodeseek\.com\/api\/account\/getInfo\/.+\?readme=1&signature=1&phone=1 script-path=https://gist.githubusercontent.com/Sliverkiss/2b5acc2c4960dd06618c6912302c2c7f/raw/nodeseek.js, requires-body=true, timeout=60, tag=NodeSeek获取token

[MITM]
hostname = www.nodeseek.com

⚠️【免责声明】
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/
const $ = new Env("NodeSeek");
const ckName = "nodeseek_data";
const userCookie = $.toObj($.isNode() ? process.env[ckName] : $.getdata(ckName)) || [];
//用户多账号配置
$.userIdx = 0, $.userList = [], $.notifyMsg = [];
//notify
const notify = $.isNode() ? require('./sendNotify') : '';
//debug
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
//是否固定鸡腿
$.is_default = ($.isNode() ? process.env['nodeseek_default'] : $.getdata('nodeseek_default')) || 'false';
//------------------------------------------
async function main() {
    //并发执行所有用户
    for (let user of $.userList) {
        $.notifyMsg = [], $.title = "";
        try {
            //task ;
            $.log(`[${user.userName || user.index}][INFO]当前签到模式:${$.is_default == 'false' ? "固定领取5个鸡腿" : "随机领取鸡腿"}\n`)
            $.title = await user.signin($.is_default) ?? "";
            if (user.ckStatus) {
                let userInfo = await user.userAccount();
                $.log(`[${user.userName || user.index}][INFO]查询用户信息成功...\n`);
                DoubleLog(`「${userInfo?.member_name}」当前共${userInfo?.coin}个鸡腿🍗`);
            } else {
                DoubleLog(`⛔️ 「${user.userName ?? `账号${index}`}」check ck error!`)
            }
            //notify
            await sendMsg($.notifyMsg.join("\n"));
        }
        catch (e) {
            DoubleLog(`[${user.userName ?? `账号${index}`}][ERROR]${e}`);
        }
    }
}
//用户
class UserInfo {
    constructor(user) {
        //默认属性
        this.index = ++$.userIdx;
        this.token = "" || user.token || user;
        this.userId = "" || user.userId;
        this.userName = user.userName;
        this.avatar = user.avatar;
        this.ckStatus = true;
        //请求封装
        this.baseUrl = `https://www.nodeseek.com`;
        // QuanX 修正：Header 首字母大写，添加 UA，移除小写 header 限制
        this.headers = {
            'Connection': 'keep-alive',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            'Sec-Fetch-Mode': 'cors',
            'Cookie': this.token,
            'Referer': 'https://www.nodeseek.com/board',
            'Accept-Encoding': 'gzip, deflate, br',
            'Host': 'www.nodeseek.com',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Accept': '*/*',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Site': 'same-origin',
        };
        this.fetch = async (o) => {
            try {
                if (typeof o === 'string') o = { url: o };
                if (o?.url?.startsWith("/") || o?.url?.startsWith(":")) o.url = this.baseUrl + o.url
                const res = await Request({ ...o, headers: o.headers || this.headers, url: o.url })
                debug(res, o?.url?.replace(/\/+$/, '').substring(o?.url?.lastIndexOf('/') + 1));
                if (res?.status == 404) throw new Error(res?.message || `用户需要去登录`);
                return res;
            } catch (e) {
                this.ckStatus = false;
                $.log(`[${this.userName || this.index}][ERROR]请求发起失败!${e}\n`);
            }
        }
    }
    //查询积分余额
    async userAccount() {
        try {
            const opts={
                url:`/api/account/getInfo/${this.userId}?readme=1`,
                headers: {
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Sec-Fetch-Mode': 'cors',
                    'Origin': 'https://www.nodeseek.com',
                    'Referer': 'https://www.nodeseek.com/board',
                    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                    'Accept': '*/*',
                    'Sec-Fetch-Dest': 'empty',
                    'Cookie': this.token,
                    'Content-Length': '0',
                    'Sec-Fetch-Site': 'same-origin',
                    'User-Agent': this.headers['User-Agent']
                },
                // QuanX 修正：移除 alpn: "h2"
                type: "GET" 
            }
            let res = await this.fetch(opts);
            return res?.detail;
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName || this.index}][ERROR]查询积分余额:${e}\n`);
        }
    }
    //每日签到
    async signin(isDefault) {
        try {
            const opts = {
                url: "/api/attendance",
                params: { "random": isDefault },
                // QuanX 修正：移除 alpn: "h2"
                headers: {
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Sec-Fetch-Mode': 'cors',
                    'Origin': 'https://www.nodeseek.com',
                    'Referer': 'https://www.nodeseek.com/board',
                    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                    'Accept': '*/*',
                    'Sec-Fetch-Dest': 'empty',
                    'Cookie': this.token,
                    'Content-Length': '0',
                    'Sec-Fetch-Site': 'same-origin',
                    'User-Agent': this.headers['User-Agent']
                },
                type: "POST" // QuanX 修正：使用大写 POST
            }
            let res = await this.fetch(opts);
            $.log(`[${this.userName || this.index}][INFO]${res?.message}\n`);
            return res?.message;
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName || this.index}][ERROR]签到:${e}\n`);
        }
    }
}


//获取Cookie
async function getCookie() {
    try {
        if ($request && $request.method === 'OPTIONS') return;
        const header = ObjectKeys2LowerCase($request.headers) ?? $.msg($.name, `⛔️ script run error!`, `错误的运行方式，请切换到cron环境`);
        let token = header.cookie;
        let Body = $.toObj($response.body);
        if (!(token && Body)) throw new Error("获取token失败！请检查配置是否正确");
        let { member_id, member_name } = Body?.detail ?? {};
        const newData = {
            "userId": member_id,
            "token": token,
            "userName": member_name,
        }
        const index = userCookie.findIndex(e => e.userId == newData.userId);
        userCookie[index] ? userCookie[index] = newData : userCookie.push(newData);
        $.setjson(userCookie, ckName);
        $.msg($.name, `🎉${newData.userName}更新token成功!`, ``);
    } catch (e) {
        throw e;
    }
}

//主程序执行入口
!(async () => {
    try {
        if (typeof $request != "undefined") {
            await getCookie();
        } else {
            await checkEnv();
            await main();
        }
    } catch (e) {
        throw e;
    }
})()
    .catch((e) => { $.logErr(e), $.msg($.name, `⛔️ script run error!`, e.message || e) })
    .finally(async () => {
        $.done({ ok: 1 });
    });

/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
async function sendMsg(a) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, { "media-url": $.avatar })) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
async function checkEnv() { try { if (!userCookie?.length) throw new Error("no available accounts found"); $.log(`\n[INFO]检测到 ${userCookie?.length ?? 0} 个账号\n`), $.userList.push(...userCookie.map((o => new UserInfo(o))).filter(Boolean)) } catch (o) { throw o } }
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj) { return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase
