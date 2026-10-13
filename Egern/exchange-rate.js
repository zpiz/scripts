/*
------------------------------------------
@Date: 2026.03.15
@Description: 汇率查询脚本
@Author: zpiz
------------------------------------------
*/

const API_PATH = "/v1/currencies/usd.json";
const CACHE_CURRENT = "cached_currency_current";
const CACHE_YESTERDAY = "cached_currency_yesterday";
const CACHE_TIME = "cached_currency_time";
const CACHE_PREVIOUS_FOR = "cached_currency_previous_for_date";
const CACHE_STALE_MS = 72 * 60 * 60 * 1000;

function readCache(ctx, key, json = true) {
  try {
    return json ? ctx.storage.getJSON(key) : ctx.storage.get(key);
  } catch (_) {
    return null;
  }
}

function writeCache(ctx, key, value, json = true) {
  try {
    if (json) ctx.storage.setJSON(key, value);
    else ctx.storage.set(key, value);
  } catch (_) {}
}

function validRates(data) {
  return data && /^\d{4}-\d{2}-\d{2}$/.test(data.date || "") &&
    Number.isFinite(Date.parse(`${data.date}T00:00:00Z`)) &&
    data.usd && Number.isFinite(data.usd.cny) && data.usd.cny > 0;
}

function previousDate(date) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid rate date");
  return new Date(timestamp - 86400000).toISOString().slice(0, 10);
}

async function fetchRates(ctx, date, deadline) {
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}${API_PATH}`,
    `https://${date}.currency-api.pages.dev${API_PATH}`
  ];
  for (const url of urls) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    try {
      const response = await ctx.http.get(url, { timeout: Math.min(4000, remaining) });
      if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!validRates(data)) throw new Error("Invalid rate data");
      return data;
    } catch (_) {}
  }
  return null;
}

export default async function(ctx) {
  const deadline = Date.now() + 8500;
  const cachedCurrent = readCache(ctx, CACHE_CURRENT);
  const cachedYesterday = readCache(ctx, CACHE_YESTERDAY);
  const cachedTime = readCache(ctx, CACHE_TIME, false);
  const latest = await fetchRates(ctx, "latest", deadline);

  let currentData = latest || (validRates(cachedCurrent) ? cachedCurrent : null);
  let yesterdayData = null;
  const isUsingCache = !latest && !!currentData;
  const isError = !currentData;
  const parsedCacheTime = Date.parse(cachedTime || "");
  const isStaleCache = isUsingCache && (!Number.isFinite(parsedCacheTime) || Date.now() - parsedCacheTime > CACHE_STALE_MS);

  if (latest) {
    const cachedPreviousFor = readCache(ctx, CACHE_PREVIOUS_FOR, false);
    const expectedPreviousDate = previousDate(latest.date);
    if (validRates(cachedYesterday) && cachedYesterday.date === expectedPreviousDate &&
        (cachedPreviousFor === latest.date ||
         (cachedCurrent && cachedCurrent.date === latest.date && cachedYesterday.date === expectedPreviousDate))) {
      yesterdayData = cachedYesterday;
    } else if (deadline - Date.now() > 500) {
      yesterdayData = await fetchRates(ctx, expectedPreviousDate, deadline);
      if (yesterdayData && yesterdayData.date !== expectedPreviousDate) yesterdayData = null;
      if (yesterdayData) {
        writeCache(ctx, CACHE_YESTERDAY, yesterdayData);
        writeCache(ctx, CACHE_PREVIOUS_FOR, latest.date, false);
      }
    }
    writeCache(ctx, CACHE_CURRENT, latest);
    writeCache(ctx, CACHE_TIME, new Date().toISOString(), false);
  } else if (currentData && validRates(cachedYesterday) &&
             cachedYesterday.date === previousDate(currentData.date)) {
    yesterdayData = cachedYesterday;
  }

  const getRate = (data, id) => {
    if (!data || !data.usd || !data.usd.cny || !data.usd[id]) return null;
    const cny = data.usd.cny;
    const target = data.usd[id];
    return id === "jpy" ? (cny / target) * 100 : (cny / target);
  };

  const family = ctx.widgetFamily || "systemSmall";
  const isSmall = family === "systemSmall";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";
  const colorMainText = { light: "#000000", dark: "#FFFFFF" };
  const colorSubText = { light: "#8E8E93", dark: "#888888" };
  const colorBgStart = { light: "#FFFFFF", dark: "#1A1A2E" };
  const colorBgEnd = { light: "#F2F2F7", dark: "#16213E" };
  const colorTrendFlat = { light: "#8E8E93", dark: "#888888" };
  const colorTrendUp = "#FF3B30";
  const colorTrendDown = "#34C759";
  const currencyConfigs = isSmall
    ? [
        { id: "usd", name: "🇺🇸 USD" },
        { id: "eur", name: "🇪🇺 EUR" },
        { id: "gbp", name: "🇬🇧 GBP" },
        { id: "jpy", name: "🇯🇵 JPY(100)" },
        { id: "hkd", name: "🇭🇰 HKD" }
      ]
    : [
        { id: "usd", name: "🇺🇸 USD" },
        { id: "eur", name: "🇪🇺 EUR" },
        { id: "gbp", name: "🇬🇧 GBP" },
        { id: "jpy", name: "🇯🇵 JPY(100)" },
        { id: "hkd", name: "🇭🇰 HKD" },
        { id: "aud", name: "🇦🇺 AUD" },
        { id: "cad", name: "🇨🇦 CAD" },
        { id: "sgd", name: "🇸🇬 SGD" }
      ];
  const listData = currencyConfigs.map(c => {
    const curr = getRate(currentData, c.id);
    const yest = getRate(yesterdayData, c.id);

    let symbol = "-";
    let color = colorTrendFlat;

    if (curr && yest) {
      const currVal = Number(curr.toFixed(4));
      const yestVal = Number(yest.toFixed(4));

      if (currVal > yestVal) {
        symbol = "↑";
        color = colorTrendUp;
      } else if (currVal < yestVal) {
        symbol = "↓";
        color = colorTrendDown;
      }
    }
    return {
      name: c.name,
      rate: curr ? curr.toFixed(2) : "--",
      trendSymbol: symbol,
      trendColor: color
    };
  });

  if (family === "accessoryInline") {
    let txt = isError
      ? "获取失败"
      : listData.slice(0, 3).map(d => `${d.name.substring(0, 2)}${d.rate}${d.trendSymbol}`).join(" ");
    if (isUsingCache) txt += " ⚠️";
    return { type: "widget", children: [{ type: "text", text: txt }] };
  }
  if (family === "accessoryRectangular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "网络请求失败且无缓存" }] };

    return {
      type: "widget",
      gap: 4,
      children: listData.slice(0, 3).map((d, index) => {
        let textStr = `${d.name}: ${d.rate} ${d.trendSymbol}`;
        if (index === 0 && isUsingCache) textStr += " (离线缓存)";
        return {
          type: "text",
          text: textStr,
          font: { size: "headline", weight: "bold" },
          textColor: d.trendSymbol === "-" ? undefined : d.trendColor
        };
      })
    };
  }

  if (family === "accessoryCircular") {
    if (isError) return { type: "widget", children: [{ type: "text", text: "Error" }] };
    return {
      type: "widget",
      children: [
        {
          type: "stack",
          direction: "column",
          alignItems: "center",
          gap: 2,
          children: [
            { type: "image", src: "sf-symbol:dollarsign.circle", width: 18, height: 18 },
            {
              type: "text",
              text: `${listData[0].rate}${listData[0].trendSymbol}${isUsingCache ? "⚠️" : ""}`,
              font: { size: "caption1", weight: "bold" }
            }
          ]
        }
      ]
    };
  }
  const rowSpacing = isLarge ? 24 : isSmall ? 4 : 8;
  const titleSpacing = isLarge ? 28 : isSmall ? 8 : 12;
  const paddingVal = isLarge ? 24 : 16;
  const titleText = isSmall ? "汇率 (CNY)" : "汇率看板 (CNY)";
  const buildColItem = (item, isSmallFont) => ({
    type: "stack",
    direction: "row",
    alignItems: "center",
    children: [
      {
        type: "text",
        text: item.name,
        font: { size: isSmallFont ? "footnote" : "subheadline", weight: "medium" },
        textColor: colorMainText,
        flex: 1
      },
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          {
            type: "text",
            text: item.rate,
            font: { size: isSmallFont ? "footnote" : "subheadline", weight: "bold" },
            textColor: colorMainText
          },
          {
            type: "text",
            text: item.trendSymbol,
            font: { size: isSmallFont ? "caption2" : "footnote", weight: "bold" },
            textColor: item.trendColor
          }
        ]
      }
    ]
  });
  const contentChildren = [];

  if (!isError) {
    if (isSmall) {
      listData.forEach((item, index) => {
        contentChildren.push(buildColItem(item, true));
        if (index < listData.length - 1) contentChildren.push({ type: "spacer", length: rowSpacing });
      });
    } else {
      const leftCol = [];
      const rightCol = [];
      const half = Math.ceil(listData.length / 2);
      listData.slice(0, half).forEach((item, index) => {
        leftCol.push(buildColItem(item, false));
        if (index < half - 1) leftCol.push({ type: "spacer", length: rowSpacing });
      });

      listData.slice(half).forEach((item, index) => {
        rightCol.push(buildColItem(item, false));
        if (index < listData.slice(half).length - 1) rightCol.push({ type: "spacer", length: rowSpacing });
      });
      contentChildren.push({
        type: "stack",
        direction: "row",
        alignItems: "start",
        children: [
          { type: "stack", direction: "column", children: leftCol, flex: 1 },
          { type: "spacer", length: 20 },
          { type: "stack", direction: "column", children: rightCol, flex: 1 }
        ]
      });
    }
  } else {
    contentChildren.push({
      type: "text",
      text: "网络请求失败且无可用缓存",
      textColor: colorTrendUp,
      font: { size: "subheadline" }
    });
  }
  let displayTime = new Date().toISOString();
  if (isUsingCache && Number.isFinite(parsedCacheTime)) displayTime = cachedTime;

  const staleDate = Number.isFinite(parsedCacheTime)
    ? new Date(parsedCacheTime).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })
    : "未知日期";
  const timePrefixText = isStaleCache ? `⚠️ 旧数据 ${staleDate}` : isUsingCache ? "⚠️ 离线缓存于" : "更新于";
  return {
    type: "widget",
    refreshAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    backgroundGradient: {
      type: "linear",
      colors: [colorBgStart, colorBgEnd],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 }
    },
    padding: paddingVal,
    gap: 0,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          { type: "image", src: "sf-symbol:banknote.fill", color: "#FF9500", width: 16, height: 16 },
          { type: "text", text: titleText, font: { size: "headline", weight: "bold" }, textColor: colorMainText }
        ]
      },
      { type: "spacer", length: titleSpacing },
      ...contentChildren,
      { type: "spacer" },
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          {
            type: "text",
            text: timePrefixText,
            font: { size: "caption2" },
            textColor: isUsingCache ? "#FF9500" : colorSubText
          },
          {
            type: "date",
            date: displayTime,
            format: "time",
            font: { size: "caption2" },
            textColor: isUsingCache ? "#FF9500" : colorSubText
          }
        ]
      }
    ]
  };
}
