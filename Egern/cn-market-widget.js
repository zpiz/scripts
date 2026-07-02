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
    padding: isLarge ? [16, 14, 13, 14] : [13, 14, 11, 14],
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
            font: { size: isLarge ? 23 : 19, weight: 'bold' },
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

// 关键修复 1：
// Egern DSL 中 `width` 属性只对 stack / image 生效，对 text 元素无效
// （见文档「通用属性」表：width 的适用范围是 stack, image）。
// 之前 "指数" 是直接给 text 设置了 width，这个 width 会被忽略，
// 于是表头的标签列实际宽度只等于文字本身的自然宽度（很窄），
// 而下方数据行的标签是包在一个设置了 width 的 stack 里（宽度生效），
// 两者标签列宽度不一致，导致后面的日期 / 数值列错位。
// 修复方式：把 "指数" 文本也包进一个和数据行同样宽度的 stack 里。
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
        type: 'stack',
        direction: 'row',
        alignItems: 'start',
        width: layout.labelWidth,
        children: [
          {
            type: 'text',
            text: '指数',
            font: { size: isLarge ? 15 : 13, weight: 'medium' },
            textColor: COLOR.faint,
            maxLines: 1,
          },
        ],
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
            font: { size: isLarge ? 19 : 14, weight: 'bold' },
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

// 关键修复 2：
// 大尺寸组件涨跌幅/收盘价显示不全（出现省略号），根本原因是
// 标签列宽度（原 108）+ 行内边距（原左右各 9）+ 列间距（原 6）占用了
// 过多空间，导致留给 5 列涨跌幅的可用宽度被压得很窄，即使字体本身
// 已经设置了 minScale 也不足以把 "-2.26%" "16,205.56" 这种较长文本
// 缩小到能放进去的程度。
// 处理方式：
//   1) 收紧大尺寸下的整体内边距、标签列宽度、行间距、列间距，
//      把更多横向空间让给数值列；
//   2) 适当调小大尺寸涨跌幅/收盘价的基础字号，并降低 minScale 下限，
//      让文本有更大的自动缩放空间，优先「完整显示但变小」而不是被截断。
// 如果在实际设备上仍有个别机型显示不全，可以在 getLayout 里把
// labelWidth / chipGap 再调小一点，或把 pctChip 里的字号再降 1-2pt。
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
        font: { size: isLarge ? 13.5 : 11.5, weight: 'bold', family: 'Menlo' },
        textColor: color,
        textAlign: 'center',
        maxLines: 1,
        minScale: isLarge ? 0.5 : 0.54,
      },
      {
        type: 'text',
        text: formatClose(day.close),
        font: { size: isLarge ? 9.5 : 8, weight: 'semibold', family: 'Menlo' },
        textColor: COLOR.muted,
        textAlign: 'center',
        maxLines: 1,
        minScale: isLarge ? 0.45 : 0.52,
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

// 关键修复 2 的配套调整：收紧大尺寸下的各项间距/标签宽度，
// 把更多空间让给右侧的 5 列涨跌幅数据。
function getLayout(isLarge) {
  const rowPadX = isLarge ? 6 : 6;
  const labelWidth = isLarge ? 92 : 48;
  const rowGap = isLarge ? 6 : 6;
  return {
    rowPadX,
    labelWidth,
    rowGap,
    chipGap: isLarge ? 4 : 4,
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
