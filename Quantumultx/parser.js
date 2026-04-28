// ==== Parser Helper UI ====
var $parser = $parser || {};

// schema：作者声明的全部参数（不带 value）
$parser.hashSchema = function () {
  // helper 必须定义在函数体内部 —— 协议要求三个函数自包含
  function _emojiOptions() {
    return [
      { label: "添加",     value: "1"  },
      { label: "国行设备", value: "2"  },
      { label: "删除",     value: "-1" }
    ];
  }
  function _ptnOptions() {
    return [
      { label: "原样",         value: ""  },
      { label: "🅰 字母方块",   value: "1" },
      { label: "🄰 字母方块（实）", value: "2" },
      { label: "𝐀 加粗",        value: "3" },
      { label: "𝗮 加粗小写",    value: "4" },
      { label: "𝔸 双线",        value: "5" },
      { label: "𝕒 双线小写",    value: "6" },
      { label: "ᵃ 上标",        value: "7" },
      { label: "ᴬ 大写上标",    value: "8" }
    ];
  }
  function _nptOptions() {
    return [
      { label: "原样",         value: ""  },
      { label: "①",            value: "1" },
      { label: "❶",            value: "2" },
      { label: "⓵",            value: "3" },
      { label: "𝟙",            value: "4" },
      { label: "¹",            value: "5" },
      { label: "₁",            value: "6" },
      { label: "𝟏",            value: "7" },
      { label: "𝟷",            value: "8" }
    ];
  }

  return {
    version: 1,
    sections: [
      {
        type: "group",
        title: "节点筛选",
        items: [
          { type: "tags",   key: "in",     label: "保留（in）",
            description: "按节点名关键字保留。每行一个关键字表示\"或\"；同行用 . 分隔表示\"与\"。例：另起一行填 香港、台湾 表示含其一即可；同一行填 香港.IPLC 表示同时含香港和 IPLC。",
            placeholder: "如：香港 / 香港.IPLC" },
          { type: "tags",   key: "out",    label: "删除（out）",
            description: "按节点名关键字删除。每行一个关键字表示\"或\"；同行用 . 分隔表示\"与\"。",
            placeholder: "如：BGP / BGP.试用" },
          { type: "text",   key: "regex",  label: "正则保留（regex）",
            description: "对节点完整信息正则匹配", placeholder: "iplc" },
          { type: "text",   key: "regout", label: "正则删除（regout）",
            description: "对节点完整信息正则删除", placeholder: "" }
        ]
      },
      {
        type: "group",
        title: "节点参数",
        items: [
          { type: "select", key: "emoji", label: "Emoji 旗帜",
            description: "添加/删除节点名地区旗帜", options: _emojiOptions() },
          { type: "switch", key: "udp",   label: "UDP Relay",
            onValue: "1", offValue: "-1" },
          { type: "switch", key: "tfo",   label: "Fast Open",
            onValue: "1", offValue: "-1" },
          { type: "switch", key: "cert",  label: "TLS 证书验证",
            description: "默认关闭", onValue: "1", offValue: "-1" },
          { type: "switch", key: "uot",   label: "UDP over TCP（仅 SS/SSR）",
            onValue: "1", offValue: "" },
          { type: "switch", key: "aead",  label: "VMess AEAD",
            description: "关闭 VMess AEAD", onValue: "", offValue: "-1" },
          { type: "text",   key: "alpn",  label: "ALPN",
            description: "over-tls 节点的 ALPN", placeholder: "h2" },
          { type: "text",   key: "host",  label: "Host",
            description: "修改已有 host；增加 host 请加 ☠️ 结尾",
            placeholder: "" },
          { type: "text",   key: "checkurl", label: "Check URL",
            description: "server_check_url 参数",
            placeholder: "http://...", keyboard: "url" }
        ]
      },
      {
        type: "group",
        title: "节点重命名",
        items: [
          { type: "text", key: "rename",  label: "Rename",
            description: "格式：旧名@新名 / 前缀@ / @后缀；多组用 + 连接；删除字段用 ☠️ 结尾",
            placeholder: "香港@HK+@[1X]" },
          { type: "text", key: "rrname",  label: "Reverse Rename",
            description: "在 emoji 之后再次重命名", placeholder: "" },
          { type: "text", key: "replace", label: "正则替换",
            description: "regex1@str1+regex2@str2", placeholder: "" },
          { type: "select", key: "ptn", label: "字母样式（ptn）",
            description: "将节点名英文替换成花式样式",
            options: _ptnOptions() },
          { type: "select", key: "npt", label: "数字样式（npt）",
            description: "将节点名数字替换成花式样式",
            options: _nptOptions() }
        ]
      },
      {
        type: "group",
        title: "Rewrite / Filter",
        description: "仅对 rewrite_remote / filter_remote 生效",
        items: [
          { type: "tags", key: "inhn",  label: "保留主机名（inhn）",
            description: "按主机名关键字保留 rewrite/filter。每行一个关键字（多行之间为\"或\"关系）。",
            placeholder: "如：weibo" },
          { type: "tags", key: "outhn", label: "删除主机名（outhn）",
            description: "按主机名关键字删除 rewrite/filter。每行一个关键字（多行之间为\"或\"关系）。",
            placeholder: "如：tb_price" },
          { type: "text", key: "policy", label: "默认策略组",
            description: "rule-set 生成策略组的名字（默认 Shawn）",
            placeholder: "Shawn" },
          { type: "text", key: "pset",   label: "Policy Set",
            description: "regex1@policy1+regex2@policy2" },
          { type: "select", key: "dst", label: "转换目标（dst）",
            options: [
              { label: "默认（不转换）", value: ""        },
              { label: "Rewrite",        value: "rewrite" },
              { label: "Filter",         value: "filter"  }
            ] },
          { type: "switch", key: "cdn",  label: "GitHub CDN 加速",
            onValue: "1", offValue: "" },
          { type: "select", key: "fcr",  label: "网络接口（fcr）",
            options: [
              { label: "默认",            value: ""  },
              { label: "强制蜂窝数据",    value: "1" },
              { label: "混合接口",        value: "2" },
              { label: "负载均衡",        value: "3" }
            ] },
          { type: "text", key: "via",    label: "via-interface",
            description: "0 = via-interface=%TUN%" }
        ]
      },
      {
        type: "group",
        title: "其他",
        items: [
          { type: "select", key: "ntf",  label: "解析通知",
            options: [
              { label: "默认",          value: "" },
              { label: "关闭",          value: "0"},
              { label: "打开",          value: "1"}
            ] },
          { type: "select", key: "type", label: "强制类型",
            options: [
              { label: "自动",         value: ""           },
              { label: "Nodes",        value: "nodes"      },
              { label: "Rule",         value: "rule"       },
              { label: "Module",       value: "module"     },
              { label: "List",         value: "list"       },
              { label: "Domain Set",   value: "domain-set" }
            ] },
          { type: "switch", key: "info", label: "流量信息",
            onValue: "1", offValue: "" },
          { type: "text",   key: "flow", label: "流量参数",
            description: "格式：到期时间:总流量GB:已用GB（如 2026-12-31:1000:54）",
            placeholder: "2026-12-31:1000:54" },
          { type: "text",   key: "relay", label: "代理链 relay",
            description: "目标策略名，将节点订阅转换为 ip/host 规则" }
        ]
      }
    ]
  };
};

// hashToUI：解析 hash，返回当前已存在参数（带 value）
$parser.hashToUI = function (hash) {
  if (!hash) return { version: 1, sections: [], unknown: "" };

  var schema = $parser.hashSchema();
  var allItems = {};
  schema.sections.forEach(function (g) {
    g.items.forEach(function (it) { allItems[it.key] = it; });
  });

  // 解析 hash
  var pairs = hash.split("&");
  var values = {};
  var unknown = [];
  pairs.forEach(function (p) {
    if (!p) return;
    var eq = p.indexOf("=");
    var k = eq === -1 ? p : p.substring(0, eq);
    var v = eq === -1 ? "" : p.substring(eq + 1);
    if (allItems[k]) {
      values[k] = v;
    } else {
      unknown.push(p);
    }
  });

  // 按 schema 结构组装回 sections，仅保留出现的
  var sections = [];
  schema.sections.forEach(function (g) {
    var items = [];
    g.items.forEach(function (it) {
      if (!(it.key in values)) return;
      var clone = JSON.parse(JSON.stringify(it));
      var raw = values[it.key];
      if (it.type === "switch") {
        clone.value = (raw === it.onValue);
      } else if (it.type === "tags") {
        clone.value = raw.split("+").filter(Boolean);
      } else {
        clone.value = raw;
      }
      items.push(clone);
    });
    if (items.length) {
      sections.push({
        type: "group",
        title: g.title,
        description: g.description,
        items: items
      });
    }
  });

  return {
    version: 1,
    sections: sections,
    unknown: unknown.join("&")
  };
};

// uiToHash：把 values 序列化成 hash 字符串
$parser.uiToHash = function (values) {
  var schema = $parser.hashSchema();
  var allItems = {};
  schema.sections.forEach(function (g) {
    g.items.forEach(function (it) { allItems[it.key] = it; });
  });

  var parts = [];
  Object.keys(values).forEach(function (k) {
    if (k === "__unknown") return;
    var meta = allItems[k];
    if (!meta) return;
    var v = values[k];
    var serialized;
    if (meta.type === "switch") {
      serialized = v ? meta.onValue : meta.offValue;
    } else if (meta.type === "tags") {
      serialized = (v || []).join("+");
    } else {
      serialized = String(v);
    }
    parts.push(k + "=" + serialized);
  });

  if (values.__unknown) parts.push(values.__unknown);
  return parts.join("&");
};
