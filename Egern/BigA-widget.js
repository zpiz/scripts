/**
 * Egern 股市组件
 * - 数据源：新浪财经（hq.sinajs.cn 实时行情 + K线接口），面向中国大陆 A 股指数，免 Key
 * - 折线图：QuickChart.io（外部图表服务），返回 PNG，脚本内转 Base64 后用 image 组件渲染
 * - 中尺寸组件显示 3 个指数，大尺寸组件显示 6 个指数（按 ctx.widgetFamily 自动切换）
 * - 颜色采用国内习惯：红涨绿跌
 *
 * 可选环境变量（在 widgets[].env 中设置）：
 *   SYMBOLS     JSON 字符串，形如：
 *               [{"symbol":"sh000001","name":"上证指数","sub":"Shanghai Composite"}, ...]
 *               symbol 用新浪财经代码（sh/sz 前缀）。数组顺序即显示顺序；
 *               中尺寸取前 3 个，大尺寸取前 6 个。不设置则使用默认列表。
 *   CHART_DAYS  折线图取最近几天收盘价，默认 30
 */

const DEFAULT_SYMBOLS = [
  { symbol: 'sh000001', name: '上证指数', sub: 'Shanghai Composite' },
  { symbol: 'sz399001', name: '深证成指', sub: 'Shenzhen Component' },
  { symbol: 'sz399006', name: '创业板指', sub: 'ChiNext Price Index' },
  { symbol: 'sh000300', name: '沪深300', sub: 'CSI 300' },
  { symbol: 'sh000016', name: '上证50', sub: 'SSE 50' },
  { symbol: 'sh000905', name: '中证500', sub: 'CSI 500' },
];

// ---------- 工具函数 ----------

// 不依赖 btoa，手写 ArrayBuffer -> Base64
function toBase64(bytes) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    result += chars[bytes[i] >> 2];
    result += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += chars[bytes[i + 2] & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    result += chars[bytes[i] >> 2];
    result += chars[(bytes[i] & 3) << 4];
    result += '==';
  } else if (rem === 2) {
    result += chars[bytes[i] >> 2];
    result += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += chars[(bytes[i + 1] & 15) << 2];
    result += '=';
  }
  return result;
}

function getSymbols(ctx) {
  if (ctx.env.SYMBOLS) {
    try {
      const parsed = JSON.parse(ctx.env.SYMBOLS);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      // 解析失败则回退到默认列表
    }
  }
  return DEFAULT_SYMBOLS;
}

function formatPrice(price, symbol) {
  if (price == null || Number.isNaN(price)) return '--';
  const isAShareIndex =
    typeof symbol === 'string' &&
    (symbol.startsWith('sh') || symbol.startsWith('sz'));
  if (isAShareIndex) {
    // A股指数习惯显示为千分位 + 2位小数，如 3,015.32
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (Math.abs(price) >= 1000) {
    return Math.round(price).toLocaleString('en-US');
  }
  return price.toFixed(2);
}

function formatChange(change) {
  if (change == null || Number.isNaN(change)) return '--';
  const sign = change >= 0 ? '+' : '';
  return sign + change.toFixed(2);
}

// ---------- 数据获取（新浪财经） ----------
// 实时行情：https://hq.sinajs.cn/list=sh000001
// 日K线：  https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData
// 注意：新浪接口会校验 Referer，必须带上 finance.sina.com.cn，否则会被拒绝或返回空

const SINA_HEADERS = {
  Referer: 'https://finance.sina.com.cn',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
};

async function fetchRealtime(ctx, code) {
  const url = 'https://hq.sinajs.cn/list=' + code;
  const resp = await ctx.http.get(url, {
    headers: SINA_HEADERS,
    timeout: 10000,
  });
  const text = await resp.text();
  // 返回形如：var hq_str_sh000001="上证指数,开盘,昨收,最新价,最高,最低,...";
  const match = text.match(/="([^"]*)"/);
  if (!match || !match[1]) {
    throw new Error('empty realtime response: ' + code);
  }
  const fields = match[1].split(',');
  const price = parseFloat(fields[3]);
  const prevClose = parseFloat(fields[2]);
  if (Number.isNaN(price) || Number.isNaN(prevClose)) {
    throw new Error('bad realtime data: ' + code);
  }
  return { price, prevClose, change: price - prevClose };
}

async function fetchKlineCloses(ctx, code, days) {
  const url =
    'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=' +
    code +
    '&scale=240&ma=no&datalen=' +
    days;
  const resp = await ctx.http.get(url, {
    headers: SINA_HEADERS,
    timeout: 10000,
  });
  const text = await resp.text();
  let list = [];
  try {
    list = JSON.parse(text);
  } catch (e) {
    try {
      // 极少数情况下字段名没有引号，做一次容错转换再解析
      const fixed = text.replace(/([{,])(\w+):/g, '$1"$2":');
      list = JSON.parse(fixed);
    } catch (e2) {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => parseFloat(item.close))
    .filter((v) => !Number.isNaN(v));
}

async function fetchQuote(ctx, code, days) {
  const [realtime, klineCloses] = await Promise.all([
    fetchRealtime(ctx, code),
    fetchKlineCloses(ctx, code, days).catch(() => []),
  ]);

  let closes = klineCloses.length > 1 ? klineCloses.slice() : [];
  if (closes.length < 2) {
    closes = [realtime.prevClose, realtime.price];
  } else if (closes[closes.length - 1] !== realtime.price) {
    // K线最后一根有时是收盘价，用实时价补一个点，让走势图跟得上最新价
    closes.push(realtime.price);
  }

  return { price: realtime.price, change: realtime.change, closes };
}

async function fetchChartImage(ctx, closes, isUp) {
  const lineColor = isUp ? '#FF3B30' : '#34C759'; // 红涨绿跌
  const fillColor = isUp ? 'rgba(255,59,48,0.20)' : 'rgba(52,199,89,0.20)';

  // sparkline 是 QuickChart 专用的极简折线图类型：
  // 天生不带坐标轴 / 图例 / 标题，只画一条线，无需额外关闭任何选项
  const chartConfig = {
    type: 'sparkline',
    data: {
      datasets: [
        {
          data: closes,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
        },
      ],
    },
  };

  const chartUrl =
    'https://quickchart.io/chart?width=200&height=72&devicePixelRatio=2' +
    '&backgroundColor=transparent&c=' +
    encodeURIComponent(JSON.stringify(chartConfig));

  const resp = await ctx.http.get(chartUrl, { timeout: 10000 });
  const buf = await resp.arrayBuffer();
  const base64 = toBase64(new Uint8Array(buf));
  return 'data:image/png;base64,' + base64;
}

// ---------- 渲染 ----------

function buildRow(item, quote, chartDataUri) {
  const isUp = quote.change >= 0;
  const color = isUp ? '#FF3B30' : '#34C759'; // 红涨绿跌
  const arrowIcon = isUp ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill';

  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 8,
    children: [
      // 左：方向箭头 + 名称 + 副标题（用尾部 spacer 把内容顶死在左边，
      // 不依赖 alignItems，避免在 flex 容器里被居中）
      {
        type: 'stack',
        direction: 'column',
        gap: 2,
        flex: 1,
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 4,
            children: [
              {
                type: 'image',
                src: 'sf-symbol:' + arrowIcon,
                color: color,
                width: 9,
                height: 9,
              },
              {
                type: 'text',
                text: item.name,
                font: { size: 'subheadline', weight: 'bold' },
                textColor: { light: '#000000', dark: '#FFFFFF' },
                maxLines: 1,
              },
              { type: 'spacer' },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            children: [
              {
                type: 'text',
                text: item.sub || '',
                font: { size: 'caption2' },
                textColor: { light: '#8E8E93', dark: '#98989D' },
                maxLines: 1,
              },
              { type: 'spacer' },
            ],
          },
        ],
      },
      // 中：走势折线图（外部图表服务生成的真实图片）
      {
        type: 'image',
        src: chartDataUri,
        width: 60,
        height: 28,
        resizeMode: 'contain',
      },
      // 右：现价 + 涨跌（用头部 spacer 把内容顶死在右边；字号调小 + 加宽，避免被截断）
      {
        type: 'stack',
        direction: 'column',
        gap: 2,
        width: 84,
        children: [
          {
            type: 'stack',
            direction: 'row',
            children: [
              { type: 'spacer' },
              {
                type: 'text',
                text: formatPrice(quote.price, item.symbol),
                font: { size: 'footnote', weight: 'bold' },
                textColor: { light: '#000000', dark: '#FFFFFF' },
                textAlign: 'right',
                maxLines: 1,
                minScale: 0.6,
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            children: [
              { type: 'spacer' },
              {
                type: 'text',
                text: formatChange(quote.change),
                font: { size: 'caption2', weight: 'semibold' },
                textColor: color,
                textAlign: 'right',
                maxLines: 1,
                minScale: 0.6,
              },
            ],
          },
        ],
      },
    ],
  };
}

function divider() {
  return {
    type: 'stack',
    direction: 'row',
    height: 1,
    backgroundColor: { light: '#E5E5EA', dark: '#38383A' },
    children: [{ type: 'spacer' }],
  };
}

function errorWidget(message) {
  return {
    type: 'widget',
    padding: 16,
    backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' },
    children: [
      {
        type: 'text',
        text: message,
        font: { size: 'footnote' },
        textColor: '#FF3B30',
      },
    ],
  };
}

export default async function (ctx) {
  const days = parseInt(ctx.env.CHART_DAYS || '30', 10);
  const allSymbols = getSymbols(ctx);

  const count = ctx.widgetFamily === 'systemLarge' ? 6 : 3;
  const symbols = allSymbols.slice(0, count);

  let rows;
  try {
    rows = await Promise.all(
      symbols.map(async (item) => {
        const quote = await fetchQuote(ctx, item.symbol, days);
        const chartDataUri = await fetchChartImage(
          ctx,
          quote.closes,
          quote.change >= 0
        );
        return buildRow(item, quote, chartDataUri);
      })
    );
  } catch (e) {
    return errorWidget('行情加载失败，请稍后重试');
  }

  const listChildren = [];
  rows.forEach((row, idx) => {
    listChildren.push(row);
    if (idx < rows.length - 1) listChildren.push(divider());
  });

  return {
    type: 'widget',
    backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' },
    padding: [10, 14, 12, 14],
    gap: 8,
    children: [
      // 顶部：仅显示更新时间，靠右
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        children: [
          { type: 'spacer' },
          {
            type: 'date',
            date: new Date().toISOString(),
            format: 'time',
            font: { size: 'caption2', weight: 'medium' },
            textColor: { light: '#8E8E93', dark: '#8E8E93' },
          },
        ],
      },
      {
        type: 'stack',
        direction: 'column',
        gap: 8,
        flex: 1,
        children: listChildren,
      },
    ],
  };
}
