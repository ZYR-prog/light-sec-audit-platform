/**
 * js/pages/scan-page.js —— 审计任务页控制器
 * ==========================================
 *
 * 串起：
 *   文件读取（file-reader.js）
 *     → 规则扫描（scan.js）
 *     → 结果渲染
 *     → 登录用户存后端 / 未登录存 localStorage
 *     → 历史记录加载与删除
 *
 * 后端接口见 js/api/reports.js。
 */

import { scanText, summarize } from "../core/scan.js";
import { readFileAsText } from "../core/file-reader.js";
import {
  ping,
  getToken,
  getCurrentUser,
  setCurrentUser,
  getStorage,
} from "../api/client.js";
import { login, register, logout, me } from "../api/auth.js";
import {
  saveFileReport,
  listFileReports,
  getReport,
  deleteReport,
} from "../api/reports.js";
import {
  saveLocalReport,
  listLocalReports,
  getLocalReport,
  deleteLocalReport,
} from "../api/local-reports.js";

const $ = function (id) {
  return document.getElementById(id);
};

const els = {
  fileInput: $("upload-file-input"),
  startBtn: $("scan-start-btn"),
  sampleBtn: $("scan-sample-btn"),
  dropZone: $("drop-zone"),
  progress: $("scan-progress-bar"),
  status: $("scan-status-tip"),
  saveStatus: $("scan-save-status"),
  tableBody: $("result-table-body"),
  resultSummary: $("result-summary"),
  historyList: $("history-list"),
  historyRefresh: $("history-refresh-btn"),
  connection: $("connection-status"),
  authStatus: $("auth-status"),
  loginBtn: $("login-open-btn"),
  logoutBtn: $("logout-btn"),
  authModal: $("auth-modal"),
  authTitle: $("auth-title"),
  authUsername: $("auth-username"),
  authPassword: $("auth-password"),
  authError: $("auth-error"),
  authSubmit: $("auth-submit"),
  authSwitch: $("auth-switch"),
  authSwitchTip: $("auth-switch-tip"),
  authClose: $("auth-close"),
  modalContainer: $("modal-container"),
};

let backendOnline = false;
let busy = false;
let authMode = "login";
let currentResult = null;
let currentReportNo = null;

/* ================================================================
 * 一、通用小工具
 * ================================================================ */

function setText(el, text) {
  if (el) el.textContent = text;
}

function show(el, visible) {
  if (el) el.classList.toggle("hidden", !visible);
}

function setProgress(percent, text) {
  if (els.progress) {
    els.progress.style.width = Math.max(0, Math.min(100, percent)) + "%";
  }
  if (text) setText(els.status, text);
}

function setStatus(text) {
  setText(els.status, text);
}

function setSaveStatus(text, tone) {
  if (!els.saveStatus) return;
  const colors = {
    ok: "text-emerald-400",
    warn: "text-yellow-400",
    error: "text-red-400",
    info: "text-gray-400",
  };
  els.saveStatus.className = "text-xs text-center mt-2 " + (colors[tone] || colors.info);
  els.saveStatus.textContent = text || "";
}

function setBusy(value) {
  busy = value;
  [els.startBtn, els.sampleBtn].forEach(function (btn) {
    if (!btn) return;
    btn.disabled = value;
    btn.classList.toggle("opacity-50", value);
    btn.classList.toggle("cursor-not-allowed", value);
  });
}

function truncate(text, max) {
  text = String(text || "");
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  if (window.Utils && window.Utils.formatDate) {
    return window.Utils.formatDate(date, "YYYY-MM-DD HH:mm");
  }
  return date.toLocaleString();
}

function isLocalReport(item) {
  return !!(item && (item.local || String(item.report_no || "").indexOf("local_") === 0));
}

function levelClass(level) {
  if (level === "高危") return "risk-high";
  if (level === "中危") return "risk-mid";
  return "risk-low";
}

function formatApiError(result) {
  if (!result) return "操作失败";
  if (result.offline) {
    return "后端不可用，请确认 Flask 已启动（" + "http://127.0.0.1:5000）";
  }
  if (result.errors && result.errors.length) {
    return result.errors.map(function (item) {
      return item.message;
    }).join("；");
  }
  return result.message || "操作失败";
}

/* ================================================================
 * 二、扫描结果渲染
 * ================================================================ */

function addCell(row, text, className) {
  const cell = document.createElement("td");
  cell.className = "px-4 py-2 " + (className || "");
  cell.textContent = text;
  row.appendChild(cell);
}

function renderResult(result) {
  currentResult = result;
  const vulList = Array.isArray(result.vul_list) ? result.vul_list : [];
  els.tableBody.innerHTML = "";

  if (!vulList.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "text-center text-gray-500 py-6";
    cell.textContent = "未检出风险项";
    row.appendChild(cell);
    els.tableBody.appendChild(row);
  } else {
    vulList.forEach(function (item, index) {
      const row = document.createElement("tr");
      row.className = "border-t border-gray-700 hover:bg-gray-700/30";

      addCell(row, String(index + 1), "text-gray-400");
      addCell(row, item.vname || "-", "font-medium");

      const levelCell = document.createElement("td");
      levelCell.className = "px-4 py-2";
      const badge = document.createElement("span");
      badge.className = "risk-badge " + levelClass(item.level);
      badge.textContent = item.level || "-";
      levelCell.appendChild(badge);
      row.appendChild(levelCell);

      addCell(row, "第 " + (item.line || "-") + " 行", "text-gray-400");
      addCell(row, truncate(item.description, 50), "text-gray-400");

      const actionCell = document.createElement("td");
      actionCell.className = "px-4 py-2";
      const detailBtn = document.createElement("button");
      detailBtn.className = "text-cyan-400 hover:underline";
      detailBtn.textContent = "详情";
      detailBtn.addEventListener("click", function () {
        openDetail(item);
      });
      actionCell.appendChild(detailBtn);
      row.appendChild(actionCell);

      els.tableBody.appendChild(row);
    });
  }

  if (result && result.stat) {
    setText(els.resultSummary, summarize(result));
  } else {
    setText(els.resultSummary, "暂无结果");
  }
}

function openDetail(item) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4";

  const box = document.createElement("div");
  box.className = "bg-gray-800 rounded-lg w-full max-w-lg p-6 relative max-h-[85vh] overflow-auto";

  const close = document.createElement("button");
  close.className = "absolute top-3 right-3 text-gray-400 hover:text-white";
  close.textContent = "✕";
  close.addEventListener("click", function () {
    overlay.remove();
  });
  box.appendChild(close);

  const title = document.createElement("h3");
  title.className = "text-lg font-semibold mb-1 pr-6";
  title.textContent = item.vname || "漏洞详情";
  box.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "text-xs text-gray-500 mb-4";
  meta.textContent = (item.vid || "-") + " · " + (item.level || "-") + " · 第 " + (item.line || "-") + " 行";
  box.appendChild(meta);

  [
    ["文件", item.file_name],
    ["命中内容", item.hit_content],
    ["说明", item.description],
    ["修复建议", item.suggestion],
  ].forEach(function (pair) {
    const p = document.createElement("p");
    p.className = "text-sm text-gray-300 mb-3 leading-relaxed";
    const label = document.createElement("span");
    label.className = "text-gray-500";
    label.textContent = pair[0] + "：";
    p.appendChild(label);
    p.appendChild(document.createTextNode(pair[1] || "-"));
    box.appendChild(p);
  });

  overlay.appendChild(box);
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) overlay.remove();
  });
  els.modalContainer.appendChild(overlay);
}

/* ================================================================
 * 三、保存：登录存后端，未登录/失败存本地
 * ================================================================ */

async function persistResult(result) {
  // 报告页 / 仪表盘读的是同一个 key（scanResult），保证跨页面能拿到最近一次结果
  const storage = getStorage();
  if (storage) storage.set("scanResult", result);
  window.dispatchEvent(new CustomEvent("scan:complete", { detail: result }));

  const token = getToken();

  if (token) {
    const saved = await saveFileReport(result);
    if (saved.ok && saved.data) {
      backendOnline = true;
      updateConnection();
      currentReportNo = saved.data.report_no;
      setSaveStatus("已保存到云端 · " + currentReportNo, "ok");
      return;
    }

    if (saved.offline) {
      backendOnline = false;
      updateConnection();
      setSaveStatus("后端不可用，已改存本地", "warn");
    } else if (saved.status === 401) {
      setSaveStatus("登录已过期，已改存本地", "warn");
      refreshAuthUI();
    } else {
      setSaveStatus("云端保存失败：" + saved.message + "，已改存本地", "warn");
    }
  } else {
    setSaveStatus("未登录，已保存到本地（不跨设备）", "warn");
  }

  const local = saveLocalReport(result);
  currentReportNo = local.report_no;
}

/* ================================================================
 * 四、扫描流程
 * ================================================================ */

async function scanFiles(files) {
  const list = Array.prototype.slice.call(files || []);
  if (!list.length || busy) return;

  setBusy(true);
  let totalVul = 0;

  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    setProgress((i / list.length) * 100, "读取 " + file.name + "（" + (i + 1) + "/" + list.length + "）...");

    try {
      const text = await readFileAsText(file);
      setStatus("正在扫描 " + file.name + "（" + (i + 1) + "/" + list.length + "）...");
      const result = await scanText(text, file.name);
      renderResult(result);
      totalVul += result.stat.total;
      await persistResult(result);
    } catch (err) {
      setSaveStatus("处理 " + file.name + " 失败：" + (err && err.message ? err.message : err), "error");
    }

    setProgress(((i + 1) / list.length) * 100, "已完成 " + (i + 1) + "/" + list.length);
  }

  setStatus("完成：共 " + list.length + " 个文件，" + totalVul + " 条风险");
  await refreshAuthUI();
  await refreshHistory();
  setBusy(false);
}

async function scanSample() {
  if (busy) return;
  setBusy(true);
  setProgress(20, "加载示例文件...");

  try {
    const response = await fetch("../test-samples/configs/sshd_bad.conf", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("示例文件加载失败（HTTP " + response.status + "）");
    }
    const text = await response.text();
    setProgress(50, "正在扫描示例配置...");
    const result = await scanText(text, "sshd_bad.conf");
    renderResult(result);
    await persistResult(result);
    setProgress(100, "示例扫描完成");
    setStatus("示例扫描完成：" + summarize(result));
    await refreshAuthUI();
    await refreshHistory();
  } catch (err) {
    setSaveStatus("示例扫描失败：" + (err && err.message ? err.message : err), "error");
    setProgress(0, "待开始...");
  } finally {
    setBusy(false);
  }
}

/* ================================================================
 * 五、登录 / 注册
 * ================================================================ */

function refreshAuthUI() {
  const token = getToken();
  const user = getCurrentUser();

  if (!token) {
    setText(els.authStatus, "未登录（结果只存本地）");
    show(els.loginBtn, true);
    show(els.logoutBtn, false);
    return;
  }

  setText(els.authStatus, "已登录：" + ((user && user.username) || "用户"));
  show(els.loginBtn, false);
  show(els.logoutBtn, true);
}

function applyAuthMode() {
  const isLogin = authMode === "login";
  setText(els.authTitle, isLogin ? "登录" : "注册");
  setText(els.authSubmit, isLogin ? "登录" : "注册并登录");
  setText(els.authSwitchTip, isLogin ? "还没有账号？" : "已有账号？");
  setText(els.authSwitch, isLogin ? "去注册" : "去登录");
  els.authPassword.autocomplete = isLogin ? "current-password" : "new-password";
}

function openAuthModal(mode) {
  authMode = mode || "login";
  applyAuthMode();
  show(els.authError, false);
  els.authModal.classList.remove("hidden");
  els.authUsername.focus();
}

function closeAuthModal() {
  els.authModal.classList.add("hidden");
}

function showAuthError(text) {
  els.authError.textContent = text;
  els.authError.classList.remove("hidden");
}

async function submitAuth() {
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;

  if (!username || !password) {
    showAuthError("请输入用户名和密码");
    return;
  }

  els.authSubmit.disabled = true;
  els.authSubmit.textContent = "处理中...";

  try {
    const result = authMode === "login"
      ? await login(username, password)
      : await register(username, password);

    if (result.ok) {
      backendOnline = true;
      updateConnection();
      closeAuthModal();
      els.authPassword.value = "";
      refreshAuthUI();
      await refreshHistory();
      setSaveStatus(authMode === "login" ? "登录成功" : "注册成功，已自动登录", "ok");
    } else {
      showAuthError(formatApiError(result));
    }
  } finally {
    els.authSubmit.disabled = false;
    applyAuthMode();
  }
}

async function initAuth() {
  if (!getToken()) return;

  const result = await me();
  if (result.ok && result.data) {
    setCurrentUser(result.data);
  } else if (result.status === 401) {
    logout();
  } else if (result.offline) {
    backendOnline = false;
    updateConnection();
  }
  refreshAuthUI();
}

/* ================================================================
 * 六、历史记录
 * ================================================================ */

async function refreshHistory() {
  let cloud = [];
  const local = listLocalReports();

  if (getToken() && backendOnline) {
    const result = await listFileReports(1, 10);
    if (result.ok) {
      cloud = (result.data && result.data.list) || [];
    } else if (result.offline) {
      backendOnline = false;
      updateConnection();
    } else if (result.status === 401) {
      refreshAuthUI();
    }
  }

  const items = cloud.concat(local).sort(function (a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  }).slice(0, 10);

  renderHistory(items);
}

function renderHistory(items) {
  els.historyList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "text-gray-500 text-sm text-center py-6";
    empty.textContent = "暂无历史记录，先扫描一个文件试试";
    els.historyList.appendChild(empty);
    return;
  }

  items.forEach(function (item) {
    const local = isLocalReport(item);
    const stat = item.stat || { high: 0, mid: 0, low: 0, total: 0 };

    const row = document.createElement("div");
    row.className = "flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-gray-900 rounded p-3 border border-gray-700";

    const info = document.createElement("div");
    const title = document.createElement("p");
    title.className = "text-sm font-medium";
    title.textContent = item.file_name || "未命名文件";

    const meta = document.createElement("p");
    meta.className = "text-xs text-gray-500 mt-1";
    meta.textContent = formatTime(item.created_at) +
      " · 高危 " + (stat.high || 0) +
      " / 中危 " + (stat.mid || 0) +
      " / 低危 " + (stat.low || 0) +
      " · 共 " + (stat.total || 0) + " 条" +
      (local ? " · 本地" : " · 云端");

    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "flex gap-2";

    const loadBtn = document.createElement("button");
    loadBtn.className = "text-sm bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1.5 rounded";
    loadBtn.textContent = "载入";
    loadBtn.addEventListener("click", function () {
      loadHistoryItem(item);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "text-sm bg-gray-700 hover:bg-red-700 text-gray-200 px-3 py-1.5 rounded";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", function () {
      removeHistoryItem(item);
    });

    actions.appendChild(loadBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(info);
    row.appendChild(actions);
    els.historyList.appendChild(row);
  });
}

async function loadHistoryItem(item) {
  if (isLocalReport(item)) {
    const found = getLocalReport(item.report_no);
    if (!found) {
      setSaveStatus("本地记录不存在", "error");
      return;
    }
    renderResult(found);
    currentReportNo = found.report_no;
    setSaveStatus("已载入本地记录", "info");
    return;
  }

  const result = await getReport(item.report_no);
  if (result.ok && result.data) {
    renderResult(result.data);
    currentReportNo = result.data.report_no;
    setSaveStatus("已载入云端记录", "info");
  } else if (result.offline) {
    setSaveStatus("后端不可用，无法载入云端记录", "error");
  } else {
    setSaveStatus(result.message || "载入失败", "error");
  }
}

async function removeHistoryItem(item) {
  if (!window.confirm("确定删除这条审计记录？")) return;

  if (isLocalReport(item)) {
    deleteLocalReport(item.report_no);
    await refreshHistory();
    return;
  }

  const result = await deleteReport(item.report_no);
  if (result.ok) {
    setSaveStatus("云端记录已删除", "ok");
    await refreshHistory();
  } else {
    setSaveStatus(result.message || "删除失败", "error");
  }
}

/* ================================================================
 * 七、后端连接状态
 * ================================================================ */

function updateConnection() {
  if (!els.connection) return;

  if (backendOnline) {
    els.connection.className = "px-2 py-1 rounded bg-emerald-900/50 text-emerald-300 text-xs";
    els.connection.textContent = "后端在线";
  } else {
    els.connection.className = "px-2 py-1 rounded bg-yellow-900/50 text-yellow-300 text-xs";
    els.connection.textContent = "后端不可用 · 本地模式";
  }
}

async function checkBackend() {
  const result = await ping();
  backendOnline = result.ok;
  updateConnection();
  return backendOnline;
}

/* ================================================================
 * 八、事件绑定与启动
 * ================================================================ */

function bindEvents() {
  els.startBtn.addEventListener("click", function () {
    els.fileInput.click();
  });

  els.fileInput.addEventListener("change", function () {
    scanFiles(els.fileInput.files);
    els.fileInput.value = "";
  });

  if (els.dropZone) {
    els.dropZone.addEventListener("dragover", function (event) {
      event.preventDefault();
      els.dropZone.classList.add("border-cyan-500");
    });
    els.dropZone.addEventListener("dragleave", function () {
      els.dropZone.classList.remove("border-cyan-500");
    });
    els.dropZone.addEventListener("drop", function (event) {
      event.preventDefault();
      els.dropZone.classList.remove("border-cyan-500");
      scanFiles(event.dataTransfer.files);
    });
  }

  els.sampleBtn.addEventListener("click", scanSample);

  els.historyRefresh.addEventListener("click", async function () {
    await checkBackend();
    await refreshHistory();
  });

  els.loginBtn.addEventListener("click", function () {
    openAuthModal("login");
  });

  els.logoutBtn.addEventListener("click", function () {
    logout();
    refreshAuthUI();
    refreshHistory();
    setSaveStatus("已退出登录，后续结果只存本地", "info");
  });

  els.authSubmit.addEventListener("click", submitAuth);

  els.authSwitch.addEventListener("click", function () {
    authMode = authMode === "login" ? "register" : "login";
    applyAuthMode();
    show(els.authError, false);
  });

  els.authClose.addEventListener("click", closeAuthModal);

  els.authModal.addEventListener("click", function (event) {
    if (event.target === els.authModal) closeAuthModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeAuthModal();
  });

  els.authUsername.addEventListener("keydown", function (event) {
    if (event.key === "Enter") els.authPassword.focus();
  });

  els.authPassword.addEventListener("keydown", function (event) {
    if (event.key === "Enter") submitAuth();
  });
}

async function init() {
  bindEvents();
  applyAuthMode();
  refreshAuthUI();
  await checkBackend();
  await initAuth();
  await refreshHistory();
}

init();
