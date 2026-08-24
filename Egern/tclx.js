/*

hostname = app.17u.cn

QuanX 抓包（只拦截 signIndex；其余接口绝不能写账号变量）
[rewrite_local]
^https:\/\/app\.17u\.cn\/welfarecenter\/index\/signIndex(?:\?|$) url script-request-header https://raw.githubusercontent.com/zpiz/scripts/refs/heads/main/Egern/tongcheng.js

[MITM]
hostname = app.17u.cn

# 青龙变量
单账号:
tongcheng_trip_signheader='{"appToken":"xxx","sec-token":"xxx","device":"xxx"}'
多账号 JSON 数组（仅此一个变量）:
tongcheng_trip_signheader='[{"id":"member:123","headers":{"apptoken":"xxx","sec-token":"xxx","device":"xxx","cookie":"xxx"},"sign":{"url":"/index/sign","method":"POST","body":"{}"}}]'

*/

const $ = new Env('同程旅行')

// —— 抓包域名与接口路径统一在这里维护，改域名/路径只需改这一处 ——
const HOST = 'app.17u.cn'
const WELFARE_BASE = '/welfarecenter'
const BASE_URL = `https://${HOST}${WELFARE_BASE}`

const CAPTURE_SIGN_INDEX = '/index/signIndex'
const CAPTURE_SIGN = '/index/sign'
const CAPTURE_TASK_LIST = '/task/taskList'
const CAPTURE_ENDPOINTS = [CAPTURE_SIGN_INDEX, CAPTURE_SIGN, CAPTURE_TASK_LIST]

const KEY_SIGNHEADER = 'tongcheng_trip_signheader'
const ENV_SIGNHEADER = 'TONGCHENG_TRIP_SIGNHEADER'
const ENV_VERSION = 'TONGCHENG_TRIP_VERSION'
const DEFAULT_VERSION = '11.3.8'
const SIGN_OK_CODE = 2200
const TASK_WAIT_PADDING = 2
const DEFAULT_TASK_WAIT = 15

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 域名精确匹配（避免把 app.17u.cn.evil.com 之类误判进来）
const HOST_RE = new RegExp(`//${escapeRegExp(HOST)}(?:[/:?#]|$)`)

// 匹配抓包接口路径结尾（兼容相对路径 /index/sign 与完整 URL）
const CAPTURE_TAIL_RE = new RegExp(`(?:${CAPTURE_ENDPOINTS.map(escapeRegExp).join('|')})(?:[?#]|$)`)

// 命中同程抓包接口返回接口常量，否则返回 null。域名必须是 HOST。
function matchCapture(url) {
  if (typeof url !== 'string') return null
  if (!HOST_RE.test(url)) return null
  for (const endpoint of CAPTURE_ENDPOINTS) {
    if (new RegExp(`${escapeRegExp(endpoint)}(?:[?#]|$)`).test(url)) return endpoint
  }
  return null
}

function getTodayDate() {
  return $.time('yyyy-MM-dd')
}

function getVersion() {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[ENV_VERSION] || process.env.tongcheng_trip_version || DEFAULT_VERSION
  }
  return DEFAULT_VERSION
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (e) {
    return fallback
  }
}

function readData(key, envKey) {
  const storeValue = $.getdata(key)
  if (storeValue) return storeValue
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || process.env[envKey] || ''
  }
  return ''
}

function asArray(value) {
  return Array.isArray(value) ? value : [value]
}

function uniqueArray(list) {
  return [...new Set(list.filter((item) => item !== undefined && item !== null && item !== ''))]
}

function parseHeaderText(value) {
  const json = safeJsonParse(value, null)
  if (json) return json

  const headers = {}
  String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf(':')
      if (index > -1) {
        const key = line.slice(0, index).trim()
        const val = line.slice(index + 1).trim()
        if (key && val) headers[key] = val
      }
    })
  return Object.keys(headers).length ? headers : null
}

function normalizeHeaders(headers = {}) {
  const next = {}
  const dropKeys = new Set([
    'host',
    'content-length',
    'accept-encoding',
    'connection',
    'traceparent'
  ])
  ;['aenc', 'denc', 'dp', 'reqdata', 'secsign', 'apmat'].forEach((key) => dropKeys.add(key))
  Object.entries(headers || {}).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase()
    if (!dropKeys.has(lowerKey) && value !== undefined && value !== null && value !== '') {
      next[lowerKey] = value
    }
  })
  return next
}

function getHeader(headers, name) {
  const lowerName = name.toLowerCase()
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === lowerName)
  return key ? headers[key] : ''
}

function maskPhone(value) {
  const phone = String(value || '')
  return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
}

function maskMiddle(value, head = 6, tail = 4) {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= head + tail + 3) return text
  return `${text.slice(0, head)}...${text.slice(-tail)}`
}

function getRespMsg(res) {
  return res?.message || res?.msg || res?.errorMessage || res?.code || '未知错误'
}

function getCookieItem(cookie, key) {
  const match = String(cookie || '').match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`))
  return match ? match[1] : ''
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (e) {
    return value || ''
  }
}

function getSaviorInfo(headers) {
  const cookie = getHeader(headers, 'cookie')
  const raw = getCookieItem(cookie, 'saviorInfo')
  return safeJsonParse(raw, null) || safeJsonParse(safeDecodeURIComponent(raw), null) || {}
}

function getAccountIds(headers) {
  const saviorInfo = getSaviorInfo(headers)
  const first = (...vals) => vals.map((v) => String(v ?? '').trim()).find(Boolean) || ''
  const cookie = getHeader(headers, 'cookie')
  const memberId = first(getHeader(headers, 'memberid'), saviorInfo.memberId, saviorInfo.memberid, saviorInfo.userId, saviorInfo.userid)
  const refId = first(getHeader(headers, 'refid'), saviorInfo.refId, saviorInfo.refid)
  const uid = first(getCookieItem(cookie, 'uid'), getCookieItem(cookie, 'userId'), getCookieItem(cookie, 'memberId'))

  // 账号 ID 不能包含 token 或 device；任一稳定 ID 相同即可视为同一账号。
  return [...new Set([
    memberId && `member:${memberId}`,
    refId && `ref:${refId}`,
    uid && `uid:${uid}`
  ].filter(Boolean))]
}

function findAccountIndex(accounts, headers) {
  const incomingIds = getAccountIds(headers)
  if (!incomingIds.length) return -1
  return accounts.findIndex((account) => {
    const savedIds = new Set([account.id, ...getAccountIds(account.headers)].filter(Boolean))
    return incomingIds.some((id) => savedIds.has(id))
  })
}

function mergeHeaders(oldHeaders = {}, newHeaders = {}) {
  // 新抓包覆盖已变更的 token/Cookie；旧字段只在本次请求未携带时保留。
  return normalizeHeaders({ ...normalizeHeaders(oldHeaders), ...normalizeHeaders(newHeaders) })
}

function compactSignRequest(request) {
  if (!request) return null
  const url = String(request.url || '/index/sign')
    .replace(new RegExp(`^https://${escapeRegExp(HOST)}${escapeRegExp(WELFARE_BASE)}`), '')
  return {
    url: url.startsWith('/') ? url : '/index/sign',
    method: request.method || 'POST',
    body: request.body || ''
  }
}

function getAccountName(account, index, total) {
  const headers = account.headers || {}
  if (account.name) return account.name

  const phone = getHeader(headers, 'phone') || getHeader(headers, 'mobile')
  if (phone) return `账号${index + 1}/${total} ${maskPhone(phone)}`

  const saviorInfo = getSaviorInfo(headers)
  const memberId = getHeader(headers, 'memberid') || saviorInfo.memberid
  const refId = getHeader(headers, 'refid') || saviorInfo.refid
  const device = getHeader(headers, 'device') || getHeader(headers, 'deviceid') || saviorInfo.tc_deviceid

  if (memberId && device) return `账号${index + 1}/${total} ${maskMiddle(memberId, 5, 6)} / 设备${String(device).slice(-6)}`
  if (refId && device) return `账号${index + 1}/${total} refid:${refId} / 设备${String(device).slice(-6)}`
  if (device) return `账号${index + 1}/${total} 设备${String(device).slice(-6)}`
  return `账号${index + 1}/${total}`
}

function normalizeAccountItem(item) {
  if (!item) return null
  if (typeof item === 'string') item = parseHeaderText(item)
  if (!item) return null

  const headers = item.headers || item.header || item
  const sign = compactSignRequest(item.sign || item.signRequest || item.signrequest)
  const account = {
    id: item.id || '',
    name: item.name || item.remark || item.label || '',
    headers: normalizeHeaders(headers),
    sign
  }
  if (!account.id) account.id = getAccountIds(account.headers)[0] || ''
  return account.headers && Object.keys(account.headers).length ? account : null
}

function parseAccounts() {
  const rawHeaders = readData(KEY_SIGNHEADER, ENV_SIGNHEADER)
  const parsedHeaders = parseHeaderText(rawHeaders)

  if (!parsedHeaders) return []

  return asArray(parsedHeaders)
    .map((item) => {
      const account = normalizeAccountItem(item)
      if (!account) return null
      return account
    })
    .filter((account) => account && account.headers && Object.keys(account.headers).length)
}

function getStoredAccounts() {
  const rawHeaders = readData(KEY_SIGNHEADER, ENV_SIGNHEADER)
  const parsedHeaders = parseHeaderText(rawHeaders)
  if (!parsedHeaders) return []
  return asArray(parsedHeaders).map(normalizeAccountItem).filter(Boolean)
}

function saveAccountFromMitm(headers, signRequest = null) {
  const accounts = getStoredAccounts()
  const accountIds = getAccountIds(headers)
  if (!accountIds.length) {
    return { saved: false, total: accounts.length, index: -1, reason: '请求中未发现稳定账号 ID' }
  }

  const index = findAccountIndex(accounts, headers)
  const oldAccount = index > -1 ? accounts[index] : null
  const nextAccount = {
    id: oldAccount?.id || accountIds[0],
    name: oldAccount?.name || '',
    headers: mergeHeaders(oldAccount?.headers, headers),
    sign: signRequest ? compactSignRequest(signRequest) : oldAccount?.sign || null
  }

  if (index > -1) accounts[index] = nextAccount
  else accounts.push(nextAccount)

  $.setdata(JSON.stringify(accounts), KEY_SIGNHEADER)
  return { saved: true, total: accounts.length, index: index > -1 ? index : accounts.length - 1 }
}

function buildBody(body) {
  if (typeof body === 'string') return body || '{}'
  return JSON.stringify(body || {})
}

function withVersion(path) {
  if (!CAPTURE_TAIL_RE.test(path)) return path
  if (/[?&]version=/.test(path)) return path
  return `${path}${path.includes('?') ? '&' : '?'}version=${encodeURIComponent(getVersion())}`
}

function postApi(path, body, headers, options = {}) {
  return new Promise((resolve) => {
    const isJsonObject = typeof body === 'object' && body !== null
    const reqHeaders = normalizeHeaders(headers)
    if (isJsonObject || !reqHeaders['content-type']) {
      reqHeaders['content-type'] = 'application/json'
    }
    const opts = {
      url: path.startsWith('http') ? withVersion(path) : BASE_URL + withVersion(path),
      headers: reqHeaders,
      body: buildBody(body),
      timeout: options.timeout || 20000
    }
    $.post(opts, (err, resp, data) => {
      if (err) {
        $.log(`请求失败: ${opts.url} - ${err}`)
        resolve(null)
        return
      }
      const parsed = safeJsonParse(data)
      if (!parsed) {
        $.log(`响应解析失败: HTTP ${resp?.status || resp?.statusCode || 'unknown'} ${data || ''}`)
      }
      resolve(parsed)
    })
  })
}

function isOk(res) {
  return res && (res.code === SIGN_OK_CODE || res.code === 'SUCCESS' || res.success === true)
}

function signIndex() {
  return postApi('/index/signIndex', {}, $.headers)
}

async function doSignIn() {
  const todayDate = getTodayDate()
  const fallbackBody = { type: 1, day: todayDate }
  const savedSign = $.sign

  if (savedSign) {
    const savedBody = savedSign.body || fallbackBody
    $.log(`用户【${$.phone}】 - 使用已保存的真实签到请求尝试签到`)
    // 始终使用账号当前 headers，避免旧签到请求中的过期 token 覆盖新抓包数据。
    const savedRes = await postApi(savedSign.url || '/index/sign', savedBody, $.headers)
    if (savedRes && savedRes.code === SIGN_OK_CODE) return savedRes
    $.log(`用户【${$.phone}】 - 真实签到请求失败，回退为默认签到参数：${getRespMsg(savedRes)}`)
  }

  return postApi('/index/sign', fallbackBody, $.headers)
}

function getTaskList() {
  return postApi('/task/taskList', {}, $.headers)
}

function taskStart(taskCode) {
  return postApi('/task/start', { taskCode }, $.headers)
}

function taskStartV2(taskCode) {
  return postApi('/task/startV2', { taskCode }, $.headers)
}

function taskVisit(task) {
  const body = {}
  ;[
    'id',
    'taskId',
    'taskCode',
    'taskType',
    'type',
    'title',
    'url',
    'jumpUrl',
    'redirectUrl',
    'linkUrl',
    'browserTime',
    'stayTime'
  ].forEach((key) => {
    if (task[key] !== undefined && task[key] !== null && task[key] !== '') body[key] = task[key]
  })
  if (!Object.keys(body).length && task.taskCode) body.taskCode = task.taskCode
  return postApi('/index/visit', body, $.headers)
}

function taskFinish(taskId) {
  return postApi('/task/finish', { id: taskId }, $.headers)
}

function taskReceive(taskId) {
  return postApi('/task/receive', { id: taskId }, $.headers)
}

function getTaskTitle(task) {
  return task.title || task.taskName || task.name || task.taskTitle || task.taskCode || task.id || '未知任务'
}

function getTaskCode(task) {
  return task.taskCode || task.code || task.taskId || task.id
}

function getTaskWaitSeconds(task) {
  const value = Number(task.browserTime ?? task.stayTime ?? task.waitTime ?? task.browseTime)
  if (Number.isFinite(value) && value > 0) return value
  return DEFAULT_TASK_WAIT
}

function isTaskPending(task) {
  if (task.state !== undefined && task.state !== null && task.state !== '') {
    if (typeof task.state === 'string') return /^(1|TODO|INIT|PROCESSING|WAIT|DOING|未完成|待完成|进行中)$/i.test(task.state)
    return Number(task.state) === 1
  }
  const status = task.status ?? task.taskStatus
  if (status === undefined || status === null || status === '') return true
  if (typeof status === 'string') return /^(0|1|TODO|INIT|PROCESSING|WAIT|DOING|未完成|待完成|进行中)$/i.test(status)
  return Number(status) === 0 || Number(status) === 1
}

function getStartTaskId(startRes, task) {
  const data = startRes?.data
  if (typeof data === 'string' || typeof data === 'number') return data
  return data?.id || data?.taskId || data?.completeTaskId || data?.recordId || task.id || task.taskId || task.completeTaskId
}

async function startTask(task) {
  const taskCode = getTaskCode(task)
  if (!taskCode) return { ok: false, taskId: task.id || task.taskId || '', msg: '缺少 taskCode' }

  const startV2Res = await taskStartV2(taskCode)
  if (isOk(startV2Res)) {
    return { ok: true, taskId: getStartTaskId(startV2Res, task), res: startV2Res, api: 'startV2' }
  }

  $.log(`用户【${$.phone}】 - startV2 未完成【${getTaskTitle(task)}】，尝试 visit/start：${getRespMsg(startV2Res)}`)
  const visitRes = await taskVisit(task)
  if (isOk(visitRes)) {
    return { ok: true, taskId: getStartTaskId(visitRes, task), res: visitRes, api: 'visit' }
  }

  const startRes = await taskStart(taskCode)
  if (isOk(startRes)) {
    return { ok: true, taskId: getStartTaskId(startRes, task), res: startRes, api: 'start' }
  }

  return { ok: false, taskId: task.id || task.taskId || '', msg: getRespMsg(startRes || visitRes || startV2Res) }
}

function uniqueTasks(tasks) {
  const seen = new Set()
  return tasks.filter((task) => {
    const key = [getTaskCode(task), task.id, task.taskId, getTaskTitle(task)].filter(Boolean).join('|')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function runSignIn() {
  $.accountResult = ''
  $.signSuccess = false
  $.tokenInvalid = false

  const signIndexRes = await signIndex()
  if (!signIndexRes) return
  if (signIndexRes.code !== SIGN_OK_CODE) {
    $.log(`用户【${$.phone}】 - token 失效或接口返回异常：${getRespMsg(signIndexRes)}`)
    $.tokenInvalid = true
    $.accountResult = `📱 账号：${$.phone}\n❌ token 失效，请重新抓包获取\n\n`
    return $.accountResult
  }

  const todaySign = signIndexRes.data?.todaySign
  const mileage = signIndexRes.data?.mileageBalance?.mileage ?? 0
  $.log(`用户【${$.phone}】 - 今日${todaySign ? '已' : '未'}签到，当前剩余里程 ${mileage}！`)

  if (todaySign) {
    $.log(`用户【${$.phone}】 - 今日已签到，开始获取任务列表`)
    $.signSuccess = true
  } else {
    $.log(`用户【${$.phone}】 - 今日未签到，开始执行签到`)
    const signRes = await doSignIn()
    if (signRes && signRes.code === SIGN_OK_CODE) {
      $.log(`用户【${$.phone}】 - 签到成功！`)
      $.signSuccess = true
    } else {
      $.log(`用户【${$.phone}】 - 签到失败！${getRespMsg(signRes)}`)
    }
  }

  const taskListRes = await getTaskList()
  if (taskListRes && taskListRes.code === SIGN_OK_CODE && Array.isArray(taskListRes.data)) {
    const tasks = uniqueTasks(taskListRes.data.filter(isTaskPending))
    $.log(`用户【${$.phone}】 - 检测到 ${tasks.length} 个待处理任务`)
    for (const task of tasks) {
      const title = getTaskTitle(task)
      const browserTime = getTaskWaitSeconds(task)
      $.log(`用户【${$.phone}】 - 开始做任务【${title}】，需要浏览 ${browserTime} 秒`)
      const startResult = await startTask(task)
      if (startResult.ok) {
        const taskId = startResult.taskId
        $.log(`用户【${$.phone}】 - 任务【${title}】已触发：${startResult.api}${taskId ? ` / ${taskId}` : ''}`)
        await $.wait((browserTime + TASK_WAIT_PADDING) * 1000)
        let finishOk = false
        for (let attempt = 0; attempt < 3; attempt++) {
          const finishRes = await taskFinish(taskId)
          if (isOk(finishRes)) {
            $.log(`用户【${$.phone}】 - 完成任务【${title}】成功！开始领取奖励`)
            finishOk = true
            break
          }
          if (attempt < 2) {
            $.log(`用户【${$.phone}】 - 完成任务【${taskId}】失败，第 ${attempt + 1} 次重试...`)
            await $.wait(2000 * (attempt + 1))
          }
        }
        if (finishOk) {
          const receiveRes = await taskReceive(taskId)
          if (isOk(receiveRes)) {
            $.log(`用户【${$.phone}】 - 领取任务奖励成功！开始下一个任务`)
          } else {
            $.log(`用户【${$.phone}】 - 领取任务奖励失败或无需领取：${getRespMsg(receiveRes)}`)
          }
        }
      } else {
        $.log(`用户【${$.phone}】 - 触发任务【${title}】失败：${startResult.msg}`)
      }
    }
  }

  const mileageRes = await postApi('/index/signIndex', {}, $.headers)
  if (mileageRes && mileageRes.code === SIGN_OK_CODE && mileageRes.data) {
    const d = mileageRes.data
    const cycleSignNum = d.cycleSighNum
    const mileage2 = d.mileageBalance?.mileage ?? 0
    const todayMileage = d.mileageBalance?.todayMileage ?? 0
    $.log(`用户【${$.phone}】 - 本月签到 ${cycleSignNum} 天，今日共获取 ${todayMileage} 里程，当前剩余里程 ${mileage2}`)
    const statusIcon = $.signSuccess ? '✨️' : '❗️'
    const resultText = $.signSuccess
      ? `${statusIcon} 签到成功，本月签到【${cycleSignNum}】天`
      : `${statusIcon} 签到暂不可用，请前往 APP 手动签到！\n🈷️ 本月签到【${cycleSignNum}】天`
    $.accountResult = `📱 账号：${$.phone}\n${resultText}\n🎁 当前里程: 【${mileage2}】(+${todayMileage})\n\n`
  } else {
    $.accountResult = `📱 账号：${$.phone}\n`
    if ($.signSuccess) $.accountResult += '✅ 签到成功（但获取里程信息失败）\n\n'
    else $.accountResult += '❌ 签到失败且获取里程信息失败\n\n'
  }

  let title = '✈️ 同程旅行签到结果\n'
  if ($.tokenInvalid) title += ' ⚠️ Token 失效'
  return $.accountResult
}

async function runAllAccounts() {
  const accounts = parseAccounts()
  if (!accounts.length) {
    $.log('未获取到 Cookie，请先通过 MiTM 获取：在 APP 打开「领福利」')
    $.msg($.name, '', `请在青龙添加环境变量 ${KEY_SIGNHEADER} 或 ${ENV_SIGNHEADER}`)
    return
  }

  const results = []
  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index]
    $.headers = normalizeHeaders(account.headers)
    $.sign = account.sign
    $.phone = getAccountName(account, index, accounts.length)
    $.log(`\n开始执行用户【${$.phone}】`)
    const result = await runSignIn()
    if (result) results.push(result.trim())
  }

  $.msg('✈️ 同程旅行签到结果', '', results.join('\n\n').trim())
}

// 入口：只有 signIndex 可写账号变量。
// QX 会并发触发多个 rewrite 实例；若 task/sign 也读写整个数组，旧实例会覆盖新账号。
const isRequest =
  typeof $request !== 'undefined' &&
  $request &&
  typeof $request.url === 'string' &&
  $request.headers
const isMitmRequest = isRequest && matchCapture($request.url) === CAPTURE_SIGN_INDEX
if (isRequest) {
  if ($request.method !== 'OPTIONS') {
    if (isMitmRequest) {
      const saved = saveAccountFromMitm(normalizeHeaders($request.headers))
      if (!saved.saved) {
        $.msg($.name, '未保存账号', saved.reason || '请求数据不完整')
      } else {
        $.msg($.name, '同程旅行账户已更新', `仅从 signIndex 保存会话，当前共 ${saved.total} 个账号`)
      }
    } else {
      $.done()
    }
    $.done()
  } else {
    $.log('获取同程旅行账户失败')
    $.done()
  }
} else {
  !(async () => {
    await runAllAccounts()
  })()
    .catch((e) => $.logErr(e))
    .finally(() => $.done())
}


function Env(e,t){class s{constructor(e){this.env=e}send(e,t="GET"){e="string"==typeof e?{url:e}:e;let s=this.get;"POST"===t&&(s=this.post);const i=new Promise(((t,i)=>{s.call(this,e,((e,s,o)=>{e?i(e):t(s)}))}));return e.timeout?((e,t=1e3)=>Promise.race([e,new Promise(((e,s)=>{setTimeout((()=>{s(new Error("请求超时"))}),t)}))]))(i,e.timeout):i}get(e){return this.send.call(this.env,e)}post(e){return this.send.call(this.env,e,"POST")}}return new class{constructor(e,t){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=e,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,t),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(e,t=null){try{return JSON.parse(e)}catch{return t}}toStr(e,t=null,...s){try{return JSON.stringify(e,...s)}catch{return t}}getjson(e,t){let s=t;if(this.getdata(e))try{s=JSON.parse(this.getdata(e))}catch{}return s}setjson(e,t){try{return this.setdata(JSON.stringify(e),t)}catch{return!1}}getScript(e){return new Promise((t=>{this.get({url:e},((e,s,i)=>t(i)))}))}runScript(e,t){return new Promise((s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=t&&t.timeout?t.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:e,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,((e,t,i)=>s(i)))})).catch((e=>this.logErr(e)))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(this.dataFile),t=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(e),i=!s&&this.fs.existsSync(t);if(!s&&!i)return{};{const i=s?e:t;try{return JSON.parse(this.fs.readFileSync(i))}catch(e){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(this.dataFile),t=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(e),i=!s&&this.fs.existsSync(t),o=JSON.stringify(this.data);s?this.fs.writeFileSync(e,o):i?this.fs.writeFileSync(t,o):this.fs.writeFileSync(e,o)}}lodash_get(e,t,s){const i=t.replace(/\[(\d+)\]/g,".$1").split(".");let o=e;for(const e of i)if(o=Object(o)[e],void 0===o)return s;return o}lodash_set(e,t,s){return Object(e)!==e||(Array.isArray(t)||(t=t.toString().match(/[^.[\]]+/g)||[]),t.slice(0,-1).reduce(((e,s,i)=>Object(e[s])===e[s]?e[s]:e[s]=Math.abs(t[i+1])>>0==+t[i+1]?[]:{}),e)[t[t.length-1]]=s),e}getdata(e){let t=this.getval(e);if(/^@/.test(e)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(e),o=s?this.getval(s):"";if(o)try{const e=JSON.parse(o);t=e?this.lodash_get(e,i,""):t}catch(e){t=""}}return t}setdata(e,t){let s=!1;if(/^@/.test(t)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(t),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const t=JSON.parse(a);this.lodash_set(t,o,e),s=this.setval(JSON.stringify(t),i)}catch(t){const r={};this.lodash_set(r,o,e),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(e,t);return s}getval(e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(e);case"Quantumult X":return $prefs.valueForKey(e);case"Node.js":return this.data=this.loaddata(),this.data[e];default:return this.data&&this.data[e]||null}}setval(e,t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(e,t);case"Quantumult X":return $prefs.setValueForKey(e,t);case"Node.js":return this.data=this.loaddata(),this.data[t]=e,this.writedata(),!0;default:return this.data&&this.data[t]||null}}initGotEnv(e){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,e&&(e.headers=e.headers?e.headers:{},e&&(e.headers=e.headers?e.headers:{},void 0===e.headers.cookie&&void 0===e.headers.Cookie&&void 0===e.cookieJar&&(e.cookieJar=this.ckjar)))}get(e,t=(()=>{})){switch(e.headers&&(delete e.headers["Content-Type"],delete e.headers["Content-Length"],delete e.headers["content-type"],delete e.headers["content-length"]),e.params&&(e.url+="?"+this.queryStr(e.params)),void 0===e.followRedirect||e.followRedirect||((this.isSurge()||this.isLoon())&&(e["auto-redirect"]=!1),this.isQuanX()&&(e.opts?e.opts.redirection=!1:e.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(e.headers=e.headers||{},Object.assign(e.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(e,((e,s,i)=>{!e&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),t(e,s,i)}));break;case"Quantumult X":this.isNeedRewrite&&(e.opts=e.opts||{},Object.assign(e.opts,{hints:!1})),$task.fetch(e).then((e=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=e;t(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(e=>t(e&&e.error||"UndefinedError")));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(e),this.got(e).on("redirect",((e,t)=>{try{if(e.headers["set-cookie"]){const s=e.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),t.cookieJar=this.ckjar}}catch(e){this.logErr(e)}})).then((e=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=e,n=s.decode(a,this.encoding);t(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)}),(e=>{const{message:i,response:o}=e;t(i,o,o&&s.decode(o.rawBody,this.encoding))}));break}}post(e,t=(()=>{})){const s=e.method?e.method.toLocaleLowerCase():"post";switch(e.body&&e.headers&&!e.headers["Content-Type"]&&!e.headers["content-type"]&&(e.headers["content-type"]="application/x-www-form-urlencoded"),e.headers&&(delete e.headers["Content-Length"],delete e.headers["content-length"]),void 0===e.followRedirect||e.followRedirect||((this.isSurge()||this.isLoon())&&(e["auto-redirect"]=!1),this.isQuanX()&&(e.opts?e.opts.redirection=!1:e.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(e.headers=e.headers||{},Object.assign(e.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](e,((e,s,i)=>{!e&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),t(e,s,i)}));break;case"Quantumult X":e.method=s,this.isNeedRewrite&&(e.opts=e.opts||{},Object.assign(e.opts,{hints:!1})),$task.fetch(e).then((e=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=e;t(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(e=>t(e&&e.error||"UndefinedError")));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(e);const{url:o,...r}=e;this.got[s](o,r).then((e=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=e,n=i.decode(a,this.encoding);t(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)}),(e=>{const{message:s,response:o}=e;t(s,o,o&&i.decode(o.rawBody,this.encoding))}));break}}time(e,t=null){const s=t?new Date(t):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(e)&&(e=e.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let t in i)new RegExp("("+t+")").test(e)&&(e=e.replace(RegExp.$1,1==RegExp.$1.length?i[t]:("00"+i[t]).substr((""+i[t]).length)));return e}queryStr(e){let t="";for(const s in e){let i=e[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),t+=`${s}=${i}&`)}return t=t.substring(0,t.length-1),t}msg(t=e,s="",i="",o={}){const r=e=>{const{$open:t,$copy:s,$media:i,$mediaMime:o}=e;switch(typeof e){case void 0:return e;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:e};case"Loon":case"Shadowrocket":return e;case"Quantumult X":return{"open-url":e};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{const r={};let a=e.openUrl||e.url||e["open-url"]||t;a&&Object.assign(r,{action:"open-url",url:a});let n=e["update-pasteboard"]||e.updatePasteboard||s;n&&Object.assign(r,{action:"clipboard",text:n});let h=e.mediaUrl||e["media-url"]||i;if(h){let e,t;if(h.startsWith("http"));else if(h.startsWith("data:")){const[s]=h.split(";"),[,i]=h.split(",");e=i,t=s.replace("data:","")}else{e=h,t=(e=>{const t={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in t)if(0===e.indexOf(s))return t[s];return null})(h)}Object.assign(r,{"media-url":h,"media-base64":e,"media-base64-mime":o??t})}return Object.assign(r,{"auto-dismiss":e["auto-dismiss"],sound:e.sound}),r}case"Loon":{const s={};let o=e.openUrl||e.url||e["open-url"]||t;o&&Object.assign(s,{openUrl:o});let r=e.mediaUrl||e["media-url"]||i;return r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=e["open-url"]||e.url||e.openUrl||t;r&&Object.assign(o,{"open-url":r});let a=e.mediaUrl||e["media-url"]||i;a&&Object.assign(o,{"media-url":a});let n=e["update-pasteboard"]||e.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(t,s,i,r(o));break;case"Quantumult X":$notify(t,s,i,r(o));break;case"Node.js":break}if(!this.isMuteLog){let e=["","==============📣系统通知📣=============="];e.push(t),s&&e.push(s),i&&e.push(i),console.log(e.join("\n")),this.logs=this.logs.concat(e)}}debug(...e){this.logLevels[this.logLevel]<=this.logLevels.debug&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.debug}${e.map((e=>e??String(e))).join(this.logSeparator)}`))}info(...e){this.logLevels[this.logLevel]<=this.logLevels.info&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.info}${e.map((e=>e??String(e))).join(this.logSeparator)}`))}warn(...e){this.logLevels[this.logLevel]<=this.logLevels.warn&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.warn}${e.map((e=>e??String(e))).join(this.logSeparator)}`))}error(...e){this.logLevels[this.logLevel]<=this.logLevels.error&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.error}${e.map((e=>e??String(e))).join(this.logSeparator)}`))}log(...e){e.length>0&&(this.logs=[...this.logs,...e]),console.log(e.map((e=>e??String(e))).join(this.logSeparator))}logErr(e,t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t,e);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t,void 0!==e.message?e.message:e,e.stack);break}}wait(e){return new Promise((t=>setTimeout(t,e)))}done(e={}){const t=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${t} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(e);break;case"Node.js":process.exit(0)}}}(e,t)}
