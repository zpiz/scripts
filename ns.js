/*
------------------------------------------
@Author: Sliverkiss
@Modified for QuanX: Gemini
@Description: nodeseek签到 (适配 Quantumult X)
------------------------------------------
*/
const $ = new Env("NodeSeek");
const ckName = "nodeseek_data";
const userCookie = $.toObj($.isNode() ? process.env[ckName] : $.getdata(ckName)) || [];
$.userIdx = 0, $.userList = [], $.notifyMsg = [];
const notify = $.isNode() ? require('./sendNotify') : '';
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
$.is_default = ($.isNode() ? process.env['nodeseek_default'] : $.getdata('nodeseek_default')) || 'false';

async function main() {
    for (let user of $.userList) {
        $.notifyMsg = [], $.title = "";
        try {
            $.log(`[${user.userName || user.index}][INFO]当前签到模式:${$.is_default == 'false' ? "固定领取5个鸡腿" : "随机领取鸡腿"}\n`)
            $.title = await user.signin($.is_default) ?? "";
            if (user.ckStatus) {
                let userInfo = await user.userAccount();
                $.log(`[${user.userName || user.index}][INFO]查询用户信息成功...\n`);
                DoubleLog(`「${userInfo?.member_name}」当前共${userInfo?.coin}个鸡腿🍗`);
            } else {
                DoubleLog(`⛔️ 「${user.userName ?? `账号${index}`}」check ck error!`)
            }
            await sendMsg($.notifyMsg.join("\n"));
        }
        catch (e) {
            DoubleLog(`[${user.userName ?? `账号${index}`}][ERROR]${e}`);
        }
    }
}

class UserInfo {
    constructor(user) {
        this.index = ++$.userIdx;
        this.token = "" || user.token || user;
        this.userId = "" || user.userId;
        this.userName = user.userName;
        this.avatar = user.avatar;
        this.ckStatus = true;
        this.baseUrl = `https://www.nodeseek.com`;
        this.headers = {
            'Connection': 'keep-alive',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            'Sec-Fetch-Mode': 'cors',
            'Cookie': this.token,
            'Referer': 'https://www.nodeseek.com',
            'Accept-Encoding': 'gzip, deflate, br',
            'Host': 'www.nodeseek.com',
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
                }
                // 已移除 alpn:"h2" 以兼容 QuanX
            }
            let res = await this.fetch(opts);
            return res?.detail;
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName || this.index}][ERROR]查询积分余额:${e}\n`);
        }
    }

    async signin(isDefault) {
        try {
            const opts = {
                url: "/api/attendance",
                params: { "random": isDefault },
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
                },
                type: "post"
                // 已移除 alpn:"h2" 以兼容 QuanX
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

// 获取Cookie及后续通用逻辑保持不变...
// (为节省篇幅，此处省略下方重复的 Env 函数和工具函数，请直接替换你原脚本中 main() 往上的部分)
