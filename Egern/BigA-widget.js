/**
 * Egern A-share widget — resilient edition.
 *
 * Optional env:
 *   SYMBOLS: JSON array of { symbol, name, sub }
 *   CHART_DAYS: 2-60, default 30
 *   CACHE_MAX_AGE_MINUTES: 1-1440, default 30
 */
const DEFAULT_SYMBOLS = [
  { symbol: 'sh000001', name: '上证指数', sub: 'Shanghai Composite' },
  { symbol: 'sz399001', name: '深证成指', sub: 'Shenzhen Component' },
  { symbol: 'sz399006', name: '创业板指', sub: 'ChiNext Price Index' },
  { symbol: 'sh000300', name: '沪深300', sub: 'CSI 300' },
  { symbol: 'sh000016', name: '上证50', sub: 'SSE 50' },
  { symbol: 'sh000905', name: '中证500', sub: 'CSI 500' },
];

const CACHE_KEY = 'big-a-widget-cache-v1';
const SINA_HEADERS = {
  Referer: 'https://finance.sina.com.cn',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
};

function clamp(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function getSymbols(ctx) {
  try {
    const symbols = JSON.parse(ctx.env.SYMBOLS || 'null');
    if (Array.isArray(symbols) && symbols.length) return symbols.filter((item) => item && item.symbol && item.name);
  } catch (_) {}
  return DEFAULT_SYMBOLS;
}

function formatPrice(price) {
  return Number.isFinite(price)
    ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';
}

function formatChange(change) {
  return Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}` : '--';
}

async function getText(ctx, url) {
  const response = await ctx.http.get(url, { headers: SINA_HEADERS, timeout: 6000 });
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchRealtimeBatch(ctx, symbols) {
  const text = await getText(ctx, `https://hq.sinajs.cn/list=${symbols.join(',')}`);
  const quotes = new Map();
  for (const match of text.matchAll(/var hq_str_([^=]+)="([^"]*)";/g)) {
    const fields = match[2].split(',');
    const prevClose = Number.parseFloat(fields[2]);
    const price = Number.parseFloat(fields[3]);
    if (Number.isFinite(price) && Number.isFinite(prevClose)) {
      quotes.set(match[1], { price, change: price - prevClose, prevClose });
    }
  }
  return quotes;
}

async function fetchKlineCloses(ctx, code, days) {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${code}&scale=240&ma=no&datalen=${days}`;
  const text = await getText(ctx, url);
  let list;
  try {
    list = JSON.parse(text);
  } catch (_) {
    list = JSON.parse(text.replace(/([{,])(\w+):/g, '$1"$2":'));
  }
  if (!Array.isArray(list)) return [];
  return list.map((item) => Number.parseFloat(item.close)).filter(Number.isFinite);
}

function sparkline(closes, isUp) {
  const values = closes.filter(Number.isFinite);
  if (values.length < 2) return null;
  const width = 120;
  const height = 56;
  const padding = 3;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const points = values.map((value, index) => {
    const x = padding + (index * (width - padding * 2)) / (values.length - 1);
    const y = height - padding - ((value - low) * (height - padding * 2)) / range;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = isUp ? '#FF3B30' : '#34C759';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function cacheGet(ctx) {
  try {
    return ctx.storage.getJSON(CACHE_KEY);
  } catch (_) {
    return null;
  }
}

function cacheSet(ctx, value) {
  try {
    ctx.storage.setJSON(CACHE_KEY, value);
  } catch (_) {}
}

function buildRow(item, quote, stale) {
  const available = quote && Number.isFinite(quote.price);
  const isUp = available && quote.change >= 0;
  const color = isUp ? '#FF3B30' : '#34C759';
  const chart = available ? sparkline(quote.closes || [], isUp) : null;
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 8,
    opacity: stale ? 0.72 : 1,
    children: [
      {
        type: 'stack', direction: 'column', gap: 2, flex: 1,
        children: [
          { type: 'text', text: item.name, font: { size: 'subheadline', weight: 'bold' }, textColor: { light: '#000000', dark: '#FFFFFF' }, maxLines: 1 },
          { type: 'text', text: available ? (item.sub || '') : '数据暂不可用', font: { size: 'caption2' }, textColor: { light: '#8E8E93', dark: '#98989D' }, maxLines: 1 },
        ],
      },
      chart
        ? { type: 'image', src: chart, width: 60, height: 28, resizeMode: 'contain' }
        : { type: 'spacer', width: 60 },
      {
        type: 'stack', direction: 'column', gap: 2, width: 84,
        children: [
          { type: 'text', text: available ? formatPrice(quote.price) : '--', font: { size: 'footnote', weight: 'bold' }, textColor: { light: '#000000', dark: '#FFFFFF' }, textAlign: 'right', maxLines: 1, minScale: 0.6 },
          { type: 'text', text: available ? formatChange(quote.change) : '--', font: { size: 'caption2', weight: 'semibold' }, textColor: available ? color : '#8E8E93', textAlign: 'right', maxLines: 1 },
        ],
      },
    ],
  };
}

function divider() {
  return { type: 'stack', height: 1, backgroundColor: { light: '#E5E5EA', dark: '#38383A' }, children: [{ type: 'spacer' }] };
}

function errorWidget(message) {
  return {
    type: 'widget', padding: 16, backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' },
    children: [{ type: 'text', text: message, font: { size: 'footnote' }, textColor: '#FF3B30' }],
  };
}

export default async function (ctx) {
  const days = clamp(ctx.env.CHART_DAYS, 2, 60, 30);
  const cacheMaxAge = clamp(ctx.env.CACHE_MAX_AGE_MINUTES, 1, 1440, 30) * 60 * 1000;
  const allSymbols = getSymbols(ctx);
  const family = ctx.widgetFamily;
  const count = family === 'systemLarge' || family === 'systemExtraLarge' ? 6 : family === 'systemSmall' ? 2 : 3;
  const symbols = allSymbols.slice(0, count);
  if (!symbols.length) return errorWidget('未配置有效的指数代码');

  const cached = cacheGet(ctx);
  const cachedQuotes = cached && cached.quotes ? cached.quotes : {};
  let realtime = new Map();
  try {
    realtime = await fetchRealtimeBatch(ctx, symbols.map((item) => item.symbol));
  } catch (_) {}

  const freshResults = await Promise.allSettled(symbols.map(async (item) => {
    const realtimeQuote = realtime.get(item.symbol);
    if (!realtimeQuote) throw new Error(`missing quote: ${item.symbol}`);
    let closes = [];
    try {
      closes = await fetchKlineCloses(ctx, item.symbol, days);
    } catch (_) {}
    if (closes.length < 2) closes = [realtimeQuote.prevClose, realtimeQuote.price];
    else if (closes[closes.length - 1] !== realtimeQuote.price) closes.push(realtimeQuote.price);
    return { symbol: item.symbol, quote: { price: realtimeQuote.price, change: realtimeQuote.change, closes } };
  }));

  const freshQuotes = {};
  for (const result of freshResults) {
    if (result.status === 'fulfilled') freshQuotes[result.value.symbol] = result.value.quote;
  }
  const hasFreshData = Object.keys(freshQuotes).length > 0;
  const now = Date.now();
  if (hasFreshData) cacheSet(ctx, { savedAt: now, quotes: { ...cachedQuotes, ...freshQuotes } });
  const cacheIsUsable = cached && now - cached.savedAt <= cacheMaxAge;
  const rows = symbols.map((item) => {
    const fresh = freshQuotes[item.symbol];
    return buildRow(item, fresh || (cacheIsUsable ? cachedQuotes[item.symbol] : null), !fresh);
  });
  const children = [];
  rows.forEach((row, index) => {
    children.push(row);
    if (index < rows.length - 1) children.push(divider());
  });
  const updateDate = hasFreshData ? now : (cacheIsUsable ? cached.savedAt : now);
  const status = hasFreshData ? '更新' : cacheIsUsable ? '缓存数据' : '数据暂不可用';
  return {
    type: 'widget', backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' }, padding: [10, 14, 12, 14], gap: 8,
    children: [
      { type: 'stack', direction: 'row', children: [
        { type: 'spacer' },
        { type: 'text', text: status, font: { size: 'caption2', weight: 'medium' }, textColor: hasFreshData || cacheIsUsable ? '#8E8E93' : '#FF3B30' },
        { type: 'text', text: ` ${new Date(updateDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, font: { size: 'caption2', weight: 'medium' }, textColor: '#8E8E93' },
      ] },
      { type: 'stack', direction: 'column', gap: 8, flex: 1, children },
    ],
  };
}
