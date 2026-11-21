/**
 * js/api/local-reports.js —— 未登录 / 后端不可用时的本地报告存储
 *
 * 存在 localStorage（Storage 封装，sap_ 前缀），最多保留 20 条，
 * 避免扫描结果把浏览器存储撑满。
 */

import { getStorage } from "./client.js";

const KEY = "local_reports";
const MAX_REPORTS = 20;

function store() {
  return getStorage();
}

function read() {
  const s = store();
  if (!s) return [];
  const value = s.get(KEY, []);
  return Array.isArray(value) ? value : [];
}

function write(list) {
  const s = store();
  if (!s) return false;
  return s.set(KEY, list);
}

export function saveLocalReport(result) {
  const meta = result.scan_meta || {};
  const report = {
    report_no: "local_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    report_type: "file",
    file_name: meta.file_name || "",
    stat: result.stat || { high: 0, mid: 0, low: 0, total: 0 },
    vul_list: result.vul_list || [],
    scan_meta: meta,
    created_at: new Date().toISOString(),
    local: true,
  };

  const list = read();
  list.unshift(report);

  if (!write(list.slice(0, MAX_REPORTS))) {
    // 存不下时至少保住最新这一条
    write([report]);
  }
  return report;
}

export function listLocalReports() {
  return read();
}

export function getLocalReport(reportNo) {
  return read().find(function (item) {
    return item.report_no === reportNo;
  }) || null;
}

export function deleteLocalReport(reportNo) {
  write(read().filter(function (item) {
    return item.report_no !== reportNo;
  }));
}
