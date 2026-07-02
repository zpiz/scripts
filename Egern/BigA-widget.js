/**
 * Egern 大A趋势组件
 * - 数据源：Yahoo Finance 公开 chart 接口（免 Key）
 * - 折线图：QuickChart.io（外部图表服务），返回 PNG，脚本内转 Base64 后用 image 组件渲染
 * - 中尺寸组件显示 3 个指数，大尺寸组件显示 6 个指数（按 ctx.widgetFamily 自动切换）
 * - 颜色采用国内习惯：红涨绿跌
 *
 * 可选环境变量（在 widgets[].env 中设置）：
 *   SYMBOLS     JSON 字符串，形如：
 *               [{"symbol":"^DJI","name":"道琼斯","sub":"Dow Jones Industrial Average"}, ...]
 *               数组顺序即显示顺序；中尺寸取前 3 个，大尺寸取前 6 个。不设置则使用默认列表。
 *   CHART_DAYS  折线图取最近几天收盘价，默认 10
 */

const DEFAULT_SYMBOLS = [
  { symbol: '000001.SS', name: '上证指数', sub: 'Shanghai Composite' },
  { symbol: '399001.SZ', name: '深证成指', sub: 'Shenzhen Component' },
  { symbol: '399006.SZ', name: '创业板指', sub: 'ChiNext Price Index' },
  { symbol: '000300.SS', name: '沪深300', sub: 'CSI 300' },
  { symbol: '000016.SS', name: '上证50', sub: 'SSE 50' },
  { symbol: '000905.SS', name: '中证500', sub: 'CSI 500' },
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
    (symbol.endsWith('.SS') || symbol.endsWith('.SZ'));
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

// ---------- 数据获取 ----------

async function fetchQuote(ctx, symbol, days) {
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?range=' + days + 'd&interval=1d';

  const resp = await ctx.http.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
    timeout: 10000,
  });
  const data = await resp.json();
  const result = data.chart.result[0];
  const meta = result.meta;

  const rawCloses = (result.indicators.quote[0].close || []).filter(
    (v) => v !== null && v !== undefined
  );

  const price = meta.regularMarketPrice;
  const prevClose =
    meta.previousClose != null ? meta.previousClose : meta.chartPreviousClose;
  const change = price - prevClose;

  // 至少保证有两个点用于画线
  const closes = rawCloses.length > 1 ? rawCloses : [prevClose, price];

  return { price, change, closes };
}

async function fetchChartImage(ctx, closes, isUp) {
  const lineColor = isUp ? '#FF3B30' : '#34C759'; // 红涨绿跌
  const fillColor = isUp ? 'rgba(255,59,48,0.20)' : 'rgba(52,199,89,0.20)';

  const chartConfig = {
    type: 'line',
    data: {
      labels: closes.map((_, i) => i),
      datasets: [
        {
          data: closes,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.35,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false },
      },
      elements: { point: { radius: 0 } },
      layout: { padding: 0 },
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
    gap: 10,
    children: [
      // 左：方向箭头 + 名称 + 副标题
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'start',
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
                minScale: 0.8,
              },
            ],
          },
          {
            type: 'text',
            text: item.sub || '',
            font: { size: 'caption2' },
            textColor: { light: '#8E8E93', dark: '#98989D' },
            maxLines: 1,
            minScale: 0.8,
          },
        ],
      },
      // 中：走势折线图（外部图表服务生成的真实图片）
      {
        type: 'image',
        src: chartDataUri,
        width: 66,
        height: 30,
        resizeMode: 'contain',
      },
      // 右：现价 + 涨跌
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'end',
        gap: 2,
        width: 64,
        children: [
          {
            type: 'text',
            text: formatPrice(quote.price, item.symbol),
            font: { size: 'subheadline', weight: 'bold' },
            textColor: { light: '#000000', dark: '#FFFFFF' },
            textAlign: 'right',
            maxLines: 1,
            minScale: 0.7,
          },
          {
            type: 'text',
            text: formatChange(quote.change),
            font: { size: 'caption1', weight: 'semibold' },
            textColor: color,
            textAlign: 'right',
            maxLines: 1,
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
    children: [],
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
  const days = parseInt(ctx.env.CHART_DAYS || '10', 10);
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
