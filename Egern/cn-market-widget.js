const INDICES = [
  { name: '上证指数', shortName: '上证', code: 'sh000001' },
  { name: '深证成指', shortName: '深成', code: 'sz399001' },
  { name: '创业板指', shortName: '创业', code: 'sz399006' },
  { name: '沪深300', shortName: '沪深', code: 'sh000300' },
];

const API =
  'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=';

const COLOR = {
  text: '#F8FAFC',
  muted: '#C9D4E5CC',
  faint: '#FFFFFF73',
  line: '#FFFFFF18',
  chip: '#FFFFFF12',
  up: '#FF6B7A',
  down: '#45D0A5',
  flat: '#D7DEEACC',
};

export default async function(ctx) {
  const family = ctx.widgetFamily || 'systemMedium';
  const isLarge = family === 'systemLarge' || family === 'systemExtraLarge';

  let quotes;
  try {
    quotes = await Promise.all(INDICES.map((item) => fetchIndex(ctx, item)));
  } catch (err) {
    return errorWidget(String(err && err.message ? err.message : err));
  }

  return {
    type: 'widget',
    padding: isLarge ? [16, 18, 13, 18] : [13, 14, 11, 14],
    gap: isLarge ? 7 : 5,
    refreshAfter: nextRefreshISO(),
    backgroundGradient: {
      type: 'linear',
      colors: ['#0B1020', '#123A46', '#39264E', '#7C364A'],
      stops: [0, 0.42, 0.75, 1],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    backgroundColor: '#0B1020',
    children: [
      header(isLarge),
      dateHeader(quotes, isLarge),
      ...quotes.map((quote) => indexRow(quote, isLarge)),
      { type: 'spacer' },
      footer(),
    ],
  };
}

async function fetchIndex(ctx, index) {
  const resp = await ctx.http.get(API + encodeURIComponent(index.code + ',day,,,6,qfq'), {
    timeout: 8000,
    policy: 'DIRECT',
    headers: {
      Referer: 'https://gu.qq.com/',
      'User-Agent': 'Mozilla/5.0 EgernWidget',
    },
  });
  const json = await resp.json();
  const node = json && json.data && json.data[index.code];
  const klines = node && Array.isArray(node.day)
    ? node.day
    : [];

  if (klines.length < 2) {
    throw new Error(index.name + ' 数据为空');
  }

  const days = klines.slice(-5).map((line, offset, list) => {
    const originalIndex = klines.length - list.length + offset;
    const prev = klines[originalIndex - 1];
    const close = Number(line[2]);
    const prevClose = prev ? Number(prev[2]) : Number(line[1]);
    const pct = prevClose ? ((close - prevClose) / prevClose) * 100 : NaN;
    return {
      date: line[0].slice(5).replace('-', '/'),
      close,
      pct,
    };
  });
  const latest = days[days.length - 1];

  return {
    ...index,
    latest,
    days,
  };
}

function header(isLarge) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 7,
        children: [
          {
            type: 'image',
            src: 'sf-symbol:chart.line.uptrend.xyaxis',
            width: isLarge ? 21 : 19,
            height: isLarge ? 21 : 19,
            color: '#F7C56B',
          },
          {
            type: 'text',
            text: '国内大盘',
            font: { size: isLarge ? 24 : 19, weight: 'bold' },
            textColor: COLOR.text,
            maxLines: 1,
          },
        ],
      },
      { type: 'spacer' },
      {
        type: 'date',
        date: new Date().toISOString(),
        format: 'time',
        font: { size: isLarge ? 15 : 13, weight: 'medium' },
        textColor: COLOR.muted,
      },
    ],
  };
}

function dateHeader(quotes, isLarge) {
  const days = quotes[0].days;
  const layout = getLayout(isLarge);
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: layout.rowGap,
    padding: [0, layout.rowPadX, 1, layout.rowPadX],
    children: [
      {
        type: 'text',
        text: '指数',
        width: layout.labelWidth,
        font: { size: isLarge ? 15 : 13, weight: 'medium' },
        textColor: COLOR.faint,
        maxLines: 1,
      },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: layout.chipGap,
        flex: 1,
        children: days.map((day) => ({
          type: 'text',
          text: day.date,
          flex: 1,
          font: { size: isLarge ? 14 : 12, weight: 'medium' },
          textColor: COLOR.faint,
          textAlign: 'center',
          maxLines: 1,
          minScale: 0.7,
        })),
      },
    ],
  };
}

function indexRow(quote, isLarge) {
  const layout = getLayout(isLarge);
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: layout.rowGap,
    padding: isLarge ? [7, layout.rowPadX, 7, layout.rowPadX] : [4, layout.rowPadX, 4, layout.rowPadX],
    backgroundColor: '#FFFFFF10',
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: COLOR.line,
    children: [
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'start',
        gap: 0,
        width: layout.labelWidth,
        children: [
          {
            type: 'text',
            text: isLarge ? quote.name : quote.shortName,
            font: { size: isLarge ? 20 : 14, weight: 'bold' },
            textColor: COLOR.text,
            maxLines: 1,
            minScale: 0.72,
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: layout.chipGap,
        flex: 1,
        children: quote.days.map((day) => pctChip(day, isLarge)),
      },
    ],
  };
}

function pctChip(day, isLarge) {
  const pct = day.pct;
  const color = pct > 0 ? COLOR.up : pct < 0 ? COLOR.down : COLOR.flat;
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isLarge ? 1 : 0,
    flex: 1,
    padding: isLarge ? [4, 0, 4, 0] : [2, 0, 2, 0],
    backgroundColor: COLOR.chip,
    borderRadius: 5,
    children: [
      {
        type: 'text',
        text: formatPct(pct),
        font: { size: isLarge ? 16 : 11.5, weight: 'bold', family: 'Menlo' },
        textColor: color,
        textAlign: 'center',
        maxLines: 1,
        minScale: 0.54,
      },
      {
        type: 'text',
        text: formatClose(day.close),
        font: { size: isLarge ? 10.5 : 8, weight: 'semibold', family: 'Menlo' },
        textColor: COLOR.muted,
        textAlign: 'center',
        maxLines: 1,
        minScale: 0.52,
      },
    ],
  };
}

function footer() {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    children: [
      {
        type: 'text',
        text: '腾讯行情 · 最近5个交易日',
        font: { size: 9, weight: 'medium' },
        textColor: COLOR.faint,
        maxLines: 1,
      },
      { type: 'spacer' },
      {
        type: 'image',
        src: 'sf-symbol:arrow.triangle.2.circlepath',
        width: 10,
        height: 10,
        color: COLOR.faint,
      },
    ],
  };
}

function errorWidget(message) {
  return {
    type: 'widget',
    padding: 16,
    gap: 8,
    backgroundGradient: {
      type: 'linear',
      colors: ['#171923', '#293241', '#4A2434'],
      stops: [0, 0.55, 1],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    backgroundColor: '#171923',
    children: [
      {
        type: 'text',
        text: '国内大盘',
        font: { size: 'headline', weight: 'bold' },
        textColor: '#FFFFFF',
      },
      {
        type: 'text',
        text: '数据加载失败',
        font: { size: 'subheadline', weight: 'semibold' },
        textColor: '#FFB4C0',
      },
      {
        type: 'text',
        text: message,
        font: { size: 'caption2' },
        textColor: '#FFFFFFAA',
        maxLines: 3,
        minScale: 0.7,
      },
    ],
  };
}

function getLayout(isLarge) {
  const rowPadX = isLarge ? 9 : 6;
  const labelWidth = isLarge ? 108 : 48;
  const rowGap = isLarge ? 8 : 6;
  return {
    rowPadX,
    labelWidth,
    rowGap,
    chipGap: isLarge ? 6 : 4,
    dateLead: rowPadX + labelWidth + rowGap,
  };
}

function formatPct(value) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(2) + '%';
}

function formatClose(value) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function nextRefreshISO() {
  const next = new Date(Date.now() + 15 * 60 * 1000);
  return next.toISOString();
}
