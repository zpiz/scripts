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

  // 中尺寸的物理高度非常有限（约 155pt），之前 4 行 + 大字体导致内容
  // 撑爆高度、上下两行文字重叠。这里中尺寸只展示前两个指数（上证、深成），
  // 大尺寸依然展示全部 4 个。
  const displayQuotes = isLarge ? quotes : quotes.slice(0, 2);

  return {
    type: 'widget',
    padding: isLarge ? [16, 14, 13, 14] : [9, 14, 7, 14],
    gap: isLarge ? 7 : 3,
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
      ...displayQuotes.map((quote) => indexRow(quote, isLarge)),
      ...(isLarge ? [{ type: 'spacer' }] : []),
      footer(isLarge),
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

// 关键修复 3：
// 标题栏（图标+"国内大盘"+时间）之前没有设置左右内边距，而下面的
// 日期表头 / 数据行都设置了 rowPadX 的左右内边距，导致标题栏的图标
// 和文字整体比下面几行更靠左（时间也比最后一列的日期/数值更靠右），
// 视觉上"错了一层"。这里给标题栏加上和下面完全一样的 layout.rowPadX，
// 让图标左边缘对齐标签列文字左边缘、时间右边缘对齐最后一列右边缘。
function header(isLarge) {
  const layout = getLayout(isLarge);
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    padding: [0, layout.rowPadX, 0, layout.rowPadX],
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
            font: { size: isLarge ? 23 : 17, weight: 'bold' },
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
        font: { size: isLarge ? 15 : 12, weight: 'medium' },
        textColor: COLOR.muted,
      },
    ],
  };
}

// 关键调整：中尺寸组件从显示 5 天改为只显示最近 3 天，
// 腾出的横向空间用来把字体和列间距都调大，可读性更好。
function dateHeader(quotes, isLarge) {
  const layout = getLayout(isLarge);
  const days = quotes[0].days.slice(-layout.dayCount);
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
          font: { size: isLarge ? 14 : 13, weight: 'medium' },
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
  const days = quote.days.slice(-layout.dayCount);
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: layout.rowGap,
    padding: isLarge ? [7, layout.rowPadX, 7, layout.rowPadX] : [2, layout.rowPadX, 2, layout.rowPadX],
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
            font: { size: isLarge ? 19 : 17, weight: 'bold' },
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
        children: days.map((day) => pctChip(day, isLarge)),
      },
    ],
  };
}

// 关键修复 4：
// systemMedium 小组件的物理高度是固定的（约 155pt 左右，跟宽度无关），
// 不会因为内容多而自动变高。之前把涨跌幅/收盘价字体调到 16.5/12，
// 4 行 × 两行文字的总高度远超过这个上限，超出部分不会被截断，而是
// 上下两行文字直接叠在一起（就是截图里看到的重影效果）。
// 这次改为：中尺寸只展示 2 个指数、只显示 3 天，同时把每个色块内的
// 字号、行间距、内边距都压缩到一个经过估算、留有余量的数值，
// 保证「标题栏 + 日期行 + 2 行数据 + 底部说明」的总高度控制在
// 155pt 以内，不会再出现重叠。
function pctChip(day, isLarge) {
  const pct = day.pct;
  const color = pct > 0 ? COLOR.up : pct < 0 ? COLOR.down : COLOR.flat;
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isLarge ? 1 : 1,
    flex: 1,
    padding: isLarge ? [4, 0, 4, 0] : [2, 0, 2, 0],
    backgroundColor: COLOR.chip,
    borderRadius: 5,
    children: [
      {
        type: 'text',
        text: formatPct(pct),
        font: { size: isLarge ? 13.5 : 14, weight: 'bold', family: 'Menlo' },
        textColor: color,
        textAlign: 'center',
        maxLines: 1,
        minScale: isLarge ? 0.5 : 0.6,
      },
      {
        type: 'text',
        text: formatClose(day.close),
        font: { size: isLarge ? 9.5 : 10, weight: 'semibold', family: 'Menlo' },
        textColor: COLOR.muted,
        textAlign: 'center',
        maxLines: 1,
        minScale: isLarge ? 0.45 : 0.55,
      },
    ],
  };
}

function footer(isLarge) {
  const layout = getLayout(isLarge);
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    children: [
      {
        type: 'text',
        text: '腾讯行情 · 最近' + layout.dayCount + '个交易日',
        font: { size: isLarge ? 9 : 8, weight: 'medium' },
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

// 中尺寸只显示最近 3 天（dayCount），空出来的空间用来放大标签列宽度、
// 列间距和字体；大尺寸维持 5 天不变。
function getLayout(isLarge) {
  const rowPadX = isLarge ? 6 : 8;
  const labelWidth = isLarge ? 92 : 56;
  const rowGap = isLarge ? 6 : 8;
  return {
    rowPadX,
    labelWidth,
    rowGap,
    dayCount: isLarge ? 5 : 3,
    chipGap: isLarge ? 4 : 8,
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
