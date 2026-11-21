/**
 * js/api/client.js —— 后端 API 统一入口
 * =====================================
 *
 * 前端只通过这个文件和 Flask 通信，所有请求都是 HTTP + JSON。
 * 默认后端地址：http://127.0.0.1:5000
 *
 * 可覆盖方式：
 *   window.SAP_API_BASE = "http://192.168.1.10:5000";
 *   或 setApiBase("http://...")
 *
 * 降级策略：
 *   网络失败 / 超时 → 返回 { offline: true }，页面改存 localStorage；
 *   HTTP 401       → 清除本地 token，页面回到未登录状态。
 */

const DEFAULT_BASE = "http://127.0.0.1:5000";
const TOKEN_KEY = "token";
const USER_KEY = "user";
const TOKEN_TTL = 7 * 24 * 3600; // 7 天

function store() {
  // storage.js 会暴露 window.SapStorage；window.Storage 是浏览器内置接口，不能直接用
  const s = window.SapStorage || null;
  return s && typeof s.get === "function" && typeof s.set === "function" ? s : null;
}

/** 给其他模块复用同一个存储入口，避免各自去猜 window.Storage / window.SapStorage */
export function getStorage() {
  return store();
}

export function getApiBase() {
  if (window.SAP_API_BASE) {
    return String(window.SAP_API_BASE).replace(/\/+$/, "");
  }
  const saved = store() ? store().get("api_base", "") : "";
  return String(saved || DEFAULT_BASE).replace(/\/+$/, "");
}

export function setApiBase(base) {
  const s = store();
  if (s) s.set("api_base", String(base || "").replace(/\/+$/, ""));
}

export function getToken() {
  const s = store();
  return s ? s.get(TOKEN_KEY, null) : null;
}

export function getCurrentUser() {
  const s = store();
  return s ? s.get(USER_KEY, null) : null;
}

export function setSession(token, user) {
  const s = store();
  if (!s) return;
  s.set(TOKEN_KEY, token, { expires: TOKEN_TTL });
  s.set(USER_KEY, user || null, { expires: TOKEN_TTL });
}

export function setCurrentUser(user) {
  const s = store();
  if (s) s.set(USER_KEY, user || null, { expires: TOKEN_TTL });
}

export function clearSession() {
  const s = store();
  if (!s) return;
  s.remove(TOKEN_KEY);
  s.remove(USER_KEY);
}

/**
 * 统一请求方法
 * @param {string} path 例如 "/api/reports"
 * @param {object} options { method, body, headers, timeout }
 * @returns {Promise<{ok,status,code,message,data,errors,offline}>}
 */
export async function request(path, options) {
  options = options || {};
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = options.timeout || 8000;
  let timer = null;

  if (controller) {
    timer = setTimeout(function () {
      controller.abort();
    }, timeout);
  }

  try {
    const headers = Object.assign({}, options.headers || {});
    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const token = getToken();
    if (token && !headers.Authorization) {
      headers.Authorization = "Bearer " + token;
    }

    const response = await fetch(getApiBase() + path, {
      method: options.method || "GET",
      headers: headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: controller ? controller.signal : undefined,
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (e) {
        payload = null;
      }
    }

    if (response.status === 401) {
      clearSession();
    }

    return {
      ok: response.ok,
      status: response.status,
      code: payload && payload.code !== undefined ? payload.code : response.status,
      message: (payload && payload.message) || (response.ok ? "" : "请求失败（HTTP " + response.status + "）"),
      data: payload ? payload.data : null,
      errors: (payload && payload.errors) || [],
      offline: false,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: 0,
      message: err && err.name === "AbortError" ? "请求超时" : "后端不可用",
      data: null,
      errors: [],
      offline: true,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 探活：只判断后端是否在线，不写审计日志 */
export function ping() {
  return request("/api/ping", { timeout: 3000 });
}
