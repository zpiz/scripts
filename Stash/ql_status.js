// ==========================================
// 适配 BoxJS 读取青龙配置
// 需要在 BoxJS 中提前配置好以下三个键值对：
// 键名通常取决于你在 BoxJS 订阅中定义的 ID，假设与天龙驿站脚本共用环境变量：
// tlyj_data_host  (或你实际在 BoxJS 中定义的键)
// tlyj_data_clientId
// tlyj_data_secret
// ==========================================

// 初始化 BoxJS 数据读取机制
const $ = new Env("ql_status");

// 尝试从 BoxJS 中获取配置，优先读取脚本自定义传入的参数，其次读取本地持久化数据
const host =  $.getdata('host') || ""; 
const clientId = $.getdata('clientId') || "";
const secret = $.getdata('secret') || "";

// 面板初始化默认结构
let tile = {
    title: "青龙面板",
    icon: "terminal.fill",
    content: "正在获取状态...",
    backgroundColor: "#1C1C1E" // 默认深灰
};

// 入口函数
!(async () => {
    // 检查是否配置了必要参数
    if (!host || !clientId || !secret) {
        updateTile("配置缺失", "请先在BoxJS填写青龙相关配置", "#FF9500");
        return;
    }

    // 格式化 host（去除末尾的斜杠，防止拼接 URL 时出错）
    const cleanHost = host.replace(/\/$/, "");

    await getQingLongStatus(cleanHost, clientId, secret);
})()
    .catch((e) => {
        $.logErr(e);
        updateTile("脚本异常", "运行过程中发生错误", "#FF3B30");
    })
    .finally(() => {
        $.done();
    });

// 1. 获取 Token 并检查状态的主流程
async function getQingLongStatus(host, clientId, secret) {
    const authUrl = `${host}/open/auth/token?client_id=${clientId}&client_secret=${secret}`;
    
    $httpClient.get(authUrl, function (error, response, data) {
        if (error) {
            updateTile("探针离线", "无法连接到青龙主机", "#FF3B30", host);
            return;
        }
        
        try {
            let authRes = JSON.parse(data);
            if (authRes.code !== 200) {
                updateTile("授权失败", "API密钥不正确或权限不足", "#FF9500", host);
                return;
            }
            
            let token = authRes.data.token;
            checkQinglongEnvs(host, token);
        } catch (e) {
            updateTile("解析异常", "Token数据解析失败", "#8E8E93", host);
        }
    });
}

// 2. 检查环境变量列表（监控失效状态）
function checkQinglongEnvs(host, token) {
    const envUrl = `${host}/open/envs`;
    
    $httpClient.get({
        url: envUrl,
        headers: { "Authorization": `Bearer ${token}` }
    }, function (error, response, data) {
        if (error) {
            updateTile("请求超时", "获取环境变量列表失败", "#FF3B30", host);
            return;
        }

        try {
            let envRes = JSON.parse(data);
            if (envRes.code !== 200) {
                updateTile("查询被拒", "请检查应用权限", "#FF9500", host);
                return;
            }

            // 适配青龙 API 返回层级差异
            let envList = Array.isArray(envRes.data) ? envRes.data : (envRes.data.data || []);
            
            let total = envList.length;
            // 找出状态为 1 的变量（已禁用/失效）
            let disabledCount = envList.filter(env => env.status === 1).length;

            if (disabledCount > 0) {
                updateTile(
                    "变量失效告警", 
                    `总变量: ${total} | 已失效: ${disabledCount}`, 
                    "#FF3B30", 
                    host
                );
            } else {
                updateTile(
                    "青龙运行良好", 
                    `已加载 ${total} 个有效变量`, 
                    "#34C759", 
                    host
                );
            }
        } catch (e) {
            updateTile("解析错误", "业务数据拉取失败", "#8E8E93", host);
        }
    });
}

// 3. 封装渲染方法
function updateTile(title, content, color, url = null) {
    tile.title = title;
    tile.content = content;
    tile.backgroundColor = color;
    if (url) {
        tile.url = url; 
    }
    // 渲染面板数据
    if (typeof $done !== "undefined") {
        $done(tile);
    }
}

// ==========================================
// 辅助类：Env (为了兼容 BoxJS 读取和 Surge/Stash 环境)
// 这是一个简化的 Env 类，仅保留面板运行所需的 getdata 方法
// ==========================================
function Env(name) {
    this.name = name;
    
    // 获取本地数据 (兼容 Surge/Loon/Stash 的 $persistentStore 和 QuanX 的 $prefs)
    this.getdata = (key) => {
        let val = null;
        try {
            if (typeof $persistentStore !== 'undefined') {
                val = $persistentStore.read(key);
            } else if (typeof $prefs !== 'undefined') {
                val = $prefs.valueForKey(key);
            }
        } catch (e) {
            this.logErr(`获取数据 ${key} 失败:`, e);
        }
        return val;
    };

    this.logErr = (e) => {
        console.log(`[${this.name}] 发生错误: \n${e}`);
    };

    this.done = () => {
        // 如果 $done 未被覆盖或未执行，确保脚本安全退出
    };
}
